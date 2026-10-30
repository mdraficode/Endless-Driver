import type { AssetResolution } from '../assets/AssetManifest';
import type { TierId } from './tiers';

/**
 * The tier-C asset budget: the pixel budget a load picks from the manifest.
 *
 * Phones (tier C) load the 512-px derivations of the scanned surfaces and props — the same CC0
 * sources, re-derived at half the linear resolution — while tablets and desktops (tiers B and A)
 * keep the full 1K files. The first-frame download is roughly halved on the phone, where it is the
 * whole of load time on a data-limited connection, with no visible difference at the on-screen
 * sizes a phone shows (a 1K texture is already oversampled at most phone view distances).
 *
 * `docs/ASSET_SOURCES.md` is the register of which files exist at which budget.
 */
export function assetResolutionForTier(tierId: TierId): AssetResolution {
  return tierId === 'C' ? '512' : '1k';
}

/**
 * The manifest id of a surface set at the requested budget.
 *
 * Surface ids are named after their published resolution (`tex-leafy-grass-1k`); the tier-C
 * budget re-derives each set at 512 px under a parallel `-512` id. A budget a set has not been
 * derived for keeps its 1K id — the loader then serves the 1K file, which every set has.
 */
export function surfaceAssetIdAtResolution(assetId: string, resolution: AssetResolution): string {
  if (resolution === '512' && assetId.endsWith('-1k')) {
    return `${assetId.slice(0, -'1k'.length - 1)}-512`;
  }
  return assetId;
}

/**
 * Whether a texture-set manifest entry serves the requested budget.
 *
 * The startup prefetch warms the HTTP cache for the sets this load will actually read — a tier-C
 * load must not spend its six connections on the 1K sets it will never sample, and a B/A load
 * must not fetch the 512 set it only exists to spare.
 */
export function textureSetEntryServesResolution(
  assetId: string,
  resolution: AssetResolution,
): boolean {
  if (assetId.endsWith('-512')) {
    return resolution === '512';
  }
  return resolution === '1k';
}
