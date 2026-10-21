import type { TierId } from './tiers';

export type GroundCoverStyle = 'grass' | 'fern' | 'wildflower' | 'stone';
export const GROUND_COVER_STYLES: readonly GroundCoverStyle[] = [
  'grass',
  'fern',
  'wildflower',
  'stone',
];

/**
 * Bounded, deterministic rural ground-layer scatter. These are instanced clumps, not collision
 * geometry; per-tier caps control the fixed GPU pools and the style map varies with district/surface.
 */
export const GROUND_COVER_CONFIG = {
  /** Global candidate lattice keeps placement identical across chunk edges and rebuilds. */
  cellMeters: 1.8,
  /** Candidate keep probability before the selected grass/rock surface weight is applied. */
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
  /** Style capacities partition the total pool; they do not add to its headline cap. */
  styleInstanceBudgetByTier: {
    C: { grass: 11_000, fern: 2_000, wildflower: 1_500, stone: 1_500 },
    B: { grass: 29_000, fern: 6_000, wildflower: 4_000, stone: 3_000 },
    A: { grass: 70_000, fern: 15_000, wildflower: 8_000, stone: 7_000 },
  } satisfies Record<TierId, Record<GroundCoverStyle, number>>,
  /** Rock fragments can appear on the shallower exposed mineral surfaces. */
  minimumStoneWeight: 0.38,
  /** How readily a candidate on exposed rock becomes a small stone cluster. */
  stoneSelectionChance: 0.36,
  /** District and terrain patch selection fractions for low ferns and flowering plants. */
  fernSelectionChance: 0.32,
  wildflowerSelectionChance: 0.28,
  minimumGrassWeight: 0.32,
  minimumNormalY: 0.88,
  roadEdgeClearanceMeters: 1.1,
  townBuildingClearanceMeters: 0.65,
  treeTrunkClearanceMeters: 0.95,
  /** Aohara's levelled core and sidewalks stay free of rural ground-cover scatter. */
  urbanCoreClearanceMeters: 560,
  /** Keep the authored start pad clean. */
  spawnClearanceMeters: 55,
  /** Maximum authored fern/flower height in metres; these props remain non-colliding. */
  maximumDetailHeightMeters: 0.48,
} as const;
