import { describe, expect, it, vi } from 'vitest';

import { FullscreenOnStart } from '../../src/ui/FullscreenOnStart';

function createFullscreenDocument(requestFullscreen: () => Promise<void>) {
  const eventTarget = new EventTarget();
  let active = false;
  const documentRef = eventTarget as unknown as Document;
  Object.defineProperty(documentRef, 'documentElement', {
    value: { requestFullscreen },
  });
  Object.defineProperty(documentRef, 'fullscreenElement', {
    get: () => (active ? ({} as Element) : null),
  });
  Object.defineProperty(documentRef, 'defaultView', { value: null });

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
});
