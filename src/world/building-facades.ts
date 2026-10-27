import { BoxGeometry, Group, InstancedMesh, Object3D, type BufferGeometry } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { URBAN_FACADE_KIT_TIER_BUDGET } from '../config/urban-city';
import type { TierId } from '../config/tiers';
import { createArchitecturalMaterial } from './architectural-materials';

/**
 * Phase 8.1 — Aohara facade kit (densified in Phase 8.3).
 *
 * The city shell is deliberately instanced unit geometry, so the previous look was "big boxes"
 * with sparse budgeted cornices. This module adds the architectural character that reads at
 * driving speed — balconies, mansion verandas, brick chimneys, vintage eave/shutter kits,
 * modern curtain-wall fins and glass bands, and shopfront awnings — without new draw passes per
 * building: every element type is one merged low-poly geometry in one InstancedMesh, placed
 * deterministically from the same building references the shells use, and capped per tier.
 *
 * Phase 8.3 (owner verdict: "still looks like big boxes") corrects and densifies. The
 * block-perimeter shells (`frontage`/`shop`) are 20 m long along the street and 8.5 m deep, and
 * their street-facing side is a local ±X face — the 8.1 front elements landed on the local +Z
 * face (the alley-adjacent side), leaving the road-facing facades bare. Every street-facing
 * element now targets the true street face. The caps were raised so most eligible buildings are
 * dressed, and three dense rhythm elements were added: per-floor slab reveals across the street
 * facade (the strongest anti-box read), dark corner reveals at the two street corners, and
 * rooftop mechanical penthouses on flat roofs.
 *
 * Phase 8.3b (second owner verdict: still boxes — the 8.3 rhythm was optically too faint at
 * driving distance at night) makes the rhythm bold and adds two-tone massing: the slab lines
 * move to the true 2.6 m window-floor rhythm and thicken to 0.34 m, corner pilasters widen to
 * 0.3 m, penthouses grow, balcony budgets triple, and two full-face cladding bands split every
 * street facade into base / body / crown (dark stone ground floor behind the glazing plane,
 * light parapet crown) — the tonal contrast carries the read at 30 m in the night mood.
 *
 * Phase 8.3d (fourth owner verdict: "still boxes with little square boxes on them") removes
 * the box-on-box read the penthouses created and gives the wall itself the texture a building
 * reads with at night: dark shopfront glazing units line the street face ground level (the
 * closest, previously blank zone; the lit subset is added by the night world as emissive
 * storefront bands), and slim antenna masts replace the penthouse volumes on flat roofs. The
 * companion change in `urban-night.ts` widens the window grid to 1.9 x 1.7 m, starts the
 * window rows above the shopfronts, and selects lit windows by per-building occupancy so some
 * blocks glow while others sit dark.
 *
 * Elements protrude at most ~1.3 m from a wall face and sit above the car body height where
 * relevant, so the existing static building colliders (which bound the shell) remain the single
 * collision authority. No new physics, lights, or texture assets are introduced.
 */

export type FacadeKitElement =
  | 'balcony'
  | 'veranda'
  | 'chimney'
  | 'eave-trim'
  | 'curtain-fin'
  | 'glass-band'
  | 'awning'
  | 'floor-band'
  | 'corner-reveal'
  | 'mast'
  | 'storefront-glazing'
  | 'ground-cladding'
  | 'crown-cladding';

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
  /**
   * Phase 8.3e massing: a full-footprint base volume up to `baseHeight` with the upper volume
   * set back from the street face (and possibly one or both other faces).
   */
  readonly massing?: BuildingMassingRef;
}

/** Setback massing, relative to the building footprint: insets are [+X street, -X, +Z, -Z]. */
export interface BuildingMassingRef {
  readonly baseHeight: number;
  readonly insets: readonly [number, number, number, number];
}

/**
 * The upper volume of a set-back building: the footprint minus the face insets, shifted so the
 * insets open toward the street face. Null when the building is a single volume.
 */
export function upperVolumeOf(ref: {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly massing?: BuildingMassingRef;
}): {
  readonly localX: number;
  readonly localZ: number;
  readonly width: number;
  readonly depth: number;
} | null {
  const { massing } = ref;
  // Phase 8.3f: 1.8 m threshold — under the 2.6 m floor rhythm most mids (10 m+) mass too.
  if (massing === undefined || ref.height - massing.baseHeight < 1.8) return null;
  const [streetInset, alleyInset, plusZInset, minusZInset] = massing.insets;
  const width = ref.width - streetInset - alleyInset;
  const depth = ref.depth - plusZInset - minusZInset;
  if (width < 3.5 || depth < 4.5) return null;
  return {
    localX: (alleyInset - streetInset) / 2,
    localZ: (minusZInset - plusZInset) / 2,
    width,
    depth,
  };
}

/** Tower reference in city-local coordinates, compatible with the night-world tower specs. */
export interface FacadeKitTowerRef {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** Phase 8.3f: centred set-back crown on top of the tower body. */
  readonly crown?: { readonly width: number; readonly depth: number; readonly height: number };
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

/**
 * The street-facing face of a building, as local-axis signs. Block-perimeter shells
 * (`frontage`/`shop`) are authored 20 m long along the street and 8.5 m deep, with their yaw
 * rotating the local +X axis radially outward from the block — so for all four block sides the
 * road-facing face is local +X (the window builder uses the same convention: its local +X
 * side spans `building.depth`). Every other kind keeps the 8.1 local +Z front (standalone
 * houses, mansions, townhouses, infill).
 */
export function streetFrontSigns(building: FacadeKitBuildingRef): {
  readonly lx: number;
  readonly lz: number;
} {
  if (building.kind === 'frontage' || building.kind === 'shop') {
    return { lx: 1, lz: 0 };
  }
  return { lx: 0, lz: 1 };
}

/**
 * World placement of a wall-face element: the face centre pushed `protrude` along the face
 * normal, the element yaw (kit elements face the wall along their local +Z), and the face's
 * horizontal extent (for scaling full-width elements like floor bands).
 */
function facePlacement(
  building: FacadeKitBuildingRef,
  signs: { readonly lx: number; readonly lz: number },
  protrude: number,
): {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly length: number;
} {
  const { lx, lz } = signs;
  const yaw = building.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  if (lz !== 0) {
    // Local ±Z face: extent runs along local X, normal along local ±Z.
    const distance = building.depth / 2 + protrude;
    return {
      x: building.x + sin * distance * lz,
      z: building.z + cos * distance * lz,
      yaw: lz > 0 ? yaw : yaw + Math.PI,
      length: building.width,
    };
  }
  // Local ±X face: extent runs along local Z, normal along local ±X.
  const distance = building.width / 2 + protrude;
  const normalX = cos * lx;
  const normalZ = -sin * lx;
  return {
    x: building.x + normalX * distance,
    z: building.z + normalZ * distance,
    // Element local +Z must point along the face normal: (sin θ, cos θ) = (normalX, normalZ).
    yaw: lx > 0 ? yaw + Math.PI / 2 : yaw + (3 * Math.PI) / 2,
    length: building.depth,
  };
}

/** Placement on the building's street face (the face the commerce elements dress). */
function streetFacePlacement(building: FacadeKitBuildingRef, protrude: number) {
  return facePlacement(building, streetFrontSigns(building), protrude);
}

/** Placement on the set-back upper volume's wall face (Phase 8.3e massing). */
function upperFacePlacement(
  building: FacadeKitBuildingRef,
  upper: {
    readonly localX: number;
    readonly localZ: number;
    readonly width: number;
    readonly depth: number;
  },
  signs: { readonly lx: number; readonly lz: number },
  protrude: number,
): { readonly x: number; readonly z: number; readonly yaw: number; readonly length: number } {
  const { lx, lz } = signs;
  const yaw = building.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const centerX = building.x + cos * upper.localX + sin * upper.localZ;
  const centerZ = building.z - sin * upper.localX + cos * upper.localZ;
  if (lz !== 0) {
    const distance = upper.depth / 2 + protrude;
    return {
      x: centerX + sin * distance * lz,
      z: centerZ + cos * distance * lz,
      yaw: lz > 0 ? yaw : yaw + Math.PI,
      length: upper.width,
    };
  }
  const distance = upper.width / 2 + protrude;
  const normalX = cos * lx;
  const normalZ = -sin * lx;
  return {
    x: centerX + normalX * distance,
    z: centerZ + normalZ * distance,
    yaw: lx > 0 ? yaw + Math.PI / 2 : yaw + (3 * Math.PI) / 2,
    length: upper.depth,
  };
}

/** All four wall faces; the rhythm elements (bands, corners, cladding) dress every one. */
const ALL_FACES: ReadonlyArray<{ readonly lx: number; readonly lz: number }> = [
  { lx: 1, lz: 0 },
  { lx: -1, lz: 0 },
  { lx: 0, lz: 1 },
  { lx: 0, lz: -1 },
];

/** The four unique building corners (each belongs to two faces; deduped for corner strips). */
const ALL_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

interface ElementCandidate {
  readonly placement: FacadeKitPlacement;
  readonly rank: number;
  /** Selected before non-priority candidates when the tier budget is tighter than the pool. */
  readonly priority?: boolean;
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
    'floor-band': [],
    'corner-reveal': [],
    mast: [],
    'storefront-glazing': [],
    'ground-cladding': [],
    'crown-cladding': [],
  };

  buildings.forEach((building, buildingIndex) => {
    const yaw = building.yaw ?? 0;
    // Phase 8.3e: set-back massing — the rhythm elements follow the two volumes (the full
    // podium and the set-back upper volume) instead of one imaginary box face.
    const upper = upperVolumeOf(building);
    const baseHeight = upper !== null ? building.massing!.baseHeight : building.height;
    // Phase 8.3: every street-facing element lands on the true street face. Block-perimeter
    // shells (frontage/shop) face the road across their local ±X side; standalone kinds keep
    // the 8.1 local +Z front, so their placements are byte-identical to 8.1.
    const faceBalcony = streetFacePlacement(building, 0.4);
    const faceVeranda = streetFacePlacement(building, 0.55);
    const faceEave = streetFacePlacement(building, 0.32);
    const faceAwning = streetFacePlacement(building, 0.42);

    // Balcony: stacked slabs (second/third/fourth floor) on residential shells. Phase 8.3f:
    // slabs above the podium step sit on the set-back upper face — never in mid-air over the
    // terrace.
    if (residential(building) && building.height >= 6.0) {
      [2.85, 5.7, 8.55].forEach((floorY, slabIndex) => {
        if (floorY + 1.1 > building.height - 0.6) return;
        if (stableUnit(buildingIndex, 31 + slabIndex * 7, 977) >= 0.85) return;
        const face =
          upper !== null && floorY >= baseHeight
            ? upperFacePlacement(building, upper, streetFrontSigns(building), 0.4)
            : faceBalcony;
        const slabWidth = Math.min(
          2.6,
          Math.max(
            1.8,
            (upper !== null && floorY >= baseHeight ? upper.width : building.width) * 0.55,
          ),
        );
        candidates.balcony.push({
          rank: stableUnit(buildingIndex, 32 + slabIndex * 7, 979),
          placement: {
            element: 'balcony',
            buildingIndex,
            x: face.x,
            y: FACADE_KIT_BASE_Y + floorY,
            z: face.z,
            yaw: face.yaw,
            scale: [slabWidth / 2.2, 1, 1],
          },
        });
      });
    }

    // Veranda (engawa): ground-floor porch for mansions and most houses.
    if (building.height >= 5.0) {
      const eligible =
        building.kind === 'mansion' ||
        (building.kind === 'house' && stableUnit(buildingIndex, 33, 983) < 0.55);
      if (eligible) {
        const porchWidth = Math.min(3.4, Math.max(2.2, building.width * 0.7));
        candidates.veranda.push({
          rank: stableUnit(buildingIndex, 34, 991),
          placement: {
            element: 'veranda',
            buildingIndex,
            x: faceVeranda.x,
            y: FACADE_KIT_BASE_Y,
            z: faceVeranda.z,
            yaw: faceVeranda.yaw,
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
      candidates['eave-trim'].push({
        rank: stableUnit(buildingIndex, 37, 1019),
        placement: {
          element: 'eave-trim',
          buildingIndex,
          x: faceEave.x,
          y: FACADE_KIT_BASE_Y,
          z: faceEave.z,
          yaw: faceEave.yaw,
          scale: [Math.min(5.6, Math.max(3.4, building.width)) / 3.4, 1, 1],
        },
      });
    }

    // Shopfront awning + sign band: ground-floor commerce on shops and perimeter frontages.
    // Shops are priority candidates so every shop keeps a canopy at any tier budget.
    if (
      (building.kind === 'shop' || building.kind === 'frontage') &&
      building.height >= 5.2 &&
      stableUnit(buildingIndex, 38, 1021) < 0.85
    ) {
      candidates.awning.push({
        rank: stableUnit(buildingIndex, 39, 1027),
        priority: building.kind === 'shop',
        placement: {
          element: 'awning',
          buildingIndex,
          x: faceAwning.x,
          y: FACADE_KIT_BASE_Y,
          z: faceAwning.z,
          yaw: faceAwning.yaw,
          scale: [Math.min(4.6, Math.max(2.4, faceAwning.length)) / 2.4, 1, 1],
        },
      });
    }

    // Phase 8.3b floor bands (following the 8.3e volumes): per-floor slab lines across every
    // wall, 2.6 m pitch — the strongest anti-box read. The podium faces take the bands up to
    // the step (the last band doubles as the terrace cornice); the set-back upper faces take
    // the bands from the step to the roof.
    for (const faceSigns of ALL_FACES) {
      const baseFace = facePlacement(building, faceSigns, 0.04);
      for (let floor = 0; ; floor += 1) {
        const bandY = 2.97 + 2.6 * floor;
        if (bandY + 0.17 > baseHeight + 0.14) break;
        candidates['floor-band'].push({
          rank: stableUnit(buildingIndex, 2001 + floor * 4 + ALL_FACES.indexOf(faceSigns), 2013),
          placement: {
            element: 'floor-band',
            buildingIndex,
            x: baseFace.x,
            y: FACADE_KIT_BASE_Y + bandY,
            z: baseFace.z,
            yaw: baseFace.yaw,
            scale: [baseFace.length, 1, 1],
          },
        });
      }
      if (upper !== null) {
        const upperFace = upperFacePlacement(building, upper, faceSigns, 0.04);
        for (let floor = 0; ; floor += 1) {
          const bandY = 2.97 + 2.6 * floor;
          if (bandY - 0.17 < baseHeight - 0.14) continue;
          if (bandY + 0.17 > building.height - 0.6) break;
          candidates['floor-band'].push({
            rank: stableUnit(buildingIndex, 2001 + floor * 4 + ALL_FACES.indexOf(faceSigns), 2013),
            placement: {
              element: 'floor-band',
              buildingIndex,
              x: upperFace.x,
              y: FACADE_KIT_BASE_Y + bandY,
              z: upperFace.z,
              yaw: upperFace.yaw,
              scale: [upperFace.length, 1, 1],
            },
          });
        }
      }
    }

    // Phase 8.3 corner reveals: a dark vertical strip at each of the four corners.
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    ALL_CORNERS.forEach(([cornerX, cornerZ], cornerIndex) => {
      // 0.3 m section, outer face 0.03 m proud of the wall, clear of the window margin.
      const localX = cornerX * (building.width / 2 - 0.12);
      const localZ = cornerZ * (building.depth / 2 - 0.12);
      candidates['corner-reveal'].push({
        rank: stableUnit(buildingIndex, 2101 + cornerIndex, 2113),
        placement: {
          element: 'corner-reveal',
          buildingIndex,
          x: building.x + cos * localX + sin * localZ,
          y: FACADE_KIT_BASE_Y,
          z: building.z - sin * localX + cos * localZ,
          yaw,
          // Phase 8.3e: the pilaster follows the podium (full height on single volumes).
          scale: [1, baseHeight + 0.1, 1],
        },
      });
    });

    // Phase 8.3d mast: a slim antenna pole breaks the flat roofline without adding another
    // box on top of the box (the 8.3 penthouses read as exactly that on the owner's drive).
    if (
      !hasPitchedRoof(building) &&
      building.height >= 5 &&
      stableUnit(buildingIndex, 2501, 2503) < 0.45
    ) {
      const mastHeight = 2.5 + stableUnit(buildingIndex, 2507, 2509) * 3.5;
      // Phase 8.3e: the mast stands on the upper volume's roof when the building is set back.
      const mastCos = Math.cos(yaw);
      const mastSin = Math.sin(yaw);
      const mastCenterX =
        upper !== null ? building.x + mastCos * upper.localX + mastSin * upper.localZ : building.x;
      const mastCenterZ =
        upper !== null ? building.z - mastSin * upper.localX + mastCos * upper.localZ : building.z;
      const mastWidth = upper !== null ? upper.width : building.width;
      const mastDepth = upper !== null ? upper.depth : building.depth;
      const offsetU = stableUnit(buildingIndex, 2201, 2209) - 0.5;
      const offsetV = stableUnit(buildingIndex, 2202, 2211) - 0.5;
      candidates.mast.push({
        rank: stableUnit(buildingIndex, 2511, 2513),
        placement: {
          element: 'mast',
          buildingIndex,
          x:
            mastCenterX + mastCos * offsetU * mastWidth * 0.3 + mastSin * offsetV * mastDepth * 0.3,
          y: FACADE_KIT_BASE_Y + building.height,
          z:
            mastCenterZ - mastSin * offsetU * mastWidth * 0.3 + mastCos * offsetV * mastDepth * 0.3,
          yaw,
          scale: [1, mastHeight, 1],
        },
      });
    }

    // Phase 8.3d shopfront glazing: a row of dark glass shopfront units on the street face
    // ground level — the zone closest to the driver, which was a blank stone slab before.
    // The lit subset is added by the night world's storefront-band accents (same layout).
    if (building.kind === 'frontage' || building.kind === 'shop') {
      const face = streetFacePlacement(building, 0.13);
      const storefronts = Math.floor((face.length - 3) / 4.2);
      const faceCos = Math.cos(face.yaw);
      const faceSin = Math.sin(face.yaw);
      for (let k = 0; k < storefronts; k += 1) {
        const along = (k - (storefronts - 1) / 2) * 4.2;
        candidates['storefront-glazing'].push({
          rank: stableUnit(buildingIndex, 2601 + k, 2603),
          placement: {
            element: 'storefront-glazing',
            buildingIndex,
            x: face.x + faceCos * along,
            y: FACADE_KIT_BASE_Y + 1.55,
            z: face.z - faceSin * along,
            yaw: face.yaw,
            scale: [3.4, 2.6, 0.16],
          },
        });
      }
    }

    // Phase 8.3b ground cladding (8.3e: flush with the wall, behind the glazing plane): a
    // dark stone base band on every podium face.
    if (building.height >= 4.5) {
      ALL_FACES.forEach((faceSigns, faceIndex) => {
        const face = facePlacement(building, faceSigns, 0);
        candidates['ground-cladding'].push({
          rank: stableUnit(buildingIndex, 2301 + faceIndex, 2311),
          placement: {
            element: 'ground-cladding',
            buildingIndex,
            x: face.x,
            y: FACADE_KIT_BASE_Y,
            z: face.z,
            yaw: face.yaw,
            scale: [face.length, 3.0, 1],
          },
        });
      });
    }

    // Phase 8.3b crown cladding (8.3e: flush, and on the set-back upper volume's faces when
    // the building is massed): a lighter band across the top 1.8 m, separating the parapet
    // from the body of the facade — behind the window plane so the top row still glows.
    if (building.height >= 4.5) {
      ALL_FACES.forEach((faceSigns, faceIndex) => {
        const face =
          upper !== null
            ? upperFacePlacement(building, upper, faceSigns, 0)
            : facePlacement(building, faceSigns, 0);
        candidates['crown-cladding'].push({
          rank: stableUnit(buildingIndex, 2401 + faceIndex, 2411),
          placement: {
            element: 'crown-cladding',
            buildingIndex,
            x: face.x,
            y: FACADE_KIT_BASE_Y + building.height - 0.9,
            z: face.z,
            yaw: face.yaw,
            scale: [face.length, 1.8, 1],
          },
        });
      });
    }
  });

  towers.forEach((tower, towerIndex) => {
    // Phase 8.3f: set-back crown — the fins run the body height only, the crown band sits on
    // the crown face, and the mast stands on the crown roof.
    const bodyHeight = tower.crown ? tower.height - tower.crown.height : tower.height;
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
          y: FACADE_KIT_BASE_Y + bodyHeight / 2,
          z: tower.z + face.dz + face.normalZ * offset,
          yaw: 0,
          scale: [1, bodyHeight, 1],
        },
      });
    }
    // Crown glass band marks the curtain-wall head against the rooftop — on the set-back
    // crown face when the tower carries one.
    const bandWidth = tower.crown ? tower.crown.width + 0.12 : tower.width + 0.12;
    const bandDepth = tower.crown ? tower.crown.depth + 0.12 : tower.depth + 0.12;
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
        scale: [bandWidth, 1.3, bandDepth],
      },
    });
    // Phase 8.3 mid spandrel: a band at two-thirds height so the tower reads as a stack of
    // floors rather than one glass slab.
    candidates['glass-band'].push({
      rank: stableUnit(towerIndex, 43, 1035),
      placement: {
        element: 'glass-band',
        buildingIndex: -1,
        towerIndex,
        x: tower.x,
        y: FACADE_KIT_BASE_Y + tower.height * (2 / 3),
        z: tower.z,
        yaw: 0,
        scale: [tower.width + 0.12, 1.1, tower.depth + 0.12],
      },
    });
    // Phase 8.3d: a rooftop mast on every tower — the skyline needs verticals, and a thin
    // pole does not repeat the box-on-box read the penthouses did.
    const mastWidth = tower.crown ? tower.crown.width : tower.width;
    const mastDepth = tower.crown ? tower.crown.depth : tower.depth;
    candidates.mast.push({
      rank: stableUnit(towerIndex, 45, 1037),
      placement: {
        element: 'mast',
        buildingIndex: -1,
        towerIndex,
        x: tower.x + (stableUnit(towerIndex, 2201, 2209) - 0.5) * mastWidth * 0.4,
        y: FACADE_KIT_BASE_Y + tower.height,
        z: tower.z + (stableUnit(towerIndex, 2202, 2211) - 0.5) * mastDepth * 0.4,
        yaw: 0,
        scale: [1, Math.max(3, tower.height * 0.05), 1],
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
    'floor-band': budget.floorBands,
    'corner-reveal': budget.cornerReveals,
    mast: budget.masts,
    'storefront-glazing': budget.storefrontGlazing,
    'ground-cladding': budget.groundCladding,
    'crown-cladding': budget.crownCladding,
  };
  for (const element of Object.keys(candidates) as FacadeKitElement[]) {
    const ranked = [...candidates[element]].sort(
      (a, b) =>
        (b.priority === true ? 1 : 0) - (a.priority === true ? 1 : 0) ||
        a.rank - b.rank ||
        a.placement.buildingIndex - b.placement.buildingIndex,
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
    case 'floor-band':
      // Unit-width precast slab line; scaled along the face length per placement. The slab lip
      // sits just in front of the window head so window tops tuck under the floor line.
      parts = [boxPart([1, 0.34, 0.12], [0, 0, 0.14])];
      break;
    case 'corner-reveal':
      // Unit-height corner pilaster (0.3 m section, 0.03 m proud); scaled to the wall height.
      parts = [boxPart([0.3, 1, 0.3], [0, 0.5, 0.03])];
      break;
    case 'mast':
      // Unit-height antenna pole (0.1 m section) with one crossbar at 85% height; scaled to
      // the placement height. Thin enough to read as a vertical, not a box.
      parts = [boxPart([0.1, 1, 0.1], [0, 0.5, 0]), boxPart([0.5, 0.04, 0.04], [0, 0.85, 0])];
      break;
    case 'storefront-glazing':
      // Unit shopfront glass panel; scaled per placement to [3.4, 2.6, 0.16].
      parts = [boxPart([1, 1, 1], [0, 0, 0])];
      break;
    case 'ground-cladding':
      // Unit-width dark stone base band, 3 m tall; scaled along the face length. Flush with
      // the wall (front at 0.02 m), behind the window panes (rear at 0.0325 m) and the
      // shopfront glazing, so the glass plane always reads in front of the stone.
      parts = [boxPart([1, 3, 0.04], [0, 1.5, 0.02])];
      break;
    case 'crown-cladding':
      // Unit-width lighter parapet band, 1.8 m tall, centred on the placement point. Flush
      // with the wall so the top window row (and its lit panes) reads in front of the band.
      parts = [boxPart([1, 1.8, 0.04], [0, 0, 0.02])];
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
  'floor-band': {
    options: {
      name: 'aohara-floor-slab-reveal-pbr',
      colorHex: 0x454d55,
      roughness: 0.72,
      metalness: 0.08,
      detailAmplitude: 0.02,
      clearcoat: 0.1,
      clearcoatRoughness: 0.4,
    },
    castShadow: false,
  },
  'corner-reveal': {
    options: {
      name: 'aohara-corner-pilaster-reveal-pbr',
      colorHex: 0x363d44,
      roughness: 0.8,
      metalness: 0.06,
      detailAmplitude: 0.025,
      clearcoat: 0.08,
      clearcoatRoughness: 0.45,
    },
    castShadow: false,
  },
  mast: {
    options: {
      name: 'aohara-rooftop-antenna-pole-pbr',
      colorHex: 0x39424c,
      roughness: 0.55,
      metalness: 0.45,
      detailAmplitude: 0.012,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
    },
    castShadow: false,
  },
  'storefront-glazing': {
    options: {
      name: 'aohara-shopfront-tinted-glazing-pbr',
      colorHex: 0x16222c,
      roughness: 0.2,
      metalness: 0.22,
      detailAmplitude: 0.01,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
    },
    castShadow: false,
  },
  'ground-cladding': {
    options: {
      name: 'aohara-ground-floor-stone-cladding-pbr',
      colorHex: 0x2f3338,
      roughness: 0.85,
      metalness: 0.05,
      detailAmplitude: 0.03,
      clearcoat: 0.05,
      clearcoatRoughness: 0.5,
    },
    castShadow: false,
  },
  'crown-cladding': {
    options: {
      name: 'aohara-parapet-crown-cladding-pbr',
      colorHex: 0x9aa0a8,
      roughness: 0.7,
      metalness: 0.1,
      detailAmplitude: 0.02,
      clearcoat: 0.12,
      clearcoatRoughness: 0.35,
    },
    castShadow: false,
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
  'floor-band',
  'corner-reveal',
  'mast',
  'storefront-glazing',
  'ground-cladding',
  'crown-cladding',
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
      'floor-band': 0,
      'corner-reveal': 0,
      mast: 0,
      'storefront-glazing': 0,
      'ground-cladding': 0,
      'crown-cladding': 0,
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
      facadeKitFloorBands: counts['floor-band'],
      facadeKitCornerReveals: counts['corner-reveal'],
      facadeKitMasts: counts.mast,
      facadeKitStorefrontGlazing: counts['storefront-glazing'],
      facadeKitGroundCladding: counts['ground-cladding'],
      facadeKitCrownCladding: counts['crown-cladding'],
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
