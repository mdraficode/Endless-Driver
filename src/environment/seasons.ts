import type { SurfaceResponse } from '../vehicles/types';
import type { TerrainSurfaceId } from '../world/terrain-surface';

/**
 * The four seasons of the Hinode prefecture (Phase 7 deliverable 2).
 *
 * One world carries one season, chosen deterministically from the world seed so every
 * launch is a new prefecture *in a season*; `?season=` overrides it for look-dev. The
 * presentation is a pure re-parameterisation of the existing master material set —
 * foliage/ground tints are baked into the same authored vertex colours, the sky,
 * light and exposure are existing uniforms — so no new shader program exists.
 *
 * Standing owner constraint: gameplay terrain stays **non-white and snow-free**.
 * Winter is therefore the dormant, bare, cold-lit look (muted brown-grey foliage,
 * dry winter grass, a dimmer blue-graded sun) — never a white ground.
 */
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: readonly SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

/** Linear-RGB triple; (1, 1, 1) means "no change". */
export interface SeasonRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Per-surface season grip/response adjustment, applied after the weather state. */
export interface SeasonSurfaceMod {
  readonly surface: TerrainSurfaceId;
  /** Multiplier on the surface's grip modifier. */
  readonly gripScale: number;
  /** Added rolling-resistance coefficient (mud churn, cold damp). */
  readonly rollingDelta: number;
}

export interface SeasonPresentation {
  readonly id: SeasonId;
  /** Multiplier on the foliage vertex colours (the master geometry stays one set). */
  readonly foliageTint: SeasonRgb;
  /** Multiplier on the ground-cover greens (grass, ferns, wildflowers; stones untouched). */
  readonly groundTint: SeasonRgb;
  /** Multiplier on the resolved daylight exposure. */
  readonly exposureScale: number;
  /** Day-grade blend target (1, 1, 1 = no change) — the seasonal colour temperature. */
  readonly gradeTint: SeasonRgb;
  /** Sun and ambient intensity multiplier (the cold, low winter sun). */
  readonly sunScale: number;
  readonly surfaceMod: readonly SeasonSurfaceMod[];
}

const SPRING: SeasonPresentation = {
  id: 'spring',
  // Fresh growth: bright green with a faint sakura warmth in the crowns.
  foliageTint: { r: 0.94, g: 1.1, b: 0.84 },
  groundTint: { r: 0.96, g: 1.12, b: 0.8 },
  exposureScale: 1.0,
  gradeTint: { r: 1.01, g: 1.0, b: 1.03 },
  sunScale: 1.0,
  // Damp earth after the spring rains.
  surfaceMod: [{ surface: 'soil', gripScale: 0.94, rollingDelta: 0.002 }],
};

const SUMMER: SeasonPresentation = {
  id: 'summer',
  // Deep, dry-lush green under the strongest sun.
  foliageTint: { r: 0.8, g: 1.0, b: 0.6 },
  groundTint: { r: 0.84, g: 1.02, b: 0.58 },
  exposureScale: 1.04,
  gradeTint: { r: 1.05, g: 1.01, b: 0.93 },
  sunScale: 1.06,
  // Baseline grip: the reference season.
  surfaceMod: [],
};

const AUTUMN: SeasonPresentation = {
  id: 'autumn',
  // Maple gorge at its peak: warm amber and red crowns, leaf-litter ground.
  foliageTint: { r: 1.28, g: 0.7, b: 0.38 },
  groundTint: { r: 1.08, g: 0.84, b: 0.52 },
  exposureScale: 0.98,
  gradeTint: { r: 1.07, g: 0.99, b: 0.86 },
  sunScale: 0.94,
  // Mud and leaf litter: the off-road grip loss the spec calls out for autumn.
  surfaceMod: [
    { surface: 'soil', gripScale: 0.85, rollingDelta: 0.005 },
    { surface: 'grass', gripScale: 0.9, rollingDelta: 0.003 },
    { surface: 'gravel', gripScale: 0.94, rollingDelta: 0.001 },
  ],
};

const WINTER: SeasonPresentation = {
  id: 'winter',
  // Dormant and bare — muted brown-grey crowns and dry grass. Snow-free by the
  // standing owner constraint: the ground never reads white.
  foliageTint: { r: 0.6, g: 0.55, b: 0.47 },
  groundTint: { r: 0.66, g: 0.64, b: 0.55 },
  exposureScale: 0.9,
  gradeTint: { r: 0.93, g: 0.98, b: 1.07 },
  sunScale: 0.82,
  // Cold, damp ground: a small universal grip loss, deepest on soft surfaces.
  surfaceMod: [
    { surface: 'asphalt', gripScale: 0.96, rollingDelta: 0.0 },
    { surface: 'soil', gripScale: 0.88, rollingDelta: 0.004 },
    { surface: 'gravel', gripScale: 0.92, rollingDelta: 0.002 },
    { surface: 'grass', gripScale: 0.92, rollingDelta: 0.002 },
  ],
};

const PRESENTATIONS: Readonly<Record<SeasonId, SeasonPresentation>> = {
  spring: SPRING,
  summer: SUMMER,
  autumn: AUTUMN,
  winter: WINTER,
};

export function resolveSeasonPresentation(season: SeasonId): SeasonPresentation {
  return PRESENTATIONS[season];
}

/** Reads the dev-HUD override `?season=spring|summer|autumn|winter`; null means "use the world's". */
export function readSeasonRequest(search: string): SeasonId | null {
  const raw = new URLSearchParams(search).get('season')?.toLowerCase();
  return SEASONS.includes(raw as SeasonId) ? (raw as SeasonId) : null;
}

/**
 * The world's season: a deterministic function of the world seed (and the generator
 * version), so a re-launched world with the same seed reads in the same season and a
 * new launch rolls a new one.
 */
export function seasonForWorld(worldSeed: number, generatorVersion = 1): SeasonId {
  const h = Math.imul(worldSeed | 0, 0x9e3779b1) ^ Math.imul(generatorVersion, 0x85ebca6b);
  return SEASONS[(h >>> 0) % SEASONS.length]!;
}

/**
 * Applies the season's surface adjustments to a resolved surface response.
 *
 * Composes after the weather state (`applySurfaceState`): dry-season asphalt is
 * bit-for-bit the baseline, so the existing clear/rain calibration is untouched.
 */
export function applySeasonSurface(
  surface: SurfaceResponse,
  presentation: SeasonPresentation,
): SurfaceResponse {
  let gripScale = 1;
  let rollingDelta = 0;
  for (const mod of presentation.surfaceMod) {
    if (mod.surface === surface.id) {
      gripScale = mod.gripScale;
      rollingDelta = mod.rollingDelta;
    }
  }
  if (gripScale === 1 && rollingDelta === 0) {
    return surface;
  }
  return {
    id: surface.id,
    gripModifier: surface.gripModifier * gripScale,
    rollingResistance: surface.rollingResistance + rollingDelta,
  };
}
