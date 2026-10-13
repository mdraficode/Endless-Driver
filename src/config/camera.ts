/**
 * Phase 2 camera configuration: the gameplay chase camera and the debug orbit camera.
 *
 * Damping values are expressed as exponential time constants so behaviour is independent of
 * display refresh rate; a value of 0.15 seconds means roughly 63% of the gap is closed per
 * 0.15 seconds.
 */

/** Which camera the application renders through. */
export type CameraMode = 'chase' | 'orbit';

export interface ChaseCameraConfig {
  /** Camera position offset from the car in car space (behind and above; forward is -Z). */
  readonly offset: readonly [number, number, number];
  /** Look-at point offset from the car in car space. */
  readonly lookOffset: readonly [number, number, number];
  /** Time constant for position following; larger = lazier camera. */
  readonly positionLagSeconds: number;
  /** Time constant for look-at following. */
  readonly lookLagSeconds: number;
  /** Time constant for heading following, which creates the lag behind turns. */
  readonly headingLagSeconds: number;
  /** Field of view at rest, in degrees. */
  readonly baseFov: number;
  /** Field of view at or above `fovMaxSpeed`, in degrees. */
  readonly maxFov: number;
  /** Speed in m/s at which the maximum FOV is reached. */
  readonly fovMaxSpeed: number;
  /** Time constant for FOV changes, in seconds. */
  readonly fovLagSeconds: number;
  /** Small roll applied while cornering, in radians per (m/s^2) of lateral acceleration. */
  readonly lateralRollFactor: number;
  readonly maxLateralRoll: number;
}

export const CHASE_CAMERA_CONFIG: ChaseCameraConfig = {
  offset: [0, 2.15, 6.2],
  lookOffset: [0, 1.05, -6],
  positionLagSeconds: 0.18,
  lookLagSeconds: 0.1,
  headingLagSeconds: 0.28,
  baseFov: 62,
  maxFov: 78,
  fovMaxSpeed: 62,
  fovLagSeconds: 0.35,
  lateralRollFactor: 0.006,
  maxLateralRoll: 0.05,
};

/**
 * Debug orbit camera framing while it is the active camera. The camera keeps its own relative
 * offset from the car as the car moves, so the operator can orbit and zoom without the view
 * sliding away.
 */
export const DEBUG_CAMERA_CONFIG = {
  offset: [0, 6, 16] as readonly [number, number, number],
  targetHeight: 1,
} as const;
