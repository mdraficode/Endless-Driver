import { RepeatWrapping, type Texture } from 'three';
import { loadMaterialTextureSet, type MaterialTextureSet } from './AssetManifest';

/**
 * Owns the runtime material sets used by one world composition and coalesces concurrent requests.
 *
 * Terrain chunks keep their own streamed sets; static road, building and furniture materials share
 * this library so the same CC0 concrete/wood/asphalt maps are decoded and uploaded once per world.
 * A missing or failed asset is non-fatal: callers retain their authored fallback material.
 */
type MaterialTextureLoader = (assetId: string) => Promise<MaterialTextureSet | null>;

export class SurfaceTextureLibrary {
  readonly #loads = new Map<string, Promise<MaterialTextureSet | null>>();
  readonly #ownedSets = new Set<MaterialTextureSet>();
  readonly #loadSet: MaterialTextureLoader;
  #disposed = false;

  constructor(loadSet: MaterialTextureLoader = loadMaterialTextureSet) {
    this.#loadSet = loadSet;
  }

  load(assetId: string): Promise<MaterialTextureSet | null> {
    if (this.#disposed) {
      return Promise.resolve(null);
    }

    const cached = this.#loads.get(assetId);
    if (cached !== undefined) {
      return cached;
    }

    const pending = this.#loadSet(assetId)
      .then((set) => {
        if (this.#disposed) {
          set?.dispose();
          return null;
        }
        if (set !== null) {
          this.#ownedSets.add(set);
        }
        return set;
      })
      .catch((error: unknown) => {
        this.#loads.delete(assetId);
        console.warn(`surface asset "${assetId}" unavailable; keeping fallback materials:`, error);
        return null;
      });
    this.#loads.set(assetId, pending);
    return pending;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const set of this.#ownedSets) {
      set.dispose();
    }
    this.#ownedSets.clear();
    this.#loads.clear();
  }
}

/** Enables tiled UVs and sharp grazing-angle sampling for a shared surface set. */
export function configureTiledSurface(set: MaterialTextureSet, anisotropy = 8): void {
  const maps: (Texture | null)[] = [set.diffuse, set.normal, set.arm, set.height];
  for (const map of maps) {
    if (map === null) {
      continue;
    }
    const targetAnisotropy = Math.max(map.anisotropy, anisotropy);
    const changed =
      map.wrapS !== RepeatWrapping ||
      map.wrapT !== RepeatWrapping ||
      map.anisotropy !== targetAnisotropy;
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    map.anisotropy = targetAnisotropy;
    if (changed) {
      map.needsUpdate = true;
    }
  }
}
