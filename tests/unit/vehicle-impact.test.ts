import { describe, expect, it } from 'vitest';

import {
  advanceVehicleImpact,
  createVehicleImpactState,
  triggerVehicleImpact,
} from '../../src/vehicles/VehicleImpact';

describe('vehicle collision animation', () => {
  it('ignores brushes, then produces a short damped chassis shudder on an impact', () => {
    const state = createVehicleImpactState();
    triggerVehicleImpact(state, 1, 1);
    expect(advanceVehicleImpact(state, 1 / 60)).toEqual({
      bounceMeters: 0,
      pitchRadians: 0,
      rollRadians: 0,
    });

    triggerVehicleImpact(state, 8, -1);
    const first = advanceVehicleImpact(state, 1 / 60);
    expect(first.bounceMeters).toBeGreaterThan(0);
    expect(first.pitchRadians).not.toBe(0);
    expect(first.rollRadians).toBeLessThan(0);

    let last = first;
    for (let step = 0; step < 60; step += 1) {
      last = advanceVehicleImpact(state, 1 / 60);
    }
    expect(last).toEqual({ bounceMeters: 0, pitchRadians: 0, rollRadians: 0 });
    expect(state.intensity).toBe(0);
  });

  it('keeps only the strongest overlapping pulse and clamps extreme impacts', () => {
    const state = createVehicleImpactState();
    triggerVehicleImpact(state, 30, 1);
    const intensity = state.intensity;
    triggerVehicleImpact(state, 3, -1);
    expect(state.intensity).toBe(intensity);
    expect(state.side).toBe(1);
    expect(intensity).toBeLessThanOrEqual(1);
  });
});
