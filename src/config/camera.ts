/**
 * Phase 2 camera configuration: the gameplay chase camera and the debug orbit camera.
 *
 * Damping values are expressed as exponential time constants so behaviour is independent of
 * display refresh rate; a value of 0.15 seconds means roughly 63% of the gap is closed per
 * 0.15 seconds.
 */

/** Which camera the application renders through. */
export type CameraMode = 'chase' | 'orbit';

/**
 * One chase framing (PROJECT_PLAN Phase 2 camera, distance views added on owner
 * request 2026-10-15: "the car is too far away"). Players cycle views with C / 📷;
 * the camera glides between them rather than cutting.
 */
export interface ChaseCameraView {
  readonly id: string;
  /** Short name shown in diagnostics (Close / Normal / Far). */
  readonly label: string;
  /** Camera position offset from the car in car space (behind and above; forward is -Z). */
  readonly offset: readonly [number, number, number];
  /** Look-at point offset from the car in car space. */
  readonly lookOffset: readonly [number, number, number];
  /**
   * Added to the whole speed-scaled FOV band: closer views run a little wider so the
   * car feels big without feeling tunnelled, far views a little tighter.
   */
  readonly fovDelta: number;
}

export const CHASE_CAMERA_VIEWS: readonly ChaseCameraView[] = [
  {
    id: 'close',
    label: 'Close',
    offset: [0, 1.5, 3.8],
    lookOffset: [0, 0.9, -6],
    fovDelta: 5,
  },
  {
    id: 'normal',
    label: 'Normal',
    offset: [0, 2.15, 6.2],
    lookOffset: [0, 1.05, -6],
    fovDelta: 0,
  },
  {
    id: 'far',
    label: 'Far',
    offset: [0, 3.2, 10.2],
    lookOffset: [0, 1.25, -8],
    fovDelta: 0,
  },
];

export interface ChaseCameraConfig {
  /** Selectable distance views, cycled in order; starts at `defaultViewId`. */
  readonly views: readonly ChaseCameraView[];
  readonly defaultViewId: string;
  /** Time constant for gliding between views when the player cycles, seconds. */
  readonly viewTransitionSeconds: number;
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
  views: CHASE_CAMERA_VIEWS,
  defaultViewId: 'far',
  viewTransitionSeconds: 0.45,
  positionLagSeconds: 0.18,
  lookLagSeconds: 0.1,
  headingLagSeconds: 0.28,
  baseFov: 70,
  maxFov: 86,
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
