import { BoxGeometry, Group, InstancedMesh, Object3D, type BufferGeometry } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { URBAN_FACADE_KIT_TIER_BUDGET } from '../config/urban-city';
import type { TierId } from '../config/tiers';
import { createArchitecturalMaterial } from './architectural-materials';

/**
 * Phase 8.1 — Aohara facade kit.
 *
 * The city shell is deliberately instanced unit geometry, so the previous look was "big boxes"
 * with sparse budgeted cornices. This module adds the architectural character that reads at
 * driving speed — balconies, mansion verandas, brick chimneys, vintage eave/shutter kits,
 * modern curtain-wall fins and glass bands, and shopfront awnings — without new draw passes per
 * building: every element type is one merged low-poly geometry in one InstancedMesh, placed
 * deterministically from the same building references the shells use, and capped per tier.
 *
 * Elements protrude at most ~1.3 m from a wall face and sit above the car body height where
 * relevant, so the existing static building colliders (which bound the shell) remain the single
 * collision authority. No new physics, lights, or texture assets are introduced.
 */

export type FacadeKitElement =
  'balcony' | 'veranda' | 'chimney' | 'eave-trim' | 'curtain-fin' | 'glass-band' | 'awning';

/** Mirrors `CityBuildingKind` in `urban-night.ts`; kept structural to avoid an import cycle. */
export type FacadeKitBuildingKind =
  'house' | 'townhouse' | 'mansion' | 'shop' | 'casino' | 'infill' | 'frontage';

/** Building reference in city-local coordinates, compatible with the night-world building specs. */
export interface FacadeKitBuildingRef {
  readonly kind: FacadeKitBuildingKind;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly roofStyle?: 'flat' | 'hipped';
  readonly yaw?: number;
  readonly frontage?: boolean;
}

/** Tower reference in city-local coordinates, compatible with the night-world tower specs. */
export interface FacadeKitTowerRef {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export interface FacadeKitPlacement {
  readonly element: FacadeKitElement;
  /** Index into the buildings array, or -1 for tower-derived elements (tower index stored in `towerIndex`). */
  readonly buildingIndex: number;
  readonly towerIndex?: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: readonly [number, number, number];
}

/** Wall base in city-local space; matches the urban world deck base (`-0.55` in `urban-night.ts`). */
export const FACADE_KIT_BASE_Y = -0.55;

function stableUnit(a: number, b: number, salt: number): number {
  let value = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ Math.imul(b + salt, 0xc2b2ae35), 0x27d4eb2f);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0x1_0000_0000;
}

function hasPitchedRoof(building: FacadeKitBuildingRef): boolean {
  return (
    building.roofStyle === 'hipped' ||
    (building.roofStyle === undefined && (building.kind === 'house' || building.kind === 'mansion'))
  );
}

/** Local +Z offset rotated into world space by the building yaw. */
function frontOffset(yaw: number, distance: number): readonly [number, number] {
  return [Math.sin(yaw) * distance, Math.cos(yaw) * distance];
}

interface ElementCandidate {
  readonly placement: FacadeKitPlacement;
  readonly rank: number;
}

function residential(building: FacadeKitBuildingRef): boolean {
  return (
    building.kind === 'house' ||
    building.kind === 'townhouse' ||
    building.kind === 'mansion' ||
    building.kind === 'infill'
  );
}

/**
 * Deterministic per-tier placement set for every facade-kit element. Buildings are iterated in
 * caller order (which is deterministic per network state), towers likewise, and each element
 * keeps only its highest-ranked candidates up to the tier budget.
 */
export function generateFacadeKitPlacements(
  tier: TierId,
  buildings: readonly FacadeKitBuildingRef[],
  towers: readonly FacadeKitTowerRef[],
): readonly FacadeKitPlacement[] {
  const budget = URBAN_FACADE_KIT_TIER_BUDGET[tier];
  const candidates: Record<FacadeKitElement, ElementCandidate[]> = {
    balcony: [],
    veranda: [],
    chimney: [],
    'eave-trim': [],
    'curtain-fin': [],
    'glass-band': [],
    awning: [],
  };

  buildings.forEach((building, buildingIndex) => {
    const yaw = building.yaw ?? 0;
    const frontDistance = building.depth / 2 + 0.4;
    const [fx, fz] = frontOffset(yaw, frontDistance);
    const frontX = building.x + fx;
    const frontZ = building.z + fz;

    // Balcony: second (or third) floor of any residential shell tall enough for two storeys.
    if (
      residential(building) &&
      building.height >= 6.0 &&
      stableUnit(buildingIndex, 31, 977) < 0.8
    ) {
      const floorY = building.height < 9.5 ? 2.85 : 5.7;
      const slabWidth = Math.min(2.6, Math.max(1.8, building.width * 0.55));
      candidates.balcony.push({
        rank: stableUnit(buildingIndex, 32, 979),
        placement: {
          element: 'balcony',
          buildingIndex,
          x: frontX,
          y: FACADE_KIT_BASE_Y + floorY,
          z: frontZ,
          yaw,
          scale: [slabWidth / 2.2, 1, 1],
        },
      });
    }

    // Veranda (engawa): ground-floor porch for mansions and most houses.
    if (building.height >= 5.0) {
      const eligible =
        building.kind === 'mansion' ||
        (building.kind === 'house' && stableUnit(buildingIndex, 33, 983) < 0.55);
      if (eligible) {
        const porchWidth = Math.min(3.4, Math.max(2.2, building.width * 0.7));
        const [vx, vz] = frontOffset(yaw, building.depth / 2 + 0.55);
        candidates.veranda.push({
          rank: stableUnit(buildingIndex, 34, 991),
          placement: {
            element: 'veranda',
            buildingIndex,
            x: building.x + vx,
            y: FACADE_KIT_BASE_Y,
            z: building.z + vz,
            yaw,
            scale: [porchWidth / 3.0, 1, 1],
          },
        });
      }
    }

    // Chimney: on pitched roofs, set back on the shoulder slope so it clears the ridge line.
    if (hasPitchedRoof(building) && building.height <= 13) {
      const cx = Math.cos(yaw);
      const sx = Math.sin(yaw);
      candidates.chimney.push({
        rank: stableUnit(buildingIndex, 35, 1009),
        placement: {
          element: 'chimney',
          buildingIndex,
          x: building.x + cx * building.width * 0.35 + sx * building.depth * 0.1,
          y: FACADE_KIT_BASE_Y + building.height + 0.55,
          z: building.z - sx * building.width * 0.35 + cx * building.depth * 0.1,
          yaw,
          scale: [1, 1, 1],
        },
      });
    }

    // Vintage eave kit: door hood, posts and louver shutters for small pitched houses.
    if (
      building.kind === 'house' &&
      !building.frontage &&
      hasPitchedRoof(building) &&
      building.height < 10 &&
      stableUnit(buildingIndex, 36, 1013) < 0.75
    ) {
      const [ex, ez] = frontOffset(yaw, building.depth / 2 + 0.32);
      candidates['eave-trim'].push({
        rank: stableUnit(buildingIndex, 37, 1019),
        placement: {
          element: 'eave-trim',
          buildingIndex,
          x: building.x + ex,
          y: FACADE_KIT_BASE_Y,
          z: building.z + ez,
          yaw,
          scale: [Math.min(5.6, Math.max(3.4, building.width)) / 3.4, 1, 1],
        },
      });
    }

    // Shopfront awning + sign band: ground-floor commerce on shops and perimeter frontages.
    if (
      (building.kind === 'shop' || building.kind === 'frontage') &&
      building.height >= 5.2 &&
      stableUnit(buildingIndex, 38, 1021) < 0.85
    ) {
      const [ax, az] = frontOffset(yaw, building.depth / 2 + 0.42);
      candidates.awning.push({
        rank: stableUnit(buildingIndex, 39, 1027),
        placement: {
          element: 'awning',
          buildingIndex,
          x: building.x + ax,
          y: FACADE_KIT_BASE_Y,
          z: building.z + az,
          yaw,
          scale: [Math.min(4.6, Math.max(2.4, building.width)) / 2.4, 1, 1],
        },
      });
    }
  });

  towers.forEach((tower, towerIndex) => {
    // Curtain-wall fins wrap the four corners and the front/back centrelines of every
    // high-rise. Corner fins sit on the face line; centre fins stand 0.05 m proud along the
    // face normal so the 0.22 m section reads as a mullion against the glass.
    const finFaces: {
      readonly dx: number;
      readonly dz: number;
      readonly normalX: number;
      readonly normalZ: number;
    }[] = [
      { dx: -tower.width / 2, dz: -tower.depth / 2, normalX: 0, normalZ: 0 },
      { dx: tower.width / 2, dz: -tower.depth / 2, normalX: 0, normalZ: 0 },
      { dx: -tower.width / 2, dz: tower.depth / 2, normalX: 0, normalZ: 0 },
      { dx: tower.width / 2, dz: tower.depth / 2, normalX: 0, normalZ: 0 },
      { dx: 0, dz: -tower.depth / 2, normalX: 0, normalZ: -1 },
      { dx: 0, dz: tower.depth / 2, normalX: 0, normalZ: 1 },
    ];
    for (const face of finFaces) {
      const offset = face.normalX !== 0 || face.normalZ !== 0 ? 0.05 : 0;
      candidates['curtain-fin'].push({
        rank: stableUnit(
          towerIndex * 17 + Math.round((tower.x + face.dx) * 10),
          Math.round((tower.z + face.dz) * 10),
          1031,
        ),
        placement: {
          element: 'curtain-fin',
          buildingIndex: -1,
          towerIndex,
          x: tower.x + face.dx + face.normalX * offset,
          y: FACADE_KIT_BASE_Y + tower.height / 2,
          z: tower.z + face.dz + face.normalZ * offset,
          yaw: 0,
          scale: [1, tower.height, 1],
        },
      });
    }
    // Crown glass band marks the curtain-wall head against the rooftop.
    candidates['glass-band'].push({
      rank: stableUnit(towerIndex, 41, 1033),
      placement: {
        element: 'glass-band',
        buildingIndex: -1,
        towerIndex,
        x: tower.x,
        y: FACADE_KIT_BASE_Y + tower.height - 2.2,
        z: tower.z,
        yaw: 0,
        scale: [tower.width + 0.12, 1.3, tower.depth + 0.12],
      },
    });
  });

  const placements: FacadeKitPlacement[] = [];
  const capFor: Readonly<Record<FacadeKitElement, number>> = {
    balcony: budget.balconies,
    veranda: budget.verandas,
    chimney: budget.chimneys,
    'eave-trim': budget.eaveTrims,
    'curtain-fin': budget.curtainFins,
    'glass-band': budget.glassBands,
    awning: budget.awnings,
  };
  for (const element of Object.keys(candidates) as FacadeKitElement[]) {
    const ranked = [...candidates[element]].sort(
      (a, b) => a.rank - b.rank || a.placement.buildingIndex - b.placement.buildingIndex,
    );
    for (const { placement } of ranked.slice(0, capFor[element])) {
      placements.push(placement);
    }
  }
  return placements;
}

function boxPart(
  dimensions: readonly [number, number, number],
  position: readonly [number, number, number],
  rotateX = 0,
): BufferGeometry {
  const geometry = new BoxGeometry(...dimensions);
  if (rotateX !== 0) geometry.rotateX(rotateX);
  geometry.translate(...position);
  return geometry;
}

/** Merged low-poly kit geometry per element; local +Z is the wall face, +Y is up. */
function mergedKitGeometry(element: FacadeKitElement): BufferGeometry {
  let parts: BufferGeometry[];
  switch (element) {
    case 'balcony':
      parts = [
        boxPart([2.2, 0.14, 0.8], [0, 0, 0]),
        boxPart([2.2, 0.05, 0.05], [0, 1.0, 0.375]),
        boxPart([0.05, 1.0, 0.8], [-1.075, 0.5, 0]),
        boxPart([0.05, 1.0, 0.8], [1.075, 0.5, 0]),
        boxPart([0.045, 0.95, 0.045], [-0.7, 0.475, 0.36]),
        boxPart([0.045, 0.95, 0.045], [0, 0.475, 0.36]),
        boxPart([0.045, 0.95, 0.045], [0.7, 0.475, 0.36]),
        boxPart([0.55, 0.42, 0.3], [0.7, 0.28, -0.15]),
      ];
      break;
    case 'veranda':
      parts = [
        boxPart([3.0, 0.16, 1.1], [0, 0.22, 0.55]),
        boxPart([0.11, 2.6, 0.11], [-1.35, 1.4, 0.98]),
        boxPart([0.11, 2.6, 0.11], [1.35, 1.4, 0.98]),
        boxPart([0.11, 2.6, 0.11], [-1.35, 1.4, 0.12]),
        boxPart([0.11, 2.6, 0.11], [1.35, 1.4, 0.12]),
        boxPart([3.0, 0.06, 0.06], [0, 0.95, 1.05]),
        boxPart([2.4, 0.1, 0.3], [0, 0.05, 1.25]),
      ];
      break;
    case 'chimney':
      parts = [
        boxPart([0.52, 1.7, 0.52], [0, 0.85, 0]),
        boxPart([0.66, 0.1, 0.66], [0, 1.75, 0]),
        boxPart([0.3, 0.18, 0.3], [0, 1.87, 0]),
      ];
      break;
    case 'eave-trim':
      parts = [
        boxPart([1.3, 0.12, 0.6], [0, 2.3, 0.3]),
        boxPart([0.05, 2.3, 0.05], [-0.55, 1.15, 0.55]),
        boxPart([0.05, 2.3, 0.05], [0.55, 1.15, 0.55]),
        boxPart([0.42, 1.4, 0.05], [-1.2, 1.5, 0.03]),
        boxPart([0.42, 1.4, 0.05], [1.2, 1.5, 0.03]),
      ];
      break;
    case 'curtain-fin':
      parts = [boxPart([0.16, 1, 0.22], [0, 0, 0])];
      break;
    case 'glass-band':
      parts = [boxPart([1, 1, 1], [0, 0, 0])];
      break;
    case 'awning':
      parts = [
        boxPart([2.4, 0.07, 0.95], [0, 2.7, 0.42], -0.16),
        boxPart([2.4, 0.22, 0.05], [0, 2.6, 0.88]),
        boxPart([0.05, 0.05, 0.5], [-0.9, 2.78, 0.35]),
        boxPart([0.05, 0.05, 0.5], [0.9, 2.78, 0.35]),
        boxPart([2.2, 0.62, 0.07], [0, 3.5, 0.05]),
      ];
      break;
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (merged === null) {
    throw new Error(`could not merge Aohara facade kit geometry: ${element}`);
  }
  merged.name = `aohara-facade-kit-${element}-geometry`;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

const KIT_MATERIALS: Readonly<
  Record<
    FacadeKitElement,
    {
      readonly options: Parameters<typeof createArchitecturalMaterial>[0];
      readonly castShadow: boolean;
    }
  >
> = {
  balcony: {
    options: {
      name: 'aohara-balcony-precast-concrete-pbr',
      colorHex: 0x57626c,
      roughness: 0.6,
      metalness: 0.2,
      detailAmplitude: 0.02,
      clearcoat: 0.15,
      clearcoatRoughness: 0.32,
    },
    castShadow: true,
  },
  veranda: {
    options: {
      name: 'aohara-veranda-cedar-pbr',
      colorHex: 0x6a5340,
      roughness: 0.82,
      metalness: 0.04,
      detailAmplitude: 0.03,
      clearcoat: 0.06,
      clearcoatRoughness: 0.42,
    },
    castShadow: true,
  },
  chimney: {
    options: {
      name: 'aohara-chimney-brick-pbr',
      colorHex: 0x55463f,
      roughness: 0.9,
      metalness: 0.02,
      detailAmplitude: 0.035,
      clearcoat: 0.04,
      clearcoatRoughness: 0.5,
    },
    castShadow: true,
  },
  'eave-trim': {
    options: {
      name: 'aohara-vintage-eave-and-shutter-pbr',
      colorHex: 0x74645a,
      roughness: 0.78,
      metalness: 0.05,
      detailAmplitude: 0.028,
      clearcoat: 0.08,
      clearcoatRoughness: 0.4,
    },
    castShadow: true,
  },
  'curtain-fin': {
    options: {
      name: 'aohara-curtain-wall-aluminum-fin-pbr',
      colorHex: 0x3d4750,
      roughness: 0.42,
      metalness: 0.55,
      detailAmplitude: 0.012,
      clearcoat: 0.3,
      clearcoatRoughness: 0.22,
    },
    castShadow: false,
  },
  'glass-band': {
    options: {
      name: 'aohara-curtain-wall-glass-band-pbr',
      colorHex: 0x18242e,
      roughness: 0.18,
      metalness: 0.3,
      detailAmplitude: 0.01,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
    },
    castShadow: false,
  },
  awning: {
    options: {
      name: 'aohara-shopfront-awning-and-sign-pbr',
      colorHex: 0x4a4f58,
      roughness: 0.66,
      metalness: 0.12,
      detailAmplitude: 0.024,
      clearcoat: 0.18,
      clearcoatRoughness: 0.34,
    },
    castShadow: true,
  },
};

const KIT_ELEMENTS: readonly FacadeKitElement[] = [
  'balcony',
  'veranda',
  'chimney',
  'eave-trim',
  'curtain-fin',
  'glass-band',
  'awning',
];

/** Tier-bounded instanced facade-kit content; one batch per element kind, deterministic per city. */
export class FacadeKitWorld {
  readonly root = new Group();
  readonly placements: readonly FacadeKitPlacement[];
  readonly #meshes: InstancedMesh[] = [];
  readonly #geometries: BufferGeometry[] = [];
  readonly #materials: MeshPhysicalNodeMaterial[] = [];
  readonly #stats: Readonly<Record<string, number>>;
  #disposed = false;

  constructor(
    tier: TierId,
    buildings: readonly FacadeKitBuildingRef[],
    towers: readonly FacadeKitTowerRef[],
    origin: readonly [number, number, number],
  ) {
    this.root.name = 'aohara-facade-kit';
    this.placements = generateFacadeKitPlacements(tier, buildings, towers);
    const originX = origin[0];
    const originZ = origin[2];
    const counts: Record<FacadeKitElement, number> = {
      balcony: 0,
      veranda: 0,
      chimney: 0,
      'eave-trim': 0,
      'curtain-fin': 0,
      'glass-band': 0,
      awning: 0,
    };

    for (const element of KIT_ELEMENTS) {
      const instances = this.placements.filter((placement) => placement.element === element);
      if (instances.length === 0) continue;
      const geometry = mergedKitGeometry(element);
      const material = createArchitecturalMaterial(KIT_MATERIALS[element].options);
      const mesh = new InstancedMesh(geometry, material, instances.length);
      mesh.name = `aohara-facade-kit-${element}`;
      mesh.frustumCulled = false;
      mesh.castShadow = KIT_MATERIALS[element].castShadow;
      mesh.receiveShadow = true;
      const transform = new Object3D();
      instances.forEach((placement, index) => {
        transform.position.set(placement.x - originX, placement.y, placement.z - originZ);
        transform.rotation.set(0, placement.yaw, 0);
        transform.scale.set(...placement.scale);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
      this.#meshes.push(mesh);
      this.#geometries.push(geometry);
      this.#materials.push(material);
      counts[element] = instances.length;
    }

    this.#stats = {
      facadeKitBalconies: counts.balcony,
      facadeKitVerandas: counts.veranda,
      facadeKitChimneys: counts.chimney,
      facadeKitEaveTrims: counts['eave-trim'],
      facadeKitCurtainFins: counts['curtain-fin'],
      facadeKitGlassBands: counts['glass-band'],
      facadeKitAwnings: counts.awning,
      facadeKitBatches: this.#meshes.length,
      facadeKitBudgetBalconies: URBAN_FACADE_KIT_TIER_BUDGET[tier].balconies,
      facadeKitBudgetCurtainFins: URBAN_FACADE_KIT_TIER_BUDGET[tier].curtainFins,
    };
  }

  getContentStats(): Readonly<Record<string, number>> {
    return this.#stats;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const mesh of this.#meshes) mesh.dispose();
    for (const geometry of this.#geometries) geometry.dispose();
    for (const material of this.#materials) material.dispose();
    this.root.removeFromParent();
  }
}
