import { describe, expect, it } from 'vitest';

import { NitroBoost, NITRO_BOOST_CONFIG } from '../../src/vehicles/NitroBoost';

describe('regenerative N₂O boost', () => {
  it('starts full and drains only while boost is held with throttle applied', () => {
    const tank = new NitroBoost();
    expect(tank.state).toEqual({ charge: 1, active: false });

    expect(tank.update(1, true, 0)).toEqual({ charge: 1, active: false });
    const used = tank.update(1, true, 1);
    expect(used.active).toBe(true);
    expect(used.charge).toBeCloseTo(1 - 1 / NITRO_BOOST_CONFIG.useDurationSeconds, 6);
  });

  it('empties on a continuous burst and refills gradually after release', () => {
    const tank = new NitroBoost();
    const depleted = tank.update(NITRO_BOOST_CONFIG.useDurationSeconds + 1, true, 1);
    expect(depleted.charge).toBe(0);
    expect(depleted.active).toBe(true);

    const heldEmpty = tank.update(1, true, 1);
    expect(heldEmpty).toEqual({ charge: 0, active: false });

    const halfway = tank.update(NITRO_BOOST_CONFIG.rechargeDurationSeconds / 2, false, 1);
    expect(halfway.charge).toBeCloseTo(0.5, 6);
    expect(halfway.active).toBe(false);
    expect(tank.update(NITRO_BOOST_CONFIG.rechargeDurationSeconds, false, 1).charge).toBe(1);
  });

  it('does not drain when throttle is below the firing threshold and sanitizes bad frame deltas', () => {
    const tank = new NitroBoost();
    const barelyMoving = tank.update(0.5, true, NITRO_BOOST_CONFIG.minimumThrottle - 0.01);
    expect(barelyMoving.active).toBe(false);
    expect(barelyMoving.charge).toBe(1);

    expect(tank.update(Number.NaN, true, 1)).toEqual({ charge: 1, active: true });
  });
});
