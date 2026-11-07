import { describe, expect, it } from 'vitest';

import { VEHICLE_EFFECTS_CONFIG } from '../../src/config/vehicle-effects';
import { resolveTireSprayRate } from '../../src/vehicles/vehicle-effects';

const config = VEHICLE_EFFECTS_CONFIG.tireSpray;

describe('Phase 7 tire spray emitter decision', () => {
  it('sprays nothing on dry surfaces at any speed', () => {
    expect(resolveTireSprayRate(0, 40)).toBe(0);
    expect(resolveTireSprayRate(config.minimumWetness, 40)).toBe(0);
  });

  it('sprays nothing below the speed gate, and never in reverse', () => {
    expect(resolveTireSprayRate(1, config.minimumSpeedMps)).toBe(0);
    expect(resolveTireSprayRate(1, config.minimumSpeedMps - 0.5)).toBe(0);
    expect(resolveTireSprayRate(1, -30)).toBe(0);
  });

  it('rises smoothly with wetness and speed to the configured maximum', () => {
    const halfWet = config.minimumWetness + (1 - config.minimumWetness) * 0.5;
    const mid = resolveTireSprayRate(halfWet, config.fullSpeedMps);
    const full = resolveTireSprayRate(1, config.fullSpeedMps);
    expect(full).toBeCloseTo(config.puffsPerSecondAtFullSpeed, 5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(full);
    // Speed gate: the smoothstep ramp between the two gates.
    const quarter = resolveTireSprayRate(
      1,
      config.minimumSpeedMps + (config.fullSpeedMps - config.minimumSpeedMps) * 0.25,
    );
    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeLessThan(full);
    // Past the full-speed gate the rate stays at the maximum.
    expect(resolveTireSprayRate(1, config.fullSpeedMps * 2)).toBeCloseTo(full, 5);
  });

  it('rejects non-finite input as dry', () => {
    expect(resolveTireSprayRate(Number.NaN, 20)).toBe(0);
    expect(resolveTireSprayRate(0.8, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
