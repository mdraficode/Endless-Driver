/**
 * Phase 10 Most Wanted — seeded per-region placement of hideouts, pursuit-breakers, bounty
 * spots and police anchors. Mirrors `computeRegionEvents` (world-events.ts): a pure function
 * of the region seed + the solved road network, so the same world always places the same
 * points. No Three.js / Rapier / DOM — Node-testable.
 */
import { REGION_CELL_METERS, type RegionPlan } from '../world/world-plan';
import type { RoadEdge, RoadNode } from '../world/road-network';
import type { MwPlacementConfig, MwPlacementPoint, RegionMwEventSet } from './types';

/** Minimal road-network view the placement needs (decoupled + Node-testable). */
export interface MwRoadNetworkView {
  readonly edges: readonly RoadEdge[];
  nodeById(id: string): RoadNode | null;
}

/** Deterministic unit in [0, 1) for (a, b, seed) — the project's standard hash. */
function unit(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

interface EdgePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** Point and heading on an edge at metres `alongMeters` from its `from` end. */
function edgePointAt(edge: RoadEdge, alongMeters: number): EdgePoint {
  const points = edge.points;
  const s = Math.max(0, Math.min(edge.lengthMeters, alongMeters));
  let i = 1;
  while (i < points.length - 1 && (points[i]!.alongMeters ?? 0) < s) {
    i += 1;
  }
  const a = points[Math.max(0, i - 1)]!;
  const b = points[Math.min(points.length - 1, i)]!;
  const span = Math.max(1e-3, b.alongMeters - a.alongMeters);
  const t = Math.max(0, Math.min(1, (s - a.alongMeters) / span));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)),
  };
}

/**
 * Derive one region's Most Wanted points from its solved road network. Pure in
 * (region, network, config): candidate edges are walked in stable (sorted id) order and
 * every choice hashes on the region seed, so the same world always places the same points.
 */
export function computeRegionMwEvents(
  region: RegionPlan,
  network: MwRoadNetworkView,
  config: MwPlacementConfig,
): RegionMwEventSet {
  const { seed, id: regionId } = region;
  const radius = REGION_CELL_METERS * config.radiusFactor;

  // Candidate roads: drivable through streets inside the cell (never alleys or driveways).
  const candidates: RoadEdge[] = [];
  for (const edge of network.edges) {
    const a = network.nodeById(edge.from);
    const b = network.nodeById(edge.to);
    if (a === null || b === null) continue;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    if (Math.hypot(mx - region.centerX, mz - region.centerZ) > radius) continue;
    if (!config.eligibleClasses.includes(edge.roadClass)) continue;
    if (edge.lengthMeters < config.minEdgeLengthMeters) continue;
    candidates.push(edge);
  }
  candidates.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  if (candidates.length === 0) {
    return { regionId, hideSpots: [], pursuitBreakers: [], bountySpots: [], policeAnchors: [] };
  }

  /** A seeded count in [min, max] for a salt. */
  const countIn = (min: number, max: number, salt: number): number =>
    min + Math.floor(unit(regionId.length + salt, salt * 7 + 1, seed) * (max - min + 1));

  /** Pick `count` distinct candidate edges for a salt (deterministic). */
  const pickDistinct = (salt: number, count: number): RoadEdge[] => {
    const out: RoadEdge[] = [];
    let guard = 0;
    while (out.length < count && guard < 64) {
      guard += 1;
      const h = unit(regionId.length * 31 + guard, salt, seed);
      const edge = candidates[Math.floor(h * candidates.length)]!;
      if (edge !== undefined && !out.includes(edge)) out.push(edge);
    }
    return out;
  };

  /** Place one point per edge, at a seeded position along it. */
  const place = (salt: number, edges: RoadEdge[]): MwPlacementPoint[] => {
    const pts: MwPlacementPoint[] = [];
    for (const edge of edges) {
      const f = 0.25 + unit(edge.lengthMeters, salt + 3, seed) * 0.5;
      const alongMeters = f * edge.lengthMeters;
      const at = edgePointAt(edge, alongMeters);
      pts.push({ edgeId: edge.id, alongMeters, x: at.x, y: at.y, z: at.z, yaw: at.yaw });
    }
    return pts;
  };

  const HIDE_SALT = 0xa1;
  const BREAK_SALT = 0xb1;
  const BOUNTY_SALT = 0xc1;
  const ANCHOR_SALT = 0xd1;

  return {
    regionId,
    hideSpots: place(
      HIDE_SALT,
      pickDistinct(HIDE_SALT, countIn(config.hideSpots[0], config.hideSpots[1], HIDE_SALT)),
    ),
    pursuitBreakers: place(
      BREAK_SALT,
      pickDistinct(
        BREAK_SALT,
        countIn(config.pursuitBreakers[0], config.pursuitBreakers[1], BREAK_SALT),
      ),
    ),
    bountySpots: place(
      BOUNTY_SALT,
      pickDistinct(BOUNTY_SALT, countIn(config.bountySpots[0], config.bountySpots[1], BOUNTY_SALT)),
    ),
    policeAnchors: place(
      ANCHOR_SALT,
      pickDistinct(
        ANCHOR_SALT,
        countIn(config.policeAnchors[0], config.policeAnchors[1], ANCHOR_SALT),
      ),
    ),
  };
}
