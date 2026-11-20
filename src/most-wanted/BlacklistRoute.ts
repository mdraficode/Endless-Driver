/**
 * Phase 10 Most Wanted — Milestone 5b: the **Blacklist race route**, the pure geometry.
 *
 * A Blacklist race (NFS Most Wanted 2005) is a point‑to‑point road race against a rival. This
 * module is the *route* half of that: a 2‑D polyline (on the road centreline) with cumulative
 * arc length, so both the rival's progress and the player's progress are a 0..1 fraction of the
 * distance, and the rival's car can be placed anywhere along it.
 *
 * It also *generates* a route by greedily walking the road network from the player's start: at
 * each junction it keeps going in the direction that best continues the current heading (a road
 * race that heads roughly forward, not backtracking). The walker only needs the network's graph
 * (edges/nodes/adjacency) — a minimal structural type the game's solved `RoadNetwork` satisfies —
 * so this stays pure and Node‑testable against tiny fake networks.
 */

export interface RaceRoutePoint {
  readonly x: number;
  readonly z: number;
}

/** A 2‑D polyline with cumulative arc length, so progress is a 0..1 fraction of distance. */
export interface RaceRoute {
  /** The route waypoints (consecutive duplicates already removed). */
  readonly points: readonly RaceRoutePoint[];
  /** Arc length from `points[0]` to each point; `cumulative[0] === 0`. */
  readonly cumulative: readonly number[];
  /** Total route length in metres; `cumulative[cumulative.length - 1]`. */
  readonly lengthMeters: number;
}

/** A point on the route, with the forward yaw (forward = (-sin yaw, -cos yaw)). */
export interface RoutePoint extends RaceRoutePoint {
  readonly yaw: number;
}

/**
 * The minimal road‑network surface the route walker needs. The game's solved `RoadNetwork`
 * (`src/world/road-network.ts`) satisfies this structurally (its `RoadEdge`/`RoadNode` have the
 * fields below plus more), so `Application` can hand it in; unit tests build tiny fakes.
 */
export interface RaceRouteNetwork {
  readonly edges: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly points: readonly RaceRoutePoint[];
    readonly lengthMeters: number;
  }[];
  readonly nodes: readonly { readonly id: string; readonly x: number; readonly z: number }[];
  /** Node ids reachable in one edge from `nodeId` (graph adjacency). */
  neighboursOf(nodeId: string): readonly string[];
  /** The node, or null when unknown. */
  nodeById(nodeId: string): { readonly x: number; readonly z: number } | null;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Build the polyline + cumulative arc lengths from a list of 2‑D points. Consecutive points
 * closer than 1e‑3 m are dropped so the route has no zero‑length segments.
 */
export function buildRoute(points: readonly RaceRoutePoint[]): RaceRoute {
  const clean: RaceRoutePoint[] = [];
  for (const p of points) {
    const last = clean[clean.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 1e-3) continue;
    clean.push({ x: p.x, z: p.z });
  }
  const cumulative = new Array<number>(clean.length);
  let total = 0;
  for (let i = 0; i < clean.length; i += 1) {
    if (i > 0) {
      total += Math.hypot(clean[i]!.x - clean[i - 1]!.x, clean[i]!.z - clean[i - 1]!.z);
    }
    cumulative[i] = total;
  }
  return { points: clean, cumulative, lengthMeters: total };
}

/**
 * The point (and forward yaw) at a 0..1 fraction along the route. `0` is the start, `1` the
 * finish. The yaw orients forward (-sin yaw, -cos yaw) along the direction of travel, so a body
 * placed here can be given it as its heading.
 */
export function pointAlongRoute(route: RaceRoute, fraction: number): RoutePoint {
  const { points: pts, cumulative: cum, lengthMeters } = route;
  const n = pts.length;
  if (n === 0) return { x: 0, z: 0, yaw: 0 };
  if (n === 1) return { x: pts[0]!.x, z: pts[0]!.z, yaw: 0 };
  const target = clamp01(fraction) * lengthMeters;
  // First index with cumulative >= target, clamped into [1, n-1] (a valid segment).
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  let i = lo;
  if (i < 1) i = 1;
  if (i > n - 1) i = n - 1;
  const a = pts[i - 1]!;
  const b = pts[i]!;
  const segA = cum[i - 1]!;
  const segLen = cum[i]! - segA;
  const t = segLen > 1e-6 ? (target - segA) / segLen : 0;
  const x = a.x + (b.x - a.x) * t;
  const z = a.z + (b.z - a.z) * t;
  const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)) || 0; // normalise -0 → 0
  return { x, z, yaw };
}

/**
 * The 0..1 route progress of an arbitrary world position: the arc‑length fraction of the nearest
 * point on the polyline. This is how the player's progress along the race is measured — a player
 * who drives slightly off the centreline still maps to their nearest point on it.
 */
export function progressAlongRoute(route: RaceRoute, x: number, z: number): number {
  const { points: pts, cumulative: cum, lengthMeters } = route;
  if (pts.length < 2 || lengthMeters <= 1e-6) return 0;
  let bestDistSq = Infinity;
  let bestLen = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    let t = 0;
    if (len2 > 1e-9) t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = clamp01(t);
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const dx = x - px;
    const dz = z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestLen = cum[i - 1]! + Math.sqrt(len2) * t;
    }
  }
  return clamp01(bestLen / lengthMeters);
}

/** A straight run of points from `a` to `b` (inclusive) with `count` segments. */
function segmentPoints(a: RaceRoutePoint, b: RaceRoutePoint, count: number): RaceRoutePoint[] {
  const out: RaceRoutePoint[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

/** Look up the edge joining two adjacent nodes (either direction), or null. */
function edgeBetween(
  net: RaceRouteNetwork,
  a: string,
  b: string,
): RaceRouteNetwork['edges'][number] | null {
  for (const e of net.edges) {
    if ((e.from === a && e.to === b) || (e.from === b && e.to === a)) return e;
  }
  return null;
}

/**
 * Generate a race route by greedily walking the road network from a start. The route begins at
 * `(startX, startZ)`, connects to the nearest node, then keeps taking the outgoing edge that best
 * continues the current heading (cosine of the turn) until it has laid down at least
 * `targetLengthMeters` of road. `initialHeading` is the player's forward at the start, so the race
 * heads the way you're pointing. Returns a (possibly short) route even on a tiny/dead‑end network
 * — a race is always runnable, just shorter.
 */
export function buildRaceRouteFromNetwork(
  net: RaceRouteNetwork,
  startX: number,
  startZ: number,
  targetLengthMeters: number,
  initialHeading: { readonly x: number; readonly z: number },
): RaceRoute {
  // Nearest node to the start.
  let startNodeId: string | null = null;
  let startNode: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (const node of net.nodes) {
    const d = (node.x - startX) ** 2 + (node.z - startZ) ** 2;
    if (d < bestD) {
      bestD = d;
      startNodeId = node.id;
      startNode = node;
    }
  }
  if (startNodeId === null || startNode === null) {
    return buildRoute([{ x: startX, z: startZ }]);
  }

  const startLen = Math.hypot(initialHeading.x, initialHeading.z);
  let heading: { x: number; z: number } =
    startLen > 1e-6
      ? { x: initialHeading.x / startLen, z: initialHeading.z / startLen }
      : { x: 0, z: -1 };

  const pts: RaceRoutePoint[] = [
    { x: startX, z: startZ },
    { x: startNode.x, z: startNode.z },
  ];

  let current = startNodeId;
  let prev: string | null = null;
  let acc = 0;
  const maxSteps = 500;
  for (let step = 0; step < maxSteps && acc < targetLengthMeters; step += 1) {
    const neighbours = net.neighboursOf(current).filter((nid) => nid !== prev);
    if (neighbours.length === 0) break;
    const cur = net.nodeById(current);
    if (cur === null) break;
    // Pick the neighbour whose direction best continues the current heading.
    let bestN: string | null = null;
    let bestScore = -Infinity;
    let bestNode: { x: number; z: number } | null = null;
    for (const nid of neighbours) {
      const node = net.nodeById(nid);
      if (node === null) continue;
      const dx = node.x - cur.x;
      const dz = node.z - cur.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const score = (dx * heading.x + dz * heading.z) / len;
      if (score > bestScore) {
        bestScore = score;
        bestN = nid;
        bestNode = node;
      }
    }
    if (bestN === null || bestNode === null) break;
    const edge = edgeBetween(net, current, bestN);
    if (edge === null) break;
    // Append the edge's centreline from the current node toward the chosen node.
    const forward = edge.from === current;
    const edgePts = forward ? edge.points : edge.points.slice().reverse();
    for (let i = 1; i < edgePts.length; i += 1) {
      const p = edgePts[i]!;
      pts.push({ x: p.x, z: p.z });
    }
    heading = { x: bestNode.x - cur.x, z: bestNode.z - cur.z };
    const hLen = Math.hypot(heading.x, heading.z);
    if (hLen > 1e-6) heading = { x: heading.x / hLen, z: heading.z / hLen };
    acc += edge.lengthMeters;
    prev = current;
    current = bestN;
  }

  return buildRoute(pts);
}

/**
 * A short, self‑contained route helper for tests/dev: a straight line of `lengthMeters` from
 * `(x, z)` in the given forward direction, sampled every ~`stepMeters`. Not used by the game's
 * real (road‑following) routes; it keeps the geometry helpers exercisable without a network.
 */
export function straightRoute(
  x: number,
  z: number,
  heading: { readonly x: number; readonly z: number },
  lengthMeters: number,
  stepMeters = 50,
): RaceRoute {
  const len = Math.hypot(heading.x, heading.z) || 1;
  const nx = heading.x / len;
  const nz = heading.z / len;
  const count = Math.max(1, Math.round(lengthMeters / stepMeters));
  const a = { x, z };
  const b = { x: x + nx * lengthMeters, z: z + nz * lengthMeters };
  return buildRoute(segmentPoints(a, b, count));
}
