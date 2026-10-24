import { TOUCH_CONTROL_CONFIG } from '../config/input';
import { clamp } from '../shared/math';

/**
 * The driving state the touch surface publishes to `InputManager`.
 *
 * `steer` is analog (-1..1) while the virtual steering wheel is held and `null` when no thumb is
 * on it — `null`, not 0, so the keyboard path keeps working untouched on hybrid devices and the
 * rate limiter returns the wheel to centre only when the driver lets go.
 */
export interface TouchDriveState {
  readonly steer: number | null;
  readonly throttle: boolean;
  readonly brake: boolean;
  readonly handbrake: boolean;
}

export const NEUTRAL_TOUCH_STATE: TouchDriveState = {
  steer: null,
  throttle: false,
  brake: false,
  handbrake: false,
};

function applySteeringDeadzone(value: number, deadzone: number): number {
  const normalized = clamp(value, -1, 1);
  const magnitude = Math.abs(normalized);
  const safeDeadzone = clamp(deadzone, 0, 0.95);
  if (magnitude <= safeDeadzone) {
    return 0;
  }
  const scaled = (magnitude - safeDeadzone) / (1 - safeDeadzone);
  return Math.sign(normalized) * clamp(scaled, 0, 1);
}

/**
 * Maps rotation of the on-screen wheel to analog steering. Positive clockwise rotation means
 * steering right; the deadzone keeps small finger tremors from nudging the car on a straight.
 */
export function steeringWheelSteer(
  rotationRad: number,
  maxRotationRad: number,
  deadzone: number,
): number {
  return applySteeringDeadzone(
    rotationRad / Math.max(Number.EPSILON, Math.abs(maxRotationRad)),
    deadzone,
  );
}

/** Maps a short horizontal drag that starts on the wheel's centre hub to steering. */
export function steeringWheelDragSteer(
  offsetXPx: number,
  travelPx: number,
  deadzone: number,
): number {
  return applySteeringDeadzone(offsetXPx / Math.max(1, Math.abs(travelPx)), deadzone);
}

/** Returns the shortest signed angular difference, even when a finger crosses the ±π seam. */
export function wrappedAngleDelta(currentAngleRad: number, previousAngleRad: number): number {
  const difference = currentAngleRad - previousAngleRad;
  return Math.atan2(Math.sin(difference), Math.cos(difference));
}

export interface SteeringWheelGestureOptions {
  readonly centerX: number;
  readonly centerY: number;
  readonly startX: number;
  readonly startY: number;
  /** The inner hub is a forgiving horizontal-drag zone; the outer rim uses a rotary gesture. */
  readonly hubRadiusPx: number;
  readonly dragTravelPx: number;
  readonly maxRotationRad: number;
  readonly deadzone: number;
}

/**
 * One-finger virtual steering-wheel gesture, independent of the DOM/pointer-event layer.
 * A finger on the rim accumulates clockwise/counter-clockwise rotation; a finger starting on the
 * hub uses a simpler left/right drag. The wheel angle and steering value clamp at the same lock.
 */
export class SteeringWheelGesture {
  readonly #centerX: number;
  readonly #centerY: number;
  readonly #startX: number;
  readonly #hubRadiusPx: number;
  readonly #dragTravelPx: number;
  readonly #maxRotationRad: number;
  readonly #deadzone: number;
  readonly #hubDrag: boolean;

  #lastAngleRad: number | null;
  #rotationRad = 0;
  #steer = 0;

  constructor(options: SteeringWheelGestureOptions) {
    this.#centerX = options.centerX;
    this.#centerY = options.centerY;
    this.#startX = options.startX;
    this.#hubRadiusPx = Math.max(0, options.hubRadiusPx);
    this.#dragTravelPx = Math.max(1, Math.abs(options.dragTravelPx));
    this.#maxRotationRad = Math.max(Number.EPSILON, Math.abs(options.maxRotationRad));
    this.#deadzone = clamp(options.deadzone, 0, 0.95);

    const offsetX = options.startX - options.centerX;
    const offsetY = options.startY - options.centerY;
    this.#hubDrag = Math.hypot(offsetX, offsetY) <= this.#hubRadiusPx;
    this.#lastAngleRad = this.#hubDrag ? null : Math.atan2(offsetY, offsetX);
  }

  get visualRotationRad(): number {
    return this.#rotationRad;
  }

  /** Updates the gesture from one pointer position and returns normalized steering (-1..1). */
  update(pointerX: number, pointerY: number): number {
    if (this.#hubDrag) {
      this.#steer = steeringWheelDragSteer(
        pointerX - this.#startX,
        this.#dragTravelPx,
        this.#deadzone,
      );
      this.#rotationRad = this.#steer * this.#maxRotationRad;
      return this.#steer;
    }

    const offsetX = pointerX - this.#centerX;
    const offsetY = pointerY - this.#centerY;
    if (Math.hypot(offsetX, offsetY) <= this.#hubRadiusPx) {
      // Re-anchor after crossing the hub instead of interpreting it as a half-turn jump.
      this.#lastAngleRad = null;
      return this.#steer;
    }

    const angleRad = Math.atan2(offsetY, offsetX);
    if (this.#lastAngleRad !== null) {
      this.#rotationRad = clamp(
        this.#rotationRad + wrappedAngleDelta(angleRad, this.#lastAngleRad),
        -this.#maxRotationRad,
        this.#maxRotationRad,
      );
    }
    this.#lastAngleRad = angleRad;
    this.#steer = steeringWheelSteer(this.#rotationRad, this.#maxRotationRad, this.#deadzone);
    return this.#steer;
  }
}

/**
 * Multi-touch state aggregation: each driving control tracks pointer ids independently, so one
 * thumb can steer while another holds a pedal. Pure logic; the DOM surface feeds it.
 */
export class TouchStateTracker {
  readonly #steeringPointers = new Map<number, number>();

  readonly #throttlePointers = new Set<number>();

  readonly #brakePointers = new Set<number>();

  readonly #handbrakePointers = new Set<number>();

  /** Registers/updates a steering-wheel pointer with its current steering value. */
  setSteering(pointerId: number, steer: number): void {
    this.#steeringPointers.set(pointerId, clamp(steer, -1, 1));
  }

  releaseSteering(pointerId: number): void {
    this.#steeringPointers.delete(pointerId);
  }

  setPressed(
    control: 'throttle' | 'brake' | 'handbrake',
    pointerId: number,
    pressed: boolean,
  ): void {
    const pointers =
      control === 'throttle'
        ? this.#throttlePointers
        : control === 'brake'
          ? this.#brakePointers
          : this.#handbrakePointers;
    if (pressed) {
      pointers.add(pointerId);
    } else {
      pointers.delete(pointerId);
    }
  }

  /** Releases every pointer (blur, visibility loss, detach): the car must stop cleanly. */
  releaseAll(): void {
    this.#steeringPointers.clear();
    this.#throttlePointers.clear();
    this.#brakePointers.clear();
    this.#handbrakePointers.clear();
  }

  snapshot(): TouchDriveState {
    let steer: number | null = null;
    for (const value of this.#steeringPointers.values()) {
      steer = value; // Last-registered thumb wins while held.
    }
    return {
      steer,
      throttle: this.#throttlePointers.size > 0,
      brake: this.#brakePointers.size > 0,
      handbrake: this.#handbrakePointers.size > 0,
    };
  }
}

export { TOUCH_CONTROL_CONFIG };
