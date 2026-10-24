import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_PREFERENCES,
  GAME_PREFERENCES_STORAGE_KEY,
  readGamePreferences,
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
    });
  });

  it('defaults older preference records to daytime and rejects malformed night-mood values', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      GAME_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ graphicsTier: 'B', nightMood: 'yes' }),
    );

    expect(readGamePreferences(storage)).toMatchObject({
      graphicsTier: 'B',
      nightMood: false,
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
      touchSteeringMode: 'wheel',
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
});
