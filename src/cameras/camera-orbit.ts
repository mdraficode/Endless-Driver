/**
 * Swipe-to-orbit: maps a free-space drag to a chase-camera orbit around the car.
 * One horizontal swipe across the canvas spans a complete 360-degree revolution;
 * yaw wraps continuously so repeated swipes can keep circling without a hard stop.
 */

/** Orbit offset around the car, radians. Zero is the authored chase framing. */
export interface OrbitOffset {
  /** Sideways angle around the car; positive moves the camera to the car's left. */
  readonly yaw: number;
  /** Elevation added to the view's own; positive looks down from higher up. */
  readonly pitch: number;
}

export const NEUTRAL_ORBIT: OrbitOffset = { yaw: 0, pitch: 0 };

export interface ChaseOrbitConfig {
  /** Radians of yaw covered by a horizontal swipe the width of the canvas. */
  readonly yawRadiansPerViewportWidth: number;
  /** Radians of pitch per pixel of vertical swipe. */
  readonly pitchRadiansPerPixel: number;
  /** Minimum smoothed throttle or brake intent treated as the start of driving. */
  readonly driveInputThreshold: number;
  /** Pitch limits relative to the view's own elevation, radians. */
  readonly maxPitchUpRadians: number;
  readonly maxPitchDownRadians: number;
  /** Absolute elevation floor/ceiling for the orbited camera, radians above horizon. */
  readonly minElevationRadians: number;
  readonly maxElevationRadians: number;
  /** Time constant for the camera easing into a new orbit, seconds. */
  readonly smoothingSeconds: number;
}

export const CHASE_ORBIT_CONFIG: ChaseOrbitConfig = {
  yawRadiansPerViewportWidth: Math.PI * 2,
  pitchRadiansPerPixel: 0.0045,
  driveInputThreshold: 0.025,
  maxPitchUpRadians: 0.5,
  maxPitchDownRadians: 0.12,
  minElevationRadians: 0.06,
  maxElevationRadians: 1.3,
  smoothingSeconds: 0.12,
};

/** Wraps an azimuth to [-π, π), preserving a continuous circular camera orbit. */
export function wrapOrbitYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) {
    return 0;
  }
  const turn = Math.PI * 2;
  return ((((yaw + Math.PI) % turn) + turn) % turn) - Math.PI;
}

/** Clamps vertical movement; yaw stays unwrapped so a full turn animates without reversing. */
export function clampOrbit(offset: OrbitOffset, config: ChaseOrbitConfig): OrbitOffset {
  return {
    yaw: offset.yaw,
    pitch: Math.min(config.maxPitchUpRadians, Math.max(-config.maxPitchDownRadians, offset.pitch)),
  };
}

/**
 * Applies one swipe movement in pixels. A drag across the current canvas width is 360°;
 * pitch remains pixel-based and clamped so the camera cannot be swiped into the ground.
 */
export function applyOrbitSwipe(
  offset: OrbitOffset,
  deltaXPixels: number,
  deltaYPixels: number,
  viewportWidthPixels: number,
  config: ChaseOrbitConfig,
): OrbitOffset {
  const viewportWidth = Math.max(1, viewportWidthPixels || 1);
  return clampOrbit(
    {
      yaw: offset.yaw + (deltaXPixels / viewportWidth) * config.yawRadiansPerViewportWidth,
      pitch: offset.pitch + deltaYPixels * config.pitchRadiansPerPixel,
    },
    config,
  );
}

/** True when a fresh throttle or brake/reverse input should recenter the chase camera. */
export function isDriveInputActive(
  throttle: number,
  brake: number,
  config: ChaseOrbitConfig = CHASE_ORBIT_CONFIG,
): boolean {
  return throttle >= config.driveInputThreshold || brake >= config.driveInputThreshold;
}

/** True only on the transition from neutral controls to a new driving input. */
export function shouldRecenterOrbitForDriveStart(
  wasDriveInputActive: boolean,
  throttle: number,
  brake: number,
  config: ChaseOrbitConfig = CHASE_ORBIT_CONFIG,
): boolean {
  return !wasDriveInputActive && isDriveInputActive(throttle, brake, config);
}

/**
 * Re-expresses a car-space chase offset with an orbit applied: the offset keeps its
 * length (the view's framing distance) while its azimuth swings and elevation changes.
 */
export function orbitOffsetVec3(
  offset: { readonly x: number; readonly y: number; readonly z: number },
  orbit: OrbitOffset,
  config: ChaseOrbitConfig,
): { readonly x: number; readonly y: number; readonly z: number } {
  if (orbit.yaw === 0 && orbit.pitch === 0) {
    return offset;
  }
  const radius = Math.hypot(offset.x, offset.y, offset.z);
  if (radius === 0) {
    return offset;
  }
  const azimuth = Math.atan2(offset.x, offset.z) + wrapOrbitYaw(orbit.yaw);
  const elevation = Math.min(
    config.maxElevationRadians,
    Math.max(
      config.minElevationRadians,
      Math.asin(Math.min(1, Math.max(-1, offset.y / radius))) + orbit.pitch,
    ),
  );
  const horizontal = radius * Math.cos(elevation);
  return {
    x: horizontal * Math.sin(azimuth),
    y: radius * Math.sin(elevation),
    z: horizontal * Math.cos(azimuth),
  };
}
