/**
 * Quality tiers: the C/B/A contracts from `docs/VISUAL_TARGET.md` §3, expressed as data.
 *
 * These are explicit contracts, not "auto magic". A tier is resolved once at start-up (see
 * `core/QualityTier.ts`), applied as an overlay on the baseline render configuration, and reported
 * in the HUD, so every performance or quality statement can name the tier it was made under.
 *
 * Only settings that exist today are listed under `render`; world systems still contracted to be
 * implemented (reflection probes, terrain layers, additional vegetation density) remain under
 * `pending`. Nothing in `pending` affects rendering yet, and nothing here pretends it does.
 *
 * The anti-aliasing strategy and motion blur moved out of `pending` when they landed: a tier now states
 * *which* strategy it uses, and the difference between the tiers is measurable in the HUD (`Renderer`
 * reports the strategy, the temporal row reports the render scale it resolves at).
 */
import type {
  AmbientOcclusionConfig,
  ContactShadowsConfig,
  SsgiConfig,
  ScreenSpaceReflectionsConfig,
  MotionBlurConfig,
  AtmosphereConfig,
  BloomConfig,
  ChromaticAberrationConfig,
  CloudConfig,
  CsmConfig,
  DepthOfFieldConfig,
  EnvironmentConfig,
  FilmGrainConfig,
  GodraysConfig,
  LightingConfig,
  PostProcessingConfig,
  RendererConfig,
  ShadowConfig,
  SharpenConfig,
  SkyConfig,
  TemporalAntiAliasingConfig,
  VignetteConfig,
} from './render';

export type TierId = 'C' | 'B' | 'A';

/** Low to high. Used for ordering, comparisons, and documentation tables. */
export const TIER_ORDER: readonly TierId[] = ['C', 'B', 'A'];

/**
 * Overrides applied on top of the baseline `RENDER_CONFIG`. Every field is optional: a tier only
 * states what it changes, so the baseline stays readable and a new setting does not need to be
 * repeated in three places.
 */
export interface TierRenderOverrides {
  readonly maxPixelRatio?: number;
  readonly renderer?: Partial<RendererConfig>;
  readonly shadows?: Partial<Omit<ShadowConfig, 'csm'>> & { readonly csm?: Partial<CsmConfig> };
  readonly sky?: Partial<SkyConfig>;
  readonly atmosphere?: Partial<Omit<AtmosphereConfig, 'clouds'>> & {
    readonly clouds?: Partial<CloudConfig>;
  };
  readonly environment?: Partial<EnvironmentConfig>;
  readonly lighting?: Partial<LightingConfig>;
  readonly postProcessing?: Partial<
    Omit<
      PostProcessingConfig,
      | 'bloom'
      | 'ambientOcclusion'
      | 'chromaticAberration'
      | 'sharpen'
      | 'filmGrain'
      | 'vignette'
      | 'depthOfField'
      | 'motionBlur'
      | 'temporalAntiAliasing'
      | 'godrays'
      | 'contactShadows'
      | 'ssgi'
      | 'ssr'
    >
  > & {
    readonly bloom?: Partial<BloomConfig>;
    readonly godrays?: Partial<GodraysConfig>;
    readonly contactShadows?: Partial<ContactShadowsConfig>;
    readonly ssgi?: Partial<SsgiConfig>;
    readonly ssr?: Partial<ScreenSpaceReflectionsConfig>;
    readonly motionBlur?: Partial<MotionBlurConfig>;
    readonly temporalAntiAliasing?: Partial<TemporalAntiAliasingConfig>;
    readonly ambientOcclusion?: Partial<AmbientOcclusionConfig>;
    readonly chromaticAberration?: Partial<ChromaticAberrationConfig>;
    readonly sharpen?: Partial<SharpenConfig>;
    readonly filmGrain?: Partial<FilmGrainConfig>;
    readonly vignette?: Partial<VignetteConfig>;
    readonly depthOfField?: Partial<DepthOfFieldConfig>;
  };
}

export interface TierDefinition {
  readonly id: TierId;
  /** Short human label for logs and the HUD. */
  readonly name: string;
  /** One-line description of who the tier is for. */
  readonly summary: string;
  readonly render: TierRenderOverrides;
  /** Systems this tier is contracted to control once they exist. Declared, not yet implemented. */
  readonly pending: readonly string[];
}

/**
 * Tier C — performance-first profile for unmeasured, mobile, and constrained hardware.
 *
 * MSAA, temporal history, motion vectors, chromatic aberration, clouds, and POM are off; one shadow
 * cascade and reduced terrain tessellation prioritize smooth gameplay. It starts near native scene scale
 * and adapts gradually within its configured range as frame times require. The HDRI supplies
 * image-based lighting while the gameplay backdrop stays procedural. `?envbg=1` is available for an
 * HDRI-backdrop A/B.
 *
 * Backend selection is project-wide rather than a tier override: all tiers prefer WebGPU when
 * available and use automatic WebGL2 fallback; `?backend=webgl` forces the fallback for comparison.
 */
const TIER_C: TierDefinition = {
  id: 'C',
  name: 'Performance / mobile',
  summary:
    'Performance-first fallback for unmeasured and constrained devices: reduced terrain detail, a single shadow cascade, FXAA and adaptive scaling from a near-native scene resolution.',
  render: {
    maxPixelRatio: 1,
    // No backendPreference here on purpose: the backend is a project-wide
    // verification decision (config/render.ts), not a per-tier budget item.
    // A tier restating it once silently overrode the shipped default.
    renderer: {
      antialias: false,
      samples: 0,
    },
    shadows: {
      mapSize: 1024,
      cameraBounds: 60,
      csm: {
        cascades: 1,
        maxFar: 140,
        fade: false,
      },
    },
    atmosphere: {
      clouds: { enabled: false },
    },
    environment: {
      // Gameplay defaults to the clear procedural sky while the HDRI supplies image-based lighting.
      // `?envbg=1` opts into the captured HDRI backdrop for look-dev comparison.
      useAsBackground: false,
    },
    postProcessing: {
      // No MSAA on this tier; the edges are handled by FXAA, which is the tier's contract.
      antiAliasing: 'fxaa',
      // Neither of the effects that need motion vectors is here, and for the same reason: both of them are
      // paid for by the whole scene pass (a second attachment, previous-frame matrices per object, a
      // full-screen resolve with a history buffer), and on the hardware this tier exists for that budget
      // buys resolution. The velocity attachment is not even requested, so the cost of the pair on this
      // tier is exactly zero — not "small".
      motionBlur: { enabled: false },
      // Low-resolution, short-reach SSR is only assembled for driving/city scenes with a wet-road mask.
      ssr: {
        enabled: true,
        resolutionScale: 0.33,
        quality: 0.14,
        maxDistanceMeters: 22,
        thicknessMeters: 0.18,
        intensity: 0.58,
      },
      temporalAntiAliasing: {
        enabled: false,
        dynamicResolution: true,
        renderScale: 0.9,
        minScale: 0.6,
        maxScale: 1,
        step: 0.05,
        adjustmentIntervalSeconds: 0.5,
        smoothing: 0.1,
      },
      bloom: { strength: 0.18, radius: 0.4 },
      // No depth of field. It costs four passes and five half-resolution targets — on the constrained
      // tier that budget buys resolution, and there is no version of this effect worth a softer image
      // on the devices the tier exists for. The look LUT stays: it is one texture fetch.
      depthOfField: { enabled: false },
      ambientOcclusion: { enabled: false },
      chromaticAberration: { enabled: false },
      sharpen: { sharpness: 1 },
      filmGrain: { enabled: false },
      vignette: { intensity: 0.45 },
    },
  },
  pending: [
    // FXAA is the low-cost current path; SMAA remains a higher-quality option for measured headroom.
    'SMAA (as the higher-quality alternative to FXAA)',
    'reflection probes',
    '2 terrain layers',
    'impostor vegetation',
  ],
};

/**
 * Tier B — desktop balanced. It adds fidelity above the performance-first default while keeping
 * temporal history, motion vectors, clouds, and high-cost shadow/contact work disabled.
 */
const TIER_B: TierDefinition = {
  id: 'B',
  name: 'Desktop balanced',
  summary:
    'Higher quality above the performance-first default: two lower-resolution shadow cascades, half-resolution AO, SMAA and adaptive scaling from native resolution.',
  render: {
    maxPixelRatio: 1.25,
    renderer: {
      // MSAA is off because the scene uses a post-process SMAA resolve, which requires neither temporal
      // history nor per-object previous-frame matrices.
      antialias: false,
      samples: 0,
    },
    shadows: {
      mapSize: 1024,
      csm: {
        cascades: 2,
        maxFar: 220,
        fade: true,
      },
    },
    atmosphere: {
      clouds: { enabled: false },
    },
    environment: {
      useAsBackground: false,
    },
    postProcessing: {
      // Keep the shared per-pixel velocity attachment off until the high tier's cost has been measured.
      // SMAA leaves motion vectors and temporal history out of the whole scene pass.
      antiAliasing: 'smaa',
      motionBlur: { enabled: false },
      ssr: {
        enabled: true,
        resolutionScale: 0.5,
        quality: 0.22,
        maxDistanceMeters: 36,
        thicknessMeters: 0.14,
        intensity: 0.68,
      },
      temporalAntiAliasing: {
        enabled: false,
        dynamicResolution: true,
        renderScale: 1,
        minScale: 0.8,
        maxScale: 1,
        step: 0.05,
        adjustmentIntervalSeconds: 0.5,
        smoothing: 0.1,
      },
      bloom: { strength: 0.16, radius: 0.4 },
      // Retained only as a dormant look-dev value; depth of field stays off during gameplay.
      depthOfField: { bokehScale: 13 },
      ambientOcclusion: { enabled: true, resolutionScale: 0.5 },
      contactShadows: { enabled: false },
      filmGrain: { enabled: false },
    },
  },
  pending: ['reflection probes', '3 terrain layers', 'LOD1-2 vegetation'],
};

/**
 * Tier A — desktop high. Opt-in only until it has been measured on named hardware: the plan does
 * not claim this tier holds its frame budget, and selecting it silently would be a claim.
 */
const TIER_A: TierDefinition = {
  id: 'A',
  name: 'Desktop high',
  summary: 'Capable desktop: 4 cascades at up to 4096, full pixel ratio, strongest lighting.',
  render: {
    maxPixelRatio: 2,
    // No backendPreference here on purpose: the backend is a project-wide
    // verification decision (config/render.ts), not a per-tier budget item.
    // A tier restating it once silently overrode the shipped default.
    renderer: {
      antialias: false,
      samples: 0,
    },
    shadows: {
      mapSize: 4096,
      csm: {
        cascades: 4,
        maxFar: 400,
        fade: true,
      },
    },
    atmosphere: {
      clouds: { enabled: true, density: 0.45 },
    },
    environment: {
      useAsBackground: false,
    },
    postProcessing: {
      antiAliasing: 'taa',
      // The raymarch tier. Sixty shadow taps per pixel at half resolution is the most expensive
      // single effect in the stack, and it belongs to the tier that exists for measured headroom.
      godrays: { enabled: true },
      // Full-length contact march and the bounce light: SSGI replaces SSAO on this tier
      // (its composite carries its own occlusion term). Both are stated here rather than
      // defaulted on, so a frame can always name what it paid for them.
      contactShadows: { enabled: true, steps: 16 },
      ssgi: { enabled: true },
      ssr: {
        enabled: true,
        resolutionScale: 0.7,
        quality: 0.34,
        maxDistanceMeters: 54,
        thicknessMeters: 0.1,
        intensity: 0.74,
      },
      // Stronger high-speed shutter than B, still zero below the same gameplay speed threshold.
      motionBlur: { enabled: true, intensity: 0.36 },
      // A higher floor than the performance-first profiles. This remains an explicit, unmeasured opt-in;
      // real-device frame-budget evidence must decide whether the floor is defensible.
      temporalAntiAliasing: { enabled: true, dynamicResolution: true, minScale: 0.75 },
      bloom: { strength: 0.26, radius: 0.5 },
      ambientOcclusion: { enabled: true, resolutionScale: 1, samples: 24 },
      filmGrain: { enabled: true, intensity: 0.05 },
    },
  },
  pending: ['reflection probes', '4 terrain layers + POM', 'LOD0 vegetation', 'volumetric clouds'],
};

export const TIER_DEFINITIONS: Readonly<Record<TierId, TierDefinition>> = {
  C: TIER_C,
  B: TIER_B,
  A: TIER_A,
};

/** Performance-first tier used until the owner selects a higher budget on their device. */
export const DEFAULT_TIER: TierId = 'C';

const TIER_IDS = new Set<string>(TIER_ORDER);

/** Case-insensitive tier id check, for parsing user input such as `?tier=a`. */
export function isTierId(value: string | null | undefined): value is TierId {
  return typeof value === 'string' && TIER_IDS.has(value.toUpperCase());
}

/** Normalises a tier id written in any case (`'a'` → `'A'`). */
export function normaliseTierId(value: string): TierId {
  return value.toUpperCase() as TierId;
}
