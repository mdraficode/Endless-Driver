import { describe, expect, it } from 'vitest';

import { WeatherDynamics } from '../../src/environment/weather-dynamics';
import {
  resolveSurfaceState,
  WEATHER_PRESETS,
  readWeatherPreset,
} from '../../src/environment/SurfaceState';

const DT = 1 / 60;

function run(dynamics: WeatherDynamics, seconds: number) {
  const frames = Math.round(seconds / DT);
  let sample = dynamics.update(0);
  for (let i = 0; i < frames; i += 1) {
    sample = dynamics.update(DT);
  }
  return sample;
}

describe('Phase 7 weather transitions', () => {
  it('starts in equilibrium for its launch preset', () => {
    for (const preset of WEATHER_PRESETS) {
      const dynamics = new WeatherDynamics(preset);
      const sample = dynamics.update(0);
      expect(dynamics.preset).toBe(preset);
      expect(sample.wetness).toBe(resolveSurfaceState(preset).wetness);
      expect(sample.rainIntensity).toBeGreaterThanOrEqual(0);
      expect(sample.rainIntensity).toBeLessThanOrEqual(1);
      expect(sample.overcast).toBeGreaterThanOrEqual(0);
      expect(sample.overcast).toBeLessThanOrEqual(1);
    }
  });

  it('ramps a storm in without a pop: monotonic, bounded, converging', () => {
    const dynamics = new WeatherDynamics('clear');
    dynamics.setPreset('storm');
    let previous = dynamics.update(0);
    for (let frame = 0; frame < 12 * 60; frame += 1) {
      const sample = dynamics.update(DT);
      for (const channel of ['wetness', 'rainIntensity', 'overcast'] as const) {
        expect(sample[channel]).toBeGreaterThanOrEqual(previous[channel]);
        expect(sample[channel]).toBeLessThanOrEqual(1);
      }
      previous = sample;
    }
    expect(previous.wetness).toBe(1);
    expect(previous.rainIntensity).toBe(1);
    expect(previous.overcast).toBe(1);
  });

  it('dries a storm back to clear at a steady rate, staying between targets', () => {
    const dynamics = new WeatherDynamics('storm');
    dynamics.setPreset('clear');
    let previous = dynamics.update(0);
    for (let frame = 0; frame < 12 * 60; frame += 1) {
      const sample = dynamics.update(DT);
      for (const channel of ['wetness', 'rainIntensity', 'overcast'] as const) {
        expect(sample[channel]).toBeLessThanOrEqual(previous[channel]);
        expect(sample[channel]).toBeGreaterThanOrEqual(0);
      }
      previous = sample;
    }
    expect(previous.wetness).toBe(0);
    expect(previous.rainIntensity).toBe(0);
    expect(previous.overcast).toBe(0);
  });

  it('is continuous through a preset switch mid-transition', () => {
    const dynamics = new WeatherDynamics('clear');
    dynamics.setPreset('storm');
    const halfway = run(dynamics, 1.5);
    dynamics.setPreset('rain');
    const next = dynamics.update(DT);
    // One frame of a fixed-rate ramp cannot jump: the switch changes direction, not level.
    for (const channel of ['wetness', 'rainIntensity', 'overcast'] as const) {
      expect(Math.abs(next[channel] - halfway[channel])).toBeLessThan(0.02);
    }
    // And it settles at the rain target, not the storm's.
    const settled = run(dynamics, 8);
    expect(settled.wetness).toBeCloseTo(0.85, 5);
    expect(settled.overcast).toBeCloseTo(0.55, 5);
  });

  it('is deterministic: the same delta sequence gives the same wetness curve', () => {
    const a = new WeatherDynamics('clear');
    const b = new WeatherDynamics('clear');
    a.setPreset('storm');
    b.setPreset('storm');
    const deltas = [0.016, 0.033, 0.016, 0.05, 0.016, 0.1, 0.016, 0.025, 0.016];
    for (const delta of deltas) {
      const sa = a.update(delta);
      const sb = b.update(delta);
      expect(sa.wetness).toBe(sb.wetness);
    }
  });

  it('reads the extended preset override and keeps clear the safe default', () => {
    expect(readWeatherPreset('?weather=rain')).toBe('rain');
    expect(readWeatherPreset('?weather=storm')).toBe('storm');
    expect(readWeatherPreset('?weather=STORM')).toBe('storm');
    expect(readWeatherPreset('?weather=snow')).toBe('clear');
    expect(readWeatherPreset('')).toBe('clear');
    // Storm saturates every surface: wetness 1.
    expect(resolveSurfaceState('storm').wetness).toBe(1);
  });
});
