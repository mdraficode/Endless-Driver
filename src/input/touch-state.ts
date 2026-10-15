import { TOUCH_CONTROL_CONFIG } from '../config/input';
import { clamp } from '../shared/math';

/**
 * The driving state the touch surface publishes to `InputManager`.
 *
 * `steer` is analog (-1..1) while the joystick is held and `null` when no thumb is on
 * it — `null`, not 0, so the keyboard path keeps working untouched on hybrid devices
 * and the rate limiter returns the wheel to centre only when the driver lets go.
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

/**
 * Maps a joystick thumb offset to a steering value: horizontal deflection over the
 * travel radius, dead-zoned at the centre, clamped to the lock. Vertical deflection is
 * deliberately ignored — pedals do the longitudinal work, and a diagonal thumb drift
 * must not brake or accelerate the car by accident.
 */
export function joystickSteer(offsetXPx: number, radiusPx: number, deadzone: number): number {
  const normalized = clamp(offsetXPx / Math.max(1, radiusPx), -1, 1);
  const magnitude = Math.abs(normalized);
  if (magnitude <= deadzone) {
    return 0;
  }
  const scaled = (magnitude - deadzone) / (1 - deadzone);
  return Math.sign(normalized) * clamp(scaled, 0, 1);
}

/**
 * Multi-touch state aggregation: every control tracks the set of pointer ids holding
 * it, so two thumbs (steer + throttle) — or a thumb sliding between pedals — never
 * cancel each other. Pure logic; the DOM surface in `TouchControls.ts` feeds it.
 */
export class TouchStateTracker {
  readonly #joystickPointers = new Map<number, number>();

  readonly #throttlePointers = new Set<number>();

  readonly #brakePointers = new Set<number>();

  readonly #handbrakePointers = new Set<number>();

  /** Registers/updates a joystick pointer with its current steering value. */
  setJoystick(pointerId: number, steer: number): void {
    this.#joystickPointers.set(pointerId, clamp(steer, -1, 1));
  }

  releaseJoystick(pointerId: number): void {
    this.#joystickPointers.delete(pointerId);
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
    this.#joystickPointers.clear();
    this.#throttlePointers.clear();
    this.#brakePointers.clear();
    this.#handbrakePointers.clear();
  }

  snapshot(): TouchDriveState {
    let steer: number | null = null;
    for (const value of this.#joystickPointers.values()) {
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
