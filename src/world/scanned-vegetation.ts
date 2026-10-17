import type { BufferGeometry, Material, Mesh } from 'three';

import { loadModelAsset } from '../assets/ModelAsset';

/**
 * The scanned-vegetation bridge (Phase 5): turns a derived runtime model into the part lists the
 * instanced scatter pools need.
 *
 * The derivation pipeline ships one node per level of detail (`lod0`, `lod1`, `lod2`), each holding
 * one mesh per source material — bark, twigs, dead branches — because collapsing them would paint
 * the needles as bark. Instancing needs exactly that split: one InstancedMesh per material part,
 * all sharing the instance matrices of one tree. This module only groups what the loader parsed;
 * the pipeline has already baked node transforms into the geometry, so parts arrive in metres at
 * identity nodes and nothing here may scale, offset or dequantize them.
 */

/** One draw call of one tree: a geometry and the material it must render with. */
export interface ScannedPart {
  readonly geometry: BufferGeometry;
  readonly material: Material;
}

/** One level of detail of one tree: its parts, nearest level first after sorting. */
export interface ScannedLod {
  readonly level: number;
  readonly parts: ScannedPart[];
}

/** A loaded, grouped tree ready to be instanced by the scatter pools. */
export interface ScannedSpecies {
  readonly id: string;
  /** Metres, from the loader's bounds — the scatter normalises each tree to its game height. */
  readonly height: number;
  readonly lods: ScannedLod[];
}

/**
 * Loads one derived model and groups its LOD nodes into part lists.
 *
 * Returns null (not an error) when the asset is missing or carries no LOD nodes: adoption is
 * opportunistic, and a missing scan must leave the authored species standing rather than take the
 * whole forest down with it.
 */
export async function loadScannedSpecies(
  renderer: object,
  assetId: string,
): Promise<ScannedSpecies | null> {
  const loaded = await loadModelAsset({ renderer, assetId });
  if (loaded === null) {
    return null;
  }
  // Bounds and part matrices are only meaningful with world matrices settled; the nodes are
  // identity after the pipeline bake, so this is a formality — but a cheap one.
  loaded.object.updateMatrixWorld(true);
  const lods: ScannedLod[] = [];
  for (const node of loaded.object.children) {
    const match = /^lod(\d+)$/.exec(node.name);
    if (match === null) {
      continue;
    }
    const parts: ScannedPart[] = [];
    node.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh === true) {
        parts.push({ geometry: mesh.geometry, material: mesh.material as Material });
      }
    });
    if (parts.length > 0) {
      lods.push({ level: Number(match[1]), parts });
    }
  }
  lods.sort((a, b) => a.level - b.level);
  if (lods.length === 0) {
    return null;
  }
  return { id: assetId, height: loaded.height, lods };
}
