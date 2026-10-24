/**
 * Phase 2 input tuning and key bindings.
 *
 * Digital keys are converted into normalized analog actions with frame-rate-independent
 * smoothing. Nothing here touches the vehicle: input produces actions, the vehicle consumes them.
 */
export interface AxisSmoothingConfig {
  /** Seconds to reach ~63% of the target when increasing the value. */
  readonly attackSeconds: number;
  /** Seconds to reach ~63% of the target when decreasing the value. */
  readonly releaseSeconds: number;
  /** Response shaping exponent; 1 = linear, >1 = softer initial response. */
  readonly curveExponent: number;
}

export interface SteeringInputConfig {
  /** Maximum rate of change of the steering action, in units per second. */
  readonly ratePerSecond: number;
  /** Rate used when returning toward center with no steering key held. */
  readonly returnRatePerSecond: number;
  /** Extra smoothing applied after the rate limiter, in seconds. */
  readonly smoothingSeconds: number;
}

export interface GamepadInputConfig {
  /** Fraction of stick travel ignored around the centre. */
  readonly deadzone: number;
  /** Centre-softening exponent on stick steering (>1 = finer small inputs). */
  readonly steerExponent: number;
  /**
   * Steering rate (units/second) while a stick is live. Analog targets move
   * with the thumb, so this is far above the keyboard rate: it exists to
   * smooth stick noise, not to interpolate a binary key.
   */
  readonly steerRatePerSecond: number;
}

export interface InputConfig {
  readonly throttle: AxisSmoothingConfig;
  readonly brake: AxisSmoothingConfig;
  readonly handbrake: Omit<AxisSmoothingConfig, 'curveExponent'>;
  readonly steering: SteeringInputConfig;
  readonly gamepad: GamepadInputConfig;
  /** Seconds a discrete command stays pending for the simulation to consume. */
  readonly commandLifetimeSeconds: number;
}

export interface KeyBindings {
  readonly throttle: readonly string[];
  readonly brake: readonly string[];
  readonly steerLeft: readonly string[];
  readonly steerRight: readonly string[];
  readonly handbrake: readonly string[];
  readonly resetCar: readonly string[];
  readonly toggleCamera: readonly string[];
}

export const KEY_BINDINGS: KeyBindings = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  resetCar: ['KeyR'],
  toggleCamera: ['KeyC'],
};

export const INPUT_CONFIG: InputConfig = {
  throttle: { attackSeconds: 0.18, releaseSeconds: 0.1, curveExponent: 1.35 },
  brake: { attackSeconds: 0.12, releaseSeconds: 0.15, curveExponent: 1.2 },
  handbrake: { attackSeconds: 0.05, releaseSeconds: 0.05 },
  steering: {
    ratePerSecond: 4.2,
    returnRatePerSecond: 5,
    smoothingSeconds: 0.045,
  },
  gamepad: { deadzone: 0.14, steerExponent: 1.25, steerRatePerSecond: 14 },
  commandLifetimeSeconds: 0.25,
};

/** Touch-control geometry/tuning for the on-screen driving controls (mobile). */
export interface TouchControlConfig {
  /** Virtual-wheel turn from centre to full steering lock, in radians. */
  readonly steeringWheelMaxRotationRad: number;
  /** Fraction of wheel travel ignored around centre to absorb small thumb tremors. */
  readonly steeringWheelDeadzone: number;
  /** Wheel diameter fraction treated as the centre hub's forgiving horizontal-drag zone. */
  readonly steeringWheelHubRadiusRatio: number;
  /** Wheel diameter fraction needed to drag the hub from centre to full steering lock. */
  readonly steeringWheelDragTravelRatio: number;
}

export const TOUCH_CONTROL_CONFIG: TouchControlConfig = {
  steeringWheelMaxRotationRad: 1.2,
  steeringWheelDeadzone: 0.07,
  steeringWheelHubRadiusRatio: 0.2,
  steeringWheelDragTravelRatio: 0.42,
};
