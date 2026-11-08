import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG } from '../../src/config/render';
import { scaleBaseline } from '../../src/environment/daylight-levels';
import {
  DaylightController,
  type DaylightEngineTarget,
  type DaylightTarget,
} from '../../src/environment/DaylightController';
import { EnvironmentClock } from '../../src/environment/EnvironmentClock';
import { resolveSeasonPresentation } from '../../src/environment/seasons';

describe('daylight level composition', () => {
  it('treats clock values as multipliers on the configured baselines', () => {
    expect(scaleBaseline(RENDER_CONFIG.lighting.sunIntensity, 1)).toBe(
      RENDER_CONFIG.lighting.sunIntensity,
    );
    expect(scaleBaseline(RENDER_CONFIG.lighting.sunIntensity, 0)).toBe(0);
    expect(scaleBaseline(RENDER_CONFIG.lighting.ambientIntensity, 0.5)).toBeCloseTo(
      RENDER_CONFIG.lighting.ambientIntensity / 2,
    );
  });

  it('keeps the daytime sun brighter than the fill by the configured ratio', () => {
    // A 1:1 sun-to-fill ratio is the wash-out bug: no shadow contrast, milky frame.
    // Noon phase multipliers are 1 by definition (the clock's dayFactor saturates).
    const sun = scaleBaseline(RENDER_CONFIG.lighting.sunIntensity, 1);
    const fill = scaleBaseline(RENDER_CONFIG.lighting.ambientIntensity, 1);
    expect(sun / fill).toBeGreaterThan(3);
  });
});

class BareDaylightScene implements DaylightTarget {
  readonly skyMode = 'procedural' as const;
  applyDaylight(): void {}
  contactSunViewDirection(): { readonly x: number; readonly y: number; readonly z: number } {
    return { x: 0, y: 1, z: 0 };
  }
}

class RecordingDaylightEngine implements DaylightEngineTarget {
  exposure = 0;
  grade = { r: 1, g: 1, b: 1 };
  setExposure(exposure: number): void {
    this.exposure = exposure;
  }
  setGrade(tint: { readonly r: number; readonly g: number; readonly b: number }): void {
    this.grade = { ...tint };
  }
  setGodrays(): void {}
  setContactSun(): void {}
}

describe('DaylightController live season switch', () => {
  it('re-reads the season exposure and grade scales after setSeason', () => {
    const scene = new BareDaylightScene();
    const engine = new RecordingDaylightEngine();
    const controller = new DaylightController(
      new EnvironmentClock(),
      resolveSeasonPresentation('summer'),
    );
    controller.update(0, scene, engine);
    const summerExposure = engine.exposure;
    const summerGrade = { ...engine.grade };

    // A runtime switch takes effect on the very next frame: winter dims the exposure
    // (0.9 vs summer 1.04) and cools the grade (blue 1.07 vs 0.93, red 0.93 vs 1.05).
    controller.setSeason(resolveSeasonPresentation('winter'));
    controller.update(0, scene, engine);
    expect(engine.exposure).toBeCloseTo(summerExposure * (0.9 / 1.04), 5);
    expect(engine.grade.b / summerGrade.b).toBeCloseTo(1.07 / 0.93, 5);
    expect(engine.grade.r / summerGrade.r).toBeCloseTo(0.93 / 1.05, 5);

    // And null returns to the season-neutral baseline.
    controller.setSeason(null);
    controller.update(0, scene, engine);
    expect(engine.exposure).toBeCloseTo(summerExposure * (1 / 1.04), 5);
  });
});
