import type { TierId } from './tiers';

/**
 * Low-frequency foliage sway for Phase 5. The vertex deformation is a single bounded TSL
 * sinusoid; the constrained tier omits the node entirely rather than paying for idle motion.
 */
export const FOLIAGE_WIND_CONFIG = {
  amplitudeMetersByTier: { C: 0, B: 0.035, A: 0.065 } satisfies Record<TierId, number>,
  angularSpeedRadiansPerSecond: 0.8,
  /** Position-based phase is stable when streamed instance ordering changes. */
  fieldPhaseRadiansPerMeter: { x: 0.15, z: 0.19 },
  /** Radians per local model-space metre, to vary movement through each crown. */
  crownPhaseRadiansPerMeter: { x: 0.45, y: 0.35, z: 0.6 },
  heightGateStartMeters: 1.25,
  heightGateEndMeters: 4.5,
  lateralRatio: 0.3,
} as const;
