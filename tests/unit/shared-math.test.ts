import { describe, expect, it } from 'vitest';
import {
  clamp,
  clampFrameDelta,
  resolvePixelRatio,
  secondsToMilliseconds,
} from '../../src/shared/math';

describe('clamp', () => {
  it('clamps values into range and passes through in-range values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('tolerates inverted bounds and non-finite input', () => {
    expect(clamp(5, 10, 0)).toBe(5);
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
    expect(clamp(Number.POSITIVE_INFINITY, 2, 8)).toBe(8);
    expect(clamp(5, Number.NaN, Number.NaN)).toBe(5);
  });
});

describe('resolvePixelRatio', () => {
  it('caps high-DPI devices so mobile GPUs never render above the limit', () => {
    expect(resolvePixelRatio(3, 2)).toBe(2);
    expect(resolvePixelRatio(4, 2)).toBe(2);
    expect(resolvePixelRatio(1.5, 2)).toBe(1.5);
    expect(resolvePixelRatio(1, 2)).toBe(1);
  });

  it('falls back to 1 for missing, zero, or invalid values', () => {
    expect(resolvePixelRatio(Number.NaN, 2)).toBe(1);
    expect(resolvePixelRatio(0, 2)).toBe(1);
    expect(resolvePixelRatio(-1, 2)).toBe(1);
    expect(resolvePixelRatio(2, 0)).toBe(1);
    expect(resolvePixelRatio(2, Number.NaN)).toBe(1);
  });
});

describe('clampFrameDelta', () => {
  it('passes ordinary frames through and bounds stalls', () => {
    expect(clampFrameDelta(1 / 60, 0.1)).toBeCloseTo(1 / 60, 10);
    expect(clampFrameDelta(2.5, 0.1)).toBe(0.1);
  });

  it('never returns a negative or non-finite delta', () => {
    expect(clampFrameDelta(-1, 0.1)).toBe(0);
    expect(clampFrameDelta(Number.NaN, 0.1)).toBe(0);
    expect(clampFrameDelta(0.05, Number.NaN)).toBe(0.05);
  });
});

describe('secondsToMilliseconds', () => {
  it('converts seconds and guards non-finite input', () => {
    expect(secondsToMilliseconds(1 / 60)).toBeCloseTo(16.6667, 3);
    expect(secondsToMilliseconds(Number.NaN)).toBe(0);
  });
});
