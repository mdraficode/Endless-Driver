import type { RoadClass, RoadEdgeConfig, RoadNetworkConfig, RoadNodeConfig } from '../config/roads';
import { AOHARA_JUNCTION_NODE_ID } from '../config/urban-district';
import {
  buildRoutingGrid,
  chaikinSmooth,
  maxStepGrade,
  resamplePolyline,
  routeGradeConstrained,
  type RoutingGrid,
} from './road-routing';

/**
 * The road graph: splines over the terrain with smoothed, grade-limited profiles.
 *
 * Pure and deterministic (no three.js, no Rapier): the same config and base height
 * function always produce the same network, which is what makes "the road network is
 * connected and its junctions agree" unit-testable. Elevations are solved globally —
 * moving-average smoothing, then junction pinning (every edge incident to a node ends at
 * exactly the node's solved elevation), then grade clamping to each edge's `maxGrade` — because a
 * road that follows raw terrain point-for-point is a rollercoaster no car should drive.
 *
 * The carved terrain height comes from blending base terrain toward these profiles
 * (`world-terrain.ts`); the ribbon meshes (`RoadWorld.ts`) are drawn from the same
 * points. One profile, three consumers: looks, collision, and grip cannot diverge.
 */
export interface RoadPoint {
  readonly x: number;
  readonly z: number;
  /** Solved road elevation at this point, metres. */
  readonly y: number;
  /** Distance along the edge from its `from` node, metres. */
  readonly alongMeters: number;
}

export interface RoadEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly roadClass: RoadClass;
  /** Maximum longitudinal grade (rise/run) authored for this edge. */
  readonly maxGrade: number;
  readonly halfWidthMeters: number;
  readonly shoulderMeters: number;
  readonly points: readonly RoadPoint[];
  readonly lengthMeters: number;
}

export interface RoadNode {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Solved junction elevation: every incident edge ends exactly here. */
  readonly y: number;
}

export interface RoadSample {
  /** Distance from the centreline, metres. */
  readonly distance: number;
  /** Road elevation at the nearest centreline point, metres. */
  readonly elevation: number;
  readonly edgeId: string;
  readonly roadClass: RoadClass;
  readonly halfWidthMeters: number;
  readonly shoulderMeters: number;
  /** Phase 10 pass 2: the deck of a bridge span — the terrain holds the deck height. */
  readonly onBridge: boolean;
}

/**
 * A bridge span (Phase 10 pass 2): the solved profile holds a deck this many metres above
 * the natural ground over a continuous run of points — a deep dip the road crosses on a
 * deck instead of cutting a causeway through.
 */
export interface BridgeSpan {
  readonly edgeId: string;
  readonly roadClass: RoadClass;
  readonly halfWidthMeters: number;
  readonly shoulderMeters: number;
  /** Deck points in travel order, with the natural ground height under each. */
  readonly points: readonly (RoadPoint & { readonly baseY: number })[];
}

/**
 * A tunnel span (Phase 10 pass 3): the solved profile dips this many metres below the
 * natural ground over a continuous run — the road runs under the ridge. The carve makes
 * the profile the floor; RoadWorld caps the run with a ground sheet and frames the
 * surface crossings with portal arches.
 */
export interface TunnelSpan {
  readonly edgeId: string;
  readonly roadClass: RoadClass;
  readonly halfWidthMeters: number;
  readonly shoulderMeters: number;
  readonly blendWidthMeters: number;
  /**
   * Floor points in travel order, with the natural ground height above each, and the
   * natural ground resampled at the cap's lateral edges (the cap sheet must follow the
   * terrain across its width — a mountainside is not flat over 30 m).
   */
  readonly points: readonly (RoadPoint & {
    readonly baseY: number;
    /** Cap edge positions and the ground height there (re-sampled on the visible
     * terrain by the world sampler: at the cap edge the carve's blend may not be
     * fully faded, so the pre-carve natural would float the edge off the ground). */
    readonly leftX: number;
    readonly leftZ: number;
    readonly leftY: number;
    readonly rightX: number;
    readonly rightZ: number;
    readonly rightY: number;
  })[];
}

/**
 * A rectangular excavation carved into the shared heightfield (world-terrain): the garage
 * floors live at its bottom, so the terrain, the physics and the visuals all agree on
 * the pit by construction.
 */
export interface GaragePit {
  readonly x: number;
  readonly z: number;
  /** Footprint yaw: local +z is the entrance-ramp direction. */
  readonly yaw: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly rounding: number;
  /** The depth fades to zero this far outside the footprint edge. */
  readonly fade: number;
  /** Depth below the local natural ground (reaches the lowest floor). */
  readonly depth: number;
  /**
   * Absolute elevation of the flat pit bottom (the garage floor). The pit is carved
   * down to this plane so the bottom is level even where the natural ground undulates.
   */
  readonly floorY: number;
}

/**
 * An underground parking garage (Phase 10 pass 4): a single open floor of garage aisle
 * edges (class `garage`) sunk into a rectangular pit, reached from the street by a
 * max-grade ramp. The heightfield is single-valued, so the pit is carved down to one flat
 * floor and the car drives a serpentine of narrow one-way aisles on it; the roof slab,
 * rim walls, columns and the "P" portal are a visual sheet (see `garage-world.ts`).
 */
export interface GarageSpec {
  readonly id: string;
  /** Footprint centre, world metres. */
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly widthMeters: number;
  readonly depthMeters: number;
  /** The single open floor elevation. */
  readonly floorYs: readonly number[];
  /** Street elevation at the entrance node. */
  readonly entranceY: number;
  readonly entranceNodeId: string;
  /** Ramp direction (unit): the ramp runs from the entrance node along this vector. */
  readonly rampDirX: number;
  readonly rampDirZ: number;
  /** Aisle rows in local z (parking bays and visuals hang off them). */
  readonly aisleZs: readonly number[];
  readonly pit: GaragePit;
}

export interface RoadNetwork {
  readonly config: RoadNetworkConfig;
  readonly edges: readonly RoadEdge[];
  readonly nodes: readonly RoadNode[];
  readonly totalLengthMeters: number;
  /** Phase 10 pass 2: the bridge spans, with deck and base heights for the visuals. */
  readonly bridgeSpans: readonly BridgeSpan[];
  /**
   * Phase 10 pass 3: the overpass deck spans — an elevated street's deck and ramps over a
   * lower street (a few metres of clearance, not a ravine). Same barrier/piers rendering
   * as bridges, kept separate so the ravine contract on `bridgeSpans` stays exact.
   */
  readonly overpassSpans: readonly BridgeSpan[];
  /**
   * Phase 10 pass 3: the lifted street's edge ids. At an overpass junction the lifted
   * street crosses the junction on its deck, so its junction-side end sits
   * `OVERPASS_CLEARANCE` above the node — the one place a road end is not at node
   * elevation (the street below keeps it).
   */
  readonly overpassEdgeIds: ReadonlySet<string>;
  /** Phase 10 pass 3: the tunnel spans, with floor and ground heights for the cap. */
  readonly tunnelSpans: readonly TunnelSpan[];
  /** Phase 10 pass 4: the underground parking garages (pit + aisle roads). */
  readonly garages: readonly GarageSpec[];
  /**
   * Phase 11.0a: the edge ids re-routed in the plane by the grade-constrained A*
   * (generated worlds; empty for hand-authored networks and for full refusal).
   */
  readonly routedEdgeIds: readonly string[];
  /** Nearest centreline sample, or `null` when no segment is indexed near (x, z). */
  sample(x: number, z: number): RoadSample | null;
  /**
   * Phase 11.1: every candidate within influence range of (x, z) — the union carve needs
   * all ribbons that reach the point, not just the nearest centreline.
   */
  sampleAll(x: number, z: number): readonly RoadSample[];
  /** Node ids reachable in one edge (graph adjacency for connectivity checks). */
  neighboursOf(nodeId: string): readonly string[];
  nodeById(nodeId: string): RoadNode | null;
}

interface MutablePoint {
  x: number;
  z: number;
  y: number;
}

const INDEX_CELL_METERS = 32;

function catmullRom(
  p0: MutablePoint,
  p1: MutablePoint,
  p2: MutablePoint,
  p3: MutablePoint,
  t: number,
): { x: number; z: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  const axis = (a: number, b: number, c: number, d: number): number =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: axis(p0.x, p1.x, p2.x, p3.x), z: axis(p0.z, p1.z, p2.z, p3.z) };
}

/** Moving-average smoothing over an edge profile (endpoints untouched). */
function smoothProfile(points: MutablePoint[], radius: number, passes: number): void {
  for (let pass = 0; pass < passes; pass += 1) {
    const source = points.map((point) => point.y);
    for (let index = 1; index < points.length - 1; index += 1) {
      let sum = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sample = source[index + offset];
        if (sample !== undefined) {
          sum += sample;
          count += 1;
        }
      }
      const point = points[index];
      if (point) {
        point.y = sum / count;
      }
    }
  }
}

/** Clamps longitudinal grade by walking the profile both ways (endpoints untouched). */
/**
 * Phase 11.2 — the terrain-following profile pass.
 *
 * After the node pins and the grade clamp, the profile between junctions is a
 * grade-limited straight line: it stops consulting the ground between the pins. Where a
 * junction sits on a hilltop and the valley runs through the middle of the edge, the line
 * rides 100 m above the ground — the carve materialises that as a floating embankment (and
 * the bridge detector sees a "ravine" where there is only sky).
 *
 * This pass projects the profile onto the intersection of two convex sets: the fill/cut
 * band around the natural ground (the road hugs the terrain — real roads are cut into the
 * hillside with modest fill) and the pairwise grade constraints (the driveable profile).
 * Point-wise Gauss-Seidel over the two projections converges to the grade-feasible profile
 * closest to the ground. Where no grade-feasible path to the ground exists (a ridge the
 * available run cannot climb), the profile keeps the grade-limit line instead — those runs
 * are the rerouter's and the tunnel's job, not the band's.
 *
 * Tunnel floor points are exempt: the dip is a structure (capped, cleared), not a cut.
 * Endpoints are untouched (they are the junction pins).
 */
const TERRAIN_FOLLOW_FILL_METERS = 8;
const TERRAIN_FOLLOW_CUT_METERS = 12;
/** Sweeps of the band/grade splitting projection; the band pre-seed leaves only the
 * junction-adjacent blend to relax, and flat edges break out after a couple of sweeps. */
const TERRAIN_FOLLOW_SWEEPS = 1500;
/** A station pre-check farther outside the band than this is already terrain-following. */
const TERRAIN_FOLLOW_SKIP_TOLERANCE_METERS = 1.5;
/** Sparse stations for the pre-check (the band only needs metre-scale accuracy). */
const TERRAIN_FOLLOW_PRECHECK_SPACING_METERS = 25;

function terrainFollow(
  points: MutablePoint[],
  baseY: readonly number[],
  maxGrade: number,
  exempt: ReadonlyArray<readonly [start: number, end: number]>,
): void {
  const exemptAt = new Uint8Array(points.length);
  for (const range of exempt) {
    for (let i = range[0]; i <= range[1]; i += 1) {
      if (i < points.length) exemptAt[i] = 1;
    }
  }
  // Segment runs are fixed for the life of this pass (x/z never move).
  const run = new Float64Array(points.length);
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i]!;
    const q = points[i - 1]!;
    run[i] = Math.max(0.001, Math.hypot(p.x - q.x, p.z - q.z));
  }
  const projectPoint = (i: number, anchor: number, segmentRun: number): void => {
    const p = points[i]!;
    const hi = baseY[i]! + TERRAIN_FOLLOW_FILL_METERS;
    const lo = baseY[i]! - TERRAIN_FOLLOW_CUT_METERS;
    let y = p.y;
    if (y > hi) y = hi;
    else if (y < lo) y = lo;
    const allowed = segmentRun * maxGrade;
    const ay = points[anchor]!.y;
    y = Math.min(ay + allowed, Math.max(ay - allowed, y));
    p.y = y;
  };
  // Pre-seed: start from the band itself. The pairwise grade step (maxGrade per
  // sample) propagates like a wave at ~1 m per sample per sweep, so a profile that
  // begins 150 m off the ground (a trunk crossing a mountainside) would need hundreds
  // of sweeps to climb. Clamping every station into the band first makes the terrain
  // the starting point; the sweeps then only relax the small grade residuals where the
  // band meets the pinned junctions or exceeds the driveable grade.
  for (let i = 1; i < points.length - 1; i += 1) {
    if (exemptAt[i] === 1) continue;
    const p = points[i]!;
    const hi = baseY[i]! + TERRAIN_FOLLOW_FILL_METERS;
    const lo = baseY[i]! - TERRAIN_FOLLOW_CUT_METERS;
    if (p.y > hi) p.y = hi;
    else if (p.y < lo) p.y = lo;
  }
  for (let sweep = 0; sweep < TERRAIN_FOLLOW_SWEEPS; sweep += 1) {
    let worst = 0;
    for (let i = 1; i < points.length - 1; i += 1) {
      if (exemptAt[i] === 1) continue;
      const before = points[i]!.y;
      projectPoint(i, i - 1, run[i] ?? 0.001);
      const change = Math.abs(points[i]!.y - before);
      if (change > worst) worst = change;
    }
    for (let i = points.length - 2; i >= 1; i -= 1) {
      if (exemptAt[i] === 1) continue;
      const before = points[i]!.y;
      projectPoint(i, i + 1, run[i + 1] ?? 0.001);
      const change = Math.abs(points[i]!.y - before);
      if (change > worst) worst = change;
    }
    if (worst < 1e-3) break;
  }
  // Final exact-grade polish: the interleaved band/grade projection settles within a
  // hair of both constraints; one converged clampGrade pass removes the last residual
  // (the test contract is grade <= maxGrade*1.05, and we want margin, not luck).
  clampGrade(points, maxGrade);
}

/**
 * Phase 11.2 pre-check: does this edge's profile already sit inside the terrain band?
 * Samples every ~25 m along the edge — the full follow pass (one `baseHeightAt` per
 * point) is only paid for edges that actually deviate.
 */
function profileDeviatesFromBand(
  points: MutablePoint[],
  baseHeightAt: (x: number, z: number) => number,
  exempt: ReadonlyArray<readonly [start: number, end: number]>,
): boolean {
  const n = points.length;
  if (n < 3) return false;
  // Fixed 25 m spatial sampling: a station count that scales with edge length would
  // space 280 m apart on a 4 km trunk and could sail right over a 100 m ridge; a fixed
  // cadence catches every feature wider than ~25 m at a flat ~1 ms per world.
  let distance = 0;
  let nextSample = 0;
  for (let i = 1; i < n - 1; i += 1) {
    const p = points[i]!;
    const q = points[i - 1]!;
    distance += Math.hypot(p.x - q.x, p.z - q.z);
    if (distance < nextSample) continue;
    nextSample += TERRAIN_FOLLOW_PRECHECK_SPACING_METERS;
    let exempted = false;
    for (const range of exempt) {
      if (i >= range[0] && i <= range[1]) {
        exempted = true;
        break;
      }
    }
    if (exempted) continue;
    const base = baseHeightAt(p.x, p.z);
    if (p.y > base + TERRAIN_FOLLOW_FILL_METERS + TERRAIN_FOLLOW_SKIP_TOLERANCE_METERS) {
      return true;
    }
    if (p.y < base - TERRAIN_FOLLOW_CUT_METERS - TERRAIN_FOLLOW_SKIP_TOLERANCE_METERS) return true;
  }
  return false;
}

function clampGrade(points: MutablePoint[], maxGrade: number): void {
  // Gauss-Seidel projection onto the pairwise grade constraints, using each segment's
  // true run (spline steps are not uniformly spaced, so a fixed per-step delta would
  // silently allow steeper grades wherever the spline bunches up). Endpoints are
  // anchors — junction elevations are pinned outside and never moved here.
  for (let iteration = 0; iteration < 256; iteration += 1) {
    let worstChange = 0;
    const clampOne = (index: number, anchor: MutablePoint): void => {
      const point = points[index];
      if (!point) {
        return;
      }
      const run = Math.max(0.001, Math.hypot(point.x - anchor.x, point.z - anchor.z));
      const allowed = run * maxGrade;
      const clamped = Math.min(anchor.y + allowed, Math.max(anchor.y - allowed, point.y));
      worstChange = Math.max(worstChange, Math.abs(clamped - point.y));
      point.y = clamped;
    };
    for (let index = 1; index < points.length - 1; index += 1) {
      clampOne(index, points[index - 1] as MutablePoint);
    }
    for (let index = points.length - 2; index >= 1; index -= 1) {
      clampOne(index, points[index + 1] as MutablePoint);
    }
    if (worstChange < 1e-10) {
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 10 pass 3: tunnels and overpasses.
//
// A tunnel is a grade-feasible dip in the profile below the natural ground: the ridge
// the road would otherwise crest at an unclimbable grade. The existing carve already
// makes the profile the floor and the surrounding hillside the walls; RoadWorld caps
// the run with a ground sheet so the crossing reads as a tunnel with portals.
//
// An overpass lifts one through-street of a flat arterial crossing onto a deck above
// the other street: the profile simply holds the deck level past the junction and ramps
// back down at max grade, and the span renders through the bridge barrier/piers path.
// The lower street is untouched — its centreline keeps the junction elevation.
// ---------------------------------------------------------------------------

const TUNNEL_CANDIDATE_CLASSES: ReadonlySet<RoadClass> = new Set<RoadClass>([
  'urban-arterial',
  'highway',
  'city-access',
]);
/** The ridge must rise at least this far above the road's approach level to tunnel. */
const TUNNEL_MIN_RIDGE_METERS = 20;
/** A world tunnels at most its biggest ridges; smaller ones keep the cut. */
const TUNNEL_MAX_PER_WORLD = 8;
/** Ridge run: the stretch where natural ground holds this far above the approach. */
const TUNNEL_APPROACH_MARGIN_METERS = 5;
/** Shorter ridges are cut through, not tunneled. */
const TUNNEL_MIN_RUN_METERS = 60;
/** Floor depth below the approach level, bounded both ways (portals must stay open). */
const TUNNEL_MIN_DEPTH_METERS = 4;
const TUNNEL_MAX_DEPTH_METERS = 9;
/**
 * The floor stays at least this far below the natural ground anywhere in the run — a
 * semi-trailer is 4 m tall, so a thinner roof would clip it (the cap is visual, not
 * physical, but the world should not show a truck through the ceiling).
 */
const TUNNEL_MIN_ROOF_METERS = 4.5;
/** The cap (and its portal face) starts where the ceiling first clears this height. */
const TUNNEL_CLEARANCE_ROOF_METERS = 4.5;
/** Trimmed runs shorter than this are open cuts, not cap-worthy tunnels. */
const TUNNEL_MIN_CAPPED_RUN_METERS = 30;
/** Mainline edges shorter than this never tunnel. */
const TUNNEL_MIN_EDGE_METERS = 240;

const OVERPASS_CLEARANCE_METERS = 6;
/** Deck half-length past the junction: covers the lower street's full width plus margin. */
const OVERPASS_DECK_HALF_METERS = 16;
/** Grade-blend length where the ramp hands back to the solved profile. */
const OVERPASS_CROSSFADE_METERS = 16;
/** A seeded world lifts at most this many crossings; more stays grade-separated. */
const OVERPASS_MAX_PER_WORLD = 2;
/** Junctions with more natural-ground spread than this keep both streets at grade. */
const OVERPASS_MAX_FLAT_SPREAD_METERS = 5;
/** The lifted street's edges must be at least this long from the junction. */
const OVERPASS_MIN_EDGE_METERS = 140;
/** Deck-vs-far-junction rise budget must leave this much grade margin per lifted edge. */
const OVERPASS_GRADE_MARGIN_METERS = 12;

/** Deterministic 32-bit PRNG (mulberry32) — same seed, same overpass picks, every build. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function alongDistances(points: readonly { x: number; z: number }[]): number[] {
  const distances: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i] as { x: number; z: number };
    const previous = points[i - 1] as { x: number; z: number };
    distances.push(
      (distances[i - 1] ?? 0) + Math.hypot(point.x - previous.x, point.z - previous.z),
    );
  }
  return distances;
}

/**
 * A planned tunnel dip: a V at max grade around a level floor,
 * `floorY + maxGrade × |distance from ridge centre|`, applied where it is lower than the
 * smoothed profile (a convex envelope, so the result stays grade-feasible and the final
 * clampGrade pass keeps the junction pins exact).
 */
interface TunnelDipPlan {
  readonly floorY: number;
  /** Along-metres of the ridge centre (the V's vertex). */
  readonly center: number;
  /** Inclusive index range where the envelope is below the original profile. */
  readonly startIndex: number;
  readonly endIndex: number;
  /** The ridge's rise above the approach level — ranks which ridges tunnel. */
  readonly ridgeExcess: number;
}

/**
 * Work out the dip under the edge's highest ridge when one is grade-feasible from both
 * ends. Pure: inspects the profile, returns the plan, mutates nothing.
 */
function findTunnelDip(
  points: readonly MutablePoint[],
  baseY: readonly number[],
  maxGrade: number,
): TunnelDipPlan | null {
  const n = points.length;
  if (n < 24) return null;
  const along = alongDistances(points);
  const total = along[n - 1] ?? 0;
  if (total < TUNNEL_MIN_EDGE_METERS) return null;

  // The ridge: the edge's highest point, with the approach level read off the terrain
  // well to either side of it (distance-based, independent of sample spacing).
  let maxIndex = 0;
  for (let i = 1; i < n; i += 1) {
    if ((baseY[i] ?? 0) > (baseY[maxIndex] ?? 0)) maxIndex = i;
  }
  const center = along[maxIndex] ?? 0;
  const indexAt = (position: number): number => {
    let low = 0;
    let high = n - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if ((along[middle] ?? 0) <= position) low = middle;
      else high = middle;
    }
    return low;
  };
  const approachLevelAt = (startPosition: number, endPosition: number): number => {
    let level = Infinity;
    for (let i = indexAt(startPosition); i <= indexAt(endPosition); i += 1) {
      level = Math.min(level, baseY[i] ?? Infinity);
    }
    return Number.isFinite(level) ? level : (baseY[maxIndex] ?? 0);
  };
  const approachLevel = Math.min(
    approachLevelAt(center - 200, center - 40),
    approachLevelAt(center + 40, center + 200),
  );
  const ridgeTop = baseY[maxIndex] ?? 0;
  if (ridgeTop - approachLevel < TUNNEL_MIN_RIDGE_METERS) return null;

  // The ridge run: where the natural ground holds above approach + margin.
  const above = approachLevel + TUNNEL_APPROACH_MARGIN_METERS;
  let i0 = maxIndex;
  while (i0 > 0 && (baseY[i0 - 1] ?? 0) >= above) i0 -= 1;
  let i1 = maxIndex;
  while (i1 < n - 1 && (baseY[i1 + 1] ?? 0) >= above) i1 += 1;
  if (i0 <= 0 || i1 >= n - 1) return null; // the ridge touches a junction
  const runLength = (along[i1] ?? 0) - (along[i0] ?? 0);
  if (runLength < TUNNEL_MIN_RUN_METERS) return null;

  // Floor: below the approach, and at least MIN_ROOF under the lowest natural ground
  // in the run so the roof is solid everywhere.
  let runMin = Infinity;
  for (let i = i0; i <= i1; i += 1) {
    runMin = Math.min(runMin, baseY[i] ?? Infinity);
  }
  const depth = Math.min(
    TUNNEL_MAX_DEPTH_METERS,
    Math.max(TUNNEL_MIN_DEPTH_METERS, (ridgeTop - approachLevel) * 0.5),
  );
  const floorY = Math.min(approachLevel - depth, runMin - TUNNEL_MIN_ROOF_METERS);

  // Grade feasibility from both ends: the floor must be reachable from each endpoint's
  // natural level at max grade over the available distance. (The V's arms are exactly
  // max grade, and the arms meet the profile at the crossing point, so this is exact.)
  for (const end of [0, n - 1] as const) {
    const descent = (baseY[end] ?? 0) - floorY;
    if (descent > 0) {
      const available = Math.abs((along[end] ?? 0) - center);
      if (descent > maxGrade * available) return null;
    }
  }

  const envelope = (position: number): number => floorY + maxGrade * Math.abs(position - center);
  let loweredStart = -1;
  let loweredEnd = -1;
  for (let i = 0; i < n; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    if (envelope(along[i] ?? 0) < point.y) {
      if (loweredStart < 0) loweredStart = i;
      loweredEnd = i;
    }
  }
  if (loweredStart < 0 || loweredEnd < 0) return null;
  if ((along[loweredEnd] ?? 0) - (along[loweredStart] ?? 0) < TUNNEL_MIN_RUN_METERS) {
    // The envelope only grazes the profile: a shave, not a tunnel.
    return null;
  }
  return {
    floorY,
    center,
    startIndex: loweredStart,
    endIndex: loweredEnd,
    ridgeExcess: ridgeTop - approachLevel,
  };
}

/** Apply a planned dip to the profile (the only mutation site). */
function applyTunnelDip(points: MutablePoint[], plan: TunnelDipPlan, maxGrade: number): void {
  const along = alongDistances(points);
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i] as MutablePoint;
    const value = plan.floorY + maxGrade * Math.abs((along[i] ?? 0) - plan.center);
    if (value < point.y) point.y = value;
  }
  smoothProfile(points, 10, 3);
}

interface OverpassEnd {
  readonly edgeIndex: number;
  /** Which endpoint of the edge sits at the junction. */
  readonly atFrom: boolean;
}

interface OverpassCandidate {
  readonly nodeId: string;
  readonly nodeY: number;
  /** The lifted through-street: the two junction-side edge ends. */
  readonly lifted: readonly OverpassEnd[];
  /** Tie-break score: longer roomier junctions rank first. */
  readonly score: number;
}

/**
 * Pick the seeded few flat arterial crossings and lift their through-street onto a deck
 * over the other street (Phase 10 pass 3). Runs after the junction pins and the grade
 * clamp, mutates the lifted edges' profiles, and re-clamps them. Returns the lifted edge
 * ids so the caller can detect their deck runs as spans.
 */
function selectAndLiftOverpasses(
  config: RoadNetworkConfig,
  edges: {
    id: string;
    from: string;
    to: string;
    roadClass: RoadClass;
    maxGrade: number;
    halfWidthMeters: number;
    shoulderMeters: number;
    points: MutablePoint[];
  }[],
  nodeElevation: Map<string, number>,
  baseHeightAt: (x: number, z: number) => number,
): Set<string> {
  const liftedEdgeIds = new Set<string>();
  if (config.seed === undefined) return liftedEdgeIds;

  const classRank: Partial<Record<RoadClass, number>> = { highway: 2, 'urban-arterial': 1 };
  const candidates: OverpassCandidate[] = [];

  for (const node of config.nodes) {
    // Junction-side ends of every incident edge, with the direction away from the node.
    const ends: {
      end: OverpassEnd;
      dirX: number;
      dirZ: number;
      otherX: number;
      otherZ: number;
      length: number;
      maxGrade: number;
      rank: number;
      nearGrade: boolean;
    }[] = [];
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
      const edge = edges[edgeIndex];
      if (!edge) continue;
      const atFrom = edge.from === node.id;
      const atTo = edge.to === node.id;
      if (!atFrom && !atTo) continue;
      const points = edge.points;
      const near = points[atFrom ? 0 : points.length - 1];
      const far = points[atFrom ? points.length - 1 : 0];
      if (!near || !far) continue;
      const dx = far.x - near.x;
      const dz = far.z - near.z;
      const chord = Math.hypot(dx, dz);
      if (chord < 1) continue;
      let length = 0;
      for (let i = 1; i < points.length; i += 1) {
        const p = points[i];
        const q = points[i - 1];
        if (!p || !q) continue;
        length += Math.hypot(p.x - q.x, p.z - q.z);
      }
      const rank = classRank[edge.roadClass] ?? 0;
      // The street must sit at grade at the junction (it stays there; the deck goes over it).
      const nearBase = baseHeightAt(near.x, near.z);
      const nearGrade = Math.abs(near.y - nearBase) < 6;
      ends.push({
        end: { edgeIndex, atFrom },
        dirX: dx / chord,
        dirZ: dz / chord,
        otherX: far.x,
        otherZ: far.z,
        length,
        maxGrade: edge.maxGrade,
        rank,
        nearGrade,
      });
    }
    if (ends.length < 4) continue;

    // Group opposite ends into streets (a street is the through-road past the junction).
    const streets: { ends: typeof ends }[] = [];
    const used = new Set<number>();
    for (let i = 0; i < ends.length; i += 1) {
      if (used.has(i)) continue;
      const a = ends[i];
      if (!a) continue;
      let paired: number | null = null;
      for (let j = i + 1; j < ends.length; j += 1) {
        if (used.has(j)) continue;
        const b = ends[j];
        if (!b) continue;
        if (a.dirX * b.dirX + a.dirZ * b.dirZ < -0.94) {
          paired = j;
          break;
        }
      }
      used.add(i);
      if (paired !== null) used.add(paired);
      streets.push({ ends: paired === null ? [a] : [a, ends[paired] as (typeof ends)[number]] });
    }
    if (streets.length < 2) continue;

    // Every street must be a real through-road at grade.
    if (!streets.every((street) => street.ends.length === 2)) continue;
    if (!ends.every((end) => end.nearGrade)) continue;

    // The junction must be flat: the deck cannot ramp where the ground itself is steep.
    let flatMin = Infinity;
    let flatMax = -Infinity;
    const sampleFlat = (x: number, z: number): void => {
      const h = baseHeightAt(x, z);
      flatMin = Math.min(flatMin, h);
      flatMax = Math.max(flatMax, h);
    };
    sampleFlat(node.x, node.z);
    for (const end of ends) {
      sampleFlat(end.otherX, end.otherZ);
    }
    if (flatMax - flatMin > OVERPASS_MAX_FLAT_SPREAD_METERS) continue;

    // Choose the lifted street: the best-class, then longest, through-road.
    const ranked = [...streets].sort((a, b) => {
      const rankA = Math.max(...a.ends.map((end) => end.rank));
      const rankB = Math.max(...b.ends.map((end) => end.rank));
      if (rankB !== rankA) return rankB - rankA;
      const lenA = a.ends.reduce((sum, end) => sum + end.length, 0);
      const lenB = b.ends.reduce((sum, end) => sum + end.length, 0);
      return lenB - lenA;
    });
    const liftedStreet = ranked[0];
    if (!liftedStreet) continue;
    const liftedRank = Math.max(...liftedStreet.ends.map((end) => end.rank));
    if (liftedRank < 1) continue; // at least one lifted edge must be arterial or highway

    const nodeY = nodeElevation.get(node.id) ?? baseHeightAt(node.x, node.z);
    let feasible = true;
    let minLength = Infinity;
    for (const end of liftedStreet.ends) {
      minLength = Math.min(minLength, end.length);
      const rampLength = OVERPASS_CLEARANCE_METERS / end.maxGrade;
      if (end.length < rampLength + OVERPASS_DECK_HALF_METERS + OVERPASS_CROSSFADE_METERS + 20) {
        feasible = false;
        break;
      }
      // Deck vs the far junction: the lifted edge must fit the rise within its grade.
      const farNodeId = edges[end.end.edgeIndex]?.[end.end.atFrom ? 'to' : 'from'] ?? '';
      const farY = nodeElevation.get(farNodeId) ?? 0;
      if (
        nodeY + OVERPASS_CLEARANCE_METERS - farY >
        end.maxGrade * end.length - OVERPASS_GRADE_MARGIN_METERS
      ) {
        feasible = false;
        break;
      }
      if (liftedEdgeIds.has(edges[end.end.edgeIndex]?.id ?? '')) {
        feasible = false;
        break;
      }
    }
    if (!feasible || minLength < OVERPASS_MIN_EDGE_METERS) continue;

    candidates.push({
      nodeId: node.id,
      nodeY,
      lifted: liftedStreet.ends.map((end) => end.end),
      score: minLength,
    });
  }

  // Seeded pick: shuffle deterministically, rank by roominess, take the few best.
  if (candidates.length === 0) return liftedEdgeIds;
  const shuffle = mulberry32((config.seed ?? 0) ^ 0x0f06e551);
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(shuffle() * (i + 1));
    const a = candidates[i];
    const b = candidates[j];
    if (a && b) {
      candidates[i] = b;
      candidates[j] = a;
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates.slice(0, OVERPASS_MAX_PER_WORLD)) {
    const deckLevel = candidate.nodeY + OVERPASS_CLEARANCE_METERS;
    for (const end of candidate.lifted) {
      const edge = edges[end.edgeIndex];
      if (!edge) continue;
      const points = edge.points;
      const along = alongDistances(points);
      const distanceFromNode = (i: number): number => {
        const d = along[i] ?? 0;
        return end.atFrom ? d : (along[points.length - 1] ?? 0) - d;
      };
      const rampLength = OVERPASS_CLEARANCE_METERS / edge.maxGrade;
      for (let i = 0; i < points.length; i += 1) {
        const point = points[i] as MutablePoint;
        const d = distanceFromNode(i);
        if (d <= OVERPASS_DECK_HALF_METERS) {
          point.y = deckLevel;
        } else if (d <= OVERPASS_DECK_HALF_METERS + rampLength) {
          point.y = deckLevel - edge.maxGrade * (d - OVERPASS_DECK_HALF_METERS);
        } else if (d <= OVERPASS_DECK_HALF_METERS + rampLength + OVERPASS_CROSSFADE_METERS) {
          const blend = (d - OVERPASS_DECK_HALF_METERS - rampLength) / OVERPASS_CROSSFADE_METERS;
          const rampEnd = deckLevel - edge.maxGrade * rampLength; // = the junction level
          point.y = rampEnd + (point.y - rampEnd) * blend;
        }
      }
      // Re-clamp: the junction-side end is now the deck, the far end keeps its pin.
      clampGrade(points, edge.maxGrade);
      liftedEdgeIds.add(edge.id);
    }
  }
  return liftedEdgeIds;
}

// ---------------------------------------------------------------------------
// Phase 10 pass 4: underground parking garages.
//
// A garage is a single open floor (class `garage` aisle edges) sunk into a
// rectangular pit, reached from the street by a max-grade ramp. The heightfield is
// single-valued, so only ONE level of deck can exist per (x, z): the pit is carved
// down to a flat floor and the car drives a serpentine of aisles ON that floor.
// (A raised second level is impossible — every road edge blends over the 30 m
// `blendWidthMeters`, so an upper deck would lift the whole pit with it.) The roof
// slab, rim walls, columns and the "P" portal are a visual sheet (see
// `garage-world.ts`); the pit is carved into the shared heightfield so terrain,
// physics and visuals agree by construction.
// ---------------------------------------------------------------------------

const GARAGE_MAX_PER_WORLD = 3;
/** Floor drop below the entrance street, in metres (the ramp climbs it). */
const GARAGE_LEVEL_DROP_METERS = 5;
/** Footprint half extents, local metres (68 × 88 m slab). */
const GARAGE_HALF_WIDTH_METERS = 34;
const GARAGE_HALF_DEPTH_METERS = 44;
/** Aisles stop this far short of the footprint edge. */
const GARAGE_MARGIN_METERS = 5;
/** Level floor at the entrance ramp before it starts descending. */
const GARAGE_RAMP_APRON_METERS = 12;
/** The street edge a garage may attach to must be at least this long. */
const GARAGE_MIN_STREET_EDGE_METERS = 120;
/** Home-city candidates: near the anchor, but clear of the spawn pad. */
const GARAGE_HOME_RADIUS_METERS = 900;
const GARAGE_MIN_HOME_DIST_METERS = 180;
/** Junctions with more natural-ground spread than this keep both streets at grade. */
const GARAGE_MAX_FLAT_SPREAD_METERS = 5;
const GARAGE_PIT_ROUNDING_METERS = 10;
const GARAGE_PIT_FADE_METERS = 8;
/**
 * Aisle edges are narrow one-way driving lanes (3.6 m): the parking bays between the
 * rows hold the cars, and a wide aisle would leave no room for nose-in parking.
 */
const GARAGE_AISLE_HALF_WIDTH_METERS = 1.8;
const GARAGE_AISLE_SHOULDER_METERS = 0.4;
/** The entrance ramp is a proper driveway, wider than the interior aisles. */
const GARAGE_RAMP_HALF_WIDTH_METERS = 2.6;
const GARAGE_RAMP_SHOULDER_METERS = 0.8;

interface PlanGaragesResult {
  garages: GarageSpec[];
  addedEdges: {
    id: string;
    from: string;
    to: string;
    roadClass: RoadClass;
    maxGrade: number;
    halfWidthMeters: number;
    shoulderMeters: number;
    points: MutablePoint[];
  }[];
  addedNodes: { id: string; x: number; z: number; y: number }[];
}

interface GaragePlacement {
  readonly nodeId: string;
  readonly nodeX: number;
  readonly nodeZ: number;
  readonly nodeY: number;
  readonly rampDirX: number;
  readonly rampDirZ: number;
  readonly maxGrade: number;
  readonly isHome: boolean;
  readonly score: number;
  /** Phase 11.1b: the driveway frontage (first ramp-side street), severed at the
   *  flat apron so it is not sunken by the ramp's authority zone. */
  readonly frontageEdgeId: string | null;
  /** Which flatness pass admitted the candidate (0 = strict). Strict ranks first. */
  readonly flatPass: number;
}

/**
 * Pick the world's garages (one in the home city, a seeded two in the generated
 * cities) and plan their aisle roads. Pure with respect to the terrain: returns the
 * placements plus the explicit edges/nodes to append; the caller appends them.
 */
function planGarages(
  config: RoadNetworkConfig,
  edges: {
    id: string;
    from: string;
    to: string;
    roadClass: RoadClass;
    maxGrade: number;
    halfWidthMeters: number;
    shoulderMeters: number;
    points: MutablePoint[];
  }[],
  nodeElevation: Map<string, number>,
  baseHeightAt: (x: number, z: number) => number,
): PlanGaragesResult {
  const empty: PlanGaragesResult = {
    garages: [],
    addedEdges: [],
    addedNodes: [],
  };
  if (config.seed === undefined || config.garageAnchor === undefined) return empty;

  const nodeConfig = new Map(config.nodes.map((node) => [node.id, node]));
  const anchor = config.garageAnchor;
  const candidates: GaragePlacement[] = [];
  const seen = new Set<string>();
  const scanOnce = (threshold: number, pass: number): GaragePlacement[] => {
    const found: GaragePlacement[] = [];
    for (const node of config.nodes) {
      if (seen.has(node.id)) continue; // relaxed passes only add new candidates
      if (node.id === AOHARA_JUNCTION_NODE_ID) continue; // the spawn junction stays clean
      // The longest arterial edge at the node is the street the ramp leaves from.
      let bestLength = 0;
      let bestOther: { x: number; z: number; id: string } | null = null;
      let bestGrade = config.maxGrade;
      for (const edge of edges) {
        const atFrom = edge.from === node.id;
        const atTo = edge.to === node.id;
        if (!atFrom && !atTo) continue;
        if (edge.roadClass !== 'urban-arterial') continue;
        let length = 0;
        for (let i = 1; i < edge.points.length; i += 1) {
          const p = edge.points[i];
          const q = edge.points[i - 1];
          if (!p || !q) continue;
          length += Math.hypot(p.x - q.x, p.z - q.z);
        }
        if (length < GARAGE_MIN_STREET_EDGE_METERS || length <= bestLength) continue;
        const otherNode = nodeConfig.get(atFrom ? edge.to : edge.from);
        if (!otherNode) continue;
        bestLength = length;
        bestOther = { x: otherNode.x, z: otherNode.z, id: otherNode.id };
        bestGrade = edge.maxGrade;
      }
      if (bestOther === null) continue;

      const nodeY = nodeElevation.get(node.id) ?? baseHeightAt(node.x, node.z);
      // The ramp leaves the node at right angles to the street; the descending side wins.
      const axisX = bestOther.x - node.x;
      const axisZ = bestOther.z - node.z;
      const axis = Math.hypot(axisX, axisZ);
      if (axis < 1) continue;
      const perpX = -axisZ / axis;
      const perpZ = axisX / axis;
      const probe = [
        baseHeightAt(node.x, node.z),
        baseHeightAt(node.x + perpX * 60, node.z + perpZ * 60),
        baseHeightAt(node.x - perpX * 60, node.z - perpZ * 60),
      ];
      const spread = Math.max(...probe) - Math.min(...probe);
      if (spread > threshold) continue;
      const downSign =
        baseHeightAt(node.x + perpX * 60, node.z + perpZ * 60) <=
        baseHeightAt(node.x - perpX * 60, node.z - perpZ * 60)
          ? 1
          : -1;

      // Pit-area flatness: the pit extends ~48–136 m from the node, beyond the probes
      // above — the floors are derived from the node elevation, so the whole pit
      // rectangle must be level too.
      const rampRun = GARAGE_LEVEL_DROP_METERS / bestGrade;
      const entryAlong = GARAGE_RAMP_APRON_METERS + rampRun;
      const dirX = perpX * downSign;
      const dirZ = perpZ * downSign;
      const sideX = -dirZ;
      const sideZ = dirX;
      const entryPX = node.x + dirX * entryAlong;
      const entryPZ = node.z + dirZ * entryAlong;
      const pitEntryLocalZ = -GARAGE_HALF_DEPTH_METERS + 20;
      const pitCX = entryPX + dirX * -pitEntryLocalZ;
      const pitCZ = entryPZ + dirZ * -pitEntryLocalZ;
      const pitProbe = [
        [0, 0],
        [GARAGE_HALF_WIDTH_METERS, GARAGE_HALF_DEPTH_METERS],
        [-GARAGE_HALF_WIDTH_METERS, GARAGE_HALF_DEPTH_METERS],
        [GARAGE_HALF_WIDTH_METERS, -GARAGE_HALF_DEPTH_METERS],
        [-GARAGE_HALF_WIDTH_METERS, -GARAGE_HALF_DEPTH_METERS],
      ]
        .map(([lx, lz]) =>
          baseHeightAt(
            pitCX + sideX * (lx ?? 0) + dirX * (lz ?? 0),
            pitCZ + sideZ * (lx ?? 0) + dirZ * (lz ?? 0),
          ),
        )
        .concat([baseHeightAt(node.x + perpX * 82, node.z + perpZ * 82)]);
      const pitSpread = Math.max(...pitProbe) - Math.min(...pitProbe);
      if (pitSpread > threshold) continue;

      // Phase 11.1b: the ramp-corridor audit.
      //  - a street crossing the ramp at an angle > 18 m ahead fights it for the
      //    corridor -> the candidate is rejected;
      //  - the first ramp-side street is the driveway frontage (it reads as the garage
      //    entrance and is exempt);
      //  - a second ramp-side street running alongside past the flat apron (18 m ahead,
      //    6 m corridor): local/alley streets are allowed — the pit split below severs
      //    those that cross the pit box, and the remaining apron-approach span reads as
      //    the driveway. A busier street (arterial, city access, highway) alongside the
      //    descending ramp would have its surface sunken by the ramp's authority zone
      //    (a floating ribbon) with no valid trim -> the candidate is rejected. The
      //    original code exempted every ramp-side street behind the frontage branch
      //    (isHome allowed any class), so such streets were never tested.
      let frontageEdge: { id: string } | null = null;
      {
        let reject = false;
        for (const edge of edges) {
          const atFrom = edge.from === node.id;
          const atTo = edge.to === node.id;
          if (!atFrom && !atTo) continue;
          if (edge.from === node.id && edge.to === bestOther.id) continue;
          if (edge.to === node.id && edge.from === bestOther.id) continue;
          const pts = edge.points;
          if (pts.length < 2) continue;
          const nearP = atFrom ? pts[0]! : pts[pts.length - 1]!;
          const farP = atFrom ? pts[pts.length - 1]! : pts[0]!;
          const elen = Math.hypot(farP.x - nearP.x, farP.z - nearP.z);
          if (elen < 1) continue;
          const eDirX = (farP.x - nearP.x) / elen;
          const eDirZ = (farP.z - nearP.z) / elen;
          const localStreet = edge.roadClass === 'urban-local' || edge.roadClass === 'urban-alley';
          // eDir runs from the node toward the street's far end (farP - nearP for
          // both atFrom and atTo edges) - i.e. the direction the street body
          // extends FROM the node. Only streets whose body heads away from the
          // node along the ramp are ramp-side: a street arriving from behind
          // (dot < -0.5) has all of its length behind the node, where the node
          // elevation stays the authority, so it can never sink ahead of the
          // ramp and must not be mistaken for the driveway frontage.
          const alongRamp = eDirX * dirX + eDirZ * dirZ > 0.5;
          const segLen = entryAlong;
          let inCorridor = false;
          for (let i = 0; i < pts.length; i += 1) {
            const q = pts[i]!;
            const t = Math.max(
              0,
              Math.min(1, ((q.x - node.x) * dirX + (q.z - node.z) * dirZ) / segLen),
            );
            const along = t * segLen;
            if (along <= 18) continue; // the flat apron may merge with streets
            const px = node.x + dirX * along;
            const pz = node.z + dirZ * along;
            if (Math.hypot(q.x - px, q.z - pz) < 6) {
              inCorridor = true;
              break;
            }
          }
          if (!alongRamp) {
            if (inCorridor) {
              reject = true;
              break;
            }
            continue;
          }
          // A ramp-side street.
          if (frontageEdge === null) {
            // The actual driveway: the frontage branch is taken only here.
            frontageEdge = { id: edge.id };
          } else if (!localStreet) {
            reject = true;
            break;
          }
        }
        if (reject) continue;
      }

      // Phase 11.1b: the pit box (pit rectangle plus a 10 m rim margin) must be
      // clear. A junction node inside it would need a road into the slab, and a
      // busy street (anything but local/alley) through it would be severed into a
      // dangling stub the trim rules cannot place.
      {
        let nodeInBox = false;
        for (const other of config.nodes) {
          if (other.id === node.id) continue;
          const lx = (other.x - pitCX) * sideX + (other.z - pitCZ) * sideZ;
          const lz = (other.x - pitCX) * dirX + (other.z - pitCZ) * dirZ;
          if (
            Math.abs(lx) < GARAGE_HALF_WIDTH_METERS + 16 &&
            Math.abs(lz) < GARAGE_HALF_DEPTH_METERS + 16
          ) {
            nodeInBox = true;
            break;
          }
        }
        if (nodeInBox) continue;
        let busyCrosses = false;
        outer2: for (const edge of edges) {
          if (edge.roadClass === 'urban-local' || edge.roadClass === 'urban-alley') continue;
          for (const q of edge.points) {
            const lx = (q.x - pitCX) * sideX + (q.z - pitCZ) * sideZ;
            const lz = (q.x - pitCX) * dirX + (q.z - pitCZ) * dirZ;
            if (
              Math.abs(lx) < GARAGE_HALF_WIDTH_METERS + 10 &&
              Math.abs(lz) < GARAGE_HALF_DEPTH_METERS + 10
            ) {
              busyCrosses = true;
              break outer2;
            }
          }
        }
        if (busyCrosses) continue;
      }

      const distHome = Math.hypot(node.x - anchor.x, node.z - anchor.z);
      const isHome = distHome < GARAGE_HOME_RADIUS_METERS;
      if (isHome && distHome < GARAGE_MIN_HOME_DIST_METERS) continue;

      seen.add(node.id);
      found.push({
        nodeId: node.id,
        nodeX: node.x,
        nodeZ: node.z,
        nodeY,
        rampDirX: perpX * downSign,
        rampDirZ: perpZ * downSign,
        maxGrade: bestGrade,
        isHome,
        score: bestLength,
        frontageEdgeId: frontageEdge === null ? null : frontageEdge.id,
        flatPass: pass,
      });
    }
    return found;
  };

  // Steep worlds: the strict flatness pass can leave a world with no garage at
  // all. Relaxed passes widen the allowed pit-zone spread (the floor stays level;
  // the rim blend absorbs the difference), but only while fewer than two
  // candidates exist. Strict-pass candidates rank first, so a world with a good
  // site is never degraded by a relaxed one.
  const flatThresholds = [GARAGE_MAX_FLAT_SPREAD_METERS, 8, 10];
  for (let pass = 0; pass < flatThresholds.length; pass += 1) {
    const thr = flatThresholds[pass]!;
    for (const cand of scanOnce(thr, pass)) candidates.push(cand);
    if (candidates.length >= 2) break;
  }

  if (candidates.length === 0) return empty;

  // Seeded pick, then rank by roominess: at most one home-city garage, then a seeded two
  // in the generated cities, far enough apart to be distinct landmarks.
  const shuffled = [...candidates];
  const shuffle = mulberry32((config.seed ?? 0) ^ 0x6a740e46);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(shuffle() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a && b) {
      shuffled[i] = b;
      shuffled[j] = a;
    }
  }
  shuffled.sort((a, b) => a.flatPass - b.flatPass || b.score - a.score);
  const chosen: GaragePlacement[] = [];
  const home = shuffled.find((candidate) => candidate.isHome);
  if (home) chosen.push(home);
  for (const candidate of shuffled) {
    if (chosen.length >= GARAGE_MAX_PER_WORLD) break;
    if (candidate.isHome) continue;
    if (
      chosen.some(
        (c) => !c.isHome && Math.hypot(c.nodeX - candidate.nodeX, c.nodeZ - candidate.nodeZ) < 3000,
      )
    ) {
      continue;
    }
    chosen.push(candidate);
  }

  const garages: GarageSpec[] = [];
  const addedEdges: PlanGaragesResult['addedEdges'] = [];
  const addedNodes: PlanGaragesResult['addedNodes'] = [];

  for (let g = 0; g < chosen.length; g += 1) {
    const c = chosen[g]!;
    const grade = c.maxGrade;
    const levelDrop = GARAGE_LEVEL_DROP_METERS;
    // The single open floor, one level below the entrance street.
    const floorY = c.nodeY - levelDrop;
    const rampRun = levelDrop / grade; // descent length at max grade
    const dx = c.rampDirX;
    const dz = c.rampDirZ;
    const sideX = -dz; // local +x
    const sideZ = dx; // local +x, z part
    const W = GARAGE_HALF_WIDTH_METERS;
    const D = GARAGE_HALF_DEPTH_METERS;
    // The entrance lands on the first aisle row; the pit centre follows from there.
    const entryLocalZ = -D + 20;
    const entryAlong = GARAGE_RAMP_APRON_METERS + rampRun;
    const entryX = c.nodeX + dx * entryAlong;
    const entryZ = c.nodeZ + dz * entryAlong;
    const cx = entryX + dx * -entryLocalZ;
    const cz = entryZ + dz * -entryLocalZ;
    const toWorld = (lx: number, lz: number, y: number): { x: number; z: number; y: number } => ({
      x: cx + sideX * lx + dx * lz,
      z: cz + sideZ * lx + dz * lz,
      y,
    });

    const addNode = (tag: string, lx: number, lz: number, y: number): string => {
      const p = toWorld(lx, lz, y);
      const id = `g${g}-${tag}`;
      addedNodes.push({ id, x: p.x, z: p.z, y });
      return id;
    };
    const straight = (
      id: string,
      fromId: string,
      toId: string,
      a: { x: number; z: number; y: number },
      b: { x: number; z: number; y: number },
    ): void => {
      const chord = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(2, Math.ceil(chord / 4));
      const points: MutablePoint[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        points.push({
          x: a.x + (b.x - a.x) * t,
          z: a.z + (b.z - a.z) * t,
          y: a.y + (b.y - a.y) * t,
        });
      }
      addedEdges.push({
        id,
        from: fromId,
        to: toId,
        roadClass: 'garage',
        maxGrade: grade,
        halfWidthMeters: GARAGE_AISLE_HALF_WIDTH_METERS,
        shoulderMeters: GARAGE_AISLE_SHOULDER_METERS,
        points,
      });
    };
    const p = (lx: number, lz: number, y: number) => toWorld(lx, lz, y);
    const toLocal = (x: number, z: number): [number, number] => {
      const wx = x - cx;
      const wz = z - cz;
      return [wx * sideX + wz * sideZ, wx * dx + wz * dz];
    };

    // Phase 11.1b pit split: the slab swallows the streets that cross it. A
    // local/alley street entering the pit box (the pit rectangle plus a 10 m rim
    // margin) is cut at the rim: the near part keeps its id and ends at the rim
    // node g{g}-pit{k}a, the far part re-emerges past the pit as "<id>-far" from
    // the rim node g{g}-pit{k}b. Both rim nodes ride the street, so the severance
    // is invisible on the profile. A street that starts inside the box becomes
    // its own far part; one that sits wholly inside is dropped.
    {
      const BOX_W = GARAGE_HALF_WIDTH_METERS + 10;
      const BOX_D = GARAGE_HALF_DEPTH_METERS + 10;
      const inBoxLocal = (lx: number, lz: number): boolean =>
        Math.abs(lx) < BOX_W && Math.abs(lz) < BOX_D;
      let pitPart = 0;
      for (const edge of edges) {
        if (edge.roadClass !== 'urban-local' && edge.roadClass !== 'urban-alley') continue;
        if (edge.points.length < 2) continue;
        const local = edge.points.map((pt) => toLocal(pt.x, pt.z));
        const inside = local.map(([lx, lz]) => inBoxLocal(lx ?? 0, lz ?? 0));
        if (!inside.some(Boolean)) continue;
        // Find the crossings by sampled flips, refined by bisection.
        const flips: Array<{ i: number; t: number }> = [];
        for (let i = 1; i < edge.points.length; i += 1) {
          const ia = inside[i - 1]!;
          const ib = inside[i]!;
          if (ia === ib) continue;
          const pa = edge.points[i - 1]!;
          const pb = edge.points[i]!;
          let ta = 0;
          let tb = 1;
          // b: inside end, a: outside end
          if (ia) {
            ta = 1;
            tb = 0;
          }
          for (let b = 0; b < 12; b += 1) {
            const tm = (ta + tb) / 2;
            const mx = pa.x + (pb.x - pa.x) * tm;
            const mz = pa.z + (pb.z - pa.z) * tm;
            const [mlx, mlz] = toLocal(mx, mz);
            const insideM = inBoxLocal(mlx, mlz);
            if (ia ? !insideM : insideM) {
              tb = tm;
            } else {
              ta = tm;
            }
          }
          flips.push({ i, t: (ta + tb) / 2 });
        }
        const startIn = inside[0]!;
        const endIn = inside[inside.length - 1]!;
        const entry = flips.find((f) => !inside[f.i - 1] && inside[f.i]);
        const exit = flips.find((f) => inside[f.i - 1] && !inside[f.i]);
        const crossPoint = (f: { i: number; t: number }): { x: number; z: number; y: number } => {
          const pa = edge.points[f.i - 1]!;
          const pb = edge.points[f.i]!;
          return {
            x: pa.x + (pb.x - pa.x) * f.t,
            z: pa.z + (pb.z - pa.z) * f.t,
            y: pa.y + (pb.y - pa.y) * f.t,
          };
        };
        if (startIn && endIn) {
          // The whole street sits in the slab: drop it.
          edge.points = [];
          continue;
        }
        if (entry !== undefined && exit !== undefined) {
          const a = crossPoint(entry);
          const b = crossPoint(exit);
          // Capture the far end BEFORE the near part is re-pointed.
          const originalTo = edge.to;
          const farPts: MutablePoint[] = [b];
          for (let i = exit.i; i < edge.points.length; i += 1) {
            farPts.push(edge.points[i]!);
          }
          const nearPts: MutablePoint[] = [];
          for (let i = 0; i < entry.i; i += 1) {
            nearPts.push(edge.points[i]!);
          }
          nearPts.push(a);
          const rimA = addNode(`pit${pitPart}a`, ...toLocal(a.x, a.z), a.y);
          const rimB = addNode(`pit${pitPart}b`, ...toLocal(b.x, b.z), b.y);
          pitPart += 1;
          if (startIn) {
            // The street starts in the slab: it becomes its own far part.
            edge.points = farPts;
            edge.from = rimB;
          } else {
            edge.points = nearPts;
            edge.to = rimA;
            addedEdges.push({
              id: `${edge.id}-far`,
              from: rimB,
              to: originalTo,
              roadClass: edge.roadClass,
              maxGrade: edge.maxGrade,
              halfWidthMeters: edge.halfWidthMeters,
              shoulderMeters: edge.shoulderMeters,
              points: farPts,
            });
          }
        } else if (startIn) {
          // Starts in the slab, leaves it: becomes its own far part.
          const f = flips.find((x) => inside[x.i - 1] && !inside[x.i])!;
          const b = crossPoint(f);
          const rimB = addNode(`pit${pitPart}b`, ...toLocal(b.x, b.z), b.y);
          pitPart += 1;
          const pts: MutablePoint[] = [b];
          for (let i = f.i; i < edge.points.length; i += 1) {
            pts.push(edge.points[i]!);
          }
          edge.points = pts;
          edge.from = rimB;
        }
      }
    }

    // Phase 11.1b frontage apron: the driveway frontage - the local street the ramp
    // runs alongside - would be sunken by the ramp's authority zone over the whole
    // descent if left in place. Sever it at the 18 m apron: the street ends where the
    // flat apron does (it reads as the street ending at the garage driveway), and the
    // pit split above already re-emerges its far part past the pit as "-far".
    if (c.frontageEdgeId !== null) {
      const frontage = edges.find((e) => e.id === c.frontageEdgeId);
      if (frontage !== undefined && frontage.points.length >= 2) {
        const atFrom = frontage.from === c.nodeId;
        if (atFrom) {
          // Sever at exactly the apron boundary, interpolating inside the segment
          // that crosses it (driveways are often single 40-60 m segments, so a
          // snap-to-point cut would land at the far end and shorten nothing).
          let acc = 0;
          let splitAt = -1;
          let boundaryX = 0;
          let boundaryZ = 0;
          let boundaryY = 0;
          for (let i = 1; i < frontage.points.length; i += 1) {
            const q = frontage.points[i]!;
            const q0 = frontage.points[i - 1]!;
            const segLen = Math.hypot(q.x - q0.x, q.z - q0.z);
            if (segLen < 0.5) continue;
            const next = acc + segLen;
            if (next >= GARAGE_RAMP_APRON_METERS + 6) {
              const frac = (GARAGE_RAMP_APRON_METERS + 6 - acc) / segLen;
              boundaryX = q0.x + (q.x - q0.x) * frac;
              boundaryZ = q0.z + (q.z - q0.z) * frac;
              boundaryY = q0.y + (q.y - q0.y) * frac;
              splitAt = i;
              break;
            }
            acc = next;
          }
          if (splitAt > 0) {
            const [tlx, tlz] = toLocal(boundaryX, boundaryZ);
            const frontageId = addNode('frontage', tlx, tlz, boundaryY);
            const kept = frontage.points.slice(0, splitAt);
            kept.push({ x: boundaryX, z: boundaryZ, y: boundaryY });
            const oldTo = frontage.to;
            frontage.points = kept;
            frontage.to = frontageId;
            // If the near part ended at this garage's own pit-edge node (the
            // pit split above re-pointed it), the cut orphans that node - it
            // was only ever the severed segment's far end. Drop it so the
            // network stays one component.
            if (
              oldTo !== undefined &&
              oldTo !== frontageId &&
              !edges.some((e) => e.id !== frontage.id && (e.from === oldTo || e.to === oldTo))
            ) {
              const ix = addedNodes.findIndex((n) => n.id === oldTo);
              if (ix >= 0) addedNodes.splice(ix, 1);
            }
            // The street may continue past the cut: a grid node can sit between
            // the 18 m boundary and the pit. Walk the frontage street downstream
            // (ramp direction): every continuation segment that stays inside the
            // ramp's descent corridor (lateral < 8 m from the ramp line, 18 m ..
            // ramp end + 6 m ahead) is removed - left in place it floats as a
            // street-level ribbon over the ramp's authority. A segment that
            // leaves the corridor is trimmed back to its first point outside,
            // re-anchored at a new node, and the walk stops there.
            const rampEndAlong = GARAGE_RAMP_APRON_METERS + levelDrop / grade;
            const inRampZone = (px: number, pz: number): boolean => {
              const rx = px - c.nodeX;
              const rz = pz - c.nodeZ;
              const along = rx * dx + rz * dz;
              const lat = rx * sideX + rz * sideZ;
              return (
                along > GARAGE_RAMP_APRON_METERS + 6 &&
                along < rampEndAlong + 6 &&
                Math.abs(lat) < 8
              );
            };
            let walkNode: string | undefined = oldTo;
            for (let hop = 0; hop < 4 && walkNode !== undefined; hop += 1) {
              const conts = edges.filter(
                (e) =>
                  e.from === walkNode &&
                  (e.roadClass === 'urban-local' || e.roadClass === 'urban-alley') &&
                  e.points.length >= 2,
              );
              const cont = conts.find((e) => {
                const p0 = e.points[0]!;
                const p1 = e.points[1]!;
                const elen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
                if (elen < 0.5) return false;
                return (p1.x - p0.x) * dx + (p1.z - p0.z) * dz > 0.7 * elen;
              });
              if (cont === undefined) break;
              let lastIn = -1;
              for (let i = 0; i < cont.points.length; i += 1) {
                const pt = cont.points[i]!;
                if (inRampZone(pt.x, pt.z)) lastIn = i;
              }
              if (lastIn < 0) break; // the segment stays outside the corridor
              const contTo = cont.to;
              if (lastIn === cont.points.length - 1) {
                const ix = edges.indexOf(cont);
                if (ix >= 0) edges.splice(ix, 1);
                if (
                  contTo !== walkNode &&
                  !edges.some((e) => e.from === contTo || e.to === contTo)
                ) {
                  const ni = addedNodes.findIndex((n) => n.id === contTo);
                  if (ni >= 0) addedNodes.splice(ni, 1);
                }
                walkNode = contTo;
              } else {
                const b = cont.points[lastIn + 1]!;
                const [tlx2, tlz2] = toLocal(b.x, b.z);
                const trimId = addNode('frontage', tlx2, tlz2, b.y);
                cont.points = cont.points.slice(lastIn + 1);
                cont.from = trimId;
                break;
              }
            }
          }
        }
      }
    }

    // Phase 11.0a: ramp-corridor severance for the pit-split far parts. A street that
    // crosses the pit can re-emerge on the far side straight across the ramp's descent
    // corridor (the crossing line coincides with the ramp's approach line) and then
    // floats as a street-level ribbon over the ramp. Sever it with the same corridor
    // rule as the frontage continuation: wholly-in-zone removed, end-touching trimmed
    // back to the first point outside and re-anchored, dangling rim-side stubs dropped
    // (their orphan rim nodes removed). Middle crossings are left for 11.1d.
    {
      const rampEndAlong = GARAGE_RAMP_APRON_METERS + levelDrop / grade;
      const inCorridor = (px: number, pz: number): boolean => {
        const rx = px - c.nodeX;
        const rz = pz - c.nodeZ;
        const along = rx * dx + rz * dz;
        const lat = rx * sideX + rz * sideZ;
        return along > GARAGE_RAMP_APRON_METERS && along < rampEndAlong + 6 && Math.abs(lat) < 8;
      };
      const dropOrphan = (id: string): void => {
        if (!addedNodes.some((n) => n.id === id)) return;
        if (edges.some((e) => e.from === id || e.to === id)) return;
        if (addedEdges.some((e) => e.from === id || e.to === id)) return;
        const ix = addedNodes.findIndex((n) => n.id === id);
        if (ix >= 0) addedNodes.splice(ix, 1);
      };
      const sever = (list: typeof edges): void => {
        for (let eIdx = list.length - 1; eIdx >= 0; eIdx -= 1) {
          const edge = list[eIdx]!;
          // Every street class that crosses the descent corridor is severed (the pit
          // retaining wall ends it) — city-access and arterial streets included:
          // leaving one running at street level over the ramp's drop buries the ramp
          // ribbon. The garage's own edges (ramp/aisles) never match the corridor.
          if (edge.roadClass === 'garage') continue;
          if (edge.points.length < 2) continue;
          const inZone: number[] = [];
          for (let i = 0; i < edge.points.length; i += 1) {
            const pt = edge.points[i]!;
            if (inCorridor(pt.x, pt.z)) inZone.push(i);
          }
          if (inZone.length === 0) continue;
          const last = edge.points.length - 1;
          const firstIn = inZone[0]!;
          const lastIn = inZone[inZone.length - 1]!;
          if (inZone.length === edge.points.length) {
            const oldFrom = edge.from;
            const oldTo = edge.to;
            list.splice(eIdx, 1);
            dropOrphan(oldFrom);
            dropOrphan(oldTo);
            continue;
          }
          if (firstIn === 0 && lastIn < last) {
            const b = edge.points[lastIn + 1]!;
            const [tlx, tlz] = toLocal(b.x, b.z);
            const cutId = addNode('rampcut', tlx, tlz, b.y);
            edge.points = edge.points.slice(lastIn + 1);
            const oldFrom = edge.from;
            edge.from = cutId;
            dropOrphan(oldFrom);
          } else if (lastIn === last && firstIn > 0) {
            const b = edge.points[firstIn - 1]!;
            const [tlx, tlz] = toLocal(b.x, b.z);
            const cutId = addNode('rampcut', tlx, tlz, b.y);
            edge.points = edge.points.slice(0, firstIn);
            const oldTo = edge.to;
            edge.to = cutId;
            dropOrphan(oldTo);
          } else if (firstIn > 0 && lastIn < last) {
            // Middle crossing: the street runs on both sides of the corridor — split
            // it at the zone boundaries, dropping the corridor run (the pit wall).
            const a = edge.points[firstIn - 1]!;
            const b = edge.points[lastIn + 1]!;
            const [alx, alz] = toLocal(a.x, a.z);
            const [blx, blz] = toLocal(b.x, b.z);
            const cutA = addNode('rampcut', alx, alz, a.y);
            const cutB = addNode('rampcut', blx, blz, b.y);
            const far = {
              id: `${edge.id}-rampcut`,
              from: cutB,
              to: edge.to,
              roadClass: edge.roadClass,
              maxGrade: edge.maxGrade,
              halfWidthMeters: edge.halfWidthMeters,
              shoulderMeters: edge.shoulderMeters,
              points: edge.points.slice(lastIn + 1),
            };
            edge.points = edge.points.slice(0, firstIn);
            edge.to = cutA;
            list.splice(eIdx, 1, edge, far);
          }
        }
      };
      // Far parts of the pit split live in addedEdges until the final merge — scan
      // both lists (far parts first: they are the ones that re-emerge across the ramp).
      sever(addedEdges);
      sever(edges);
    }

    // The entrance ramp: a street-level apron, then the max-grade descent to the floor.
    const entryNode = addNode('entry', 0, entryLocalZ, floorY);
    {
      const steps = Math.max(2, Math.ceil(entryAlong / 4));
      const points: MutablePoint[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const dAlong = t * entryAlong;
        const y =
          dAlong <= GARAGE_RAMP_APRON_METERS
            ? c.nodeY
            : c.nodeY - grade * (dAlong - GARAGE_RAMP_APRON_METERS);
        points.push({
          x: c.nodeX + (entryX - c.nodeX) * t,
          z: c.nodeZ + (entryZ - c.nodeZ) * t,
          y,
        });
      }
      addedEdges.push({
        id: `g${g}-ramp`,
        from: c.nodeId,
        to: entryNode,
        roadClass: 'garage',
        maxGrade: grade,
        halfWidthMeters: GARAGE_RAMP_HALF_WIDTH_METERS,
        shoulderMeters: GARAGE_RAMP_SHOULDER_METERS,
        points,
      });
    }

    // The driving serpentine: one-way lanes at floor level, nose-in bays between
    // the rows. The entrance aisle runs from the ramp landing to the left end; four
    // passes snake the slab to a dead end at the far corner.
    const rows = [entryLocalZ, -14, -4, 6, 16];
    const xExtent = W - GARAGE_MARGIN_METERS;

    const aisle = (
      tag: string,
      fromX: number,
      toX: number,
      row: number,
      prevId: string,
    ): string => {
      const id = addNode(tag, toX, row, floorY);
      straight(`g${g}-${tag}`, prevId, id, p(fromX, row, floorY), p(toX, row, floorY));
      return id;
    };
    const conn = (
      tag: string,
      lx: number,
      fromRow: number,
      toRow: number,
      prevId: string,
    ): string => {
      const id = addNode(tag, lx, toRow, floorY);
      straight(`g${g}-${tag}`, prevId, id, p(lx, fromRow, floorY), p(lx, toRow, floorY));
      return id;
    };

    let prev = aisle('a1', 0, -xExtent, rows[0]!, entryNode);
    prev = conn('c1', -xExtent, rows[0]!, rows[1]!, prev);
    prev = aisle('a2', -xExtent, xExtent, rows[1]!, prev);
    prev = conn('c2', xExtent, rows[1]!, rows[2]!, prev);
    prev = aisle('a3', xExtent, -xExtent, rows[2]!, prev);
    prev = conn('c3', -xExtent, rows[2]!, rows[3]!, prev);
    prev = aisle('a4', -xExtent, xExtent, rows[3]!, prev);
    prev = conn('c4', xExtent, rows[3]!, rows[4]!, prev);
    prev = aisle('a5', xExtent, -xExtent, rows[4]!, prev);
    void prev;

    garages.push({
      id: `g${g}`,
      x: cx,
      z: cz,
      yaw: Math.atan2(dx, dz),
      widthMeters: W * 2,
      depthMeters: D * 2,
      floorYs: [floorY],
      entranceY: c.nodeY,
      entranceNodeId: c.nodeId,
      rampDirX: dx,
      rampDirZ: dz,
      aisleZs: rows,
      pit: {
        x: cx,
        z: cz,
        yaw: Math.atan2(dx, dz),
        halfWidth: W,
        halfDepth: D,
        rounding: GARAGE_PIT_ROUNDING_METERS,
        fade: GARAGE_PIT_FADE_METERS,
        depth: c.nodeY - floorY,
        floorY,
      },
    });
  }

  return { garages, addedEdges, addedNodes };
}

export function buildRoadNetwork(
  config: RoadNetworkConfig,
  baseHeightAt: (x: number, z: number) => number,
): RoadNetwork {
  const nodeConfig = new Map(config.nodes.map((node) => [node.id, node]));
  const mutableEdges: {
    id: string;
    from: string;
    to: string;
    roadClass: RoadClass;
    maxGrade: number;
    halfWidthMeters: number;
    shoulderMeters: number;
    points: MutablePoint[];
  }[] = [];

  // ------------------------------------------------------------------
  // Phase 11.0a — grade-constrained horizontal routing (generated worlds only).
  //
  // The grid-first layout places non-urban roads as straight chords (plus via points);
  // a chord that crosses steep ground can NEVER meet its grade cap, no matter how the
  // profile is shaped below. Eligible edges are re-routed in the plane through a terrain
  // A* with a hard per-step grade cap BEFORE the spline resample: rural roads always
  // (the modern "meander, don't fight the profile" look), trunk lines only when their
  // chord is grade-infeasible. Refusal keeps the original chord — connectivity is a hard
  // constraint and the vertical solver does its best exactly as it does today. Grid
  // cities, the Aohara kit, touge switchbacks, garages and alleys stay as placed.
  const routingSeed = config.seed;
  const routingEligible: boolean[] = config.edges.map(() => false);
  const routingBbox = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  if (routingSeed !== undefined) {
    for (let index = 0; index < config.edges.length; index += 1) {
      const edge = config.edges[index]!;
      if (edge.from.startsWith('aohara-') || edge.to.startsWith('aohara-')) continue;
      const cls = edge.roadClass ?? 'rural';
      if (
        cls !== 'rural' &&
        cls !== 'highway' &&
        cls !== 'urban-arterial' &&
        cls !== 'city-access'
      ) {
        continue;
      }
      const from = nodeConfig.get(edge.from);
      const to = nodeConfig.get(edge.to);
      if (!from || !to) continue;
      const cap = edge.maxGrade ?? config.maxGrade;
      // Rural roads are always routed (meander upgrade). Trunks are routed only for
      // SEVERE crossings (local grade > 3× the cap): the vertical solver's terrain-follow
      // band already absorbs the 1.5–2× crossings (that is its job, and re-shaping every
      // such chord would rewrite the whole map), while a >3× wall is what leaves a road
      // floating above or sunk into the hillside. Measured on a dense resample so a long
      // chord cannot hide a local ridge behind its average grade.
      let eligible = cls === 'rural';
      if (!eligible) {
        const chord = resamplePolyline(
          [[from.x, from.z], ...(edge.via ?? []), [to.x, to.z]] as [number, number][],
          25,
        );
        eligible = maxStepGrade(chord, baseHeightAt) > cap * 3;
      }
      if (!eligible) continue;
      routingEligible[index] = true;
      for (const node of [from, to]) {
        routingBbox.minX = Math.min(routingBbox.minX, node.x);
        routingBbox.maxX = Math.max(routingBbox.maxX, node.x);
        routingBbox.minZ = Math.min(routingBbox.minZ, node.z);
        routingBbox.maxZ = Math.max(routingBbox.maxZ, node.z);
      }
    }
  }
  let routingGrid: RoutingGrid | null = null;
  const routedEdgeIds: string[] = [];
  // One corridor per UNDIRECTED node pair. The layout can carry the same physical road
  // as two directed edges (a rural line landing on a skeleton segment); A* is not
  // direction-symmetric in practice, so two independent searches would diverge by cells
  // and the diverging ribbons would bury each other (a D3 centre gap at the ribbon
  // centre). The second directed edge re-runs the first's proven corridor reversed.
  const routeCache = new Map<string, { origin: string; points: [number, number][] } | null>();
  const routeEdge = (
    edge: RoadEdgeConfig,
    index: number,
    from: RoadNodeConfig,
    to: RoadNodeConfig,
  ): [number, number][] | null => {
    const pairKey = [edge.from, edge.to].sort().join('|');
    const cached = routeCache.get(pairKey);
    if (cached !== undefined) {
      if (cached === null) return null;
      routedEdgeIds.push(`${edge.from}->${edge.to}`);
      if (edge.from === cached.origin) return cached.points;
      return [...cached.points].reverse().map((p) => [p[0], p[1]] as [number, number]);
    }
    if (routingGrid === null) {
      const margin = 1200;
      const sizeX = routingBbox.maxX - routingBbox.minX + margin * 2;
      const sizeZ = routingBbox.maxZ - routingBbox.minZ + margin * 2;
      if (sizeX < 64 || sizeZ < 64) return null; // degenerate (generated worlds are wider)
      // 32 m cells: A* cost grows super-linearly with grid size (measured 153 ms/route
      // at 24 m vs ~14 ms at 32 m on the 12 km window), and the spline resample at 8 m
      // smooths the corner path anyway. Capped at ~1100 cells/side for huge bboxes.
      const spacing = Math.max(32, Math.max(sizeX, sizeZ) / 1100);
      routingGrid = buildRoutingGrid(
        routingBbox.minX - margin,
        routingBbox.minZ - margin,
        sizeX,
        sizeZ,
        spacing,
        baseHeightAt,
      );
    }
    const cap = edge.maxGrade ?? config.maxGrade;
    const route = routeGradeConstrained(routingGrid, from.x, from.z, to.x, to.z, cap, {
      // Per-edge stream: the same world routes the same roads, every engine.
      seed: (routingSeed ?? 0) ^ Math.imul(index + 1, 0x9e3779b9),
      meanderAmp: (edge.roadClass ?? 'rural') === 'rural' ? 12 : 0,
      // Corridor bias: nudge the search to hug the original chord axis (the junction
      // approach stays straight like the baseline chord), detouring only where the
      // grade forces it. Waypoint-locked ends were tried and rejected — they hairpin
      // when the feasible corridor sits behind the waypoint (a 135° kink at the
      // junction instead of a gentle detour).
      biasToChord: 0.02,
    });
    if (route !== null) {
      const pts = route.points.map((p) => [p[0], p[1]] as [number, number]);
      routeCache.set(pairKey, { origin: edge.from, points: pts });
      routedEdgeIds.push(`${edge.from}->${edge.to}`);
      return pts;
    }
    routeCache.set(pairKey, null);
    return null;
  };

  // Phase 11.0a: a rural road can land exactly on a skeleton segment (its snapped
  // endpoints coincide with the trunk's nodes), and the layout then carries the same
  // physical road twice — once per class. Keep the FIRST edge of the pair (the
  // skeleton/highway edge; the region content is added after the skeleton): the duplicate
  // follows the same corridor with a different profile and buries its twin's ribbon
  // (a D3 centre gap of the profile difference). Generated worlds only — hand-authored
  // networks are untouched.
  const seenNodePairs = new Set<string>();
  for (const [edgeIndex, edge] of config.edges.entries()) {
    if (config.seed !== undefined) {
      const pair = [edge.from, edge.to].sort().join('|');
      if (seenNodePairs.has(pair)) continue;
      seenNodePairs.add(pair);
    }
    const roadClass = edge.roadClass ?? 'rural';
    const maxGrade = edge.maxGrade ?? config.maxGrade;
    const halfWidthMeters = edge.halfWidthMeters ?? config.halfWidthMeters;
    const shoulderMeters = edge.shoulderMeters ?? config.shoulderMeters;
    if (!Number.isFinite(maxGrade) || maxGrade <= 0 || maxGrade > 1) {
      throw new Error(`invalid road grade for edge ${edge.from} -> ${edge.to}`);
    }
    if (
      !Number.isFinite(halfWidthMeters) ||
      halfWidthMeters <= 0 ||
      !Number.isFinite(shoulderMeters) ||
      shoulderMeters < 0 ||
      halfWidthMeters + shoulderMeters >= config.blendWidthMeters
    ) {
      throw new Error(`invalid road width for edge ${edge.from} -> ${edge.to}`);
    }
    const from = nodeConfig.get(edge.from);
    const to = nodeConfig.get(edge.to);
    if (!from || !to) {
      throw new Error(`road edge references unknown node: ${edge.from} -> ${edge.to}`);
    }
    // Phase 11.0a: the routed horizontal path replaces the layout chord — rural roads
    // always, trunks only when the chord was grade-infeasible. `null` = refusal: the
    // original chord stands and the vertical solver takes it from there.
    let via: readonly (readonly [number, number])[] = edge.via ?? [];
    let routed = false;
    if (routingEligible[edgeIndex] === true) {
      const route = routeEdge(edge, edgeIndex, from, to);
      if (route !== null && route.length > 2) {
        // The route's endpoints are the exact from/to nodes (pinned); the interior
        // points become the spline controls.
        via = route.slice(1, -1);
        routed = true;
      }
    }
    const control: MutablePoint[] = [
      { x: from.x, z: from.z, y: 0 },
      ...via.map(([x, z]) => ({ x, z, y: 0 })),
      { x: to.x, z: to.z, y: 0 },
    ];
    let points: MutablePoint[];
    if (routed) {
      // Phase 11.0a: the routed path is already geometry — a corner-cut, grade-proven
      // corridor. Resample it LINEARLY at the sample spacing: catmull-rom overshoots on
      // the dense corner sequence, swinging the road off the corridor A* proved
      // grade-feasible (kinks, floating embankments).
      points = resamplePolyline(
        control.map((p) => [p.x, p.z] as [number, number]),
        config.sampleSpacingMeters,
      ).map(([x, z]) => ({ x, z, y: baseHeightAt(x, z) }));
    } else if (config.seed === undefined) {
      // Hand-authored networks (the Aohara kit): the catmull-rom spline over the
      // designer's control points is the established look — untouched.
      const padded = [
        control[0] as MutablePoint,
        ...control,
        control[control.length - 1] as MutablePoint,
      ];
      points = [];
      for (let span = 0; span < control.length - 1; span += 1) {
        const p0 = padded[span] as MutablePoint;
        const p1 = padded[span + 1] as MutablePoint;
        const p2 = padded[span + 2] as MutablePoint;
        const p3 = padded[span + 3] as MutablePoint;
        const chord = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const subdivisions = Math.max(4, Math.ceil(chord / config.sampleSpacingMeters));
        for (let step = 0; step < subdivisions; step += 1) {
          const { x, z } = catmullRom(p0, p1, p2, p3, step / subdivisions);
          points.push({ x, z, y: baseHeightAt(x, z) });
        }
      }
      const last = control[control.length - 1] as MutablePoint;
      points.push({ x: last.x, z: last.z, y: baseHeightAt(last.x, last.z) });
    } else {
      // Generated-world chords that A* refused (or never needed): the SAME treatment
      // as routed paths — Chaikin corner-cut + LINEAR resample. Phase 11.0b: the old
      // catmull-rom pass here overshoots on the layout's tight via corners (a touge
      // hairpin swings the road ~140 m off the designed line — a kink plus a road
      // buried 80 m under its own ridge). Corner-cutting keeps the road inside the
      // designer's via polyline, where the grade was already considered.
      const smoothed = chaikinSmooth(
        control.map((p) => [p.x, p.z] as [number, number]),
        3,
      );
      points = resamplePolyline(smoothed, config.sampleSpacingMeters).map(([x, z]) => ({
        x,
        z,
        y: baseHeightAt(x, z),
      }));
    }
    mutableEdges.push({
      id: `${edge.from}->${edge.to}`,
      from: edge.from,
      to: edge.to,
      roadClass,
      maxGrade,
      halfWidthMeters,
      shoulderMeters,
      points,
    });
  }

  // Profile solving: smooth, pin junctions to one shared elevation, then clamp grades.
  for (const edge of mutableEdges) {
    smoothProfile(edge.points, 10, 3);
  }

  // Phase 10 pass 3: tunnels. A mainline road that would crest a steep ridge instead dips
  // below the natural ground under it: the carve makes the dip the floor, and the cap in
  // RoadWorld makes it read as a tunnel with portals at the surface crossings. The
  // recorded floor ranges are the only tunnel spans: ordinary hillside cuts (profile
  // below the natural ground where a road shelves out of a slope) must NOT be capped.
  // The world's biggest ridges tunnel; smaller crossings keep the cut.
  const dipCandidates: { edge: (typeof mutableEdges)[number]; plan: TunnelDipPlan }[] = [];
  for (const edge of mutableEdges) {
    if (!TUNNEL_CANDIDATE_CLASSES.has(edge.roadClass)) continue;
    const baseY = edge.points.map((point) => baseHeightAt(point.x, point.z));
    const plan = findTunnelDip(edge.points, baseY, edge.maxGrade);
    if (plan !== null) dipCandidates.push({ edge, plan });
  }
  dipCandidates.sort((a, b) => b.plan.ridgeExcess - a.plan.ridgeExcess);
  const tunnelDips: { edgeId: string; startIndex: number; endIndex: number }[] = [];
  for (const { edge, plan } of dipCandidates.slice(0, TUNNEL_MAX_PER_WORLD)) {
    applyTunnelDip(edge.points, plan, edge.maxGrade);
    tunnelDips.push({ edgeId: edge.id, startIndex: plan.startIndex, endIndex: plan.endIndex });
  }

  const nodeElevation = new Map<string, number>();
  for (const node of config.nodes) {
    const endings: number[] = [];
    for (const edge of mutableEdges) {
      if (edge.from === node.id) endings.push(edge.points[0]?.y ?? 0);
      if (edge.to === node.id) endings.push(edge.points[edge.points.length - 1]?.y ?? 0);
    }
    nodeElevation.set(
      node.id,
      endings.length > 0
        ? endings.reduce((sum, value) => sum + value, 0) / endings.length
        : baseHeightAt(node.x, node.z),
    );
  }
  // The pins must be grade-feasible: a junction sits where several roads meet, and each road
  // can only rise `maxGrade × length` between its ends. On a steep blend the naive average
  // of the incident edge ends is infeasible for at least one edge, and the clamp below then
  // leaves a near-vertical step at the edge front — a road that cliffs out mid-hill. Relax
  // the node elevations until every edge's rise fits its grade budget (always feasible: any
  // level world satisfies all of them).
  for (let iteration = 0; iteration < 96; iteration += 1) {
    let maxExcess = 0;
    for (const edge of mutableEdges) {
      const fromElevation = nodeElevation.get(edge.from) ?? 0;
      const toElevation = nodeElevation.get(edge.to) ?? 0;
      let length = 0;
      for (let i = 1; i < edge.points.length; i += 1) {
        const point = edge.points[i];
        const previous = edge.points[i - 1];
        if (point === undefined || previous === undefined) continue;
        length += Math.hypot(point.x - previous.x, point.z - previous.z);
      }
      const excess = Math.abs(toElevation - fromElevation) - length * edge.maxGrade;
      if (excess > 1e-9) {
        const half = excess / 2;
        const direction = Math.sign(toElevation - fromElevation);
        nodeElevation.set(edge.from, fromElevation + direction * half);
        nodeElevation.set(edge.to, toElevation - direction * half);
        maxExcess = Math.max(maxExcess, excess);
      }
    }
    if (maxExcess < 1e-6) break;
  }
  for (const edge of mutableEdges) {
    const first = edge.points[0];
    const last = edge.points[edge.points.length - 1];
    if (first) first.y = nodeElevation.get(edge.from) ?? first.y;
    if (last) last.y = nodeElevation.get(edge.to) ?? last.y;
    clampGrade(edge.points, edge.maxGrade);
  }

  // Phase 11.2 — terrain-following: pull each profile toward the ground inside the fill/cut
  // band, subject to the grade. This is what stops a hilltop-to-valley junction pair from
  // producing a straight max-grade line floating 100 m over the valley floor (the carve
  // would materialise it as a floating embankment). Tunnel floors are exempt — their dip is
  // a structure, already proved grade-feasible. The sparse pre-check skips the ~95% of edges
  // (the flat city plateaus) that are already inside the band.
  for (const edge of mutableEdges) {
    const exempt = tunnelDips
      .filter((dip) => dip.edgeId === edge.id)
      .map((dip) => [dip.startIndex, dip.endIndex] as const);
    if (!profileDeviatesFromBand(edge.points, baseHeightAt, exempt)) {
      continue;
    }
    const baseY = edge.points.map((point) => baseHeightAt(point.x, point.z));
    terrainFollow(edge.points, baseY, edge.maxGrade, exempt);
  }

  // Phase 10 pass 3: overpasses. A seeded few flat arterial crossings lift their
  // through-street onto a deck over the other street; the lower street keeps the
  // junction elevation and the spans render through the bridge barrier/piers path.
  const liftedEdgeIds = selectAndLiftOverpasses(config, mutableEdges, nodeElevation, baseHeightAt);

  // Phase 10 pass 4: underground parking garages — a single open floor of aisle roads
  // sunk into a rectangular pit, reached by a max-grade ramp from a flat arterial node.
  // Their profiles are explicit (level floors and exact-grade ramps), so they join the
  // solved edges after the pin/clamp pass; the pit is carved in the terrain sampler.
  const garagePlan = planGarages(config, mutableEdges, nodeElevation, baseHeightAt);
  for (const edge of garagePlan.addedEdges) {
    mutableEdges.push(edge);
  }

  // Final safety pass (Phase 11.0b): the later passes (overpass lifts, garage
  // additions, per-edge terrain follow) run after the pin/clamp above; re-pin the
  // endpoints to the solved node elevations and run the pairwise grade clamp one
  // last time so every frozen edge sits on its solved junctions and respects its
  // grade budget (the test contract: grade <= maxGrade * 1.05). Where a
  // terrain-locked interior rides exactly at the cap, the clamp converges to
  // within a few micrometres — below any physical or render relevance.
  for (const edge of mutableEdges) {
    const first = edge.points[0];
    const last = edge.points[edge.points.length - 1];
    if (first) first.y = nodeElevation.get(edge.from) ?? first.y;
    if (last) last.y = nodeElevation.get(edge.to) ?? last.y;
    clampGrade(edge.points, edge.maxGrade);
  }

  const edges: RoadEdge[] = mutableEdges.map((edge) => {
    let length = 0;
    const points: RoadPoint[] = edge.points.map((point, index) => {
      if (index > 0) {
        const previous = edge.points[index - 1] as MutablePoint;
        length += Math.hypot(point.x - previous.x, point.z - previous.z);
      }
      return { x: point.x, z: point.z, y: point.y, alongMeters: length };
    });
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      roadClass: edge.roadClass,
      maxGrade: edge.maxGrade,
      halfWidthMeters: edge.halfWidthMeters,
      shoulderMeters: edge.shoulderMeters,
      points,
      lengthMeters: length,
    };
  });
  let nodes: RoadNode[] = [
    ...config.nodes.map((node) => ({
      id: node.id,
      x: node.x,
      z: node.z,
      y: nodeElevation.get(node.id) ?? baseHeightAt(node.x, node.z),
    })),
    // Phase 10 pass 4: the garage's own nodes (level floors and ramp ends) carry their
    // explicit elevations.
    ...garagePlan.addedNodes,
  ];
  // Phase 11.0a: a planner pass (the garage ramp-corridor severance) can orphan a node
  // when its only incident edge is removed and the node belongs to the base layout —
  // the planner's own orphan sweep only touches nodes it added. A degree-0 node
  // renders nothing and splits the component count; drop it.
  {
    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    nodes = nodes.filter((node) => (degree.get(node.id) ?? 0) > 0);
  }
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));

  // Phase 10 pass 2: bridge spans — runs of profile points whose deck holds well above
  // the natural ground (a deep dip crossed on a deck). One point per side is required to
  // be deck to count a segment as bridge, so the deck never starts mid-segment.
  // Shallow bumps (6–10 m) are causeways — the carve raises the roadbed through them. A
  // bridge needs a real ravine: the natural ground well over a dozen metres under the deck.
  const BRIDGE_CLEARANCE_METERS = 12;
  const BRIDGE_MIN_RUN = 3;
  const bridgePoints = new Map<string, Set<number>>();
  const bridgeSpans: BridgeSpan[] = [];
  for (const edge of edges) {
    const flags = new Set<number>();
    let runStart = -1;
    for (let i = 0; i <= edge.points.length; i += 1) {
      const point = edge.points[i];
      const isDeck =
        point !== undefined && point.y - baseHeightAt(point.x, point.z) > BRIDGE_CLEARANCE_METERS;
      if (isDeck) {
        if (runStart < 0) runStart = i;
        flags.add(i);
      } else if (runStart >= 0) {
        if (i - runStart >= BRIDGE_MIN_RUN) {
          bridgeSpans.push({
            edgeId: edge.id,
            roadClass: edge.roadClass,
            halfWidthMeters: edge.halfWidthMeters,
            shoulderMeters: edge.shoulderMeters,
            points: edge.points.slice(runStart, i).map((p) => ({
              ...p,
              baseY: baseHeightAt(p.x, p.z),
            })),
          });
        }
        runStart = -1;
      }
    }
    if (flags.size > 0) {
      bridgePoints.set(edge.id, flags);
    }
  }

  // Phase 10 pass 3: tunnel spans — exactly the floor ranges recorded when the dips
  // were cut (the final solve keeps them below ground: the feasibility guard proved the
  // dip fits its grade budget, and smoothing only widens it gently). RoadWorld caps each
  // run with a ground sheet over the carve's full influence footprint and frames the
  // surface crossings with portal arches.
  const tunnelSpans: TunnelSpan[] = [];
  for (const dip of tunnelDips) {
    const edge = edges.find((candidate) => candidate.id === dip.edgeId);
    if (!edge) continue;
    const run = edge.points.slice(dip.startIndex, dip.endIndex + 1);
    if (run.length < 3) continue;
    // Cap only where the ceiling clears a semi-trailer: out beyond that run the road
    // runs open at grade (its profile there meets the natural ground), so a truck
    // never enters the capped tunnel without a full-height ceiling. The solved profile
    // is not exactly the dip envelope (smoothing and the grade clamp reshape the arms),
    // so keep the longest contiguous stretch that actually clears.
    let bestStart = -1;
    let bestEnd = -1;
    let stretchStart = -1;
    for (let i = 0; i <= run.length; i += 1) {
      const point = run[i];
      const clears =
        point !== undefined &&
        baseHeightAt(point.x, point.z) - point.y >= TUNNEL_CLEARANCE_ROOF_METERS;
      if (clears) {
        if (stretchStart < 0) stretchStart = i;
      } else if (stretchStart >= 0) {
        if (i - 1 - stretchStart > bestEnd - bestStart) {
          bestStart = stretchStart;
          bestEnd = i - 1;
        }
        stretchStart = -1;
      }
    }
    if (bestStart < 0 || bestEnd - bestStart < 2) continue;
    const capped = run.slice(bestStart, bestEnd + 1);
    if (
      capped[capped.length - 1]!.alongMeters - capped[0]!.alongMeters <
      TUNNEL_MIN_CAPPED_RUN_METERS
    ) {
      continue; // the capped part is too short: an open cut
    }
    // The cap sheet's lateral edges: resample the natural ground at each cap edge so
    // the sheet follows the terrain across its full width (a mountainside drops metres
    // over the cap's 30 m offset — using the centreline height floated the edges).
    const capCover = edge.halfWidthMeters + edge.shoulderMeters + config.blendWidthMeters;
    tunnelSpans.push({
      edgeId: edge.id,
      roadClass: edge.roadClass,
      halfWidthMeters: edge.halfWidthMeters,
      shoulderMeters: edge.shoulderMeters,
      blendWidthMeters: config.blendWidthMeters,
      points: capped.map((p, index) => {
        const prev = capped[index - 1] ?? p;
        const next = capped[index + 1] ?? p;
        let tx = next.x - prev.x;
        let tz = next.z - prev.z;
        const length = Math.hypot(tx, tz) || 1;
        tx /= length;
        tz /= length;
        // Left normal of the travel direction (consistent sign; the cap is symmetric).
        const nx = -tz;
        const nz = tx;
        const leftX = p.x + nx * capCover;
        const leftZ = p.z + nz * capCover;
        const rightX = p.x - nx * capCover;
        const rightZ = p.z - nz * capCover;
        return {
          ...p,
          baseY: baseHeightAt(p.x, p.z),
          leftX,
          leftZ,
          leftY: baseHeightAt(leftX, leftZ),
          rightX,
          rightZ,
          rightY: baseHeightAt(rightX, rightZ),
        };
      }),
    });
  }

  // Phase 10 pass 3: overpass deck spans — the lifted street's deck and ramps hold a few
  // metres above the ground the lower street runs on. They join bridgeSpans so the
  // barrier walls and piers render through the existing pass (no onBridge flag: the
  // carve keeps its normal influence, which already holds the deck under the deck's own
  // ribbon and the junction level under the street below).
  const OVERPASS_SPAN_ROOF_METERS = 3;
  const OVERPASS_SPAN_MIN_RUN = 4;
  const overpassSpans: BridgeSpan[] = [];
  for (const edge of edges) {
    if (!liftedEdgeIds.has(edge.id)) continue;
    const bridgeFlags = bridgePoints.get(edge.id);
    let runStart = -1;
    for (let i = 0; i <= edge.points.length; i += 1) {
      const point = edge.points[i];
      // Points already spanned by a real bridge keep their own span only.
      const isDeck =
        point !== undefined &&
        point.y - baseHeightAt(point.x, point.z) > OVERPASS_SPAN_ROOF_METERS &&
        !bridgeFlags?.has(i);
      if (isDeck) {
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        const run = edge.points.slice(runStart, i);
        if (run.length >= OVERPASS_SPAN_MIN_RUN) {
          overpassSpans.push({
            edgeId: edge.id,
            roadClass: edge.roadClass,
            halfWidthMeters: edge.halfWidthMeters,
            shoulderMeters: edge.shoulderMeters,
            points: run.map((p) => ({ ...p, baseY: baseHeightAt(p.x, p.z) })),
          });
        }
        runStart = -1;
      }
    }
  }

  // Spatial index over segments, expanded by the blend width so `sample` finds every
  // segment that could influence a query point.
  interface Segment {
    readonly ax: number;
    readonly az: number;
    readonly bx: number;
    readonly bz: number;
    readonly ay: number;
    readonly by: number;
    readonly edgeId: string;
    readonly roadClass: RoadClass;
    readonly halfWidthMeters: number;
    readonly shoulderMeters: number;
    readonly onBridge: boolean;
  }
  const segments: Segment[] = [];
  const index = new Map<string, number[]>();
  const cellKey = (cx: number, cz: number): string => `${cx},${cz}`;
  for (const edge of edges) {
    for (let indexOfPoint = 0; indexOfPoint < edge.points.length - 1; indexOfPoint += 1) {
      const a = edge.points[indexOfPoint] as RoadPoint;
      const b = edge.points[indexOfPoint + 1] as RoadPoint;
      const segmentIndex = segments.length;
      segments.push({
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        ay: a.y,
        by: b.y,
        edgeId: edge.id,
        roadClass: edge.roadClass,
        halfWidthMeters: edge.halfWidthMeters,
        shoulderMeters: edge.shoulderMeters,
        onBridge:
          (bridgePoints.get(edge.id)?.has(indexOfPoint) ?? false) &&
          (bridgePoints.get(edge.id)?.has(indexOfPoint + 1) ?? false),
      });
      const expand = config.blendWidthMeters;
      const minCx = Math.floor((Math.min(a.x, b.x) - expand) / INDEX_CELL_METERS);
      const maxCx = Math.floor((Math.max(a.x, b.x) + expand) / INDEX_CELL_METERS);
      const minCz = Math.floor((Math.min(a.z, b.z) - expand) / INDEX_CELL_METERS);
      const maxCz = Math.floor((Math.max(a.z, b.z) + expand) / INDEX_CELL_METERS);
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        for (let cz = minCz; cz <= maxCz; cz += 1) {
          const key = cellKey(cx, cz);
          const bucket = index.get(key) ?? [];
          bucket.push(segmentIndex);
          index.set(key, bucket);
        }
      }
    }
  }

  const sample = (x: number, z: number): RoadSample | null => {
    const bucket = index.get(
      cellKey(Math.floor(x / INDEX_CELL_METERS), Math.floor(z / INDEX_CELL_METERS)),
    );
    if (!bucket) {
      return null;
    }
    let best: RoadSample | null = null;
    for (const segmentIndex of bucket) {
      const segment = segments[segmentIndex] as Segment;
      const dx = segment.bx - segment.ax;
      const dz = segment.bz - segment.az;
      const lengthSquared = dx * dx + dz * dz;
      const t =
        lengthSquared > 0
          ? Math.min(
              1,
              Math.max(0, ((x - segment.ax) * dx + (z - segment.az) * dz) / lengthSquared),
            )
          : 0;
      const closestX = segment.ax + dx * t;
      const closestZ = segment.az + dz * t;
      const distance = Math.hypot(x - closestX, z - closestZ);
      if (best === null || distance < best.distance) {
        best = {
          distance,
          elevation: segment.ay + (segment.by - segment.ay) * t,
          edgeId: segment.edgeId,
          roadClass: segment.roadClass,
          halfWidthMeters: segment.halfWidthMeters,
          shoulderMeters: segment.shoulderMeters,
          onBridge: segment.onBridge,
        };
      }
    }
    return best;
  };

  const sampleAll = (x: number, z: number): RoadSample[] => {
    const bucket = index.get(
      cellKey(Math.floor(x / INDEX_CELL_METERS), Math.floor(z / INDEX_CELL_METERS)),
    );
    if (!bucket) {
      return [];
    }
    const result: RoadSample[] = [];
    for (const segmentIndex of bucket) {
      const segment = segments[segmentIndex] as Segment;
      const dx = segment.bx - segment.ax;
      const dz = segment.bz - segment.az;
      const lengthSquared = dx * dx + dz * dz;
      const t =
        lengthSquared > 0
          ? Math.min(
              1,
              Math.max(0, ((x - segment.ax) * dx + (z - segment.az) * dz) / lengthSquared),
            )
          : 0;
      const closestX = segment.ax + dx * t;
      const closestZ = segment.az + dz * t;
      const distance = Math.hypot(x - closestX, z - closestZ);
      // The per-candidate influence range (pavement + shoulder + blend).
      if (distance >= config.blendWidthMeters + segment.halfWidthMeters + segment.shoulderMeters) {
        continue;
      }
      result.push({
        distance,
        elevation: segment.ay + (segment.by - segment.ay) * t,
        edgeId: segment.edgeId,
        roadClass: segment.roadClass,
        halfWidthMeters: segment.halfWidthMeters,
        shoulderMeters: segment.shoulderMeters,
        onBridge: segment.onBridge,
      });
    }
    return result;
  };

  return {
    config,
    edges,
    nodes,
    totalLengthMeters: edges.reduce((sum, edge) => sum + edge.lengthMeters, 0),
    bridgeSpans,
    overpassSpans,
    overpassEdgeIds: liftedEdgeIds,
    tunnelSpans,
    garages: garagePlan.garages,
    routedEdgeIds,
    sample,
    sampleAll,
    neighboursOf(nodeId: string): readonly string[] {
      const result: string[] = [];
      for (const edge of edges) {
        if (edge.from === nodeId) result.push(edge.to);
        if (edge.to === nodeId) result.push(edge.from);
      }
      return result;
    },
    nodeById(nodeId: string): RoadNode | null {
      return nodeLookup.get(nodeId) ?? null;
    },
  };
}

/**
 * How strongly the road profile owns the terrain height at a centreline distance:
 * fully flat across pavement + shoulder, then a smooth blend back to natural ground.
 */
export function roadInfluence(
  config: RoadNetworkConfig,
  distance: number,
  halfWidthMeters = config.halfWidthMeters,
  shoulderMeters = config.shoulderMeters,
): number {
  const flat = halfWidthMeters + shoulderMeters;
  if (distance <= flat) {
    return 1;
  }
  if (distance >= config.blendWidthMeters) {
    return 0;
  }
  const t = (distance - flat) / (config.blendWidthMeters - flat);
  const smooth = t * t * (3 - 2 * t);
  return 1 - smooth;
}
