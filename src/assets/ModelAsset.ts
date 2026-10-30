import {
  Box3,
  Mesh,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { getAssetBytes, releaseAssetBytes } from './AssetBytes';
import {
  readAssetManifest,
  type AssetManifest,
  type AssetManifestEntry,
  type AssetResolution,
} from './AssetManifest';
import { selectLodLevel, type LodLevel } from './LodSelection';

/**
 * Loading a derived model.
 *
 * A model published by `scripts/build-models.mjs` is not a plain glTF: its geometry is quantized and
 * meshopt-compressed, and its textures are KTX2 — which is the whole point, since those are what keep
 * a prop small in flight and compressed in video memory. Both need a decoder, and both decoders ship
 * with the app rather than being fetched from a CDN (`scripts/copy-decoders.mjs`).
 *
 * The file carries every level of detail as a sibling node, so loading it once gives every level, and
 * the levels share one texture set. What this module adds on top of the loader is the part that is
 * this project's own convention: which node is which level, what the model measures, and how to show
 * one level without leaking the others.
 */

/** Where the Basis transcoder is served from. `public/decoders/` is copied at build time. */
export const BASIS_DECODER_PATH = `${import.meta.env.BASE_URL}decoders/basis/`;

/** A model's identity and levels, resolved from the manifest before anything is downloaded. */
export interface ModelAsset {
  readonly id: string;
  readonly name: string;
  readonly licence: string;
  readonly creator: string;
  readonly sourceUrl: string;
  /** Runtime URL of the `.glb`, relative to the page. */
  readonly file: string;
  readonly bytes: number;
  /** Levels, closest first. */
  readonly levels: readonly LodLevel[];
}

/** A loaded model: its object tree, what it measures, and one level visible at a time. */
export interface LoadedModel {
  readonly asset: ModelAsset;
  /** Root of the loaded tree; every level node is parented to it at the same transform. */
  readonly object: Object3D;
  /** Centre of the enclosing sphere, in the model's own space — where a camera looks. */
  readonly centre: Vector3;
  /**
   * Radius of the enclosing sphere, in metres. Right for the level-of-detail thresholds, where what
   * matters is how large the object appears; wrong for standing it on the floor (see `bottom`).
   */
  readonly radius: number;
  /**
   * Bottom of the bounding *box*: how far up the model must be moved to rest on a floor at y = 0.
   *
   * Kept apart from `radius` because the two answer different questions, and using the sphere for
   * both puts the object in the air. The sphere enclosing a roughly cubic rock is as long as the
   * rock's diagonal, so standing it up by its radius lifts it by half its height, which reads
   * unmistakably as a floating rock with its shadow on the ground below it.
   */
  readonly bottom: number;
  /** Height of the bounding box, in metres — the measure for framing a single model. */
  readonly height: number;
  /** The level currently visible. */
  readonly activeLevel: number;
  /** Shows one level and hides the rest. An unknown level is ignored. */
  setLevel(level: number): void;
  /** Picks a level by distance; returns the level now showing. */
  updateForDistance(distance: number): number;
  /** Releases geometries, materials, and textures owned by the loaded file. */
  dispose(): void;
}

/** Every model the manifest publishes, at the given pixel budget (tier C loads the 512-px files). */
export function listModelAssets(
  manifest: AssetManifest,
  resolution: AssetResolution = '1k',
): readonly ModelAsset[] {
  return manifest.assets
    .filter((asset) => asset.kind === 'model')
    .map((asset) => resolveModelAsset(asset, resolution))
    .filter((asset): asset is ModelAsset => asset !== null);
}

/** Resolves one manifest entry into a model description, or `null` when it is not a usable model. */
export function resolveModelAsset(
  entry: AssetManifestEntry,
  resolution: AssetResolution = '1k',
): ModelAsset | null {
  // A derived model may ship one file per pixel budget (the tier-C 512 files). Pick the file for
  // the requested budget and fall back to the first 'model' file when the budget has not been
  // derived for this model: the 512 budget covers only part of the catalog, and the rest must
  // still load (on the 1K file).
  const modelFiles = entry.files.filter((candidate) => candidate.slot === 'model');
  const file =
    modelFiles.find((candidate) => (candidate.resolution ?? '1k') === resolution) ?? modelFiles[0];
  if (!file) {
    return null;
  }
  return {
    id: entry.id,
    name: entry.name,
    licence: entry.source.licence,
    creator: entry.source.creator,
    sourceUrl: entry.source.url,
    file: file.path,
    bytes: file.bytes,
    levels: resolveModelLevels(entry),
  };
}

/**
 * Reads the level chain out of a manifest entry, closest first.
 *
 * Sorted here rather than trusted: the chain's order is what `selectLodLevel` indexes into, and a
 * manifest that listed its levels backwards would otherwise show the *cheapest* level to the nearest
 * camera — a bug that looks like a rendering problem and is actually a data one.
 */
export function resolveModelLevels(entry: AssetManifestEntry): readonly LodLevel[] {
  const declared = entry.pipeline?.lods ?? [];
  return [...declared]
    .map((lod) => ({
      level: lod.level,
      node: lod.node,
      triangles: lod.triangles,
      seamMerged: lod.seamMerged ?? false,
    }))
    .sort((a, b) => b.triangles - a.triangles);
}

export interface LoadModelOptions {
  /**
   * The live renderer, used to detect which compressed texture formats this device supports. It must
   * have finished initialising: the KTX2 loader asks the backend what it can do, and the backend does
   * not exist until then.
   */
  readonly renderer: object;
  /** Overrides the transcoder location; defaults to the build-time copy. */
  readonly decoderPath?: string;
  /** Manifest id to load. Defaults to the first model in the manifest. */
  readonly assetId?: string;
  /**
   * Pixel budget for the model file (tier C loads the 512-px derivations when the catalog has
   * them). Defaults to the 1K file, which every model in the catalog has.
   */
  readonly resolution?: AssetResolution;
  /** Manifest URL override, for tests. */
  readonly url?: string;
  /**
   * The model file's bytes, when the caller already has them:
   *
   * - an `ArrayBuffer` parses directly from it (`GLTFLoader.parse`);
   * - `null` skips the shared byte cache and fetches `asset.file` as usual;
   * - omitted consults the shared byte cache first — a startup prefetch may already hold the
   *   file, in which case the parse runs on those bytes and no second download happens.
   *
   * The split matters on mobile: the download and the parse have different costs. The 2.9 MB
   * hero coupé downloads beside the terrain, but `GLTFLoader.parse` is a main-thread spike
   * (meshopt decode plus ~114k triangles of mesh construction), and it used to land whenever
   * the download happened to finish — mid-terrain-stage, freezing the loading screen at ~59%.
   * Holding the bytes lets the owning stage (the hero gate) schedule the parse.
   */
  readonly bytes?: ArrayBuffer | null;
}

/**
 * Loads a model by manifest id.
 *
 * Returns `null` rather than throwing when the manifest does not have the asset, for the same reason
 * `loadEnvironmentAsset` does: a missing asset is an operator problem — a stale checkout, a build
 * that has not run — and the caller's answer is to carry on without it.
 */
export async function loadModelAsset(options: LoadModelOptions): Promise<LoadedModel | null> {
  const manifest = await readAssetManifest(options.url);
  const models = listModelAssets(manifest, options.resolution ?? '1k');
  const asset =
    options.assetId === undefined
      ? models[0]
      : models.find((candidate) => candidate.id === options.assetId);
  if (!asset) {
    console.warn(
      `model asset "${options.assetId ?? '(first)'}" is not in the manifest; nothing to show`,
    );
    return null;
  }

  const ktx2 = new KTX2Loader()
    .setTranscoderPath(options.decoderPath ?? BASIS_DECODER_PATH)
    .detectSupport(options.renderer as Parameters<KTX2Loader['detectSupport']>[0]);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);

  try {
    const gltf = await loadGltfFromBytesOrUrl(loader, asset.file, options.bytes);
    return createLoadedModel(asset, gltf.scene, ktx2);
  } catch (error) {
    ktx2.dispose();
    throw new Error(`failed to load model "${asset.id}" from ${asset.file}`, { cause: error });
  }
}

/**
 * The bytes-or-url branch of a model load: explicit bytes parse directly; an explicit `null`
 * (or a byte-cache miss) fetches by URL; an omitted option consults the shared byte cache so a
 * startup prefetch is never downloaded twice.
 */
async function loadGltfFromBytesOrUrl(
  loader: GLTFLoader,
  file: string,
  bytes: ArrayBuffer | null | undefined,
): Promise<GLTF> {
  if (bytes === null) {
    return loader.loadAsync(file);
  }
  const fromCache = bytes === undefined;
  const cachedBytes = bytes ?? (await getAssetBytes(file));
  if (cachedBytes === null) {
    return loader.loadAsync(file);
  }
  try {
    return await parseGltfBytes(loader, cachedBytes, file);
  } finally {
    // The parse owns cache-sourced data from here; the cache must not keep the payload alive
    // alongside the decoded geometry. Explicit bytes are the caller's to retain.
    if (fromCache) {
      releaseAssetBytes(file);
    }
  }
}

/** `GLTFLoader.parse` is callback-shaped; this wraps it as a promise. */
function parseGltfBytes(loader: GLTFLoader, bytes: ArrayBuffer, file: string): Promise<GLTF> {
  return new Promise<GLTF>((resolve, reject) => {
    loader.parse(
      bytes,
      file,
      (gltf) => resolve(gltf),
      (error: unknown) =>
        reject(new Error(`model parse failed for ${file}: ${describeParseError(error)}`)),
    );
  });
}

function describeParseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  // GLTFLoader reports parse failures as ErrorEvent-like objects on some three versions.
  const nested = (error as { error?: unknown } | null)?.error;
  if (nested instanceof Error) {
    return nested.message;
  }
  return String(error);
}

/**
 * Wraps a loaded glTF scene in the level-of-detail behaviour.
 *
 * Separate from the loading path so it can be tested without a renderer, a decoder, or a network:
 * everything below is scene-graph work on an object tree, and the tree has the same shape whether it
 * came from a real file or a stand-in built by a test.
 */
export function createLoadedModel(
  asset: ModelAsset,
  object: Object3D,
  decoder?: { dispose(): void },
): LoadedModel {
  const candidates = asset.levels.map((level) => ({
    level,
    node: object.getObjectByName(level.node) ?? null,
  }));
  const missing = candidates
    .filter((entry) => entry.node === null)
    .map((entry) => entry.level.node);
  if (missing.length > 0) {
    console.warn(`model "${asset.id}" is missing level node(s): ${missing.join(', ')}`);
  }
  const present = candidates.filter(
    (entry): entry is { level: LodLevel; node: Object3D } => entry.node !== null,
  );
  if (present.length === 0) {
    throw new Error(`model "${asset.id}" has none of the level nodes the manifest advertises`);
  }

  // Everything but the closest level starts hidden, so the model's first frame is its best one.
  const closest = present[0]?.level.level ?? 0;
  for (const entry of present) {
    entry.node.visible = entry.level.level === closest;
  }

  // glTF has no notion of shadow casting: it describes a mesh and its material, and whether that mesh
  // blocks light is a *scene* decision. So the application makes it, once, at load time. Without this
  // a prop is lit correctly and stands in front of a floor that never darkens under it — which reads
  // as a compositing mistake rather than as a missing flag.
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const bounds = new Box3().setFromObject(present[0]?.node ?? object);
  const sphere = bounds.isEmpty()
    ? new Sphere(new Vector3(), 1)
    : bounds.getBoundingSphere(new Sphere());
  const bottom = bounds.isEmpty() ? -1 : bounds.min.y;
  const height = bounds.isEmpty() ? 2 : bounds.max.y - bounds.min.y;
  let activeLevel = closest;

  const model: LoadedModel = {
    asset,
    object,
    centre: sphere.center.clone(),
    radius: Math.max(0.001, sphere.radius),
    bottom,
    height: Math.max(0.001, height),
    get activeLevel() {
      return activeLevel;
    },
    setLevel(level: number): void {
      const target = present.find((entry) => entry.level.level === level);
      if (!target) {
        return;
      }
      for (const entry of present) {
        entry.node.visible = entry === target;
      }
      activeLevel = level;
    },
    updateForDistance(distance: number): number {
      const chosen = selectLodLevel(
        present.map((entry) => entry.level),
        distance,
        model.radius,
      );
      if (chosen !== null) {
        model.setLevel(chosen.level);
      }
      return activeLevel;
    },
    dispose(): void {
      disposeObject(object);
      decoder?.dispose();
    },
  };
  return model;
}

/** Releases every geometry, material and texture under an object. */
export function disposeObject(root: Object3D): void {
  const textures = new Set<Texture>();
  root.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    disposeGeometry(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      collectMaterialTextures(material, textures);
      material.dispose();
    }
  });
  // Textures are disposed after the traversal and only once each: levels of detail share a texture
  // set, so the same instance is reachable from several materials, and disposing it twice is both
  // wasteful and a way to tear down a texture that something else still holds.
  for (const texture of textures) {
    texture.dispose();
  }
}

function disposeGeometry(geometry: BufferGeometry): void {
  geometry.dispose();
}

/** Collects the textures a material holds, wherever the material keeps them. */
function collectMaterialTextures(material: Material, into: Set<Texture>): void {
  for (const value of Object.values(material as MeshStandardMaterial & Record<string, unknown>)) {
    if (value && typeof value === 'object' && 'isTexture' in value) {
      into.add(value as Texture);
    }
  }
}
