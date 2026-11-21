import { describe, expect, it } from 'vitest';

import {
  activeSpec,
  garageView,
  initialCollection,
  markChampion,
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

  it('garageView lists every roster car with owned/active flags (starters owned, Blacklist locked)', () => {
    const state = initialCollection();
    const view = garageView(state);
    expect(view.activeId).toBe(DEFAULT_CAR_ID);
    expect(view.cars).toHaveLength(CAR_ROSTER.length);
    const hero = view.cars.find((c) => c.spec.id === DEFAULT_CAR_ID)!;
    expect(hero.owned).toBe(true);
    expect(hero.active).toBe(true);
    // A Blacklist car you don't own yet is locked.
    const locked = view.cars.find((c) => c.spec.id === 'mw-car-01')!;
    expect(locked.owned).toBe(false);
    expect(locked.active).toBe(false);
  });

  it('garageView reflects a newly unlocked + selected car', () => {
    let state = unlock(initialCollection(), 'mw-car-12');
    state = select(state, 'mw-car-12');
    const view = garageView(state);
    const entry = view.cars.find((c) => c.spec.id === 'mw-car-12')!;
    expect(entry.owned).toBe(true);
    expect(entry.active).toBe(true);
    // Exactly one car is active.
    expect(view.cars.filter((c) => c.active)).toHaveLength(1);
  });

  it('markChampion sets the title idempotently and it survives other transitions', () => {
    const fresh = initialCollection();
    expect(fresh.champion).toBe(false);
    const champion = markChampion(fresh);
    expect(champion.champion).toBe(true);
    expect(markChampion(champion)).toBe(champion); // idempotent, same reference
    // The title persists across selecting / unlocking cars.
    expect(select(champion, 'falcon-s').champion).toBe(true);
    expect(unlock(champion, 'mw-car-01').champion).toBe(true);
    // The garage view surfaces the title.
    expect(garageView(champion).champion).toBe(true);
  });
});
