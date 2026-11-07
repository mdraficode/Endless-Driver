import { clamp } from '../shared/math';
import type { SurfaceResponse } from '../vehicles/types';
import type { TerrainSurfaceId } from '../world/terrain-surface';

/** The Phase 7 comparison presets. `storm` saturates every surface (wetness 1); dust remains open (the scene has no fog by owner direction, so a dust haze needs a different visibility pass). */
export type WeatherPreset = 'clear' | 'rain' | 'storm';

export const WEATHER_PRESETS: readonly WeatherPreset[] = ['clear', 'rain', 'storm'];

export interface SurfaceState {
  readonly weather: WeatherPreset;
  /** Normalized surface wetness, 0 (dry) to 1 (fully wet). */
  readonly wetness: number;
}

const PRESET_STATES: Readonly<Record<WeatherPreset, SurfaceState>> = {
  clear: { weather: 'clear', wetness: 0 },
  rain: { weather: 'rain', wetness: 0.85 },
  storm: { weather: 'storm', wetness: 1 },
};

interface WetSurfaceResponse {
  /** Fraction of dry grip retained at full wetness. */
  readonly gripRetention: number;
  /** Added rolling-resistance coefficient at full wetness. */
  readonly rollingResistanceIncrease: number;
}

/** Initial conservative coefficients for later Phase 7 telemetry calibration. */
const WET_SURFACE_RESPONSE: Readonly<Record<TerrainSurfaceId, WetSurfaceResponse>> = {
  asphalt: { gripRetention: 0.78, rollingResistanceIncrease: 0.004 },
  gravel: { gripRetention: 0.91, rollingResistanceIncrease: 0.006 },
  soil: { gripRetention: 0.82, rollingResistanceIncrease: 0.012 },
  grass: { gripRetention: 0.88, rollingResistanceIncrease: 0.005 },
  rock: { gripRetention: 0.95, rollingResistanceIncrease: 0.002 },
};

/** Resolve the surface condition for a preset, optionally at a live wetness (the weather transition). */
export function resolveSurfaceState(weather: WeatherPreset, wetness?: number): SurfaceState {
  const base = PRESET_STATES[weather];
  if (wetness === undefined) {
    return base;
  }
  return { weather: base.weather, wetness: clamp(Number.isFinite(wetness) ? wetness : 0, 0, 1) };
}

/** Reads the Phase 7 driving-scene override. Unsupported values safely retain clear conditions. */
export function readWeatherPreset(search: string): WeatherPreset {
  const raw = new URLSearchParams(search).get('weather')?.toLowerCase();
  return WEATHER_PRESETS.includes(raw as WeatherPreset) ? (raw as WeatherPreset) : 'clear';
}

/**
 * Applies the weather condition to the generator's material-derived surface response.
 *
 * This is physics-only in the first increment: dry conditions are bit-for-bit unchanged, and rain
 * reduces grip/increases rolling resistance without changing the sampled surface identity. Rain
 * visuals, time-based wetting/drying, snow, ice and mud remain follow-up Phase 7 work.
 */
export function applySurfaceState(surface: SurfaceResponse, state: SurfaceState): SurfaceResponse {
  const wetness = clamp(Number.isFinite(state.wetness) ? state.wetness : 0, 0, 1);
  if (wetness === 0) {
    return surface;
  }

  const response = WET_SURFACE_RESPONSE[surface.id as TerrainSurfaceId];
  if (response === undefined) {
    return surface;
  }

  return {
    id: surface.id,
    gripModifier: surface.gripModifier * (1 - wetness * (1 - response.gripRetention)),
    rollingResistance: surface.rollingResistance + wetness * response.rollingResistanceIncrease,
  };
}
