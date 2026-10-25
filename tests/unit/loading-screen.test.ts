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

function stubLoadingWindow(prefersReducedMotion = false) {
  const ticks = new Map<number, () => void>();
  const hideTimers: Array<() => void> = [];
  let nextIntervalId = 0;
  let now = 0;
  vi.stubGlobal('window', {
    setTimeout: (callback: () => void) => {
      hideTimers.push(callback);
      return 1;
    },
    clearTimeout: vi.fn(),
    setInterval: (callback: () => void) => {
      const id = ++nextIntervalId;
      ticks.set(id, callback);
      return id;
    },
    clearInterval: (id: number) => ticks.delete(id),
    performance: { now: () => now },
    matchMedia: () => ({ matches: prefersReducedMotion }),
  } as unknown as Window);

  const advanceTime = (timestamp: number): void => {
    const callback = ticks.values().next().value;
    if (callback === undefined) {
      throw new Error('No loading progress timer is scheduled');
    }
    now = timestamp;
    callback();
  };

  return { ticks, hideTimers, advanceTime };
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
    const { ticks, hideTimers, advanceTime } = stubLoadingWindow();

    try {
      const dom = makeLoadingDom();
      const loading = new LoadingScreen(dom.root);
      loading.show();
      loading.update(0.94, 'Starting the simulation…');

      expect(dom.dataset['progressPhase']).toBe('finalizing');
      expect(dom.percent.textContent).toBe('0%');
      expect(dom.label.textContent).toBe('Finishing the first playable frame…');
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('94');

      for (let timestamp = 0; timestamp <= 1_000; timestamp += 100) {
        advanceTime(timestamp);
      }
      const afterOneSecond = Number.parseFloat(dom.bar.style.width);
      expect(afterOneSecond).toBeGreaterThan(14);
      expect(afterOneSecond).toBeLessThan(18);
      expect(dom.percent.textContent).toMatch(/^\d+%$/);
      expect(dom.percent.textContent).not.toContain('-');

      for (let timestamp = 1_100; timestamp <= 5_000 && ticks.size > 0; timestamp += 100) {
        advanceTime(timestamp);
      }
      const afterFiveSeconds = Number.parseFloat(dom.bar.style.width);
      expect(afterFiveSeconds).toBeGreaterThan(78);
      expect(afterFiveSeconds).toBeLessThan(82);

      for (let timestamp = 5_100; timestamp <= 20_000 && ticks.size > 0; timestamp += 100) {
        advanceTime(timestamp);
      }
      expect(dom.bar.style.width).toBe('100%');
      expect(dom.percent.textContent).toBe('Still working…');
      expect(dom.dataset['progressPhase']).toBe('waiting');
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('94');

      loading.update(1, 'Ready — the drive starts automatically');

      expect(dom.root.hidden).toBe(false);
      expect(dom.dataset['state']).toBe('ready');
      expect(dom.dataset['progressPhase']).toBe('complete');
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

  it('accounts for real elapsed time when progress ticks are delayed', () => {
    const { ticks, advanceTime } = stubLoadingWindow();

    try {
      const dom = makeLoadingDom();
      const loading = new LoadingScreen(dom.root);
      loading.show();
      loading.update(0.48, 'Warming the road materials…');

      advanceTime(0);
      advanceTime(5_000);

      const afterThrottledFrames = Number.parseFloat(dom.bar.style.width);
      expect(afterThrottledFrames).toBeGreaterThan(68);
      expect(afterThrottledFrames).toBeLessThan(73);
      expect(dom.percent.textContent).toMatch(/^\d+%$/);
      expect(ticks.size).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('continues progressing beyond a stalled 62% stage', () => {
    const { ticks, advanceTime } = stubLoadingWindow();

    try {
      const dom = makeLoadingDom();
      const loading = new LoadingScreen(dom.root);
      loading.show();
      loading.update(0.62, 'Applying the visual look…');

      for (let timestamp = 0; timestamp <= 5_500; timestamp += 100) {
        advanceTime(timestamp);
      }
      const nearStagePercent = Number.parseFloat(dom.bar.style.width);
      expect(nearStagePercent).toBeGreaterThan(78);
      expect(nearStagePercent).toBeLessThan(83);

      for (let timestamp = 5_600; timestamp <= 6_500; timestamp += 100) {
        advanceTime(timestamp);
      }
      const afterStall = Number.parseFloat(dom.bar.style.width);
      expect(afterStall).toBeGreaterThan(90);
      expect(afterStall).toBeLessThan(95);
      expect(dom.percent.textContent).toMatch(/^\d+%$/);
      expect(ticks.size).toBeGreaterThan(0);

      for (let timestamp = 6_600; timestamp <= 9_000 && ticks.size > 0; timestamp += 100) {
        advanceTime(timestamp);
      }
      expect(dom.bar.style.width).toBe('100%');
      expect(dom.percent.textContent).toBe('Still working…');
      expect(dom.dataset['progressPhase']).toBe('waiting');
      expect(ticks.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('finishes the visible bar before fading after the first playable frame arrives', () => {
    const { ticks, hideTimers, advanceTime } = stubLoadingWindow();

    try {
      const dom = makeLoadingDom();
      const loading = new LoadingScreen(dom.root);
      loading.show();
      loading.update(0.94, 'Starting the simulation…');

      for (let timestamp = 0; timestamp <= 5_000; timestamp += 100) {
        advanceTime(timestamp);
      }
      const beforeFirstFrame = Number.parseFloat(dom.bar.style.width);
      expect(beforeFirstFrame).toBeGreaterThan(78);
      expect(beforeFirstFrame).toBeLessThan(82);

      loading.update(1, 'Ready — the drive starts automatically');

      expect(dom.root.hidden).toBe(false);
      expect(dom.dataset['state']).toBe('loading');
      expect(dom.classes.has('loading-screen-complete')).toBe(false);
      expect(dom.bar.style.width).not.toBe('100%');
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('100');
      expect(dom.label.textContent).toBe('First playable frame ready — finishing up…');
      expect(dom.percent.textContent).toMatch(/^\d+%$/);
      expect(hideTimers).toHaveLength(0);

      for (let timestamp = 5_100; timestamp <= 12_000 && ticks.size > 0; timestamp += 100) {
        advanceTime(timestamp);
      }

      expect(dom.bar.style.width).toBe('100%');
      expect(dom.percent.textContent).toBe('100%');
      expect(dom.label.textContent).toBe('Ready — the drive starts automatically');
      expect(dom.dataset['state']).toBe('ready');
      expect(dom.dataset['progressPhase']).toBe('complete');
      expect(dom.classes.has('loading-screen-complete')).toBe(true);
      expect(dom.progressAttributes.has('aria-valuetext')).toBe(false);
      expect(hideTimers).toHaveLength(1);

      hideTimers[0]?.();
      expect(dom.root.hidden).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not jump to 88% or pause there when that reported stage stalls, even with reduced motion', () => {
    const { ticks, advanceTime } = stubLoadingWindow(true);

    try {
      const dom = makeLoadingDom();
      const loading = new LoadingScreen(dom.root);
      loading.show();
      loading.update(0.88, 'Preparing the starting roads, terrain and trees…');

      for (let timestamp = 0; timestamp <= 1_000; timestamp += 100) {
        advanceTime(timestamp);
      }
      const afterOneSecond = Number.parseFloat(dom.bar.style.width);
      expect(afterOneSecond).toBeGreaterThan(14);
      expect(afterOneSecond).toBeLessThan(18);
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('88');
      expect(dom.percent.textContent).not.toContain('-');
      expect(dom.dataset['progressPhase']).toBe('animating');

      for (let timestamp = 1_100; timestamp <= 6_000 && ticks.size > 0; timestamp += 100) {
        advanceTime(timestamp);
      }
      expect(Number.parseFloat(dom.bar.style.width)).toBeGreaterThan(90);
      expect(Number.parseFloat(dom.bar.style.width)).toBeLessThan(95);
      expect(dom.progressAttributes.get('aria-valuenow')).toBe('88');
      expect(ticks.size).toBeGreaterThan(0);

      loading.fail('renderer did not start');
      expect(dom.dataset['state']).toBe('error');
      expect(dom.bar.style.width).toBe('88%');
      expect(ticks.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('continues the estimated fill when a real startup stage stops reporting progress', () => {
    const { ticks, advanceTime } = stubLoadingWindow();

    try {
      const dom = makeLoadingDom();
      const loading = new LoadingScreen(dom.root);
      loading.show();
      loading.update(0.2, 'Loading the sky and reflections…');

      for (let timestamp = 0; timestamp <= 4_000 && ticks.size > 0; timestamp += 100) {
        advanceTime(timestamp);
      }

      expect(dom.progressAttributes.get('aria-valuenow')).toBe('20');
      expect(Number.parseFloat(dom.bar.style.width)).toBeGreaterThan(20);
      expect(dom.percent.textContent).toMatch(/^\d+%$/);
      expect(dom.percent.textContent).not.toContain('-');
      expect(ticks.size).toBeGreaterThan(0);

      loading.fail('renderer did not start');
      expect(dom.dataset['state']).toBe('error');
      expect(dom.bar.style.width).toBe('20%');
      expect(ticks.size).toBe(0);
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
