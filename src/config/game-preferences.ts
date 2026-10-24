import type { CameraMode } from './camera';
import { isTierId, type TierId } from './tiers';

export type GraphicsTierPreference = 'auto' | TierId;
export type TrafficIntensity = 'off' | 'light' | 'standard' | 'busy';
export type PlayerCarModel = 'generic-sport-coupe' | 'kaminari-gt-roadster';
export type SteeringSensitivity = 'relaxed' | 'standard' | 'responsive';

export interface GamePreferences {
  readonly graphicsTier: GraphicsTierPreference;
  readonly trafficIntensity: TrafficIntensity;
  readonly carModel: PlayerCarModel;
  readonly cameraMode: CameraMode;
  readonly steeringSensitivity: SteeringSensitivity;
  /** Persistent live lighting preset; off preserves the daytime default. */
  readonly nightMood: boolean;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const GAME_PREFERENCES_STORAGE_KEY = 'endless-driver:game-preferences:v1';

export const DEFAULT_GAME_PREFERENCES: Readonly<GamePreferences> = {
  graphicsTier: 'auto',
  trafficIntensity: 'standard',
  carModel: 'generic-sport-coupe',
  cameraMode: 'chase',
  steeringSensitivity: 'standard',
  nightMood: false,
};

const TRAFFIC_INTENSITIES: readonly TrafficIntensity[] = ['off', 'light', 'standard', 'busy'];
const CAR_MODELS: readonly PlayerCarModel[] = ['generic-sport-coupe', 'kaminari-gt-roadster'];
const CAMERA_MODES: readonly CameraMode[] = ['chase', 'cockpit', 'orbit'];
const STEERING_SENSITIVITIES: readonly SteeringSensitivity[] = [
  'relaxed',
  'standard',
  'responsive',
];

/** User-facing steering scales applied after the input manager's smoothing. */
export const STEERING_SENSITIVITY_SCALE: Readonly<Record<SteeringSensitivity, number>> = {
  relaxed: 0.78,
  standard: 1,
  responsive: 1.22,
};

function resolveStorage(storage?: PreferenceStorage): PreferenceStorage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseGraphicsTier(value: unknown): GraphicsTierPreference {
  if (value === 'auto') return 'auto';
  if (typeof value === 'string' && isTierId(value)) return value.toUpperCase() as TierId;
  return DEFAULT_GAME_PREFERENCES.graphicsTier;
}

/** Reads and validates persisted options; malformed/blocked storage falls back safely. */
export function readGamePreferences(storage?: PreferenceStorage): GamePreferences {
  const target = resolveStorage(storage);
  if (target === null) return { ...DEFAULT_GAME_PREFERENCES };

  try {
    const raw = target.getItem(GAME_PREFERENCES_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_GAME_PREFERENCES };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_GAME_PREFERENCES };

    return {
      graphicsTier: parseGraphicsTier(parsed['graphicsTier']),
      trafficIntensity: isTrafficIntensity(parsed['trafficIntensity'])
        ? parsed['trafficIntensity']
        : DEFAULT_GAME_PREFERENCES.trafficIntensity,
      carModel: isPlayerCarModel(parsed['carModel'])
        ? parsed['carModel']
        : DEFAULT_GAME_PREFERENCES.carModel,
      cameraMode: CAMERA_MODES.includes(parsed['cameraMode'] as CameraMode)
        ? (parsed['cameraMode'] as CameraMode)
        : DEFAULT_GAME_PREFERENCES.cameraMode,
      steeringSensitivity: isSteeringSensitivity(parsed['steeringSensitivity'])
        ? parsed['steeringSensitivity']
        : DEFAULT_GAME_PREFERENCES.steeringSensitivity,
      nightMood:
        typeof parsed['nightMood'] === 'boolean'
          ? parsed['nightMood']
          : DEFAULT_GAME_PREFERENCES.nightMood,
    };
  } catch {
    return { ...DEFAULT_GAME_PREFERENCES };
  }
}

/** Persists the complete, already-validated options object without breaking private browsing. */
export function saveGamePreferences(
  preferences: GamePreferences,
  storage?: PreferenceStorage,
): boolean {
  const target = resolveStorage(storage);
  if (target === null) return false;
  try {
    target.setItem(GAME_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function isTrafficIntensity(value: unknown): value is TrafficIntensity {
  return TRAFFIC_INTENSITIES.includes(value as TrafficIntensity);
}

export function isPlayerCarModel(value: unknown): value is PlayerCarModel {
  return CAR_MODELS.includes(value as PlayerCarModel);
}

export function isSteeringSensitivity(value: unknown): value is SteeringSensitivity {
  return STEERING_SENSITIVITIES.includes(value as SteeringSensitivity);
}
