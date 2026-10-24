import { describe, expect, it } from 'vitest';

import { DAYLIGHT_CONFIG } from '../../src/config/daylight';
import { EnvironmentClock } from '../../src/environment/EnvironmentClock';
import {
  applyNightMoodToClock,
  MOONLIGHT_COLOR_HEX,
  MOONLIGHT_INTENSITY_SCALE,
  NIGHT_MOOD_HOUR,
  resolveMoonDirection,
  resolveNightMoodHour,
} from '../../src/environment/night-mood';

describe('live night-mood lighting preset', () => {
  it('keeps daylight as the default and selects a stable, full night hour when enabled', () => {
    expect(new EnvironmentClock().daylight().isNight).toBe(false);
    expect(resolveNightMoodHour(false)).toBe(DAYLIGHT_CONFIG.startHour);
    expect(resolveNightMoodHour(true)).toBe(NIGHT_MOOD_HOUR);
    const clock = new EnvironmentClock({ startHour: 12 });
    applyNightMoodToClock(clock, true);
    expect(clock.hour).toBe(NIGHT_MOOD_HOUR);
    expect(clock.daylight().isNight).toBe(true);
    applyNightMoodToClock(clock, false);
    expect(clock.hour).toBe(DAYLIGHT_CONFIG.startHour);
    expect(clock.daylight().isNight).toBe(false);
  });

  it('uses a cool, restrained moon key light', () => {
    expect(MOONLIGHT_COLOR_HEX).toBe(0xbad7ff);
    expect(MOONLIGHT_INTENSITY_SCALE).toBeGreaterThan(0);
    expect(MOONLIGHT_INTENSITY_SCALE).toBeLessThan(0.1);
  });

  it('points the visible full moon opposite a below-horizon sun and keeps it above the horizon', () => {
    const sun = { x: 0.6, y: -0.5, z: 0.6244997998398398 };
    const moon = resolveMoonDirection(sun);

    expect(moon.x).toBeLessThan(0);
    expect(moon.y).toBeGreaterThan(0);
    expect(moon.z).toBeLessThan(0);
    expect(Math.hypot(moon.x, moon.y, moon.z)).toBeCloseTo(1);
  });

  it('falls back safely for an invalid zero direction', () => {
    expect(resolveMoonDirection({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
  });
});
