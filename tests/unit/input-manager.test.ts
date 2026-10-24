import { describe, expect, it } from 'vitest';
import { INPUT_CONFIG, KEY_BINDINGS } from '../../src/config/input';
import { InputManager, type InputTarget } from '../../src/input/InputManager';

/** Minimal event target stand-in so input can be driven without a DOM. */
class FakeTarget implements InputTarget {
  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  count(): number {
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  press(code: string): void {
    this.dispatch('keydown', code);
  }

  release(code: string): void {
    this.dispatch('keyup', code);
  }

  blur(): void {
    this.dispatch('blur');
  }

  private dispatch(type: string, code?: string): void {
    const event = {
      code: code ?? '',
      repeat: false,
      preventDefault: () => {},
    } as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const STEP = 1 / 60;

function advance(manager: InputManager, seconds: number): void {
  const steps = Math.max(1, Math.round(seconds / STEP));
  for (let step = 0; step < steps; step += 1) {
    manager.update(STEP);
  }
}

describe('input manager', () => {
  it('starts neutral and attached state is explicit', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    expect(manager.isAttached).toBe(false);
    expect(manager.actions).toMatchObject({
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
    });

    manager.attach();
    expect(manager.isAttached).toBe(true);
    manager.detach();
    expect(manager.isAttached).toBe(false);
    expect(target.count()).toBe(0);
  });

  it('smooths throttle in instead of snapping it to one', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();
    target.press('KeyW');

    manager.update(STEP);
    const afterOneFrame = manager.actions.throttle;
    expect(afterOneFrame).toBeGreaterThan(0);
    expect(afterOneFrame).toBeLessThan(0.35);

    advance(manager, 0.05);
    const afterShortTime = manager.actions.throttle;
    expect(afterShortTime).toBeGreaterThan(afterOneFrame);
    expect(afterShortTime).toBeLessThan(1);

    advance(manager, 2);
    // The approach is asymptotic, so "fully open" means within a percent.
    expect(manager.actions.throttle).toBeGreaterThan(0.99);
  });

  it('releases throttle faster than it applies it', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();
    target.press('KeyW');
    advance(manager, 2);
    target.release('KeyW');

    advance(manager, 0.05);
    const released = manager.actions.throttle;
    // 0.05 s of a 0.10 s release constant closes about half the gap; the attack constant (0.18 s)
    // would only close a quarter.
    expect(released).toBeLessThan(0.6);
    advance(manager, 1);
    expect(manager.actions.throttle).toBeLessThan(0.01);
  });

  it('applies a response curve so partial input is softer than linear', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();
    target.press('KeyW');

    // Sample early in the ramp: with curveExponent > 1 the curve must sit below the raw ramp.
    manager.update(STEP);
    const curved = manager.actions.throttle;
    const linearRamp = 1 - Math.exp(-STEP / INPUT_CONFIG.throttle.attackSeconds);
    expect(curved).toBeLessThan(linearRamp);
  });

  it('rate-limits steering so it interpolates instead of snapping', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();
    target.press('KeyD');

    manager.update(STEP);
    const first = manager.actions.steer;
    expect(first).toBeGreaterThan(0);
    // One frame can only cover a fraction of the travel: 3.2 units/s at 60 Hz is ~0.053.
    expect(first).toBeLessThan(0.1);

    advance(manager, 0.3);
    expect(manager.actions.steer).toBeGreaterThan(first);
    advance(manager, 2);
    expect(manager.actions.steer).toBeCloseTo(1, 6);
  });

  it('centres the steering faster than it turns', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();

    target.press('KeyD');
    advance(manager, 2);
    expect(manager.actions.steer).toBeCloseTo(1, 6);

    target.release('KeyD');
    advance(manager, 0.2);
    const centred = 1 - manager.actions.steer;
    expect(centred).toBeGreaterThan(0.4);
  });

  it('steers left and right with the documented sign', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();

    target.press('ArrowRight');
    advance(manager, 0.5);
    expect(manager.actions.steer).toBeGreaterThan(0);
    target.release('ArrowRight');

    target.press('ArrowLeft');
    advance(manager, 1);
    expect(manager.actions.steer).toBeLessThan(-0.5);
  });

  it('smooths the handbrake into a boolean', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();
    expect(manager.actions.handbrake).toBe(false);

    target.press('Space');
    manager.update(STEP);
    advance(manager, 0.2);
    expect(manager.actions.handbrake).toBe(true);

    target.release('Space');
    advance(manager, 0.5);
    expect(manager.actions.handbrake).toBe(false);
  });

  it('holds the N₂O boost request with either Shift key and releases it cleanly', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();

    target.press('ShiftLeft');
    manager.update(STEP);
    expect(manager.actions.boost).toBe(true);
    target.release('ShiftLeft');
    manager.update(STEP);
    expect(manager.actions.boost).toBe(false);

    target.press('ShiftRight');
    manager.update(STEP);
    expect(manager.actions.boost).toBe(true);
  });

  it('publishes one-shot reset and camera commands exactly once', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();

    target.press('KeyR');
    target.press('KeyC');
    const actions = manager.actions;
    expect(actions.resetRequested).toBe(true);
    expect(actions.toggleCameraRequested).toBe(true);

    const commands = manager.consumeCommands();
    expect(commands).toEqual({ reset: true, toggleCamera: true });
    expect(manager.consumeCommands()).toEqual({ reset: false, toggleCamera: false });
    expect(manager.actions.resetRequested).toBe(false);

    // Holding the key must not repeat the command.
    target.press('KeyR');
    advance(manager, INPUT_CONFIG.commandLifetimeSeconds * 2);
    expect(manager.consumeCommands().reset).toBe(false);
  });

  it('expires pending commands if the simulation never consumes them', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();
    target.press('KeyR');
    advance(manager, INPUT_CONFIG.commandLifetimeSeconds + 0.05);
    expect(manager.actions.resetRequested).toBe(false);
  });

  it('clears held keys on reset, blur, and detach', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();
    target.press('KeyW');
    target.press('KeyD');
    advance(manager, 1);
    expect(manager.actions.throttle).toBeGreaterThan(0.5);

    manager.reset();
    expect(manager.actions.throttle).toBe(0);
    expect(manager.actions.steer).toBe(0);

    target.press('KeyW');
    advance(manager, 1);
    target.blur();
    expect(manager.actions.throttle).toBe(0);
    // The key is still physically held, so the state clears but the key list does too.
    advance(manager, 1);
    expect(manager.actions.throttle).toBe(0);
  });

  it('supports both WASD and arrow keys', () => {
    for (const code of ['KeyW', 'ArrowUp']) {
      const target = new FakeTarget();
      const manager = new InputManager({ target });
      manager.attach();
      target.press(code);
      advance(manager, 1);
      expect(manager.actions.throttle).toBeGreaterThan(0.9);
      target.release(code);
    }
    for (const code of ['KeyS', 'ArrowDown']) {
      const target = new FakeTarget();
      const manager = new InputManager({ target });
      manager.attach();
      target.press(code);
      advance(manager, 1);
      expect(manager.actions.brake).toBeGreaterThan(0.9);
    }
  });

  it('ignores unrelated keys and events without a code', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();
    target.press('KeyQ');
    target.press('');
    advance(manager, 1);
    expect(manager.actions).toMatchObject({ throttle: 0, brake: 0, steer: 0 });
    expect(manager.consumeCommands()).toEqual({ reset: false, toggleCamera: false });
  });

  it('accepts custom bindings', () => {
    const target = new FakeTarget();
    const manager = new InputManager({
      target,
      bindings: { ...KEY_BINDINGS, throttle: ['KeyI'], resetCar: ['KeyX'] },
    });
    manager.attach();

    target.press('KeyW');
    advance(manager, 1);
    expect(manager.actions.throttle).toBe(0);

    target.press('KeyI');
    advance(manager, 1);
    expect(manager.actions.throttle).toBeGreaterThan(0.9);

    target.press('KeyX');
    expect(manager.consumeCommands().reset).toBe(true);
  });

  it('is defensive about non-positive and non-finite deltas', () => {
    const target = new FakeTarget();
    const manager = new InputManager({ target });
    manager.attach();
    target.press('KeyW');
    manager.update(0);
    manager.update(-1);
    manager.update(Number.NaN);
    expect(Number.isFinite(manager.actions.throttle)).toBe(true);
    expect(manager.actions.throttle).toBe(0);
  });
});
