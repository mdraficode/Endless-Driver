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
      eventTarget.dispatchEvent(new Event('fullscreenchange'));
    },
    exitFullscreen(): void {
      active = false;
      eventTarget.dispatchEvent(new Event('fullscreenchange'));
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
    fullscreen.armPassiveRetries(); // the first frame was submitted

    // Touch pointerdown is not a reliable activation event on Android Chrome.
    fixture.dispatch('pointerdown', 'touch');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    // Retry at pointerup, when the touch activation is available.
    fixture.dispatch('pointerup', 'touch');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);

    // While fullscreen is active the controller disarms and does not interfere with the exit key.
    fixture.dispatch('keydown');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    fullscreen.dispose();
  });

  it('keeps passive retries dormant until the first frame arms them', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const fixture = createFullscreenDocument(requestFullscreen);
    enterFullscreen = fixture.enterFullscreen;
    requestFullscreen.mockRejectedValueOnce(new Error('a user gesture is required'));

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(false);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    // Loading-screen taps (the startup shader pre-compile is still running) must not swap the
    // display surface: no fullscreen request while the passive retries are dormant.
    fixture.dispatch('pointerup', 'touch');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(fixture.isFullscreen()).toBe(false);

    // Once the first frame was submitted the same interaction enters fullscreen.
    fullscreen.armPassiveRetries();
    fixture.dispatch('pointerup', 'touch');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);
    fullscreen.dispose();
  });

  it('re-arms for a later page interaction after fullscreen exits', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const fixture = createFullscreenDocument(requestFullscreen);
    enterFullscreen = fixture.enterFullscreen;

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    fullscreen.armPassiveRetries(); // the first frame was submitted

    fixture.exitFullscreen();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    fixture.dispatch('keydown');
    await flushEvents();

    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);
    fullscreen.dispose();
  });

  it('keeps automatic retries armed if a resolved request did not enter fullscreen', async () => {
    let enterFullscreen = (): void => undefined;
    let attempts = 0;
    const requestFullscreen = vi.fn(async () => {
      attempts += 1;
      if (attempts > 1) enterFullscreen();
    });
    const fixture = createFullscreenDocument(requestFullscreen);
    enterFullscreen = fixture.enterFullscreen;

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(false);
    expect(fixture.isFullscreen()).toBe(false);
    fullscreen.armPassiveRetries(); // the first frame was submitted

    fixture.dispatch('click', undefined, 1);
    await flushEvents();

    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);
    fullscreen.dispose();
  });

  it('waits for a regular mouse click instead of requesting before the click activation', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const fixture = createFullscreenDocument(requestFullscreen);
    enterFullscreen = fixture.enterFullscreen;
    requestFullscreen.mockRejectedValueOnce(new Error('a user gesture is required'));

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(false);
    fullscreen.armPassiveRetries(); // the first frame was submitted

    fixture.dispatch('pointerdown', 'mouse');
    await flushEvents();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    fixture.dispatch('click', undefined, 1);
    await flushEvents();

    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(fixture.isFullscreen()).toBe(true);
    fullscreen.dispose();
  });

  it('retries fullscreen on keyboard interaction after the startup request is denied', async () => {
    let enterFullscreen = (): void => undefined;
    const requestFullscreen = vi.fn(async () => enterFullscreen());
    const fixture = createFullscreenDocument(requestFullscreen);
    enterFullscreen = fixture.enterFullscreen;
    requestFullscreen.mockRejectedValueOnce(new Error('a user gesture is required'));

    const fullscreen = new FullscreenOnStart(fixture.document);
    expect(await fullscreen.request()).toBe(false);
    fullscreen.armPassiveRetries(); // the first frame was submitted

    fixture.dispatch('keydown');
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
    fullscreen.armPassiveRetries(); // the first frame was submitted

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
