/**
 * Yūhi Town build-out tuning (Phase 4 Increment 5b): procedural Japanese town
 * kit placed on the district the roads already serve. Buildings are three
 * archetypes on a loose plot grid; utility poles march along every road edge.
 * All placement is deterministic (world/town.ts) — the town is a function of
 * the map, like the forest.
 */
export const TOWN_CONFIG = {
  /** Plot grid pitch in metres inside the town district. */
  plotPitchMeters: 24,
  /** Buildings stay this far from a road centreline (plots front the street). */
  roadClearanceMeters: 12,
  /** Plots only where the district influence is at least this (0..1 of radius). */
  districtRadiusFraction: 0.82,
  /** Utility pole spacing along road edges, metres. */
  poleSpacingMeters: 38,
  /** Poles stand this far from the centreline, alternating sides per pole. */
  poleOffsetMeters: 7.2,
  /** No poles within this distance of a junction node. */
  junctionClearanceMeters: 12,
  /** A pole folds after roughly this much accumulated hit damage. */
  poleHitPoints: 30,
  /** Minimum seconds between damage events on the same pole (tree parity). */
  poleHitCooldownSeconds: 0.3,
  /** Velocity (m/s) a folding pole can absorb from the car. */
  poleStopSpeed: 2.2,
} as const;

/** Building footprints (metres) and storey heights per archetype. */
export const BUILDING_ARCHETYPES = [
  { id: 'house', width: 6.8, depth: 5.6, height: 3.1, roofHeight: 1.6 },
  { id: 'shop', width: 10.5, depth: 6.4, height: 3.5, roofHeight: 1.8 },
  { id: 'tall', width: 6.2, depth: 6.2, height: 5.4, roofHeight: 1.9 },
] as const;
