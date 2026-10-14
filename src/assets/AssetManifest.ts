import { EquirectangularReflectionMapping, LinearSRGBColorSpace, type Texture } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/**
 * Asset manifest reader.
 *
 * Assets enter the project only through `scripts/fetch-assets.mjs`, which pins each file, records
 * its SHA-256, and writes `public/assets/manifest.json` plus `CREDITS.md`. Nothing is loaded from a
 * network host at runtime, and nothing may reference an asset that the manifest does not describe:
 * that is what keeps the licence register in `docs/ASSET_SOURCES.md` true.
 */
export interface AssetManifestFile {
  readonly slot: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly colourSpace: string;
  readonly format: string;
}

export interface AssetManifestSource {
  readonly url: string;
  readonly creator: string;
  readonly licence: string;
  readonly attribution: string;
  readonly retrieved: string;
}

export interface AssetManifestEntry {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly assetClass: string;
  readonly source: AssetManifestSource;
  readonly role: string;
  readonly files: readonly AssetManifestFile[];
}

export interface AssetManifest {
  readonly schemaVersion: number;
  readonly assets: readonly AssetManifestEntry[];
}

/** Resolved description of the HDRI the scene lights itself with. */
export interface EnvironmentAsset {
  readonly id: string;
  readonly name: string;
  /** Runtime URL of the radiance file, relative to the page (the manifest path doubles as it). */
  readonly file: string;
  readonly bytes: number;
  readonly licence: string;
  readonly creator: string;
  readonly sourceUrl: string;
}

/** `public/` is served from the site root, so manifest paths are also the runtime URLs. */
export const ASSET_MANIFEST_URL = 'assets/manifest.json';

export async function readAssetManifest(url: string = ASSET_MANIFEST_URL): Promise<AssetManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to read ${url}: ${response.status} ${response.statusText}`);
  }
  const manifest = (await response.json()) as AssetManifest;
  if (!Array.isArray(manifest.assets)) {
    throw new Error(`${url} does not contain an assets array`);
  }
  return manifest;
}

/** Finds the HDRI entry for an environment configuration, or `null` when it is not published. */
export function findEnvironmentAsset(
  manifest: AssetManifest,
  assetId: string,
): EnvironmentAsset | null {
  const entry = manifest.assets.find((asset) => asset.id === assetId);
  if (!entry) {
    return null;
  }
  const file = entry.files.find((candidate) => candidate.slot === 'hdri') ?? entry.files[0];
  if (!file) {
    return null;
  }
  return {
    id: entry.id,
    name: entry.name,
    file: file.path,
    bytes: file.bytes,
    licence: entry.source.licence,
    creator: entry.source.creator,
    sourceUrl: entry.source.url,
  };
}

/**
 * Resolves an environment asset from the published manifest.
 *
 * A missing asset is not fatal: the scene falls back to the procedural sky and the directional sun,
 * so a partially fetched asset set still renders. The failure is reported to the console rather than
 * thrown, because the cause (a stale checkout, a blocked request) is an operator problem, not a
 * code error.
 */
export async function loadEnvironmentAsset(
  assetId: string,
  url: string = ASSET_MANIFEST_URL,
): Promise<EnvironmentAsset | null> {
  const manifest = await readAssetManifest(url);
  const asset = findEnvironmentAsset(manifest, assetId);
  if (asset === null) {
    console.warn(`environment asset "${assetId}" is not in ${url}; keeping the procedural sky`);
  }
  return asset;
}

/** Loads a Radiance `.hdr` file as a linear, half-float reflection texture. */
export async function loadHdrTexture(file: string): Promise<Texture> {
  const texture = await new HDRLoader().loadAsync(file);
  texture.name = file;
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = LinearSRGBColorSpace;
  return texture;
}
