import { BufferAttribute, BufferGeometry, Color } from 'three';

import { GROUND_COVER_CONFIG } from '../config/ground-cover';
import type { TierId } from '../config/tiers';
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
import { URBAN_CITY_CONFIG } from '../config/urban-city';
import {
  terrainPatchAt,
  terrainSurfaceWeights,
  terrainVariationAt,
  type TerrainSampler,
} from './terrain-height';
import { districtAt } from './districts';
import { hash01, type VegetationPlacement } from './vegetation-placement';

export interface GroundCoverPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotationY: number;
  readonly scale: number;
}

/** A static footprint used only to keep decorative grass out of a building's base. */
export interface GroundCoverBuildingBlocker {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
}

function insideBuilding(
  x: number,
  z: number,
  building: GroundCoverBuildingBlocker,
): boolean {
  const dx = x - building.x;
  const dz = z - building.z;
  const cos = Math.cos(building.yaw);
  const sin = Math.sin(building.yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return (
    Math.abs(localX) <= building.halfWidth + GROUND_COVER_CONFIG.townBuildingClearanceMeters &&
    Math.abs(localZ) <= building.halfDepth + GROUND_COVER_CONFIG.townBuildingClearanceMeters
  );
}

function makeTreeBuckets(
  placements: readonly VegetationPlacement[],
): Map<string, VegetationPlacement[]> {
  const buckets = new Map<string, VegetationPlacement[]>();
  const cellSize = 4;
  for (const placement of placements) {
    if (placement.species === 'rock') {
      continue;
    }
    const key = `${Math.floor(placement.x / cellSize)},${Math.floor(placement.z / cellSize)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(placement);
    buckets.set(key, bucket);
  }
  return buckets;
}

function nearTree(
  x: number,
  z: number,
  buckets: ReadonlyMap<string, readonly VegetationPlacement[]>,
): boolean {
  const cellSize = 4;
  const cx = Math.floor(x / cellSize);
  const cz = Math.floor(z / cellSize);
  const clearance = GROUND_COVER_CONFIG.treeTrunkClearanceMeters;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (const tree of buckets.get(`${cx + dx},${cz + dz}`) ?? []) {
        const radius = clearance + 0.2 * tree.scale;
        if ((x - tree.x) ** 2 + (z - tree.z) ** 2 < radius * radius) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Deterministic, chunk-local grass scatter. The global lattice and integer hashes mean adjacent
 * chunks never duplicate or change a tuft; the same terrain weights that tint the ground gate
 * placement. Roads, sidewalks, Aohara's core, town footprints, the spawn pad and trunk bases stay
 * clear. Ground cover is visual only and does not enter collision or surface-grip queries.
 */
export function generateChunkGroundCover(
  sampler: TerrainSampler,
  chunkX: number,
  chunkZ: number,
  tier: TierId = 'A',
  buildingBlockers: readonly GroundCoverBuildingBlocker[] = [],
  trees: readonly VegetationPlacement[] = [],
): GroundCoverPlacement[] {
  const chunkSize = sampler.config.chunkSizeMeters;
  const cellSize = GROUND_COVER_CONFIG.cellMeters;
  const minX = chunkX * chunkSize;
  const maxX = minX + chunkSize;
  const minZ = chunkZ * chunkSize;
  const maxZ = minZ + chunkSize;
  const startCellX = Math.floor(minX / cellSize);
  const endCellX = Math.ceil(maxX / cellSize);
  const startCellZ = Math.floor(minZ / cellSize);
  const endCellZ = Math.ceil(maxZ / cellSize);
  const keepProbability = GROUND_COVER_CONFIG.keepProbabilityByTier[tier];
  const seed = sampler.config.seed;
  const treeBuckets = makeTreeBuckets(trees);
  const placements: GroundCoverPlacement[] = [];

  for (let cellZ = startCellZ; cellZ < endCellZ; cellZ += 1) {
    for (let cellX = startCellX; cellX < endCellX; cellX += 1) {
      const candidate = hash01(cellX, cellZ, seed + 4_013);
      // Reject most candidates before any terrain, normal or road sampling work.
      if (candidate >= keepProbability) {
        continue;
      }
      const x = (cellX + hash01(cellX, cellZ, seed + 4_027)) * cellSize;
      const z = (cellZ + hash01(cellX, cellZ, seed + 4_031)) * cellSize;
      // The jittered point, not its cell origin, owns the chunk. This prevents duplicates at
      // non-integral chunk/cell ratios such as 128 m / 1.8 m.
      if (x < minX || x >= maxX || z < minZ || z >= maxZ) {
        continue;
      }
      if (Math.hypot(x, z) < GROUND_COVER_CONFIG.spawnClearanceMeters) {
        continue;
      }
      if (
        Math.hypot(x - AOHARA_DISTRICT_CONFIG.centerX, z - AOHARA_DISTRICT_CONFIG.centerZ) <
          GROUND_COVER_CONFIG.urbanCoreClearanceMeters ||
        districtAt(x, z)?.id === AOHARA_DISTRICT_CONFIG.id
      ) {
        continue;
      }
      if (buildingBlockers.some((building) => insideBuilding(x, z, building))) {
        continue;
      }
      const road = sampler.roadAt?.(x, z) ?? null;
      if (road !== null) {
        const urban = road.roadClass === 'urban-local' || road.roadClass === 'urban-arterial';
        const sidewalk = urban ? URBAN_CITY_CONFIG.sidewalk.widthMeters : 0;
        const roadEdge = road.halfWidthMeters + road.shoulderMeters + sidewalk;
        if (road.distance < roadEdge + GROUND_COVER_CONFIG.roadEdgeClearanceMeters) {
          continue;
        }
      }
      if (nearTree(x, z, treeBuckets)) {
        continue;
      }

      const normal = sampler.normalAt(x, z);
      const slope = 1 - normal.y;
      if (normal.y < GROUND_COVER_CONFIG.minimumNormalY) {
        continue;
      }
      const height = sampler.heightAt(x, z);
      const weights = terrainSurfaceWeights(
        sampler.config,
        height,
        slope,
        terrainVariationAt(sampler.config, x, z),
        terrainPatchAt(sampler.config, x, z),
      );
      const grassWeight = weights[0];
      if (
        grassWeight < GROUND_COVER_CONFIG.minimumGrassWeight ||
        candidate >= keepProbability * grassWeight
      ) {
        continue;
      }

      placements.push({
        x,
        y: height - 0.025,
        z,
        rotationY: hash01(cellX, cellZ, seed + 4_037) * Math.PI * 2,
        scale: 0.72 + hash01(cellX, cellZ, seed + 4_043) * 0.64,
      });
    }
  }
  return placements;
}

/** A small five-blade tuft; a single double-sided instanced mesh carries the whole ground layer. */
export function buildGroundCoverGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const foliageMask: number[] = [];
  const palette = [0x315536, 0x486b3b, 0x5d7541, 0x75814a, 0x8b8350] as const;
  const blades = [
    { angle: 0.1, height: 0.31, width: 0.075 },
    { angle: 0.82, height: 0.38, width: 0.068 },
    { angle: 1.49, height: 0.27, width: 0.082 },
    { angle: 2.38, height: 0.34, width: 0.072 },
    { angle: 2.96, height: 0.24, width: 0.078 },
  ] as const;

  blades.forEach((blade, index) => {
    const dx = Math.cos(blade.angle);
    const dz = Math.sin(blade.angle);
    const sideX = -dz;
    const sideZ = dx;
    const rootX = dx * 0.018;
    const rootZ = dz * 0.018;
    const halfWidth = blade.width * 0.5;
    const left: readonly [number, number, number] = [
      rootX - sideX * halfWidth,
      0.015,
      rootZ - sideZ * halfWidth,
    ];
    const right: readonly [number, number, number] = [
      rootX + sideX * halfWidth,
      0.015,
      rootZ + sideZ * halfWidth,
    ];
    const tip: readonly [number, number, number] = [
      rootX + dx * blade.height * 0.16,
      blade.height,
      rootZ + dz * blade.height * 0.16,
    ];
    const color = new Color(palette[index] ?? palette[0]);
    for (const point of [left, right, tip]) {
      positions.push(...point);
      colors.push(color.r, color.g, color.b);
      foliageMask.push(1);
    }
  });

  const geometry = new BufferGeometry();
  geometry.name = 'phase5-ground-cover-grass-tuft';
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('foliageMask', new BufferAttribute(new Float32Array(foliageMask), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
