import { VEHICLE_EFFECTS_CONFIG } from '../config/vehicle-effects';
import type { WheelState } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Cubic easing used for speed gates and tire-smoke thresholds. */
export function smoothStep(min: number, max: number, value: number): number {
  if (!Number.isFinite(value) || max <= min) {
    return 0;
  }
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Returns a smooth 0..1 response for visually subtle, speed-triggered flow marks.
 * Reversing does not create forward airflow streaks.
 */
export function resolveAirflowIntensity(speedKph: number): number {
  if (!Number.isFinite(speedKph) || speedKph <= 0) {
    return 0;
  }
  return smoothStep(
    VEHICLE_EFFECTS_CONFIG.airflow.startSpeedKph,
    VEHICLE_EFFECTS_CONFIG.airflow.fullSpeedKph,
    speedKph,
  );
}

/**
 * Scales the tier's configured maximum shutter strength from zero at low speeds to full only at
 * genuinely high road speed. A disabled tier passes a zero maximum and stays disabled.
 */
export function resolveHighSpeedMotionBlurIntensity(
  speedKph: number,
  maximumIntensity: number,
): number {
  if (!Number.isFinite(speedKph) || !Number.isFinite(maximumIntensity) || maximumIntensity <= 0) {
    return 0;
  }
  const { startSpeedKph, fullSpeedKph } = VEHICLE_EFFECTS_CONFIG.motionBlur;
  return maximumIntensity * smoothStep(startSpeedKph, fullSpeedKph, speedKph);
}

/**
 * 0..1 visual-only tire smoke response. A wheel must be loaded and moving; it smokes when the
 * tire is near its friction limit, the slip angle is large, or a rear handbrake is being held.
 */
export function resolveTireSmokeStrength(
  wheel: Pick<WheelState, 'inContact' | 'isFront' | 'slipAngle' | 'utilization'>,
  speedMps: number,
  handbrake: boolean,
): number {
  const config = VEHICLE_EFFECTS_CONFIG.tireSmoke;
  if (!wheel.inContact || !Number.isFinite(speedMps) || speedMps < config.minimumSpeedMps) {
    return 0;
  }

  const slip = smoothStep(
    config.slipAngleStartRadians,
    config.slipAngleFullRadians,
    Math.abs(wheel.slipAngle),
  );
  const saturation = smoothStep(config.utilizationStart, config.utilizationFull, wheel.utilization);
  const handbrakeStrength = handbrake && !wheel.isFront ? config.rearHandbrakeStrength : 0;
  const speedGate = smoothStep(config.minimumSpeedMps, config.minimumSpeedMps * 1.8, speedMps);
  return clamp(Math.max(slip, saturation, handbrakeStrength) * speedGate, 0, 1);
}
