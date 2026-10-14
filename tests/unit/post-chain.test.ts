import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG, type RenderConfig } from '../../src/config/render';
import { applyTier } from '../../src/core/QualityTier';
import {
  chainsOwnsOutputTransform,
  requiresSceneNormals,
  resolvePostEffects,
  type PostEffectName,
} from '../../src/shaders/post-chain';

/** A configuration with every display effect switched off, so each test enables only what it names. */
const BARE: RenderConfig = {
  ...RENDER_CONFIG,
  postProcessing: {
    ...RENDER_CONFIG.postProcessing,
    antiAliasing: 'none',
    grade: { ...RENDER_CONFIG.postProcessing.grade, enabled: false },
    bloom: { ...RENDER_CONFIG.postProcessing.bloom, enabled: false },
    ambientOcclusion: { ...RENDER_CONFIG.postProcessing.ambientOcclusion, enabled: false },
    chromaticAberration: {
      ...RENDER_CONFIG.postProcessing.chromaticAberration,
      enabled: false,
    },
    sharpen: { ...RENDER_CONFIG.postProcessing.sharpen, enabled: false },
    filmGrain: { ...RENDER_CONFIG.postProcessing.filmGrain, enabled: false },
    vignette: { ...RENDER_CONFIG.postProcessing.vignette, enabled: false },
    // Depth of field and the look are the two effects a tier can switch off on its own, so a test that
    // wants a *bare* configuration has to say so here rather than inheriting whatever tier happened to
    // be applied — otherwise `resolvePostEffects(BARE)` would silently depend on the tier table.
    depthOfField: { ...RENDER_CONFIG.postProcessing.depthOfField, enabled: false },
    lut: { ...RENDER_CONFIG.postProcessing.lut, enabled: false },
  },
};

const withEffects = (changes: Partial<RenderConfig['postProcessing']>): RenderConfig => ({
  ...BARE,
  postProcessing: { ...BARE.postProcessing, ...changes },
});

/**
 * The chain is a TSL node graph, which cannot be built without a GPU, but *which* effects run and in
 * what order is a pure decision. These tests pin that decision — including the ordering constraints
 * that are easy to break silently, such as SMAA needing to run before the colour-space conversion
 * while FXAA must run after it.
 */
describe('post-effect selection and order', () => {
  it('runs nothing when post-processing is disabled', () => {
    const config: RenderConfig = {
      ...BARE,
      postProcessing: { ...BARE.postProcessing, enabled: false },
    };
    expect(resolvePostEffects(config)).toEqual([]);
    expect(chainsOwnsOutputTransform([])).toBe(false);
    expect(requiresSceneNormals([])).toBe(false);
  });

  it('returns only the enabled effects, always in canonical order', () => {
    const all = withEffects({
      antiAliasing: 'smaa',
      grade: { ...BARE.postProcessing.grade, enabled: true },
      bloom: { ...BARE.postProcessing.bloom, enabled: true },
      ambientOcclusion: { ...BARE.postProcessing.ambientOcclusion, enabled: true },
      chromaticAberration: { ...BARE.postProcessing.chromaticAberration, enabled: true },
      sharpen: { ...BARE.postProcessing.sharpen, enabled: true },
      filmGrain: { ...BARE.postProcessing.filmGrain, enabled: true },
      vignette: { ...BARE.postProcessing.vignette, enabled: true },
    });

    expect(resolvePostEffects(all)).toEqual([
      'ao',
      'grade',
      'bloom',
      'smaa',
      'chromaticAberration',
      'sharpen',
      'filmGrain',
      'vignette',
    ]);

    // Enabling a single effect still yields just that effect.
    expect(resolvePostEffects(withEffects({ antiAliasing: 'fxaa' }))).toEqual(['fxaa']);
    expect(
      resolvePostEffects(withEffects({ bloom: { ...BARE.postProcessing.bloom, enabled: true } })),
    ).toEqual(['bloom']);
  });

  it('places SMAA before the colour-space conversion and FXAA after it', () => {
    // SMAA is documented as requiring pre-sRGB input; FXAA as requiring post-sRGB input.
    const smaaConfig = withEffects({ antiAliasing: 'smaa' });
    const fxaaConfig = withEffects({ antiAliasing: 'fxaa' });

    expect(resolvePostEffects(smaaConfig)).toContain('smaa');
    expect(resolvePostEffects(fxaaConfig)).toContain('fxaa');

    // Both force the chain to own tone mapping and colour conversion, but SMAA sits upstream of
    // that step and FXAA downstream — the ordering is what the two nodes require.
    expect(chainsOwnsOutputTransform(['smaa'])).toBe(true);
    expect(chainsOwnsOutputTransform(['fxaa'])).toBe(true);
  });

  it('keeps the grade effects in the order that avoids amplifying noise', () => {
    const graded = withEffects({
      chromaticAberration: { ...BARE.postProcessing.chromaticAberration, enabled: true },
      sharpen: { ...BARE.postProcessing.sharpen, enabled: true },
      filmGrain: { ...BARE.postProcessing.filmGrain, enabled: true },
      vignette: { ...BARE.postProcessing.vignette, enabled: true },
    });
    const effects = resolvePostEffects(graded);
    // Sharpening must precede grain: the other order sharpens the noise the grain just added.
    expect(effects.indexOf('sharpen')).toBeLessThan(effects.indexOf('filmGrain'));
    expect(effects.indexOf('chromaticAberration')).toBeLessThan(effects.indexOf('sharpen'));
    expect(effects.indexOf('vignette')).toBeGreaterThan(effects.indexOf('filmGrain'));
  });

  it('grades the frame in linear light, before bloom and before tone mapping', () => {
    const graded = withEffects({
      antiAliasing: 'smaa',
      grade: { ...BARE.postProcessing.grade, enabled: true },
      bloom: { ...BARE.postProcessing.bloom, enabled: true },
      ambientOcclusion: { ...BARE.postProcessing.ambientOcclusion, enabled: true },
    });
    const effects = resolvePostEffects(graded);

    expect(effects).toContain('grade');
    // The tint is a light multiplier, so it must land while the image is still linear HDR: ahead of
    // bloom (so it warms the highlights that bloom) and ahead of the colour-space conversion, which
    // is the signal that SMAA sees it pre-sRGB like every other linear effect.
    expect(effects.indexOf('grade')).toBeGreaterThan(effects.indexOf('ao'));
    expect(effects.indexOf('grade')).toBeLessThan(effects.indexOf('bloom'));
    expect(effects.indexOf('grade')).toBeLessThan(effects.indexOf('smaa'));
    // It needs neither the normals attachment nor ownership of the output transform.
    expect(requiresSceneNormals(['grade'])).toBe(false);
    expect(chainsOwnsOutputTransform(['grade'])).toBe(false);
  });

  it('knows which effects need scene normals and which own the output transform', () => {
    expect(requiresSceneNormals(['ao'])).toBe(true);
    expect(requiresSceneNormals(['bloom', 'vignette'])).toBe(false);
    // A bloom-only chain can still let the pipeline do tone mapping at the end.
    expect(chainsOwnsOutputTransform(['ao', 'bloom'])).toBe(false);
    for (const effect of [
      'smaa',
      'chromaticAberration',
      'sharpen',
      'filmGrain',
      'vignette',
      'fxaa',
    ] satisfies PostEffectName[]) {
      expect(chainsOwnsOutputTransform([effect])).toBe(true);
    }
  });
});

describe('post stack per tier', () => {
  it('matches the tier contracts in docs/VISUAL_TARGET.md §3', () => {
    const tierC = applyTier(RENDER_CONFIG, 'C');
    const tierB = applyTier(RENDER_CONFIG, 'B');
    const tierA = applyTier(RENDER_CONFIG, 'A');

    // Tier C: no MSAA (FXAA instead), no ambient occlusion, no grain.
    expect(tierC.postProcessing.antiAliasing).toBe('fxaa');
    expect(tierC.renderer.antialias).toBe(false);
    expect(tierC.renderer.samples).toBe(0);
    expect(tierC.postProcessing.ambientOcclusion.enabled).toBe(false);
    expect(tierC.postProcessing.filmGrain.enabled).toBe(false);
    expect(resolvePostEffects(tierC)).toContain('fxaa');
    expect(resolvePostEffects(tierC)).not.toContain('smaa');

    // Tier B: MSAA, ambient occlusion at half resolution.
    expect(tierB.postProcessing.antiAliasing).toBe('msaa');
    expect(tierB.renderer.antialias).toBe(true);
    expect(tierB.postProcessing.ambientOcclusion.enabled).toBe(true);
    expect(tierB.postProcessing.ambientOcclusion.resolutionScale).toBe(0.5);
    expect(resolvePostEffects(tierB)).toContain('ao');

    // The time-of-day grade is on at every tier: it is a vector multiply, and it is what keeps a
    // captured backdrop in step with the clock.
    for (const tier of [tierC, tierB, tierA]) {
      expect(tier.postProcessing.grade.enabled).toBe(true);
      expect(resolvePostEffects(tier)).toContain('grade');
    }

    // Tier A: ambient occlusion at full resolution, with more samples, plus grain.
    expect(tierA.postProcessing.ambientOcclusion.resolutionScale).toBe(1);
    expect(tierA.postProcessing.ambientOcclusion.samples).toBeGreaterThan(
      tierB.postProcessing.ambientOcclusion.samples,
    );
    expect(tierA.postProcessing.filmGrain.enabled).toBe(true);
  });

  it('never pays for MSAA and a post-process AA mode at the same time', () => {
    for (const tier of ['C', 'B', 'A'] as const) {
      const config = applyTier(RENDER_CONFIG, tier);
      const msaaOn = config.renderer.antialias && config.renderer.samples > 0;
      expect(msaaOn).toBe(config.postProcessing.antiAliasing === 'msaa');
    }
  });

  it('keeps the AO settings the node actually consumes in a sane range', () => {
    for (const tier of ['C', 'B', 'A'] as const) {
      const ao = applyTier(RENDER_CONFIG, tier).postProcessing.ambientOcclusion;
      expect(ao.resolutionScale).toBeGreaterThan(0);
      expect(ao.resolutionScale).toBeLessThanOrEqual(1);
      expect(ao.radius).toBeGreaterThan(0);
      expect(ao.thickness).toBeGreaterThan(0);
      expect(ao.intensity).toBeGreaterThanOrEqual(0);
      expect(ao.intensity).toBeLessThanOrEqual(1);
      expect(Number.isInteger(ao.samples)).toBe(true);
      expect(ao.samples).toBeGreaterThan(0);
    }
  });
});

describe('depth of field and the look', () => {
  it('runs depth of field in the HDR stage, before antialiasing resolves edges', () => {
    const effects = resolvePostEffects(
      withEffects({
        depthOfField: { ...BARE.postProcessing.depthOfField, enabled: true },
        bloom: { ...BARE.postProcessing.bloom, enabled: true },
        antiAliasing: 'smaa',
      }),
    );
    // Blurring light rather than pixels is the whole reason it sits here: after tone mapping, an
    // out-of-focus highlight is a grey disc instead of a bright one.
    expect(effects).toContain('dof');
    expect(effects.indexOf('dof')).toBeGreaterThan(effects.indexOf('bloom'));
    expect(effects.indexOf('dof')).toBeLessThan(effects.indexOf('smaa'));
    // It runs before tone mapping, so it does not by itself force the chain to own the output
    // transform — only the effects that must run *after* the transfer do that.
    expect(chainsOwnsOutputTransform(['dof', 'bloom'])).toBe(false);
  });

  it('runs the look after tone mapping, where a LUT can legally be sampled', () => {
    const effects = resolvePostEffects(
      withEffects({
        lut: { ...BARE.postProcessing.lut, enabled: true },
        antiAliasing: 'smaa',
        sharpen: { ...BARE.postProcessing.sharpen, enabled: true },
      }),
    );
    expect(effects).toContain('lut');
    // `Lut3DNode` reads the incoming rgb as the lookup coordinates, so anything outside 0-1 samples
    // outside the table: the look has to be behind the tone map and the transfer, and ahead of every
    // other display-referred effect.
    expect(effects.indexOf('lut')).toBeGreaterThan(effects.indexOf('smaa'));
    expect(effects.indexOf('lut')).toBeLessThan(effects.indexOf('sharpen'));
    expect(chainsOwnsOutputTransform(['lut'])).toBe(true);
  });

  it('leaves the frame ungraded and unblurred when both are switched off', () => {
    const effects = resolvePostEffects(withEffects({ antiAliasing: 'fxaa' }));
    expect(effects).not.toContain('lut');
    expect(effects).not.toContain('dof');
  });

  it('switches depth of field off on the constrained tier and keeps the look', () => {
    // Four passes and five half-resolution targets is the wrong place to spend a constrained device's
    // budget; one texture fetch is not. The tier table is the contract, and this is where it is read.
    const tierC = applyTier(RENDER_CONFIG, 'C');
    expect(tierC.postProcessing.depthOfField.enabled).toBe(false);
    expect(tierC.postProcessing.lut.enabled).toBe(true);
    expect(resolvePostEffects(tierC)).not.toContain('dof');
    expect(resolvePostEffects(tierC)).toContain('lut');
  });

  it('keeps depth of field on above the constrained tier', () => {
    for (const tier of ['B', 'A'] as const) {
      const config = applyTier(RENDER_CONFIG, tier);
      expect(config.postProcessing.depthOfField.enabled).toBe(true);
      expect(resolvePostEffects(config)).toContain('dof');
    }
  });
});
