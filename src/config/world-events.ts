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

/**
 * Phase 10.5 pass B — AI traffic driving behavior (overtaking + player-aware following).
 * The WGSL kernel and the CPU shadow must apply these identically; both read from here.
 */
export const TRAFFIC_BEHAVIOR = {
  /** Own-lane leader gap (m) at which a vehicle considers moving out to pass. */
  overtakeTriggerGapMeters: 20,
  /** Adjacent-lane leader gap (m) required to consider that lane clear ahead. */
  overtakeLeaderClearMeters: 38,
  /** Adjacent-lane follower gap (m) required to consider that lane clear behind. */
  overtakeFollowerClearMeters: 16,
  /** Minimum speed (m/s) to attempt a lane change (queues at a standstill hold position). */
  overtakeMinSpeedMetersPerSecond: 2.5,
  /** Seconds during which no further lane change is attempted (anti-oscillation). */
  laneChangeCooldownSeconds: 7,
  /** Lateral approach rate for the lane transition (m/s; ~2.9 s across two lanes). */
  laneChangeRateMetersPerSecond: 0.8,
  /** Lateral distance (m) below which the transition is considered settled. */
  laneChangeSettleMeters: 0.12,
  /** Player influence: how far ahead along the route the player matters (m). */
  playerAheadMaxMeters: 42,
  /**
   * Player influence: nearer than this (m) the gap formula already resolves to a clean
   * stop at the bumper gap, so the window extends to near-zero instead of handing the
   * car back to full cruise a metre from the player.
   */
  playerAheadMinMeters: 0.2,
  /** Lateral distance (m) from the centreline for the player to count as on the route. */
  playerRouteLateralToleranceMeters: 3.0,
  /** Player half-length (m) used in the bumper-gap math. */
  playerHalfLengthMeters: 1.3,
  /** Speed recovery (m/s) gained across the full gap band when following the player. */
  playerRecoveryMetersPerSecond: 6,
  /**
   * Phase 12.2 — driver personality: patience multiplies the car-following gaps
   * (impatient cars crowd, patient cars leave air). Deterministic per vehicle slot.
   */
  personalityPatienceMin: 0.75,
  personalityPatienceMax: 1.35,
  /**
   * Phase 12.2 — driver personality: aggressiveness multiplies the overtake trigger
   * gap (aggressive drivers pass sooner, cautious ones wait). Deterministic per slot.
   */
  personalityAggressionMin: 0.7,
  personalityAggressionMax: 1.4,
  /**
   * Phase 12.2 — player-obstacle braking: a world-space forward cone. Traffic brakes
   * for the player here even when the player is off the route line (the on-route
   * leader pass projects onto the centreline and misses them there).
   */
  playerObstacleMaxMeters: 30,
  playerObstacleLateralMeters: 3.5,
} as const;

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
