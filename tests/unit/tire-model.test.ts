import { describe, expect, it } from 'vitest';
import { VEHICLE_CONFIG, type TireConfig } from '../../src/config/vehicle';
import {
  effectiveFriction,
  frictionCircleScale,
  lateralForceMagnitude,
  loadSensitivityFactor,
  magicFormula,
  slipAngleFromVelocities,
  torqueAtRpm,
} from '../../src/vehicles/TireModel';

const tires: TireConfig = VEHICLE_CONFIG.tires;
const REFERENCE_LOAD = (VEHICLE_CONFIG.chassis.mass * 9.81) / 4;

/** The configured lateral curve, so tuning changes are reflected in these expectations. */
const curve = (slip: number): number =>
  magicFormula(slip, tires.lateralStiffness, tires.lateralShape, tires.lateralCurvature);

describe('tire model', () => {
  it('returns zero force at zero slip and is odd-symmetric in slip', () => {
    expect(curve(0)).toBe(0);
    expect(curve(0.1)).toBeCloseTo(-curve(-0.1), 12);
  });

  it('rises to a peak of one and then falls away past the peak', () => {
    // The falling tail past the peak is what makes controlled drifting possible: more steering
    // eventually means less grip, not more.
    const samples = Array.from({ length: 400 }, (_, index) => (index + 1) * 0.005);
    const forces = samples.map((slip) => curve(slip));
    const peak = Math.max(...forces);

    expect(peak).toBeCloseTo(1, 3);
    const peakIndex = forces.indexOf(peak);
    expect(peakIndex).toBeGreaterThan(0);
    // Beyond the peak the curve decreases monotonically.
    for (let index = peakIndex + 1; index < forces.length; index += 1) {
      expect(forces[index] ?? 0).toBeLessThan(forces[index - 1] ?? 0);
    }
    // At a large slip angle the tire still carries a useful fraction of its peak force.
    const largeSlip = curve(1.2);
    expect(largeSlip).toBeGreaterThan(0.4);
    expect(largeSlip).toBeLessThan(1);
  });

  it('reaches peak force at a small, plausible slip angle', () => {
    let bestSlip = 0;
    let bestForce = 0;
    for (let slip = 0.001; slip < 1; slip += 0.001) {
      const force = curve(slip);
      if (force > bestForce) {
        bestForce = force;
        bestSlip = slip;
      }
    }
    // Peak grip lands near 10 degrees of slip (0.18 rad), matching a road tire's feel.
    expect(bestSlip).toBeGreaterThan(0.12);
    expect(bestSlip).toBeLessThan(0.28);
  });

  it('loses friction coefficient as vertical load increases', () => {
    const light = effectiveFriction(REFERENCE_LOAD * 0.5, REFERENCE_LOAD, tires);
    const nominal = effectiveFriction(REFERENCE_LOAD, REFERENCE_LOAD, tires);
    const heavy = effectiveFriction(REFERENCE_LOAD * 2, REFERENCE_LOAD, tires);

    expect(nominal).toBeCloseTo(tires.frictionCoefficient, 12);
    expect(light).toBeGreaterThan(nominal);
    expect(heavy).toBeLessThan(nominal);
    // Total force still grows with load even though the coefficient drops (the classic result).
    expect(heavy * REFERENCE_LOAD * 2).toBeGreaterThan(nominal * REFERENCE_LOAD);
  });

  it('keeps load sensitivity bounded and total', () => {
    for (const load of [0, -5, 1e-6, 1e6, Number.NaN]) {
      const factor = loadSensitivityFactor(load, REFERENCE_LOAD, tires.loadSensitivity);
      expect(Number.isFinite(factor)).toBe(true);
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThanOrEqual(1 + tires.loadSensitivity * 3);
    }
    expect(loadSensitivityFactor(REFERENCE_LOAD, 0, tires.loadSensitivity)).toBe(1);
  });

  it('produces lateral force proportional to load and capped at the friction limit', () => {
    const slip = 0.1;
    const force = lateralForceMagnitude(REFERENCE_LOAD, slip, REFERENCE_LOAD, tires);
    const limit = effectiveFriction(REFERENCE_LOAD, REFERENCE_LOAD, tires) * REFERENCE_LOAD;
    expect(force).toBeGreaterThan(0);
    expect(force).toBeLessThanOrEqual(limit);
    expect(lateralForceMagnitude(0, slip, REFERENCE_LOAD, tires)).toBe(0);
  });

  it('shrinks available lateral grip as longitudinal force claims the friction circle', () => {
    const gripLimit = 6000;
    expect(frictionCircleScale(0, gripLimit)).toBe(1);
    expect(frictionCircleScale(gripLimit * 0.6, gripLimit)).toBeCloseTo(0.8, 12);
    expect(frictionCircleScale(gripLimit, gripLimit)).toBe(0);
    expect(frictionCircleScale(gripLimit * 2, gripLimit)).toBe(0);
    expect(frictionCircleScale(1000, 0)).toBe(0);
  });

  it('computes a stable slip angle at low speed', () => {
    // The denominator is floored at the reference speed, so a nearly stationary car cannot
    // produce a singular slip angle.
    expect(slipAngleFromVelocities(0, 0.2, 1.5)).toBe(0);
    expect(slipAngleFromVelocities(-1.5, 0, 1.5)).toBeCloseTo(-Math.PI / 4, 6);
    expect(slipAngleFromVelocities(1, 1, 1.5)).toBeLessThan(Math.PI / 4);
    // Above the floor the value is the true slip angle.
    expect(slipAngleFromVelocities(2, 2, 1.5)).toBeCloseTo(Math.PI / 4, 6);
  });

  it('interpolates the torque curve and clamps outside it', () => {
    const curve = VEHICLE_CONFIG.drivetrain.torqueCurve;
    expect(torqueAtRpm(0, curve)).toBe(230);
    expect(torqueAtRpm(1500, curve)).toBeCloseTo((230 + 340) / 2, 6);
    expect(torqueAtRpm(4200, curve)).toBe(420);
    expect(torqueAtRpm(99999, curve)).toBe(120);
    expect(torqueAtRpm(3000, [])).toBe(0);
  });

  it('has a monotone rpm axis and a single torque peak', () => {
    const curve = VEHICLE_CONFIG.drivetrain.torqueCurve;
    for (let index = 1; index < curve.length; index += 1) {
      const previous = curve[index - 1];
      const point = curve[index];
      expect(previous).toBeDefined();
      expect(point).toBeDefined();
      if (previous && point) {
        expect(point[0]).toBeGreaterThan(previous[0]);
      }
    }
    const peak = Math.max(...curve.map(([, torque]) => torque));
    expect(peak).toBe(420);
    expect(curve[0]?.[1]).toBeLessThan(peak);
    expect(curve[curve.length - 1]?.[1]).toBeLessThan(peak);
  });
});
