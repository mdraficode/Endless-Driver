import type { TierId } from './tiers';

/**
 * Bounded Phase 5 verge/understory scatter. These are instanced clumps, not collision
 * geometry; tier caps control the fixed GPU pool and density only changes authored detail.
 */
export const GROUND_COVER_CONFIG = {
  /** Global candidate lattice keeps placement identical across chunk edges and rebuilds. */
  cellMeters: 1.8,
  /** Candidate keep probability before the shared terrain grass weight is applied. */
  keepProbabilityByTier: {
    C: 0.18,
    B: 0.34,
    A: 0.55,
  } satisfies Record<TierId, number>,
  /** Fixed per-tier instance-pool caps (not measured performance claims). */
  instanceBudgetByTier: {
    C: 16_000,
    B: 42_000,
    A: 100_000,
  } satisfies Record<TierId, number>,
  minimumGrassWeight: 0.32,
  minimumNormalY: 0.88,
  roadEdgeClearanceMeters: 1.1,
  townBuildingClearanceMeters: 0.65,
  treeTrunkClearanceMeters: 0.95,
  /** Aohara's levelled core and sidewalks stay free of rural ground-cover scatter. */
  urbanCoreClearanceMeters: 560,
  /** Keep the authored start pad clean. */
  spawnClearanceMeters: 55,
  /** The short authored clump height; it stays decorative and never affects handling. */
  maximumBladeHeightMeters: 0.38,
} as const;
