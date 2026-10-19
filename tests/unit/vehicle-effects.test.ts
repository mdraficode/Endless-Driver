import { describe, expect, it } from 'vitest';
import { VEHICLE_EFFECTS_CONFIG } from '../../src/config/vehicle-effects';
import {
  resolveAirflowIntensity,
  resolveHighSpeedMotionBlurIntensity,
  resolveTireSmokeStrength,
} from '../../src/vehicles/vehicle-effects';

describe('speed-triggered vehicle visuals', () => {
  it('keeps airflow marks absent at road speed and reverses, then ramps them in', () => {
    expect(resolveAirflowIntensity(0)).toBe(0);
    expect(resolveAirflowIntensity(-160)).toBe(0);
    expect(resolveAirflowIntensity(VEHICLE_EFFECTS_CONFIG.airflow.startSpeedKph)).toBe(0);
    expect(resolveAirflowIntensity(145)).toBeGreaterThan(0);
    expect(resolveAirflowIntensity(145)).toBeLessThan(1);
    expect(resolveAirflowIntensity(VEHICLE_EFFECTS_CONFIG.airflow.fullSpeedKph)).toBe(1);
  });

  it('holds motion blur at zero below the high-speed threshold and eases to the tier maximum', () => {
    const maximum = 0.28;
    const { startSpeedKph, fullSpeedKph } = VEHICLE_EFFECTS_CONFIG.motionBlur;
    expect(resolveHighSpeedMotionBlurIntensity(startSpeedKph - 1, maximum)).toBe(0);
    expect(resolveHighSpeedMotionBlurIntensity(startSpeedKph, maximum)).toBe(0);
    const mid = resolveHighSpeedMotionBlurIntensity((startSpeedKph + fullSpeedKph) / 2, maximum);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(maximum);
    expect(resolveHighSpeedMotionBlurIntensity(fullSpeedKph, maximum)).toBe(maximum);
    expect(resolveHighSpeedMotionBlurIntensity(fullSpeedKph + 30, maximum)).toBe(maximum);
    expect(resolveHighSpeedMotionBlurIntensity(fullSpeedKph, 0)).toBe(0);
    expect(resolveHighSpeedMotionBlurIntensity(Number.NaN, maximum)).toBe(0);
  });

  it('emits tire smoke only from a loaded, fast wheel near its grip limit', () => {
    const stableRearWheel = {
      inContact: true,
      isFront: false,
      slipAngle: 0.04,
      utilization: 0.42,
    } as const;
    expect(resolveTireSmokeStrength(stableRearWheel, 25, false)).toBe(0);
    expect(resolveTireSmokeStrength({ ...stableRearWheel, inContact: false }, 25, false)).toBe(0);
    expect(resolveTireSmokeStrength(stableRearWheel, 3, false)).toBe(0);
    expect(
      resolveTireSmokeStrength({ ...stableRearWheel, slipAngle: 0.34 }, 22, false),
    ).toBeGreaterThan(0);
    expect(
      resolveTireSmokeStrength({ ...stableRearWheel, utilization: 0.97 }, 22, false),
    ).toBeGreaterThan(0);
  });

  it('limits handbrake smoke to the rear tires and honors all tier particle budgets', () => {
    const wheel = { inContact: true, isFront: false, slipAngle: 0, utilization: 0.5 } as const;
    expect(resolveTireSmokeStrength(wheel, 20, true)).toBeGreaterThan(0);
    expect(resolveTireSmokeStrength({ ...wheel, isFront: true }, 20, true)).toBe(0);

    const { C, B, A } = VEHICLE_EFFECTS_CONFIG.particleCapacityByTier;
    expect(C.smoke).toBeLessThan(B.smoke);
    expect(B.smoke).toBeLessThan(A.smoke);
    expect(C.sparks).toBeLessThan(B.sparks);
    expect(B.sparks).toBeLessThan(A.sparks);
    expect(C.airflow).toBeLessThan(B.airflow);
    expect(B.airflow).toBeLessThan(A.airflow);

    for (const tier of ['C', 'B', 'A'] as const) {
      expect(VEHICLE_EFFECTS_CONFIG.shiftSparks.countByTier[tier]).toBeLessThanOrEqual(
        VEHICLE_EFFECTS_CONFIG.particleCapacityByTier[tier].sparks,
      );
    }
  });
});
