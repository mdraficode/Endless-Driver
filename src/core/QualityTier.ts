import {
  DEFAULT_TIER,
  TIER_DEFINITIONS,
  isTierId,
  normaliseTierId,
  type TierId,
} from '../config/tiers';
import type { RenderConfig } from '../config/render';

/**
 * Quality-tier resolution and application.
 *
 * Two pure steps, both deliberately outside the renderer so they can be reasoned about and tested
 * without a GPU:
 *
 * 1. `resolveTier()` turns an environment description into a tier plus the reason it was chosen.
 *    The reason is reported in the HUD, because "why am I on tier C?" is the first question any
 *    quality report has to answer.
 * 2. `applyTier()` overlays that tier's settings onto the baseline render configuration.
 *
 * Selection is deterministic and intentionally conservative. Tier A is never chosen automatically:
 * the plan has not yet measured whether its settings hold a frame budget on named hardware, and
 * quietly selecting a tier the project cannot stand behind would be exactly the kind of unverified
 * claim the project's rules forbid.
 */

/** Why a tier was selected. `requested` means the operator asked for it explicitly. */
export type TierReason = 'requested' | 'mobile' | 'constrained' | 'desktop-default' | 'unresolved';

export interface TierEnvironment {
  /** Raw `?tier=` value, if any. */
  readonly requested?: string | null;
  /** Coarse pointer or a mobile user agent. */
  readonly isMobile: boolean;
  /** CSS pixels of viewport width. */
  readonly viewportWidth: number;
  /** `navigator.hardwareConcurrency`, or a conservative default when unavailable. */
  readonly hardwareConcurrency: number;
  /** `navigator.deviceMemory` in GB where the browser exposes it, otherwise `null`. */
  readonly deviceMemory?: number | null;
}

export interface TierResolution {
  readonly id: TierId;
  readonly reason: TierReason;
}

/**
 * Viewports narrower than this are treated as mobile even if the user agent claims otherwise — a
 * backstop for phones requesting the desktop site, not a trigger for a desktop window that happens
 * to be small. A 600 px desktop window is a narrow window; a 390 px one is a phone.
 */
const MOBILE_VIEWPORT_BACKSTOP = 480;

/** At or below this many logical cores, the device is treated as low-end. */
const CONSTRAINED_CORES = 4;

/** At or below this much device memory (GB), the device is treated as low-end. */
const CONSTRAINED_MEMORY_GB = 4;

/**
 * Reads `?tier=` from a query string. Returns `null` when absent or unrecognised, so a typo falls
 * back to normal selection instead of failing the start-up.
 */
export function readTierRequest(search: string): TierId | null {
  const value = new URLSearchParams(search).get('tier');
  return isTierId(value) ? normaliseTierId(value as string) : null;
}

/** Chooses the tier for an environment. Explicit request wins; otherwise the conservative rules. */
export function resolveTier(environment: TierEnvironment): TierResolution {
  const requested = environment.requested;
  if (isTierId(requested)) {
    return { id: normaliseTierId(requested as string), reason: 'requested' };
  }

  if (environment.isMobile || environment.viewportWidth < MOBILE_VIEWPORT_BACKSTOP) {
    return { id: 'C', reason: 'mobile' };
  }

  const memory = environment.deviceMemory;
  const constrainedByMemory =
    typeof memory === 'number' && memory > 0 && memory <= CONSTRAINED_MEMORY_GB;
  if (environment.hardwareConcurrency <= CONSTRAINED_CORES || constrainedByMemory) {
    return { id: 'C', reason: 'constrained' };
  }

  return { id: DEFAULT_TIER, reason: 'desktop-default' };
}

/**
 * Overlays a tier's settings onto the baseline configuration and returns a new object.
 *
 * The baseline is never mutated: the same `RENDER_CONFIG` object is the input for every tier, and
 * tests assert the base values independently of whichever tier is applied.
 */
export function applyTier(base: RenderConfig, tier: TierId): RenderConfig {
  const overrides = TIER_DEFINITIONS[tier].render;
  const { csm: csmOverride, ...shadowOverride } = overrides.shadows ?? {};
  const { clouds: cloudOverride, ...atmosphereOverride } = overrides.atmosphere ?? {};
  const {
    bloom: bloomOverride,
    depthOfField: depthOfFieldOverride,
    motionBlur: motionBlurOverride,
    temporalAntiAliasing: temporalAntiAliasingOverride,
    godrays: godraysOverride,
    ssr: ssrOverride,
    ...postOverride
  } = overrides.postProcessing ?? {};

  const renderer = { ...base.renderer, ...overrides.renderer };
  const postProcessing = {
    ...base.postProcessing,
    ...postOverride,
    bloom: { ...base.postProcessing.bloom, ...bloomOverride },
    // Nested like bloom rather than spread whole: a tier that only wants a smaller bokeh must not have
    // to restate the focus falloff, and a field it forgets would silently become `undefined`.
    depthOfField: { ...base.postProcessing.depthOfField, ...depthOfFieldOverride },
    motionBlur: { ...base.postProcessing.motionBlur, ...motionBlurOverride },
    godrays: { ...base.postProcessing.godrays, ...godraysOverride },
    contactShadows: {
      ...base.postProcessing.contactShadows,
      ...postOverride?.contactShadows,
    },
    ssgi: { ...base.postProcessing.ssgi, ...postOverride?.ssgi },
    ssr: { ...base.postProcessing.ssr, ...ssrOverride },
    temporalAntiAliasing: {
      ...base.postProcessing.temporalAntiAliasing,
      ...temporalAntiAliasingOverride,
    },
    ambientOcclusion: {
      ...base.postProcessing.ambientOcclusion,
      ...postOverride?.ambientOcclusion,
    },
    chromaticAberration: {
      ...base.postProcessing.chromaticAberration,
      ...postOverride?.chromaticAberration,
    },
    sharpen: { ...base.postProcessing.sharpen, ...postOverride?.sharpen },
    filmGrain: { ...base.postProcessing.filmGrain, ...postOverride?.filmGrain },
    vignette: { ...base.postProcessing.vignette, ...postOverride?.vignette },
  };

  // MSAA and a post-process AA mode are alternatives, not additions: paying for both would cost
  // samples for no quality gain. A tier that selects FXAA/SMAA/TAA (or no AA) turns MSAA off here, so
  // the two settings can never contradict each other. For `taa` it is not merely wasteful but invalid —
  // temporal accumulation and multisampling cannot be combined, and the resolve node requires MSAA off.
  if (postProcessing.antiAliasing !== 'msaa') {
    renderer.antialias = false;
    renderer.samples = 0;
  }

  return {
    ...base,
    maxPixelRatio: overrides.maxPixelRatio ?? base.maxPixelRatio,
    renderer,
    camera: { ...base.camera },
    shadows: {
      ...base.shadows,
      ...shadowOverride,
      csm: { ...base.shadows.csm, ...csmOverride },
    },
    sky: {
      ...base.sky,
      ...overrides.sky,
    },
    atmosphere: {
      ...base.atmosphere,
      ...atmosphereOverride,
      clouds: { ...base.atmosphere.clouds, ...cloudOverride },
    },
    environment: { ...base.environment, ...overrides.environment },
    lighting: { ...base.lighting, ...overrides.lighting },
    postProcessing,
    diagnostics: { ...base.diagnostics },
  };
}

/**
 * Reads the forced-backend debug switch, `?backend=webgl|auto`.
 *
 * Part of the Phase 3 contract: the WebGL2 path is a supported tier in its own right, so it has to
 * be selectable on hardware that would otherwise pick WebGPU, and the result has to be comparable
 * side by side.
 */
export function readBackendRequest(
  search: string,
): RenderConfig['renderer']['backendPreference'] | null {
  const value = new URLSearchParams(search).get('backend')?.toLowerCase();
  if (value === 'webgl' || value === 'webgl2') {
    return 'webgl';
  }
  return value === 'auto' ? 'auto' : null;
}

/** Applies a forced-backend request to a resolved configuration. */
export function applyBackendOverride(
  config: RenderConfig,
  preference: RenderConfig['renderer']['backendPreference'] | null,
): RenderConfig {
  if (preference === null || preference === config.renderer.backendPreference) {
    return config;
  }
  return { ...config, renderer: { ...config.renderer, backendPreference: preference } };
}

/**
 * Selects a backend override for known Android/WebGPU compatibility failures.
 *
 * Android browsers that expose WebGPU can still have device/driver paths that initialize but render
 * a black frame. The supported WebGL2 backend is used there by default; `?backend=auto` is an
 * explicit opt-in to the browser's automatic WebGPU selection for comparison. Everywhere else the
 * renderer keeps its project-wide `auto` preference and performs its normal WebGL2 fallback.
 */
export function resolveBackendPreference(
  requested: RenderConfig['renderer']['backendPreference'] | null,
  environment: { readonly isAndroid: boolean; readonly webGpuAvailable: boolean },
): RenderConfig['renderer']['backendPreference'] | null {
  if (requested !== null) {
    return requested;
  }
  return environment.isAndroid && environment.webGpuAvailable ? 'webgl' : null;
}

/** Human-readable tier label for logs and the HUD, e.g. `C · desktop default`. */
export function describeTier(resolution: TierResolution): string {
  const definition = TIER_DEFINITIONS[resolution.id];
  const reason = resolution.reason.replace('-', ' ');
  return `${definition.id} · ${reason}`;
}

/** Long-form description used in the start-up log line. */
export function describeTierDetail(resolution: TierResolution): string {
  const definition = TIER_DEFINITIONS[resolution.id];
  return `tier ${definition.id} (${definition.name}) — ${definition.summary} [${resolution.reason}]`;
}
