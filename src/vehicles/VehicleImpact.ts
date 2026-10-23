import { clamp } from '../shared/math';

export interface VehicleImpactState {
  intensity: number;
  ageSeconds: number;
  /** Signed lateral direction in the vehicle's local frame. */
  side: number;
}

export interface VehicleImpactPose {
  readonly bounceMeters: number;
  readonly pitchRadians: number;
  readonly rollRadians: number;
}

export function createVehicleImpactState(): VehicleImpactState {
  return { intensity: 0, ageSeconds: 1, side: 0 };
}

/** Starts a short suspension/chassis shudder without changing the vehicle mesh. */
export function triggerVehicleImpact(
  state: VehicleImpactState,
  relativeSpeedMetersPerSecond: number,
  side = 0,
): void {
  if (!Number.isFinite(relativeSpeedMetersPerSecond) || relativeSpeedMetersPerSecond < 1.25) {
    return;
  }
  const intensity = clamp((relativeSpeedMetersPerSecond - 1) / 13, 0.08, 1);
  if (intensity >= state.intensity) {
    state.intensity = intensity;
    state.ageSeconds = 0;
    state.side = Math.sign(side);
  }
}

/** Advances and samples the damped impact animation. */
export function advanceVehicleImpact(
  state: VehicleImpactState,
  deltaSeconds: number,
): VehicleImpactPose {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || state.intensity <= 0) {
    return { bounceMeters: 0, pitchRadians: 0, rollRadians: 0 };
  }
  state.ageSeconds += Math.min(deltaSeconds, 0.1);
  if (state.ageSeconds >= 0.9) {
    state.intensity = 0;
    state.ageSeconds = 1;
    state.side = 0;
    return { bounceMeters: 0, pitchRadians: 0, rollRadians: 0 };
  }
  const envelope = Math.exp(-5.8 * state.ageSeconds);
  const oscillation = Math.sin(state.ageSeconds * 34);
  const wave = state.intensity * envelope * oscillation;
  return {
    bounceMeters: Math.abs(wave) * 0.075,
    pitchRadians: wave * 0.042,
    rollRadians: wave * state.side * 0.09,
  };
}
