import { BufferAttribute, BufferGeometry, Color, IcosahedronGeometry } from 'three';

import { GROUND_COVER_CONFIG, type GroundCoverStyle } from '../config/ground-cover';
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
  readonly style: GroundCoverStyle;
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

function insideBuilding(x: number, z: number, building: GroundCoverBuildingBlocker): boolean {
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

export function resolveGroundCoverStyle(
  districtId: string | undefined,
  rockWeight: number,
  roll: number,
): GroundCoverStyle {
  if (
    rockWeight >= GROUND_COVER_CONFIG.minimumStoneWeight &&
    roll < GROUND_COVER_CONFIG.stoneSelectionChance * rockWeight
  ) {
    return 'stone';
  }
  if (
    (districtId === 'kuroha-jungle' ||
      districtId === 'Kiri-cedar' ||
      districtId === 'takenomichi' ||
      districtId === 'west-highlands') &&
    roll < GROUND_COVER_CONFIG.fernSelectionChance
  ) {
    return 'fern';
  }
  if (
    (districtId === 'sakura-avenue' ||
      districtId === 'shirasagi-fields' ||
      districtId === 'yuhi-town') &&
    roll < GROUND_COVER_CONFIG.wildflowerSelectionChance
  ) {
    return 'wildflower';
  }
  return 'grass';
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
      const district = districtAt(x, z);
      if (
        Math.hypot(x - AOHARA_DISTRICT_CONFIG.centerX, z - AOHARA_DISTRICT_CONFIG.centerZ) <
          GROUND_COVER_CONFIG.urbanCoreClearanceMeters ||
        district?.id === AOHARA_DISTRICT_CONFIG.id
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
      const rockWeight = weights[2];
      const style = resolveGroundCoverStyle(
        district?.id,
        rockWeight,
        hash01(cellX, cellZ, seed + 4_051),
      );
      const surfaceWeight = style === 'stone' ? rockWeight : grassWeight;
      if (
        (style === 'stone'
          ? rockWeight < GROUND_COVER_CONFIG.minimumStoneWeight
          : grassWeight < GROUND_COVER_CONFIG.minimumGrassWeight) ||
        candidate >= keepProbability * surfaceWeight
      ) {
        continue;
      }

      placements.push({
        style,
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

type GroundPoint = readonly [number, number, number];

function addTriangle(
  positions: number[],
  colors: number[],
  foliageMask: number[],
  a: GroundPoint,
  b: GroundPoint,
  c: GroundPoint,
  hex: number,
  foliage: boolean,
): void {
  const color = new Color(hex);
  for (const point of [a, b, c]) {
    positions.push(...point);
    colors.push(color.r, color.g, color.b);
    foliageMask.push(foliage ? 1 : 0);
  }
}

function addQuad(
  positions: number[],
  colors: number[],
  foliageMask: number[],
  a: GroundPoint,
  b: GroundPoint,
  c: GroundPoint,
  d: GroundPoint,
  hex: number,
  foliage: boolean,
): void {
  addTriangle(positions, colors, foliageMask, a, b, c, hex, foliage);
  addTriangle(positions, colors, foliageMask, a, c, d, hex, foliage);
}

function finishGroundCoverGeometry(
  style: GroundCoverStyle,
  positions: number[],
  colors: number[],
  foliageMask: number[],
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = `phase5-ground-cover-${style}`;
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('foliageMask', new BufferAttribute(new Float32Array(foliageMask), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildGrassGeometry(): BufferGeometry {
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
    const left: GroundPoint = [rootX - sideX * halfWidth, 0.015, rootZ - sideZ * halfWidth];
    const right: GroundPoint = [rootX + sideX * halfWidth, 0.015, rootZ + sideZ * halfWidth];
    const tip: GroundPoint = [
      rootX + dx * blade.height * 0.16,
      blade.height,
      rootZ + dz * blade.height * 0.16,
    ];
    addTriangle(
      positions,
      colors,
      foliageMask,
      left,
      right,
      tip,
      palette[index] ?? palette[0],
      true,
    );
  });
  return finishGroundCoverGeometry('grass', positions, colors, foliageMask);
}

function buildFernGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const foliageMask: number[] = [];
  const greens = [0x315a37, 0x3e7040, 0x527d45, 0x6a884a] as const;

  for (let frond = 0; frond < 5; frond += 1) {
    const angle = (frond / 5) * Math.PI * 2 + 0.12;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const sideX = -dz;
    const sideZ = dx;
    const length = 0.34 + (frond % 2) * 0.05;
    const tip: GroundPoint = [dx * length, 0.43 + (frond % 2) * 0.035, dz * length];
    const baseLeft: GroundPoint = [sideX * 0.027, 0.018, sideZ * 0.027];
    const baseRight: GroundPoint = [-sideX * 0.027, 0.018, -sideZ * 0.027];
    addTriangle(positions, colors, foliageMask, baseLeft, baseRight, tip, greens[frond % 4]!, true);
    addTriangle(
      positions,
      colors,
      foliageMask,
      baseRight,
      [0, 0.03, 0],
      tip,
      greens[frond % 4]!,
      true,
    );

    for (let pair = 0; pair < 3; pair += 1) {
      const t = 0.24 + pair * 0.2;
      const centerX = dx * length * t;
      const centerY = tip[1] * t;
      const centerZ = dz * length * t;
      const leafLength = 0.17 * (1 - t * 0.28);
      for (const sign of [-1, 1] as const) {
        const outwardX = (dx * 0.25 + sideX * sign * 0.97) * leafLength;
        const outwardZ = (dz * 0.25 + sideZ * sign * 0.97) * leafLength;
        const root: GroundPoint = [centerX, centerY, centerZ];
        const tipSide: GroundPoint = [centerX + outwardX, centerY + 0.025, centerZ + outwardZ];
        const tipForward: GroundPoint = [
          centerX + dx * leafLength * 0.72,
          centerY + 0.035,
          centerZ + dz * leafLength * 0.72,
        ];
        addTriangle(
          positions,
          colors,
          foliageMask,
          root,
          tipSide,
          tipForward,
          greens[(frond + pair) % greens.length]!,
          true,
        );
      }
    }
  }
  return finishGroundCoverGeometry('fern', positions, colors, foliageMask);
}

function buildWildflowerGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const foliageMask: number[] = [];
  const petals = [0xe2c7ad, 0xe8d5c0, 0xd99bae, 0xe5d9bb] as const;

  for (let bloom = 0; bloom < 3; bloom += 1) {
    const angle = bloom * ((Math.PI * 2) / 3) + 0.25;
    const x = Math.cos(angle) * 0.09;
    const z = Math.sin(angle) * 0.09;
    const height = 0.22 + (bloom % 2) * 0.045;
    const stemLeft: GroundPoint = [x - 0.012, 0.015, z];
    const stemRight: GroundPoint = [x + 0.012, 0.015, z];
    const stemTopLeft: GroundPoint = [x - 0.006, height, z];
    const stemTopRight: GroundPoint = [x + 0.006, height, z];
    addQuad(
      positions,
      colors,
      foliageMask,
      stemLeft,
      stemRight,
      stemTopRight,
      stemTopLeft,
      0x4b713e,
      true,
    );
    const leaf: GroundPoint = [
      x + Math.cos(angle + 0.9) * 0.12,
      height * 0.62,
      z + Math.sin(angle + 0.9) * 0.12,
    ];
    addTriangle(
      positions,
      colors,
      foliageMask,
      [x, height * 0.55, z],
      leaf,
      [x + Math.cos(angle) * 0.055, height * 0.46, z + Math.sin(angle) * 0.055],
      0x60834b,
      true,
    );

    const center: GroundPoint = [x, height + 0.035, z];
    for (let petal = 0; petal < 5; petal += 1) {
      const petalAngle = (petal / 5) * Math.PI * 2;
      const nextAngle = ((petal + 1) / 5) * Math.PI * 2;
      const outerA: GroundPoint = [
        x + Math.cos(petalAngle) * 0.075,
        height + 0.03,
        z + Math.sin(petalAngle) * 0.075,
      ];
      const outerB: GroundPoint = [
        x + Math.cos(nextAngle) * 0.075,
        height + 0.03,
        z + Math.sin(nextAngle) * 0.075,
      ];
      addTriangle(
        positions,
        colors,
        foliageMask,
        center,
        outerA,
        outerB,
        petals[bloom % petals.length]!,
        true,
      );
    }
    addTriangle(
      positions,
      colors,
      foliageMask,
      [x - 0.025, height + 0.039, z],
      [x + 0.025, height + 0.039, z],
      [x, height + 0.065, z],
      0xd7b65a,
      true,
    );
  }
  return finishGroundCoverGeometry('wildflower', positions, colors, foliageMask);
}

function buildStoneGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const foliageMask: number[] = [];
  const stones = [
    { x: -0.13, y: 0.1, z: 0, sx: 0.19, sy: 0.11, sz: 0.16, color: 0x777a76 },
    { x: 0.11, y: 0.085, z: -0.04, sx: 0.15, sy: 0.09, sz: 0.14, color: 0x8b8980 },
    { x: 0.02, y: 0.07, z: 0.13, sx: 0.12, sy: 0.075, sz: 0.11, color: 0x666d70 },
  ] as const;

  for (const stone of stones) {
    const source = new IcosahedronGeometry(1, 0);
    const sourcePositions = source.getAttribute('position');
    const base = new Color(stone.color);
    for (let index = 0; index < sourcePositions.count; index += 1) {
      const x = sourcePositions.getX(index);
      const y = sourcePositions.getY(index);
      const z = sourcePositions.getZ(index);
      const faceTone = 0.76 + (Math.floor(index / 3) % 5) * 0.07;
      positions.push(stone.x + x * stone.sx, stone.y + y * stone.sy, stone.z + z * stone.sz);
      colors.push(base.r * faceTone, base.g * faceTone, base.b * faceTone);
      foliageMask.push(0);
    }
    source.dispose();
  }
  return finishGroundCoverGeometry('stone', positions, colors, foliageMask);
}

/** District-aware, low-cost ground accents; each style is one instanced batch with a hard tier cap. */
export function buildGroundCoverGeometry(style: GroundCoverStyle = 'grass'): BufferGeometry {
  switch (style) {
    case 'grass':
      return buildGrassGeometry();
    case 'fern':
      return buildFernGeometry();
    case 'wildflower':
      return buildWildflowerGeometry();
    case 'stone':
      return buildStoneGeometry();
  }
}
