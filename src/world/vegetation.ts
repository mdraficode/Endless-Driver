import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { vertexColor } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  VEGETATION_CONFIG,
  type VegetationConfig,
  type VegetationSpecies,
} from '../config/districts';
import { speciesMultipliersAt, VEGETATION_SPECIES } from './districts';
import type { TerrainSampler } from './terrain-height';
import { chunkKey, planChunksAround, resolveWindowCenter } from './terrain-chunks';

/**
 * District vegetation: deterministic, instanced scatter (Phase 4 Increment 5).
 *
 * Placement is a pure function of the world: one candidate per 6.5 m cell,
 * decided by integer hashes over the eternal cell coordinates, gated by the same
 * sampler everything else uses — height (treeline), slope (only rock clings),
 * road corridor (nothing grows through the road), and the district multipliers
 * from `districts.ts`. Because the function is per-chunk and stateless, chunks
 * generate identically on any thread, any session, any window slide; the
 * streamer below only decides *which* chunks currently feed the instanced
 * meshes. Species geometries are small authored low-poly forms with baked
 * vertex-colour palettes (three tint variants for the leafy species), built to
 * be replaced by scanned CC0 models behind this same registry later.
 */

export interface VegetationPlacement {
  readonly species: VegetationSpecies;
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotationY: number;
}

/** Integer hash → [0, 1), stable across platforms (same family as the terrain). */
function hash01(ix: number, iz: number, salt: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(salt, 974711)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const TREE_SPECIES: ReadonlySet<VegetationSpecies> = new Set([
  'conifer',
  'broadleaf',
  'sakura',
  'bamboo',
]);

/** Slope/altitude gate per species, before district multipliers apply. */
function speciesGate(
  species: VegetationSpecies,
  height: number,
  steepness: number,
  config: VegetationConfig,
): number {
  switch (species) {
    case 'conifer':
      if (height > config.treeLineMeters || steepness > 0.38) return 0;
      // Cedars own the mid-slopes; the lowland floor is broadleaf country.
      return height < 12 ? 0.45 : 1;
    case 'broadleaf':
      if (height > config.treeLineMeters || steepness > 0.32) return 0;
      return height > 110 ? Math.max(0, 1 - (height - 110) / 40) : 1;
    case 'sakura':
      if (height > 95 || steepness > 0.26) return 0;
      return 1;
    case 'bamboo':
      if (height > 80 || steepness > 0.3) return 0;
      return 1;
    case 'rock':
      // Rock appears where trees cannot hold, and as scree above the treeline.
      return Math.min(
        1,
        Math.max(0, (steepness - 0.18) * 2.2) + (height > config.treeLineMeters ? 0.45 : 0),
      );
  }
}

/** All placements inside one terrain chunk (deterministic; no streamer state). */
export function generateChunkVegetation(
  sampler: TerrainSampler,
  chunkX: number,
  chunkZ: number,
  config: VegetationConfig = VEGETATION_CONFIG,
): VegetationPlacement[] {
  const size = sampler.config.chunkSizeMeters;
  const originX = chunkX * size;
  const originZ = chunkZ * size;
  const cell = config.cellMeters;
  const firstCellX = Math.floor(originX / cell);
  const firstCellZ = Math.floor(originZ / cell);
  const cellsPerChunk = Math.ceil(size / cell);
  const placements: VegetationPlacement[] = [];

  for (let iz = firstCellZ; iz < firstCellZ + cellsPerChunk; iz += 1) {
    for (let ix = firstCellX; ix < firstCellX + cellsPerChunk; ix += 1) {
      const x = (ix + 0.15 + 0.7 * hash01(ix, iz, 11)) * cell;
      const z = (iz + 0.15 + 0.7 * hash01(ix, iz, 23)) * cell;
      if (x < originX || x >= originX + size || z < originZ || z >= originZ + size) {
        continue;
      }
      if (Math.hypot(x, z) < config.spawnClearanceMeters) {
        continue;
      }
      const road = sampler.roadAt?.(x, z) ?? null;
      if (road !== null && road.distance < config.roadClearanceMeters) {
        continue;
      }
      const height = sampler.heightAt(x, z);
      const normal = sampler.normalAt(x, z);
      const steepness = 1 - normal.y;
      const multipliers = speciesMultipliersAt(x, z);

      // One plant per cell at most: species compete by weighted keep-probability.
      // Sakura and bamboo are district signatures, not background flora: without a
      // district asking for them (multiplier > 1), they never win a cell.
      let total = 0;
      const weights: number[] = [];
      for (const species of VEGETATION_SPECIES) {
        const districtOnly =
          (species === 'sakura' || species === 'bamboo') && multipliers[species] <= 1;
        const weight =
          (districtOnly ? 0 : config.baseDensity[species]) *
          multipliers[species] *
          speciesGate(species, height, steepness, config);
        weights.push(weight);
        total += weight;
      }
      const roll = hash01(ix, iz, 37);
      if (roll >= total) {
        continue;
      }
      let cumulative = 0;
      let species: VegetationSpecies = 'rock';
      for (let index = 0; index < VEGETATION_SPECIES.length; index += 1) {
        cumulative += weights[index]!;
        if (roll < cumulative) {
          species = VEGETATION_SPECIES[index]!;
          break;
        }
      }
      const isTree = TREE_SPECIES.has(species);
      placements.push({
        species,
        variant: Math.floor(hash01(ix, iz, 41) * 3),
        x,
        y: height - 0.12,
        z,
        scale: isTree ? 0.8 + 0.85 * hash01(ix, iz, 53) : 0.7 + 1.1 * hash01(ix, iz, 53),
        rotationY: hash01(ix, iz, 67) * Math.PI * 2,
      });
    }
  }
  return placements;
}

// ---------------------------------------------------------------------------
// Species geometry: authored low-poly forms, vertex-colour baked, three tint
// variants for leafy species so a forest is not one flat colour.
// ---------------------------------------------------------------------------

function paint(geometry: BufferGeometry, hex: number): BufferGeometry {
  const color = new Color(hex);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function part(
  geometry: BufferGeometry,
  hex: number,
  x: number,
  y: number,
  z: number,
): BufferGeometry {
  const painted = paint(geometry.toNonIndexed(), hex);
  painted.translate(x, y, z);
  return painted;
}

const LEAF_TINTS: readonly (readonly [number, number, number])[] = [
  [0x2e5d3a, 0x4d7c3a, 0xe8a7bf],
  [0x356b42, 0x568a41, 0xf0bcd0],
  [0x274e31, 0x44702f, 0xdf93b2],
];

export function buildSpeciesGeometry(species: VegetationSpecies, variant: number): BufferGeometry {
  const tint = LEAF_TINTS[variant % LEAF_TINTS.length]!;
  switch (species) {
    case 'conifer':
      return mergeGeometries([
        part(new CylinderGeometry(0.13, 0.24, 1.7, 5), 0x6b4a33, 0, 0.85, 0),
        part(new ConeGeometry(1.55, 2.7, 7), tint[0], 0, 2.4, 0),
        part(new ConeGeometry(1.18, 2.3, 7), tint[0], 0, 3.6, 0),
        part(new ConeGeometry(0.78, 1.9, 7), tint[0], 0, 4.7, 0),
      ])!;
    case 'broadleaf':
      return mergeGeometries([
        part(new CylinderGeometry(0.15, 0.27, 2.0, 5), 0x6e4f36, 0, 1.0, 0),
        part(new IcosahedronGeometry(1.55, 0), tint[1], 0, 3.1, 0),
        part(new IcosahedronGeometry(1.0, 0), tint[1], 0.95, 2.55, 0.3),
        part(new IcosahedronGeometry(0.92, 0), tint[1], -0.85, 2.7, -0.25),
      ])!;
    case 'sakura':
      return mergeGeometries([
        part(new CylinderGeometry(0.14, 0.25, 1.9, 5), 0x574233, 0, 0.95, 0),
        part(new IcosahedronGeometry(1.5, 0), tint[2], 0, 3.0, 0),
        part(new IcosahedronGeometry(0.95, 0), tint[2], 0.9, 2.5, -0.2),
        part(new IcosahedronGeometry(0.88, 0), tint[2], -0.8, 2.6, 0.3),
      ])!;
    case 'bamboo': {
      const parts: BufferGeometry[] = [];
      const culms: readonly (readonly [number, number])[] = [
        [0, 0],
        [0.5, 0.2],
        [-0.4, 0.35],
        [0.15, -0.45],
      ];
      for (const [cx, cz] of culms) {
        parts.push(part(new CylinderGeometry(0.045, 0.06, 4.8, 4), 0x7fae56, cx, 2.4, cz));
        parts.push(part(new ConeGeometry(0.55, 1.5, 5), 0x8fbc62, cx, 5.2, cz));
      }
      return mergeGeometries(parts)!;
    }
    case 'rock': {
      const geometry = new IcosahedronGeometry(1.15, 0).toNonIndexed();
      const positions = geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        const jitter = 0.78 + 0.45 * hash01(index, variant, 97);
        positions.setXYZ(
          index,
          positions.getX(index) * jitter,
          positions.getY(index) * jitter * 0.72,
          positions.getZ(index) * jitter,
        );
      }
      geometry.computeVertexNormals();
      return paint(geometry, variant === 0 ? 0x8a8d90 : 0x7c7f85);
    }
  }
}

const SPECIES_CAPACITY: Record<VegetationSpecies, number> = {
  conifer: 5200,
  broadleaf: 4200,
  sakura: 2000,
  bamboo: 2000,
  rock: 2400,
};

/**
 * The streaming owner: one InstancedMesh per species/variant, fed by generated
 * chunk placements inside the vegetation window. Rebuilds the instance buffers
 * only when the window's chunk set changes; placement generation is budgeted
 * per frame like terrain builds, so a fast slide-in never hitches.
 */
export class VegetationWorld {
  readonly root = new Group();
  readonly #sampler: TerrainSampler;
  readonly #config: VegetationConfig;
  readonly #meshes: { species: VegetationSpecies; variant: number; mesh: InstancedMesh }[] = [];
  readonly #chunkPlacements = new Map<string, VegetationPlacement[]>();
  #center: { cx: number; cz: number } | null = null;
  #totalInstances = 0;
  #generatedChunks = 0;
  #disposed = false;

  constructor(sampler: TerrainSampler, config: VegetationConfig = VEGETATION_CONFIG) {
    this.#sampler = sampler;
    this.#config = config;
    this.root.name = 'VegetationWorld';

    const material = new MeshStandardNodeMaterial();
    material.colorNode = vertexColor();
    material.roughness = 0.95;
    for (const species of VEGETATION_SPECIES) {
      const variants = TREE_SPECIES.has(species) ? 3 : species === 'bamboo' ? 2 : 2;
      for (let variant = 0; variant < variants; variant += 1) {
        const geometry = buildSpeciesGeometry(species, variant);
        const mesh = new InstancedMesh(
          geometry,
          material,
          Math.floor(SPECIES_CAPACITY[species] / variants),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.name = `vegetation-${species}-${variant}`;
        this.root.add(mesh);
        this.#meshes.push({ species, variant, mesh });
      }
    }
    // One shared material instance across all instanced meshes.
    this.#sharedMaterial = material;
  }

  readonly #sharedMaterial: MeshStandardNodeMaterial;

  /** Per-frame streaming hook, driven beside the terrain's own. */
  updateStreaming(focus: { x: number; z: number }): void {
    if (this.#disposed) {
      return;
    }
    const terrainConfig = this.#sampler.config;
    this.#center = resolveWindowCenter(this.#center, terrainConfig, focus.x, focus.z);
    const planned = planChunksAround(
      terrainConfig,
      this.#center.cx,
      this.#center.cz,
      focus.x,
      focus.z,
    ).filter((chunk) => chunk.ring <= this.#config.radiusChunks);
    const wanted = new Set(planned.map((chunk) => chunkKey(chunk.cx, chunk.cz)));

    let changed = false;
    for (const key of [...this.#chunkPlacements.keys()]) {
      if (!wanted.has(key)) {
        this.#chunkPlacements.delete(key);
        changed = true;
      }
    }
    // Budgeted generation: nearest chunks first (planner order), ≤3 per frame.
    let generated = 0;
    for (const chunk of planned) {
      if (generated >= 3) {
        break;
      }
      const key = chunkKey(chunk.cx, chunk.cz);
      if (!this.#chunkPlacements.has(key)) {
        this.#chunkPlacements.set(
          key,
          generateChunkVegetation(this.#sampler, chunk.cx, chunk.cz, this.#config),
        );
        this.#generatedChunks += 1;
        generated += 1;
        changed = true;
      }
    }
    if (changed) {
      this.#rebuildInstances(focus);
    }
  }

  #rebuildInstances(focus: { x: number; z: number }): void {
    const terrainSize = this.#sampler.config.chunkSizeMeters;
    const ordered = [...this.#chunkPlacements.entries()]
      .map(([key, placements]) => {
        const comma = key.indexOf(',');
        const cx = Number(key.slice(0, comma));
        const cz = Number(key.slice(comma + 1));
        const distance = Math.hypot(cx * terrainSize - focus.x, cz * terrainSize - focus.z);
        return { distance, placements };
      })
      .sort((a, b) => a.distance - b.distance);

    const dummy = new Object3D();
    const counts = new Map<InstancedMesh, number>();
    for (const entry of this.#meshes) {
      counts.set(entry.mesh, 0);
    }
    let total = 0;
    for (const { placements } of ordered) {
      for (const placement of placements) {
        const entry = this.#meshes.find(
          (candidate) =>
            candidate.species === placement.species && candidate.variant === placement.variant,
        )!;
        const index = counts.get(entry.mesh)!;
        if (index >= entry.mesh.instanceMatrix.count) {
          continue;
        }
        dummy.position.set(placement.x, placement.y, placement.z);
        dummy.rotation.set(0, placement.rotationY, 0);
        dummy.scale.setScalar(placement.scale);
        dummy.updateMatrix();
        entry.mesh.setMatrixAt(index, dummy.matrix);
        counts.set(entry.mesh, index + 1);
        total += 1;
      }
    }
    for (const entry of this.#meshes) {
      entry.mesh.count = counts.get(entry.mesh)!;
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
    this.#totalInstances = total;
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      vegetationInstances: this.#totalInstances,
      vegetationChunks: this.#chunkPlacements.size,
      vegetationChunksGenerated: this.#generatedChunks,
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const entry of this.#meshes) {
      entry.mesh.geometry.dispose();
      entry.mesh.dispose();
    }
    this.#sharedMaterial.dispose();
    this.root.removeFromParent();
  }
}
