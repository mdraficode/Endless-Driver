import {
  EquirectangularReflectionMapping,
  LinearSRGBColorSpace,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { TextureLoader } from 'three';

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

/** One level of detail inside a derived model, as the build script recorded it. */
export interface AssetManifestLod {
  readonly level: number;
  /** Name of the node in the GLB that carries this level's mesh. */
  readonly node: string;
  readonly triangles: number;
  /** Ratio target the level was simplified to, before the error ceiling was applied. */
  readonly ratio?: number;
  /** Whether the derivation merged duplicated positions to reach it. */
  readonly seamMerged?: boolean;
}

/** What the pipeline did to a source asset, and what came out. */
export interface AssetManifestPipeline {
  readonly resolution?: string;
  readonly sourceBytes?: number;
  readonly outputBytes?: number;
  readonly reductions?: readonly string[];
  /** Present on derived models: the level chain, closest first. */
  readonly lods?: readonly AssetManifestLod[];
  readonly notes?: string;
}

export interface AssetManifestEntry {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly assetClass: string;
  readonly source: AssetManifestSource;
  readonly role: string;
  readonly pipeline?: AssetManifestPipeline;
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

/** Every HDRI the manifest publishes, in manifest order, as `{ id, name }` pairs. */
export function listEnvironmentAssets(manifest: AssetManifest): readonly EnvironmentAsset[] {
  return manifest.assets
    .filter((asset) => asset.kind === 'hdri')
    .map((asset) => findEnvironmentAsset(manifest, asset.id))
    .filter((asset): asset is EnvironmentAsset => asset !== null);
}

/** The texture slots a scanned surface is expected to publish. `arm` is optional. */
export interface MaterialTextureSet {
  readonly id: string;
  readonly name: string;
  readonly licence: string;
  readonly creator: string;
  /** sRGB albedo. */
  readonly diffuse: Texture;
  /** Tangent-space normal map, OpenGL convention. */
  readonly normal: Texture;
  /** Roughness in the green channel, ambient occlusion in red, metalness in blue. */
  readonly arm: Texture | null;
  dispose(): void;
}

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

/**
 * Loads a scanned surface's maps, as described by the manifest.
 *
 * The manifest is the only source of the slot names and their colour spaces, so the loader does not
 * guess: an sRGB albedo and a linear data map are the difference between a texture that looks right
 * and one that looks washed out, and getting it wrong is invisible in code review. `arm` carries
 * occlusion/roughness/metalness packed into the red/green/blue channels, which is the form the
 * material shader reads.
 */
export async function loadMaterialTextureSet(
  assetId: string,
  url: string = ASSET_MANIFEST_URL,
): Promise<MaterialTextureSet | null> {
  const manifest = await readAssetManifest(url);
  const entry = manifest.assets.find((asset) => asset.id === assetId);
  if (!entry) {
    console.warn(`material asset "${assetId}" is not in ${url}; keeping the flat material`);
    return null;
  }

  const loader = new TextureLoader();
  const loaded: Texture[] = [];
  const load = async (slot: string, colourSpace: string): Promise<Texture | null> => {
    const file = entry.files.find((candidate) => candidate.slot === slot);
    if (!file) {
      return null;
    }
    const texture = await loader.loadAsync(file.path);
    texture.name = `${assetId}:${slot}`;
    texture.colorSpace = colourSpace === 'srgb' ? SRGBColorSpace : LinearSRGBColorSpace;
    // The surface is seen at a shallow angle from the chase camera, so the sharper mip chain is
    // worth the small bandwidth cost on the one material that uses it.
    texture.anisotropy = 4;
    loaded.push(texture);
    return texture;
  };

  const diffuse = await load('diffuse', 'srgb');
  const normal = await load('normal', 'linear');
  const arm = await load('arm', 'linear');
  if (diffuse === null || normal === null) {
    for (const texture of loaded) {
      texture.dispose();
    }
    console.warn(`material asset "${assetId}" is missing its albedo or normal map; ignoring it`);
    return null;
  }

  return {
    id: entry.id,
    name: entry.name,
    licence: entry.source.licence,
    creator: entry.source.creator,
    diffuse,
    normal,
    arm,
    dispose(): void {
      for (const texture of loaded) {
        texture.dispose();
      }
    },
  };
}
