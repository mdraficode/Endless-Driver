import { describe, expect, it } from 'vitest';

import { normalizeLoadingProgress } from '../../src/ui/LoadingScreen';
import { resolveLandscapeLayout } from '../../src/ui/LandscapeFallback';

describe('startup progress', () => {
  it('clamps progress into a monotonic zero-to-one range', () => {
    expect(normalizeLoadingProgress(-2)).toBe(0);
    expect(normalizeLoadingProgress(0.42, 0.2)).toBe(0.42);
    expect(normalizeLoadingProgress(0.1, 0.42)).toBe(0.42);
    expect(normalizeLoadingProgress(4)).toBe(1);
    expect(normalizeLoadingProgress(Number.NaN, 0.6)).toBe(0.6);
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
