/**
 * Phase 10 — procedural road layout.
 *
 * Turns a `WorldPlan` into the exact `RoadNetworkConfig` the existing pure solver
 * (`road-network.ts`) consumes, so the solver, carve, ribbons, physics and minimap are
 * untouched. The layout is static (one solved graph around the origin, like the hand-placed
 * network today) and fully deterministic per seed; every launch gets a different one.
 *
 * Structure, per 4 km macro-cell of the plan:
 *  - the **arterial skeleton** runs on the global cell-boundary lattice (lines at
 *    (k + 0.5) * 4000 m): one line per cell row and column, so every region is ringed by
 *    arterials that continue into its neighbours by construction;
 *  - **urban cells** carry a block grid centred on their district (9×9 megacity, 6×6
 *    fringe), sized to read like Aohara at a larger scale; grid lines are designated
 *    arterials per cell so each block cluster has its own boulevards;
 *  - **small towns** carry a 3×3 mini-grid; **rural cells** a sparse two-road web;
 *    **mountain-pass** cells a single switchback-style pass road;
 *  - everything joins the skeleton: urban grids via corner/midpoint connectors, rural
 *    roads snapped to their nearest skeleton nodes, so the whole network is one
 *    connected component;
 *  - the **spawn edge** is a straight low-grade boulevard along +Z from the origin —
 *    every world starts on a boulevard in the megacity core, as today's Central Avenue does.
 *
 * Budget: ~500–900 edges for the default 5×5-cell window (the solver is ~linear in edge
 * count; the hand-placed world is 195). Keep new road sources proportional.
 */
import type { RoadClass, RoadEdgeConfig, RoadNetworkConfig, RoadNodeConfig } from '../config/roads';
import { AOHARA_JUNCTION_NODE_ID } from '../config/urban-district';
import { homeCityAnchor, homeCityRoadGraph } from './city-content';
import { plotSpotsForBlock, type BlockRect } from './urban-plots';
import { ALLEY_SETBACK_METERS, urbanBlockDetail } from './urban-block-detail';
import { REGION_CELL_METERS, type RegionPlan, type WorldPlan } from './world-plan';

/**
 * Cells on each side of home included in the static road window (3×3 by default).
 * The solver and ribbon build scale with edge count, so pass 1 ships the 12 km window;
 * widen after the device pass confirms the load budget.
 */
export const ROAD_WINDOW_CELLS = 1;

/** Arterial half-widths, metres — tuned to Aohara's proportions. */
const URBAN_ARTERIAL_HALF_WIDTH = 7;
/** Phase 10 pass 2: the slum-colony grid — tighter blocks than the fringe. */
const SLUM_SPACING = 240;
/** Phase 10 pass 2: the highway class — wide, flat, barrier-edged long connectors. */
const HIGHWAY_HALF_WIDTH = 8;
const HIGHWAY_SHOULDER = 3.5;
const HIGHWAY_MAX_GRADE = 0.05;
/** Share of the cell-boundary lines designated as highway lines (seeded per world). */
const HIGHWAY_LINE_FRACTION = 0.3;
const URBAN_LOCAL_HALF_WIDTH = 3.2;
const CITY_ACCESS_HALF_WIDTH = 4.5;
const TOUGE_HALF_WIDTH = 3.4;
/** Phase 10.1 variable routing: the narrow tail of the hierarchy. */
const RESIDENTIAL_HALF_WIDTH = 2.2;
const ALLEY_HALF_WIDTH = 1.6;
const DRIVEWAY_HALF_WIDTH = 1.5;

/** Grid geometry per archetype: nodes per side and street spacing, metres. */
const GRID_NODES: Readonly<Record<'megacity' | 'urban-fringe' | 'small-town', number>> = {
  megacity: 9,
  'urban-fringe': 6,
  'small-town': 3,
};
const GRID_SPACING: Readonly<Record<'megacity' | 'urban-fringe' | 'small-town', number>> = {
  megacity: 240,
  'urban-fringe': 320,
  'small-town': 220,
};

/** A simple integer hash for layout choices; pure in (a, b, seed). */
function pick(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/** Cell-boundary lattice: world coordinate of the line with index `k`. */
function lineCoord(k: number): number {
  return (k + 0.5) * REGION_CELL_METERS;
}

/** Nearest node on the skeleton grid to a world point. */
function nearestNode(nodes: readonly RoadNodeConfig[], x: number, z: number): RoadNodeConfig {
  let best = nodes[0]!;
  let bestDistance = Infinity;
  for (const node of nodes) {
    const dx = node.x - x;
    const dz = node.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestDistance) {
      bestDistance = d;
      best = node;
    }
  }
  return best;
}

export interface RoadLayout {
  readonly config: RoadNetworkConfig;
  /** Node id the spawn edge starts from, for diagnostics. */
  readonly spawnNodeId: string;
}

/**
 * Builds the procedural road layout for a plan, centred on the origin.
 * Pure in `(plan, windowCells)` — the same seed always yields the same network.
 */
export function buildRoadLayout(
  plan: WorldPlan,
  windowCells: number = ROAD_WINDOW_CELLS,
): RoadLayout {
  const W = windowCells;
  const nodes: RoadNodeConfig[] = [];
  const edges: RoadEdgeConfig[] = [];
  const nodeIndex = new Map<string, RoadNodeConfig>();

  const addNode = (id: string, x: number, z: number): RoadNodeConfig => {
    let node = nodeIndex.get(id);
    if (node === undefined) {
      node = { id, x, z };
      nodes.push(node);
      nodeIndex.set(id, node);
    }
    return node;
  };

  // ---------------------------------------------------------------------
  // 1. Arterial skeleton on the global cell-boundary lattice.
  // ---------------------------------------------------------------------
  const kMin = -W - 1;
  const kMax = W;
  const intersections = new Map<string, RoadNodeConfig>();

  const skeletonNodes: RoadNodeConfig[] = [];
  for (let k = kMin; k <= kMax; k += 1) {
    for (let m = kMin; m <= kMax; m += 1) {
      const node = addNode(`i${k}-${m}`, lineCoord(k), lineCoord(m));
      intersections.set(`${k},${m}`, node);
      skeletonNodes.push(node);
    }
  }

  const segmentClass = (x: number, z: number): RoadClass => {
    const archetype = plan.regionAt(x, z).archetype;
    if (archetype === 'megacity' || archetype === 'urban-fringe') return 'urban-arterial';
    if (archetype === 'small-town') return 'city-access';
    return 'rural';
  };
  // Phase 10 pass 2: the highway lines. A seeded subset of the arterial skeleton lines
  // becomes a dedicated highway wherever it runs through open country — the long straight
  // connectors between the region cores. The designation is pure in the line coordinate,
  // so every cell agrees on a shared line.
  const worldSeed = plan.seed;
  const isHighwayLine = (line: number, vertical: boolean): boolean =>
    pick(line, vertical ? 0x7a11 : 0x7a22, worldSeed) < HIGHWAY_LINE_FRACTION;
  // Phase 11.1: the mountain is a feature of the world, not something a trunk line
  // runs through. A chord that crosses the steep cone zone (the radius where the cone
  // rises ~50 m) is replaced by the same chord with an arc across the crossing: the
  // road doglegs around (or, for the mountain passes, up and over the contour of) the
  // cone. Without this, a line solved at foothill grade across the flank leaves the
  // road 260 m below the surface, its carve a slot cut through the volcano. The arc
  // points are spline control points — the graph keeps its lattice nodes.
  const detourChordPoints = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    cx: number,
    cz: number,
    excludeR: number,
    arcR: number,
  ): [number, number][] => {
    const abx = bx - ax;
    const abz = bz - az;
    const len = Math.hypot(abx, abz);
    if (len < 1)
      return [
        [ax, az],
        [bx, bz],
      ];
    const dirx = abx / len;
    const dirz = abz / len;
    const tC = (cx - ax) * dirx + (cz - az) * dirz;
    if (tC < 0 || tC > len)
      return [
        [ax, az],
        [bx, bz],
      ];
    const px = ax + dirx * tC;
    const pz = az + dirz * tC;
    const d = Math.hypot(cx - px, cz - pz);
    if (d >= excludeR)
      return [
        [ax, az],
        [bx, bz],
      ];
    const s2 = arcR * arcR - d * d;
    if (s2 <= 0)
      return [
        [ax, az],
        [bx, bz],
      ];
    const s = Math.sqrt(s2);
    const t1 = Math.max(0, tC - s);
    const t2 = Math.min(len, tC + s);
    if (t1 >= t2)
      return [
        [ax, az],
        [bx, bz],
      ];
    const ex = ax + dirx * t1;
    const ez = az + dirz * t1;
    const xx = ax + dirx * t2;
    const xz = az + dirz * t2;
    const fx = px - cx;
    const fz = pz - cz;
    const fLen = Math.hypot(fx, fz) || 1;
    const ang = (x: number, z: number): number => Math.atan2(z, x);
    const norm = (a: number): number => {
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      return a;
    };
    const phiE = ang(ex - cx, ez - cz);
    const phiX = ang(xx - cx, xz - cz);
    const phiP = ang(fx / fLen, fz / fLen);
    const d1 = norm(phiP - phiE);
    const d2 = norm(phiX - phiP);
    const sign = d1 >= 0 ? 1 : -1;
    const d2s = d2 !== 0 && Math.sign(d2) !== sign ? d2 + 2 * Math.PI * sign : d2;
    const total = d1 + d2s;
    const n = Math.max(2, Math.min(10, Math.round((Math.abs(total) * arcR) / 300)));
    const pts: [number, number][] = [];
    for (let i = 1; i < n; i += 1) {
      const phi = phiE + (i / n) * total;
      pts.push([cx + Math.cos(phi) * arcR, cz + Math.sin(phi) * arcR]);
    }
    return [[ax, az], ...pts, [bx, bz]];
  };

  const addSkeletonEdge = (
    from: RoadNodeConfig,
    to: RoadNodeConfig,
    x: number,
    z: number,
    highwayLine: boolean,
  ): void => {
    // A highway only runs where the ground is open: rural fields and small-town bypasses.
    // Through the cities the same line stays the urban arterial it always was.
    const archetype = plan.regionAt(x, z).archetype;
    if (highwayLine && (archetype === 'rural' || archetype === 'small-town')) {
      edges.push({
        from: from.id,
        to: to.id,
        roadClass: 'highway',
        halfWidthMeters: HIGHWAY_HALF_WIDTH,
        shoulderMeters: HIGHWAY_SHOULDER,
        maxGrade: HIGHWAY_MAX_GRADE,
      });
      return;
    }
    const cls = segmentClass(x, z);
    edges.push({
      from: from.id,
      to: to.id,
      ...(cls === 'rural'
        ? { roadClass: 'rural', maxGrade: 0.12 }
        : { roadClass: cls, halfWidthMeters: URBAN_ARTERIAL_HALF_WIDTH }),
    });
  };
  for (let k = kMin; k <= kMax; k += 1) {
    for (let m = kMin; m < kMax; m += 1) {
      const a = intersections.get(`${k},${m}`)!;
      const b = intersections.get(`${k},${m + 1}`)!;
      const zMid = lineCoord(m) + REGION_CELL_METERS / 2;
      addSkeletonEdge(a, b, lineCoord(k), zMid, isHighwayLine(k, true));
    }
  }
  for (let m = kMin; m <= kMax; m += 1) {
    for (let k = kMin; k < kMax; k += 1) {
      const a = intersections.get(`${k},${m}`)!;
      const b = intersections.get(`${k + 1},${m}`)!;
      const xMid = lineCoord(k) + REGION_CELL_METERS / 2;
      addSkeletonEdge(a, b, xMid, lineCoord(m), isHighwayLine(m, false));
    }
  }

  // ---------------------------------------------------------------------
  // 2. The home city: the hand-tuned Aohara kit translated to the generated anchor.
  // ---------------------------------------------------------------------
  const anchor = homeCityAnchor(plan);
  const kit = homeCityRoadGraph(anchor);
  for (const node of kit.nodes) {
    addNode(node.id, node.x, node.z);
  }
  for (const edge of kit.edges) {
    edges.push({ ...edge });
  }
  // The kit's outer gateway nodes join the arterial skeleton.
  for (const gatewayId of [
    'aohara-north-outer-west-outer',
    'aohara-north-outer-east-outer',
    'aohara-south-outer-west-outer',
    'aohara-south-outer-east-outer',
    'aohara-boulevard-west-outer',
  ]) {
    const from = nodeIndex.get(gatewayId);
    if (from === undefined) continue;
    const to = nearestNode(skeletonNodes, from.x, from.z);
    edges.push({
      from: from.id,
      to: to.id,
      roadClass: 'city-access',
      halfWidthMeters: CITY_ACCESS_HALF_WIDTH,
      maxGrade: 0.08,
    });
  }

  // ---------------------------------------------------------------------
  // 3. Per-region content, walking the window in a fixed (deterministic) order.
  // ---------------------------------------------------------------------
  for (let iz = -W; iz <= W; iz += 1) {
    for (let ix = -W; ix <= W; ix += 1) {
      if (ix === 0 && iz === 0) continue; // the home cell carries the Aohara kit above
      const region = plan.regionAtCell(ix, iz);
      addRegionRoads(region);
    }
  }

  function addRegionRoads(region: RegionPlan): void {
    const { ix, iz, seed: regionSeed, district, archetype } = region;
    if (archetype === 'megacity' || archetype === 'urban-fringe' || archetype === 'small-town') {
      // Phase 10 pass 2: the slum-colony variant of the fringe — tighter blocks,
      // backstreets everywhere, no boulevards.
      const isSlum = region.subArchetype === 'slum-colony';
      const n = GRID_NODES[archetype];
      const spacing = isSlum ? SLUM_SPACING : GRID_SPACING[archetype];
      const gridNodes: RoadNodeConfig[] = [];
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          gridNodes.push(
            addNode(
              `g${ix}-${iz}-${r}-${c}`,
              district.centerX + (c - (n - 1) / 2) * spacing,
              district.centerZ + (r - (n - 1) / 2) * spacing,
            ),
          );
        }
      }
      // ------------------------------------------------------------------
      // Phase 10.1 two-phase grid: first decide every block's detail (a tight
      // residential street, an alley, building plots with driveways), then build
      // the ring streets as chains that pass through a split node at each
      // connection point, so every narrow street is a real part of the road
      // graph the solver, the traffic and the parked cars all drive on.
      // ------------------------------------------------------------------
      interface BlockDetail {
        readonly sub?: { readonly axis: 0 | 1; readonly fraction: number };
        readonly alley?: { readonly axis: 0 | 1 };
        readonly spots: ReturnType<typeof plotSpotsForBlock>;
      }
      const blockDetails: BlockDetail[][] = [];
      for (let r = 0; r < n - 1; r += 1) {
        const row: BlockDetail[] = [];
        for (let c = 0; c < n - 1; c += 1) {
          const sw = gridNodes[r * n + c]!;
          const se = gridNodes[r * n + c + 1]!;
          const nw = gridNodes[(r + 1) * n + c]!;
          const rect: BlockRect = { minX: sw.x, maxX: se.x, minZ: sw.z, maxZ: nw.z };
          // The shared block-detail roll (urban-block-detail.ts): the massing city clears
          // its towers and infill against exactly these sub-divisions and alleys.
          const detail: BlockDetail = {
            ...urbanBlockDetail(regionSeed, ix, iz, r, c, isSlum),
            spots: plotSpotsForBlock(ix, iz, r, c, rect, regionSeed, URBAN_LOCAL_HALF_WIDTH),
          };
          row.push(detail);
        }
        blockDetails.push(row);
      }
      // Split points per ring segment: v{r}-{c} is the vertical segment (r,c)->(r+1,c)
      // (a z coordinate), h{r}-{c} the horizontal one (r,c)->(r,c+1) (an x coordinate).
      const vSplits = new Map<string, number[]>();
      const hSplits = new Map<string, number[]>();
      const addSplit = (map: Map<string, number[]>, key: string, coord: number): void => {
        const list = map.get(key) ?? [];
        list.push(coord);
        map.set(key, list);
      };
      for (let r = 0; r < n - 1; r += 1) {
        for (let c = 0; c < n - 1; c += 1) {
          const detail = blockDetails[r]![c]!;
          const z0 = gridNodes[r * n + c]!.z;
          const z1 = gridNodes[(r + 1) * n + c]!.z;
          const x0 = gridNodes[r * n + c]!.x;
          const x1 = gridNodes[r * n + c + 1]!.x;
          if (detail.sub !== undefined) {
            if (detail.sub.axis === 0) {
              const z = z0 + (z1 - z0) * detail.sub.fraction;
              addSplit(vSplits, `v${r}-${c}`, z);
              addSplit(vSplits, `v${r}-${c + 1}`, z);
            } else {
              const x = x0 + (x1 - x0) * detail.sub.fraction;
              addSplit(hSplits, `h${r}-${c}`, x);
              addSplit(hSplits, `h${r + 1}-${c}`, x);
            }
          }
          if (detail.alley !== undefined) {
            if (detail.alley.axis === 0) {
              const z = z0 + ALLEY_SETBACK_METERS;
              addSplit(vSplits, `v${r}-${c}`, z);
              addSplit(vSplits, `v${r}-${c + 1}`, z);
            } else {
              const x = x0 + ALLEY_SETBACK_METERS;
              addSplit(hSplits, `h${r}-${c}`, x);
              addSplit(hSplits, `h${r + 1}-${c}`, x);
            }
          }
          for (const p of detail.spots) {
            if (p.side === 0) addSplit(hSplits, `h${r}-${c}`, p.curbX);
            else if (p.side === 1) addSplit(vSplits, `v${r}-${c + 1}`, p.curbZ);
            else if (p.side === 2) addSplit(hSplits, `h${r + 1}-${c}`, p.curbX);
            else addSplit(vSplits, `v${r}-${c}`, p.curbZ);
          }
        }
      }
      // Tidy each segment's split points: sorted, clear of the grid nodes, spaced, capped.
      const capSplits = (raw: readonly number[], endA: number, endB: number): number[] => {
        const sorted = [...raw].sort((a, b) => a - b);
        const result: number[] = [];
        for (const coord of sorted) {
          if (Math.abs(coord - endA) < 25 || Math.abs(coord - endB) < 25) continue;
          if (result.length > 0 && Math.abs(coord - result[result.length - 1]!) < 8) continue;
          result.push(coord);
          if (result.length >= 3) break;
        }
        return result;
      };
      const isGridArterial = (line: number, axis: 0 | 1): boolean =>
        pick(line, axis === 0 ? 0x11 : 0x22, regionSeed) <
        (isSlum ? 0.05 : archetype === 'megacity' ? 0.3 : 0.2);
      const ringClass = (arterial: boolean): RoadClass =>
        archetype === 'small-town' ? 'urban-local' : arterial ? 'urban-arterial' : 'urban-local';
      const splitNodeKey = (segment: string, coord: number): string =>
        `${segment}|${coord.toFixed(2)}`;
      const splitNodes = new Map<string, RoadNodeConfig>();
      const buildRingChain = (
        segment: string,
        a: RoadNodeConfig,
        b: RoadNodeConfig,
        axis: 0 | 1,
        splits: readonly number[],
      ): void => {
        const arterial = isGridArterial(axis === 0 ? a.z : a.x, axis);
        const halfWidth = arterial ? URBAN_ARTERIAL_HALF_WIDTH : URBAN_LOCAL_HALF_WIDTH;
        let previous = a;
        let k = 0;
        for (const coord of capSplits(splits, axis === 0 ? a.x : a.z, axis === 0 ? b.x : b.z)) {
          const id = `sp${ix}-${iz}-${segment}-${k}`;
          k += 1;
          const mid = addNode(id, axis === 0 ? coord : a.x, axis === 0 ? a.z : coord);
          splitNodes.set(splitNodeKey(segment, coord), mid);
          edges.push({
            from: previous.id,
            to: mid.id,
            roadClass: ringClass(arterial),
            halfWidthMeters: halfWidth,
            maxGrade: 0.08,
          });
          previous = mid;
        }
        if (previous.id !== b.id) {
          edges.push({
            from: previous.id,
            to: b.id,
            roadClass: ringClass(arterial),
            halfWidthMeters: halfWidth,
            maxGrade: 0.08,
          });
        }
      };
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n - 1; c += 1) {
          buildRingChain(
            `h${r}-${c}`,
            gridNodes[r * n + c]!,
            gridNodes[r * n + c + 1]!,
            0,
            hSplits.get(`h${r}-${c}`) ?? [],
          );
        }
      }
      for (let r = 0; r < n - 1; r += 1) {
        for (let c = 0; c < n; c += 1) {
          buildRingChain(
            `v${r}-${c}`,
            gridNodes[r * n + c]!,
            gridNodes[(r + 1) * n + c]!,
            1,
            vSplits.get(`v${r}-${c}`) ?? [],
          );
        }
      }
      // The narrow connections between the split nodes.
      for (let r = 0; r < n - 1; r += 1) {
        for (let c = 0; c < n - 1; c += 1) {
          const detail = blockDetails[r]![c]!;
          const z0 = gridNodes[r * n + c]!.z;
          const z1 = gridNodes[(r + 1) * n + c]!.z;
          const x0 = gridNodes[r * n + c]!.x;
          const x1 = gridNodes[r * n + c + 1]!.x;
          if (detail.sub !== undefined) {
            const coord =
              detail.sub.axis === 0
                ? z0 + (z1 - z0) * detail.sub.fraction
                : x0 + (x1 - x0) * detail.sub.fraction;
            const a =
              detail.sub.axis === 0
                ? splitNodes.get(splitNodeKey(`v${r}-${c}`, coord))
                : splitNodes.get(splitNodeKey(`h${r}-${c}`, coord));
            const b =
              detail.sub.axis === 0
                ? splitNodes.get(splitNodeKey(`v${r}-${c + 1}`, coord))
                : splitNodes.get(splitNodeKey(`h${r + 1}-${c}`, coord));
            if (a !== undefined && b !== undefined && a.id !== b.id) {
              edges.push({
                from: a.id,
                to: b.id,
                roadClass: 'urban-local',
                halfWidthMeters: RESIDENTIAL_HALF_WIDTH,
                maxGrade: 0.06,
              });
            }
          }
          if (detail.alley !== undefined) {
            const coord =
              detail.alley.axis === 0 ? z0 + ALLEY_SETBACK_METERS : x0 + ALLEY_SETBACK_METERS;
            const a =
              detail.alley.axis === 0
                ? splitNodes.get(splitNodeKey(`v${r}-${c}`, coord))
                : splitNodes.get(splitNodeKey(`h${r}-${c}`, coord));
            const b =
              detail.alley.axis === 0
                ? splitNodes.get(splitNodeKey(`v${r}-${c + 1}`, coord))
                : splitNodes.get(splitNodeKey(`h${r + 1}-${c}`, coord));
            if (a !== undefined && b !== undefined && a.id !== b.id) {
              edges.push({
                from: a.id,
                to: b.id,
                roadClass: 'urban-alley',
                halfWidthMeters: ALLEY_HALF_WIDTH,
                maxGrade: 0.06,
              });
            }
          }
          // Driveways: from the split node at the pavement edge to the lot front (a dead
          // end in the graph, which the solver and the ribbon both handle).
          for (let spot = 0; spot < detail.spots.length; spot += 1) {
            const p = detail.spots[spot]!;
            const segment =
              p.side === 0
                ? `h${r}-${c}`
                : p.side === 1
                  ? `v${r}-${c + 1}`
                  : p.side === 2
                    ? `h${r + 1}-${c}`
                    : `v${r}-${c}`;
            const coord = p.side === 0 || p.side === 2 ? p.curbX : p.curbZ;
            const curb = splitNodes.get(splitNodeKey(segment, coord));
            if (curb === undefined) {
              continue; // the split was capped out of this segment
            }
            const front = addNode(`pf${ix}-${iz}-${r}-${c}-${spot}`, p.x, p.z);
            edges.push({
              from: curb.id,
              to: front.id,
              roadClass: 'urban-alley',
              halfWidthMeters: DRIVEWAY_HALF_WIDTH,
              maxGrade: 0.1,
            });
          }
        }
      }
      // Connect the grid to the skeleton: corners plus edge midpoints (towns: corners only).
      const anchorPoints =
        archetype === 'small-town'
          ? [
              [0, 0],
              [0, n - 1],
              [n - 1, 0],
              [n - 1, n - 1],
            ]
          : [
              [0, 0],
              [0, Math.floor((n - 1) / 2)],
              [0, n - 1],
              [Math.floor((n - 1) / 2), 0],
              [Math.floor((n - 1) / 2), n - 1],
              [n - 1, 0],
              [n - 1, Math.floor((n - 1) / 2)],
              [n - 1, n - 1],
            ];
      for (const anchor of anchorPoints) {
        const [r, c] = anchor;
        if (r === undefined || c === undefined) continue;
        const from = gridNodes[r * n + c]!;
        const to = nearestNode(skeletonNodes, from.x, from.z);
        if (from.id === to.id) continue;
        edges.push({
          from: from.id,
          to: to.id,
          roadClass: 'city-access',
          halfWidthMeters: CITY_ACCESS_HALF_WIDTH,
          maxGrade: 0.08,
        });
      }
    } else if (archetype === 'rural') {
      // Two meandering roads per rural cell, E-W and N-S, snapped to the skeleton.
      const cx = region.centerX;
      const cz = region.centerZ;
      const eastWest = [
        {
          from: nearestNode(
            skeletonNodes,
            lineCoord(ix - 1),
            cz + (pick(1, 7, regionSeed) - 0.5) * 2400,
          ),
          to: nearestNode(skeletonNodes, lineCoord(ix), cz + (pick(2, 8, regionSeed) - 0.5) * 2400),
          via: [
            cx + (pick(3, 9, regionSeed) - 0.5) * 800,
            cz + (pick(4, 10, regionSeed) - 0.5) * 800,
          ] as [number, number],
        },
        {
          from: nearestNode(
            skeletonNodes,
            cx + (pick(5, 11, regionSeed) - 0.5) * 2400,
            lineCoord(iz - 1),
          ),
          to: nearestNode(
            skeletonNodes,
            cx + (pick(6, 12, regionSeed) - 0.5) * 2400,
            lineCoord(iz),
          ),
          via: [
            cx + (pick(7, 13, regionSeed) - 0.5) * 800,
            cz + (pick(8, 14, regionSeed) - 0.5) * 800,
          ] as [number, number],
        },
      ];
      for (const line of eastWest) {
        if (line.from.id === line.to.id) continue;
        edges.push({
          from: line.from.id,
          to: line.to.id,
          roadClass: 'rural',
          maxGrade: 0.12,
          via: [line.via],
        });
      }
    } else {
      // Mountain pass: a true switchback, generalized from the Hinode touge (Phase 10
      // pass 2). The road enters on the lower contour, climbs the slope at each hairpin
      // and doubles back along the upper contour, so every world's passes read as real
      // mountain roads: two hairpins, three contour legs, a climb at each U.
      const off = 420 + pick(21, 22, regionSeed) * 320;
      const turnW = 420 + pick(23, 24, regionSeed) * 360;
      const zA = region.centerZ - off * 0.75 + (pick(25, 26, regionSeed) - 0.5) * 500;
      const zB = zA + off;
      const zC = zB + off;
      const ha = region.centerX - 250 + (pick(27, 28, regionSeed) - 0.5) * 500;
      const hb = ha - turnW;
      const from = nearestNode(skeletonNodes, lineCoord(ix - 1), zA);
      const to = nearestNode(skeletonNodes, lineCoord(ix), zC);
      if (from.id !== to.id) {
        edges.push({
          from: from.id,
          to: to.id,
          roadClass: 'touge',
          maxGrade: 0.15,
          halfWidthMeters: TOUGE_HALF_WIDTH,
          via: [
            [ha, zA],
            [ha, zB],
            [hb, zB],
            [hb, zC],
          ],
        });
      }
    }
  }

  // Phase 11.1: dogleg every road around the cone. Trunk lines (skeleton, rural
  // cell roads) cross outside the steep zone; the mountain-pass switchbacks climb
  // the contour of the cone itself (their exclusion radius is smaller, so the arc
  // rides the flank where the cone is ~90 m high — a pass, not a bypass).
  {
    const v = plan.volcano;
    if (v.radiusMeters > 0) {
      const nodeById = new Map(nodes.map((n) => [n.id, n]));
      for (let ei = 0; ei < edges.length; ei += 1) {
        const edge = edges[ei]!;
        if (edge.from.startsWith('aohara-') || edge.to.startsWith('aohara-')) continue;
        const a0 = nodeById.get(edge.from);
        const b0 = nodeById.get(edge.to);
        if (!a0 || !b0) continue;
        const excludeR = v.radiusMeters * (edge.roadClass === 'touge' ? 0.55 : 0.75);
        const arcR = v.radiusMeters * (edge.roadClass === 'touge' ? 0.65 : 0.885);
        const path: readonly (readonly [number, number])[] = [
          [a0.x, a0.z],
          ...(edge.via ?? []),
          [b0.x, b0.z],
        ];
        const newPath: [number, number][] = [];
        let changed = false;
        for (let i = 0; i < path.length - 1; i += 1) {
          const sub = detourChordPoints(
            path[i]![0],
            path[i]![1],
            path[i + 1]![0],
            path[i + 1]![1],
            v.x,
            v.z,
            excludeR,
            arcR,
          );
          if (sub.length > 2) changed = true;
          for (let j = i === 0 ? 0 : 1; j < sub.length; j += 1) {
            const p = sub[j]!;
            const last = newPath[newPath.length - 1];
            if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1) continue;
            newPath.push(p);
          }
        }
        if (changed) {
          edges[ei] = { ...edge, via: newPath.slice(1, -1) };
        }
      }
    }
  }

  return {
    config: {
      halfWidthMeters: 2.75,
      shoulderMeters: 2.2,
      blendWidthMeters: 30,
      sampleSpacingMeters: 8,
      maxGrade: 0.09,
      nodes,
      edges,
      // Phase 10 pass 3: the solver's seeded overpass picks are per-world (plan §5).
      seed: plan.seed,
      // Phase 10 pass 4: the garage planner keeps one garage in the home city.
      garageAnchor: { x: anchor.x, z: anchor.z },
    },
    // The kit's central intersection: every world starts on Central Avenue, which runs
    // straight through the levelled city plateau (see proceduralSpawn in city-content).
    spawnNodeId: AOHARA_JUNCTION_NODE_ID,
  };
}
