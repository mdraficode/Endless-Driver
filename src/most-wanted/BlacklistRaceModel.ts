/**
 * Phase 10 Most Wanted — Milestone 5a: the **Blacklist hunt-&-destroy race**, the pure outcome
 * model.
 *
 * A Blacklist race (NFS Most Wanted 2005): you race one of the 15 Blacklist rivals down a route.
 * Police are on you the whole way (the pursuit/heat system, at a level set by the rival — wired
 * in a later increment, here fed in as `busted`). You **win** by reaching the finish ahead of the
 * rival and take their pink slip; you **lose** if the rival finishes first, if you get busted, or
 * if the clock runs out.
 *
 * The rival's progress is modelled here (a rolling start + a steady cruise speed, some rivals get
 * a head start). The player's progress is *fed in* each frame (the Application measures it from
 * the player's position along the route). Pure: no Three.js / Rapier / DOM, Node-testable.
 */

export type BlacklistRacePhase = 'countdown' | 'racing' | 'won' | 'lost';

export interface BlacklistRaceConfig {
  /** Total route length (m). Progress is 0..1 over this. */
  readonly routeLengthMeters: number;
  /** The race clock (s) — run it out and you lose. */
  readonly timeLimitSeconds: number;
  /** The rival's steady speed along the route (m/s). */
  readonly rivalCruiseSpeedMps: number;
  /** The rival's running start, in metres ahead of the player (0 = rolling start). */
  readonly rivalHeadStartMeters: number;
  /** Seconds of countdown before the race starts. */
  readonly countdownSeconds: number;
}

export interface BlacklistRaceState {
  readonly phase: BlacklistRacePhase;
  readonly elapsedSeconds: number;
  readonly remainingSeconds: number;
  /** Seconds of countdown left (countdown phase only). */
  readonly countdownRemaining: number;
  /** 0..1 — how far the rival is along the route (computed). */
  readonly rivalProgress: number;
  /** 0..1 — the player's most recent progress along the route. */
  readonly playerProgress: number;
}

export interface BlacklistRaceFrame {
  readonly dt: number;
  /** 0..1 — the player's current progress along the route. */
  readonly playerProgress: number;
  /** The player was busted by the police this frame (from the pursuit/heat system). */
  readonly busted: boolean;
}

export interface BlacklistRaceResult {
  readonly state: BlacklistRaceState;
  /** The race just ended this frame (null while still running). */
  readonly outcome: 'won' | 'lost' | null;
}

/** A sensible default race; M5b scales these per rival rank (higher rivals = longer/tougher). */
export const DEFAULT_BLACKLIST_RACE: BlacklistRaceConfig = {
  routeLengthMeters: 6000,
  timeLimitSeconds: 360,
  rivalCruiseSpeedMps: 34,
  rivalHeadStartMeters: 0,
  countdownSeconds: 3,
};

export function initialBlacklistRaceState(config: BlacklistRaceConfig): BlacklistRaceState {
  const headProgress = Math.min(1, config.rivalHeadStartMeters / config.routeLengthMeters);
  return {
    phase: 'countdown',
    elapsedSeconds: 0,
    remainingSeconds: config.timeLimitSeconds,
    countdownRemaining: config.countdownSeconds,
    rivalProgress: headProgress,
    playerProgress: 0,
  };
}

function rivalProgressAt(config: BlacklistRaceConfig, racingSeconds: number): number {
  const distance = config.rivalHeadStartMeters + racingSeconds * config.rivalCruiseSpeedMps;
  return Math.min(1, distance / config.routeLengthMeters);
}

export function stepBlacklistRace(
  config: BlacklistRaceConfig,
  prev: BlacklistRaceState,
  frame: BlacklistRaceFrame,
): BlacklistRaceResult {
  // Once finished, the race is over (idempotent).
  if (prev.phase === 'won' || prev.phase === 'lost') {
    return { state: prev, outcome: null };
  }

  // Countdown: nothing moves, the clock is stopped.
  if (prev.phase === 'countdown') {
    const countdownRemaining = Math.max(0, prev.countdownRemaining - frame.dt);
    if (countdownRemaining > 0) {
      return {
        state: {
          ...prev,
          phase: 'countdown',
          countdownRemaining,
          playerProgress: frame.playerProgress,
        },
        outcome: null,
      };
    }
    // GO — begin racing from the rolling start.
    return {
      state: {
        ...prev,
        phase: 'racing',
        countdownRemaining: 0,
        playerProgress: frame.playerProgress,
      },
      outcome: null,
    };
  }

  // Racing: advance the clock + the rival, then resolve the outcome.
  const elapsedSeconds = prev.elapsedSeconds + frame.dt;
  const remainingSeconds = Math.max(0, config.timeLimitSeconds - elapsedSeconds);
  const rivalProgress = rivalProgressAt(config, elapsedSeconds - config.countdownSeconds);
  const playerProgress = Math.max(0, Math.min(1, frame.playerProgress));

  let phase: BlacklistRacePhase = 'racing';
  let outcome: 'won' | 'lost' | null = null;
  // Win by reaching the finish first. (A dead heat favours the player.)
  if (playerProgress >= 1) {
    phase = 'won';
    outcome = 'won';
  } else if (frame.busted) {
    phase = 'lost';
    outcome = 'lost';
  } else if (rivalProgress >= 1) {
    phase = 'lost';
    outcome = 'lost';
  } else if (remainingSeconds <= 0) {
    phase = 'lost';
    outcome = 'lost';
  }

  return {
    state: {
      phase,
      elapsedSeconds,
      remainingSeconds,
      countdownRemaining: 0,
      rivalProgress,
      playerProgress,
    },
    outcome,
  };
}
