import { describe, expect, it } from 'vitest';

import { InputManager } from '../../src/input/InputManager';
import {
  NEUTRAL_TOUCH_STATE,
  SteeringWheelGesture,
  steeringWheelDragSteer,
  steeringWheelSteer,
  TouchStateTracker,
  wrappedAngleDelta,
} from '../../src/input/touch-state';

/**
 * Mobile driving controls (owner-requested ahead of Phase 8): rotary-wheel gesture math,
 * multi-touch aggregation, and merging into the same InputManager seam the keyboard uses.
 * The finger gesture is represented by pure logic so direction and release behavior stay testable.
 */

const STEP = 1 / 60;
const WHEEL_MAX_ROTATION = 1.2;
const WHEEL_DEADZONE = 0.07;

function advance(manager: InputManager, seconds: number): void {
  const steps = Math.max(1, Math.round(seconds / STEP));
  for (let step = 0; step < steps; step += 1) {
    manager.update(STEP);
  }
}

function wheelPoint(centerX: number, centerY: number, radius: number, angle: number) {
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function rimGesture(startAngle: number): SteeringWheelGesture {
  const centerX = 100;
  const centerY = 100;
  const start = wheelPoint(centerX, centerY, 50, startAngle);
  return new SteeringWheelGesture({
    centerX,
    centerY,
    startX: start.x,
    startY: start.y,
    hubRadiusPx: 16,
    dragTravelPx: 60,
    maxRotationRad: WHEEL_MAX_ROTATION,
    deadzone: WHEEL_DEADZONE,
  });
}

function updateAtAngle(wheel: SteeringWheelGesture, angle: number): number {
  const point = wheelPoint(100, 100, 50, angle);
  return wheel.update(point.x, point.y);
}

describe('one-finger steering wheel', () => {
  it('maps clockwise rotation to right steering and counterclockwise to left', () => {
    const wheelRight = rimGesture(-Math.PI / 2);
    let steer = 0;
    for (const angle of [-1.25, -1.0, -0.75, -0.2]) {
      steer = updateAtAngle(wheelRight, angle);
    }
    expect(steer).toBe(1);
    expect(wheelRight.visualRotationRad).toBeCloseTo(WHEEL_MAX_ROTATION);

    const wheelLeft = rimGesture(-Math.PI / 2);
    for (const angle of [-1.85, -2.1, -2.45, -2.8]) {
      steer = updateAtAngle(wheelLeft, angle);
    }
    expect(steer).toBe(-1);
    expect(wheelLeft.visualRotationRad).toBeCloseTo(-WHEEL_MAX_ROTATION);
  });

  it('wraps the rotary gesture across the angular seam without reversing direction', () => {
    const wheel = rimGesture(Math.PI - 0.1);
    const next = wheelPoint(100, 100, 50, -Math.PI + 0.1);
    expect(wheel.update(next.x, next.y)).toBeGreaterThan(0);
    expect(wrappedAngleDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(0.2);
    expect(wrappedAngleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2);
  });

  it('clamps wheel rotation at the steering lock and ignores small tremors', () => {
    expect(steeringWheelSteer(0, WHEEL_MAX_ROTATION, WHEEL_DEADZONE)).toBe(0);
    expect(steeringWheelSteer(WHEEL_MAX_ROTATION * 0.05, WHEEL_MAX_ROTATION, WHEEL_DEADZONE)).toBe(
      0,
    );
    expect(steeringWheelSteer(WHEEL_MAX_ROTATION, WHEEL_MAX_ROTATION, WHEEL_DEADZONE)).toBe(1);
    expect(steeringWheelSteer(-WHEEL_MAX_ROTATION, WHEEL_MAX_ROTATION, WHEEL_DEADZONE)).toBe(-1);
    expect(steeringWheelSteer(WHEEL_MAX_ROTATION * 5, WHEEL_MAX_ROTATION, WHEEL_DEADZONE)).toBe(1);
  });

  it('allows a simple one-finger left/right drag when the finger starts on the centre hub', () => {
    const wheel = new SteeringWheelGesture({
      centerX: 100,
      centerY: 100,
      startX: 100,
      startY: 100,
      hubRadiusPx: 18,
      dragTravelPx: 60,
      maxRotationRad: WHEEL_MAX_ROTATION,
      deadzone: WHEEL_DEADZONE,
    });
    expect(wheel.update(160, 100)).toBe(1);
    expect(wheel.visualRotationRad).toBeCloseTo(WHEEL_MAX_ROTATION);
    expect(wheel.update(40, 100)).toBe(-1);
    expect(wheel.visualRotationRad).toBeCloseTo(-WHEEL_MAX_ROTATION);
    expect(steeringWheelDragSteer(-60, 60, WHEEL_DEADZONE)).toBe(-1);
  });

  it('re-anchors if the rim gesture crosses the hub rather than snapping to the opposite lock', () => {
    const wheel = rimGesture(-Math.PI / 2);
    const pointInHub = { x: 100, y: 100 };
    const acrossHub = wheelPoint(100, 100, 50, Math.PI / 2);
    expect(wheel.update(pointInHub.x, pointInHub.y)).toBe(0);
    expect(wheel.update(acrossHub.x, acrossHub.y)).toBe(0);
    const next = wheelPoint(100, 100, 50, Math.PI / 2 + 0.4);
    expect(wheel.update(next.x, next.y)).toBeGreaterThan(0);
  });
});

describe('multi-touch state tracker', () => {
  it('holds steering and throttle from different pointers at the same time', () => {
    const tracker = new TouchStateTracker();
    tracker.setSteering(1, -0.8);
    tracker.setPressed('throttle', 2, true);
    const state = tracker.snapshot();
    expect(state.steer).toBeCloseTo(-0.8);
    expect(state.throttle).toBe(true);
    expect(state.brake).toBe(false);
    // Releasing the pedal thumb must not cancel the steering thumb.
    tracker.setPressed('throttle', 2, false);
    expect(tracker.snapshot().steer).toBeCloseTo(-0.8);
    tracker.releaseSteering(1);
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
    // Letting go of the wheel returns the steering to centre.
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
