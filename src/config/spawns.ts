/**
 * Where a session can start.
 *
 * The owner report (2026-10-16) was blunt: "don't always spawn the car in a
 * same terrain." A session therefore picks one of these curated starts —
 * each on or beside a road in a different district, so the first thing the
 * player sees rotates between cedar pass, blossom avenue, town, farmland,
 * highlands, and the home meadow. The pick is per page load; the reset key
 * returns to the *session's* start, not to a global origin.
 *
 * `?spawn=<id>` pins a start (captures, bug reports); `?spawn=random` and a
 * missing switch both take the session-random pick. Every point sits inside
 * the road corridor's tree clearance and clear of buildings, on ground the
 * road carve has already flattened to a drivable grade.
 */
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
];

/**
 * Resolves a spawn request to a point. A known `requestedId` always wins;
 * anything else (missing, `random`, unknown) falls back to the session pick
 * driven by `randomValue` in [0, 1).
 */
export function resolveSpawnPoint(
  requestedId: string | undefined,
  randomValue: number,
): SpawnPoint {
  if (requestedId !== undefined && requestedId !== 'random') {
    const requested = SPAWN_POINTS.find((point) => point.id === requestedId);
    if (requested !== undefined) {
      return requested;
    }
  }
  const clamped = Number.isFinite(randomValue) ? Math.min(0.999999, Math.max(0, randomValue)) : 0;
  const index = Math.floor(clamped * SPAWN_POINTS.length);
  return SPAWN_POINTS[index] ?? SPAWN_POINTS[0]!;
}
