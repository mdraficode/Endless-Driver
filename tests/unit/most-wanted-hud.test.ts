import { describe, expect, it } from 'vitest';

import { HEAT_LEVELS } from '../../src/config/most-wanted';
import type { HeatState } from '../../src/most-wanted/HeatModel';
import { computeWantedDisplay, heatTier, TIER_COLOR } from '../../src/most-wanted/WantedHudModel';

const base: HeatState = {
  level: 1,
  heat: 0,
  ceiling: 15,
  active: true,
  evading: false,
  recentCrimeSeconds: 0,
};

describe('Most Wanted HUD display math (Phase 10, Milestone 2)', () => {
  it('is inactive and empty when there is no pursuit', () => {
    const d = computeWantedDisplay({ ...base, active: false });
    expect(d.active).toBe(false);
    expect(d.filledFull).toBe(0);
    expect(d.topFraction).toBe(0);
    const d0 = computeWantedDisplay({ ...base, level: 0 });
    expect(d0.active).toBe(false);
  });

  it('lights the level-th square and fills it with the meter', () => {
    // Level 1, meter 40% → 0 full squares, 0.4 into the first.
    const d = computeWantedDisplay({ ...base, level: 1, heat: 0.4 });
    expect(d.filledFull).toBe(0);
    expect(d.topFraction).toBeCloseTo(0.4);
    // Level 4, meter 10% → 3 full squares, 0.1 into the fourth.
    const d4 = computeWantedDisplay({ ...base, level: 4, heat: 0.1 });
    expect(d4.filledFull).toBe(3);
    expect(d4.topFraction).toBeCloseTo(0.1);
    // Just under a level-up: current square nearly full + flashing.
    const dUp = computeWantedDisplay({ ...base, level: 5, heat: 0.95 });
    expect(dUp.filledFull).toBe(4);
    expect(dUp.flash).toBe(true);
    expect(computeWantedDisplay({ ...base, level: 5, heat: 0.5 }).flash).toBe(false);
  });

  it('caps the square count at HEAT_LEVELS and escalates colour by tier', () => {
    expect(heatTier(1)).toBe('blue');
    expect(heatTier(5)).toBe('blue');
    expect(heatTier(6)).toBe('yellow');
    expect(heatTier(10)).toBe('yellow');
    expect(heatTier(11)).toBe('red');
    expect(heatTier(15)).toBe('red');
    // Max heat: 14 full squares + the 15th filling (14 + 1 = all 15 lit).
    const max = computeWantedDisplay({ ...base, level: 15, heat: 1 });
    expect(max.filledFull + (max.topFraction > 0 ? 1 : 0)).toBe(HEAT_LEVELS);
    expect(max.tier).toBe('red');
    // Each tier maps to a distinct colour.
    expect(TIER_COLOR.blue).not.toBe(TIER_COLOR.yellow);
    expect(TIER_COLOR.yellow).not.toBe(TIER_COLOR.red);
  });

  it('surfaces the evading state', () => {
    expect(computeWantedDisplay({ ...base, evading: true }).evading).toBe(true);
    expect(computeWantedDisplay({ ...base, evading: false }).evading).toBe(false);
  });
});
