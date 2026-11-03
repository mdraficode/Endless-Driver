/**
 * Phase 10.5 (C5) — closed-loop traffic routes for the streamed cities, derived from the
 * solved RoadNetwork. Each route is one city block ring (four ring-street chains), resampled
 * to a fixed number of uniform points with a yaw and a "next corner" turn table, so both the
 * WebGPU compute kernel and the CPU shadow step can sample position/heading by distance with
 * one lookup each. Pure in (network, plan, region) — the same world always derives the same
 * loops (plan §5).
 */
import { TRAFFIC_ROUTE_SAMPLES } from '../config/world-events';
import type { RoadEdge, RoadNetwork, RoadNode } from './road-network';
export interface TrafficRoutePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export interface TrafficRoute {
  readonly regionId: string;
  /** Stable index within the region (the assignment order). */
  readonly index: number;
  /** Uniformly spaced closed-loop samples (the first point repeats as the last implicitly). */
  readonly points: readonly TrafficRoutePoint[];
  readonly length: number;
  readonly spacing: number;
  /** Narrowest lane the route uses; the lane offset is derived from it. */
  readonly halfWidthMeters: number;
}

export interface RegionRoutes {
  readonly regionId: string;
  readonly routes: readonly TrafficRoute[];
}

interface EdgeGeometry {
  readonly edge: RoadEdge;
  /** Cumulative (alongMeters, point) pairs for uniform sampling. */
  readonly points: readonly { x: number; y: number; z: number; s: number }[];
}

/** nodeId -> incident edges, built once per derivation pass. */
function buildAdjacency(network: RoadNetwork): Map<string, RoadEdge[]> {
  const adjacency = new Map<string, RoadEdge[]>();
  for (const edge of network.edges) {
    const a = adjacency.get(edge.from) ?? [];
    a.push(edge);
    adjacency.set(edge.from, a);
    const b = adjacency.get(edge.to) ?? [];
    b.push(edge);
    adjacency.set(edge.to, b);
  }
  return adjacency;
}

function edgeGeometry(edge: RoadEdge): EdgeGeometry {
  return {
    edge,
    points: edge.points.map((p) => ({ x: p.x, y: p.y, z: p.z, s: p.alongMeters })),
  };
}

/**
 * Greedy chain from `fromId` to `toId`: at every node take the incident edge whose far end
 * is strictly closer to the target. The generated grid's split nodes lie on the block corner
 * chord, so the greedy walk is the chain; any loop or dead end fails the route.
 */
function chainBetween(
  network: RoadNetwork,
  adjacency: Map<string, RoadEdge[]>,
  fromId: string,
  toId: string,
): EdgeGeometry[] | null {
  const to = network.nodeById(toId);
  if (to === null) return null;
  const chains: EdgeGeometry[] = [];
  let currentId = fromId;
  const startNode = network.nodeById(fromId);
  if (startNode === null) return null;
  let current = startNode;
  let guard = 0;
  while (currentId !== toId && guard < 64) {
    guard += 1;
    const candidates = adjacency.get(currentId) ?? [];
    let bestEdge: RoadEdge | null = null;
    let bestNode: RoadNode | null = null;
    let bestDistance = Math.hypot(current.x - to.x, current.z - to.z);
    for (const edge of candidates) {
      const otherId = edge.from === currentId ? edge.to : edge.from;
      const other = network.nodeById(otherId);
      if (other === null) continue;
      const distance = Math.hypot(other.x - to.x, other.z - to.z);
      if (distance < bestDistance - 1e-3) {
        bestDistance = distance;
        bestEdge = edge;
        bestNode = other;
      }
    }
    if (bestEdge === null || bestNode === null || bestNode.id === currentId) return null;
    // Keep the chain oriented from -> to.
    chains.push(edgeGeometry(bestEdge.from === currentId ? bestEdge : flipEdge(bestEdge)));
    currentId = bestNode.id;
    current = bestNode;
  }
  return currentId === toId && chains.length > 0 ? chains : null;
}

function flipEdge(edge: RoadEdge): RoadEdge {
  return {
    ...edge,
    from: edge.to,
    to: edge.from,
    points: edge.points
      .map((p) => {
        return {
          x: p.x,
          y: p.y,
          z: p.z,
          alongMeters: edge.lengthMeters - p.alongMeters,
        };
      })
      .reverse(),
  };
}

/** Uniformly samples a chain of edges at `step` metres into closed-loop-free points. */
function sampleChain(
  chains: readonly EdgeGeometry[],
  step: number,
): { x: number; y: number; z: number; s: number }[] {
  const out: { x: number; y: number; z: number; s: number }[] = [];
  let offset = step; // skip the first sample (it is shared with the previous chain)
  for (let chainIndex = 0; chainIndex < chains.length; chainIndex += 1) {
    const chain = chains[chainIndex]!;
    const total = chain.edge.lengthMeters;
    let i = 1;
    let s = offset;
    while (s <= total + 1e-3) {
      while (i < chain.points.length - 1 && (chain.points[i]!.s ?? 0) < s) {
        i += 1;
      }
      const a = chain.points[Math.max(0, i - 1)]!;
      const b = chain.points[Math.min(chain.points.length - 1, i)]!;
      const span = Math.max(1e-3, b.s - a.s);
      const t = Math.max(0, Math.min(1, (s - a.s) / span));
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, s });
      s += step;
    }
    offset = step; // each subsequent chain resumes at its start
  }
  return out;
}

function resampleClosed(
  raw: readonly { x: number; y: number; z: number }[],
  count: number,
): TrafficRoutePoint[] {
  if (raw.length < 8) throw new Error('route too short to resample');
  // Cumulative arc length of the raw polyline (it is open; the closing leg is appended).
  const cum: number[] = [0];
  let total = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const a = raw[i]!;
    const b = raw[(i + 1) % raw.length]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
    cum.push(total);
  }
  const points: TrafficRoutePoint[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (i / count) * total;
    while (cursor < raw.length - 1 && cum[cursor + 1]! < target) {
      cursor += 1;
    }
    const a = raw[cursor]!;
    const b = raw[(cursor + 1) % raw.length]!;
    const segStart = cum[cursor]!;
    const segLen = Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z));
    const t = Math.max(0, Math.min(1, (target - segStart) / segLen));
    points.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      yaw: 0,
    });
  }
  // Central-difference yaw (forward = (sin yaw, cos yaw) convention, matches the network).
  for (let i = 0; i < count; i += 1) {
    const a = points[(i - 1 + count) % count]!;
    const b = points[(i + 1) % count]!;
    points[i] = { ...points[i]!, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }
  return points;
}

/** Per-archetype grid geometry (mirrors road-layout.ts; the routes must land on its streets). */
const ROUTE_GRID: Readonly<
  Record<'megacity' | 'urban-fringe', { nodes: number; spacing: number; cap: number }>
> = {
  megacity: { nodes: 9, spacing: 240, cap: 12 },
  'urban-fringe': { nodes: 6, spacing: 320, cap: 8 },
};

/** The solved node closest to (x, z) within `maxDistanceMeters`, or null. */
function nearestNodeWithin(
  network: RoadNetwork,
  x: number,
  z: number,
  maxDistanceMeters: number,
): RoadNode | null {
  let best: RoadNode | null = null;
  let bestDistance = maxDistanceMeters;
  for (const node of network.nodes) {
    const d = Math.hypot(node.x - x, node.z - z);
    if (d <= bestDistance) {
      bestDistance = d;
      best = node;
    }
  }
  return best;
}

/**
 * Derive the closed-loop traffic routes for one urban region: the block rings around the
 * district centre, nearest blocks first, each resampled to `TRAFFIC_ROUTE_SAMPLES` uniform
 * points. Pure in (network, region) — the same world always derives the same loops (plan §5).
 */
export function deriveRegionRoutes(
  network: RoadNetwork,
  region: {
    id: string;
    archetype: string;
    district: { readonly centerX: number; readonly centerZ: number };
  },
): RegionRoutes {
  if (region.archetype !== 'megacity' && region.archetype !== 'urban-fringe') {
    return { regionId: region.id, routes: [] };
  }
  const grid = ROUTE_GRID[region.archetype]!;
  const n = grid.nodes;
  const spacing = grid.spacing;
  const cx = region.district.centerX;
  const cz = region.district.centerZ;
  const half = (n - 1) / 2;
  const adjacency = buildAdjacency(network);
  // Distance-ordered block candidates (ties broken by row, column).
  const candidates: { r: number; c: number; d: number }[] = [];
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const br = r + 0.5 - half;
      const bc = c + 0.5 - half;
      candidates.push({ r, c, d: br * br + bc * bc });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.r - b.r || a.c - b.c);
  const routes: TrafficRoute[] = [];
  for (const cand of candidates) {
    if (routes.length >= grid.cap) break;
    const { r, c } = cand;
    // Ring corners (south-west first, counter-clockwise): sw, se, ne, nw.
    const corners: RoadNode[] = [];
    for (const [cr, cc] of [
      [r, c],
      [r, c + 1],
      [r + 1, c + 1],
      [r + 1, c],
    ] as const) {
      const node = nearestNodeWithin(
        network,
        cx + (cc - half) * spacing,
        cz + (cr - half) * spacing,
        20,
      );
      if (node === null) continue;
      corners.push(node);
    }
    if (corners.length < 4) continue;
    // Four greedy chains sw -> se -> ne -> nw -> sw.
    const chains: EdgeGeometry[] = [];
    let broken = false;
    for (let k = 0; k < 4; k += 1) {
      const chain = chainBetween(network, adjacency, corners[k]!.id, corners[(k + 1) % 4]!.id);
      if (chain === null) {
        broken = true;
        break;
      }
      for (const part of chain) chains.push(part);
    }
    if (broken) continue;
    const raw = sampleChain(chains, spacing / 10);
    if (raw.length < 8) continue;
    let length = 0;
    let halfWidth = Infinity;
    for (const chain of chains) {
      halfWidth = Math.min(halfWidth, chain.edge.halfWidthMeters);
    }
    if (halfWidth < 3.0) continue;
    for (let i = 0; i < raw.length; i += 1) {
      const a = raw[i]!;
      const b = raw[(i + 1) % raw.length]!;
      length += Math.hypot(b.x - a.x, b.z - a.z);
    }
    // Reject degenerate chains: the loop must be a proper block ring.
    const min = 0.6 * 2 * (spacing + spacing);
    const max = 1.5 * 2 * (spacing + spacing);
    if (length < min || length > max) continue;
    const points = resampleClosed(raw, TRAFFIC_ROUTE_SAMPLES);
    routes.push({
      regionId: region.id,
      index: routes.length,
      points,
      length,
      spacing: length / TRAFFIC_ROUTE_SAMPLES,
      halfWidthMeters: halfWidth,
    });
  }
  return { regionId: region.id, routes };
}
