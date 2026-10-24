import { describe, expect, it, vi } from 'vitest';

import { LoadingScreen, normalizeLoadingProgress } from '../../src/ui/LoadingScreen';
import { resolveLandscapeLayout } from '../../src/ui/LandscapeFallback';

function makeLoadingDom() {
  const rootAttributes = new Map<string, string>();
  const progressAttributes = new Map<string, string>();
  const classes = new Set<string>();
  const bar = { style: { width: '' } } as unknown as HTMLElement;
  const progress = {
    setAttribute: (name: string, value: string) => progressAttributes.set(name, value),
    removeAttribute: (name: string) => progressAttributes.delete(name),
  } as unknown as HTMLElement;
  const label = { textContent: '' } as unknown as HTMLElement;
  const percent = { textContent: '' } as unknown as HTMLElement;
  const retry = {
    hidden: true,
    addEventListener: vi.fn(),
  } as unknown as HTMLButtonElement;
  const nodes = new Map<string, HTMLElement>([
    ['#loading-progress-fill', bar],
    ['#loading-progress', progress],
    ['#loading-stage-label', label],
    ['#loading-percent', percent],
    ['#loading-retry', retry],
  ]);
  const dataset: Record<string, string> = {};
  const root = {
    hidden: true,
    dataset,
    querySelector: (selector: string) => nodes.get(selector) ?? null,
    setAttribute: (name: string, value: string) => rootAttributes.set(name, value),
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    },
  } as unknown as HTMLElement;
  return { root, rootAttributes, progressAttributes, classes, bar, label, percent, retry, dataset };
}

function stubLoadingWindow() {
  const frames = new Map<number, FrameRequestCallback>();
  const hideTimers: Array<() => void> = [];
  let nextFrameId = 0;
  vi.stubGlobal('window', {
    setTimeout: (callback: () => void) => {
      hideTimers.push(callback);
      return 1;
    },
    clearTimeout: vi.fn(),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    matchMedia: () => ({ matches: false }),
  } as unknown as Window);

  const advanceFrame = (timestamp: number): void => {
    const next = frames.keys().next();
    if (next.done) {
      throw new Error('No loading animation frame is scheduled');
    }
    const callback = frames.get(next.value);
    frames.delete(next.value);
    callback?.(timestamp);
  };

  return { frames, hideTimers, advanceFrame };
}

describe('startup progress', () => {
  it('clamps progress into a monotonic zero-to-one range', () => {
    expect(normalizeLoadingProgress(-2)).toBe(0);
    expect(normalizeLoadingProgress(0.42, 0.2)).toBe(0.42);
    expect(normalizeLoadingProgress(0.1, 0.42)).toBe(0.42);
    expect(normalizeLoadingProgress(4)).toBe(1);
    expect(normalizeLoadingProgress(Number.NaN, 0.6)).toBe(0.6);
  });

  it('advances gradually toward reported progress and completes only on the first playable frame', () => {
    const { frames, hideTimers, advanceFrame } = stubLoadingWindow();

    try {
      const dom = makeLoadingDom();
      const loading = new LoadingScreen(dom.root);
      loading.show();
      loading.update(0.94, 'Starting the simulation…');

      expect(dom.dataset['progressPhase']).toBe('finalizing');
      expect(dom.percent.textContent).toBe('Est. 0%');
      expect(dom.label.textContent).toBe('Finishing the first playable frame…');
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('94');

      for (let timestamp = 0; timestamp <= 1_000; timestamp += 100) {
        advanceFrame(timestamp);
      }
      const afterOneSecond = Number.parseFloat(dom.bar.style.width);
      expect(afterOneSecond).toBeGreaterThan(7);
      expect(afterOneSecond).toBeLessThan(9);
      expect(dom.percent.textContent).toMatch(/^Est\. \d+%$/);
      expect(dom.percent.textContent).not.toContain('-');

      for (let timestamp = 1_100; timestamp <= 5_000 && frames.size > 0; timestamp += 100) {
        advanceFrame(timestamp);
      }
      const afterFiveSeconds = Number.parseFloat(dom.bar.style.width);
      expect(afterFiveSeconds).toBeGreaterThan(40);
      expect(afterFiveSeconds).toBeLessThan(45);

      for (let timestamp = 5_100; timestamp <= 20_000 && frames.size > 0; timestamp += 100) {
        advanceFrame(timestamp);
      }
      expect(dom.bar.style.width).toBe('100%');
      expect(dom.percent.textContent).toBe('Still working…');
      expect(dom.dataset['progressPhase']).toBe('waiting');
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('94');

      loading.update(1, 'Ready — the drive starts automatically');

      expect(dom.root.hidden).toBe(false);
      expect(dom.dataset['state']).toBe('ready');
      expect(dom.dataset['progressPhase']).toBeUndefined();
      expect(dom.percent.textContent).toBe('100%');
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('100');
      expect(dom.progressAttributes.has('aria-valuetext')).toBe(false);
      expect(dom.classes.has('loading-screen-complete')).toBe(true);
      expect(hideTimers).toHaveLength(1);

      hideTimers[0]?.();
      expect(dom.root.hidden).toBe(true);
      expect(dom.rootAttributes.get('aria-hidden')).toBe('true');
      expect(dom.classes.has('loading-screen-complete')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not jump to 88% or pause there when that reported stage stalls', () => {
    const { frames, advanceFrame } = stubLoadingWindow();

    try {
      const dom = makeLoadingDom();
      const loading = new LoadingScreen(dom.root);
      loading.show();
      loading.update(0.88, 'Preparing the starting roads, terrain and trees…');

      for (let timestamp = 0; timestamp <= 1_000; timestamp += 100) {
        advanceFrame(timestamp);
      }
      const afterOneSecond = Number.parseFloat(dom.bar.style.width);
      expect(afterOneSecond).toBeGreaterThan(7);
      expect(afterOneSecond).toBeLessThan(9);
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('88');
      expect(dom.percent.textContent).not.toContain('-');

      for (let timestamp = 1_100; timestamp <= 6_000 && frames.size > 0; timestamp += 100) {
        advanceFrame(timestamp);
      }
      expect(Number.parseFloat(dom.bar.style.width)).toBeGreaterThan(49);
      expect(Number.parseFloat(dom.bar.style.width)).toBeLessThan(53);
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('88');
      expect(frames.size).toBeGreaterThan(0);

      loading.fail('renderer did not start');
      expect(dom.dataset['state']).toBe('error');
      expect(dom.bar.style.width).toBe('88%');
      expect(frames.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('continues the estimated fill when a real startup stage stops reporting progress', () => {
    const { frames, advanceFrame } = stubLoadingWindow();

    try {
      const dom = makeLoadingDom();
      const loading = new LoadingScreen(dom.root);
      loading.show();
      loading.update(0.2, 'Loading the sky and reflections…');

      for (let timestamp = 0; timestamp <= 4_000 && frames.size > 0; timestamp += 100) {
        advanceFrame(timestamp);
      }

      expect(dom.progressAttributes.get('aria-valuenow')).toBe('20');
      expect(Number.parseFloat(dom.bar.style.width)).toBeGreaterThan(20);
      expect(dom.percent.textContent).toMatch(/^Est\. \d+%$/);
      expect(dom.percent.textContent).not.toContain('-');
      expect(frames.size).toBeGreaterThan(0);

      loading.fail('renderer did not start');
      expect(dom.dataset['state']).toBe('error');
      expect(dom.bar.style.width).toBe('20%');
      expect(frames.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('in-page landscape sizing', () => {
  it('swaps logical width and height for a touch device in portrait', () => {
    expect(resolveLandscapeLayout(390, 844, true)).toEqual({
      rotate: true,
      width: 844,
      height: 390,
    });
  });

  it('keeps landscape touch devices and desktop windows unrotated', () => {
    expect(resolveLandscapeLayout(844, 390, true)).toEqual({
      rotate: false,
      width: 844,
      height: 390,
    });
    expect(resolveLandscapeLayout(390, 844, false)).toEqual({
      rotate: false,
      width: 390,
      height: 844,
    });
  });

  it('guards invalid dimensions', () => {
    expect(resolveLandscapeLayout(0, Number.NaN, true)).toEqual({
      rotate: false,
      width: 1,
      height: 1,
    });
  });
});
