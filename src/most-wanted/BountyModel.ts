/**
 * Phase 10 Most Wanted — the **bounty + busted-resolution** model (Milestone 4a). Pure +
 * unit-tested. Captures the NFS Most Wanted (2005) cash loop:
 *
 * - The bounty **accrues** during an active pursuit (a rate per second, faster feel at higher
 *   heat) and jumps when you disable a police unit (per-class bounty).
 * - **Evade** (shake the heat): you **keep** the bounty → it is added to your **career total**,
 *   which gates the next Blacklist rival (D3).
 * - **Busted**: you pay a **fine** (base + per heat level, + impound fine at the strike cap) and
 *   take an **impound strike**; the car is **never removed** (D4). The bounty is forfeited.
 *
 * The config constants live in `src/config/most-wanted.ts` (`BOUNTY_CONFIG`, `BUST_CONFIG`); the
 * state shapes in `./types.ts`. This module is the decision layer the `Application` advances each
 * tick and settles when a pursuit ends.
 */
import { BOUNTY_CONFIG, BUST_CONFIG } from '../config/most-wanted';
import type { BountyState, BustedUnit, BustResolution, PoliceUnitKind } from './types';

export function initialBountyState(): BountyState {
  return { currentPursuit: 0, careerTotal: 0 };
}

/** Per-frame bounty inputs. */
export interface BountyStepFrame {
  /** True while a pursuit is actively chasing (accrues the per-second bounty). */
  readonly inPursuit: boolean;
  readonly level: number;
  readonly dt: number;
  /** A police unit the player disabled this tick (adds its per-class bounty), or null. */
  readonly disabledUnit: PoliceUnitKind | null;
}

export interface BountyStepResult {
  readonly state: BountyState;
  /** The unit just added to the "busted this pursuit" list, or null. */
  readonly bustedUnit: BustedUnit | null;
}

/** Advance the bounty: accrue over time while being chased + add a disabled unit's bounty. */
export function stepBounty(prev: BountyState, frame: BountyStepFrame): BountyStepResult {
  let currentPursuit = prev.currentPursuit;
  if (frame.inPursuit && frame.level > 0 && frame.dt > 0) {
    currentPursuit += BOUNTY_CONFIG.pursuitRatePerSecond * frame.dt;
  }
  let bustedUnit: BustedUnit | null = null;
  if (frame.disabledUnit !== null) {
    const bounty = BOUNTY_CONFIG.unitBounty[frame.disabledUnit];
    currentPursuit += bounty;
    bustedUnit = { kind: frame.disabledUnit, bounty };
  }
  return { state: { currentPursuit, careerTotal: prev.careerTotal }, bustedUnit };
}

export type PursuitOutcome = 'busted' | 'evaded';

export interface BountySettleResult {
  readonly outcome: PursuitOutcome;
  readonly state: BountyState;
  readonly fine: number;
  readonly bountyKept: number;
  readonly bountyLost: number;
  readonly impoundStrikes: number;
  readonly careerTotal: number;
  /** Always false (D4: the car is never removed). Kept explicit. */
  readonly carRemoved: false;
  readonly resolution: BustResolution | null;
  /** A human-readable result line for the HUD/toast. */
  readonly message: string;
}

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** Settle the end of a pursuit (bust or evade). Returns the new state + the outcome detail. */
export function settleBounty(
  prev: BountyState,
  outcome: PursuitOutcome,
  level: number,
  impoundStrikes: number,
): BountySettleResult {
  const accrued = Math.round(prev.currentPursuit);

  if (outcome === 'evaded') {
    // D3: evading keeps the bounty → it joins the career total (gates the next rival).
    const careerTotal = prev.careerTotal + accrued;
    return {
      outcome,
      state: { currentPursuit: 0, careerTotal },
      fine: 0,
      bountyKept: accrued,
      bountyLost: 0,
      impoundStrikes,
      careerTotal,
      carRemoved: false,
      resolution: null,
      message:
        accrued > 0
          ? `You shook the heat — bounty kept ${money(accrued)} (career ${money(careerTotal)}).`
          : 'You shook the heat. Pursuit ended.',
    };
  }

  // Busted: D4 — fine (base + per level, + impound fine at the strike cap) + impound strike,
  // the car is never removed, and the bounty is forfeited.
  const strikes = impoundStrikes + 1;
  let fine = BUST_CONFIG.baseFine + BUST_CONFIG.finePerLevel * Math.max(0, level);
  if (strikes >= BUST_CONFIG.impoundStrikesMax) fine += BUST_CONFIG.impoundFine;
  return {
    outcome,
    state: { currentPursuit: 0, careerTotal: prev.careerTotal },
    fine,
    bountyKept: 0,
    bountyLost: accrued,
    impoundStrikes: strikes,
    careerTotal: prev.careerTotal,
    carRemoved: false,
    resolution: { fine, impoundStrikes: strikes, carRemoved: false },
    message: `Busted — fine ${money(fine)} (strike ${strikes}/${BUST_CONFIG.impoundStrikesMax}); ${money(
      accrued,
    )} bounty forfeited.`,
  };
}
