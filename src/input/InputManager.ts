import { INPUT_CONFIG, KEY_BINDINGS, type InputConfig, type KeyBindings } from '../config/input';
import { clamp } from '../shared/math';
import { smoothingFactor } from '../shared/vector';
import { NEUTRAL_ACTIONS, type VehicleActions } from '../vehicles/types';
import {
  NEUTRAL_GAMEPAD as NEUTRAL_GAMEPAD_STATE,
  pollGamepad,
  readGamepadState,
  type GamepadLike,
} from './gamepad-state';
import type { TouchDriveState } from './touch-state';

export interface InputManagerOptions {
  readonly config?: InputConfig;
  readonly bindings?: KeyBindings;
  /** Event target; defaults to `window` when available. Injectable for tests. */
  readonly target?: InputTarget | null;
  /** Gamepad source; defaults to polling `navigator.getGamepads`. Injectable for tests. */
  readonly gamepadProvider?: () => GamepadLike | null;
}

/** Minimal surface this manager needs from the DOM, so tests can supply a stub. */
export interface InputTarget {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: EventListenerOptions,
  ): void;
}

/** Applies a shaping exponent to a normalized axis value without changing its sign. */
function shapeAxis(value: number, exponent: number | undefined): number {
  if (exponent === undefined || exponent === 1) {
    return value;
  }
  return Math.sign(value) * Math.abs(value) ** exponent;
}

export interface InputCommands {
  readonly reset: boolean;
  readonly toggleCamera: boolean;
}

interface CommandState {
  remaining: number;
}

/**
 * Turns digital keyboard state into normalized analog driving actions.
 *
 * Three layers of smoothing sit between the keys and the car, which is what makes keyboard
 * driving feel analog rather than binary:
 * 1. asymmetric attack/release smoothing on throttle and brake, with a response curve;
 * 2. a steering rate limiter so a key press interpolates the steering angle instead of snapping;
 * 3. a final exponential smoothing pass on steering.
 *
 * All smoothing is frame-rate independent (exponential time constants), so a 144 Hz display and
 * a 30 Hz display produce the same car behaviour. Input never moves the car; it only publishes
 * actions that the vehicle consumes on the next fixed step.
 */
export class InputManager {
  readonly #config: InputConfig;
  readonly #bindings: KeyBindings;
  readonly #target: InputTarget | null;
  readonly #gamepadProvider: () => GamepadLike | null;
  readonly #pressed = new Set<string>();
  #padResetHeld = false;
  #padCameraHeld = false;
  #gamepadLive = false;
  readonly #resetCommand: CommandState = { remaining: 0 };
  readonly #cameraCommand: CommandState = { remaining: 0 };
  #throttle = 0;
  #brake = 0;
  #handbrake = 0;
  #steerRaw = 0;
  #steer = 0;
  #attached = false;
  #touch: TouchDriveState | null = null;

  constructor(options: InputManagerOptions = {}) {
    this.#config = options.config ?? INPUT_CONFIG;
    this.#bindings = options.bindings ?? KEY_BINDINGS;
    this.#target =
      options.target !== undefined ? options.target : typeof window === 'undefined' ? null : window;
    this.#gamepadProvider = options.gamepadProvider ?? pollGamepad;
  }

  /** True while a gamepad is connected and being read. */
  get gamepadConnected(): boolean {
    return this.#gamepadLive;
  }

  get isAttached(): boolean {
    return this.#attached;
  }

  get actions(): VehicleActions {
    // The stored axes are linear ramps; the response curve is applied on read so the ramp's
    // exponential approach is not distorted by re-feeding a shaped value into it.
    const { throttle, brake } = this.#config;
    return {
      throttle: shapeAxis(this.#throttle, throttle.curveExponent),
      brake: shapeAxis(this.#brake, brake.curveExponent),
      steer: this.#steer,
      handbrake: this.#handbrake > 0.5,
      resetRequested: this.#resetCommand.remaining > 0,
      toggleCameraRequested: this.#cameraCommand.remaining > 0,
    };
  }

  attach(): void {
    if (this.#attached || !this.#target) {
      return;
    }
    this.#attached = true;
    this.#target.addEventListener('keydown', this.#handleKeyDown);
    this.#target.addEventListener('keyup', this.#handleKeyUp);
    this.#target.addEventListener('blur', this.#handleBlur);
    this.#target.addEventListener('visibilitychange', this.#handleVisibilityChange);
  }

  detach(): void {
    if (!this.#attached || !this.#target) {
      return;
    }
    this.#attached = false;
    this.#target.removeEventListener('keydown', this.#handleKeyDown);
    this.#target.removeEventListener('keyup', this.#handleKeyUp);
    this.#target.removeEventListener('blur', this.#handleBlur);
    this.#target.removeEventListener('visibilitychange', this.#handleVisibilityChange);
    this.reset();
  }

  /** Clears all held keys and accumulated axis values (pause, blur, tab switch). */
  reset(): void {
    this.#touch = null;
    this.#pressed.clear();
    this.#throttle = 0;
    this.#brake = 0;
    this.#handbrake = 0;
    this.#steerRaw = 0;
    this.#steer = 0;
  }

  /**
   * Publishes the touch surface's current state (or clears it with `null`). Touch and
   * keyboard merge in `update`: either device can drive, neither has to know about the
   * other. Called by `TouchControls` whenever a thumb moves.
   */
  setTouchState(state: TouchDriveState | null): void {
    this.#touch = state;
  }

  /** One-shot commands for on-screen buttons (keyboard queues them from key events). */
  requestReset(): void {
    this.#resetCommand.remaining = this.#config.commandLifetimeSeconds;
  }

  requestToggleCamera(): void {
    this.#cameraCommand.remaining = this.#config.commandLifetimeSeconds;
  }

  /** Advances smoothing. Call once per rendered frame before the physics update. */
  update(deltaSeconds: number): void {
    const config = this.#config;
    const dt = deltaSeconds > 0 ? deltaSeconds : 0;
    const touch = this.#touch;

    // Gamepad first: polled every frame (the API has no events worth trusting),
    // merged with keyboard/touch below — any device can drive, none blocks another.
    const pad = readGamepadState(
      this.#gamepadProvider(),
      config.gamepad.deadzone,
      config.gamepad.steerExponent,
    );
    this.#gamepadLive = pad !== NEUTRAL_GAMEPAD_STATE;
    if (pad.resetPressed && !this.#padResetHeld) {
      this.#resetCommand.remaining = config.commandLifetimeSeconds;
    }
    if (pad.cameraPressed && !this.#padCameraHeld) {
      this.#cameraCommand.remaining = config.commandLifetimeSeconds;
    }
    this.#padResetHeld = pad.resetPressed;
    this.#padCameraHeld = pad.cameraPressed;

    const throttleTarget = Math.max(
      this.#isAnyPressed(this.#bindings.throttle) || touch?.throttle ? 1 : 0,
      pad.throttle,
    );
    const brakeTarget = Math.max(
      this.#isAnyPressed(this.#bindings.brake) || touch?.brake ? 1 : 0,
      pad.brake,
    );
    const handbrakeTarget =
      this.#isAnyPressed(this.#bindings.handbrake) || touch?.handbrake || pad.handbrake ? 1 : 0;

    this.#throttle = this.#smoothAxis(this.#throttle, throttleTarget, dt, config.throttle);
    this.#brake = this.#smoothAxis(this.#brake, brakeTarget, dt, config.brake);
    this.#handbrake = this.#smoothAxis(this.#handbrake, handbrakeTarget, dt, config.handbrake);

    // Steering: symmetric input, asymmetric rates (centering is faster than turning).
    // A held touch steering wheel publishes an analog target through the same rate limiter,
    // so the in-game steering sweeps with the user's turn instead of snapping to it.
    const keyboardSteer =
      (this.#isAnyPressed(this.#bindings.steerRight) ? 1 : 0) -
      (this.#isAnyPressed(this.#bindings.steerLeft) ? 1 : 0);
    const steerTarget = pad.steer ?? touch?.steer ?? keyboardSteer;
    const rate =
      steerTarget === 0
        ? config.steering.returnRatePerSecond
        : pad.steer !== null
          ? config.gamepad.steerRatePerSecond
          : config.steering.ratePerSecond;
    const maxStep = rate * dt;
    const delta = clamp(steerTarget - this.#steerRaw, -maxStep, maxStep);
    this.#steerRaw = clamp(this.#steerRaw + delta, -1, 1);
    this.#steer = clamp(
      this.#steer +
        (this.#steerRaw - this.#steer) * smoothingFactor(dt, config.steering.smoothingSeconds),
      -1,
      1,
    );

    this.#decayCommand(this.#resetCommand, dt);
    this.#decayCommand(this.#cameraCommand, dt);
  }

  /** Returns pending one-shot commands and clears them. */
  consumeCommands(): InputCommands {
    const commands: InputCommands = {
      reset: this.#resetCommand.remaining > 0,
      toggleCamera: this.#cameraCommand.remaining > 0,
    };
    this.#resetCommand.remaining = 0;
    this.#cameraCommand.remaining = 0;
    return commands;
  }

  /** Linear, frame-rate-independent ramp toward the digital target. */
  #smoothAxis(
    current: number,
    target: number,
    dt: number,
    axis: { attackSeconds: number; releaseSeconds: number },
  ): number {
    const increasing = target > current;
    const timeConstant = increasing ? axis.attackSeconds : axis.releaseSeconds;
    const factor = smoothingFactor(dt, timeConstant);
    return clamp(current + (target - current) * factor, 0, 1);
  }

  #decayCommand(command: CommandState, dt: number): void {
    if (command.remaining > 0) {
      command.remaining = Math.max(0, command.remaining - dt);
    }
  }

  #isAnyPressed(codes: readonly string[]): boolean {
    for (const code of codes) {
      if (this.#pressed.has(code)) {
        return true;
      }
    }
    return false;
  }

  #handleKeyDown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.code) {
      return;
    }
    if (this.#isDrivingKey(keyboardEvent.code)) {
      // Stop arrows and space from scrolling the page.
      keyboardEvent.preventDefault?.();
    }
    this.#pressed.add(keyboardEvent.code);

    if (!keyboardEvent.repeat) {
      if (this.#bindings.resetCar.includes(keyboardEvent.code)) {
        this.#resetCommand.remaining = this.#config.commandLifetimeSeconds;
      }
      if (this.#bindings.toggleCamera.includes(keyboardEvent.code)) {
        this.#cameraCommand.remaining = this.#config.commandLifetimeSeconds;
      }
    }
  };

  #handleKeyUp = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.code) {
      this.#pressed.delete(keyboardEvent.code);
    }
  };

  #handleBlur = (): void => {
    this.reset();
  };

  #handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.hidden) {
      this.reset();
    }
  };

  #isDrivingKey(code: string): boolean {
    const bindings = this.#bindings;
    return (
      bindings.throttle.includes(code) ||
      bindings.brake.includes(code) ||
      bindings.steerLeft.includes(code) ||
      bindings.steerRight.includes(code) ||
      bindings.handbrake.includes(code)
    );
  }
}

export { NEUTRAL_ACTIONS };
