import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  warmupProgressAsymptotic,
  warmupProgressFraction,
  waitForWithinBudget,
} from '../../src/shared/budget';

describe('waitForWithinBudget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the source value when it settles within the budget', async () => {
    let resolveSource: (value: boolean) => void = () => {};
    const source = new Promise<boolean>((resolve) => {
      resolveSource = resolve;
    });

    const settled = waitForWithinBudget(source, 8_000);
    resolveSource(true);
    await vi.advanceTimersByTimeAsync(0);

    await expect(settled).resolves.toBe(true);
  });

  it('resolves with null when the budget expires before the source settles', async () => {
    const source = new Promise<boolean>(() => {});

    const settled = waitForWithinBudget(source, 8_000);
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(settled).resolves.toBeNull();
  });

  it('resolves with null when the source rejects within the budget', async () => {
    const source = Promise.reject(new Error('download failed'));
    // Keep the rejection observed even if the race has already settled by the timeout.
    source.catch(() => undefined);

    const settled = waitForWithinBudget(source, 8_000);
    await vi.advanceTimersByTimeAsync(0);

    await expect(settled).resolves.toBeNull();
  });

  it('still resolves after a late source settlement following a timeout', async () => {
    let resolveSource: (value: string) => void = () => {};
    const source = new Promise<string>((resolve) => {
      resolveSource = resolve;
    });

    const settled = waitForWithinBudget(source, 8_000);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(settled).resolves.toBeNull();

    // The source keeps running in the background; a second waiter with a fresh budget sees it.
    const lateWaiter = waitForWithinBudget(source, 8_000);
    resolveSource('late');
    await vi.advanceTimersByTimeAsync(0);
    await expect(lateWaiter).resolves.toBe('late');
  });
});

describe('warmupProgressFraction', () => {
  it('sits at the lower bound at the start of the window', () => {
    expect(warmupProgressFraction(0, 25_000, 0.87, 0.97)).toBe(0.87);
  });

  it('crawls to the midpoint at the middle of the window', () => {
    expect(warmupProgressFraction(12_500, 25_000, 0.87, 0.97)).toBeCloseTo(0.92, 10);
  });

  it('clamps at the upper bound once the window has elapsed', () => {
    expect(warmupProgressFraction(25_000, 25_000, 0.87, 0.97)).toBe(0.97);
    expect(warmupProgressFraction(99_999, 25_000, 0.87, 0.97)).toBe(0.97);
  });

  it('clamps negative elapsed to the lower bound and a zero window to the upper bound', () => {
    expect(warmupProgressFraction(-500, 25_000, 0.87, 0.97)).toBe(0.87);
    expect(warmupProgressFraction(0, 0, 0.87, 0.97)).toBe(0.97);
  });
});

describe('warmupProgressAsymptotic', () => {
  it('starts at the lower bound and approaches the upper bound without overshooting', () => {
    expect(warmupProgressAsymptotic(0, 45_000, 0.88, 0.97)).toBe(0.88);
    for (const elapsedMs of [60_000, 5 * 60_000, 60 * 60_000]) {
      const value = warmupProgressAsymptotic(elapsedMs, 45_000, 0.88, 0.97);
      expect(value).toBeGreaterThanOrEqual(0.88);
      // The exponential never overshoots; double precision rests it exactly at `to` after ~36τ.
      expect(value).toBeLessThanOrEqual(0.97);
    }
    // A minute in, the bar is already most of the way across the band.
    expect(warmupProgressAsymptotic(60_000, 45_000, 0.88, 0.97)).toBeGreaterThan(0.94);
  });

  it('creeps visibly every 250 ms for as long as the wait lasts', () => {
    const tauMs = 45_000;
    let previous = warmupProgressAsymptotic(0, tauMs, 0.88, 0.97);
    let totalMovement = 0;
    for (let elapsedMs = 250; elapsedMs <= 3 * 60_000; elapsedMs += 250) {
      const value = warmupProgressAsymptotic(elapsedMs, tauMs, 0.88, 0.97);
      expect(value).toBeGreaterThan(previous);
      totalMovement += value - previous;
      previous = value;
    }
    // Three minutes of ticking still moved the bar most of the way across the band.
    expect(totalMovement).toBeGreaterThan(0.07);
  });

  it('clamps negative elapsed to the lower bound and a non-positive tau to the upper bound', () => {
    expect(warmupProgressAsymptotic(-500, 45_000, 0.88, 0.97)).toBe(0.88);
    expect(warmupProgressAsymptotic(1_000, 0, 0.88, 0.97)).toBe(0.97);
  });
});
