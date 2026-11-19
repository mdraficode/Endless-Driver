/**
 * Phase 10 Most Wanted — Milestone 4b-2: **physical roadblocks + spike strips**, the pure model.
 *
 * `computePursuitTactics` already *places* a roadblock (across the road ahead) and a spike strip
 * (beyond it) as world-space points. This model turns those into committed **physical** traps:
 * the moment one is "laid" it is snapshotted to a fixed world position (so the player can actually
 * drive into it), a hit fires when the player reaches it, and it's cleared after a linger.
 *
 * - **Roadblock** (level 2+): a hard barrier — smashing it is a crime (heat spike) and slams the
 *   brakes. Laid on a `roadblockIntervalSeconds` cadence.
 * - **Spike strip** (level 4+): deflates the tyres — the player slows and can't recover for
 *   `spikeDeflateSeconds`. Laid on a `spikeIntervalSeconds` cadence.
 *
 * Pure: no Three.js / Rapier / DOM, Node-testable. The thin Three.js renderer is `PursuitTraps`.
 */
import { PURSUIT_CONFIG, PURSUIT_TRAPS } from '../config/most-wanted';
import type { PlacementPoint } from './PursuitTactics';

export interface TrapInstance {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Seconds the trap has existed. */
  readonly age: number;
  /** Seconds since the trap was hit (0 = never hit). */
  readonly hitAge: number;
  readonly hit: boolean;
}

export interface TrapState {
  readonly roadblock: TrapInstance | null;
  readonly spikeStrip: TrapInstance | null;
  /** Time until the next roadblock can be laid (s). */
  readonly roadblockTimer: number;
  /** Time until the next spike strip can be laid (s). */
  readonly spikeTimer: number;
}

export interface TrapFrame {
  /** Actively pursuing (not stood down / busted / evaded) — false clears all traps. */
  readonly pursuing: boolean;
  readonly playerX: number;
  readonly playerZ: number;
  readonly dt: number;
  /** World placement point for a roadblock (null when the level's mix has none). */
  readonly roadblockPlacement: PlacementPoint | null;
  /** World placement point for a spike strip (null when the level's mix has none). */
  readonly spikePlacement: PlacementPoint | null;
}

export interface TrapEvents {
  readonly roadblockPlaced: boolean;
  readonly spikePlaced: boolean;
  readonly roadblockHit: boolean;
  readonly spikeHit: boolean;
}

export interface TrapStepResult {
  readonly state: TrapState;
  readonly events: TrapEvents;
}

export function initialTrapState(): TrapState {
  return { roadblock: null, spikeStrip: null, roadblockTimer: 0, spikeTimer: 0 };
}

function makeInstance(p: PlacementPoint): TrapInstance {
  return { x: p.x, z: p.z, yaw: p.yaw, age: 0, hitAge: 0, hit: false };
}

function ageTrap(trap: TrapInstance | null, dt: number): TrapInstance | null {
  if (trap === null) return null;
  const age = trap.age + dt;
  const hitAge = trap.hit ? trap.hitAge + dt : 0;
  const t = PURSUIT_TRAPS;
  // Remove once broken-and-linger, or when it simply expires.
  if ((trap.hit && hitAge >= t.trapHitLingerSeconds) || age >= t.trapLingerSeconds) return null;
  return { x: trap.x, z: trap.z, yaw: trap.yaw, age, hitAge, hit: trap.hit };
}

export function stepTraps(prev: TrapState, frame: TrapFrame): TrapStepResult {
  const t = PURSUIT_TRAPS;
  const events = {
    roadblockPlaced: false,
    spikePlaced: false,
    roadblockHit: false,
    spikeHit: false,
  };

  // Stood down / busted / evaded: the traps are cleared (the squad stands down with them).
  if (!frame.pursuing) return { state: initialTrapState(), events };

  let roadblock = ageTrap(prev.roadblock, frame.dt);
  let spikeStrip = ageTrap(prev.spikeStrip, frame.dt);
  let roadblockTimer = Math.max(0, prev.roadblockTimer - frame.dt);
  let spikeTimer = Math.max(0, prev.spikeTimer - frame.dt);

  // Lay new traps at their fixed snapshot position when the mix calls for one and it's due.
  if (roadblock === null && roadblockTimer <= 0 && frame.roadblockPlacement !== null) {
    roadblock = makeInstance(frame.roadblockPlacement);
    roadblockTimer = PURSUIT_CONFIG.roadblockIntervalSeconds;
    events.roadblockPlaced = true;
  }
  if (spikeStrip === null && spikeTimer <= 0 && frame.spikePlacement !== null) {
    spikeStrip = makeInstance(frame.spikePlacement);
    spikeTimer = PURSUIT_CONFIG.spikeIntervalSeconds;
    events.spikePlaced = true;
  }

  // Hit detection: the player reaches a live, not-yet-hit trap.
  const reaches = (trap: TrapInstance | null, radius: number): boolean =>
    trap !== null &&
    !trap.hit &&
    Math.hypot(trap.x - frame.playerX, trap.z - frame.playerZ) <= radius;

  if (reaches(roadblock, t.roadblockHitRadiusMeters)) {
    roadblock = { ...roadblock!, hit: true, hitAge: 0 };
    events.roadblockHit = true;
  }
  if (reaches(spikeStrip, t.spikeHitRadiusMeters)) {
    spikeStrip = { ...spikeStrip!, hit: true, hitAge: 0 };
    events.spikeHit = true;
  }

  return { state: { roadblock, spikeStrip, roadblockTimer, spikeTimer }, events };
}
