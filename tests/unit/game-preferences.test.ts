import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_PREFERENCES,
  GAME_PREFERENCES_STORAGE_KEY,
  readGamePreferences,
  resolveBootWeatherCondition,
  saveGamePreferences,
  STEERING_SENSITIVITY_SCALE,
  type PreferenceStorage,
} from '../../src/config/game-preferences';

class MemoryStorage implements PreferenceStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('persistent game preferences', () => {
  it('uses safe defaults when no stored preferences exist', () => {
    expect(readGamePreferences(new MemoryStorage())).toEqual(DEFAULT_GAME_PREFERENCES);
  });

  it('validates every stored field independently and falls back on unknown values', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      GAME_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        graphicsTier: 'A',
        trafficIntensity: 'unexpected',
        carModel: 'kaminari-gt-roadster',
        cameraMode: 'missing-camera',
        steeringSensitivity: 'responsive',
        touchSteeringMode: 'arrows',
        touchControlScalePercent: 128,
        nightMood: true,
      }),
    );

    expect(readGamePreferences(storage)).toEqual({
      graphicsTier: 'A',
      trafficIntensity: DEFAULT_GAME_PREFERENCES.trafficIntensity,
      carModel: 'kaminari-gt-roadster',
      cameraMode: DEFAULT_GAME_PREFERENCES.cameraMode,
      steeringSensitivity: 'responsive',
      touchSteeringMode: 'arrows',
      touchControlScalePercent: 130,
      nightMood: true,
      weather: DEFAULT_GAME_PREFERENCES.weather,
      carTuning: DEFAULT_GAME_PREFERENCES.carTuning,
    });
  });

  it('defaults older preference records to the night default and rejects malformed night-mood values', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      GAME_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ graphicsTier: 'B', nightMood: 'yes' }),
    );

    expect(readGamePreferences(storage)).toMatchObject({
      graphicsTier: 'B',
      nightMood: true,
    });

    storage.setItem(GAME_PREFERENCES_STORAGE_KEY, JSON.stringify({ nightMood: true }));
    expect(readGamePreferences(storage).nightMood).toBe(true);
  });

  it('constrains touch-control preferences to supported modes and slider sizes', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      GAME_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ touchSteeringMode: 'unknown', touchControlScalePercent: 156 }),
    );
    expect(readGamePreferences(storage)).toMatchObject({
      touchSteeringMode: 'arrows',
      touchControlScalePercent: 140,
    });

    storage.setItem(
      GAME_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ touchSteeringMode: 'arrows', touchControlScalePercent: 67 }),
    );
    expect(readGamePreferences(storage)).toMatchObject({
      touchSteeringMode: 'arrows',
      touchControlScalePercent: 70,
    });
  });

  it('ignores malformed JSON and non-object data', () => {
    const storage = new MemoryStorage();
    storage.setItem(GAME_PREFERENCES_STORAGE_KEY, '{broken');
    expect(readGamePreferences(storage)).toEqual(DEFAULT_GAME_PREFERENCES);
    storage.setItem(GAME_PREFERENCES_STORAGE_KEY, 'null');
    expect(readGamePreferences(storage)).toEqual(DEFAULT_GAME_PREFERENCES);
  });

  it('round-trips a complete preference set', () => {
    const storage = new MemoryStorage();
    const preferences = {
      graphicsTier: 'C',
      trafficIntensity: 'busy',
      carModel: 'kaminari-gt-roadster',
      cameraMode: 'cockpit',
      steeringSensitivity: 'relaxed',
      touchSteeringMode: 'arrows',
      touchControlScalePercent: 135,
      nightMood: true,
      weather: 'storm',
      carTuning: {
        handlingMode: 'sport',
        powerScale: 1.1,
        rideHeightOffsetMeters: -0.01,
        stiffnessScale: 1.1,
        compressionDampingScale: 0.9,
        reboundDampingScale: 1,
        gripScale: 1.05,
        frontBrakeBias: 0.5,
      },
    } as const;

    expect(saveGamePreferences(preferences, storage)).toBe(true);
    expect(readGamePreferences(storage)).toEqual(preferences);
  });

  it('fails safely when storage is unavailable and exposes distinct steering scales', () => {
    const unavailable: PreferenceStorage = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage blocked');
      },
    };

    expect(readGamePreferences(unavailable)).toEqual(DEFAULT_GAME_PREFERENCES);
    expect(saveGamePreferences(DEFAULT_GAME_PREFERENCES, unavailable)).toBe(false);
    expect(STEERING_SENSITIVITY_SCALE.relaxed).toBeLessThan(1);
    expect(STEERING_SENSITIVITY_SCALE.standard).toBe(1);
    expect(STEERING_SENSITIVITY_SCALE.responsive).toBeGreaterThan(1);
  });

  it('keeps the named weather condition saved, defaults it to clear, and rejects unknown values', () => {
    const storage = new MemoryStorage();

    // A device that never chose a weather condition stays dry.
    expect(readGamePreferences(storage).weather).toBe('clear');
    expect(DEFAULT_GAME_PREFERENCES.weather).toBe('clear');

    // An older saved record without a weather field keeps the dry default.
    storage.setItem(GAME_PREFERENCES_STORAGE_KEY, JSON.stringify({ nightMood: true }));
    expect(readGamePreferences(storage).weather).toBe('clear');

    // A saved storm survives the round-trip.
    storage.setItem(GAME_PREFERENCES_STORAGE_KEY, JSON.stringify({ weather: 'rain' }));
    expect(readGamePreferences(storage).weather).toBe('rain');
    const stored = readGamePreferences(storage);
    expect(saveGamePreferences({ ...stored, weather: 'storm' }, storage)).toBe(true);
    expect(readGamePreferences(storage).weather).toBe('storm');

    // Unknown values fall back to clear instead of corrupting the record.
    storage.setItem(GAME_PREFERENCES_STORAGE_KEY, JSON.stringify({ weather: 'hail' }));
    expect(readGamePreferences(storage).weather).toBe('clear');
  });

  it('resolves the boot weather: a launch override beats the saved condition', () => {
    expect(resolveBootWeatherCondition(null, 'rain')).toBe('rain');
    expect(resolveBootWeatherCondition('clear', 'rain')).toBe('clear');
    expect(resolveBootWeatherCondition('storm', 'clear')).toBe('storm');
  });
});
