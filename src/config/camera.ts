/**
 * Gameplay chase/cockpit cameras and the separate debug orbit camera.
 *
 * Damping values are expressed as exponential time constants so behaviour is independent of
 * display refresh rate; a value of 0.15 seconds means roughly 63% of the gap is closed per
 * 0.15 seconds.
 */

/** Which camera the application renders through. */
export type CameraMode = 'chase' | 'cockpit' | 'orbit';

/** Driver-seat camera profile: local eye placement, motion cues, and restrained speed lens. */
export interface CockpitCameraConfig {
  /** Eye position in metres relative to the vehicle body origin (forward is -Z). */
  readonly eyeAnchor: readonly [number, number, number];
  readonly positionLagSeconds: number;
  readonly orientationLagSeconds: number;
  readonly lookLagSeconds: number;
  readonly baseFov: number;
  readonly maxFov: number;
  readonly fovMaxSpeed: number;
  readonly fovLagSeconds: number;
  readonly steeringLookFactor: number;
  readonly maxSteeringLookRadians: number;
  readonly maxLookYawRadians: number;
  readonly maxLookPitchRadians: number;
  readonly lookYawRadiansPerViewportWidth: number;
  readonly lookPitchRadiansPerPixel: number;
  readonly lateralRollFactor: number;
  readonly maxLateralRollRadians: number;
  readonly accelerationPitchFactor: number;
  readonly maxAccelerationPitchRadians: number;
  readonly suspensionPitchFactor: number;
  readonly maxSuspensionPitchRadians: number;
  readonly lateralHeadSwayMetersPerMps2: number;
  readonly longitudinalHeadSwayMetersPerMps2: number;
  readonly maxHeadSwayMeters: number;
  readonly vibrationReferenceSpeed: number;
  readonly vibrationFrequencyHz: number;
  readonly vibrationSpeedFrequencyHz: number;
  readonly vibrationAmplitudeMeters: number;
}

/**
 * Tight cockpit framing: place the eye near the windscreen inside the cabin, slightly toward the
 * centerline so the glass borders frame the view. Only the upper part of the wheel should enter at
 * the bottom. The authored roadster uses its own open-cabin anchor; chassis pitch and roll remain
 * the primary motion cue.
 */
export const COCKPIT_CAMERA_CONFIG: CockpitCameraConfig = {
  eyeAnchor: [-0.05, 0.36, 0.2],
  positionLagSeconds: 0.065,
  orientationLagSeconds: 0.09,
  lookLagSeconds: 0.12,
  baseFov: 70,
  maxFov: 72,
  fovMaxSpeed: 52,
  fovLagSeconds: 0.28,
  steeringLookFactor: 0.18,
  maxSteeringLookRadians: 0.1,
  maxLookYawRadians: 1.22,
  maxLookPitchRadians: 0.56,
  lookYawRadiansPerViewportWidth: Math.PI,
  lookPitchRadiansPerPixel: 0.0034,
  lateralRollFactor: 0.00085,
  maxLateralRollRadians: 0.035,
  accelerationPitchFactor: 0.00055,
  maxAccelerationPitchRadians: 0.016,
  suspensionPitchFactor: 0.09,
  maxSuspensionPitchRadians: 0.018,
  lateralHeadSwayMetersPerMps2: 0.0003,
  longitudinalHeadSwayMetersPerMps2: 0.00016,
  maxHeadSwayMeters: 0.018,
  vibrationReferenceSpeed: 42,
  vibrationFrequencyHz: 7.5,
  vibrationSpeedFrequencyHz: 5,
  vibrationAmplitudeMeters: 0.0022,
};

/** Windshield-focused eye for the open-cabin roadster; its right-hand wheel sits low in view. */
export const FALLBACK_COCKPIT_EYE_ANCHOR = [0.08, 0.84, 0.2] as const;

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
