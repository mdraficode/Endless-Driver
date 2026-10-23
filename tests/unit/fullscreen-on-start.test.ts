import { describe, expect, it, vi } from 'vitest';

import { FullscreenOnStart } from '../../src/ui/FullscreenOnStart';

function createFullscreenDocument(
  requestFullscreen: () => Promise<void>,
  orientationLock?: (orientation: string) => Promise<void>,
) {
  const eventTarget = new EventTarget();
  let active = false;
  const documentRef = eventTarget as unknown as Document;
  Object.defineProperty(documentRef, 'documentElement', {
    value: { requestFullscreen },
  });
  Object.defineProperty(documentRef, 'fullscreenElement', {
    get: () => (active ? ({} as Element) : null),
  });
  const defaultView =
    orientationLock === undefined
      ? null
      : ({
          PointerEvent: class PointerEvent {},
          screen: { orientation: { lock: orientationLock } },
        } as unknown as Window);
  Object.defineProperty(documentRef, 'defaultView', { value: defaultView });

  return {
    document: documentRef,
    dispatch(type: string): void {
      eventTarget.dispatchEvent(new Event(type));
    },
    enterFullscreen(): void {
      active = true;
    },
    isFullscreen(): boolean {
      return active;
    },
  };
}

function flushEvents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('fullscreen on game start', () => {
  it('silently retries a denied startup request on the first user gesture', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const fixture = createFullscreenDocument(requestFullscreen);
    enterFullscreen = fixture.enterFullscreen;
    requestFullscreen.mockRejectedValueOnce(new Error('a user gesture is required'));

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(false);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    fixture.dispatch('pointerdown');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);

    // Once entered, the controller disarms so it will not fight a deliberate fullscreen exit.
    fixture.dispatch('keydown');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    fullscreen.dispose();
  });

  it('attempts native landscape orientation lock after fullscreen entry when supported', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const orientationLock = vi.fn(async () => undefined);
    const fixture = createFullscreenDocument(requestFullscreen, orientationLock);
    enterFullscreen = fixture.enterFullscreen;

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(true);
    await flushEvents();

    expect(fixture.isFullscreen()).toBe(true);
    expect(orientationLock).toHaveBeenCalledWith('landscape');
    fullscreen.dispose();
  });

  it('keeps fullscreen successful when native orientation lock is denied', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const orientationLock = vi.fn(async () => {
      throw new Error('orientation lock is unavailable');
    });
    const fixture = createFullscreenDocument(requestFullscreen, orientationLock);
    enterFullscreen = fixture.enterFullscreen;

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(true);
    await flushEvents();

    expect(fixture.isFullscreen()).toBe(true);
    expect(orientationLock).toHaveBeenCalledWith('landscape');
    fullscreen.dispose();
  });
});
