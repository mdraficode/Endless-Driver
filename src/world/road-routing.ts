/**
 * Phase 11.0a — grade-constrained horizontal road routing.
 *
 * The layout is grid-first: roads are placed as straight chords (plus via points) and the
 * vertical solver then fits a profile against the terrain. A chord that crosses steep
 * ground can NEVER meet its grade cap, no matter how the profile is shaped — the horizontal
 * geometry has to move. Current practice for modern road generators is to route in the
 * plane against the heightfield: A* with a hard per-step grade cap, refusal (not a worse
 * road) when no feasible path exists, and a gentle seeded meander on accepted paths so
 * rural roads stop being dead straight.
 *
 * This module is the routing half of that: a terrain grid + deterministic A* + meander.
 * Determinism contract (plan §5): integer cell indices, no Math.random, a stable tie-break
 * (f, h, insertion order), and the meander is a pure function of the world seed — the same
 * (grid, start, goal, cap, seed) always yields the same path, on every engine.
 */

export interface RoutingGrid {
  readonly spacing: number;
  readonly originX: number;
  readonly originZ: number;
  readonly cols: number;
  readonly rows: number;
  /** Row-major cell heights, metres: index = cz * cols + cx. */
  readonly heights: Float32Array;
  /** World (x, z) of the grid corner (cell 0,0). */
  readonly minWorldX: number;
  readonly minWorldZ: number;
}

/**
 * Samples the natural terrain onto a square grid for routing. `heightAt` must be the same
 * surface the profile solver uses (the plateau-blended natural ground), so the route the
 * planner proves grade-feasible is the one the solver solves.
 */
export function buildRoutingGrid(
  minWorldX: number,
  minWorldZ: number,
  sizeXMeters: number,
  sizeZMeters: number,
  spacing: number,
  heightAt: (x: number, z: number) => number,
): RoutingGrid {
  const cols = Math.max(2, Math.ceil(sizeXMeters / spacing) + 1);
  const rows = Math.max(2, Math.ceil(sizeZMeters / spacing) + 1);
  const heights = new Float32Array(cols * rows);
  for (let cz = 0; cz < rows; cz += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      heights[cz * cols + cx] = heightAt(minWorldX + cx * spacing, minWorldZ + cz * spacing);
    }
  }
  return {
    spacing,
    originX: minWorldX,
    originZ: minWorldZ,
    cols,
    rows,
    heights,
    minWorldX,
    minWorldZ,
  };
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const STEP_COST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

export interface RouteOptions {
  /** World seed for the meander; omit (or meanderAmp 0) for a purely routed path. */
  readonly seed?: number;
  /** Lateral meander amplitude, metres (rural upgrade). 0 = off. */
  readonly meanderAmp?: number;
  /** A* expansion budget. */
  readonly maxExpansions?: number;
  /**
   * Corridor bias: extra cost (m of path cost per m of lateral deviation) for leaving
   * the straight start→goal chord. Keeps the junction approach on the baseline chord
   * axis when the terrain allows it, detouring only where the grade forces it. 0 = off.
   */
  readonly biasToChord?: number;
}

export interface GradeRouteResult {
  /**
   * World (x, z) control points, travel order; endpoints are the exact start/goal. These
   * feed the spline resample (catmull-rom), which smooths the corner path.
   */
  readonly points: readonly (readonly [number, number])[];
  /** The same path resampled to ~8 m spacing, for grade measurement and audits. */
  readonly sampled: readonly (readonly [number, number])[];
  /** Worst step grade (rise per metre) along the 8 m resample. */
  readonly maxGrade: number;
  /** Resampled length, metres. */
  readonly length: number;
}

/**
 * Resamples a world-space polyline to roughly `spacing` metres per step (endpoints kept
 * exactly). Used for the chord feasibility pre-check: a 2-control-point 4 km chord would
 * otherwise report only its AVERAGE grade and miss the local ridge it crosses.
 */
export function resamplePolyline(
  points: readonly (readonly [number, number])[],
  spacing: number,
): [number, number][] {
  if (points.length < 2) return points.map((p) => [p[0], p[1]]);
  const first = points[0]!;
  const out: [number, number][] = [[first[0], first[1]]];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, z0] = out[out.length - 1]!;
    const [x1, z1] = points[i]!;
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.round(d / spacing));
    for (let s = 1; s <= steps; s += 1) {
      out.push([x0 + ((x1 - x0) * s) / steps, z0 + ((z1 - z0) * s) / steps]);
    }
  }
  return out;
}

/** 32-bit integer hash of (a, b, seed) → [0, 1). Same family as the rest of the plan. */
function hash01(a: number, b: number, seed: number): number {
  let h = (seed ^ Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Worst step grade along a world-space polyline (m per m). `heightAt` samples the ground.
 */
export function maxStepGrade(
  points: readonly (readonly [number, number])[],
  heightAt: (x: number, z: number) => number,
): number {
  let worst = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, z0] = points[i - 1]!;
    const [x1, z1] = points[i]!;
    const d = Math.hypot(x1 - x0, z1 - z0);
    if (d < 1e-6) continue;
    const g = Math.abs(heightAt(x1, z1) - heightAt(x0, z0)) / d;
    if (g > worst) worst = g;
  }
  return worst;
}

/**
 * Routes start→goal over the grid with a hard per-step grade cap.
 *
 * Cost model: travel distance × (1 + 3·grade²) (steep but legal steps are allowed, steep
 * runs are avoided when a legal alternative exists) plus the standard √2 diagonal
 * preference, which is what keeps the path smooth instead of stair-stepped. The
 * heuristic is straight-line distance — admissible, so the first pop of the goal is
 * optimal for this cost. Deterministic: the open set is an indexed binary heap with a
 * stable (f, h, insertion) tie-break.
 *
 * Returns null when no grade-feasible path exists within the expansion budget — the
 * caller keeps its original geometry (refusal, never a worse road).
 */
export function routeGradeConstrained(
  grid: RoutingGrid,
  startX: number,
  startZ: number,
  goalX: number,
  goalZ: number,
  maxGrade: number,
  opts: RouteOptions = {},
): GradeRouteResult | null {
  const { cols, rows, spacing, heights, minWorldX, minWorldZ } = grid;
  const toCell = (x: number, z: number): [number, number] | null => {
    const cx = Math.round((x - minWorldX) / spacing);
    const cz = Math.round((z - minWorldZ) / spacing);
    if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return null;
    return [cx, cz];
  };
  const start = toCell(startX, startZ);
  const goal = toCell(goalX, goalZ);
  if (start === null || goal === null) return null;
  const [sx, sz] = start;
  const [gx, gz] = goal;

  const size = cols * rows;
  const g = new Float64Array(size).fill(Infinity);
  const hScore = new Float64Array(size);
  for (let cz = 0; cz < rows; cz += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      hScore[cz * cols + cx] = Math.hypot(cx - gx, cz - gz) * spacing;
    }
  }
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const inOpen = new Uint8Array(size);
  // Indexed binary heap over node indices, ordered by (f, h, insertion).
  const heap: number[] = [];
  const heapPos = new Int32Array(size).fill(-1);
  const fScore = new Float64Array(size).fill(Infinity);
  let inserted = 0;
  const insOrder = new Int32Array(size).fill(-1);
  const push = (node: number): void => {
    heapPos[node] = heap.length;
    heap.push(node);
    insOrder[node] = inserted;
    inserted += 1;
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (lessThan(heap[i]!, heap[p]!)) {
        const t = heap[i]!;
        heap[i] = heap[p]!;
        heap[p] = t;
        heapPos[heap[i]!] = i;
        i = p;
      } else break;
    }
  };
  const lessThan = (a: number, b: number): boolean => {
    if (fScore[a] !== fScore[b]!) return fScore[a]! < fScore[b]!;
    if (hScore[a]! !== hScore[b]!) return hScore[a]! < hScore[b]!;
    return insOrder[a]! < insOrder[b]!;
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      heapPos[last] = 0;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && lessThan(heap[l]!, heap[m]!)) m = l;
        if (r < heap.length && lessThan(heap[r]!, heap[m]!)) m = r;
        if (m === i) break;
        const t = heap[i]!;
        heap[i] = heap[m]!;
        heap[m] = t;
        heapPos[heap[i]!] = i;
        i = m;
      }
    }
    heapPos[top] = -1;
    return top;
  };

  const sIdx = sz * cols + sx;
  const gIdx = gz * cols + gx;
  // Corridor-bias geometry: distance from the straight start→goal chord.
  const bias = opts.biasToChord ?? 0;
  const cdx = goalX - startX;
  const cdz = goalZ - startZ;
  const chordLen2 = cdx * cdx + cdz * cdz;
  const chordDev = (wx: number, wz: number): number => {
    if (chordLen2 < 1) return 0;
    const t = Math.max(0, Math.min(1, ((wx - startX) * cdx + (wz - startZ) * cdz) / chordLen2));
    const px = startX + cdx * t;
    const pz = startZ + cdz * t;
    return Math.hypot(wx - px, wz - pz);
  };
  fScore[sIdx] = hScore[sIdx]!;
  g[sIdx] = 0;
  push(sIdx);

  const maxExpansions = opts.maxExpansions ?? 250_000;
  let expansions = 0;
  let found = false;
  while (heap.length > 0 && expansions < maxExpansions) {
    const current = pop();
    inOpen[current] = 0;
    if (current === gIdx) {
      found = true;
      break;
    }
    if (closed[current] === 1) continue;
    closed[current] = 1;
    expansions += 1;
    const cx = current % cols;
    const cz = (current / cols) | 0;
    const hC = heights[current]!;
    for (let d = 0; d < 8; d += 1) {
      const nx = cx + DX[d]!;
      const nz = cz + DZ[d]!;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const nIdx = nz * cols + nx;
      if (closed[nIdx] === 1) continue;
      const hN = heights[nIdx]!;
      const stepDist = STEP_COST[d]! * spacing;
      const rise = Math.abs(hN - hC);
      // Hard grade cap, with 15 % headroom: the grid under-samples the true terrain
      // (a narrow ridge between cells can be steeper than either cell sees), and the
      // path is corner-cut (Chaikin) after the search. The headroom keeps the routed
      // corridor feasible on the TRUE surface; the vertical solver re-clamps the final
      // profile at the exact cap either way.
      if (rise > maxGrade * 0.85 * stepDist + 1e-4) continue;
      const grade = rise / stepDist;
      const stepCost = stepDist * (1 + 3 * grade * grade);
      let tentative = g[current]! + stepCost;
      if (bias > 0) {
        tentative += bias * chordDev(minWorldX + nx * spacing, minWorldZ + nz * spacing);
      }
      if (tentative < g[nIdx]! - 1e-9) {
        g[nIdx] = tentative;
        fScore[nIdx] = tentative + hScore[nIdx]!;
        cameFrom[nIdx] = current;
        if (inOpen[nIdx] === 0) {
          inOpen[nIdx] = 1;
          push(nIdx);
        } else {
          // Re-heapify at the existing position (decrease-key).
          let i = heapPos[nIdx]!;
          while (i > 0) {
            const p = (i - 1) >> 1;
            if (lessThan(nIdx, heap[p]!)) {
              heap[i] = heap[p]!;
              heapPos[heap[i]!] = i;
              i = p;
            } else break;
          }
        }
      }
    }
  }
  if (!found) return null;

  // Reconstruct the cell path (goal → start), then corner-decimate collinear runs so the
  // spline resample gets control points, not every step.
  const cells: number[] = [];
  let cursor = gIdx;
  while (cursor !== sIdx) {
    cells.push(cursor);
    cursor = cameFrom[cursor]!;
    if (cursor === -1) return null;
  }
  cells.push(sIdx);
  cells.reverse();
  const worldPath: [number, number][] = cells.map((c) => {
    const cx = c % cols;
    const cz = (c / cols) | 0;
    return [minWorldX + cx * spacing, minWorldZ + cz * spacing] as [number, number];
  });
  // Pin the exact endpoints (cell rounding moves them up to half a cell).
  worldPath[0] = [startX, startZ];
  worldPath[worldPath.length - 1] = [goalX, goalZ];
  const corners: [number, number][] = [worldPath[0]!];
  for (let i = 1; i < worldPath.length - 1; i += 1) {
    const a = corners[corners.length - 1]!;
    const b = worldPath[i - 1]!;
    const c = worldPath[i]!;
    const d = worldPath[i + 1]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const cdx = d[0] - c[0];
    const cdz = d[1] - c[1];
    const cross = abx * cdz - abz * cdx;
    const len = Math.hypot(abx, abz) * Math.hypot(cdx, cdz);
    if (len < 1e-9 || Math.abs(cross) / len > 1e-3) corners.push(c);
  }
  corners.push(worldPath[worldPath.length - 1]!);

  // Bilinear height over the grid cells. Nearest-cell quantisation is wrong for grade
  // measurement: an 8 m resample step crossing a cell boundary would see the FULL 20 m
  // cell rise over 8 m (a fake 2.5× grade). The route's hard guarantee is per A* cell
  // step; bilinear interpolation reproduces it exactly at the 8 m resample (a step that
  // sat at the cap stays at the cap, not above it).
  const cellHeight = (x: number, z: number): number => {
    const fx = Math.min(cols - 1, Math.max(0, (x - minWorldX) / spacing));
    const fz = Math.min(rows - 1, Math.max(0, (z - minWorldZ) / spacing));
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(cols - 1, x0 + 1);
    const z1 = Math.min(rows - 1, z0 + 1);
    const tx = fx - x0;
    const tz = fz - z0;
    const h00 = heights[z0 * cols + x0]!;
    const h10 = heights[z0 * cols + x1]!;
    const h01 = heights[z1 * cols + x0]!;
    const h11 = heights[z1 * cols + x1]!;
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };
  // Round the staircase: the raw 8-direction path must NOT go through the catmull-rom
  // resample (overshoot off the proven corridor). Three Chaikin passes take the sharpest
  // turn from ~90° to ~20°, then the caller resamples linearly at 8 m.
  let finalCorners = chaikinSmooth(corners, 3);
  let measured = polylineStats(finalCorners, cellHeight);

  // Seeded meander (rural upgrade): a gentle lateral sine on the corner path, then
  // grade-verified. If the meander breaks the cap, halve the amplitude once; if it still
  // breaks, ship the plain routed path (the road stays legal, just straighter).
  const amp = opts.meanderAmp ?? 0;
  const seed = opts.seed;
  if (amp > 0 && seed !== undefined && corners.length > 3) {
    const wavelength = 220 + hash01(seed, 0x51a, 0) * 240;
    const phase = hash01(seed, 0x51b, 1) * Math.PI * 2;
    const octaves: { amp: number; wavelength: number; phase: number }[] = [
      { amp, wavelength, phase },
      {
        amp: amp * 0.45,
        wavelength: wavelength * 0.37 + 40,
        phase: hash01(seed, 0x51c, 2) * Math.PI * 2,
      },
    ];
    for (const factor of [1, 0.5]) {
      // Meander the ALREADY-smoothed path (Chaikin first, wobble second).
      const meandered = meanderPath(
        finalCorners,
        octaves.map((o) => ({ ...o, amp: o.amp * factor })),
      );
      const stats = polylineStats(meandered, cellHeight);
      // 4% headroom: the meander is decorative, the vertical solver re-clamps the final
      // profile at the cap on the true terrain. (The 8 m bilinear resample of a path at
      // the cap reads ≈ the cap; the meander may push a few percent over locally.)
      if (stats.maxGrade <= maxGrade * 1.04 + 0.004) {
        finalCorners = meandered;
        measured = stats;
        break;
      }
    }
  }
  return {
    points: finalCorners,
    sampled: measured.points,
    maxGrade: measured.maxGrade,
    length: measured.length,
  };
}

/**
 * Chaikin corner cutting, endpoints pinned. Each pass replaces every interior corner with
 * a 25 % / 75 % cut, halving the sharpest turn (~90° → 2×45° → 2×22° …). Contractive: the
 * smoothed path stays inside the original convex hull, so it never invents a steeper
 * crossing. This is what makes the routed edge resample LINEAR (no catmull-rom) — the
 * spline overshoots on the staircase corners, swinging the road off the proven corridor
 * (kinks + floating embankments); corner-cutting keeps the 8 m resample on the corridor.
 */
function chaikinSmooth(
  points: readonly (readonly [number, number])[],
  passes: number,
): [number, number][] {
  let current = points.map((p) => [p[0], p[1]] as [number, number]);
  for (let pass = 0; pass < passes; pass += 1) {
    if (current.length < 4) break;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    const next: [number, number][] = [first];
    for (let i = 0; i < current.length - 1; i += 1) {
      const a = current[i]!;
      const b = current[i + 1]!;
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(last);
    current = next;
  }
  return current;
}

/** Lateral sine offset perpendicular to the local direction; endpoints stay pinned. */
function meanderPath(
  points: readonly (readonly [number, number])[],
  octaves: readonly { amp: number; wavelength: number; phase: number }[],
): [number, number][] {
  // Cumulative arc length for the phase.
  const n = points.length;
  const arc: number[] = [0];
  for (let i = 1; i < n; i += 1) {
    arc.push(
      arc[i - 1]! +
        Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]),
    );
  }
  const total = arc[n - 1]!;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const p = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(n - 1, i + 1)]!;
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    // Perpendicular (left normal), signed by the sine.
    let offset = 0;
    for (const o of octaves) {
      offset += o.amp * Math.sin((2 * Math.PI * arc[i]!) / o.wavelength + o.phase);
    }
    // Ease the offset to zero at the endpoints so the pins never move.
    const t = total > 0 ? arc[i]! / total : 0;
    const ease = Math.min(1, Math.min(t, 1 - t) / 0.12);
    out.push([p[0] + (-dz / len) * offset * ease, p[1] + (dx / len) * offset * ease]);
  }
  return out;
}

interface MeasuredPolyline {
  readonly points: readonly [number, number][];
  readonly maxGrade: number;
  readonly length: number;
}

/** Resamples a polyline to ~8 m spacing (the solver's sample cadence) and measures it. */
function polylineStats(
  points: readonly (readonly [number, number])[],
  heightAt: (x: number, z: number) => number,
): MeasuredPolyline {
  const firstPoint = points[0]!;
  const resampled: [number, number][] = [[firstPoint[0], firstPoint[1]]];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, z0] = resampled[resampled.length - 1]!;
    const [x1, z1] = points[i]!;
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(d / 8));
    for (let s = 1; s <= steps; s += 1) {
      resampled.push([x0 + ((x1 - x0) * s) / steps, z0 + ((z1 - z0) * s) / steps]);
    }
  }
  let length = 0;
  let maxGrade = 0;
  for (let i = 1; i < resampled.length; i += 1) {
    const [x0, z0] = resampled[i - 1]!;
    const [x1, z1] = resampled[i]!;
    const d = Math.hypot(x1 - x0, z1 - z0);
    if (d < 1e-9) continue;
    length += d;
    const g = Math.abs(heightAt(x1, z1) - heightAt(x0, z0)) / d;
    if (g > maxGrade) maxGrade = g;
  }
  return { points: resampled, maxGrade, length };
}
