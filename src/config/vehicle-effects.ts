import type { TierId } from './tiers';

/**
 * Bounded, procedural presentation around the placeholder player car. These values affect visuals
 * only; smoke, sparks and airflow never feed back into tire grip, collision, or the drivetrain.
 */
export const VEHICLE_EFFECTS_CONFIG = {
  particleCapacityByTier: {
    C: { smoke: 32, sparks: 6, airflow: 4 },
    B: { smoke: 64, sparks: 10, airflow: 10 },
    A: { smoke: 88, sparks: 14, airflow: 16 },
  } satisfies Record<TierId, { smoke: number; sparks: number; airflow: number }>,
  exhaust: {
    /** Car-local exhaust outlet positions; +Z is the rear of the vehicle. */
    outlets: [
      { x: -0.38, y: -0.18, z: 2.22 },
      { x: 0.38, y: -0.18, z: 2.22 },
    ] as const,
    idlePuffsPerSecond: 0.35,
    loadPuffsPerSecond: 5.5,
    shiftPuffsPerSecond: 4,
    lifetimeSeconds: { min: 0.8, max: 1.3 },
    startSizeMeters: { min: 0.12, max: 0.2 },
    endSizeMeters: { min: 0.34, max: 0.52 },
    opacity: { idle: 0.15, loaded: 0.28 },
    buoyancyMetersPerSecondSquared: 0.22,
    dragPerSecond: 0.85,
  },
  tireSmoke: {
    minimumSpeedMps: 6,
    slipAngleStartRadians: 0.19,
    slipAngleFullRadians: 0.44,
    utilizationStart: 0.9,
    utilizationFull: 0.99,
    rearHandbrakeStrength: 0.7,
    puffsPerSecondPerWheel: 8,
    lifetimeSeconds: { min: 0.48, max: 0.82 },
    startSizeMeters: { min: 0.11, max: 0.17 },
    endSizeMeters: { min: 0.27, max: 0.39 },
    opacity: 0.34,
    buoyancyMetersPerSecondSquared: 0.34,
    dragPerSecond: 1.25,
  },
  shiftSparks: {
    countByTier: { C: 4, B: 7, A: 10 } satisfies Record<TierId, number>,
    lifetimeSeconds: { min: 0.11, max: 0.24 },
    sizeMeters: { min: 0.035, max: 0.075 },
    localSpeedMetersPerSecond: { rear: { min: 2.4, max: 5 }, lateral: 1.1, vertical: 1.4 },
    gravityMetersPerSecondSquared: 4.5,
    opacity: 0.95,
  },
  airflow: {
    startSpeedKph: 90,
    fullSpeedKph: 200,
    puffsPerSecondAtFullSpeed: 10,
    lifetimeSeconds: { min: 0.16, max: 0.29 },
    sizeXMeters: { min: 0.62, max: 1.05 },
    sizeYMeters: { min: 0.018, max: 0.032 },
    opacity: 0.3,
    /** Airflow lines are offset from the body to keep the car and road readable. */
    lateralOffsetMeters: { min: 1.18, max: 1.75 },
    heightOffsetMeters: { min: 0.02, max: 0.68 },
    spawnForwardOffsetMeters: { min: -1.8, max: -0.6 },
    relativeFlowSpeedMultiplier: 1.3,
  },
  motionBlur: {
    /** The visual blur is exactly zero until the car crosses this speed. */
    startSpeedKph: 120,
    /** Reaches the tier's configured maximum by this speed. */
    fullSpeedKph: 195,
  },
} as const;
