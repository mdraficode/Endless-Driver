import { describe, expect, it, vi } from 'vitest';

import { FullscreenOnStart } from '../../src/ui/FullscreenOnStart';

function createFullscreenDocument(
  requestFullscreen: () => Promise<void>,
  orientationLock?: (orientation: string) => Promise<void>,
  supportsPointerEvents = true,
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
  const view: Record<string, unknown> = {};
  if (supportsPointerEvents) {
    view.PointerEvent = class PointerEvent {};
  }
  if (orientationLock !== undefined) {
    view.screen = { orientation: { lock: orientationLock } };
  }
  Object.defineProperty(documentRef, 'defaultView', { value: view as unknown as Window });

  return {
    document: documentRef,
    dispatch(type: string, pointerType?: string, detail?: number): void {
      const event = new Event(type);
      if (pointerType !== undefined) {
        Object.defineProperty(event, 'pointerType', { value: pointerType });
      }
      if (detail !== undefined) {
        Object.defineProperty(event, 'detail', { value: detail });
      }
      eventTarget.dispatchEvent(event);
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
  it('waits for touch pointerup after a denied startup request', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const fixture = createFullscreenDocument(requestFullscreen);
    enterFullscreen = fixture.enterFullscreen;
    requestFullscreen.mockRejectedValueOnce(new Error('a user gesture is required'));

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(false);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    // Touch pointerdown is not a reliable activation event on Android Chrome.
    fixture.dispatch('pointerdown', 'touch');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    // Retry at pointerup, when the touch activation is available.
    fixture.dispatch('pointerup', 'touch');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);

    // Once entered, the controller disarms so it will not fight a deliberate fullscreen exit.
    fixture.dispatch('keydown');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    fullscreen.dispose();
  });

  it('retries fullscreen on a regular page click after the startup request is denied', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const fixture = createFullscreenDocument(requestFullscreen);
    enterFullscreen = fixture.enterFullscreen;
    requestFullscreen.mockRejectedValueOnce(new Error('a user gesture is required'));

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(false);

    fixture.dispatch('click', undefined, 1);
    await flushEvents();

    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);
    fullscreen.dispose();
  });

  it('continues to retry on mouse pointerdown', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const fixture = createFullscreenDocument(requestFullscreen);
    enterFullscreen = fixture.enterFullscreen;
    requestFullscreen.mockRejectedValueOnce(new Error('a user gesture is required'));

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(false);

    fixture.dispatch('pointerdown', 'mouse');
    await flushEvents();

    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);
    fullscreen.dispose();
  });

  it('uses touchend as the fallback when Pointer Events are unavailable', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const fixture = createFullscreenDocument(requestFullscreen, undefined, false);
    enterFullscreen = fixture.enterFullscreen;
    requestFullscreen.mockRejectedValueOnce(new Error('a user gesture is required'));

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(false);

    fixture.dispatch('touchstart');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    fixture.dispatch('touchend');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);
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
