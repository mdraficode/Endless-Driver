/**
 * Phase 10.2 — hideouts: the world's secret corners.
 *
 * Every world gets a handful of off-programme locations tucked away from the district
 * cores: an abandoned warehouse, a fenced junkyard, and a sunken parking garage that
 * doubles as the local tuning hub. Placement is a pure function of (plan, layout,
 * worldSeed): cells are drawn from a deterministic walk of the region lattice, the
 * in-cell position is hashed, and every candidate must clear the road network's
 * centreline chords so a hideout never sits on top of a street.
 *
 * The sunken garage "underground" is a real pit in the shared heightfield (see
 * `world-terrain.ts`): the terrain, the physics and the visual all see the same
 * depression, so a car drives down the ramp onto a floor that is actually below the
 * street.
 */
import type { RoadNetworkConfig } from '../config/roads';
import type { WorldPlan } from './world-plan';

export type HideoutKind = 'warehouse' | 'junkyard' | 'garage';

export interface HideoutPit {
  readonly x: number;
  readonly z: number;
  readonly radiusMeters: number;
  readonly depthMeters: number;
}

export interface HideoutSpec {
  readonly id: string;
  readonly kind: HideoutKind;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** The region seed stream this hideout was rolled from (visual detail hashes off it). */
  readonly seed: number;
  /** Sunken floor (garage only). */
  readonly pit?: HideoutPit;
}

const HIDEOUT_COUNT = 4;
/** Road clearance: a hideout stays this far from any centreline chord. */
const ROAD_CLEARANCE_METERS = 65;
/** A hideout stays this far from its cell's district core. */
const DISTRICT_CLEARANCE_METERS = 700;
const CELL_OFFSET_METERS = 1400;
const GARAGE_PIT_RADIUS_METERS = 34;
const GARAGE_PIT_DEPTH_METERS = 3.5;

function pick(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

function pointSegmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const span = dx * dx + dz * dz;
  const t = span > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / span)) : 0;
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

/**
 * Nearest centreline-chord distance to the layout: every edge's from/to/via polyline.
 * Unsolved control chords, but splines stay within a few metres of them, and the
 * clearance margin is generous.
 */
export function layoutClearanceMeters(config: RoadNetworkConfig, x: number, z: number): number {
  const nodes = new Map(config.nodes.map((node) => [node.id, node]));
  let best = Infinity;
  for (const edge of config.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const chain: Array<readonly [number, number]> = [
      [from.x, from.z],
      ...(edge.via ?? []),
      [to.x, to.z],
    ];
    for (let i = 0; i + 1 < chain.length; i += 1) {
      const a = chain[i]!;
      const b = chain[i + 1]!;
      best = Math.min(best, pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]));
    }
  }
  return best;
}

/**
 * Deterministic hideout placement for a world. Slot 0 is always the garage (every world
 * has its underground tuning hub); the rest cycle through the other kinds by hash.
 */
export function placeHideouts(
  plan: WorldPlan,
  layout: { readonly config: RoadNetworkConfig },
  worldSeed: number,
): readonly HideoutSpec[] {
  const seed = worldSeed | 0;
  const hideouts: HideoutSpec[] = [];
  const usedCells = new Set<string>();
  for (let slot = 0; slot < HIDEOUT_COUNT; slot += 1) {
    const slotSalt = seed ^ Math.imul(slot + 1, 0x9e3779b9);
    let placed: HideoutSpec | null = null;
    for (let attempt = 0; attempt < 12 && placed === null; attempt += 1) {
      const attemptSalt = slotSalt ^ Math.imul(attempt + 1, 0x85ebca6b);
      // Cell: ring 1-2 around home (the road window the player actually drives).
      const ring = pick(attempt, 0x11, attemptSalt) < 0.65 ? 1 : 2;
      const sideIndex = Math.floor(pick(attempt, 0x12, attemptSalt) * (ring * 8));
      const line = Math.floor(sideIndex / 2) - ring;
      const along = sideIndex % 2 === 0 ? line : -line;
      const ix = sideIndex < 4 ? line : along;
      const iz = sideIndex < 4 ? along : line;
      if (ix === 0 && iz === 0) continue;
      const cellKey = `${ix},${iz}`;
      if (usedCells.has(cellKey)) continue;
      const region = plan.regionAtCell(ix, iz);
      const dx = (pick(attempt, 0x13, attemptSalt) - 0.5) * 2 * CELL_OFFSET_METERS;
      const dz = (pick(attempt, 0x14, attemptSalt) - 0.5) * 2 * CELL_OFFSET_METERS;
      const x = region.centerX + dx;
      const z = region.centerZ + dz;
      // Clear of the district core and of every road.
      if (
        Math.hypot(x - region.district.centerX, z - region.district.centerZ) <
        DISTRICT_CLEARANCE_METERS
      ) {
        continue;
      }
      if (layoutClearanceMeters(layout.config, x, z) < ROAD_CLEARANCE_METERS) {
        continue;
      }
      const kindRoll = pick(slot, 0x21, attemptSalt);
      const kind: HideoutKind =
        slot === 0
          ? 'garage'
          : kindRoll < 0.5
            ? 'warehouse'
            : kindRoll < 0.8
              ? 'junkyard'
              : 'garage';
      usedCells.add(cellKey);
      placed = {
        id: `hideout-${slot}`,
        kind,
        x,
        z,
        yaw: pick(slot, 0x22, attemptSalt) * Math.PI * 2,
        seed: region.seed ^ slotSalt,
        ...(kind === 'garage'
          ? {
              pit: {
                x,
                z,
                radiusMeters: GARAGE_PIT_RADIUS_METERS,
                depthMeters: GARAGE_PIT_DEPTH_METERS,
              },
            }
          : {}),
      };
    }
    if (placed === null) continue;
    hideouts.push(placed);
  }
  return hideouts;
}

/** The garage pits for the terrain carve, in the order the sampler must apply them. */
export function hideoutPits(hideouts: readonly HideoutSpec[]): readonly HideoutPit[] {
  const pits: HideoutPit[] = [];
  for (const hideout of hideouts) {
    if (hideout.pit !== undefined) pits.push(hideout.pit);
  }
  return pits;
}
