import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
  type Material,
  Quaternion,
  Vector3,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, uniform, vertexColor } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  VEGETATION_CONFIG,
  type VegetationConfig,
  type VegetationSpecies,
} from '../config/districts';
import { FOLIAGE_LIGHTING_CONFIG } from '../config/foliage-lighting';
import {
  GROUND_COVER_CONFIG,
  GROUND_COVER_STYLES,
  type GroundCoverStyle,
} from '../config/ground-cover';
import { VEGETATION_CHUNK_GENERATION_BUDGET_PER_FRAME } from '../config/vegetation-streaming';
import type { TierId } from '../config/tiers';
import type { DaylightState } from '../environment/EnvironmentClock';
import {
  createFoliageEmissiveNode,
  createScannedFoliageMaterial,
  isFoliageMaterial,
  resolveFoliageBacklightStrength,
} from './foliage-lighting';
import {
  buildGroundCoverGeometry,
  generateChunkGroundCover,
  type GroundCoverBuildingBlocker,
  type GroundCoverPlacement,
} from './ground-cover';
import { createFoliageWindPositionNode, resolveFoliageWindAmplitude } from './foliage-wind';
import {
  generateChunkVegetation,
  hash01,
  TREE_SPECIES,
  type VegetationPlacement,
} from './vegetation-placement';

export { generateChunkVegetation, type VegetationPlacement } from './vegetation-placement';
import { TREE_COLLISION } from '../config/districts';
import { VEGETATION_SPECIES } from './districts';
import { loadScannedSpecies, type ScannedSpecies } from './scanned-vegetation';
import type { TreeHitEvent, TreeVisualState } from './tree-collision';
import type { TerrainSampler } from './terrain-height';
import { chunkKey, type PlannedChunk } from './terrain-chunks';
import { planVegetationWindow } from './vegetation-streaming';

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

// ---------------------------------------------------------------------------
// Species geometry: authored low-poly forms, vertex-colour baked, three tint
// variants for leafy species so a forest is not one flat colour.
// ---------------------------------------------------------------------------

function paint(geometry: BufferGeometry, hex: number, foliage = false): BufferGeometry {
  const color = new Color(hex);
  if (foliage) {
    color.multiplyScalar(FOLIAGE_LIGHTING_CONFIG.albedoLift);
  }
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute(
    'foliageMask',
    new BufferAttribute(new Float32Array(count).fill(foliage ? 1 : 0), 1),
  );
  return geometry;
}

function part(
  geometry: BufferGeometry,
  hex: number,
  x: number,
  y: number,
  z: number,
  foliage = false,
): BufferGeometry {
  const painted = paint(geometry.toNonIndexed(), hex, foliage);
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
        part(new CylinderGeometry(0.13, 0.24, 2.3, 5), 0x6b4a33, 0, 0.85, 0),
        part(new ConeGeometry(1.55, 2.7, 7), tint[0], 0, 2.4, 0, true),
        part(new ConeGeometry(1.18, 2.3, 7), tint[0], 0, 3.6, 0, true),
        part(new ConeGeometry(0.78, 1.9, 7), tint[0], 0, 4.7, 0, true),
      ])!;
    case 'broadleaf':
      return mergeGeometries([
        part(new CylinderGeometry(0.15, 0.27, 2.6, 5), 0x6e4f36, 0, 1.0, 0),
        part(new IcosahedronGeometry(1.55, 0), tint[1], 0, 3.1, 0, true),
        part(new IcosahedronGeometry(1.0, 0), tint[1], 0.95, 2.55, 0.3, true),
        part(new IcosahedronGeometry(0.92, 0), tint[1], -0.85, 2.7, -0.25, true),
      ])!;
    case 'sakura':
      return mergeGeometries([
        part(new CylinderGeometry(0.14, 0.25, 2.5, 5), 0x574233, 0, 0.95, 0),
        part(new IcosahedronGeometry(1.5, 0), tint[2], 0, 3.0, 0, true),
        part(new IcosahedronGeometry(0.95, 0), tint[2], 0.9, 2.5, -0.2, true),
        part(new IcosahedronGeometry(0.88, 0), tint[2], -0.8, 2.6, 0.3, true),
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
        parts.push(part(new CylinderGeometry(0.045, 0.06, 5.4, 4), 0x7fae56, cx, 2.4, cz));
        parts.push(part(new ConeGeometry(0.55, 1.5, 5), 0x8fbc62, cx, 5.2, cz, true));
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

/** Height where a snapped trunk separates (the stump keeps this much). */
export const SNAP_HEIGHT = 1.25;

/**
 * The crown of a species (everything above the snap point), origin at the snap
 * so a falling crown pivots where it broke. Bamboo crowns keep their culms.
 */
export function buildCrownGeometry(species: VegetationSpecies, variant: number): BufferGeometry {
  const tint = LEAF_TINTS[variant % LEAF_TINTS.length]!;
  const lift = -SNAP_HEIGHT;
  switch (species) {
    case 'conifer':
      return mergeGeometries([
        part(new CylinderGeometry(0.09, 0.13, 1.7, 5), 0x6b4a33, 0, 0.6, 0),
        part(new ConeGeometry(1.55, 2.7, 7), tint[0], 0, 2.4 + lift, 0, true),
        part(new ConeGeometry(1.18, 2.3, 7), tint[0], 0, 3.6 + lift, 0, true),
        part(new ConeGeometry(0.78, 1.9, 7), tint[0], 0, 4.7 + lift, 0, true),
      ])!;
    case 'broadleaf':
      return mergeGeometries([
        part(new IcosahedronGeometry(1.55, 0), tint[1], 0, 3.1 + lift, 0, true),
        part(new IcosahedronGeometry(1.0, 0), tint[1], 0.95, 2.55 + lift, 0.3, true),
        part(new IcosahedronGeometry(0.92, 0), tint[1], -0.85, 2.7 + lift, -0.25, true),
      ])!;
    case 'sakura':
      return mergeGeometries([
        part(new IcosahedronGeometry(1.5, 0), tint[2], 0, 3.0 + lift, 0, true),
        part(new IcosahedronGeometry(0.95, 0), tint[2], 0.9, 2.5 + lift, -0.2, true),
        part(new IcosahedronGeometry(0.88, 0), tint[2], -0.8, 2.6 + lift, 0.3, true),
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
        parts.push(part(new CylinderGeometry(0.045, 0.055, 3.55, 4), 0x7fae56, cx, 1.78, cz));
        parts.push(part(new ConeGeometry(0.55, 1.5, 5), 0x8fbc62, cx, 5.2 + lift, cz, true));
      }
      return mergeGeometries(parts)!;
    }
    case 'rock':
      return new BufferGeometry();
  }
}

/** What a snapped tree leaves behind: a waist-high stump with a pale cut top. */
export function buildStumpGeometry(): BufferGeometry {
  return mergeGeometries([
    part(new CylinderGeometry(0.17, 0.27, SNAP_HEIGHT, 6), 0x6b4a33, 0, SNAP_HEIGHT / 2, 0),
    part(new CylinderGeometry(0.17, 0.17, 0.06, 6), 0xc9a06b, 0, SNAP_HEIGHT + 0.02, 0),
  ])!;
}

export type ShardKind = 'wood' | 'leaf' | 'blossom';

/** One flying fragment of a shattered tree (splinter or leaf clump). */
export function buildShardGeometry(kind: ShardKind): BufferGeometry {
  if (kind === 'wood') {
    return paint(new CylinderGeometry(0.05, 0.09, 0.85, 4).toNonIndexed(), 0x77543a);
  }
  return paint(
    new IcosahedronGeometry(0.42, 0).toNonIndexed(),
    kind === 'leaf' ? 0x3a6b35 : 0xe8a7bf,
    true,
  );
}

const UP = new Vector3(0, 1, 0);

const SPECIES_CAPACITY: Record<VegetationSpecies, number> = {
  conifer: 5200,
  broadleaf: 4200,
  sakura: 2000,
  bamboo: 2000,
  rock: 2400,
};

/**
 * Scanned-vegetation adoption (Phase 5): which derived model replaces which authored
 * species/variant, and the game height each scanned tree is normalised to. The scans arrive at
 * their real-world metres (an 18.9 m fir); the scatter states how tall that tree should stand in
 * Hinode, and every instance is scaled by the ratio, so placement scale still varies tree size.
 */
const SCANNED_FOR: readonly { key: string; assetId: string }[] = [
  { key: 'conifer:0', assetId: 'model-fir-tree-01-a' },
  { key: 'conifer:1', assetId: 'model-fir-tree-01-b' },
  { key: 'conifer:2', assetId: 'model-fir-tree-01-c' },
  { key: 'broadleaf:0', assetId: 'model-island-tree-01' },
  { key: 'broadleaf:1', assetId: 'model-island-tree-01' },
  { key: 'broadleaf:2', assetId: 'model-island-tree-01' },
  { key: 'rock:0', assetId: 'model-boulder-01' },
  { key: 'rock:1', assetId: 'model-boulder-01' },
];

const SCANNED_GAME_HEIGHTS: Record<VegetationSpecies, number> = {
  conifer: 12,
  broadleaf: 8.5,
  sakura: 5.5,
  bamboo: 6,
  rock: 1.8,
};

/** Distance rings for the scanned levels of detail: lod0 inside 30 m, lod1 inside 80 m. */
export const SCANNED_LOD_RADII: readonly [number, number] = [30, 80];
/** Beyond this range half the scanned instances are dropped by a positional hash. */
export const SCANNED_THIN_METERS = 180;
/** Beyond this range nothing scanned is instanced at all; the authored scatter keeps no trees
 *  here either, so the horizon stays cheap. */
export const SCANNED_FAR_CULL_METERS = 300;

/** One instanced pool of one scanned part (material) at one level of detail. */
interface ScannedPool {
  readonly level: number;
  readonly mesh: InstancedMesh;
}

/**
 * The streaming owner: one InstancedMesh per species/variant, fed by generated
 * chunk placements inside the vegetation window. Rebuilds the instance buffers
 * only when the window's chunk set changes; placement generation is budgeted
 * per frame like terrain builds, so a fast slide-in never hitches.
 */
interface DebrisPiece {
  mesh: InstancedMesh;
  position: Vector3;
  velocity: Vector3;
  quaternion: Quaternion;
  angular: Vector3;
  scale: number;
  age: number;
  grounded: boolean;
}

interface BentAnimation {
  angle: number;
  velocity: number;
  target: number;
  dirX: number;
  dirZ: number;
}

export class VegetationWorld {
  readonly root = new Group();
  readonly #foliageSunDirection = uniform(new Vector3(0, 1, 0));
  readonly #foliageSunTint = uniform(new Vector3(1, 1, 1));
  readonly #foliageBacklightStrength = uniform(0);
  readonly #sampler: TerrainSampler;
  readonly #config: VegetationConfig;
  readonly #detail: number;
  readonly #tier: TierId;
  readonly #meshes: { species: VegetationSpecies; variant: number; mesh: InstancedMesh }[] = [];
  readonly #chunkPlacements = new Map<string, VegetationPlacement[]>();
  readonly #groundCoverByChunk = new Map<string, GroundCoverPlacement[]>();
  #groundCoverBlockers: readonly GroundCoverBuildingBlocker[] = [];
  #groundCoverInstances = 0;
  readonly #groundCoverMeshes: {
    readonly style: GroundCoverStyle;
    readonly mesh: InstancedMesh;
  }[] = [];
  readonly #groundCoverInstancesByStyle: Record<GroundCoverStyle, number> = {
    grass: 0,
    fern: 0,
    wildflower: 0,
    stone: 0,
  };
  readonly #groundCoverMaterial: MeshStandardNodeMaterial;
  #center: { cx: number; cz: number } | null = null;
  #totalInstances = 0;
  #generatedChunks = 0;
  #disposed = false;
  // Destruction visuals (tree-collision.ts owns the truth; this mirrors it):
  readonly #crownMeshes = new Map<string, InstancedMesh>();
  #stumpMesh: InstancedMesh | null = null;
  readonly #shardMeshes = new Map<ShardKind, InstancedMesh>();
  #stateProvider: ((key: string) => TreeVisualState | undefined) | null = null;
  readonly #states = new Map<string, TreeVisualState>();
  readonly #placementByKey = new Map<string, VegetationPlacement>();
  readonly #instanceByKey = new Map<string, { mesh: InstancedMesh; index: number }>();
  readonly #bentAnims = new Map<string, BentAnimation>();
  #pieces: DebrisPiece[] = [];
  #stumpCount = 0;
  #lastFocus = { x: 0, z: 0 };
  // Scanned adoption (Phase 5): species key -> grouped scan, and its pools per part/level.
  readonly #scanned = new Map<string, ScannedSpecies>();
  readonly #scannedPools = new Map<string, ScannedPool[]>();
  readonly #scannedCounts = new Map<InstancedMesh, number>();
  #scannedStump: ScannedPool[] | null = null;

  constructor(
    sampler: TerrainSampler,
    config: VegetationConfig = VEGETATION_CONFIG,
    detailScale = 1,
    tier: TierId = 'A',
  ) {
    this.#sampler = sampler;
    this.#config = config;
    this.#detail = Math.min(1, Math.max(0.4, detailScale));
    this.#tier = tier;
    this.root.name = 'VegetationWorld';

    const material = new MeshStandardNodeMaterial();
    material.colorNode = vertexColor();
    material.emissiveNode = createFoliageEmissiveNode(
      attribute('foliageMask', 'float'),
      this.#foliageSunDirection,
      this.#foliageSunTint,
      this.#foliageBacklightStrength,
    );
    const foliageWind = createFoliageWindPositionNode(attribute('foliageMask', 'float'), tier);
    if (foliageWind !== null) {
      material.positionNode = foliageWind;
    }
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
    // One shared material instance across all instanced tree/prop meshes.
    this.#sharedMaterial = material;

    // Deterministic rural ground-layer accents share the existing prepare-ahead window and wind
    // shader. Style capacities partition the same total per-tier pool; no new collision, texture,
    // or weather state is introduced. Stones carry a zero foliage mask and remain still.
    const groundCoverMaterial = new MeshStandardNodeMaterial();
    groundCoverMaterial.colorNode = vertexColor();
    groundCoverMaterial.emissiveNode = createFoliageEmissiveNode(
      attribute('foliageMask', 'float'),
      this.#foliageSunDirection,
      this.#foliageSunTint,
      this.#foliageBacklightStrength,
    );
    const groundCoverWind = createFoliageWindPositionNode(attribute('foliageMask', 'float'), tier);
    if (groundCoverWind !== null) {
      groundCoverMaterial.positionNode = groundCoverWind;
    }
    groundCoverMaterial.roughness = 0.96;
    groundCoverMaterial.side = DoubleSide;
    groundCoverMaterial.name = 'ground-cover-district-understory-wind-backlight';
    for (const style of GROUND_COVER_STYLES) {
      const mesh = new InstancedMesh(
        buildGroundCoverGeometry(style),
        groundCoverMaterial,
        GROUND_COVER_CONFIG.styleInstanceBudgetByTier[tier][style],
      );
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.name = `ground-cover-${style}`;
      this.root.add(mesh);
      this.#groundCoverMeshes.push({ style, mesh });
    }
    this.#groundCoverMaterial = groundCoverMaterial;

    // Destruction meshes: falling crowns per species/variant, one stump mesh,
    // and three shard pools (splinters, leaf clumps, blossom clumps).
    for (const species of VEGETATION_SPECIES) {
      if (species === 'rock') {
        continue;
      }
      const variants = TREE_SPECIES.has(species) ? 3 : 2;
      for (let variant = 0; variant < variants; variant += 1) {
        const mesh = new InstancedMesh(buildCrownGeometry(species, variant), material, 40);
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.name = `vegetation-crown-${species}-${variant}`;
        this.root.add(mesh);
        this.#crownMeshes.set(`${species}:${variant}`, mesh);
      }
    }
    const stump = new InstancedMesh(buildStumpGeometry(), material, 1024);
    stump.castShadow = true;
    stump.receiveShadow = true;
    stump.frustumCulled = false;
    stump.count = 0;
    stump.name = 'vegetation-stumps';
    this.root.add(stump);
    this.#stumpMesh = stump;
    for (const kind of ['wood', 'leaf', 'blossom'] as const) {
      const mesh = new InstancedMesh(buildShardGeometry(kind), material, 260);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.name = `vegetation-shards-${kind}`;
      this.root.add(mesh);
      this.#shardMeshes.set(kind, mesh);
    }
  }

  /** Updates the leaf backlight from the same resolved direction, colour and clock phase as the sun. */
  setDaylight(state: DaylightState): void {
    this.#foliageSunDirection.value.set(
      state.sunDirection.x,
      state.sunDirection.y,
      state.sunDirection.z,
    );
    const tint = new Color(state.sunColorHex);
    this.#foliageSunTint.value.set(tint.r, tint.g, tint.b);
    this.#foliageBacklightStrength.value = resolveFoliageBacklightStrength(
      state.sunIntensity,
      state.isNight,
    );
  }

  /** Wires the collision field's truth into rebuilds (bent leans, stumps). */
  setStateProvider(provider: ((key: string) => TreeVisualState | undefined) | null): void {
    this.#stateProvider = provider;
  }

  /** Keeps decorative grass outside Yūhi Town's existing static building footprints. */
  setGroundCoverBlockers(blockers: readonly GroundCoverBuildingBlocker[]): void {
    this.#groundCoverBlockers = blockers;
  }

  readonly #sharedMaterial: MeshStandardNodeMaterial;

  /**
   * Replaces authored species with their scanned CC0 stand-ins, one InstancedMesh per material
   * part per level of detail (Phase 5). Adoption is opportunistic: a model that fails to load
   * leaves its authored species standing, and the scatter never notices the difference.
   *
   * Pools are created once, at adoption, and then simply re-counted by every rebuild — creating
   * them per rebuild leaked a mesh per window slide, and sharing one instanceMatrix across the
   * parts of a tree painted every material with the first part's geometry.
   */
  async adoptScanned(renderer: object): Promise<void> {
    if (this.#disposed) {
      return;
    }
    const results = await Promise.all(
      SCANNED_FOR.map(async (entry) => {
        try {
          return { key: entry.key, species: await loadScannedSpecies(renderer, entry.assetId) };
        } catch (error) {
          console.warn(
            `scanned vegetation unavailable for ${entry.assetId}: ${(error as Error).message}`,
          );
          return { key: entry.key, species: null };
        }
      }),
    );
    const foliageMaterials = new Map<Material, Material>();
    for (const { key, species: loadedSpecies } of results) {
      if (loadedSpecies === null || this.#scanned.has(key)) {
        continue;
      }
      // The same leaf material can be shared by several meshes and LODs. Clone it once so its
      // albedo/backlight treatment is consistent without multiplying the albedo repeatedly.
      const species: ScannedSpecies = {
        ...loadedSpecies,
        lods: loadedSpecies.lods.map((lod) => ({
          ...lod,
          parts: lod.parts.map((part) => {
            if (!isFoliageMaterial(part.material)) {
              return part;
            }
            let material = foliageMaterials.get(part.material);
            if (material === undefined) {
              material = createScannedFoliageMaterial(
                part.material,
                this.#foliageSunDirection,
                this.#foliageSunTint,
                this.#foliageBacklightStrength,
                this.#tier,
              );
              foliageMaterials.set(part.material, material);
            }
            return { ...part, material };
          }),
        })),
      };
      const comma = key.indexOf(':');
      const speciesName = key.slice(0, comma) as VegetationSpecies;
      const variants = TREE_SPECIES.has(speciesName) ? 3 : 2;
      const capacity = Math.floor(SPECIES_CAPACITY[speciesName] / variants);
      const pools: ScannedPool[] = [];
      for (const lod of species.lods) {
        lod.parts.forEach((part, partIndex) => {
          const mesh = new InstancedMesh(part.geometry, part.material, capacity);
          // Only the nearest level casts: a shadow cascade cannot tell lod1 from lod0, and the
          // far rings would pay shadow cost for silhouettes a dozen pixels tall.
          mesh.castShadow = lod.level === 0;
          mesh.receiveShadow = lod.level === 0;
          mesh.frustumCulled = false;
          mesh.count = 0;
          mesh.name = `vegetation-${key}-lod${lod.level}-${partIndex}`;
          this.root.add(mesh);
          this.#scannedCounts.set(mesh, 0);
          pools.push({ level: lod.level, mesh });
        });
      }
      this.#scanned.set(key, species);
      this.#scannedPools.set(key, pools);
    }
    try {
      const stump = await loadScannedSpecies(renderer, 'model-tree-stump-01');
      if (stump !== null) {
        const pools: ScannedPool[] = [];
        for (const lod of stump.lods) {
          if (lod.level !== 0) {
            continue;
          }
          lod.parts.forEach((part, partIndex) => {
            const mesh = new InstancedMesh(part.geometry, part.material, 1024);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            mesh.count = 0;
            mesh.name = `vegetation-stump-scanned-${partIndex}`;
            this.root.add(mesh);
            this.#scannedCounts.set(mesh, 0);
            pools.push({ level: 0, mesh });
          });
        }
        if (pools.length > 0) {
          this.#scannedStump = pools;
        }
      }
    } catch (error) {
      console.warn(`scanned stump unavailable: ${(error as Error).message}`);
    }
    this.#rebuildInstances(this.#lastFocus);
  }

  /** Instances one scanned tree at its placement, at the level its distance earns. */
  #writeScanned(
    key: string,
    species: VegetationSpecies,
    placement: VegetationPlacement,
    lean: { angle: number; dirX: number; dirZ: number } | null,
    focus: { x: number; z: number },
    dummy: Object3D,
  ): void {
    const scanned = this.#scanned.get(key);
    const pools = this.#scannedPools.get(key);
    if (scanned === undefined || pools === undefined) {
      return;
    }
    const k = this.#detail;
    const distance = Math.hypot(placement.x - focus.x, placement.z - focus.z);
    if (distance > SCANNED_FAR_CULL_METERS * k) {
      return;
    }
    // Past the thin ring candidates are dropped by a positional hash, so the far
    // forest keeps its density *look* without paying for density. Low-detail
    // devices pull every ring in and thin harder: the deep jungle at full rings
    // is a couple of million triangles, which only a desktop GPU enjoys.
    if (
      distance > SCANNED_THIN_METERS * k &&
      hash01(Math.round(placement.x), Math.round(placement.z), 91) < (k < 0.8 ? 0.72 : 0.5)
    ) {
      return;
    }
    const level =
      distance < SCANNED_LOD_RADII[0] * k ? 0 : distance < SCANNED_LOD_RADII[1] * k ? 1 : 2;
    const scale = (SCANNED_GAME_HEIGHTS[species] / Math.max(0.5, scanned.height)) * placement.scale;
    // A shallow sink, not the authored one: scanned trunks carry their own root flare below y=0.
    dummy.position.set(placement.x, placement.y - 0.2 * placement.scale, placement.z);
    if (lean === null || lean.angle <= 0.001) {
      dummy.quaternion.setFromAxisAngle(UP, placement.rotationY);
    } else {
      const axis = new Vector3(lean.dirZ, 0, -lean.dirX).normalize();
      const tilt = new Quaternion().setFromAxisAngle(axis, lean.angle);
      dummy.quaternion.setFromAxisAngle(UP, placement.rotationY).multiply(tilt);
    }
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    for (const pool of pools) {
      if (pool.level !== level) {
        continue;
      }
      const index = this.#scannedCounts.get(pool.mesh) ?? 0;
      if (index >= pool.mesh.instanceMatrix.count) {
        continue;
      }
      pool.mesh.setMatrixAt(index, dummy.matrix);
      this.#scannedCounts.set(pool.mesh, index + 1);
    }
  }

  #planWindow(focus: { x: number; z: number }, velocity: { x: number; z: number }): PlannedChunk[] {
    const plan = planVegetationWindow(
      this.#sampler.config,
      this.#config.radiusChunks,
      this.#center,
      focus,
      velocity,
    );
    this.#center = plan.center;
    return plan.chunks;
  }

  #retainPlannedChunks(planned: readonly PlannedChunk[]): boolean {
    const wanted = new Set(planned.map((chunk) => chunkKey(chunk.cx, chunk.cz)));
    let changed = false;
    for (const key of [...this.#chunkPlacements.keys()]) {
      if (!wanted.has(key)) {
        this.#chunkPlacements.delete(key);
        this.#groundCoverByChunk.delete(key);
        changed = true;
      }
    }
    return changed;
  }

  #generateMissingChunks(planned: readonly PlannedChunk[], budget: number): boolean {
    let generated = 0;
    let changed = false;
    for (const chunk of planned) {
      if (generated >= budget) {
        break;
      }
      const key = chunkKey(chunk.cx, chunk.cz);
      if (this.#chunkPlacements.has(key)) {
        continue;
      }
      const plants = generateChunkVegetation(this.#sampler, chunk.cx, chunk.cz, this.#config);
      this.#chunkPlacements.set(key, plants);
      this.#groundCoverByChunk.set(
        key,
        generateChunkGroundCover(
          this.#sampler,
          chunk.cx,
          chunk.cz,
          this.#tier,
          this.#groundCoverBlockers,
          plants,
        ),
      );
      this.#generatedChunks += 1;
      generated += 1;
      changed = true;
    }
    return changed;
  }

  /**
   * Prepares the full starting foliage window before the first rendered frame. Generation is
   * split into short batches and yielded to the event loop; instance buffers are rebuilt once,
   * after every planned chunk is ready, so no partial forest is exposed at startup.
   */
  async prepareInitial(
    focus: { x: number; z: number },
    velocity: { x: number; z: number } = { x: 0, z: 0 },
  ): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#lastFocus = { x: focus.x, z: focus.z };
    const planned = this.#planWindow(focus, velocity);
    let changed = this.#retainPlannedChunks(planned);
    const batchSize = 8;
    const deadline = Date.now() + 30_000;
    let timedOut = false;
    for (let start = 0; start < planned.length; start += batchSize) {
      if (this.#disposed) {
        return;
      }
      changed =
        this.#generateMissingChunks(planned.slice(start, start + batchSize), batchSize) || changed;
      if (start + batchSize < planned.length) {
        if (Date.now() >= deadline) {
          timedOut = true;
          break;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    if (this.#disposed) {
      return;
    }
    if (changed) {
      this.#rebuildInstances(focus);
    }
    if (this.#chunkPlacements.size !== planned.length) {
      const reason = timedOut ? 'preparation timed out' : 'window incomplete';
      console.warn(
        `vegetation: initial ${reason} (${this.#chunkPlacements.size}/${planned.length} chunks ready)`,
      );
    }
  }

  /** Per-frame streaming hook, driven beside terrain and using the same velocity-aware lead. */
  updateStreaming(
    focus: { x: number; z: number },
    velocity: { x: number; z: number } = { x: 0, z: 0 },
    deltaSeconds = 0,
  ): void {
    if (this.#disposed) {
      return;
    }
    this.#lastFocus = { x: focus.x, z: focus.z };
    const planned = this.#planWindow(focus, velocity);
    const pruned = this.#retainPlannedChunks(planned);
    const generated = this.#generateMissingChunks(
      planned,
      VEGETATION_CHUNK_GENERATION_BUDGET_PER_FRAME[this.#tier],
    );
    if (pruned || generated) {
      this.#rebuildInstances(focus);
    }
    this.#tick(deltaSeconds);
  }

  /**
   * Mirrors collision-field hit events into visuals: bent trees start their
   * spring, snapped crowns become falling debris over a stump, shattered trees
   * burst into shards. Rebuilds the standing instances once per event batch.
   */
  applyHits(events: readonly TreeHitEvent[]): void {
    if (this.#disposed || events.length === 0) {
      return;
    }
    for (const event of events) {
      this.#states.set(event.key, {
        condition:
          event.outcome === 'bend' ? 'bent' : event.outcome === 'snap' ? 'snapped' : 'shattered',
        leanAngleRad: event.leanAngleRad,
        leanDirX: event.dirX,
        leanDirZ: event.dirZ,
      });
      if (event.outcome === 'bend') {
        this.#bentAnims.set(event.key, {
          angle: this.#bentAnims.get(event.key)?.angle ?? 0,
          // The trunk leaves with the reaction speed the impulse gave it:
          // tip speed over trunk height is the initial sway rate.
          velocity: Math.min(2.4, Math.max(0.25, event.reactionSpeed / (5 * event.scale))),
          target: event.leanAngleRad,
          dirX: event.dirX,
          dirZ: event.dirZ,
        });
      } else if (event.outcome === 'snap') {
        this.#bentAnims.delete(event.key);
        this.#spawnCrown(event);
      } else {
        this.#bentAnims.delete(event.key);
        this.#spawnShards(event);
      }
    }
    this.#rebuildInstances(this.#lastFocus);
  }

  #writeMatrix(
    mesh: InstancedMesh,
    index: number,
    placement: VegetationPlacement,
    lean: { angle: number; dirX: number; dirZ: number } | null,
    dummy: Object3D,
  ): void {
    // Sink the base into the ground: chunk meshes are decimated with distance, so
    // their surface dips below the exact height the scatter sampled — an unsunk
    // tree then floats above its own footprint at mid range (owner report
    // 2026-10-17). The trunks carry extra length below y=0 to pay for it.
    dummy.position.set(placement.x, placement.y - 0.3 * placement.scale, placement.z);
    if (lean === null || lean.angle <= 0.001) {
      dummy.quaternion.setFromAxisAngle(UP, placement.rotationY);
    } else {
      const axis = new Vector3(lean.dirZ, 0, -lean.dirX).normalize();
      const tilt = new Quaternion().setFromAxisAngle(axis, lean.angle);
      dummy.quaternion.setFromAxisAngle(UP, placement.rotationY).multiply(tilt);
    }
    dummy.scale.setScalar(placement.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  #rebuildInstances(focus: { x: number; z: number }): void {
    const terrainSize = this.#sampler.config.chunkSizeMeters;
    const ordered = [...this.#chunkPlacements.entries()]
      .map(([key, placements]) => {
        const comma = key.indexOf(',');
        const cx = Number(key.slice(0, comma));
        const cz = Number(key.slice(comma + 1));
        const distance = Math.hypot(cx * terrainSize - focus.x, cz * terrainSize - focus.z);
        return { key, distance, placements };
      })
      .sort((a, b) => a.distance - b.distance);

    const dummy = new Object3D();
    const counts = new Map<InstancedMesh, number>();
    for (const entry of this.#meshes) {
      counts.set(entry.mesh, 0);
    }
    for (const mesh of this.#scannedCounts.keys()) {
      this.#scannedCounts.set(mesh, 0);
    }
    this.#placementByKey.clear();
    this.#instanceByKey.clear();
    let total = 0;
    let stumps = 0;
    const groundCoverCounts = new Map<InstancedMesh, number>();
    const groundCoverByStyle = new Map<GroundCoverStyle, InstancedMesh>();
    for (const entry of this.#groundCoverMeshes) {
      groundCoverCounts.set(entry.mesh, 0);
      groundCoverByStyle.set(entry.style, entry.mesh);
    }
    for (const { key, placements } of ordered) {
      for (const clump of this.#groundCoverByChunk.get(key) ?? []) {
        const mesh = groundCoverByStyle.get(clump.style);
        if (mesh === undefined) {
          continue;
        }
        const instanceIndex = groundCoverCounts.get(mesh) ?? 0;
        if (instanceIndex >= mesh.instanceMatrix.count) {
          continue;
        }
        dummy.position.set(clump.x, clump.y, clump.z);
        dummy.rotation.set(0, clump.rotationY, 0);
        dummy.scale.setScalar(clump.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(instanceIndex, dummy.matrix);
        groundCoverCounts.set(mesh, instanceIndex + 1);
      }
      for (const placement of placements) {
        this.#placementByKey.set(placement.key, placement);
        const state = this.#stateProvider?.(placement.key) ?? this.#states.get(placement.key);
        if (state !== undefined && state.condition !== 'intact' && state.condition !== 'bent') {
          // Down: only the stump remains (the crown is debris, handled separately).
          const downKey = `${placement.species}:${placement.variant}`;
          if (this.#scanned.has(downKey) && this.#scannedStump !== null) {
            dummy.position.set(placement.x, placement.y - 0.15 * placement.scale, placement.z);
            dummy.quaternion.setFromAxisAngle(UP, placement.rotationY);
            dummy.scale.setScalar(placement.scale);
            dummy.updateMatrix();
            for (const pool of this.#scannedStump) {
              const stumpIndex = this.#scannedCounts.get(pool.mesh) ?? 0;
              if (stumpIndex >= pool.mesh.instanceMatrix.count) {
                continue;
              }
              pool.mesh.setMatrixAt(stumpIndex, dummy.matrix);
              this.#scannedCounts.set(pool.mesh, stumpIndex + 1);
            }
          } else if (this.#stumpMesh !== null && stumps < this.#stumpMesh.instanceMatrix.count) {
            dummy.position.set(placement.x, placement.y - 0.15 * placement.scale, placement.z);
            dummy.quaternion.setFromAxisAngle(UP, placement.rotationY);
            dummy.scale.setScalar(placement.scale);
            dummy.updateMatrix();
            this.#stumpMesh.setMatrixAt(stumps, dummy.matrix);
            stumps += 1;
          }
          continue;
        }
        const standingKey = `${placement.species}:${placement.variant}`;
        if (this.#scanned.has(standingKey)) {
          const anim = this.#bentAnims.get(placement.key);
          const lean =
            anim !== undefined
              ? { angle: anim.angle, dirX: anim.dirX, dirZ: anim.dirZ }
              : state !== undefined && state.condition === 'bent'
                ? { angle: state.leanAngleRad, dirX: state.leanDirX, dirZ: state.leanDirZ }
                : null;
          this.#writeScanned(standingKey, placement.species, placement, lean, focus, dummy);
          this.#placementByKey.set(placement.key, placement);
          total += 1;
          continue;
        }
        const entry = this.#meshes.find(
          (candidate) =>
            candidate.species === placement.species && candidate.variant === placement.variant,
        )!;
        const index = counts.get(entry.mesh)!;
        if (index >= entry.mesh.instanceMatrix.count) {
          continue;
        }
        const anim = this.#bentAnims.get(placement.key);
        const lean =
          anim !== undefined
            ? { angle: anim.angle, dirX: anim.dirX, dirZ: anim.dirZ }
            : state !== undefined && state.condition === 'bent'
              ? { angle: state.leanAngleRad, dirX: state.leanDirX, dirZ: state.leanDirZ }
              : null;
        this.#writeMatrix(entry.mesh, index, placement, lean, dummy);
        this.#instanceByKey.set(placement.key, { mesh: entry.mesh, index });
        counts.set(entry.mesh, index + 1);
        total += 1;
      }
    }
    for (const entry of this.#meshes) {
      entry.mesh.count = counts.get(entry.mesh)!;
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.#stumpMesh !== null) {
      this.#stumpMesh.count = stumps;
      this.#stumpMesh.instanceMatrix.needsUpdate = true;
    }
    for (const pools of this.#scannedPools.values()) {
      for (const pool of pools) {
        pool.mesh.count = this.#scannedCounts.get(pool.mesh) ?? 0;
        pool.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (this.#scannedStump !== null) {
      for (const pool of this.#scannedStump) {
        pool.mesh.count = this.#scannedCounts.get(pool.mesh) ?? 0;
        pool.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    let groundCoverCount = 0;
    for (const entry of this.#groundCoverMeshes) {
      const count = groundCoverCounts.get(entry.mesh) ?? 0;
      entry.mesh.count = count;
      entry.mesh.instanceMatrix.needsUpdate = true;
      this.#groundCoverInstancesByStyle[entry.style] = count;
      groundCoverCount += count;
    }
    this.#groundCoverInstances = groundCoverCount;
    this.#stumpCount = stumps;
    this.#totalInstances = total;
  }

  // ---------- debris ----------

  #spawnCrown(event: TreeHitEvent): void {
    const mesh = this.#crownMeshes.get(`${event.species}:${event.variant}`);
    if (mesh === undefined) {
      return;
    }
    // The crown carries away the reaction speed from the same impulse that
    // slowed the car (scaled down: the crown's centre moves slower than the
    // trunk tip speed the reaction is stated at).
    const push = event.reactionSpeed * 0.48;
    this.#pieces.push({
      mesh,
      position: new Vector3(event.x, event.y + SNAP_HEIGHT * event.scale, event.z),
      velocity: new Vector3(
        event.dirX * push,
        1.25 + event.reactionSpeed * 0.05,
        event.dirZ * push,
      ),
      quaternion: new Quaternion().setFromAxisAngle(UP, event.rotationY),
      angular: new Vector3(event.dirZ, 0.4, -event.dirX).multiplyScalar(
        1.1 + event.reactionSpeed * 0.12 + Math.random() * 1.4,
      ),
      scale: event.scale,
      age: 0,
      grounded: false,
    });
  }

  #spawnShards(event: TreeHitEvent): void {
    const leafKind: ShardKind = event.species === 'sakura' ? 'blossom' : 'leaf';
    for (let index = 0; index < 13; index += 1) {
      const kind: ShardKind = index < 5 ? 'wood' : leafKind;
      const mesh = this.#shardMeshes.get(kind)!;
      const angle = Math.random() * Math.PI * 2;
      const radial = 1 + Math.random() * 3.2;
      this.#pieces.push({
        mesh,
        position: new Vector3(
          event.x + Math.cos(angle) * 0.3,
          event.y + 0.8 + Math.random() * 2.4,
          event.z + Math.sin(angle) * 0.3,
        ),
        velocity: new Vector3(
          Math.cos(angle) * radial + event.dirX * event.reactionSpeed * 0.5,
          2 + event.reactionSpeed * 0.16 + Math.random() * 3,
          Math.sin(angle) * radial + event.dirZ * event.reactionSpeed * 0.5,
        ),
        quaternion: new Quaternion().setFromAxisAngle(
          new Vector3(Math.random(), Math.random(), Math.random()).normalize(),
          Math.random() * Math.PI,
        ),
        angular: new Vector3(
          (Math.random() - 0.5) * 11,
          (Math.random() - 0.5) * 11,
          (Math.random() - 0.5) * 11,
        ),
        scale: (0.7 + Math.random() * 0.8) * Math.min(1.4, event.scale),
        age: 0,
        grounded: false,
      });
    }
  }

  #tick(deltaSeconds: number): void {
    if (deltaSeconds <= 0) {
      return;
    }
    const dt = Math.min(deltaSeconds, 0.05);
    const dummy = new Object3D();

    // Bent trees: a damped spring into their lean, with overshoot (the crackle
    // settle). Only the handful of animating trees pay per-frame matrix writes.
    for (const [key, anim] of this.#bentAnims) {
      const target = this.#instanceByKey.get(key);
      const placement = this.#placementByKey.get(key);
      if (target === undefined || placement === undefined) {
        this.#bentAnims.delete(key);
        continue;
      }
      const acceleration = (anim.target - anim.angle) * 26 - anim.velocity * 7;
      anim.velocity += acceleration * dt;
      anim.angle = Math.max(0, anim.angle + anim.velocity * dt);
      this.#writeMatrix(
        target.mesh,
        target.index,
        placement,
        { angle: anim.angle, dirX: anim.dirX, dirZ: anim.dirZ },
        dummy,
      );
      target.mesh.instanceMatrix.needsUpdate = true;
      if (Math.abs(anim.target - anim.angle) < 0.002 && Math.abs(anim.velocity) < 0.01) {
        this.#bentAnims.delete(key);
      }
    }

    if (this.#pieces.length === 0) {
      return;
    }
    const lifetime = TREE_COLLISION.debrisLifetimeSeconds;
    const survivors: DebrisPiece[] = [];
    const perMesh = new Map<InstancedMesh, number>();
    for (const piece of this.#pieces) {
      piece.age += dt;
      if (piece.age >= lifetime) {
        continue;
      }
      if (!piece.grounded) {
        piece.velocity.y -= 9.81 * dt;
        piece.position.addScaledVector(piece.velocity, dt);
        // q' = q + 0.5 * (omega, 0) * q
        const spin = new Quaternion(
          piece.angular.x * dt * 0.5,
          piece.angular.y * dt * 0.5,
          piece.angular.z * dt * 0.5,
          0,
        ).multiply(piece.quaternion);
        piece.quaternion
          .set(
            piece.quaternion.x + spin.x,
            piece.quaternion.y + spin.y,
            piece.quaternion.z + spin.z,
            piece.quaternion.w + spin.w,
          )
          .normalize();
        const groundY = this.#sampler.heightAt(piece.position.x, piece.position.z) + 0.12;
        if (piece.position.y <= groundY) {
          piece.position.y = groundY;
          if (Math.abs(piece.velocity.y) > 1.1) {
            piece.velocity.y = -piece.velocity.y * 0.3;
            piece.velocity.x *= 0.62;
            piece.velocity.z *= 0.62;
            piece.angular.multiplyScalar(0.5);
          } else {
            piece.grounded = true;
            piece.velocity.set(0, 0, 0);
          }
        }
      } else {
        piece.angular.multiplyScalar(Math.pow(0.02, dt));
      }
      const shrink = piece.age > lifetime - 1.5 ? Math.max(0, (lifetime - piece.age) / 1.5) : 1;
      const index = perMesh.get(piece.mesh) ?? 0;
      if (index < piece.mesh.instanceMatrix.count) {
        dummy.position.copy(piece.position);
        dummy.quaternion.copy(piece.quaternion);
        dummy.scale.setScalar(piece.scale * shrink);
        dummy.updateMatrix();
        piece.mesh.setMatrixAt(index, dummy.matrix);
        perMesh.set(piece.mesh, index + 1);
      }
      survivors.push(piece);
    }
    this.#pieces = survivors;
    for (const mesh of new Set([...this.#crownMeshes.values(), ...this.#shardMeshes.values()])) {
      mesh.count = perMesh.get(mesh) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  getContentStats(): Readonly<Record<string, number>> {
    let bent = 0;
    let snapped = 0;
    let shattered = 0;
    for (const state of this.#states.values()) {
      if (state.condition === 'bent') bent += 1;
      else if (state.condition === 'snapped') snapped += 1;
      else if (state.condition === 'shattered') shattered += 1;
    }
    return {
      vegetationInstances: this.#totalInstances,
      groundCoverInstances: this.#groundCoverInstances,
      groundCoverInstanceBudget: GROUND_COVER_CONFIG.instanceBudgetByTier[this.#tier],
      groundCoverStylePools: this.#groundCoverMeshes.length,
      groundCoverGrassInstances: this.#groundCoverInstancesByStyle.grass,
      groundCoverFernInstances: this.#groundCoverInstancesByStyle.fern,
      groundCoverWildflowerInstances: this.#groundCoverInstancesByStyle.wildflower,
      groundCoverStoneInstances: this.#groundCoverInstancesByStyle.stone,
      groundCoverGrassBudget: GROUND_COVER_CONFIG.styleInstanceBudgetByTier[this.#tier].grass,
      groundCoverFernBudget: GROUND_COVER_CONFIG.styleInstanceBudgetByTier[this.#tier].fern,
      groundCoverWildflowerBudget:
        GROUND_COVER_CONFIG.styleInstanceBudgetByTier[this.#tier].wildflower,
      groundCoverStoneBudget: GROUND_COVER_CONFIG.styleInstanceBudgetByTier[this.#tier].stone,
      vegetationWindAmplitudeMeters: resolveFoliageWindAmplitude(this.#tier),
      vegetationChunks: this.#chunkPlacements.size,
      vegetationChunksDesired: (2 * this.#config.radiusChunks + 1) ** 2,
      vegetationChunksPending: Math.max(
        0,
        (2 * this.#config.radiusChunks + 1) ** 2 - this.#chunkPlacements.size,
      ),
      vegetationChunksGenerated: this.#generatedChunks,
      vegetationChunkBuildBudgetPerFrame: VEGETATION_CHUNK_GENERATION_BUDGET_PER_FRAME[this.#tier],
      vegetationBent: bent,
      vegetationSnapped: snapped,
      vegetationShattered: shattered,
      vegetationStumps: this.#stumpCount,
      vegetationDebris: this.#pieces.length,
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
    for (const mesh of this.#crownMeshes.values()) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    for (const mesh of this.#shardMeshes.values()) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    for (const entry of this.#groundCoverMeshes) {
      entry.mesh.geometry.dispose();
      entry.mesh.dispose();
    }
    this.#groundCoverMaterial.dispose();
    if (this.#stumpMesh !== null) {
      this.#stumpMesh.geometry.dispose();
      this.#stumpMesh.dispose();
    }
    const scannedGeometries = new Set<BufferGeometry>();
    const scannedMaterials = new Set<Material>();
    for (const mesh of this.#scannedCounts.keys()) {
      scannedGeometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        scannedMaterials.add(material);
      }
      mesh.dispose();
    }
    for (const geometry of scannedGeometries) {
      geometry.dispose();
    }
    for (const material of scannedMaterials) {
      material.dispose();
    }
    this.#sharedMaterial.dispose();
    this.root.removeFromParent();
  }
}
