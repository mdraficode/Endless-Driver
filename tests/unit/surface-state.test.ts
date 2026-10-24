import { describe, expect, it } from 'vitest';

import {
  applySurfaceState,
  readWeatherPreset,
  resolveSurfaceState,
} from '../../src/environment/SurfaceState';
import type { SurfaceResponse } from '../../src/vehicles/types';

const DRY_SURFACES: readonly SurfaceResponse[] = [
  { id: 'asphalt', gripModifier: 1, rollingResistance: 0.015 },
  { id: 'gravel', gripModifier: 0.72, rollingResistance: 0.045 },
  { id: 'soil', gripModifier: 0.74, rollingResistance: 0.05 },
  { id: 'grass', gripModifier: 0.8, rollingResistance: 0.035 },
  { id: 'rock', gripModifier: 0.95, rollingResistance: 0.02 },
];

describe('Phase 7 surface-state response', () => {
  it('keeps the clear preset identical to the authored dry surface response', () => {
    const clear = resolveSurfaceState('clear');
    for (const surface of DRY_SURFACES) {
      expect(applySurfaceState(surface, clear)).toBe(surface);
    }
  });

  it('reduces grip and increases rolling resistance on every sampled surface in rain', () => {
    const rain = resolveSurfaceState('rain');
    for (const surface of DRY_SURFACES) {
      const wet = applySurfaceState(surface, rain);
      expect(wet.id).toBe(surface.id);
      expect(wet.gripModifier).toBeLessThan(surface.gripModifier);
      expect(wet.rollingResistance).toBeGreaterThan(surface.rollingResistance);
    }
  });

  it('clamps invalid wetness and leaves unknown surface ids unchanged', () => {
    const asphalt = DRY_SURFACES[0]!;
    const invalidWetness = applySurfaceState(asphalt, { weather: 'rain', wetness: Number.NaN });
    expect(invalidWetness).toBe(asphalt);
    expect(
      applySurfaceState(asphalt, { weather: 'rain', wetness: 2 }).gripModifier,
    ).toBeGreaterThan(0);

    const unknown: SurfaceResponse = { id: 'unknown', gripModifier: 0.5, rollingResistance: 0.1 };
    expect(applySurfaceState(unknown, resolveSurfaceState('rain'))).toBe(unknown);
  });

  it('parses only the supported fixed comparison presets', () => {
    expect(readWeatherPreset('?weather=rain')).toBe('rain');
    expect(readWeatherPreset('?weather=clear')).toBe('clear');
    expect(readWeatherPreset('')).toBe('clear');
    expect(readWeatherPreset('?weather=snow')).toBe('clear');
  });
});
