/**
 * Swipe-to-orbit: the pure mapping from screen-space drag to a chase-camera orbit
 * offset (owner request 2026-10-17: "the camera should move when swiping on the
 * free spaces on the screen").
 *
 * The offset is an angle pair around the car, not a position: yaw swings the camera
 * sideways around the car, pitch raises or lowers it. Keeping it relative to the
 * car's heading is what lets the player look at the car's side or grab a higher
 * angle while driving, and still have the view follow the car through the next
 * corner.
 *
 * Convention is "grab the world": the point under the finger travels with the
 * finger. Swiping right swings the camera around to the car's left side; swiping
 * down lifts the camera into a higher, more top-down angle. Limits keep the camera
 * out of the ground and behind the windshield-level view the chase framing needs.
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
  /** Radians of yaw per pixel of horizontal swipe. */
  readonly yawRadiansPerPixel: number;
  /** Radians of pitch per pixel of vertical swipe. */
  readonly pitchRadiansPerPixel: number;
  /** Hard yaw limit either side of the authored framing, radians. */
  readonly maxYawRadians: number;
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
  // A ~220 px swipe across a phone screen swings the camera ~78 degrees around
  // the car: one thumb stroke from dead-astern to nearly broadside.
  yawRadiansPerPixel: 0.0062,
  pitchRadiansPerPixel: 0.0045,
  maxYawRadians: 1.35,
  maxPitchUpRadians: 0.5,
  maxPitchDownRadians: 0.12,
  minElevationRadians: 0.06,
  maxElevationRadians: 1.3,
  smoothingSeconds: 0.12,
};

/** Clamps an orbit offset into the configured box. */
export function clampOrbit(offset: OrbitOffset, config: ChaseOrbitConfig): OrbitOffset {
  return {
    yaw: Math.min(config.maxYawRadians, Math.max(-config.maxYawRadians, offset.yaw)),
    pitch: Math.min(config.maxPitchUpRadians, Math.max(-config.maxPitchDownRadians, offset.pitch)),
  };
}

/**
 * Applies one swipe movement (in pixels) to an orbit offset and clamps the result.
 * Pure: the DOM gesture and the camera both funnel through here, so the feel a
 * test measures is the feel a thumb gets.
 */
export function applyOrbitSwipe(
  offset: OrbitOffset,
  deltaXPixels: number,
  deltaYPixels: number,
  config: ChaseOrbitConfig,
): OrbitOffset {
  return clampOrbit(
    {
      yaw: offset.yaw + deltaXPixels * config.yawRadiansPerPixel,
      pitch: offset.pitch + deltaYPixels * config.pitchRadiansPerPixel,
    },
    config,
  );
}

/**
 * Re-expresses a car-space chase offset with an orbit applied: the offset keeps its
 * length (the view's framing distance) while its azimuth swings by `orbit.yaw` and
 * its elevation rises by `orbit.pitch`, inside the absolute elevation band.
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
  const azimuth = Math.atan2(offset.x, offset.z) + orbit.yaw;
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
