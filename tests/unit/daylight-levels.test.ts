import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG } from '../../src/config/render';
import { scaleBaseline } from '../../src/environment/daylight-levels';

describe('daylight level composition', () => {
  it('treats clock values as multipliers on the configured baselines', () => {
    expect(scaleBaseline(RENDER_CONFIG.lighting.sunIntensity, 1)).toBe(
      RENDER_CONFIG.lighting.sunIntensity,
    );
    expect(scaleBaseline(RENDER_CONFIG.lighting.sunIntensity, 0)).toBe(0);
    expect(scaleBaseline(RENDER_CONFIG.lighting.ambientIntensity, 0.5)).toBeCloseTo(
      RENDER_CONFIG.lighting.ambientIntensity / 2,
    );
  });

  it('keeps the daytime sun brighter than the fill by the configured ratio', () => {
    // A 1:1 sun-to-fill ratio is the wash-out bug: no shadow contrast, milky frame.
    // Noon phase multipliers are 1 by definition (the clock's dayFactor saturates).
    const sun = scaleBaseline(RENDER_CONFIG.lighting.sunIntensity, 1);
    const fill = scaleBaseline(RENDER_CONFIG.lighting.ambientIntensity, 1);
    expect(sun / fill).toBeGreaterThan(3);
  });
});
