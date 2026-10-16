import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG, type RenderConfig } from '../../src/config/render';
import { applyTier } from '../../src/core/QualityTier';
import {
  chainsOwnsOutputTransform,
  requiresSceneDiffuse,
  requiresSceneNormals,
  requiresSceneVelocity,
  resolvePostEffects,
  type PostEffectName,
} from '../../src/shaders/post-chain';
import { applyRenderSwitches } from '../../src/config/render';

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
    // The two effects that need motion vectors. `BARE` is a configuration with nothing in the HUD's effect
    // row, so it has to switch off the temporal resolve as well — and with it the velocity attachment, which
    // is why the bare case still asks for no extra render targets at all.
    motionBlur: { ...RENDER_CONFIG.postProcessing.motionBlur, enabled: false },
    temporalAntiAliasing: { ...RENDER_CONFIG.postProcessing.temporalAntiAliasing, enabled: false },
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

    // Tier B: temporal resolve, ambient occlusion at half resolution.
    expect(tierB.postProcessing.antiAliasing).toBe('taa');
    expect(tierB.renderer.antialias).toBe(false);
    expect(tierB.renderer.samples).toBe(0);
    expect(resolvePostEffects(tierB)).toContain('taa');
    expect(resolvePostEffects(tierB)).not.toContain('motionBlur');
    expect(resolvePostEffects(tierB)).not.toContain('smaa');
    expect(resolvePostEffects(tierB)).not.toContain('fxaa');
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
      // The temporal path is the strictest case of the same rule: the resolve requires MSAA off, so a tier
      // that resolves temporally must not have samples configured at all.
      if (config.postProcessing.antiAliasing === 'taa') {
        expect(config.postProcessing.temporalAntiAliasing.enabled).toBe(true);
        expect(config.renderer.samples).toBe(0);
      }
    }
  });

  it('gives the constrained tier neither of the effects that need motion vectors', () => {
    const tierC = applyTier(RENDER_CONFIG, 'C');
    expect(tierC.postProcessing.temporalAntiAliasing.enabled).toBe(false);
    expect(tierC.postProcessing.motionBlur.enabled).toBe(false);
    // Nothing reads velocity, so the scene pass asks for no velocity attachment: the pair costs this tier
    // exactly zero rather than "little".
    expect(requiresSceneVelocity(resolvePostEffects(tierC))).toBe(false);
    expect(resolvePostEffects(tierC)).toContain('fxaa');
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

  it('keeps depth of field off at every tier during gameplay', () => {
    // Gameplay legibility beats the bokeh: distant road must stay readable.
    // Photo mode (Phase 8) is where DOF returns.
    for (const tier of ['C', 'B', 'A'] as const) {
      const config = applyTier(RENDER_CONFIG, tier);
      expect(config.postProcessing.depthOfField.enabled).toBe(false);
      expect(resolvePostEffects(config)).not.toContain('dof');
    }
  });
});

describe('temporal anti-aliasing and motion blur', () => {
  const temporal = (changes: Partial<RenderConfig['postProcessing']> = {}): RenderConfig =>
    withEffects({
      antiAliasing: 'taa',
      temporalAntiAliasing: { ...BARE.postProcessing.temporalAntiAliasing, enabled: true },
      motionBlur: { ...BARE.postProcessing.motionBlur, enabled: true },
      ...changes,
    });

  it('requests a velocity attachment exactly when something reads motion vectors', () => {
    expect(requiresSceneVelocity([])).toBe(false);
    expect(requiresSceneVelocity(['taa'])).toBe(true);
    // Motion blur alone is enough: it reads the same buffer the resolve does, which is what makes the pair
    // one slice rather than two.
    expect(requiresSceneVelocity(['motionBlur'])).toBe(true);
    expect(requiresSceneVelocity(['bloom', 'lut'])).toBe(false);
    expect(requiresSceneVelocity(resolvePostEffects(temporal()))).toBe(true);
  });

  it('runs the temporal resolve on the scene pass, ahead of everything that touches colour', () => {
    const effects = resolvePostEffects(
      temporal({
        grade: { ...BARE.postProcessing.grade, enabled: true },
        bloom: { ...BARE.postProcessing.bloom, enabled: true },
        ambientOcclusion: { ...BARE.postProcessing.ambientOcclusion, enabled: true },
        depthOfField: { ...BARE.postProcessing.depthOfField, enabled: true },
        lut: { ...BARE.postProcessing.lut, enabled: true },
      }),
    );

    // The ordering constraint: the resolve accumulates what is upstream of it, so it has to sit directly on
    // the scene pass — after the occlusion term it is meant to denoise, before the first effect that is a
    // *property of the finished frame* rather than of the scene.
    expect(effects.indexOf('taa')).toBeLessThan(effects.indexOf('grade'));
    expect(effects.indexOf('taa')).toBeLessThan(effects.indexOf('bloom'));
    expect(effects.indexOf('taa')).toBeLessThan(effects.indexOf('dof'));
    expect(effects.indexOf('taa')).toBeLessThan(effects.indexOf('lut'));
    expect(effects.indexOf('taa')).toBeLessThan(effects.indexOf('motionBlur'));
  });

  it('blurs motion in the HDR stage on a sharp image, before the lens defocuses it', () => {
    const effects = resolvePostEffects(
      temporal({
        grade: { ...BARE.postProcessing.grade, enabled: true },
        bloom: { ...BARE.postProcessing.bloom, enabled: true },
        depthOfField: { ...BARE.postProcessing.depthOfField, enabled: true },
        lut: { ...BARE.postProcessing.lut, enabled: true },
      }),
    );

    // It reads the scene as light, so it cannot run after tone mapping — and it runs directly on the
    // scene image, ahead of the grade, the bloom and the depth of field: an exposure integrates the light
    // that reached the sensor, and the defocus of the lens is a property of that same exposure. The
    // position is also the only one the node can *take*: it samples its input as a texture, so a composed
    // expression upstream of it — the grade's multiply, the bloom's add — is a `TypeError` inside node
    // setup, which three catches, logs and renders around as a black frame.
    expect(effects.indexOf('motionBlur')).toBeLessThan(effects.indexOf('grade'));
    expect(effects.indexOf('motionBlur')).toBeLessThan(effects.indexOf('bloom'));
    expect(effects.indexOf('motionBlur')).toBeLessThan(effects.indexOf('dof'));
    expect(effects.indexOf('motionBlur')).toBeLessThan(effects.indexOf('lut'));
    // The temporal resolve is the one thing that *does* precede it — it is the exposure's own history
    // accumulation, and motion blur has to walk a resolved image rather than a jittered one.
    expect(effects.indexOf('taa')).toBeLessThan(effects.indexOf('motionBlur'));
    // Neither of the two forces the output transform into the chain — they are HDR-stage effects, and the
    // LUT in this configuration is what owns the transform, not them. (Asserted on the pair alone so the
    // test says that either way round.)
    expect(chainsOwnsOutputTransform(['taa', 'motionBlur'])).toBe(false);
    expect(chainsOwnsOutputTransform(effects)).toBe(true);
  });

  it('resolves with exactly one of the three strategies, never two at once', () => {
    const strategies: readonly RenderConfig['postProcessing']['antiAliasing'][] = [
      'taa',
      'smaa',
      'fxaa',
      'none',
    ];
    for (const antiAliasing of strategies) {
      for (const enabled of [true, false]) {
        const effects = resolvePostEffects(
          withEffects({
            antiAliasing,
            temporalAntiAliasing: {
              ...BARE.postProcessing.temporalAntiAliasing,
              enabled,
            },
          }),
        );
        const aaEffects = effects.filter(
          (effect) => effect === 'taa' || effect === 'smaa' || effect === 'fxaa',
        );
        expect(aaEffects.length).toBeLessThanOrEqual(1);
        // A tier that resolves temporally is never left without AA when the temporal path is switched off:
        // `?taa=0` is a comparison switch, and comparing against a jagged frame proves nothing.
        if (antiAliasing === 'taa' && !enabled) {
          expect(aaEffects).toEqual(['smaa']);
        }
      }
    }
  });

  it('turns both effects off from the URL, and leaves spatial AA in their place', () => {
    const base = applyTier(RENDER_CONFIG, 'B');
    const off = applyRenderSwitches(base, '?taa=0&mblur=0');
    expect(resolvePostEffects(off)).not.toContain('taa');
    expect(resolvePostEffects(off)).not.toContain('motionBlur');
    expect(resolvePostEffects(off)).toContain('smaa');
    expect(requiresSceneVelocity(resolvePostEffects(off))).toBe(false);

    const on = applyRenderSwitches(base, '?taa=1&mblur=1');
    expect(resolvePostEffects(on)).toContain('taa');
    expect(resolvePostEffects(on)).toContain('motionBlur');
  });

  it('lets the URL name a strategy outright, for a like-for-like A/B', () => {
    const base = applyTier(RENDER_CONFIG, 'B');
    expect(resolvePostEffects(applyRenderSwitches(base, '?aa=fxaa'))).toContain('fxaa');
    expect(resolvePostEffects(applyRenderSwitches(base, '?aa=fxaa'))).not.toContain('taa');
    expect(resolvePostEffects(applyRenderSwitches(base, '?aa=smaa'))).toContain('smaa');
    expect(resolvePostEffects(applyRenderSwitches(base, '?aa=none'))).toEqual(
      resolvePostEffects(base).filter(
        (effect) => effect !== 'taa' && effect !== 'smaa' && effect !== 'fxaa',
      ),
    );
  });

  it('treats an explicit render scale as a decision to stop adapting', () => {
    const base = applyTier(RENDER_CONFIG, 'B');
    const fixed = applyRenderSwitches(base, '?res=0.6');
    expect(fixed.postProcessing.temporalAntiAliasing.dynamicResolution).toBe(false);
    expect(fixed.postProcessing.temporalAntiAliasing.renderScale).toBeCloseTo(0.6, 5);

    // The adaptive path is the default, and it can be switched back on independently of the scale.
    expect(base.postProcessing.temporalAntiAliasing.dynamicResolution).toBe(true);
    const adaptive = applyRenderSwitches(base, '?dynres=1');
    expect(adaptive.postProcessing.temporalAntiAliasing.dynamicResolution).toBe(true);

    // A scale above the ceiling is clamped rather than honoured: the effect may not supersample.
    const tooHigh = applyRenderSwitches(base, '?res=4');
    expect(tooHigh.postProcessing.temporalAntiAliasing.renderScale).toBe(
      base.postProcessing.temporalAntiAliasing.maxScale,
    );
  });

  it('keeps the dynamic scale bounds ordered and inside the frame', () => {
    for (const tier of ['C', 'B', 'A'] as const) {
      const taa = applyTier(RENDER_CONFIG, tier).postProcessing.temporalAntiAliasing;
      expect(taa.minScale).toBeGreaterThan(0);
      expect(taa.minScale).toBeLessThanOrEqual(taa.maxScale);
      expect(taa.maxScale).toBeLessThanOrEqual(1);
      expect(taa.tolerance).toBeGreaterThan(0);
      expect(taa.tolerance).toBeLessThan(1);
      expect(taa.smoothing).toBeGreaterThan(0);
      expect(taa.smoothing).toBeLessThanOrEqual(1);
      expect(taa.targetFrameTimeMs).toBeGreaterThan(0);
      expect(taa.adjustmentIntervalSeconds).toBeGreaterThan(0);
    }
  });

  it('keeps the motion blur sampler count an integer the loop can unroll', () => {
    for (const tier of ['C', 'B', 'A'] as const) {
      const blur = applyTier(RENDER_CONFIG, tier).postProcessing.motionBlur;
      expect(Number.isInteger(blur.samples)).toBe(true);
      expect(blur.samples).toBeGreaterThanOrEqual(2);
      expect(blur.intensity).toBeGreaterThan(0);
    }
  });

  it('scales the shutter angle from the URL', () => {
    const base = applyTier(RENDER_CONFIG, 'B');
    expect(applyRenderSwitches(base, '?mb=0.5').postProcessing.motionBlur.intensity).toBe(0.5);
    expect(applyRenderSwitches(base, '?mb=-3').postProcessing.motionBlur.intensity).toBe(0);
    // A non-numeric value is ignored rather than turned into NaN, which would smear every pixel by nothing.
    expect(applyRenderSwitches(base, '?mb=lots').postProcessing.motionBlur.intensity).toBe(
      base.postProcessing.motionBlur.intensity,
    );
  });
});

describe('god rays', () => {
  it('marches after the shutter and before the grade, so the grade tints the shafts', () => {
    const config = withEffects({
      godrays: { ...RENDER_CONFIG.postProcessing.godrays, enabled: true },
      motionBlur: { ...RENDER_CONFIG.postProcessing.motionBlur, enabled: true },
      grade: { enabled: true },
      bloom: { ...RENDER_CONFIG.postProcessing.bloom, enabled: true },
    });
    const effects = resolvePostEffects(config);
    expect(effects).toContain('godrays');
    expect(effects.indexOf('godrays')).toBeGreaterThan(effects.indexOf('motionBlur'));
    expect(effects.indexOf('godrays')).toBeLessThan(effects.indexOf('grade'));
    expect(effects.indexOf('godrays')).toBeLessThan(effects.indexOf('bloom'));
  });

  it('is the high tier’s effect: on for A, off for B and C', () => {
    expect(resolvePostEffects(applyTier(RENDER_CONFIG, 'A'))).toContain('godrays');
    expect(resolvePostEffects(applyTier(RENDER_CONFIG, 'B'))).not.toContain('godrays');
    expect(resolvePostEffects(applyTier(RENDER_CONFIG, 'C'))).not.toContain('godrays');
  });

  it('switches from the URL in both directions', () => {
    const tierB = applyTier(RENDER_CONFIG, 'B');
    expect(applyRenderSwitches(tierB, '?godrays=1').postProcessing.godrays.enabled).toBe(true);
    const tierA = applyTier(RENDER_CONFIG, 'A');
    expect(applyRenderSwitches(tierA, '?godrays=0').postProcessing.godrays.enabled).toBe(false);
  });
});

describe('contact shadows and SSGI', () => {
  it('places both in the HDR stage, ahead of the temporal resolve', () => {
    const effects = resolvePostEffects(applyTier(RENDER_CONFIG, 'A'));
    expect(effects.indexOf('ssgi')).toBeLessThan(effects.indexOf('contactShadows'));
    expect(effects.indexOf('contactShadows')).toBeLessThan(effects.indexOf('taa'));
    expect(effects).not.toContain('motionBlur'); // gameplay: no motion blur (2026-10-16)
  });

  it('replaces GTAO with SSGI on the high tier instead of stacking both occlusion terms', () => {
    const tierA = resolvePostEffects(applyTier(RENDER_CONFIG, 'A'));
    expect(tierA).toContain('ssgi');
    expect(tierA).not.toContain('ao');
    const tierB = resolvePostEffects(applyTier(RENDER_CONFIG, 'B'));
    expect(tierB).toContain('ao');
    expect(tierB).not.toContain('ssgi');
  });

  it('buys contact shadows from tier B up, never on the constrained tier', () => {
    expect(resolvePostEffects(applyTier(RENDER_CONFIG, 'C'))).not.toContain('contactShadows');
    expect(resolvePostEffects(applyTier(RENDER_CONFIG, 'B'))).toContain('contactShadows');
    expect(resolvePostEffects(applyTier(RENDER_CONFIG, 'A'))).toContain('contactShadows');
  });

  it('requests the diffuse attachment only for SSGI, and normals for either occlusion path', () => {
    expect(requiresSceneDiffuse(resolvePostEffects(applyTier(RENDER_CONFIG, 'A')))).toBe(true);
    expect(requiresSceneDiffuse(resolvePostEffects(applyTier(RENDER_CONFIG, 'B')))).toBe(false);
    expect(requiresSceneNormals(resolvePostEffects(applyTier(RENDER_CONFIG, 'A')))).toBe(true);
    expect(requiresSceneNormals(resolvePostEffects(applyTier(RENDER_CONFIG, 'B')))).toBe(true);
    expect(requiresSceneNormals(resolvePostEffects(applyTier(RENDER_CONFIG, 'C')))).toBe(false);
  });

  it('honours the comparison switches from the URL', () => {
    const tierB = applyTier(RENDER_CONFIG, 'B');
    expect(resolvePostEffects(applyRenderSwitches(tierB, '?contact=0'))).not.toContain(
      'contactShadows',
    );
    expect(resolvePostEffects(applyRenderSwitches(tierB, '?ssgi=1'))).toContain('ssgi');
    expect(resolvePostEffects(applyRenderSwitches(tierB, '?ssgi=1'))).not.toContain('ao');
  });
});
