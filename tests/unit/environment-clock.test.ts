import { describe, expect, it } from 'vitest';
import { DAYLIGHT_CONFIG, type DaylightConfig } from '../../src/config/daylight';
import {
  EnvironmentClock,
  resolveDaylight,
  wrapHour,
} from '../../src/environment/EnvironmentClock';
import { solarPosition, sunDeclinationDegrees, toDegrees } from '../../src/environment/solar';

const config = DAYLIGHT_CONFIG;

describe('solar position', () => {
  it('puts the sun at the expected height at solar noon on the equinox', () => {
    // On an equinox the noon sun sits at 90 - latitude. The model's declination curve crosses zero
    // at day 81, so that is the day to check against.
    const sun = solarPosition(12, 36, 81);
    expect(toDegrees(sun.elevationRadians)).toBeCloseTo(90 - 36, 0);
    // And it is due south: north is -Z, so south is +Z.
    expect(sun.direction.z).toBeGreaterThan(0.5);
    expect(Math.abs(sun.direction.x)).toBeLessThan(0.02);
  });

  it('returns a unit vector whose vertical component matches the elevation', () => {
    for (const hour of [0, 3, 6, 9, 12, 15, 18, 21, 23.9]) {
      for (const day of [1, 90, 172, 264, 355]) {
        const sun = solarPosition(hour, config.latitudeDegrees, day);
        const length = Math.hypot(sun.direction.x, sun.direction.y, sun.direction.z);
        expect(length).toBeCloseTo(1, 6);
        expect(Math.asin(sun.direction.y)).toBeCloseTo(sun.elevationRadians, 6);
      }
    }
  });

  it('rises in the east, peaks at noon, and sets in the west', () => {
    const morning = solarPosition(6, config.latitudeDegrees, config.dayOfYear);
    const noon = solarPosition(12, config.latitudeDegrees, config.dayOfYear);
    const evening = solarPosition(18, config.latitudeDegrees, config.dayOfYear);

    // East is +X in the world basis.
    expect(morning.direction.x).toBeGreaterThan(0);
    expect(evening.direction.x).toBeLessThan(0);
    expect(noon.elevationRadians).toBeGreaterThan(morning.elevationRadians);
    expect(noon.elevationRadians).toBeGreaterThan(evening.elevationRadians);
  });

  it('is below the horizon at midnight and above it during the day', () => {
    expect(
      solarPosition(0, config.latitudeDegrees, config.dayOfYear).elevationRadians,
    ).toBeLessThan(0);
    expect(
      solarPosition(13, config.latitudeDegrees, config.dayOfYear).elevationRadians,
    ).toBeGreaterThan(0);
  });

  it('tracks the seasons through the declination', () => {
    // June solstice is the northernmost, December the southernmost.
    const june = sunDeclinationDegrees(172);
    const december = sunDeclinationDegrees(355);
    expect(june).toBeGreaterThan(20);
    expect(december).toBeLessThan(-20);
    // The default date is late September: a modest southern declination.
    expect(sunDeclinationDegrees(config.dayOfYear)).toBeLessThan(2);
  });
});

describe('environment clock', () => {
  it('wraps hours into a single day', () => {
    expect(wrapHour(25)).toBeCloseTo(1, 6);
    expect(wrapHour(-1)).toBeCloseTo(23, 6);
    expect(wrapHour(24)).toBeCloseTo(0, 6);
    expect(wrapHour(Number.NaN)).toBe(0);
  });

  it('starts where it is configured and can be moved directly', () => {
    const clock = new EnvironmentClock({ startHour: 7.25 });
    expect(clock.hour).toBeCloseTo(7.25, 6);
    expect(clock.label).toBe('07:15');
    clock.setHour(30);
    expect(clock.hour).toBeCloseTo(6, 6);
    expect(clock.label).toBe('06:00');
  });

  it('only advances when auto-advance is enabled', () => {
    const still: DaylightConfig = { ...config, autoAdvance: false };
    const fixed = new EnvironmentClock({ config: still, startHour: 10 });
    fixed.update(60);
    expect(fixed.hour).toBeCloseTo(10, 6);

    const moving: DaylightConfig = { ...config, autoAdvance: true, secondsPerHour: 60 };
    const ticking = new EnvironmentClock({ config: moving, startHour: 10 });
    ticking.update(60);
    expect(ticking.hour).toBeCloseTo(11, 6);
    // Ignores invalid deltas rather than corrupting the time.
    ticking.update(-5);
    ticking.update(Number.NaN);
    expect(ticking.hour).toBeCloseTo(11, 6);
  });

  it('wraps around midnight while advancing', () => {
    const moving: DaylightConfig = { ...config, autoAdvance: true, secondsPerHour: 60 };
    const clock = new EnvironmentClock({ config: moving, startHour: 23.5 });
    clock.update(60 * 2);
    expect(clock.hour).toBeCloseTo(1.5, 6);
  });
});

describe('daylight curves', () => {
  const at = (hour: number) =>
    resolveDaylight(solarPosition(hour, config.latitudeDegrees, config.dayOfYear), config);

  it('is fully lit at noon and dark at midnight', () => {
    const noon = at(12.5);
    const midnight = at(0);

    expect(noon.sunIntensity).toBeCloseTo(1, 2);
    expect(noon.isNight).toBe(false);
    expect(noon.showSunDisc).toBe(true);
    expect(noon.exposure).toBeCloseTo(config.exposureDay, 2);
    expect(noon.environmentIntensity).toBeCloseTo(config.environmentIntensityDay, 2);

    expect(midnight.sunIntensity).toBe(0);
    expect(midnight.isNight).toBe(true);
    expect(midnight.showSunDisc).toBe(false);
    expect(midnight.ambientIntensity).toBeCloseTo(config.ambientIntensityNight, 2);
    expect(midnight.exposure).toBeCloseTo(config.exposureNight, 2);
    expect(midnight.environmentIntensity).toBeCloseTo(config.environmentIntensityNight, 2);
  });

  it('keeps night readable rather than black', () => {
    const midnight = at(0);
    // Exposure rises after dark so the scene stays legible; ambient never drops to nothing.
    expect(midnight.exposure).toBeGreaterThan(config.exposureDay);
    expect(midnight.ambientIntensity).toBeGreaterThan(0);
    expect(midnight.environmentIntensity).toBeGreaterThan(0);
    expect(midnight.sunIntensity).toBe(0);
  });

  it('warms the light towards the horizon', () => {
    const noon = at(12.5);
    const dusk = at(17.8);
    // The horizon sun is far redder: compare red-minus-blue, which is the warmth of the light.
    const warmth = (color: number) => ((color >> 16) & 0xff) - (color & 0xff);
    expect(warmth(dusk.sunColorHex)).toBeGreaterThan(warmth(noon.sunColorHex));
    // And the atmosphere thickens: more haze at the horizon than overhead.
    expect(dusk.turbidity).toBeGreaterThan(noon.turbidity);
  });

  it('fades the sun out through twilight instead of switching it off', () => {
    // Sample across sunset a minute at a time: intensity must fall through intermediate values, and
    // the fall must take a plausible stretch of time rather than happening between two frames.
    const stepMinutes = 1;
    const samples: number[] = [];
    for (let hour = 16; hour <= 20; hour += stepMinutes / 60) {
      samples.push(at(hour).sunIntensity);
    }
    // Monotone decrease through the sequence.
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i] ?? 0).toBeLessThanOrEqual((samples[i - 1] ?? 0) + 1e-6);
    }
    const fading = samples.filter((value) => value > 0.01 && value < 0.99);
    // `fullSunElevation` (12°) down to `sunCutoffElevation` (-4°) is a 16° band, which at this
    // latitude and date takes a bit over an hour to set through — real twilight, not a fade-out.
    expect(fading.length * stepMinutes).toBeGreaterThan(30);
    expect(fading.length * stepMinutes).toBeLessThan(150);
  });

  it('changes smoothly across a whole day, with no visible steps', () => {
    // A discontinuity here would show up as the sky jumping in a single frame. Sampling a minute at
    // a time makes each step a real-time step too: at the default `secondsPerHour` of 120 one
    // in-game minute lasts two seconds, so a per-minute delta is a per-two-seconds delta on screen.
    // The caps are a few per cent of each quantity's full range, which is well under anything the
    // eye reads as a step.
    const stepMinutes = 1;
    const caps = {
      sunIntensity: 0.03, // range 0–1
      ambientIntensity: 0.025, // range 0.18–1
      exposure: 0.015, // range 1–1.45
      turbidity: 0.08, // range 1.6–4.2
      rayleigh: 0.07, // range 0.4–2.6
      sunColorChannel: 5, // out of 255
    };

    let previous = at(0);
    for (let hour = stepMinutes / 60; hour < 24; hour += stepMinutes / 60) {
      const current = at(hour);
      expect(Math.abs(current.sunIntensity - previous.sunIntensity)).toBeLessThan(
        caps.sunIntensity,
      );
      expect(Math.abs(current.ambientIntensity - previous.ambientIntensity)).toBeLessThan(
        caps.ambientIntensity,
      );
      expect(Math.abs(current.exposure - previous.exposure)).toBeLessThan(caps.exposure);
      expect(Math.abs(current.turbidity - previous.turbidity)).toBeLessThan(caps.turbidity);
      expect(Math.abs(current.rayleigh - previous.rayleigh)).toBeLessThan(caps.rayleigh);
      // Colour steps stay small per channel.
      for (const shift of [16, 8, 0]) {
        const a = (current.sunColorHex >> shift) & 0xff;
        const b = (previous.sunColorHex >> shift) & 0xff;
        expect(Math.abs(a - b)).toBeLessThan(caps.sunColorChannel);
      }
      previous = current;
    }
  });

  it('produces colours and values the renderer can accept', () => {
    for (let hour = 0; hour < 24; hour += 0.5) {
      const state = at(hour);
      for (const color of [state.sunColorHex, state.ambientColorHex, state.fogColorHex]) {
        expect(Number.isInteger(color)).toBe(true);
        expect(color).toBeGreaterThanOrEqual(0);
        expect(color).toBeLessThanOrEqual(0xffffff);
      }
      expect(state.sunIntensity).toBeGreaterThanOrEqual(0);
      expect(state.sunIntensity).toBeLessThanOrEqual(1);
      expect(state.exposure).toBeGreaterThan(0);
      expect(state.ambientIntensity).toBeGreaterThan(0);
      expect(state.environmentIntensity).toBeGreaterThan(0);
      // Scattering coefficients stay physical enough for the Preetham model.
      expect(state.turbidity).toBeGreaterThan(1);
      expect(state.rayleigh).toBeGreaterThan(0);
    }
  });

  it('reports the resolved state through the clock', () => {
    const clock = new EnvironmentClock({ startHour: 12 });
    const state = clock.daylight();
    expect(state).toEqual(resolveDaylight(clock.sunPosition(), config));
    expect(state.sunDirection.y).toBeCloseTo(Math.sin(clock.sunPosition().elevationRadians), 6);
  });
});
