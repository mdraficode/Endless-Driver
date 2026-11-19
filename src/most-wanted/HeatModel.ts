/**
 * Phase 10 Most Wanted — the heat (wanted) state machine. Pure logic: Node-testable, no
 * Three.js / Rapier / DOM.
 *
 * Faithful to NFS Most Wanted (2005):
 * - A crime while clean (speeding, ramming, colliding) pulls a **911** and starts the pursuit.
 * - While **chased** (police detecting you), the 0..1 meter fills — faster at higher heat, and
 *   at high heat it stalls unless you keep committing infractions (level 1 climbs from being
 *   chased alone).
 * - Once you **lose the police** you **cool down**: the level decays, faster at low heat and
 *   much faster when stopped / engine off.
 * - The **ceiling** is gated by Blacklist progress (D2: 1 + rivals busted, capped at 15).
 *
 * The driving system supplies `speedMps`/`stationary`/crimes; the police system (a later
 * milestone) supplies `policeDetected` (whether any unit is currently on you).
 */
import { HEAT_CONFIG, HEAT_LEVELS } from '../config/most-wanted';

/** Per-update inputs to the heat model. */
export interface HeatInput {
  /** Player speed in m/s. */
  readonly speedMps: number;
  /** True if the player is stopped / engine off (speeds up cool-down). */
  readonly stationary: boolean;
  /** True this tick if the player rammed a police unit. */
  readonly ramed: boolean;
  /** True this tick if the player had a (non-police) collision. */
  readonly collided: boolean;
  /** True if any police unit is currently detecting / chasing the player. */
  readonly policeDetected: boolean;
  /** Rivals busted so far (drives the ceiling — D2). */
  readonly rivalsBusted: number;
}

/** The heat state. */
export interface HeatState {
  /** 0 = no pursuit; 1..15 = active heat level. */
  readonly level: number;
  /** 0..1 progress toward the next heat level (when active). */
  readonly heat: number;
  /** The ceiling this pursuit may climb to (D2). */
  readonly ceiling: number;
  readonly active: boolean;
  /** True while the police have lost the player and the level is decaying. */
  readonly evading: boolean;
  /** Seconds since the last ram/collision (keeps fill activity at 1.0). */
  readonly recentCrimeSeconds: number;
}

/**
 * A police-radio dispatch toast. Shared by the heat model (911 / level / evade) and the pursuit
 * brain (escalation / busted / backup), so the HUD has one shape for every radio call.
 */
export type RadioKind =
  // heat model
  | 'alert911'
  | 'levelUp'
  | 'evading'
  | 'evaded'
  // pursuit brain (NFS MW radio codes)
  | 'roadblock'
  | 'rhino'
  | 'heli'
  | 'spike'
  | 'cross'
  | 'backup'
  | 'unitDown'
  | 'busted'
  | 'reacquired';

/** A radio dispatch toast the model emits this tick. */
export interface RadioMessage {
  readonly kind: RadioKind;
  readonly text: string;
}

/** The pursuit ceiling (D2: 1 + rivals busted, capped at HEAT_LEVELS). */
export function computeCeiling(rivalsBusted: number): number {
  return Math.min(HEAT_LEVELS, HEAT_CONFIG.ceilingBase + rivalsBusted);
}

export function initialHeatState(): HeatState {
  return {
    level: 0,
    heat: 0,
    ceiling: HEAT_CONFIG.ceilingBase,
    active: false,
    evading: false,
    recentCrimeSeconds: 0,
  };
}

/** A dispatch line for a heat-level rise (original, in-game scanner style). */
function levelRadioLine(level: number): string {
  if (level >= 13)
    return 'Dispatch: maximum heat. This is a high-priority pursuit — all units, respond.';
  if (level >= 10) return 'Dispatch: heat rising fast. Requesting heavy units and backup.';
  if (level >= 6) return 'Dispatch: suspect is escalating. Reinforcements en route.';
  if (level >= 3) return 'Dispatch: unit, suspect is evading. Tighten the net.';
  return 'Dispatch: suspect speeding. Requesting additional units.';
}

export interface HeatStepResult {
  readonly state: HeatState;
  /** The radio toast emitted this tick, if any. */
  readonly message: RadioMessage | null;
}

/**
 * Advance the heat state by `dtSeconds`. Pure: same (state, input, dt) → same output.
 * Emits at most one radio message per tick.
 */
export function stepHeat(state: HeatState, input: HeatInput, dtSeconds: number): HeatStepResult {
  const c = HEAT_CONFIG;
  const ceiling = computeCeiling(input.rivalsBusted);
  const speeding = input.speedMps > c.speedCrimeThresholdMps;
  const crime = speeding || input.ramed || input.collided;

  let level = state.level;
  let heat = state.heat;
  let active = state.active;
  let evading: boolean;
  let recentCrimeSeconds = Math.max(0, state.recentCrimeSeconds - dtSeconds);
  let message: RadioMessage | null = null;

  // Discrete crime heat + the recent-crime activity window.
  if (input.ramed) {
    heat += c.ramCrimeHeat;
    recentCrimeSeconds = c.recentCrimeWindowSeconds;
  }
  if (input.collided) {
    heat += c.collisionCrimeHeat;
    recentCrimeSeconds = Math.max(recentCrimeSeconds, c.recentCrimeWindowSeconds);
  }

  // 911: a crime while clean pulls the police and starts the pursuit at level 1.
  if (level === 0 && crime) {
    return {
      state: {
        level: 1,
        heat: Math.max(0.15, heat),
        ceiling,
        active: true,
        evading: false,
        recentCrimeSeconds,
      },
      message: {
        kind: 'alert911',
        text: 'Dispatch: vehicle spotted committing a traffic violation. 1-0-911, respond.',
      },
    };
  }

  if (level <= 0) {
    // No pursuit: no heat to carry.
    return {
      state: { level: 0, heat: 0, ceiling, active: false, evading: false, recentCrimeSeconds: 0 },
      message: null,
    };
  }

  if (input.policeDetected) {
    // Being chased: the meter fills. Faster at higher heat; stalls at high heat unless you keep infractions.
    const wasEvading = state.evading;
    evading = false;
    const cleanActivity = Math.max(c.cleanFloorActivity, 1 - (level - 1) * c.perLevelActivityDecay);
    const activity = recentCrimeSeconds > 0 || speeding ? 1 : cleanActivity;
    const fillRate = c.baseFillRate * (1 + (level - 1) * c.perLevelFillBoost) * activity;
    heat += fillRate * dtSeconds;
    while (heat >= 1 && level < ceiling) {
      heat -= 1;
      level += 1;
      message = { kind: 'levelUp', text: levelRadioLine(level) };
    }
    if (heat >= 1) heat = 1; // at the ceiling: hold full
    if (wasEvading) {
      // The police regained you mid-cooldown: the level re-rises, so note it.
      message = message ?? {
        kind: 'levelUp',
        text: 'Dispatch: target reacquired. Resuming pursuit.',
      };
    }
  } else {
    // The police lost you: cool down. The level decays, faster at low heat / when stopped.
    const wasEvading = state.evading;
    evading = true;
    let coolRate = c.coolDownFillPerSecond;
    if (level < c.coolDownFastBelowLevel) coolRate *= c.coolDownFastMultiplier;
    if (input.stationary) coolRate *= c.stationaryCoolDownMultiplier;
    heat -= coolRate * dtSeconds;
    while (heat <= 0 && level > 0) {
      heat += 1;
      level -= 1;
    }
    if (level === 0) {
      heat = 0;
      active = false;
      evading = false;
      message = { kind: 'evaded', text: 'Dispatch: target has evaded. Pursuit stood down.' };
    } else if (!wasEvading) {
      message = {
        kind: 'evading',
        text: 'Dispatch: we have lost sight of the target. Switching to search.',
      };
    }
  }

  return { state: { level, heat, ceiling, active, evading, recentCrimeSeconds }, message };
}
