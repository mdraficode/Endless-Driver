/**
 * Phase 10 Most Wanted — the police **pursuit brain**. Pure decision logic (Node-testable, no
 * Three.js / Rapier / DOM). This is the "recon → rebuild" core of Milestone 3: it decides the
 * pursuit's phase, the escalating unit roster, detection / lost-sight / cooldown, reinforcements,
 * the bust, and it emits the signals the heat model consumes (`policeDetected`, `rammed`) plus
 * authentic dispatch toasts.
 *
 * The *physical* layer (spawning Rapier units, steering them, placing real roadblocks / spike
 * strips, rendering the pursuit bar) reads this brain's output and feeds it back real
 * `nearestUnitMeters` / `playerBoxed` / `disabledUnitKind`. Until that lands, the "V" dev toggle
 * drives `debugPolice` so the brain runs in a stand-in detection mode.
 *
 * Faithful to NFS Most Wanted (2005) — see `docs/NFS_MW_PURSUIT_RECON.md`.
 */
import {
  BUST_CONFIG,
  EVADE_CONFIG,
  PURSUIT_CONFIG,
  policeMixForLevel,
  type PoliceMix,
} from '../config/most-wanted';
import type { PoliceTactic, PoliceUnitKind } from './types';
import type { RadioMessage } from './HeatModel';

export type PursuitPhase = 'inactive' | 'pursuit' | 'cooldown';

/** A logical police unit the brain is tracking (position/steering live in the render layer). */
export interface RosterUnit {
  readonly id: number;
  readonly kind: PoliceUnitKind;
  readonly tactic: PoliceTactic;
}

/** The brain's state. Immutable per tick; a fresh object is returned each step. */
export interface PursuitState {
  readonly phase: PursuitPhase;
  readonly units: readonly RosterUnit[];
  /** Police units the player has disabled this pursuit. */
  readonly takenOut: number;
  readonly busted: boolean;
  readonly roadblockArmed: boolean;
  readonly spikeArmed: boolean;
  readonly heliActive: boolean;
  /** Seconds the player has been out of sight (drives the lost-sight → cooldown transition). */
  readonly lostTimer: number;
  /** 0..1 bust meter (boxed + slow fills it; 1 = busted). */
  readonly bustMeter: number;
  readonly spawnTimer: number;
  readonly nextId: number;
  /** The heat level last seen (for escalation detection). */
  readonly lastLevel: number;
}

/** Per-tick inputs. Positions are abstracted to a nearest-unit distance + a boxed flag. */
export interface PursuitFrame {
  /** Current heat level (from the heat model). */
  readonly level: number;
  /** Hard cap on concurrent ground units (from the quality tier). */
  readonly maxUnits: number;
  /** Hard cap on helicopters. */
  readonly maxHelicopters: number;
  readonly dt: number;
  /** Player speed (m/s). */
  readonly playerSpeedMps: number;
  /** True while the player is inside a hiding spot (cannot be detected). */
  readonly inHideSpot: boolean;
  /** Distance (m) to the closest active unit; Number.POSITIVE_INFINITY when none. */
  readonly nearestUnitMeters: number;
  /** True while the player is boxed in by units (feeds the bust meter). */
  readonly playerBoxed: boolean;
  /** The kind of unit the player disabled this tick, or null. */
  readonly disabledUnitKind: PoliceUnitKind | null;
  /** Stand-in detection (the "V" dev toggle) until real units report distance. */
  readonly debugPolice: boolean;
  /**
   * A pursuit is in play (heat raised) even before any cop is in detect range. Starts an
   * `inactive` pursuit (so units can spawn and close in) without re-acquiring from cooldown —
   * the evade mechanic is still driven purely by `nearestUnitMeters` / `inHideSpot`.
   */
  readonly engaged?: boolean;
}

/** What the brain reports back this tick (feeds the heat model + HUD). */
export interface PursuitSignals {
  /** True while a unit is actively on the player (→ heat model `policeDetected`). */
  readonly policeDetected: boolean;
  /** True this tick if the player disabled (rammed) a police unit (→ heat model `rammed`). */
  readonly ramed: boolean;
  readonly phase: PursuitPhase;
  readonly activeUnits: number;
  readonly takenOut: number;
  readonly busted: boolean;
  readonly roadblockArmed: boolean;
  readonly spikeArmed: boolean;
  readonly heliActive: boolean;
  readonly message: RadioMessage | null;
}

/** Spawn/remove priority: lower = more basic (spawned first), higher = heavy (removed first). */
const RANK: Record<PoliceUnitKind, number> = {
  sedan: 0,
  unmarked: 1,
  motorcycle: 2,
  van: 3,
  suv: 3,
  muscle: 4,
  heli: 5,
  rhino: 6,
  cross: 7,
};

export function initialPursuitState(): PursuitState {
  return {
    phase: 'inactive',
    units: [],
    takenOut: 0,
    busted: false,
    roadblockArmed: false,
    spikeArmed: false,
    heliActive: false,
    lostTimer: 0,
    bustMeter: 0,
    spawnTimer: 0,
    nextId: 1,
    lastLevel: 0,
  };
}

/** The effective per-kind target for a level, capped by the tier limits. */
function targetFor(
  mix: PoliceMix,
  maxUnits: number,
  maxHelicopters: number,
): Record<PoliceUnitKind, number> {
  const target = { ...mix.counts };
  target.heli =
    mix.helicopter && maxHelicopters > 0 ? Math.min(mix.counts.heli, maxHelicopters) : 0;
  // Cap the ground total by maxUnits, trimming the heaviest ground units first.
  const groundKinds = (Object.keys(target) as PoliceUnitKind[]).filter((k) => k !== 'heli');
  let ground = groundKinds.reduce((sum, k) => sum + target[k], 0);
  while (ground > maxUnits) {
    const heaviest = groundKinds.filter((k) => target[k] > 0).sort((a, b) => RANK[b] - RANK[a])[0];
    if (!heaviest) break;
    target[heaviest] -= 1;
    ground -= 1;
  }
  return target;
}

/** The lowest-priority kind still below its target (spawned next), or null if at target. */
function nextSpawnKind(
  units: readonly RosterUnit[],
  target: Readonly<Record<PoliceUnitKind, number>>,
): PoliceUnitKind | null {
  const counts = countByKind(units);
  const candidates = (Object.keys(target) as PoliceUnitKind[]).filter((k) => target[k] > counts[k]);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => RANK[a] - RANK[b])[0] ?? null;
}

function removeExcess(
  units: RosterUnit[],
  target: Readonly<Record<PoliceUnitKind, number>>,
): RosterUnit[] {
  const out = units.slice();
  const counts = countByKind(out);
  // Remove over-target kinds, heaviest first.
  const order = (Object.keys(target) as PoliceUnitKind[]).sort((a, b) => RANK[b] - RANK[a]);
  for (const kind of order) {
    while (counts[kind] > (target[kind] ?? 0)) {
      const idx = out.findIndex((u) => u.kind === kind);
      if (idx < 0) break;
      out.splice(idx, 1);
      counts[kind] -= 1;
    }
  }
  // If still over the total (cap shrank), drop the heaviest remaining units.
  const totalTarget = (Object.keys(target) as PoliceUnitKind[]).reduce((s, k) => s + target[k], 0);
  while (out.length > totalTarget) {
    let heaviest = 0;
    for (let i = 1; i < out.length; i += 1) {
      if (RANK[out[i]!.kind] > RANK[out[heaviest]!.kind]) heaviest = i;
    }
    out.splice(heaviest, 1);
  }
  return out;
}

function countByKind(units: readonly RosterUnit[]): Record<PoliceUnitKind, number> {
  const counts: Record<PoliceUnitKind, number> = {
    sedan: 0,
    unmarked: 0,
    motorcycle: 0,
    van: 0,
    muscle: 0,
    suv: 0,
    rhino: 0,
    heli: 0,
    cross: 0,
  };
  for (const u of units) counts[u.kind] += 1;
  return counts;
}

function tacticFor(kind: PoliceUnitKind, mix: PoliceMix): PoliceTactic {
  if (kind === 'rhino') return 'rhino';
  if (kind === 'cross') return 'cross';
  if (kind === 'heli') return 'searchlight';
  if (mix.tactics.includes('pit')) return 'pit';
  if (mix.tactics.includes('ram')) return 'ram';
  return 'pursuit';
}

export interface PursuitStepResult {
  readonly state: PursuitState;
  readonly signals: PursuitSignals;
}

/** Advance the pursuit brain by `dt`. Pure: same (state, frame) → same result. */
export function stepPursuit(prev: PursuitState, frame: PursuitFrame): PursuitStepResult {
  const dt = Number.isFinite(frame.dt) ? Math.max(0, frame.dt) : 0;
  const p = PURSUIT_CONFIG;
  const mix = policeMixForLevel(frame.level);
  const target = targetFor(mix, frame.maxUnits, frame.maxHelicopters);
  const totalTarget = (Object.keys(target) as PoliceUnitKind[]).reduce((s, k) => s + target[k], 0);

  let units = prev.units.slice();
  let takenOut = prev.takenOut;
  let busted = prev.busted;
  let phase: PursuitPhase = prev.phase;
  let lostTimer = prev.lostTimer;
  let bustMeter = prev.bustMeter;
  let spawnTimer = prev.spawnTimer;
  let roadblockArmed = prev.roadblockArmed;
  let spikeArmed = prev.spikeArmed;
  // Both pursuit branches below assign this unconditionally.
  let heliActive: boolean;
  let nextId = prev.nextId;
  let message: RadioMessage | null = null;

  const detected =
    frame.debugPolice ||
    (!frame.inHideSpot && frame.nearestUnitMeters <= EVADE_CONFIG.detectRadiusMeters);

  // 1. Bust meter: boxed in + slow fills it; breaking free drains it.
  if (!busted && frame.playerBoxed && frame.playerSpeedMps < BUST_CONFIG.maxSpeedMps) {
    bustMeter = Math.min(1, bustMeter + BUST_CONFIG.fillPerSecond * dt);
  } else {
    bustMeter = Math.max(0, bustMeter - BUST_CONFIG.drainPerSecond * dt);
  }
  if (!busted && bustMeter >= 1) {
    busted = true;
    message = {
      kind: 'busted',
      text: 'Dispatch: 10-32, wanted racer — the racer has been apprehended.',
    };
  }

  // 2. Phase machine (heat level + detection drive it).
  if (frame.level <= 0) {
    if (phase !== 'inactive') {
      phase = 'inactive';
      units = [];
    }
    lostTimer = 0;
  } else if (detected) {
    if (phase === 'cooldown') {
      phase = 'pursuit';
      message ??= {
        kind: 'reacquired',
        text: 'Dispatch: 10-87, in pursuit — we have reacquired the racer.',
      };
    } else if (phase === 'inactive') {
      phase = 'pursuit';
    }
    lostTimer = 0;
  } else if (phase === 'inactive' && (frame.engaged ?? false)) {
    // Bootstrap: heat is raised (pursuit engaged) but no cop is in detect range yet — start the
    // pursuit so units spawn and close in. Deliberately NOT `detected`, so this neither resets the
    // "lost" timer nor re-acquires from cooldown (evading still works).
    phase = 'pursuit';
  } else if (phase === 'pursuit') {
    lostTimer += dt;
    if (lostTimer >= EVADE_CONFIG.lostHoldSeconds) {
      phase = 'cooldown';
      message ??= {
        kind: 'evading',
        text: 'Dispatch: 10-83, we have lost the racer — eyes on, on the lookout.',
      };
    }
  }

  // 3. Escalation radio — a new tactic class appears as the level rises.
  if (frame.level > prev.lastLevel && phase === 'pursuit') {
    const before = policeMixForLevel(prev.lastLevel);
    if (mix.helicopter && !before.helicopter)
      message ??= {
        kind: 'heli',
        text: 'Dispatch: 10-71, Eagle 1 is airborne — the racer is on our screen.',
      };
    else if (mix.spikeStrips && !before.spikeStrips)
      message ??= {
        kind: 'spike',
        text: 'Dispatch: 10-67, spike strip deployed on the road ahead.',
      };
    else if (mix.counts.rhino > 0 && before.counts.rhino === 0)
      message ??= {
        kind: 'rhino',
        text: 'Dispatch: 10-44, calling for Rhinos — armored SUV responding head-on.',
      };
    else if (mix.roadblocks && !before.roadblocks)
      message ??= {
        kind: 'roadblock',
        text: 'Dispatch: 10-73, a stationary roadblock is staged ahead.',
      };
    else if (mix.counts.cross > 0 && before.counts.cross === 0)
      message ??= {
        kind: 'cross',
        text: 'Dispatch: the Street Racing Unit is engaged. High-priority stop.',
      };
  }

  // 4. Unit lifecycle.
  const inPursuit = phase === 'pursuit' && !busted && frame.level >= 1;

  if (frame.disabledUnitKind !== null && units.length > 0) {
    const idx = units.findIndex((u) => u.kind === frame.disabledUnitKind);
    units.splice(idx >= 0 ? idx : 0, 1);
    takenOut += 1;
    message ??= { kind: 'unitDown', text: 'Dispatch: 10-25, one of our units has been taken out.' };
  }

  if (inPursuit) {
    // Backup radio: this tick the roster dropped to the minimum (e.g. you rammed units off).
    if (units.length <= p.reinforceMinUnits && prev.units.length > p.reinforceMinUnits) {
      message ??= {
        kind: 'backup',
        text: 'Dispatch: 10-33, requesting backup — additional units rolling in.',
      };
    }
    // Spawn toward the target on a cadence.
    spawnTimer -= dt;
    if (spawnTimer <= 0 && units.length < totalTarget) {
      const kind = nextSpawnKind(units, target);
      if (kind) {
        units = units.concat({ id: nextId, kind, tactic: tacticFor(kind, mix) });
        nextId += 1;
        spawnTimer = p.spawnIntervalSeconds;
      } else {
        spawnTimer = 0;
      }
    } else if (units.length >= totalTarget) {
      spawnTimer = 0;
    }
    // Trim when the level dropped (target shrank).
    if (units.length > totalTarget) units = removeExcess(units, target);
    roadblockArmed = mix.roadblocks;
    spikeArmed = mix.spikeStrips;
    heliActive = target.heli > 0 && units.some((u) => u.kind === 'heli');
  } else {
    spawnTimer = p.spawnIntervalSeconds;
    if (phase !== 'pursuit') {
      roadblockArmed = false;
      spikeArmed = false;
    }
    heliActive = false;
  }

  const policeDetected =
    phase === 'pursuit' && !busted && (detected || lostTimer < EVADE_CONFIG.lostHoldSeconds);
  const ramed = frame.disabledUnitKind !== null;

  const state: PursuitState = {
    phase,
    units: units.slice(),
    takenOut,
    busted,
    roadblockArmed,
    spikeArmed,
    heliActive,
    lostTimer,
    bustMeter,
    spawnTimer,
    nextId,
    lastLevel: frame.level,
  };
  const signals: PursuitSignals = {
    policeDetected,
    ramed,
    phase,
    activeUnits: units.length,
    takenOut,
    busted,
    roadblockArmed,
    spikeArmed,
    heliActive,
    message,
  };
  return { state, signals };
}
