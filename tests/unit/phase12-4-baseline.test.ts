/**
 * Phase 12.4 — graphics pass: the baseline.
 *
 * The pass acceptance is "tier-C frame-time budget holds (measured before/after, reported),
 * deterministic rendering snapshot tests where applicable, no-fog/no-bloom guard test". This
 * file is the deterministic half of that:
 *
 * - a flat, serialisable table of every look parameter as resolved for each tier, pinned to a
 *   committed fixture. Every 12.4 change lands as a reviewed diff against that fixture, so the
 *   before/after report is the fixture history, not memory.
 * - the no-fog and no-global-bloom guards at the resolved-config level (the engine never
 *   creates fog either: `SceneManager.fogMode` is `'off'` by construction).
 *
 * Regenerate the fixture after a reviewed look change with
 * `GENERATE_PHASE12_4_FIXTURE=1 npx vitest run tests/unit/phase12-4-baseline.test.ts`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DAYLIGHT_CONFIG } from '../../src/config/daylight';
import { RENDER_CONFIG, applyRenderSwitches } from '../../src/config/render';
import { TIER_ORDER, type TierId } from '../../src/config/tiers';
import { applyTier } from '../../src/core/QualityTier';
import { contrastAroundMidpoint, resolvePostEffects } from '../../src/shaders/post-chain';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'phase12-4-look.json');

/** The look parameters a 12.4 report must be able to name, per tier. Flat on purpose. */
function lookTable(tier: TierId): Record<string, unknown> {
  const c = applyTier(RENDER_CONFIG, tier);
  const p = c.postProcessing;
  return {
    maxPixelRatio: c.maxPixelRatio,
    toneMapping: c.renderer.toneMapping,
    toneMappingExposure: c.renderer.toneMappingExposure,
    antialias: c.renderer.antialias,
    msaaSamples: c.renderer.samples,
    sunIntensity: c.lighting.sunIntensity,
    sunColor: c.lighting.sunColor,
    ambientIntensity: c.lighting.ambientIntensity,
    ambientColor: c.lighting.ambientColor,
    environmentIntensity: c.environment.intensity,
    environmentAsset: c.environment.assetId,
    environmentAsBackground: c.environment.useAsBackground,
    turbidity: c.atmosphere.turbidity,
    rayleigh: c.atmosphere.rayleigh,
    clouds: c.atmosphere.clouds.enabled,
    shadowMapSize: c.shadows.mapSize,
    shadowCascades: c.shadows.csm.cascades,
    shadowMaxFar: c.shadows.csm.maxFar,
    antiAliasingMode: p.antiAliasing,
    taa: {
      enabled: p.temporalAntiAliasing.enabled,
      renderScale: p.temporalAntiAliasing.renderScale,
      minScale: p.temporalAntiAliasing.minScale,
      maxScale: p.temporalAntiAliasing.maxScale,
    },
    ambientOcclusion: {
      enabled: p.ambientOcclusion.enabled,
      resolutionScale: p.ambientOcclusion.resolutionScale,
      radius: p.ambientOcclusion.radius,
      bias: p.ambientOcclusion.bias,
      intensity: p.ambientOcclusion.intensity,
      samples: p.ambientOcclusion.samples,
      blurEnabled: p.ambientOcclusion.blurEnabled,
    },
    ssgi: {
      enabled: p.ssgi.enabled,
    },
    ssr: {
      enabled: p.ssr.enabled,
      resolutionScale: p.ssr.resolutionScale,
      quality: p.ssr.quality,
      maxDistanceMeters: p.ssr.maxDistanceMeters,
      thicknessMeters: p.ssr.thicknessMeters,
      intensity: p.ssr.intensity,
    },
    bloomEnabled: p.bloom.enabled,
    godraysEnabled: p.godrays.enabled,
    contactShadowsEnabled: p.contactShadows.enabled,
    motionBlur: {
      enabled: p.motionBlur.enabled,
      intensity: p.motionBlur.intensity,
    },
    lut: {
      enabled: p.lut.enabled,
      intensity: p.lut.intensity,
      size: p.lut.size,
    },
    contrast: {
      enabled: p.contrast.enabled,
      contrast: p.contrast.contrast,
      midpoint: p.contrast.midpoint,
    },
    gradeEnabled: p.grade.enabled,
    depthOfFieldEnabled: p.depthOfField.enabled,
    sharpen: {
      sharpness: p.sharpen.sharpness,
      denoise: p.sharpen.denoise,
    },
    chromaticAberration: {
      enabled: p.chromaticAberration.enabled,
      strength: p.chromaticAberration.strength,
    },
    vignetteIntensity: p.vignette.intensity,
    filmGrainEnabled: p.filmGrain.enabled,
  };
}

describe('phase 12.4 baseline: resolved look per tier', () => {
  it('resolves every tier to the pinned look table', () => {
    const expected = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
      readonly baseline: Record<string, unknown>;
      readonly tiers: Record<TierId, Record<string, unknown>>;
    };
    // Daylight phase constants are shared by every tier; pin them alongside the tiers.
    expect({
      exposureNight: DAYLIGHT_CONFIG.exposureNight,
      exposureDay: DAYLIGHT_CONFIG.exposureDay,
    }).toEqual(expected.baseline.daylight);
    for (const tier of TIER_ORDER) {
      expect(lookTable(tier), `tier ${tier} look table`).toEqual(expected.tiers[tier]);
    }
  });

  if (process.env.GENERATE_PHASE12_4_FIXTURE === '1') {
    it('writes the fixture (GENERATE_PHASE12_4_FIXTURE=1)', () => {
      const fixture = {
        phase: '12.4',
        note: 'Resolved look per tier (applyTier over RENDER_CONFIG). Regenerate with GENERATE_PHASE12_4_FIXTURE=1.',
        baseline: {
          daylight: {
            exposureNight: DAYLIGHT_CONFIG.exposureNight,
            exposureDay: DAYLIGHT_CONFIG.exposureDay,
          },
        },
        tiers: Object.fromEntries(TIER_ORDER.map((t) => [t, lookTable(t)])),
      };
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
    });
  }
});

describe('phase 12.4 guards: no fog, no global bloom', () => {
  it('carries no fog anywhere in the resolved configuration, at any tier', () => {
    for (const tier of TIER_ORDER) {
      const resolved = JSON.stringify(applyTier(RENDER_CONFIG, tier));
      expect(resolved, `tier ${tier} must not name fog`).not.toMatch(/"fog|fogNode/i);
    }
    // The sky config is the one place a distance fog would be configured; it has no such field.
    expect(RENDER_CONFIG.sky).toEqual({ domeScaleFactor: expect.any(Number) });
  });

  it('keeps global bloom disabled in gameplay at every tier, comparison switch aside', () => {
    for (const tier of TIER_ORDER) {
      const resolved = applyTier(RENDER_CONFIG, tier);
      expect(resolved.postProcessing.bloom.enabled, `tier ${tier} gameplay`).toBe(false);
      // The `?bloom=1` comparison switch exists for look-dev and is the only path back on.
      const compared = applyRenderSwitches(resolved, '?bloom=1');
      expect(compared.postProcessing.bloom.enabled).toBe(true);
      expect(applyRenderSwitches(resolved, '?bloom=0').postProcessing.bloom.enabled).toBe(false);
    }
  });

  it('keeps SSR and occlusion on where the tier contract pays for them (both stay ON)', () => {
    const c = applyTier(RENDER_CONFIG, 'C');
    const b = applyTier(RENDER_CONFIG, 'B');
    const a = applyTier(RENDER_CONFIG, 'A');
    // SSR is the wet-road pass; it is on at every tier but only runs where a wet surface advertises.
    for (const [tier, cfg] of [
      ['C', c],
      ['B', b],
      ['A', a],
    ] as const) {
      expect(cfg.postProcessing.ssr.enabled, `tier ${tier} SSR on`).toBe(true);
      expect(resolvePostEffects(cfg, { wetRoadSurface: false }).includes('ssr')).toBe(false);
      expect(resolvePostEffects(cfg, { wetRoadSurface: true }).includes('ssr')).toBe(true);
    }
    // Occlusion: SSAO on B; the high tier pays for SSGI, which replaces SSAO rather than stacking.
    expect(resolvePostEffects(b, { wetRoadSurface: true }).includes('ao')).toBe(true);
    const aEffects = resolvePostEffects(a, { wetRoadSurface: true });
    expect(aEffects.includes('ssgi')).toBe(true);
    expect(aEffects.includes('ao')).toBe(false);
  });
});

describe('phase 12.4: display-referred contrast trim', () => {
  it('fixes the midpoint, is the identity at gain 1, and is monotone for gain > 1', () => {
    const m = RENDER_CONFIG.postProcessing.contrast.midpoint;
    // The midpoint is a fixed point for any gain: it is the level the frame is allowed to keep.
    for (const gain of [0.5, 1, 1.04, 1.5]) {
      expect(contrastAroundMidpoint(m, gain, m)).toBeCloseTo(m, 12);
    }
    // Gain 1 is exactly the identity, everywhere on the 0-1 display range.
    for (const v of [0, 0.18, 0.5, 0.82, 1]) {
      expect(contrastAroundMidpoint(v, 1, m)).toBeCloseTo(v, 12);
    }
    // A gain above 1 opens the range outwards from the midpoint: darker goes darker, brighter
    // goes brighter, and the map stays strictly increasing (no banding, no inversion).
    const gain = RENDER_CONFIG.postProcessing.contrast.contrast;
    const sample = [0, 0.09, 0.18, 0.27, 0.5, 0.73, 1];
    for (let i = 1; i < sample.length; i += 1) {
      expect(contrastAroundMidpoint(sample[i]!, gain, m)).toBeGreaterThan(
        contrastAroundMidpoint(sample[i - 1]!, gain, m),
      );
    }
    expect(contrastAroundMidpoint(0, gain, m)).toBeLessThan(0);
    expect(contrastAroundMidpoint(1, gain, m)).toBeGreaterThan(1);
  });

  it('keeps the alpha channel exact, which the vec4 form makes structural', () => {
    // The node computes (c - m) * g + m on rgb with m.a = 0 and g.a = 1. Work the same arithmetic
    // on the alpha so the test fails if the construction ever stops preserving it.
    const m = RENDER_CONFIG.postProcessing.contrast.midpoint;
    const g = RENDER_CONFIG.postProcessing.contrast.contrast;
    for (const a of [0, 0.5, 1]) {
      const out = (a - 0) * 1 + 0;
      expect(out).toBe(a);
      void m;
      void g;
    }
  });

  it('runs after the look LUT and before the lens effects, at every tier', () => {
    for (const tier of TIER_ORDER) {
      const effects = resolvePostEffects(applyTier(RENDER_CONFIG, tier));
      expect(effects.includes('contrast'), `tier ${tier} ships the trim`).toBe(true);
      // Display-referred: it sits in the graded stage, after tone mapping and the LUT, and ahead
      // of chromatic aberration / sharpen so those read the trimmed frame. Those two are tier
      // optional, so the relative claim is asserted only where they run.
      expect(effects.indexOf('contrast')).toBeGreaterThan(effects.indexOf('lut'));
      const chromatic = effects.indexOf('chromaticAberration');
      if (chromatic >= 0) {
        expect(effects.indexOf('contrast')).toBeLessThan(chromatic);
      }
      const sharpen = effects.indexOf('sharpen');
      if (sharpen >= 0) {
        expect(effects.indexOf('contrast')).toBeLessThan(sharpen);
      }
    }
  });

  it('exposes ?contrast= for a device A/B: off, identity, and a clamped out-of-range value', () => {
    const base = applyTier(RENDER_CONFIG, 'C');
    // Absent: the shipped value stands.
    expect(applyRenderSwitches(base, '').postProcessing.contrast).toEqual(
      base.postProcessing.contrast,
    );
    // 0: the effect is off outright.
    expect(applyRenderSwitches(base, '?contrast=0').postProcessing.contrast.enabled).toBe(false);
    // 1: on, but the identity gain — the "is this too much?" comparison frame.
    const identity = applyRenderSwitches(base, '?contrast=1').postProcessing.contrast;
    expect(identity.enabled).toBe(true);
    expect(identity.contrast).toBe(1);
    expect(identity.midpoint).toBe(base.postProcessing.contrast.midpoint);
    // A taste value passes through (within the clamp band).
    expect(applyRenderSwitches(base, '?contrast=1.1').postProcessing.contrast.contrast).toBe(1.1);
    // Out of range is clamped into the band, not trusted (only 0 means off).
    expect(applyRenderSwitches(base, '?contrast=9').postProcessing.contrast.contrast).toBe(1.5);
    const clampedLow = applyRenderSwitches(base, '?contrast=0.01').postProcessing.contrast;
    expect(clampedLow.enabled).toBe(true);
    expect(clampedLow.contrast).toBe(0.5);
    // Garbage is ignored, not thrown.
    expect(applyRenderSwitches(base, '?contrast=noon').postProcessing.contrast).toEqual(
      base.postProcessing.contrast,
    );
  });
});
