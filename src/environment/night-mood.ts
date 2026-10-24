import { DAYLIGHT_CONFIG } from '../config/daylight';
import type { EnvironmentClock } from './EnvironmentClock';
import type { Vec3 } from '../shared/vector';

/** The stable local-solar-time preset used by the player's Night Mood switch. */
export const NIGHT_MOOD_HOUR = 23.5;

/** Cool-white moonlight used for the night key light and visible moon disc. */
export const MOONLIGHT_COLOR_HEX = 0xbad7ff;

/** Moon key-light intensity as a fraction of the configured daytime sun. */
export const MOONLIGHT_INTENSITY_SCALE = 0.045;

/** Resolves the clock hour selected by the live menu switch. */
export function resolveNightMoodHour(enabled: boolean): number {
  return enabled ? NIGHT_MOOD_HOUR : DAYLIGHT_CONFIG.startHour;
}

/** Applies the menu choice to the shared environment clock. */
export function applyNightMoodToClock(
  clock: Pick<EnvironmentClock, 'setHour'>,
  enabled: boolean,
): void {
  clock.setHour(resolveNightMoodHour(enabled));
}

/**
 * Stylized full-moon direction: opposite the sun, reflected above the horizon if needed, and
 * normalized for the scene's directional key light and moon-disc placement.
 */
export function resolveMoonDirection(sunDirection: Readonly<Vec3>): Vec3 {
  let x = -sunDirection.x;
  let y = -sunDirection.y;
  let z = -sunDirection.z;
  if (y < 0) {
    x = -x;
    y = -y;
    z = -z;
  }

  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length < 1e-8) {
    return { x: 0, y: 1, z: 0 };
  }
  return { x: x / length, y: y / length, z: z / length };
}
