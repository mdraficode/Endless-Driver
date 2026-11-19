import { describe, expect, it } from 'vitest';

import { EVADE_CONFIG } from '../../src/config/most-wanted';
import {
  initialHideSpotState,
  stepHideSpot,
  type HideSpotState,
} from '../../src/most-wanted/HideSpotModel';

const inSpot = (inSpot: boolean, wasInSpot = false) => ({ inSpot, wasInSpot });

describe('Most Wanted hide-spot evasion (Milestone 4b, D5)', () => {
  it('hides the player while inside an armed hide spot', () => {
    const r = stepHideSpot(initialHideSpotState(), inSpot(true));
    expect(r.inHideSpot).toBe(true);
    expect(r.used).toBe(true);
    expect(r.state.usesUsed).toBe(1);
  });

  it('does not hide or spend a charge when not in a spot', () => {
    const r = stepHideSpot(initialHideSpotState(), inSpot(false));
    expect(r.inHideSpot).toBe(false);
    expect(r.used).toBe(false);
    expect(r.state.usesUsed).toBe(0);
  });

  it('keeps the player hidden for the whole stay but spends only one charge', () => {
    let state: HideSpotState = initialHideSpotState();
    // Frame 1: enter.
    state = stepHideSpot(state, inSpot(true, false)).state;
    // Frames 2..4: still inside (wasInSpot true → no new charge).
    for (let i = 0; i < 3; i += 1) {
      const r = stepHideSpot(state, inSpot(true, true));
      expect(r.used).toBe(false);
      expect(r.inHideSpot).toBe(true);
      state = r.state;
    }
    expect(state.usesUsed).toBe(1);
  });

  it('grants the full D5 uses-per-pursuit, then burns the remaining spots', () => {
    let state: HideSpotState = initialHideSpotState();
    const max = EVADE_CONFIG.hideUsesPerPursuit;
    // Enter, leave, re-enter `max` times: each enter spends one charge and hides.
    for (let i = 0; i < max; i += 1) {
      const enter = stepHideSpot(state, inSpot(true, false));
      expect(enter.used).toBe(true);
      expect(enter.inHideSpot).toBe(true);
      state = enter.state;
      // Leave the spot.
      state = stepHideSpot(state, inSpot(false, true)).state;
    }
    // A further enter is out of charges → not hidden, no charge spent.
    const exhausted = stepHideSpot(state, inSpot(true, false));
    expect(exhausted.inHideSpot).toBe(false);
    expect(exhausted.used).toBe(false);
    expect(state.usesUsed).toBe(max);
  });

  it('leaves with no charge spent when outside', () => {
    let state: HideSpotState = stepHideSpot(initialHideSpotState(), inSpot(true, false)).state;
    state = stepHideSpot(state, inSpot(false, true)).state;
    expect(state.usesUsed).toBe(1);
  });
});
