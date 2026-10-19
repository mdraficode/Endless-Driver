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
    >
  > & {
    readonly bloom?: Partial<BloomConfig>;
    readonly godrays?: Partial<GodraysConfig>;
    readonly contactShadows?: Partial<ContactShadowsConfig>;
    readonly ssgi?: Partial<SsgiConfig>;
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
 * Tier C — mobile and low-end hardware.
 *
 * MSAA is off, one shadow cascade at half resolution, and the backdrop is the HDRI rather than the
 * procedural sky with its cloud layer. Everything here trades fill rate for a stable frame on a
 * phone.
 *
 * **Deliberate deviation from `docs/VISUAL_TARGET.md` §3:** that table lists tier C's renderer path
 * as "WebGL2 backend". That line describes the hardware class this tier targets, and the
 * implementation keeps the backend on `auto` instead of pinning the older API — forcing WebGL2 on a
 * device that supports WebGPU would surrender performance for no quality gain, and the fallback
 * already engages wherever WebGPU is unavailable. Use `?backend=webgl` to force it for comparison.
 */
const TIER_C: TierDefinition = {
  id: 'C',
  name: 'Mobile / low',
  summary:
    'Phones and low-end laptops: WebGL2 backend, short shadow range, HDRI light with a procedural sky backdrop.',
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
      // The HDRI lights and reflects; it is never the visible backdrop. A garden photo
      // behind open terrain reads as a diorama at every tier, and the procedural sky is
      // one dome shader — the honest backdrop costs no more than the dishonest one.
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
      temporalAntiAliasing: { enabled: false },
      bloom: { strength: 0.18, radius: 0.4 },
      // No depth of field. It costs four passes and five half-resolution targets — on the constrained
      // tier that budget buys resolution, and there is no version of this effect worth a softer image
      // on the devices the tier exists for. The look LUT stays: it is one texture fetch.
      depthOfField: { enabled: false },
      ambientOcclusion: { enabled: false },
      chromaticAberration: { strength: 0.3 },
      sharpen: { sharpness: 0.75 },
      filmGrain: { enabled: false },
      vignette: { intensity: 0.45 },
    },
  },
  pending: [
    // FXAA and the absence of ambient occlusion are now implemented for this tier; what is still owed is
    // the more expensive alternative anti-aliasing and the world systems Phase 4-5 bring. TAA is
    // deliberately *not* on that list as a candidate for this tier — it is implemented, and it stays off
    // here because of what it costs, not because it is missing.
    'SMAA (as the higher-quality alternative to FXAA)',
    'reflection probes',
    '2 terrain layers',
    'impostor vegetation',
  ],
};

/**
 * Tier B — desktop balanced. The baseline `RENDER_CONFIG` is authored against this tier, so the
 * overrides below are the values that differ from "whatever the config file says".
 */
const TIER_B: TierDefinition = {
  id: 'B',
  name: 'Desktop balanced',
  summary: 'Typical desktop: WebGPU with the WebGL2 fallback, 3 cascades, procedural sky.',
  render: {
    maxPixelRatio: 1.5,
    renderer: {
      // MSAA off: this tier resolves edges temporally, and the two strategies cannot both be on. See the
      // note on `TemporalAntiAliasingConfig` — the trade is MSAA's perfect geometric edges for temporal
      // stability of *everything* (specular, shadow edges, occlusion noise), which is the better half.
      antialias: false,
      samples: 0,
    },
    shadows: {
      mapSize: 2048,
      csm: {
        cascades: 3,
        maxFar: 300,
        fade: true,
      },
    },
    atmosphere: {
      clouds: { enabled: true },
    },
    environment: {
      useAsBackground: false,
    },
    postProcessing: {
      antiAliasing: 'taa',
      // The shutter is live only above the high-speed gate in Application; ordinary road speed remains
      // crisp, while the balanced desktop tier pays for the velocity attachment when speed warrants it.
      motionBlur: { enabled: true, intensity: 0.28 },
      temporalAntiAliasing: { enabled: true, dynamicResolution: true },
      bloom: { strength: 0.16, radius: 0.4 },
      // A slightly tighter aperture than the baseline: this tier renders at 1.5x, and the blur is a
      // share of the frame, so the same number would read as a larger circle of confusion in pixels.
      depthOfField: { bokehScale: 13 },
      ambientOcclusion: { enabled: true, resolutionScale: 0.5 },
      // Eight taps of a depth buffer this tier already renders. The grounding this buys —
      // tyres, kerbs, posts meeting the ground against the sun — is the cheapest credibility
      // in the stack, and it is why the route baseline is captured with it on.
      contactShadows: { enabled: true, steps: 8 },
      filmGrain: { enabled: false },
    },
  },
  pending: ['SSR half-res', '3 terrain layers', 'LOD1-2 vegetation'],
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
      // Full-length contact march, and the bounce light: SSGI replaces GTAO on this tier
      // (its composite carries its own occlusion term). Both are stated here rather than
      // defaulted on, so a frame can always name what it paid for them.
      contactShadows: { enabled: true, steps: 16 },
      ssgi: { enabled: true },
      // Stronger high-speed shutter than B, still zero below the same gameplay speed threshold.
      motionBlur: { enabled: true, intensity: 0.36 },
      // A higher floor than the balanced tier: this tier is for hardware that was measured to hold its
      // frame budget, so the controller has less reason to trade resolution away. It still adapts — the
      // cost of not adapting is a stutter, and the schedule in `docs/REALISM_PLAN.md` §5 is what decides
      // whether that floor is defensible on real hardware.
      temporalAntiAliasing: { enabled: true, dynamicResolution: true, minScale: 0.75 },
      bloom: { strength: 0.26, radius: 0.5 },
      ambientOcclusion: { enabled: true, resolutionScale: 1, samples: 24 },
      filmGrain: { enabled: true, intensity: 0.05 },
    },
  },
  pending: [
    'SSR + reflection probes',
    '4 terrain layers + POM',
    'LOD0 vegetation',
    'volumetric clouds',
  ],
};

export const TIER_DEFINITIONS: Readonly<Record<TierId, TierDefinition>> = {
  C: TIER_C,
  B: TIER_B,
  A: TIER_A,
};

/** Tier used when nothing else applies. Matches the baseline the config file is authored against. */
export const DEFAULT_TIER: TierId = 'B';

const TIER_IDS = new Set<string>(TIER_ORDER);

/** Case-insensitive tier id check, for parsing user input such as `?tier=a`. */
export function isTierId(value: string | null | undefined): value is TierId {
  return typeof value === 'string' && TIER_IDS.has(value.toUpperCase());
}

/** Normalises a tier id written in any case (`'a'` → `'A'`). */
export function normaliseTierId(value: string): TierId {
  return value.toUpperCase() as TierId;
}
