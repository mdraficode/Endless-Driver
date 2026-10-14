/**
 * Quality tiers: the C/B/A contracts from `docs/VISUAL_TARGET.md` §3, expressed as data.
 *
 * These are explicit contracts, not "auto magic". A tier is resolved once at start-up (see
 * `core/QualityTier.ts`), applied as an overlay on the baseline render configuration, and reported
 * in the HUD, so every performance or quality statement can name the tier it was made under.
 *
 * Only settings that exist today are listed under `render`; everything a tier is contracted to
 * control *once implemented* (ambient occlusion, reflections, motion blur, the anti-aliasing
 * strategy, terrain layers, vegetation density, particles) is listed under `pending`. Nothing in
 * `pending` affects rendering yet, and nothing here pretends it does.
 */
import type {
  AtmosphereConfig,
  BloomConfig,
  CloudConfig,
  CsmConfig,
  EnvironmentConfig,
  LightingConfig,
  PostProcessingConfig,
  RendererConfig,
  ShadowConfig,
  SkyConfig,
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
  readonly postProcessing?: Partial<Omit<PostProcessingConfig, 'bloom'>> & {
    readonly bloom?: Partial<BloomConfig>;
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
  summary: 'Phones and low-end laptops: WebGL2 backend, short shadow range, HDRI backdrop.',
  render: {
    maxPixelRatio: 1,
    renderer: {
      backendPreference: 'auto',
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
      useAsBackground: true,
    },
    postProcessing: {
      bloom: { strength: 0.18, radius: 0.4 },
    },
  },
  pending: [
    'FXAA/SMAA',
    'GTAO off',
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
      backendPreference: 'auto',
      antialias: true,
      samples: 4,
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
      bloom: { strength: 0.22, radius: 0.45 },
    },
  },
  pending: ['TAAU', 'GTAO half-res', 'SSR half-res', '3 terrain layers', 'LOD1-2 vegetation'],
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
    renderer: {
      backendPreference: 'auto',
      antialias: true,
      samples: 4,
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
      bloom: { strength: 0.26, radius: 0.5 },
    },
  },
  pending: [
    'TAAU/TRAA',
    'GTAO full-res',
    'SSR + probes + wet roads',
    '4 terrain layers + POM',
    'LOD0 vegetation',
    'volumetric clouds / light shafts',
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
