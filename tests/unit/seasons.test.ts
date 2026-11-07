import { describe, expect, it } from 'vitest';

import {
  applySeasonSurface,
  resolveSeasonPresentation,
  readSeasonRequest,
  SEASONS,
  seasonForWorld,
  type SeasonPresentation,
} from '../../src/environment/seasons';
import { DaylightController } from '../../src/environment/DaylightController';
import { EnvironmentClock } from '../../src/environment/EnvironmentClock';
import { buildSpeciesGeometry, applySeasonFoliageTint } from '../../src/world/vegetation';
import { buildGroundCoverGeometry } from '../../src/world/ground-cover';
import type { SurfaceResponse } from '../../src/vehicles/types';

const SOIL: SurfaceResponse = { id: 'soil', gripModifier: 1, rollingResistance: 0.02 };
const ASPHALT: SurfaceResponse = { id: 'asphalt', gripModifier: 1, rollingResistance: 0.015 };

describe('season core (Phase 7)', () => {
  it('picks a deterministic season per world seed, and reaches all four', () => {
    for (const seed of [1, 2, 424242, 20261102, 0x7fffffff]) {
      expect(seasonForWorld(seed)).toBe(seasonForWorld(seed));
    }
    const reached = new Set([1, 2, 3, 4, 5].map((seed) => seasonForWorld(seed)));
    expect(reached.size).toBeGreaterThan(1);
    // A small seed sweep must touch every season eventually.
    const all = new Set(SEASONS.map((s) => s));
    for (let seed = 1; seed <= 64 && all.size > 0; seed += 1) {
      all.delete(seasonForWorld(seed));
    }
    expect(all.size).toBe(0);
  });

  it('keeps the four presentations distinct and summer as the neutral baseline', () => {
    const summer = resolveSeasonPresentation('summer');
    expect(summer.exposureScale).toBeGreaterThan(0.9);
    for (const season of SEASONS) {
      const presentation = resolveSeasonPresentation(season);
      expect(presentation.id).toBe(season);
      expect(presentation.surfaceMod.every((mod) => mod.gripScale <= 1)).toBe(true);
    }
    const ids = SEASONS.map((s) => JSON.stringify(resolveSeasonPresentation(s).surfaceMod));
    expect(new Set(ids).size).toBeGreaterThan(1);
  });

  it('keeps winter non-white and snow-free (standing owner constraint)', () => {
    const winter = resolveSeasonPresentation('winter');
    for (const tint of [winter.foliageTint, winter.groundTint]) {
      // Dormant brown-grey: every channel well under white, and no near-white luma.
      expect(tint.r).toBeLessThan(0.8);
      expect(tint.g).toBeLessThan(0.8);
      expect(tint.b).toBeLessThan(0.8);
      const luma = 0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b;
      expect(luma).toBeLessThan(0.65);
    }
  });

  it('reads the dev-HUD season override and rejects unknown values', () => {
    expect(readSeasonRequest('?season=autumn')).toBe('autumn');
    expect(readSeasonRequest('?season=WINTER')).toBe('winter');
    expect(readSeasonRequest('?season=monsoon')).toBeNull();
    expect(readSeasonRequest('?weather=rain')).toBeNull();
  });

  it('applies season surface response after the weather state, summer untouched', () => {
    // Summer is the baseline: every surface passes through bit-for-bit.
    const summer = resolveSeasonPresentation('summer');
    expect(applySeasonSurface(SOIL, summer)).toBe(SOIL);

    // Autumn mud: soft surfaces lose grip and gain rolling resistance.
    const autumn = resolveSeasonPresentation('autumn');
    const autumnSoil = applySeasonSurface(SOIL, autumn);
    expect(autumnSoil.gripModifier).toBeCloseTo(0.85, 3);
    expect(autumnSoil.rollingResistance).toBeCloseTo(0.025, 4);
    // Asphalt is dry and crisp even in autumn.
    expect(applySeasonSurface(ASPHALT, autumn)).toBe(ASPHALT);

    // Winter damp: asphalt loses a little, soft surfaces more.
    const winter = resolveSeasonPresentation('winter');
    expect(applySeasonSurface(ASPHALT, winter).gripModifier).toBeCloseTo(0.96, 3);
    expect(applySeasonSurface(SOIL, winter).gripModifier).toBeLessThan(0.9);
  });
});

describe('season presentation on the master geometry set', () => {
  it('bakes the foliage tint into leaf vertices only (trunk untouched)', () => {
    const geometry = buildSpeciesGeometry('broadleaf', 0);
    const base = geometry.getAttribute('color');
    const mask = geometry.getAttribute('foliageMask');
    let leafIndex = -1;
    let trunkIndex = -1;
    for (let i = 0; i < base.count; i += 1) {
      if (mask.getX(i) > 0 && leafIndex === -1) leafIndex = i;
      if (mask.getX(i) <= 0 && trunkIndex === -1) trunkIndex = i;
    }
    expect(leafIndex).toBeGreaterThan(-1);
    expect(trunkIndex).toBeGreaterThan(-1);

    const baseLeafX = base.getX(leafIndex);
    const baseLeafY = base.getY(leafIndex);
    const baseLeafZ = base.getZ(leafIndex);
    const baseTrunkX = base.getX(trunkIndex);
    const baseTrunkY = base.getY(trunkIndex);
    const baseTrunkZ = base.getZ(trunkIndex);
    applySeasonFoliageTint(geometry, { r: 1.28, g: 0.7, b: 0.38 });

    const color = geometry.getAttribute('color');
    expect(color.getX(leafIndex)).toBeCloseTo(baseLeafX * 1.28, 5);
    expect(color.getY(leafIndex)).toBeCloseTo(baseLeafY * 0.7, 5);
    expect(color.getZ(leafIndex)).toBeCloseTo(baseLeafZ * 0.38, 5);
    expect(color.getX(trunkIndex)).toBeCloseTo(baseTrunkX, 6);
    expect(color.getY(trunkIndex)).toBeCloseTo(baseTrunkY, 6);
    expect(color.getZ(trunkIndex)).toBeCloseTo(baseTrunkZ, 6);
  });

  it('tints ground-cover greens the same way, stones untouched', () => {
    const grass = buildGroundCoverGeometry('grass');
    const before = grass.getAttribute('color');
    const mask = grass.getAttribute('foliageMask');
    let leafIndex = -1;
    for (let i = 0; i < before.count; i += 1) {
      if (mask.getX(i) > 0) {
        leafIndex = i;
        break;
      }
    }
    expect(leafIndex).toBeGreaterThan(-1);
    const base = before.getX(leafIndex);
    applySeasonFoliageTint(grass, { r: 0.66, g: 0.64, b: 0.55 });
    expect(grass.getAttribute('color').getX(leafIndex)).toBeCloseTo(base * 0.66, 5);
  });
});

describe('season on the daylight path', () => {
  interface Probe {
    exposure: number | null;
    grade: { r: number; g: number; b: number } | null;
  }
  function probe(season?: SeasonPresentation) {
    const clock = new EnvironmentClock({ startHour: 12 });
    const controller = new DaylightController(clock, season);
    const seen: Probe = { exposure: null, grade: null };
    const scene = {
      applyDaylight: () => undefined,
      skyMode: 'procedural' as const,
      contactSunViewDirection: () => ({ x: 0, y: 1, z: 0 }),
    };
    const engine = {
      setExposure: (exposure: number) => {
        seen.exposure = exposure;
      },
      setGrade: (tint: { r: number; g: number; b: number }) => {
        seen.grade = tint;
      },
      setGodrays: () => undefined,
      setContactSun: () => undefined,
    };
    controller.update(1 / 60, scene, engine);
    return seen;
  }

  it('scales exposure and multiplies the day grade by the season', () => {
    const neutral = probe(undefined);
    const winter = probe(resolveSeasonPresentation('winter'));
    expect(winter.exposure).toBeCloseTo(
      (neutral.exposure ?? 0) * resolveSeasonPresentation('winter').exposureScale,
      5,
    );
    const winterGrade = resolveSeasonPresentation('winter').gradeTint;
    expect(winter.grade!.r).toBeCloseTo(neutral.grade!.r * winterGrade.r, 5);
    expect(winter.grade!.b).toBeCloseTo(neutral.grade!.b * winterGrade.b, 5);
  });
});
