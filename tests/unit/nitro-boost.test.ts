import { describe, expect, it } from 'vitest';

import { NitroBoost, NITRO_BOOST_CONFIG } from '../../src/vehicles/NitroBoost';

describe('regenerative N₂O boost', () => {
  it('starts full and drains on boost input without requiring throttle', () => {
    const tank = new NitroBoost();
    expect(tank.state).toEqual({ charge: 1, active: false });

    const used = tank.update(1, true);
    expect(used.active).toBe(true);
    expect(used.charge).toBeCloseTo(1 - 1 / NITRO_BOOST_CONFIG.useDurationSeconds, 6);
  });

  it('empties on a continuous burst and refills only after the boost control is released', () => {
    const tank = new NitroBoost();
    const depleted = tank.update(NITRO_BOOST_CONFIG.useDurationSeconds + 1, true);
    expect(depleted).toEqual({ charge: 0, active: false });

    const heldEmpty = tank.update(1, true);
    expect(heldEmpty).toEqual({ charge: 0, active: false });

    const halfway = tank.update(NITRO_BOOST_CONFIG.rechargeDurationSeconds / 2, false);
    expect(halfway.charge).toBeCloseTo(0.5, 6);
    expect(halfway.active).toBe(false);
    expect(tank.update(NITRO_BOOST_CONFIG.rechargeDurationSeconds, false).charge).toBe(1);
  });

  it('does not drain in reverse and sanitizes bad frame deltas', () => {
    const tank = new NitroBoost();
    const reverse = tank.update(0.5, true, false);
    expect(reverse).toEqual({ charge: 1, active: false });

    expect(tank.update(Number.NaN, true, true)).toEqual({ charge: 1, active: true });
  });
});
