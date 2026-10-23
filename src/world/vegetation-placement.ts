import {
  VEGETATION_CONFIG,
  type VegetationConfig,
  type VegetationSpecies,
} from '../config/districts';
import { speciesMultipliersAt, VEGETATION_SPECIES, canopyScaleAt } from './districts';
import { TRAIL_NETWORK_CONFIG } from '../config/trails';
import { trailAt } from './trails';
import type { TerrainSampler } from './terrain-height';

/**
 * Deterministic vegetation placement — the pure, renderer-free half of
 * vegetation.ts (which owns the instanced meshes). One candidate per
 * 6.5 m cell, decided by integer hashes over the eternal cell coordinates,
 * gated by the shared sampler: road corridor clear, spawn pad clear, trees
 * below the treeline, only rock on steep ground, districts multiplying their
 * signature species. Same chunk in, same forest out — on any thread, forever.
 * The collision field (tree-collision.ts) consumes exactly these placements,
 * so the tree you see is the tree you hit.
 */

export interface VegetationPlacement {
  readonly species: VegetationSpecies;
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotationY: number;
  /** Eternal identity: the world cell that decided this plant. */
  readonly cellX: number;
  readonly cellZ: number;
  readonly key: string;
}

/** Integer hash → [0, 1), stable across platforms (same family as the terrain). */
export function hash01(ix: number, iz: number, salt: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(salt, 974711)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const TREE_SPECIES: ReadonlySet<VegetationSpecies> = new Set([
  'conifer',
  'broadleaf',
  'sakura',
  'bamboo',
]);

/** Number of geometry/instanced-mesh variants registered for a species. */
export function vegetationVariantCount(species: VegetationSpecies): number {
  return TREE_SPECIES.has(species) ? 3 : 2;
}

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
      if (
        road !== null &&
        road.distance <
          Math.max(config.roadClearanceMeters, road.halfWidthMeters + road.shoulderMeters + 4.8)
      ) {
        continue;
      }
      // Trail corridor: inside the clear band nothing grows at all (the route
      // must be drivable); inside the canopy band only tall trees may stand, so
      // the trail tunnels under the crowns instead of crossing open ground.
      const trail = trailAt(x, z);
      let canopyOnly = false;
      if (trail !== null) {
        if (trail.distance < TRAIL_NETWORK_CONFIG.clearInnerMeters) {
          continue;
        }
        canopyOnly = trail.distance < TRAIL_NETWORK_CONFIG.canopyOuterMeters;
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
      const scale =
        (isTree ? 0.8 + 0.85 * hash01(ix, iz, 53) : 0.7 + 1.1 * hash01(ix, iz, 53)) *
        canopyScaleAt(x, z);
      if (
        canopyOnly &&
        (species === 'bamboo' ||
          species === 'sakura' ||
          scale < TRAIL_NETWORK_CONFIG.canopyMinScale)
      ) {
        continue;
      }
      placements.push({
        species,
        variant: Math.floor(hash01(ix, iz, 41) * vegetationVariantCount(species)),
        x,
        y: height - 0.12,
        z,
        scale,
        rotationY: hash01(ix, iz, 67) * Math.PI * 2,
        cellX: ix,
        cellZ: iz,
        key: `${ix},${iz}`,
      });
    }
  }
  return placements;
}
