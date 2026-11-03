/**
 * Phase 10.5 (C5) — emergent gameplay configuration: the streamed-city AI traffic budget and
 * the procedural zones of interest (speed traps, drift zones, smashable bonus boards and the
 * off-road jump). All numbers are world-space constants; the placement itself is a pure
 * function of the region seed (plan §5), so the same world always plays the same.
 */
import type { TierId } from './tiers';

/** Resident AI vehicles for the streamed cities (per tier; the home city keeps its own kit). */
export const STREAMED_TRAFFIC_BUDGET: Readonly<Record<TierId, number>> = {
  A: 60,
  B: 40,
  C: 24,
};

/**
 * Fixed class partition of the resident vehicles, per tier (one instanced batch per class).
 * The order must match STREAMED_TRAFFIC_CLASSES.
 */
export const STREAMED_TRAFFIC_CLASSES = [
  'passenger-car',
  'city-bus',
  'rigid-truck',
  'semi-trailer-rig',
  'farm-tractor',
] as const;

export type StreamedTrafficClass = (typeof STREAMED_TRAFFIC_CLASSES)[number];

export const STREAMED_TRAFFIC_CLASS_BUDGET: Readonly<Record<TierId, readonly number[]>> = {
  A: [32, 12, 8, 4, 4],
  B: [20, 8, 6, 3, 3],
  C: [12, 5, 4, 2, 1],
};

/** Lane centre offset from the edge centreline (metres inside the lane edge). */
export const TRAFFIC_LANE_INSET_METERS = 1.15;
/** Route LUT resolution: closed-loop samples per route and world metres between samples. */
export const TRAFFIC_ROUTE_SAMPLES = 128;
/** Max routes resident in the LUT (the texture is sized for this; extra routes wait). */
export const TRAFFIC_MAX_ROUTES = 96;
/** Routes this far from the player may carry vehicles; farther routes are parked out. */
export const TRAFFIC_ROUTE_ACTIVATION_METERS = 2600;
/** Routes farther than this are fully released (their vehicles are respawned near the player). */
export const TRAFFIC_ROUTE_RELEASE_METERS = 4200;

export interface SpeedTrapConfig {
  /** Zone length in metres, centred on the chosen edge midpoint. */
  readonly zoneLengthMeters: number;
  /** The posted limit; crossing the zone faster on average busts the trap. */
  readonly speedLimitKph: number;
  /** Fraction of the boost tank drained when the player is busted. */
  readonly bustedBoostPenalty: number;
  /** Fraction of the boost tank granted for a clean pass. */
  readonly cleanBoostBonus: number;
}

export interface DriftZoneConfig {
  readonly zoneLengthMeters: number;
  /** Multiplier applied to the sampled surface grip while inside the zone. */
  readonly gripModifier: number;
  /** Boost charge per second while drifting inside the zone. */
  readonly driftBoostPerSecond: number;
}

export interface BonusBoardConfig {
  /** Closing speed (m/s) that smashes the board on contact. */
  readonly hitSpeedMetersPerSecond: number;
  /** Contact radius from the board centre (m). */
  readonly hitRadiusMeters: number;
  /** Boost charge granted per smashed board. */
  readonly boostBonus: number;
}

export interface OffroadJumpConfig {
  /** Minimum forward speed for a crest to launch (m/s). */
  readonly minForwardSpeedMetersPerSecond: number;
  /** Minimum terrain rise over the look-ahead window (m). */
  readonly minTerrainRiseMeters: number;
  /** How far ahead the crest is measured (m). */
  readonly lookAheadMeters: number;
  /** Seconds between two launches. */
  readonly cooldownSeconds: number;
  /** Upward impulse per (m/s of forward speed) at launch. */
  readonly impulsePerMetersPerSecond: number;
  readonly boostBonus: number;
}

export const WORLD_EVENTS_CONFIG: {
  readonly activationRadiusMeters: number;
  readonly speedTrap: SpeedTrapConfig;
  readonly driftZone: DriftZoneConfig;
  readonly bonusBoard: BonusBoardConfig;
  readonly offroadJump: OffroadJumpConfig;
} = {
  /** The active LOD chunk: events inside this radius of the player are live. */
  activationRadiusMeters: 750,
  speedTrap: {
    zoneLengthMeters: 30,
    speedLimitKph: 50,
    bustedBoostPenalty: 0.3,
    cleanBoostBonus: 0.08,
  },
  driftZone: {
    zoneLengthMeters: 40,
    gripModifier: 0.55,
    driftBoostPerSecond: 0.05,
  },
  bonusBoard: {
    hitSpeedMetersPerSecond: 5.5,
    hitRadiusMeters: 2.4,
    boostBonus: 0.15,
  },
  offroadJump: {
    minForwardSpeedMetersPerSecond: 12,
    minTerrainRiseMeters: 0.7,
    lookAheadMeters: 6,
    cooldownSeconds: 18,
    impulsePerMetersPerSecond: 0.9,
    boostBonus: 0.1,
  },
};
