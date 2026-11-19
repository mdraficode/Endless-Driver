/**
 * Phase 10 Most Wanted — wanted-HUD display math. Pure logic (Node-testable): maps a
 * `HeatState` to exactly what the on-screen meter should render. The DOM (`src/ui/WantedHud.ts`)
 * is a thin renderer over this.
 *
 * Faithful to NFS Most Wanted (2005): a bar of 15 stacked squares; each heat level lights one
 * square, the current level's square fills with the meter, the bar turns blue → yellow → red as
 * heat escalates, and it flashes as the next level approaches.
 */
import { clamp } from '../shared/math';
import { HEAT_LEVELS } from '../config/most-wanted';
import type { HeatState } from './HeatModel';

/** The escalation tier for a heat level (drives the bar colour). */
export type HeatTier = 'blue' | 'yellow' | 'red';

/** What the wanted meter should draw for a given state. */
export interface WantedDisplay {
  /** False = no pursuit: the whole meter is hidden / empty. */
  readonly active: boolean;
  /** Current heat level 0..15. */
  readonly level: number;
  /** Total squares in the bar (HEAT_LEVELS). */
  readonly segmentsTotal: number;
  /** Fully-lit squares (the levels already passed). */
  readonly filledFull: number;
  /** 0..1 fill of the current level's square. */
  readonly topFraction: number;
  /** Bar colour by escalation tier. */
  readonly tier: HeatTier;
  /** True while the police have lost the player (level decaying). */
  readonly evading: boolean;
  /** True when the current square is nearly full (the bar flashes). */
  readonly flash: boolean;
}

/** The escalation tier for a level: 1–5 blue, 6–10 yellow, 11–15 red. */
export function heatTier(level: number): HeatTier {
  if (level >= 11) return 'red';
  if (level >= 6) return 'yellow';
  return 'blue';
}

/** A CSS colour for a tier. */
export const TIER_COLOR: Record<HeatTier, string> = {
  blue: '#3b82f6',
  yellow: '#f59e0b',
  red: '#ef4444',
};

/** Compute what the wanted meter should show for a heat state. */
export function computeWantedDisplay(state: HeatState): WantedDisplay {
  if (!state.active || state.level <= 0) {
    return {
      active: false,
      level: 0,
      segmentsTotal: HEAT_LEVELS,
      filledFull: 0,
      topFraction: 0,
      tier: 'blue',
      evading: false,
      flash: false,
    };
  }
  const level = clamp(state.level, 0, HEAT_LEVELS);
  const heat = clamp(state.heat, 0, 1);
  return {
    active: true,
    level,
    segmentsTotal: HEAT_LEVELS,
    filledFull: level - 1,
    topFraction: heat,
    tier: heatTier(level),
    evading: state.evading,
    flash: heat > 0.8,
  };
}
