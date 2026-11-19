/**
 * Phase 10 Most Wanted — Milestone 4b: hide-spot evasion, the pure decision model.
 *
 * The world already places a handful of "secret corner" hideouts (`placeHideouts`); this model
 * decides, per frame, whether the player is **hidden** while inside one of them. In the original
 * a hide spot breaks the pursuit: the police lose visual lock, the lost-sight timer runs, and —
 * after a hold — the heat cools and you evade.
 *
 * **D5 (limited uses per pursuit / anti-camping):** a pursuit only grants so many hide-spot
 * charges (`EVADE_CONFIG.hideUsesPerPursuit`). A charge is spent the moment the player **enters**
 * an armed hide spot; once they are used up the remaining hide spots no longer hide you (the
 * police have the district covered). State is reset for each new pursuit by the caller.
 *
 * Pure: no Three.js / Rapier / DOM, Node-testable.
 */
import { EVADE_CONFIG } from '../config/most-wanted';

export interface HideSpotState {
  /** Hide-spot charges spent this pursuit (D5, anti-camping). */
  readonly usesUsed: number;
}

export interface HideSpotFrame {
  /** The player is currently inside a hide-spot zone. */
  readonly inSpot: boolean;
  /** The player was inside a hide-spot zone on the previous frame. */
  readonly wasInSpot: boolean;
}

export interface HideSpotResult {
  readonly state: HideSpotState;
  /** The brain should treat the player as out of sight this frame. */
  readonly inHideSpot: boolean;
  /** A hide-spot charge was consumed this frame (the player ducked in). */
  readonly used: boolean;
}

export function initialHideSpotState(): HideSpotState {
  return { usesUsed: 0 };
}

/**
 * Advance the hide-spot state by one frame. A charge is spent on the **enter** transition into an
 * armed spot; the player stays hidden for as long as they remain inside an armed spot.
 */
export function stepHideSpot(state: HideSpotState, frame: HideSpotFrame): HideSpotResult {
  const max = EVADE_CONFIG.hideUsesPerPursuit;
  const armed = state.usesUsed < max;
  // Entering an armed spot spends a charge (even if it ends up not breaking the chase).
  const used = armed && frame.inSpot && !frame.wasInSpot;
  const inHideSpot = armed && frame.inSpot;
  return {
    state: { usesUsed: state.usesUsed + (used ? 1 : 0) },
    inHideSpot,
    used,
  };
}
