/**
 * Where a session can start.
 *
 * Aohara Metropolis is the default start after the owner's 2026-10-19 request; rural Hinode
 * remains intact and accessible through explicit spawn ids. `?spawn=random` opts into the
 * previous per-session district rotation, and `?spawn=<id>` pins a start for captures/bug reports.
 * Every point sits inside the road corridor's tree clearance and clear of buildings, on ground the
 * road carve has already flattened to a drivable grade.
 */
import { AOHARA_DISTRICT_CONFIG } from './urban-district';

export const DEFAULT_SPAWN_ID = 'aohara-city';

export interface SpawnPoint {
  readonly id: string;
  /** Player-facing place name, reported in diagnostics. */
  readonly label: string;
  readonly x: number;
  readonly z: number;
  /** Heading in radians; 0 faces -Z, matching the vehicle convention. */
  readonly yaw: number;
}

export const SPAWN_POINTS: readonly SpawnPoint[] = [
  { id: 'home-meadow', label: 'Home Meadow', x: 0, z: 0, yaw: 0 },
  { id: 'Kiri-cedar', label: 'Kiri Pass', x: -430, z: -1010, yaw: 0.84 },
  { id: 'sakura-avenue', label: 'Sakura Avenue', x: 620, z: -430, yaw: -3.09 },
  { id: 'yuhi-town', label: 'Yūhi Town', x: 540, z: 300, yaw: -0.29 },
  { id: 'shirasagi-fields', label: 'Shirasagi Terraces', x: 60, z: 620, yaw: -1.29 },
  { id: 'west-highlands', label: 'West Highlands', x: -620, z: 330, yaw: -2.15 },
  {
    id: 'aohara-city',
    label: 'Aohara Metropolis — Central Avenue',
    x: AOHARA_DISTRICT_CONFIG.centerX,
    z: AOHARA_DISTRICT_CONFIG.centerZ - AOHARA_DISTRICT_CONFIG.gridSpacingMeters / 2,
    yaw: 0,
  },
];

/**
 * Resolves the game's start. Missing or invalid ids safely fall back to Aohara; only the explicit
 * `random` request opts into the prior session-random rotation driven by `randomValue` in [0, 1).
 */
export function resolveSpawnPoint(
  requestedId: string | undefined,
  randomValue: number,
): SpawnPoint {
  const defaultPoint =
    SPAWN_POINTS.find((point) => point.id === DEFAULT_SPAWN_ID) ?? SPAWN_POINTS[0]!;
  if (requestedId === undefined) {
    return defaultPoint;
  }
  if (requestedId !== 'random') {
    return SPAWN_POINTS.find((point) => point.id === requestedId) ?? defaultPoint;
  }
  const clamped = Number.isFinite(randomValue) ? Math.min(0.999999, Math.max(0, randomValue)) : 0;
  const index = Math.floor(clamped * SPAWN_POINTS.length);
  return SPAWN_POINTS[index] ?? defaultPoint;
}
