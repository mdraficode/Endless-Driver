import type { CameraMode } from './camera';
import { isTierId, type TierId } from './tiers';
import {
  CAR_TUNING_LIMITS,
  DEFAULT_CAR_TUNING,
  type CarTuning,
  type HandlingMode,
} from './vehicle';

export type GraphicsTierPreference = 'auto' | TierId;
export type TrafficIntensity = 'off' | 'light' | 'standard' | 'busy';
export type PlayerCarModel = 'generic-sport-coupe' | 'kaminari-gt-roadster';
export type SteeringSensitivity = 'relaxed' | 'standard' | 'responsive';
export type TouchSteeringMode = 'wheel' | 'arrows';
/** The named weather condition (Phase 8 settings slice); structurally the runtime WeatherPreset. */
export type WeatherPreference = 'clear' | 'rain' | 'storm';

export const TOUCH_CONTROL_SCALE_MIN_PERCENT = 70;
export const TOUCH_CONTROL_SCALE_MAX_PERCENT = 140;
export const TOUCH_CONTROL_SCALE_STEP_PERCENT = 5;

export interface GamePreferences {
  readonly graphicsTier: GraphicsTierPreference;
  readonly trafficIntensity: TrafficIntensity;
  readonly carModel: PlayerCarModel;
  readonly cameraMode: CameraMode;
  readonly steeringSensitivity: SteeringSensitivity;
  /** Live touch-only steering layout; desktop keyboard/gamepad inputs are unchanged. */
  readonly touchSteeringMode: TouchSteeringMode;
  /** Percentage size for on-screen driving controls, constrained to the menu slider range. */
  readonly touchControlScalePercent: number;
  /** Persistent live lighting preset; off preserves the daytime default. */
  readonly nightMood: boolean;
  /** Named weather condition for the next launch; applies live in the menu, no restart. */
  readonly weather: WeatherPreference;
  /**
   * Phase 12.1 — handling mode + tuning sliders. Applies live to the running car;
   * older saved objects have no field and fall back to the arcade defaults.
   */
  readonly carTuning: CarTuning;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const GAME_PREFERENCES_STORAGE_KEY = 'endless-driver:game-preferences:v1';

/**
 * First-run defaults (owner direction, 2026-11-02): new devices start in the night mood with
 * the relaxing drive setup — smooth steering, arrow buttons at 120 % size, the centred chase
 * camera. Devices that already saved preferences keep exactly what they saved; only the
 * missing fields fall back to these values.
 */
export const DEFAULT_GAME_PREFERENCES: Readonly<GamePreferences> = {
  graphicsTier: 'auto',
  trafficIntensity: 'standard',
  carModel: 'generic-sport-coupe',
  cameraMode: 'chase',
  steeringSensitivity: 'relaxed',
  touchSteeringMode: 'arrows',
  touchControlScalePercent: 120,
  nightMood: true,
  weather: 'clear',
  carTuning: { ...DEFAULT_CAR_TUNING },
};

const TRAFFIC_INTENSITIES: readonly TrafficIntensity[] = ['off', 'light', 'standard', 'busy'];
const CAR_MODELS: readonly PlayerCarModel[] = ['generic-sport-coupe', 'kaminari-gt-roadster'];
const CAMERA_MODES: readonly CameraMode[] = ['chase', 'cockpit', 'orbit'];
const STEERING_SENSITIVITIES: readonly SteeringSensitivity[] = [
  'relaxed',
  'standard',
  'responsive',
];
const TOUCH_STEERING_MODES: readonly TouchSteeringMode[] = ['wheel', 'arrows'];
const WEATHER_CONDITIONS: readonly WeatherPreference[] = ['clear', 'rain', 'storm'];
const HANDLING_MODES: readonly HandlingMode[] = ['arcade', 'balanced', 'sport'];

function clampToStep(
  value: unknown,
  limits: { min: number; max: number; step: number },
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const snapped = Math.round((value - limits.min) / limits.step) * limits.step + limits.min;
  return Math.min(limits.max, Math.max(limits.min, snapped));
}

/** Phase 12.1 — parses a persisted tuning object; every field falls back independently. */
export function parseCarTuning(value: unknown): CarTuning {
  if (!isRecord(value)) return { ...DEFAULT_CAR_TUNING };
  return {
    handlingMode: isHandlingMode(value['handlingMode'])
      ? value['handlingMode']
      : DEFAULT_CAR_TUNING.handlingMode,
    powerScale: clampToStep(
      value['powerScale'],
      CAR_TUNING_LIMITS.powerScale,
      DEFAULT_CAR_TUNING.powerScale,
    ),
    rideHeightOffsetMeters: clampToStep(
      value['rideHeightOffsetMeters'],
      CAR_TUNING_LIMITS.rideHeightOffsetMeters,
      DEFAULT_CAR_TUNING.rideHeightOffsetMeters,
    ),
    stiffnessScale: clampToStep(
      value['stiffnessScale'],
      CAR_TUNING_LIMITS.stiffnessScale,
      DEFAULT_CAR_TUNING.stiffnessScale,
    ),
    compressionDampingScale: clampToStep(
      value['compressionDampingScale'],
      CAR_TUNING_LIMITS.compressionDampingScale,
      DEFAULT_CAR_TUNING.compressionDampingScale,
    ),
    reboundDampingScale: clampToStep(
      value['reboundDampingScale'],
      CAR_TUNING_LIMITS.reboundDampingScale,
      DEFAULT_CAR_TUNING.reboundDampingScale,
    ),
    gripScale: clampToStep(
      value['gripScale'],
      CAR_TUNING_LIMITS.gripScale,
      DEFAULT_CAR_TUNING.gripScale,
    ),
    frontBrakeBias: clampToStep(
      value['frontBrakeBias'],
      CAR_TUNING_LIMITS.frontBrakeBias,
      DEFAULT_CAR_TUNING.frontBrakeBias,
    ),
  };
}

export function isHandlingMode(value: unknown): value is HandlingMode {
  return HANDLING_MODES.includes(value as HandlingMode);
}

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

function parseTouchControlScalePercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_GAME_PREFERENCES.touchControlScalePercent;
  }
  const snapped =
    Math.round(value / TOUCH_CONTROL_SCALE_STEP_PERCENT) * TOUCH_CONTROL_SCALE_STEP_PERCENT;
  return Math.min(
    TOUCH_CONTROL_SCALE_MAX_PERCENT,
    Math.max(TOUCH_CONTROL_SCALE_MIN_PERCENT, snapped),
  );
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
      touchSteeringMode: isTouchSteeringMode(parsed['touchSteeringMode'])
        ? parsed['touchSteeringMode']
        : DEFAULT_GAME_PREFERENCES.touchSteeringMode,
      touchControlScalePercent: parseTouchControlScalePercent(parsed['touchControlScalePercent']),
      nightMood:
        typeof parsed['nightMood'] === 'boolean'
          ? parsed['nightMood']
          : DEFAULT_GAME_PREFERENCES.nightMood,
      // Older saved objects have no weather field: they keep the dry default, so a saved
      // 'rain' from a newer build is the only thing that can override it.
      weather: isWeatherPreference(parsed['weather'])
        ? parsed['weather']
        : DEFAULT_GAME_PREFERENCES.weather,
      carTuning: parseCarTuning(parsed['carTuning']),
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

export function isTouchSteeringMode(value: unknown): value is TouchSteeringMode {
  return TOUCH_STEERING_MODES.includes(value as TouchSteeringMode);
}

export function isWeatherPreference(value: unknown): value is WeatherPreference {
  return WEATHER_CONDITIONS.includes(value as WeatherPreference);
}

/**
 * Boot precedence for the weather condition: an explicit `?weather=` launch override wins,
 * then the owner's saved setting, which defaults to clear. The same condition both drives
 * the launch surface state and the menu's live switch, so a saved 'rain' launches already
 * wet and rainy.
 */
export function resolveBootWeatherCondition(
  urlOverride: WeatherPreference | null,
  preference: WeatherPreference,
): WeatherPreference {
  return urlOverride ?? preference;
}
