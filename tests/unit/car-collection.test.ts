import { describe, expect, it } from 'vitest';

import {
  activeSpec,
  initialCollection,
  owns,
  ownedCount,
  select,
  unlock,
} from '../../src/cars/carCollection';
import { STARTER_CAR_IDS, DEFAULT_CAR_ID, CAR_ROSTER } from '../../src/cars/carRoster';

describe('Phase 14 — car collection (ownership)', () => {
  it('starts with the starter cars owned and the hero car active', () => {
    const state = initialCollection();
    for (const id of STARTER_CAR_IDS) {
      expect(owns(state, id)).toBe(true);
    }
    expect(state.activeId).toBe(DEFAULT_CAR_ID);
    expect(activeSpec(state)!.id).toBe(DEFAULT_CAR_ID);
    expect(ownedCount(state)).toBe(STARTER_CAR_IDS.length);
  });

  it("a Blacklist win unlocks that rival's car (the mw-car-<rank> payoff)", () => {
    const state = initialCollection();
    expect(owns(state, 'mw-car-15')).toBe(false);
    const after = unlock(state, 'mw-car-15');
    expect(owns(after, 'mw-car-15')).toBe(true);
    expect(ownedCount(after)).toBe(STARTER_CAR_IDS.length + 1);
    // The original state is untouched (immutable transition).
    expect(owns(state, 'mw-car-15')).toBe(false);
  });

  it('unlocking is idempotent and ignores unknown ids', () => {
    const state = initialCollection();
    const once = unlock(state, 'mw-car-12');
    const twice = unlock(once, 'mw-car-12');
    expect(twice).toBe(once); // no change → same reference
    expect(ownedCount(twice)).toBe(STARTER_CAR_IDS.length + 1);
    expect(unlock(state, 'not-a-real-car')).toBe(state);
  });

  it('you can only select a car you own', () => {
    const state = initialCollection();
    // Not owned yet: selecting is a no-op.
    expect(select(state, 'mw-car-01')).toBe(state);
    // Own it, then it can be selected.
    const withCar = unlock(state, 'mw-car-01');
    const driving = select(withCar, 'mw-car-01');
    expect(driving.activeId).toBe('mw-car-01');
    expect(activeSpec(driving)!.blacklistRank).toBe(1);
  });

  it('selecting the already-active car is a no-op (same reference)', () => {
    const state = initialCollection();
    expect(select(state, DEFAULT_CAR_ID)).toBe(state);
  });

  it('you can cycle through every Blacklist car you have earned', () => {
    let state = initialCollection();
    for (const car of CAR_ROSTER.filter((c) => c.source === 'blacklist')) {
      state = unlock(state, car.id);
      state = select(state, car.id);
      expect(state.activeId).toBe(car.id);
      expect(activeSpec(state)!.id).toBe(car.id);
    }
  });
});
