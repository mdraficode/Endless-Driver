import type { Quat, Vec3 } from '../shared/vector';

/** Normalized driving intent. Produced by input, consumed by the vehicle. */
export interface VehicleActions {
  /** 0..1 */
  readonly throttle: number;
  /** 0..1; also engages reverse when held at a standstill. */
  readonly brake: number;
  /** -1 (left) .. 1 (right). */
  readonly steer: number;
  readonly handbrake: boolean;
  /** Boost state consumed by the vehicle after the N₂O tank approves a request. */
  readonly boost: boolean;
  readonly resetRequested: boolean;
  readonly toggleCameraRequested: boolean;
}

export const NEUTRAL_ACTIONS: VehicleActions = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  boost: false,
  resetRequested: false,
  toggleCameraRequested: false,
};

/**
 * What the ground under a wheel is made of, as the tire model consumes it. Produced by a
 * generator-side surface query (terrain splat today, road network next) — never read back
 * from a texture, so looks and grip cannot drift.
 */
export interface SurfaceResponse {
  readonly id: string;
  /** Multiplier on the tire model's dry-asphalt friction coefficient. */
  readonly gripModifier: number;
  /** Rolling-resistance coefficient (force per newton of wheel load). */
  readonly rollingResistance: number;
}

/** Resolves the surface at a world (x, z), or `null` for the default asphalt response. */
export type SurfaceProvider = (x: number, z: number) => SurfaceResponse | null;

/** Per-wheel simulation and presentation state. */
export interface WheelState {
  readonly index: number;
  readonly isFront: boolean;
  /** -1 for the left side, +1 for the right side (in body space). */
  readonly side: -1 | 1;
  /** Anchor position in body space. */
  readonly anchor: Vec3;
  inContact: boolean;
  contactPoint: Vec3;
  contactNormal: Vec3;
  /** Distance from anchor to wheel center along the suspension axis. */
  suspensionLength: number;
  /** Suspension compression relative to rest, in meters. */
  compression: number;
  /** Compression after the facet-smoothing lag; this is what the spring pushes on. */
  smoothedCompression: number;
  /** Suspension force applied last step (the slew-rate limiter's memory). */
  suspensionForce: number;
  /** Vertical load carried by the wheel, in newtons (including downforce). */
  normalLoad: number;
  /** Load as the tire model sees it: lightly low-passed so facet spikes cannot
   * modulate grip at step frequency. The spring keeps the true value. */
  tireLoad: number;
  slipAngle: number;
  /** Longitudinal force applied at the contact patch, in newtons. */
  longitudinalForce: number;
  /** Lateral force applied at the contact patch, in newtons. */
  lateralForce: number;
  /** Steering angle applied to this wheel in radians. */
  steerAngle: number;
  /** Accumulated visual rotation in radians. */
  spinAngle: number;
  /** 0..1 estimate of how saturated this tire is (1 = sliding). */
  utilization: number;
  surfaceVelocity: Vec3;
  /** Surface under the contact patch this step ('asphalt' when no provider answered). */
  surfaceId: string;
  /** Grip multiplier from the surface query, applied to this wheel's friction limit. */
  surfaceGripModifier: number;
  /** Rolling-resistance coefficient from the surface query. */
  surfaceRollingResistance: number;
}

export interface VehicleTelemetry {
  readonly speedMps: number;
  readonly speedKph: number;
  /** Signed speed along the chassis forward axis. */
  readonly forwardSpeed: number;
  readonly rpm: number;
  readonly gear: number;
  readonly shifting: boolean;
  readonly throttle: number;
  readonly brake: number;
  readonly handbrake: boolean;
  /** Applied front-wheel steering angle in radians. */
  readonly steerAngle: number;
  readonly contactCount: number;
  /** Mean effective grip multiplier across wheels contacting a surface; `null` when airborne. */
  readonly averageSurfaceGripModifier: number | null;
  /** Mean rolling-resistance coefficient across contacting wheels; `null` when airborne. */
  readonly averageSurfaceRollingResistance: number | null;
  readonly isGrounded: boolean;
  /** Chassis slip angle in radians (positive = sliding right). */
  readonly slipAngle: number;
  readonly lateralAcceleration: number;
  readonly longitudinalAcceleration: number;
  readonly drifting: boolean;
  readonly distanceTravelled: number;
}

export interface WheelVisualState {
  readonly isFront: boolean;
  readonly steerAngle: number;
  readonly spinAngle: number;
  readonly suspensionLength: number;
}

export interface VehiclePose {
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly wheels: readonly WheelVisualState[];
  /** Current brake input, used only for the player vehicle's local rear lamp intensity. */
  readonly brake: number;
}

export const WHEEL_INDEX = {
  frontLeft: 0,
  frontRight: 1,
  rearLeft: 2,
  rearRight: 3,
} as const;
