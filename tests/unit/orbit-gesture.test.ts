import { describe, expect, it } from 'vitest';
import { OrbitGesture } from '../../src/input/orbit-gesture';

/**
 * The swipe surface is the canvas: an EventTarget with an id is enough for the
 * gesture, which only ever adds/removes pointer listeners and reads client
 * coordinates. These tests pin the routing rules a thumb depends on: one orbit
 * pointer at a time, mouse left-button only, and dispose actually detaches (a
 * dispose call in the wrong place once killed the gesture at boot — round 8).
 */
class FakeSurface extends EventTarget {
  readonly id = 'viewport-canvas';

  captures: number[] = [];

  setPointerCapture(pointerId: number): void {
    this.captures.push(pointerId);
  }

  releasePointerCapture(): void {
    // no-op: the gesture only needs the call not to throw
  }
}

function pointer(
  type: string,
  pointerId: number,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event &
    Record<string, unknown>;
  event.pointerId = pointerId;
  event.pointerType = 'touch';
  event.isPrimary = true;
  event.button = 0;
  event.buttons = 1;
  event.clientX = x;
  event.clientY = y;
  for (const [key, value] of Object.entries(extra)) {
    event[key] = value;
  }
  return event as unknown as PointerEvent;
}

function setup() {
  const surface = new FakeSurface();
  const swipes: [number, number][] = [];
  const gesture = new OrbitGesture(surface as unknown as HTMLElement, {
    onSwipe: (dx, dy) => swipes.push([dx, dy]),
  });
  return { surface, swipes, gesture };
}

describe('free-space orbit gesture', () => {
  it('turns a drag into swipe deltas', () => {
    const { surface, swipes } = setup();
    surface.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    surface.dispatchEvent(pointer('pointermove', 1, 130, 90));
    surface.dispatchEvent(pointer('pointermove', 1, 150, 90));
    expect(swipes).toEqual([
      [30, -10],
      [20, 0],
    ]);
  });

  it('stops at pointer up and captures the orbiting pointer', () => {
    const { surface, swipes, gesture } = setup();
    surface.dispatchEvent(pointer('pointerdown', 1, 10, 10));
    expect(gesture.active).toBe(true);
    expect(surface.captures).toEqual([1]);
    surface.dispatchEvent(pointer('pointermove', 1, 40, 10));
    surface.dispatchEvent(pointer('pointerup', 1, 40, 10));
    expect(gesture.active).toBe(false);
    surface.dispatchEvent(pointer('pointermove', 1, 90, 10));
    expect(swipes).toEqual([[30, 0]]);
  });

  it('orbits with one pointer at a time', () => {
    const { surface, swipes } = setup();
    surface.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    surface.dispatchEvent(pointer('pointerdown', 2, 200, 100));
    surface.dispatchEvent(pointer('pointermove', 2, 260, 100));
    expect(swipes).toHaveLength(0);
    surface.dispatchEvent(pointer('pointermove', 1, 120, 100));
    expect(swipes).toEqual([[20, 0]]);
  });

  it('ignores mouse drags that are not the primary button', () => {
    const { surface, swipes } = setup();
    surface.dispatchEvent(pointer('pointerdown', 3, 100, 100, { pointerType: 'mouse', button: 2 }));
    surface.dispatchEvent(pointer('pointermove', 3, 160, 100, { pointerType: 'mouse' }));
    expect(swipes).toHaveLength(0);
  });

  it('detaches on dispose: the round-8 boot-kill regression', () => {
    const { surface, swipes, gesture } = setup();
    gesture.dispose();
    surface.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    surface.dispatchEvent(pointer('pointermove', 1, 160, 100));
    expect(swipes).toHaveLength(0);
    expect(gesture.active).toBe(false);
  });
});
