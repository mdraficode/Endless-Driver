import { describe, expect, it } from 'vitest';
import {
  applyCarTuning,
  CAR_TUNING_LIMITS,
  DEFAULT_CAR_TUNING,
  HANDLING_MODE_LABELS,
  VEHICLE_CONFIG,
  type CarTuning,
} from '../../src/config/vehicle';
import { parseCarTuning } from '../../src/config/game-preferences';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('applyCarTuning (Phase 12.1)', () => {
  it('arcade defaults preserve the stock car, modulo the stepped brake bias', () => {
    const tuned = applyCarTuning(VEHICLE_CONFIG, DEFAULT_CAR_TUNING);
    // Everything except the brake split is untouched by the arcade defaults.
    expect(tuned.wheels).toEqual(VEHICLE_CONFIG.wheels);
    expect(tuned.tires).toEqual(VEHICLE_CONFIG.tires);
    expect(tuned.steering).toEqual(VEHICLE_CONFIG.steering);
    expect(tuned.stability).toEqual(VEHICLE_CONFIG.stability);
    expect(tuned.aero).toEqual(VEHICLE_CONFIG.aero);
    // The default bias steps 0.607 to 0.6: the total braking force is preserved
    // and the front share stays within 1.5% of the shipped split.
    const total = tuned.brakes.frontForce + tuned.brakes.rearForce;
    expect(total).toBeCloseTo(
      VEHICLE_CONFIG.brakes.frontForce + VEHICLE_CONFIG.brakes.rearForce,
      6,
    );
    const frontShare = tuned.brakes.frontForce / total;
    const shippedFrontShare =
      VEHICLE_CONFIG.brakes.frontForce /
      (VEHICLE_CONFIG.brakes.frontForce + VEHICLE_CONFIG.brakes.rearForce);
    expect(Math.abs(frontShare - shippedFrontShare)).toBeLessThan(0.015);
    // The torque curve keeps its shape, scaled by 1.0.
    expect(tuned.drivetrain.torqueCurve).toEqual(VEHICLE_CONFIG.drivetrain.torqueCurve);
  });

  it('never mutates the base config', () => {
    const base = clone(VEHICLE_CONFIG);
    applyCarTuning(VEHICLE_CONFIG, {
      ...DEFAULT_CAR_TUNING,
      powerScale: 1.2,
      stiffnessScale: 0.8,
      rideHeightOffsetMeters: 0.02,
    });
    expect(VEHICLE_CONFIG).toEqual(base);
  });

  it('is deterministic: same inputs always produce the same config', () => {
    const tuning: CarTuning = {
      handlingMode: 'sport',
      powerScale: 1.1,
      rideHeightOffsetMeters: -0.015,
      stiffnessScale: 1.05,
      compressionDampingScale: 0.95,
      reboundDampingScale: 1.1,
      gripScale: 1.05,
      frontBrakeBias: 0.5,
    };
    expect(applyCarTuning(VEHICLE_CONFIG, tuning)).toEqual(applyCarTuning(VEHICLE_CONFIG, tuning));
  });

  it('scales the torque curve point-by-point with powerScale', () => {
    const tuned = applyCarTuning(VEHICLE_CONFIG, {
      ...DEFAULT_CAR_TUNING,
      powerScale: 1.25,
    });
    for (const [i, [rpm, torque]] of tuned.drivetrain.torqueCurve.entries()) {
      expect(rpm).toBe(VEHICLE_CONFIG.drivetrain.torqueCurve[i]![0]);
      expect(torque).toBeCloseTo(VEHICLE_CONFIG.drivetrain.torqueCurve[i]![1] * 1.25, 6);
    }
  });

  it('keeps the total brake force constant while the bias moves it front-to-rear', () => {
    const stock = VEHICLE_CONFIG.brakes.frontForce + VEHICLE_CONFIG.brakes.rearForce;
    for (const bias of [0.4, 0.5, 0.6]) {
      const tuned = applyCarTuning(VEHICLE_CONFIG, { ...DEFAULT_CAR_TUNING, frontBrakeBias: bias });
      expect(tuned.brakes.frontForce + tuned.brakes.rearForce).toBeCloseTo(stock, 6);
      expect(tuned.brakes.frontForce / stock).toBeCloseTo(bias, 6);
    }
  });

  it('multiplies the mode suspension numbers, not the arcade ones', () => {
    const sportStiff = applyCarTuning(VEHICLE_CONFIG, {
      ...DEFAULT_CAR_TUNING,
      handlingMode: 'sport',
      stiffnessScale: 1.1,
    });
    expect(sportStiff.wheels.stiffness).toBeCloseTo(39000 * 1.1, 6);
    const arcadeStiff = applyCarTuning(VEHICLE_CONFIG, {
      ...DEFAULT_CAR_TUNING,
      stiffnessScale: 1.1,
    });
    expect(arcadeStiff.wheels.stiffness).toBeCloseTo(33000 * 1.1, 6);
  });

  it('applies the ride height offset to the rest length', () => {
    const tuned = applyCarTuning(VEHICLE_CONFIG, {
      ...DEFAULT_CAR_TUNING,
      rideHeightOffsetMeters: -0.02,
    });
    expect(tuned.wheels.restLength).toBeCloseTo(VEHICLE_CONFIG.wheels.restLength - 0.02, 9);
  });

  it('scales tire grip with gripScale', () => {
    const tuned = applyCarTuning(VEHICLE_CONFIG, {
      ...DEFAULT_CAR_TUNING,
      gripScale: 1.1,
    });
    expect(tuned.tires.frictionCoefficient).toBeCloseTo(
      VEHICLE_CONFIG.tires.frictionCoefficient * 1.1,
      6,
    );
  });

  it('orders the handling modes from most to least assistance', () => {
    const arcade = applyCarTuning(VEHICLE_CONFIG, {
      ...DEFAULT_CAR_TUNING,
      handlingMode: 'arcade',
    });
    const balanced = applyCarTuning(VEHICLE_CONFIG, {
      ...DEFAULT_CAR_TUNING,
      handlingMode: 'balanced',
    });
    const sport = applyCarTuning(VEHICLE_CONFIG, { ...DEFAULT_CAR_TUNING, handlingMode: 'sport' });
    // Less electronic help as the mode gets sharper.
    expect(arcade.stability.yawResponsePerSecond).toBeGreaterThan(
      balanced.stability.yawResponsePerSecond,
    );
    expect(balanced.stability.yawResponsePerSecond).toBeGreaterThan(
      sport.stability.yawResponsePerSecond,
    );
    // Sharper tires and more downforce as the mode gets sharper.
    expect(sport.tires.lateralStiffness).toBeGreaterThan(balanced.tires.lateralStiffness);
    expect(balanced.tires.lateralStiffness).toBeGreaterThan(arcade.tires.lateralStiffness);
    expect(sport.aero.downforceCoefficient).toBeGreaterThan(balanced.aero.downforceCoefficient);
    expect(balanced.aero.downforceCoefficient).toBeGreaterThan(arcade.aero.downforceCoefficient);
    // Less steering authority: sport asks for closer to the tire limit.
    expect(arcade.steering.gripBudgetFactor).toBeGreaterThan(sport.steering.gripBudgetFactor);
  });

  it('exposes a label for every handling mode', () => {
    for (const mode of ['arcade', 'balanced', 'sport'] as const) {
      expect(HANDLING_MODE_LABELS[mode].length).toBeGreaterThan(5);
    }
  });
});

describe('carTuning preference validation (Phase 12.1)', () => {
  const valid: CarTuning = {
    handlingMode: 'balanced',
    powerScale: 1.1,
    rideHeightOffsetMeters: -0.01,
    stiffnessScale: 1.1,
    compressionDampingScale: 0.9,
    reboundDampingScale: 1.1,
    gripScale: 1.05,
    frontBrakeBias: 0.5,
  };

  it('round-trips a valid tuning object', () => {
    expect(parseCarTuning(valid)).toEqual(valid);
  });

  it('falls back to defaults for a missing object', () => {
    expect(parseCarTuning(undefined)).toEqual({ ...DEFAULT_CAR_TUNING });
  });

  it('validates every field independently', () => {
    const parsed = parseCarTuning({
      handlingMode: 'not-a-mode',
      powerScale: 99,
      rideHeightOffsetMeters: -5,
      stiffnessScale: NaN,
      compressionDampingScale: 0.7,
      reboundDampingScale: 2,
      gripScale: 'nope',
      frontBrakeBias: 0.55,
    });
    expect(parsed.handlingMode).toBe(DEFAULT_CAR_TUNING.handlingMode);
    expect(parsed.powerScale).toBe(CAR_TUNING_LIMITS.powerScale.max);
    expect(parsed.rideHeightOffsetMeters).toBe(CAR_TUNING_LIMITS.rideHeightOffsetMeters.min);
    expect(parsed.stiffnessScale).toBe(DEFAULT_CAR_TUNING.stiffnessScale);
    expect(parsed.compressionDampingScale).toBe(CAR_TUNING_LIMITS.compressionDampingScale.min);
    expect(parsed.reboundDampingScale).toBe(CAR_TUNING_LIMITS.reboundDampingScale.max);
    expect(parsed.gripScale).toBe(DEFAULT_CAR_TUNING.gripScale);
    // 0.55 is off-step (step 0.05 from 0.4): snaps to 0.55 -> 0.4 + round(0.15/0.05)*0.05 = 0.55.
    expect(parsed.frontBrakeBias).toBe(0.55);
  });

  it('snaps values to the slider step', () => {
    const parsed = parseCarTuning({ powerScale: 1.12 });
    expect(parsed.powerScale).toBeCloseTo(1.1, 9);
  });
});
