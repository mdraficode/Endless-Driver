import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js';
import { readAssetManifest, type AssetManifest, type AssetManifestEntry } from './AssetManifest';

/**
 * Loading the colour look.
 *
 * The look ships as a `.cube` — a format every finishing tool reads and writes — rather than as code
 * that computes it, and the difference matters: a `.cube` can be *replaced*. Someone who wants a
 * colder look, or a film stock this project has never heard of, can put a table in the manifest and
 * change nothing else. `scripts/build-lut.mjs` writes the one that ships, from the documented formula
 * in `scripts/lib/lut.mjs`, but nothing in the runtime knows or cares where a table came from.
 *
 * What this module adds on top of three's loader is the part that is this project's own contract: the
 * manifest entry, the licence metadata every asset carries, and a size check strict enough that a
 * table built at the wrong density is refused instead of sampled.
 */

/** A look, as the renderer needs it: a table of bytes and the lattice size that describes them. */
export interface LutAsset {
  readonly id: string;
  readonly name: string;
  readonly licence: string;
  readonly creator: string;
  readonly sourceUrl: string;
  /** Table contents, in `.cube` order: one RGB triple per lattice point, red varying fastest. */
  readonly table: Uint8Array;
  /** Lattice size per axis. */
  readonly size: number;
  readonly bytes: number;
}

/** The manifest entry for a look, or `null` when the manifest does not publish one. */
export function resolveLutAsset(
  manifest: AssetManifest,
  assetId?: string,
): AssetManifestEntry | null {
  const candidates = manifest.assets.filter((asset) => asset.kind === 'lut');
  if (candidates.length === 0) {
    return null;
  }
  if (assetId === undefined) {
    return candidates[0] ?? null;
  }
  return candidates.find((asset) => asset.id === assetId) ?? null;
}

/** Every look the manifest publishes, for a switcher that does not want to know their names. */
export function listLutAssets(manifest: AssetManifest): readonly { id: string; name: string }[] {
  return manifest.assets
    .filter((asset) => asset.kind === 'lut')
    .map((asset) => ({ id: asset.id, name: asset.name }));
}

/**
 * Loads one look.
 *
 * Returns `null` rather than throwing when the manifest publishes no look or the named one is absent:
 * a missing look is a scene that renders ungraded, not a scene that fails to start. A table that
 * loads but does not match the size the renderer was built for *does* throw, because by then the
 * mistake is one that would otherwise ship as a quietly wrong image.
 */
export async function loadLutAsset(options: {
  readonly assetId?: string;
  readonly manifest?: AssetManifest;
  readonly expectedSize?: number;
}): Promise<LutAsset | null> {
  const manifest = options.manifest ?? (await readAssetManifest());
  const entry = resolveLutAsset(manifest, options.assetId);
  if (entry === null) {
    console.warn(
      options.assetId === undefined
        ? 'look: the manifest publishes no LUT'
        : `look: the manifest has no LUT named “${options.assetId}”`,
    );
    return null;
  }

  const file = entry.files[0];
  if (file === undefined) {
    console.warn(`look: ${entry.id} has no file`);
    return null;
  }

  const parsed = await new LUTCubeLoader().loadAsync(file.path);
  const size = parsed.texture3D.image.width;
  if (options.expectedSize !== undefined && size !== options.expectedSize) {
    throw new Error(
      `look: ${entry.id} is a ${size}³ table but the renderer was built for ` +
        `${options.expectedSize}³; sampling it would grade the frame wrongly rather than loudly`,
    );
  }

  // `LUTCubeLoader` writes RGBA (three's own layout for a data texture); this project's contract is
  // the RGB layout a `.cube` holds, so the alpha column is dropped here, at the boundary, once.
  const rgba = parsed.texture3D.image.data;
  if (rgba === null || rgba === undefined) {
    throw new Error(`look: ${entry.id} parsed into a texture with no data`);
  }
  const table = new Uint8Array(size * size * size * 3);
  for (let index = 0; index < size ** 3; index += 1) {
    table[index * 3] = rgba[index * 4] ?? 0;
    table[index * 3 + 1] = rgba[index * 4 + 1] ?? 0;
    table[index * 3 + 2] = rgba[index * 4 + 2] ?? 0;
  }
  parsed.texture3D.dispose();

  return {
    id: entry.id,
    name: entry.name,
    licence: entry.source.licence,
    creator: entry.source.creator,
    sourceUrl: entry.source.url,
    table,
    size,
    bytes: file.bytes,
  };
}
