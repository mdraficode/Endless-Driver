import { describe, expect, it } from 'vitest';

import { readGamepadState, type GamepadLike } from '../../src/input/gamepad-state';

const DEADZONE = 0.14;
const EXPONENT = 1.25;

function pad(axes: number[], pressed: Record<number, number> = {}): GamepadLike {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: (pressed[index] ?? 0) > 0,
    value: pressed[index] ?? 0,
  }));
  return { axes, buttons };
}

describe('gamepad mapping', () => {
  it('ignores a missing pad and centred sticks', () => {
    expect(readGamepadState(null, DEADZONE, EXPONENT).steer).toBeNull();
    expect(readGamepadState(pad([0.1, 0]), DEADZONE, EXPONENT).steer).toBeNull();
    expect(readGamepadState(pad([0.1, 0]), DEADZONE, EXPONENT).throttle).toBe(0);
  });

  it('maps stick travel past the deadzone to full lock with a soft centre', () => {
    const full = readGamepadState(pad([1, 0]), DEADZONE, EXPONENT);
    expect(full.steer).toBeCloseTo(1, 6);
    const half = readGamepadState(pad([0.57, 0]), DEADZONE, EXPONENT);
    // (0.57-0.14)/0.86 = 0.5 of travel, softened by the exponent.
    expect(half.steer).toBeCloseTo(0.5 ** EXPONENT, 3);
    const left = readGamepadState(pad([-1, 0]), DEADZONE, EXPONENT);
    expect(left.steer).toBeCloseTo(-1, 6);
  });

  it('reads analog triggers and falls back to pressed', () => {
    const analog = readGamepadState(pad([0, 0], { 7: 0.6, 6: 0.25 }), DEADZONE, EXPONENT);
    expect(analog.throttle).toBeCloseTo(0.6, 6);
    expect(analog.brake).toBeCloseTo(0.25, 6);
  });

  it('maps handbrake, N₂O boost, reset, camera and the D-pad fallback', () => {
    const state = readGamepadState(
      pad([0, 0], { 0: 1, 1: 1, 3: 1, 2: 1, 15: 1 }),
      DEADZONE,
      EXPONENT,
    );
    expect(state.handbrake).toBe(true);
    expect(state.boostPressed).toBe(true);
    expect(state.resetPressed).toBe(true);
    expect(state.cameraPressed).toBe(true);
    expect(state.steer).toBe(1);
  });
});
