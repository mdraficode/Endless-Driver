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
  readonly resetRequested: boolean;
  readonly toggleCameraRequested: boolean;
}

export const NEUTRAL_ACTIONS: VehicleActions = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  resetRequested: false,
  toggleCameraRequested: false,
};

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
  /** Vertical load carried by the wheel, in newtons (including downforce). */
  normalLoad: number;
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
}

export const WHEEL_INDEX = {
  frontLeft: 0,
  frontRight: 1,
  rearLeft: 2,
  rearRight: 3,
} as const;
