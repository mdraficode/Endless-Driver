import { describe, expect, it } from 'vitest';

import { InputManager } from '../../src/input/InputManager';
import { joystickSteer, NEUTRAL_TOUCH_STATE, TouchStateTracker } from '../../src/input/touch-state';

/**
 * Mobile driving controls (owner-requested ahead of Phase 8): the joystick mapping, the
 * multi-touch aggregation, and the merge into the same InputManager seam the keyboard
 * uses. DOM behaviour is proven by the headless capture; logic is pinned here.
 */

const STEP = 1 / 60;

function advance(manager: InputManager, seconds: number): void {
  const steps = Math.max(1, Math.round(seconds / STEP));
  for (let step = 0; step < steps; step += 1) {
    manager.update(STEP);
  }
}

describe('joystick steering', () => {
  it('maps deflection to lock with a centre deadzone', () => {
    expect(joystickSteer(0, 52, 0.12)).toBe(0);
    expect(joystickSteer(5, 52, 0.12)).toBe(0); // inside the deadzone
    expect(joystickSteer(52, 52, 0.12)).toBe(1);
    expect(joystickSteer(-52, 52, 0.12)).toBe(-1);
    expect(joystickSteer(200, 52, 0.12)).toBe(1); // clamped past the rim
    const half = joystickSteer(29, 52, 0.12);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
  });
});

describe('multi-touch state tracker', () => {
  it('holds steer and throttle from different pointers at the same time', () => {
    const tracker = new TouchStateTracker();
    tracker.setJoystick(1, -0.8);
    tracker.setPressed('throttle', 2, true);
    const state = tracker.snapshot();
    expect(state.steer).toBeCloseTo(-0.8);
    expect(state.throttle).toBe(true);
    expect(state.brake).toBe(false);
    // Releasing the pedal thumb must not cancel the steering thumb.
    tracker.setPressed('throttle', 2, false);
    expect(tracker.snapshot().steer).toBeCloseTo(-0.8);
    tracker.releaseJoystick(1);
    expect(tracker.snapshot()).toEqual(NEUTRAL_TOUCH_STATE);
  });

  it('keeps a pedal held while any of its pointers remains down', () => {
    const tracker = new TouchStateTracker();
    tracker.setPressed('brake', 3, true);
    tracker.setPressed('brake', 4, true);
    tracker.setPressed('brake', 3, false);
    expect(tracker.snapshot().brake).toBe(true);
    tracker.releaseAll();
    expect(tracker.snapshot()).toEqual(NEUTRAL_TOUCH_STATE);
  });
});

describe('input manager touch merge', () => {
  it('drives throttle and analog steering through the shared smoothing', () => {
    const manager = new InputManager({ target: null });
    manager.setTouchState({ steer: 1, throttle: true, brake: false, handbrake: false });
    advance(manager, 1);
    expect(manager.actions.throttle).toBeGreaterThan(0.9);
    expect(manager.actions.steer).toBeGreaterThan(0.85); // swept by the rate limiter, not snapped
    // Letting go of the joystick returns the wheel to centre.
    manager.setTouchState({ steer: null, throttle: false, brake: false, handbrake: false });
    advance(manager, 1);
    expect(manager.actions.steer).toBeCloseTo(0, 1);
    expect(manager.actions.throttle).toBeCloseTo(0, 1);
  });

  it('queues one-shot commands from on-screen buttons', () => {
    const manager = new InputManager({ target: null });
    manager.requestReset();
    manager.requestToggleCamera();
    expect(manager.consumeCommands()).toEqual({ reset: true, toggleCamera: true });
    expect(manager.consumeCommands()).toEqual({ reset: false, toggleCamera: false });
  });

  it('reset clears a stuck touch state (tab switch with thumbs down)', () => {
    const manager = new InputManager({ target: null });
    manager.setTouchState({ steer: -1, throttle: true, brake: false, handbrake: true });
    advance(manager, 0.5);
    manager.reset();
    advance(manager, 1);
    expect(manager.actions.throttle).toBeCloseTo(0, 1);
    expect(manager.actions.handbrake).toBe(false);
    expect(manager.actions.steer).toBeCloseTo(0, 1);
  });
});
