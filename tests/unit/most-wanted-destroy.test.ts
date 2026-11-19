import { describe, expect, it } from 'vitest';

import { canPlayerDestroyUnit } from '../../src/most-wanted/PoliceUnits';

describe('Player destroying police units (Milestone 4c)', () => {
  it('plows through a soft cruiser-class unit at speed', () => {
    expect(canPlayerDestroyUnit(20, 3, 'sedan')).toBe(true);
    expect(canPlayerDestroyUnit(20, 3, 'unmarked')).toBe(true);
    expect(canPlayerDestroyUnit(20, 3, 'muscle')).toBe(true);
    expect(canPlayerDestroyUnit(20, 3, 'motorcycle')).toBe(true);
  });

  it('does NOT destroy an armoured rhino / Cross / SUV or a heavy van', () => {
    expect(canPlayerDestroyUnit(30, 3, 'rhino')).toBe(false);
    expect(canPlayerDestroyUnit(30, 3, 'cross')).toBe(false);
    expect(canPlayerDestroyUnit(30, 3, 'suv')).toBe(false);
    expect(canPlayerDestroyUnit(30, 3, 'van')).toBe(false);
  });

  it('never destroys a helicopter (it is air)', () => {
    expect(canPlayerDestroyUnit(40, 1, 'heli')).toBe(false);
  });

  it('needs both speed and proximity', () => {
    expect(canPlayerDestroyUnit(10, 3, 'sedan')).toBe(false); // too slow
    expect(canPlayerDestroyUnit(30, 20, 'sedan')).toBe(false); // too far
    expect(canPlayerDestroyUnit(20, 3, 'sedan')).toBe(true);
  });
});
