import { clamp } from '../shared/math';

/**
 * Standard-mapping gamepad → driving actions (Phase 8 input, pulled forward:
 * the owner plays on desktop with a controller, and analog steer/triggers are
 * the difference between proportional driving and binary keys through a ramp).
 *
 * Mapping (standard layout): left stick X steers, RT (button 7) throttles,
 * LT (button 6) brakes, A (0) or RB (5) is the handbrake, B (1) is N₂O boost,
 * Y (3) resets the car, X (2) cycles the camera. D-pad left/right (14/15)
 * steers digitally as a fallback. Pure and injectable: tests feed fake pads,
 * the browser feeds `navigator.getGamepads()`.
 */
export interface GamepadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

export interface GamepadLike {
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonLike[];
}

export interface GamepadDriveState {
  /** Analog steering -1..1, or `null` when the stick is inside the deadzone. */
  readonly steer: number | null;
  /** Trigger travel 0..1. */
  readonly throttle: number;
  readonly brake: number;
  readonly handbrake: boolean;
  readonly boostPressed: boolean;
  readonly resetPressed: boolean;
  readonly cameraPressed: boolean;
}

export const NEUTRAL_GAMEPAD: GamepadDriveState = {
  steer: null,
  throttle: 0,
  brake: 0,
  handbrake: false,
  boostPressed: false,
  resetPressed: false,
  cameraPressed: false,
};

function button(pad: GamepadLike, index: number): GamepadButtonLike {
  return pad.buttons[index] ?? { pressed: false, value: 0 };
}

function trigger(pad: GamepadLike, index: number): number {
  const b = button(pad, index);
  return clamp(b.value > 0 ? b.value : b.pressed ? 1 : 0, 0, 1);
}

export function readGamepadState(
  pad: GamepadLike | null,
  deadzone: number,
  steerExponent: number,
): GamepadDriveState {
  if (pad === null) {
    return NEUTRAL_GAMEPAD;
  }
  const rawSteer = pad.axes[0] ?? 0;
  let steer: number | null = null;
  if (Math.abs(rawSteer) > deadzone) {
    // Rescale past the deadzone so full travel still reaches full lock, then
    // soften the centre: small corrections stay small (anti-twitch).
    const scaled = (Math.abs(rawSteer) - deadzone) / (1 - deadzone);
    steer = Math.sign(rawSteer) * clamp(scaled, 0, 1) ** steerExponent;
  } else if (button(pad, 14).pressed || button(pad, 15).pressed) {
    steer = (button(pad, 15).pressed ? 1 : 0) - (button(pad, 14).pressed ? 1 : 0);
  }
  return {
    steer,
    throttle: trigger(pad, 7),
    brake: trigger(pad, 6),
    handbrake: button(pad, 0).pressed || button(pad, 5).pressed,
    boostPressed: button(pad, 1).pressed,
    resetPressed: button(pad, 3).pressed || button(pad, 9).pressed,
    cameraPressed: button(pad, 2).pressed,
  };
}

/** First connected pad, or null. Guarded for non-browser/test environments. */
export function pollGamepad(): GamepadLike | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return null;
  }
  for (const pad of navigator.getGamepads()) {
    if (pad !== null && pad.connected) {
      return pad;
    }
  }
  return null;
}
