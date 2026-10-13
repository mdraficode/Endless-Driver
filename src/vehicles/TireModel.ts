import type { TireConfig } from '../config/vehicle';

/**
 * Pure tire-force model. No Rapier, no DOM, no allocation: every function is total and
 * side-effect free so the handling curves can be unit-tested directly.
 *
 * The lateral model is a Pacejka-style "magic formula" on slip angle, which produces the three
 * behaviours a sim-cade car needs: rising force at small slip, a peak, and a falling tail. The
 * falling tail is what makes controlled drifting possible — past the peak, more steering yields
 * less grip rather than infinite grip.
 *
 * Longitudinal and lateral demand are combined with a friction-circle budget so braking or
 * powering out of a corner reduces available lateral grip.
 */

/**
 * Normalized magic formula: returns a value in [-1, 1] whose magnitude peaks at 1.
 *
 * `F(s) = sin(C * atan(B*s - E * (B*s - atan(B*s))))`
 *
 * @param slip Slip quantity (radians for slip angle).
 * @param stiffness B — larger values reach peak force at smaller slip.
 * @param shape C — curve shape; ~1.4-1.5 gives a pronounced, drivable peak.
 * @param curvature E — curvature near the peak; <1 keeps the post-peak falloff gradual.
 */
export function magicFormula(
  slip: number,
  stiffness: number,
  shape: number,
  curvature: number,
): number {
  if (!Number.isFinite(slip) || slip === 0) {
    return 0;
  }
  const b = Math.max(0.01, stiffness);
  const c = Math.max(0.01, shape);
  const e = Math.min(Math.max(curvature, 0), 1);
  const bs = b * slip;
  const inner = bs - e * (bs - Math.atan(bs));
  return Math.sin(c * Math.atan(inner));
}

/**
 * Load sensitivity: real tires lose a fraction of their friction coefficient as vertical load
 * increases. This is what makes weight transfer matter and keeps the inside wheel from behaving
 * like the outside wheel under cornering.
 */
export function loadSensitivityFactor(
  load: number,
  referenceLoad: number,
  sensitivity: number,
): number {
  if (!(referenceLoad > 0) || !(load > 0)) {
    return 1;
  }
  const ratio = load / referenceLoad;
  const factor = 1 - sensitivity * (ratio - 1);
  return Math.min(Math.max(factor, 1 - sensitivity * 3), 1 + sensitivity * 3);
}

/** Effective friction coefficient for a wheel carrying `load` newtons. */
export function effectiveFriction(load: number, referenceLoad: number, config: TireConfig): number {
  return (
    config.frictionCoefficient * loadSensitivityFactor(load, referenceLoad, config.loadSensitivity)
  );
}

/** Peak lateral force magnitude (newtons) available at `slipAngle`. */
export function lateralForceMagnitude(
  load: number,
  slipAngle: number,
  referenceLoad: number,
  config: TireConfig,
): number {
  if (!(load > 0)) {
    return 0;
  }
  const mu = effectiveFriction(load, referenceLoad, config);
  const peak = mu * load;
  return (
    peak *
    magicFormula(slipAngle, config.lateralStiffness, config.lateralShape, config.lateralCurvature)
  );
}

/**
 * Remaining lateral grip after longitudinal force has claimed part of the friction circle.
 * Returns a multiplier in [0, 1].
 */
export function frictionCircleScale(longitudinalForce: number, gripLimit: number): number {
  if (!(gripLimit > 0)) {
    return 0;
  }
  const ratio = Math.abs(longitudinalForce) / gripLimit;
  if (ratio >= 1) {
    return 0;
  }
  return Math.sqrt(1 - ratio * ratio);
}

/**
 * Slip angle from wheel contact-point velocities.
 *
 * The denominator is floored at `referenceSpeed` so that a nearly stationary car does not produce
 * a noisy or singular slip angle; this is the standard trick for making low-speed tire forces
 * stable in a fixed-step simulation.
 */
export function slipAngleFromVelocities(
  lateralVelocity: number,
  longitudinalVelocity: number,
  referenceSpeed: number,
): number {
  const reference = Math.max(referenceSpeed, 0.001);
  const denominator = Math.max(Math.abs(longitudinalVelocity), reference);
  return Math.atan2(lateralVelocity, denominator);
}

/** Engine torque at a given rpm, linearly interpolated from the configured curve. */
export function torqueAtRpm(rpm: number, curve: readonly (readonly [number, number])[]): number {
  if (curve.length === 0) {
    return 0;
  }
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (!first || !last) {
    return 0;
  }
  if (rpm <= first[0]) {
    return first[1];
  }
  if (rpm >= last[0]) {
    return last[1];
  }
  for (let index = 1; index < curve.length; index += 1) {
    const previous = curve[index - 1];
    const point = curve[index];
    if (!previous || !point) {
      continue;
    }
    if (rpm <= point[0]) {
      const span = point[0] - previous[0];
      const t = span > 0 ? (rpm - previous[0]) / span : 0;
      return previous[1] + (point[1] - previous[1]) * t;
    }
  }
  return last[1];
}
