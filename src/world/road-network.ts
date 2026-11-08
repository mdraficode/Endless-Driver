import type { RoadClass, RoadNetworkConfig } from '../config/roads';

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
  /** Floor points in travel order, with the natural ground height above each. */
  readonly points: readonly (RoadPoint & { readonly baseY: number })[];
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
  /** Nearest centreline sample, or `null` when no segment is indexed near (x, z). */
  sample(x: number, z: number): RoadSample | null;
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

  for (const edge of config.edges) {
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
    const control: MutablePoint[] = [
      { x: from.x, z: from.z, y: 0 },
      ...(edge.via ?? []).map(([x, z]) => ({ x, z, y: 0 })),
      { x: to.x, z: to.z, y: 0 },
    ];
    const padded = [
      control[0] as MutablePoint,
      ...control,
      control[control.length - 1] as MutablePoint,
    ];
    const points: MutablePoint[] = [];
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

  // Phase 10 pass 3: overpasses. A seeded few flat arterial crossings lift their
  // through-street onto a deck over the other street; the lower street keeps the
  // junction elevation and the spans render through the bridge barrier/piers path.
  const liftedEdgeIds = selectAndLiftOverpasses(config, mutableEdges, nodeElevation, baseHeightAt);

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
  const nodes: RoadNode[] = config.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    z: node.z,
    y: nodeElevation.get(node.id) ?? baseHeightAt(node.x, node.z),
  }));
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
    tunnelSpans.push({
      edgeId: edge.id,
      roadClass: edge.roadClass,
      halfWidthMeters: edge.halfWidthMeters,
      shoulderMeters: edge.shoulderMeters,
      blendWidthMeters: config.blendWidthMeters,
      points: capped.map((p) => ({ ...p, baseY: baseHeightAt(p.x, p.z) })),
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

  return {
    config,
    edges,
    nodes,
    totalLengthMeters: edges.reduce((sum, edge) => sum + edge.lengthMeters, 0),
    bridgeSpans,
    overpassSpans,
    overpassEdgeIds: liftedEdgeIds,
    tunnelSpans,
    sample,
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
