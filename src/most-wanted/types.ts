/**
 * Phase 10 Most Wanted — the NFS Most Wanted–class police-chase + Blacklist system.
 *
 * This module holds the SHARED CONTRACTS only: the heat/bounty/bust state, the police unit
 * and Blacklist-rival shapes, the minimap blips, and the `MostWantedSystem` surface a later
 * milestone implements. Everything here is pure type — no Three.js, no Rapier, no DOM — so
 * the tuning (`src/config/most-wanted.ts`) and the seeded placement
 * (`src/most-wanted/SeededMwPlacement.ts`) build and test against these without a browser.
 *
 * Design decisions this encodes (locked with the owner):
 * - D2: heat runs 1–15; a pursuit's ceiling is 1 + rivals busted (capped at 15).
 * - D3: the career-total bounty gates challenging the next Blacklist rival.
 * - D4: three impound strikes resolve to a fine + repair only — the car is never removed.
 * - D5: hide spots have a limited number of uses per pursuit (anti-camping).
 * - D6: a bust is a free-form hunt-and-destroy race against the rival's car.
 */

/** The nine police unit classes (the NFS MW heat taxonomy). */
export type PoliceUnitKind =
  'sedan' | 'unmarked' | 'motorcycle' | 'van' | 'muscle' | 'suv' | 'rhino' | 'heli' | 'cross';

/** A police tactic a unit can employ against the player. */
export type PoliceTactic =
  'pursuit' | 'ram' | 'roadblock' | 'pit' | 'spike' | 'lock' | 'rhino' | 'searchlight' | 'cross';

/** The live heat state: level, the ceiling this pursuit may climb, and clean-time tracking. */
export interface HeatState {
  /** Current heat level, 1..15 (0 = no active pursuit). */
  readonly level: number;
  /** The ceiling this pursuit can climb to (1 + rivals busted, capped at 15 — D2). */
  readonly ceiling: number;
  /** Accumulated crime that raises the level; decays while the player is clean. */
  readonly crime: number;
  /** True while the player is actively being chased. */
  readonly active: boolean;
  /** Seconds since the player last committed a crime (drives cool-down / evade). */
  readonly cleanSeconds: number;
}

/** The bounty: per busted unit + accrues over pursuit time; the career total gates rivals. */
export interface BountyState {
  /** Cash earned this pursuit (collected on bust or successful evade). */
  readonly currentPursuit: number;
  /** Lifetime bounty — the career total that gates the next Blacklist rival (D3). */
  readonly careerTotal: number;
}

/** A busted (destroyed) police unit that awards its bounty. */
export interface BustedUnit {
  readonly kind: PoliceUnitKind;
  readonly bounty: number;
}

/** The result of a bust (the player was caught). D4: the car is never removed. */
export interface BustResolution {
  /** The fine the player pays (base + per heat level). */
  readonly fine: number;
  /** Impound strikes accumulated (3 → fine + repair only). */
  readonly impoundStrikes: number;
  /** Always false — D4. Kept explicit so callers cannot assume the car can be lost. */
  readonly carRemoved: false;
}

/** Static config for one Blacklist rival (rank 15 = first to challenge, 1 = the boss). */
export interface BlacklistRivalConfig {
  readonly rank: number;
  readonly name: string;
  readonly carId: string;
  /** The car the rival's Pink Slip is stolen into after busting them. */
  readonly pinkSlipCar: string;
  /** The career-total bounty required to challenge this rival (D3). */
  readonly challengeThreshold: number;
}

/** A live Blacklist rival actor during a hunt-and-destroy race (D6). */
export interface RivalActor {
  readonly config: BlacklistRivalConfig;
  /** The rival's car physics body (a Rapier rigid body) while the race is live. */
  readonly body: unknown;
  readonly busted: boolean;
}

/** A minimap blip for the Most Wanted HUD. */
export interface MwBlip {
  readonly x: number;
  readonly z: number;
  readonly kind: 'police' | 'hideSpot' | 'pursuitBreaker' | 'bounty' | 'rival';
  readonly label?: string;
}

/** A single police unit in the active pursuit. */
export interface PoliceUnit {
  readonly id: number;
  readonly kind: PoliceUnitKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly tactic: PoliceTactic;
  /** Seconds until this unit can spawn/act again (reinforcement cadence). */
  readonly readyIn: number;
}

/** One seeded gameplay point on the road (hideout, pursuit-breaker, bounty, police anchor). */
export interface MwPlacementPoint {
  readonly edgeId: string;
  /** Metres from the edge's `from` end. */
  readonly alongMeters: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Road heading (forward = (-sin yaw, -cos yaw), matching the network). */
  readonly yaw: number;
}

/** All the seeded Most Wanted points for one region. */
export interface RegionMwEventSet {
  readonly regionId: string;
  readonly hideSpots: readonly MwPlacementPoint[];
  readonly pursuitBreakers: readonly MwPlacementPoint[];
  readonly bountySpots: readonly MwPlacementPoint[];
  readonly policeAnchors: readonly MwPlacementPoint[];
}

/** Per-category placement tuning. */
export interface MwPlacementConfig {
  /** Candidate-edge radius as a fraction of `REGION_CELL_METERS`. */
  readonly radiusFactor: number;
  readonly minEdgeLengthMeters: number;
  readonly eligibleClasses: readonly string[];
  /** [min, max] seeded count per category, per region. */
  readonly hideSpots: readonly [number, number];
  readonly pursuitBreakers: readonly [number, number];
  readonly bountySpots: readonly [number, number];
  readonly policeAnchors: readonly [number, number];
}

/** The persisted Most Wanted career (localStorage). */
export interface MostWantedSave {
  readonly version: 1;
  /** Ranks busted so far (drives the heat ceiling and the next rival). */
  readonly bustedRanks: readonly number[];
  readonly bountyCareerTotal: number;
  /** Impound strikes (D4: 3 → fine + repair only). */
  readonly impoundStrikes: number;
}

/**
 * The Most Wanted system's public surface (implemented in a later milestone). Declared here
 * so the tuning and placement build and test against the same contract the runtime will use.
 */
export interface MostWantedSystem {
  update(dtSeconds: number): void;
  readonly heat: HeatState;
  readonly bounty: BountyState;
  readonly bustedThisPursuit: readonly BustedUnit[];
  readonly activeRival: RivalActor | null;
  getBlips(): readonly MwBlip[];
  radioMessage(): string | null;
  /** Begin a hunt-and-destroy race with the next eligible Blacklist rival. */
  challengeNextRival(): boolean;
  save(): MostWantedSave;
  load(save: MostWantedSave): void;
  dispose(): void;
}

/** A single police unit's world position for the minimap blips (Milestone 3b). */
export interface PursuitBlip {
  readonly x: number;
  readonly z: number;
  /** True for the helicopter (drawn a different colour from the ground cars). */
  readonly heli: boolean;
}

/**
 * Per-frame pursuit HUD payload (Milestone 3b): the visible squad's blips for the minimap and the
 * state a pursuit bar renders (level / units / taken-out / bust meter / status). Emitted by the
 * `Application`'s `onPursuit` callback.
 */
export interface PursuitHudData {
  readonly phase: 'inactive' | 'pursuit' | 'cooldown';
  readonly level: number;
  readonly activeUnits: number;
  readonly takenOut: number;
  readonly busted: boolean;
  /** 0..1 bust meter (how cornered the player is). */
  readonly bustMeter: number;
  readonly heliActive: boolean;
  /** Bounty accrued this pursuit (Milestone 4a) — kept on evade, forfeited on bust. */
  readonly bounty: number;
  /** Lifetime career-total bounty (gates Blacklist rivals, D3). */
  readonly careerBounty: number;
  readonly blips: readonly PursuitBlip[];
}
