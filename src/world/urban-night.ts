import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  Sprite,
  type BufferGeometry,
} from 'three';
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  SpriteNodeMaterial,
  type Node,
  type UniformNode,
} from 'three/webgpu';
import { abs, exp, float, mix, texture, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  resolveTrafficSignalAspect,
  resolveUrbanNightGain,
  resolveUrbanStreetLightCoverage,
  resolveUrbanWetness,
  URBAN_ACTIVITY_TIER_BUDGET,
  URBAN_CITY_CONFIG,
  URBAN_NIGHT_TIER_BUDGET,
  type TrafficSignalAspect,
} from '../config/urban-city';
import { AOHARA_BACKSTREET_BLOCKS, AOHARA_BACKSTREET_CONFIG } from '../config/aohara-backstreets';
import {
  AOHARA_DISTRICT_CONFIG,
  AOHARA_GRID_COLUMNS,
  AOHARA_GRID_ROWS,
} from '../config/urban-district';
import type { TierId } from '../config/tiers';
import { configureTiledSurface, SurfaceTextureLibrary } from '../assets/SurfaceTextureLibrary';
import type { MaterialTextureSet } from '../assets/AssetManifest';
import type { DaylightState } from '../environment/EnvironmentClock';
import { collideCarWithStaticBoxes, type StaticBuildingBox } from './static-building-collision';
import { createArchitecturalMaterial } from './architectural-materials';
import { bindScannedPbrMaps } from './scanned-pbr';
import { UrbanStreetFurniture } from './urban-furniture';
import { UrbanAlleyFrontages } from './urban-alley-frontages';
import { UrbanBackstreetProps } from './urban-backstreets';
import type { RoadNetwork } from './road-network';
import { UrbanStreetActivity } from './urban-activity';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TownCarProbe, TownHit } from './town';
import type { SceneContent, SceneContentContext } from './WorldContent';

interface TowerSpec {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly color: number;
}

/** Compact skyline retained by the standalone night-lighting look-dev block. */
const LOOKDEV_TOWERS: readonly TowerSpec[] = [
  { x: -31, z: -57, width: 22, depth: 26, height: 58, color: 0x27333e },
  { x: -31, z: -30, width: 22, depth: 22, height: 82, color: 0x202b36 },
  { x: -31, z: 30, width: 23, depth: 22, height: 68, color: 0x30343e },
  { x: -31, z: 57, width: 24, depth: 27, height: 100, color: 0x202b36 },
  { x: 31, z: -57, width: 23, depth: 26, height: 74, color: 0x27333e },
  { x: 31, z: -30, width: 25, depth: 24, height: 96, color: 0x202b36 },
  { x: 31, z: 30, width: 22, depth: 22, height: 54, color: 0x30343e },
  { x: 31, z: 57, width: 24, depth: 28, height: 86, color: 0x27333e },
];

const SIGNAL_ASPECTS: readonly TrafficSignalAspect[] = ['red', 'amber', 'green'];
const STREET_LAMP_PALETTE = [0xffbf68, 0xff5ad3, 0x54dcff, 0xa78bfa, 0x5ce4b5, 0xff7c62] as const;
const NIGHT_DECORATION_PALETTE = [
  0x38dfff, 0xff4f9a, 0xffbe48, 0x9b79ff, 0x54e1ba, 0xff785c,
] as const;
const SIGNAL_ON_COLOR: Readonly<Record<TrafficSignalAspect, number>> = {
  red: 0xff3028,
  amber: 0xffb52e,
  green: 0x46e58a,
};
const SIGNAL_OFF_COLOR = 0x20242a;
const WORLD_BASE_Y = -0.55;
const ROAD_Y = -0.46;

interface TransformSpec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw?: number;
  readonly scale?: readonly [number, number, number];
}

interface RankedFacadeBand {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: readonly [number, number, number];
  readonly rank: number;
}

type CityBuildingKind =
  'house' | 'townhouse' | 'mansion' | 'shop' | 'casino' | 'infill' | 'frontage';
type CityRoofStyle = 'flat' | 'hipped';

interface CityBuildingSpec {
  readonly kind: CityBuildingKind;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly color: number;
  readonly roofColor: number;
  readonly roofStyle?: CityRoofStyle;
  readonly yaw?: number;
  /** Marks a shell added by the dense Aohara perimeter-frontage pass, including small shops. */
  readonly frontage?: boolean;
}

function hasPitchedRoof(building: CityBuildingSpec): boolean {
  return (
    building.roofStyle === 'hipped' ||
    (building.roofStyle === undefined && (building.kind === 'house' || building.kind === 'mansion'))
  );
}

function cityBuildingFootprint(
  building: CityBuildingSpec,
  originX: number,
  originZ: number,
): StaticBuildingBox {
  return {
    x: originX + building.x,
    z: originZ + building.z,
    yaw: building.yaw ?? 0,
    halfWidth: building.width / 2,
    halfDepth: building.depth / 2,
  };
}

function footprintSeparation(a: StaticBuildingBox, b: StaticBuildingBox, margin: number): number {
  const aAxes = [
    [Math.cos(a.yaw), -Math.sin(a.yaw)],
    [Math.sin(a.yaw), Math.cos(a.yaw)],
  ] as const;
  const bAxes = [
    [Math.cos(b.yaw), -Math.sin(b.yaw)],
    [Math.sin(b.yaw), Math.cos(b.yaw)],
  ] as const;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.max(
    ...[...aAxes, ...bAxes].map(([axisX, axisZ]) => {
      const centerDistance = Math.abs(dx * axisX + dz * axisZ);
      const radius = (box: StaticBuildingBox, axes: typeof aAxes): number =>
        (box.halfWidth + margin) * Math.abs(axes[0]![0] * axisX + axes[0]![1] * axisZ) +
        (box.halfDepth + margin) * Math.abs(axes[1]![0] * axisX + axes[1]![1] * axisZ);
      return centerDistance - radius(a, aAxes) - radius(b, bAxes);
    }),
  );
}

function pointToFootprintDistance(x: number, z: number, footprint: StaticBuildingBox): number {
  const dx = x - footprint.x;
  const dz = z - footprint.z;
  const cos = Math.cos(footprint.yaw);
  const sin = Math.sin(footprint.yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.hypot(
    Math.max(0, Math.abs(localX) - footprint.halfWidth),
    Math.max(0, Math.abs(localZ) - footprint.halfDepth),
  );
}

function buildAoharaAlleyClearanceSamples(
  network: RoadNetwork | undefined,
): readonly { readonly x: number; readonly z: number; readonly halfWidth: number }[] {
  if (network === undefined) return [];
  const samples: { readonly x: number; readonly z: number; readonly halfWidth: number }[] = [];
  for (const edge of network.edges) {
    if (edge.roadClass !== 'urban-alley') continue;
    for (let index = 0; index + 1 < edge.points.length; index += 1) {
      const start = edge.points[index]!;
      const end = edge.points[index + 1]!;
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      const steps = Math.max(1, Math.ceil(length / 2.5));
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        samples.push({
          x: start.x + (end.x - start.x) * t,
          z: start.z + (end.z - start.z) * t,
          halfWidth: edge.halfWidthMeters,
        });
      }
    }
  }
  return samples;
}

function selectClearCityBuildings(
  candidates: readonly CityBuildingSpec[],
  blockedFootprints: readonly StaticBuildingBox[],
  roadNetwork: RoadNetwork | undefined,
  originX: number,
  originZ: number,
  limit = Number.POSITIVE_INFINITY,
): readonly CityBuildingSpec[] {
  const selected: CityBuildingSpec[] = [];
  const obstacles = [...blockedFootprints];
  const alleySamples = buildAoharaAlleyClearanceSamples(roadNetwork);
  for (const building of candidates) {
    const footprint = cityBuildingFootprint(building, originX, originZ);
    if (
      obstacles.some(
        (obstacle) =>
          footprintSeparation(
            footprint,
            obstacle,
            AOHARA_BACKSTREET_CONFIG.buildingClearanceMeters,
          ) <= 0.05,
      )
    ) {
      continue;
    }
    if (
      alleySamples.some(
        (sample) =>
          pointToFootprintDistance(sample.x, sample.z, footprint) <
          sample.halfWidth + AOHARA_BACKSTREET_CONFIG.alleyWallClearanceMeters,
      )
    ) {
      continue;
    }
    selected.push(building);
    obstacles.push(footprint);
    if (selected.length >= limit) break;
  }
  return selected;
}

interface BillboardSpec extends TransformSpec {
  readonly width: number;
  readonly height: number;
  readonly color: number;
  readonly lightColor: number;
}

interface ArchitecturalLightCandidate {
  readonly position: readonly [number, number, number];
  readonly color: number;
  readonly intensity: number;
  readonly distance: number;
  readonly source: 'shop' | 'casino' | 'stadium' | 'billboard' | 'lantern' | 'mood';
}

interface NightArchitectureAccentStats {
  readonly highRiseInstances: number;
  readonly storefrontInstances: number;
}

interface CityTypologyStats {
  readonly stadiums: number;
  readonly infillBuildings: number;
  readonly infillHippedRoofs: number;
  readonly infillFlatRoofs: number;
  readonly frontageBuildings: number;
  readonly casinos: number;
  readonly mansions: number;
  readonly houses: number;
  readonly townhouses: number;
  readonly shops: number;
  readonly billboards: number;
  readonly districtBanners: number;
  readonly decorativeLights: number;
}

interface SignalLamp {
  readonly material: MeshBasicNodeMaterial;
  readonly flare: Sprite;
}

interface SignalHead {
  readonly lamps: Readonly<Record<TrafficSignalAspect, SignalLamp>>;
  active: TrafficSignalAspect | null;
}

function stableUnit(a: number, b: number, salt: number): number {
  let value = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ Math.imul(b + salt, 0xc2b2ae35), 0x27d4eb2f);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0x1_0000_0000;
}

function streetLampPaletteIndex(position: readonly [number, number, number]): number {
  const gridCellX = Math.floor(position[0] / 24);
  const gridCellZ = Math.floor(position[2] / 40);
  return Math.abs(gridCellX + gridCellZ) % STREET_LAMP_PALETTE.length;
}

const CITY_FACADE_PALETTE = [0x202b36, 0x27333e, 0x30343e, 0x3a3735] as const;
const CITY_TOWER_HEIGHTS = [34, 44, 58, 72, 90, 116, 142] as const;

function buildAoharaTowerSpecs(): readonly TowerSpec[] {
  const towers: TowerSpec[] = [...LOOKDEV_TOWERS];
  for (let rowIndex = 0; rowIndex < AOHARA_GRID_ROWS.length - 1; rowIndex += 1) {
    const row = AOHARA_GRID_ROWS[rowIndex]!;
    const nextRow = AOHARA_GRID_ROWS[rowIndex + 1]!;
    for (let columnIndex = 0; columnIndex < AOHARA_GRID_COLUMNS.length - 1; columnIndex += 1) {
      // The four central blocks already carry the original eight authored high-rises.
      if ((rowIndex === 1 || rowIndex === 2) && (columnIndex === 1 || columnIndex === 2)) {
        continue;
      }
      const column = AOHARA_GRID_COLUMNS[columnIndex]!;
      const nextColumn = AOHARA_GRID_COLUMNS[columnIndex + 1]!;
      const blockCenterX =
        ((column.offset + nextColumn.offset) / 2) * AOHARA_DISTRICT_CONFIG.gridSpacingMeters;
      const blockCenterZ =
        ((row.offset + nextRow.offset) / 2) * AOHARA_DISTRICT_CONFIG.gridSpacingMeters;
      for (const side of [-1, 1] as const) {
        const seed = rowIndex * 37 + columnIndex * 11;
        const xJitter = (stableUnit(seed, side, 109) - 0.5) * 6;
        const zJitter = (stableUnit(seed, side, 127) - 0.5) * 8;
        const heightIndex = Math.floor(stableUnit(seed, side, 149) * CITY_TOWER_HEIGHTS.length);
        const colorIndex = Math.floor(stableUnit(seed, side, 173) * CITY_FACADE_PALETTE.length);
        towers.push({
          x: blockCenterX + side * 35 + xJitter,
          z: blockCenterZ + zJitter,
          width: 28 + stableUnit(seed, side, 191) * 8,
          depth: 30 + stableUnit(seed, side, 211) * 10,
          height: CITY_TOWER_HEIGHTS[heightIndex] ?? CITY_TOWER_HEIGHTS[0],
          color: CITY_FACADE_PALETTE[colorIndex] ?? CITY_FACADE_PALETTE[0],
        });
      }
    }
  }
  return towers;
}

const AOHARA_CITY_TOWERS = buildAoharaTowerSpecs();

function buildCityBuildingSpecs(networkIntegrated: boolean): readonly CityBuildingSpec[] {
  if (networkIntegrated) {
    const shopColors = [0x46535b, 0x554a42, 0x47554d, 0x4a4a5b] as const;
    const shops = [-1, 1].flatMap((side) =>
      [-1, 1].map((row) => ({
        kind: 'shop' as const,
        x: side * 42,
        z: row * 80,
        width: 18,
        depth: 14,
        height: 9 + (side === row ? 1 : 0),
        color: shopColors[((side + 1) / 2) * 2 + (row + 1) / 2] ?? shopColors[0],
        roofColor: 0x263039,
        yaw: 0,
      })),
    );
    const casinos = [-1, 1].map((side) => ({
      kind: 'casino' as const,
      x: 400,
      z: side * 140,
      width: 44,
      depth: 42,
      height: 23,
      color: side < 0 ? 0x393749 : 0x3e3542,
      roofColor: 0x1c2029,
      yaw: side < 0 ? 0 : Math.PI,
    }));
    const mansions = [-1, 1].flatMap((side) =>
      [-1, 1].map((row) => ({
        kind: 'mansion' as const,
        x: side * 390,
        z: row * 190,
        width: 34,
        depth: 28,
        height: 10,
        color: side === row ? 0x9d9481 : 0xaaa18f,
        roofColor: side === row ? 0x343a43 : 0x47413b,
        yaw: row < 0 ? 0 : Math.PI / 2,
      })),
    );
    const townhouses = [-210, -132, 132, 210].flatMap((x) =>
      [-1, 1].map((row) => ({
        kind: 'townhouse' as const,
        x,
        z: row * 440,
        width: 14,
        depth: 13,
        height: 8,
        color: row < 0 ? 0x82786b : 0x7b746e,
        roofColor: 0x3b4149,
        yaw: row < 0 ? 0 : Math.PI,
      })),
    );
    const houses = [-1, 1].flatMap((side) =>
      [-1, 1].map((row) => ({
        kind: 'house' as const,
        x: side * 345,
        z: row * 345,
        width: 12,
        depth: 10,
        height: 6.2,
        color: side === row ? 0x99917e : 0x8a928d,
        roofColor: side < 0 ? 0x37434a : 0x53453d,
        yaw: side < 0 ? 0 : Math.PI / 2,
      })),
    );
    return [...shops, ...casinos, ...mansions, ...townhouses, ...houses];
  }

  // The orbit-only preview keeps a compact sample of the same typologies in its one-block frame.
  return [
    {
      kind: 'shop',
      x: -65,
      z: -70,
      width: 18,
      depth: 16,
      height: 9,
      color: 0x46535b,
      roofColor: 0x263039,
    },
    {
      kind: 'casino',
      x: -54,
      z: -10,
      width: 18,
      depth: 22,
      height: 14,
      color: 0x393749,
      roofColor: 0x1c2029,
    },
    {
      kind: 'mansion',
      x: 55,
      z: 0,
      width: 18,
      depth: 18,
      height: 8,
      color: 0x9d9481,
      roofColor: 0x343a43,
    },
    {
      kind: 'townhouse',
      x: 56,
      z: -40,
      width: 13,
      depth: 12,
      height: 7,
      color: 0x82786b,
      roofColor: 0x3b4149,
    },
    {
      kind: 'house',
      x: -55,
      z: 34,
      width: 13,
      depth: 12,
      height: 6,
      color: 0x99917e,
      roofColor: 0x37434a,
    },
  ];
}

/** Offer four deterministic interior-corner plots per block for road- and shell-clear infill. */
function buildAoharaInfillBuildingCandidates(): readonly CityBuildingSpec[] {
  const wallPalette = [0x82786b, 0x7b746e, 0x99917e, 0x8a928d, 0x6f7d78, 0x9a7b6a] as const;
  const roofPalette = [0x3b4149, 0x3b4149, 0x263039, 0x263039, 0x45413a, 0x514747] as const;
  const cornerSigns = [-1, 1] as const;
  const candidates: { readonly rank: number; readonly building: CityBuildingSpec }[] = [];

  AOHARA_BACKSTREET_BLOCKS.forEach((block, blockIndex) => {
    cornerSigns.forEach((zSign, zIndex) => {
      cornerSigns.forEach((xSign, xIndex) => {
        const cornerIndex = zIndex * 2 + xIndex;
        const paletteIndex = Math.floor(
          stableUnit(block.rowIndex, block.columnIndex, 811 + cornerIndex) * wallPalette.length,
        );
        candidates.push({
          rank: stableUnit(blockIndex, cornerIndex, 827),
          building: {
            kind: 'infill',
            x:
              block.centerLocalX + xSign * AOHARA_BACKSTREET_CONFIG.innerBuildingCornerOffsetMeters,
            z:
              block.centerLocalZ + zSign * AOHARA_BACKSTREET_CONFIG.innerBuildingCornerOffsetMeters,
            width: 12.8 + stableUnit(blockIndex, cornerIndex, 839) * 4,
            depth: 10 + stableUnit(blockIndex, cornerIndex, 853) * 3.4,
            height: 6.3 + stableUnit(blockIndex, cornerIndex, 877) * 4.2,
            color: wallPalette[paletteIndex] ?? wallPalette[0],
            roofColor: roofPalette[paletteIndex] ?? roofPalette[0],
            yaw: stableUnit(blockIndex, cornerIndex, 883) < 0.5 ? 0 : Math.PI / 2,
          },
        });
      });
    });
  });
  return candidates
    .sort((first, second) => first.rank - second.rank)
    .map(({ building }) => building);
}

function applyInfillRoofMix(buildings: readonly CityBuildingSpec[]): readonly CityBuildingSpec[] {
  return buildings.map((building, index) => ({
    ...building,
    // Each tier deliberately keeps both low-rise roof silhouettes, not only a wider colour set.
    roofStyle: index % 3 === 0 ? 'hipped' : 'flat',
  }));
}

function buildAoharaFrontageBuildingSpecs(): readonly CityBuildingSpec[] {
  const wallPalette = [0x71685d, 0x566167, 0x6c7469, 0x735d55, 0x596479, 0x83765f] as const;
  const roofPalette = [0x3b4149, 0x39464d, 0x4a423a, 0x53463f, 0x454a52, 0x594a42] as const;
  const sides = ['north', 'east', 'south', 'west'] as const;
  const grid = AOHARA_DISTRICT_CONFIG.gridSpacingMeters;
  const frontages: CityBuildingSpec[] = [];

  AOHARA_BACKSTREET_BLOCKS.forEach((block, blockIndex) => {
    const shopSide = Math.floor(stableUnit(block.rowIndex, block.columnIndex, 1901) * sides.length);
    const shopPosition = Math.floor(stableUnit(block.rowIndex, block.columnIndex, 1913) * 4);
    sides.forEach((side, sideIndex) => {
      AOHARA_BACKSTREET_CONFIG.frontagePositionsMeters.forEach((tangentOffset, positionIndex) => {
        const paletteIndex = Math.floor(
          stableUnit(blockIndex, sideIndex * 4 + positionIndex, 1931) * wallPalette.length,
        );
        const radialInset = grid / 2 - AOHARA_BACKSTREET_CONFIG.frontageBuildingInsetMeters;
        const building: CityBuildingSpec = {
          kind: sideIndex === shopSide && positionIndex === shopPosition ? 'shop' : 'frontage',
          frontage: true,
          x:
            side === 'west'
              ? block.centerLocalX - radialInset
              : side === 'east'
                ? block.centerLocalX + radialInset
                : block.centerLocalX + tangentOffset,
          z:
            side === 'north'
              ? block.centerLocalZ - radialInset
              : side === 'south'
                ? block.centerLocalZ + radialInset
                : block.centerLocalZ + tangentOffset,
          width: AOHARA_BACKSTREET_CONFIG.frontageBuildingDepthMeters,
          depth: AOHARA_BACKSTREET_CONFIG.frontageBuildingWidthMeters,
          height: 8.2 + stableUnit(blockIndex, sideIndex * 4 + positionIndex, 1949) * 5.1,
          color: wallPalette[paletteIndex] ?? wallPalette[0],
          roofColor: roofPalette[paletteIndex] ?? roofPalette[0],
          roofStyle:
            stableUnit(blockIndex, sideIndex * 4 + positionIndex, 1951) < 0.18 ? 'hipped' : 'flat',
          yaw:
            side === 'north'
              ? Math.PI / 2
              : side === 'south'
                ? -Math.PI / 2
                : side === 'west'
                  ? Math.PI
                  : 0,
        };
        frontages.push(building);
      });
    });
  });
  return frontages;
}

function createBasicMaterial(color: number, name: string): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.color.setHex(color);
  material.name = name;
  return material;
}

function createNightEmissiveMaterial(
  colorHex: number,
  nightGain: UniformNode<'float', number>,
  name: string,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  const color = new Color(colorHex);
  const dayColor = vec3(color.r, color.g, color.b).mul(0.14);
  const nightColor = vec3(color.r, color.g, color.b).mul(1.12);
  material.name = name;
  material.toneMapped = false;
  material.colorNode = vec4(mix(dayColor, nightColor, nightGain), 1);
  return material;
}

function addBox(
  parent: Group,
  dimensions: readonly [number, number, number],
  position: readonly [number, number, number],
  material: MeshStandardNodeMaterial | MeshBasicNodeMaterial,
  name: string,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(...dimensions), material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addPlane(
  parent: Group,
  width: number,
  length: number,
  x: number,
  y: number,
  z: number,
  material: MeshStandardNodeMaterial,
  name: string,
): Mesh {
  const mesh = new Mesh(new PlaneGeometry(width, length), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

interface ScannedSurfaceBindingOptions {
  readonly repeat: readonly [number, number];
  readonly normalStrength: number;
  readonly albedoTint?: Node<'vec4'>;
}

function bindScannedSurfaceToMaterials(
  root: Group,
  maps: MaterialTextureSet,
  matches: (material: MeshStandardNodeMaterial) => boolean,
  options: ScannedSurfaceBindingOptions,
): MeshStandardNodeMaterial[] {
  const bound = new Set<MeshStandardNodeMaterial>();
  const uvNode = uv().mul(vec2(options.repeat[0], options.repeat[1]));
  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (
        !(material instanceof MeshStandardNodeMaterial) ||
        !matches(material) ||
        bound.has(material)
      ) {
        continue;
      }
      const authoredRoughness = material.roughnessNode as Node<'float'> | null;
      bindScannedPbrMaps(material, maps, uvNode, {
        albedoTint:
          options.albedoTint ??
          (material.colorNode as Node<'vec4'> | null) ??
          vec4(material.color.r, material.color.g, material.color.b, 1),
        normalStrength: options.normalStrength,
        aoStrength: 0.72,
        metalnessScale: 0,
        ...(authoredRoughness === null
          ? {}
          : { roughnessAdjustment: authoredRoughness.sub(float(material.roughness)) }),
      });
      bound.add(material);
    }
  });
  return [...bound];
}

function addInstancedBoxes(
  parent: Group,
  geometry: BufferGeometry,
  material: MeshBasicNodeMaterial | MeshStandardNodeMaterial,
  transforms: readonly TransformSpec[],
  name: string,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, transforms.length));
  mesh.count = transforms.length;
  mesh.name = name;
  mesh.frustumCulled = false;
  const dummy = new Object3D();
  transforms.forEach((transform, index) => {
    dummy.position.set(transform.x, transform.y, transform.z);
    dummy.rotation.set(0, transform.yaw ?? 0, 0);
    dummy.scale.set(...(transform.scale ?? [1, 1, 1]));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

function createFlareMaterial(
  colorHex: number,
  nightGain: UniformNode<'float', number>,
  cardinalStrength: number,
  diagonalStrength: number,
  name: string,
  spatialGain?: UniformNode<'float', number>,
): SpriteNodeMaterial {
  const material = new SpriteNodeMaterial();
  material.name = name;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.blending = AdditiveBlending;
  material.toneMapped = false;

  const point = uv().sub(0.5).mul(2);
  const x = point.x;
  const y = point.y;
  const x2 = x.mul(x);
  const y2 = y.mul(y);
  const radiusSquared = x2.add(y2);
  // A compact PSF approximation: a soft source-local halo, a wide low-energy Gaussian tail,
  // a faint aperture ring, and a sharp center. This stays attached to each lamp—never whole-frame bloom.
  const halo = exp(radiusSquared.mul(-5.2)).mul(URBAN_CITY_CONFIG.optics.gaussianHaloStrength);
  const broadHalo = exp(radiusSquared.mul(-1.75)).mul(URBAN_CITY_CONFIG.optics.broadHaloStrength);
  const ringOffset = radiusSquared.sub(0.22);
  const apertureRing = exp(ringOffset.mul(ringOffset).mul(-92)).mul(
    URBAN_CITY_CONFIG.optics.apertureRingStrength,
  );
  const core = exp(radiusSquared.mul(-42)).mul(URBAN_CITY_CONFIG.optics.coreStrength);
  const horizontalRay = exp(y2.mul(-155)).mul(exp(abs(x).mul(-1.65)));
  const verticalRay = exp(x2.mul(-155)).mul(exp(abs(y).mul(-1.65)));
  const diagonalDelta = x.sub(y);
  const diagonalSum = x.add(y);
  const diagonalA = exp(diagonalDelta.mul(diagonalDelta).mul(-105)).mul(
    exp(abs(diagonalSum).mul(-1.75)),
  );
  const otherDiagonalDelta = x.add(y);
  const otherDiagonalSum = x.sub(y);
  const diagonalB = exp(otherDiagonalDelta.mul(otherDiagonalDelta).mul(-105)).mul(
    exp(abs(otherDiagonalSum).mul(-1.75)),
  );
  const cardinal = horizontalRay.add(verticalRay).mul(cardinalStrength);
  const diagonal = diagonalA.add(diagonalB).mul(diagonalStrength);
  const opacity = halo
    .add(broadHalo)
    .add(apertureRing)
    .add(core)
    .add(cardinal)
    .add(diagonal)
    .mul(nightGain)
    .mul(spatialGain ?? 1)
    .clamp(0, URBAN_CITY_CONFIG.optics.maximumOpacity);
  const color = new Color(colorHex);
  material.colorNode = vec4(color.r, color.g, color.b, 1);
  material.opacityNode = opacity;
  return material;
}

function createWindowMaterial(
  color: readonly [number, number, number],
  nightGain: UniformNode<'float', number>,
  name: string,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = name;
  material.toneMapped = false;
  material.colorNode = vec4(vec3(color[0], color[1], color[2]).mul(nightGain), 1);
  return material;
}

interface WindowCandidate extends TransformSpec {
  readonly rank: number;
  readonly tone: 'warm' | 'cool';
}

function buildWindowCandidates(
  towers: readonly TowerSpec[],
  extraBuildings: readonly CityBuildingSpec[],
): WindowCandidate[] {
  const candidates: WindowCandidate[] = [];
  const { facadeMarginMeters, columnSpacingMeters, floorSpacingMeters } = URBAN_CITY_CONFIG.window;
  const add = (
    position: readonly [number, number, number],
    yaw: number,
    rank: number,
    toneSeed: number,
  ): void => {
    candidates.push({
      x: position[0],
      y: position[1],
      z: position[2],
      yaw,
      rank,
      tone: stableUnit(toneSeed, Math.floor(rank * 1_000_000), 227) < 0.74 ? 'warm' : 'cool',
    });
  };

  for (let towerIndex = 0; towerIndex < towers.length; towerIndex += 1) {
    const tower = towers[towerIndex]!;
    const floors = Math.floor((tower.height - 6) / floorSpacingMeters);
    const xFaceColumns = Math.max(
      2,
      Math.floor((tower.depth - 2 * facadeMarginMeters) / columnSpacingMeters),
    );
    const zFaceColumns = Math.max(
      2,
      Math.floor((tower.width - 2 * facadeMarginMeters) / columnSpacingMeters),
    );
    const sides = [
      {
        x: tower.x - tower.width / 2 - 0.1,
        z: tower.z,
        yaw: Math.PI,
        columns: xFaceColumns,
        along: 'z' as const,
        length: tower.depth,
      },
      {
        x: tower.x + tower.width / 2 + 0.1,
        z: tower.z,
        yaw: 0,
        columns: xFaceColumns,
        along: 'z' as const,
        length: tower.depth,
      },
      {
        x: tower.x,
        z: tower.z - tower.depth / 2 - 0.1,
        yaw: Math.PI / 2,
        columns: zFaceColumns,
        along: 'x' as const,
        length: tower.width,
      },
      {
        x: tower.x,
        z: tower.z + tower.depth / 2 + 0.1,
        yaw: -Math.PI / 2,
        columns: zFaceColumns,
        along: 'x' as const,
        length: tower.width,
      },
    ];
    for (let sideIndex = 0; sideIndex < sides.length; sideIndex += 1) {
      const side = sides[sideIndex]!;
      for (let floor = 1; floor < floors; floor += 1) {
        for (let column = 0; column < side.columns; column += 1) {
          if (stableUnit(towerIndex, floor * 31 + column, sideIndex + 17) < 0.31) {
            continue;
          }
          const along =
            (column - (side.columns - 1) / 2) *
            Math.min(columnSpacingMeters, (side.length - 2 * facadeMarginMeters) / side.columns);
          const x = side.x + (side.along === 'x' ? along : 0);
          const z = side.z + (side.along === 'z' ? along : 0);
          const rank = stableUnit(towerIndex * 101 + floor, column + sideIndex * 29, 59);
          add(
            [x, WORLD_BASE_Y + 3.1 + floor * floorSpacingMeters, z],
            side.yaw,
            rank,
            towerIndex * 97 + sideIndex,
          );
        }
      }
    }
  }

  for (let buildingIndex = 0; buildingIndex < extraBuildings.length; buildingIndex += 1) {
    const building = extraBuildings[buildingIndex]!;
    const yaw = building.yaw ?? 0;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const floors = Math.max(1, Math.floor((building.height - 1.5) / 2.8));
    const xFaceColumns = Math.max(1, Math.floor((building.depth - 2) / 3.2));
    const zFaceColumns = Math.max(1, Math.floor((building.width - 2) / 3.2));
    const sides = [
      {
        localX: -building.width / 2 - 0.14,
        localZ: 0,
        yaw: yaw + Math.PI,
        columns: xFaceColumns,
        along: 'z' as const,
        length: building.depth,
      },
      {
        localX: building.width / 2 + 0.14,
        localZ: 0,
        yaw,
        columns: xFaceColumns,
        along: 'z' as const,
        length: building.depth,
      },
      {
        localX: 0,
        localZ: -building.depth / 2 - 0.14,
        yaw: yaw + Math.PI / 2,
        columns: zFaceColumns,
        along: 'x' as const,
        length: building.width,
      },
      {
        localX: 0,
        localZ: building.depth / 2 + 0.14,
        yaw: yaw - Math.PI / 2,
        columns: zFaceColumns,
        along: 'x' as const,
        length: building.width,
      },
    ];
    for (let sideIndex = 0; sideIndex < sides.length; sideIndex += 1) {
      const side = sides[sideIndex]!;
      for (let floor = 0; floor < floors; floor += 1) {
        for (let column = 0; column < side.columns; column += 1) {
          const spacing = Math.min(3.1, (side.length - 2.2) / side.columns);
          const along = (column - (side.columns - 1) / 2) * spacing;
          const localX = side.localX + (side.along === 'x' ? along : 0);
          const localZ = side.localZ + (side.along === 'z' ? along : 0);
          const rank = stableUnit(buildingIndex + 701, floor * 19 + column + sideIndex * 23, 223);
          add(
            [
              building.x + cos * localX + sin * localZ,
              WORLD_BASE_Y + 1.7 + floor * 2.6,
              building.z - sin * localX + cos * localZ,
            ],
            side.yaw,
            rank,
            buildingIndex * 13 + sideIndex,
          );
        }
      }
    }
  }
  return candidates;
}

function buildFacadeWindowFrameGeometry(): BufferGeometry {
  const width = URBAN_CITY_CONFIG.window.widthMeters;
  const height = URBAN_CITY_CONFIG.window.heightMeters;
  const bar = 0.075;
  const depth = 0.09;
  const parts = [
    new BoxGeometry(depth, height + bar * 2, bar).translate(0, 0, -width / 2),
    new BoxGeometry(depth, height + bar * 2, bar).translate(0, 0, width / 2),
    new BoxGeometry(depth, bar, width + bar * 2).translate(0, -height / 2, 0),
    new BoxGeometry(depth, bar, width + bar * 2).translate(0, height / 2, 0),
    new BoxGeometry(depth, height, bar * 0.65),
    new BoxGeometry(depth * 1.35, bar, width + 0.18).translate(
      depth * 0.14,
      -height / 2 - bar * 0.8,
      0,
    ),
  ];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  if (merged === null) {
    throw new Error('could not assemble Aohara facade window frame');
  }
  merged.name = 'aohara-facade-window-frame-geometry';
  return merged;
}

function createWindowInstances(
  root: Group,
  nightGain: UniformNode<'float', number>,
  litBudget: number,
  facadeBudget: number,
  towers: readonly TowerSpec[],
  extraBuildings: readonly CityBuildingSpec[] = [],
): { readonly illuminatedWindows: number; readonly facadeWindows: number } {
  const candidates = buildWindowCandidates(towers, extraBuildings);
  const ranked = [...candidates].sort((a, b) => a.rank - b.rank);
  const staticWindows = ranked.slice(0, facadeBudget);
  if (staticWindows.length > 0) {
    const paneGeometry = new BoxGeometry(0.055, 1.17, 1.12);
    const glazing = createArchitecturalMaterial({
      name: 'aohara-hdri-tinted-facade-glazing',
      colorHex: 0x1a2a38,
      roughness: 0.24,
      metalness: 0.18,
      detailAmplitude: 0.012,
      clearcoat: 0.72,
      clearcoatRoughness: 0.12,
    });
    const frames = createArchitecturalMaterial({
      name: 'aohara-anodized-window-frames',
      colorHex: 0x2e3942,
      roughness: 0.48,
      metalness: 0.28,
      detailAmplitude: 0.012,
      clearcoat: 0.12,
      clearcoatRoughness: 0.32,
    });
    const paneTransforms = staticWindows.map((window) => ({
      ...window,
      x: window.x + Math.cos(window.yaw ?? 0) * 0.06,
      z: window.z - Math.sin(window.yaw ?? 0) * 0.06,
    }));
    addInstancedBoxes(
      root,
      paneGeometry,
      glazing,
      paneTransforms,
      'aohara-facade-glazing',
    ).receiveShadow = true;
    addInstancedBoxes(
      root,
      buildFacadeWindowFrameGeometry(),
      frames,
      staticWindows,
      'aohara-facade-window-frames',
    ).castShadow = true;
  }

  const litWindows = ranked.slice(0, litBudget);
  const lightGeometry = new BoxGeometry(
    0.14,
    URBAN_CITY_CONFIG.window.heightMeters,
    URBAN_CITY_CONFIG.window.widthMeters,
  );
  const warm = litWindows.filter((window) => window.tone === 'warm');
  const cool = litWindows.filter((window) => window.tone === 'cool');
  if (warm.length > 0) {
    addInstancedBoxes(
      root,
      lightGeometry,
      createWindowMaterial([1.0, 0.56, 0.25], nightGain, 'aohara-warm-window-light'),
      warm,
      'aohara-warm-windows',
    );
  }
  if (cool.length > 0) {
    addInstancedBoxes(
      root,
      lightGeometry,
      createWindowMaterial([0.43, 0.66, 1.0], nightGain, 'aohara-cool-window-light'),
      cool,
      'aohara-cool-windows',
    );
  }
  return { illuminatedWindows: litWindows.length, facadeWindows: staticWindows.length };
}

function createLampGeometry(): BufferGeometry {
  const pole = new CylinderGeometry(0.12, 0.17, URBAN_CITY_CONFIG.streetLamp.heightMeters, 8);
  pole.translate(0, URBAN_CITY_CONFIG.streetLamp.heightMeters / 2, 0);
  const arm = new BoxGeometry(2.25, 0.13, 0.16);
  arm.translate(1.0, URBAN_CITY_CONFIG.streetLamp.heightMeters - 0.28, 0);
  const canopy = new BoxGeometry(0.9, 0.17, 0.48);
  canopy.translate(1.86, URBAN_CITY_CONFIG.streetLamp.heightMeters - 0.4, 0);
  const merged = mergeGeometries([pole, arm, canopy], false);
  if (merged === null) {
    arm.dispose();
    canopy.dispose();
    return pole;
  }
  pole.dispose();
  arm.dispose();
  canopy.dispose();
  return merged;
}

interface StreetLampPlacement {
  readonly pole: TransformSpec;
  readonly bulb: readonly [number, number, number];
}

interface StreetLampBuildStats {
  readonly poleCount: number;
  readonly bannerCount: number;
  readonly bollardCount: number;
  readonly moodLightCandidateCount: number;
}

function roadPositionAt(
  edge: RoadNetwork['edges'][number],
  distanceMeters: number,
): { readonly x: number; readonly z: number; readonly sideX: number; readonly sideZ: number } {
  let nextIndex = 1;
  while (
    nextIndex < edge.points.length - 1 &&
    (edge.points[nextIndex]?.alongMeters ?? Number.POSITIVE_INFINITY) < distanceMeters
  ) {
    nextIndex += 1;
  }
  const start = edge.points[nextIndex - 1]!;
  const end = edge.points[nextIndex]!;
  const span = Math.max(0.001, end.alongMeters - start.alongMeters);
  const t = Math.min(1, Math.max(0, (distanceMeters - start.alongMeters) / span));
  const tangentX = end.x - start.x;
  const tangentZ = end.z - start.z;
  const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
  return {
    x: start.x + (end.x - start.x) * t,
    z: start.z + (end.z - start.z) * t,
    sideX: tangentZ / tangentLength,
    sideZ: -tangentX / tangentLength,
  };
}

function createStreetLampPlacements(
  network: RoadNetwork,
  originX: number,
  originZ: number,
): readonly StreetLampPlacement[] {
  const placements: StreetLampPlacement[] = [];
  const spacing = URBAN_CITY_CONFIG.streetLamp.spacingMeters;
  const y = WORLD_BASE_Y;
  const bulbY = WORLD_BASE_Y + URBAN_CITY_CONFIG.streetLamp.heightMeters - 0.4;
  for (const edge of network.edges) {
    if (edge.roadClass !== 'urban-local' && edge.roadClass !== 'urban-arterial') {
      continue;
    }
    const sidewalkOffset =
      edge.halfWidthMeters +
      edge.shoulderMeters +
      URBAN_CITY_CONFIG.streetLamp.sidewalkWidthMeters / 2;
    for (let along = spacing / 2; along < edge.lengthMeters - spacing / 2; along += spacing) {
      const point = roadPositionAt(edge, along);
      for (const side of [-1, 1] as const) {
        const outwardX = point.sideX * side;
        const outwardZ = point.sideZ * side;
        const inwardX = -outwardX;
        const inwardZ = -outwardZ;
        const yaw = Math.atan2(-inwardZ, inwardX);
        const x = point.x - originX + outwardX * sidewalkOffset;
        const z = point.z - originZ + outwardZ * sidewalkOffset;
        placements.push({
          pole: { x, y, z, yaw },
          bulb: [x + Math.cos(yaw) * 1.88, bulbY, z - Math.sin(yaw) * 1.88],
        });
      }
    }
  }
  return placements;
}

function selectNearestStreetLights(
  positions: readonly (readonly [number, number, number])[],
  count: number,
  focusX: number,
  focusZ: number,
): (readonly [number, number, number])[] {
  return positions
    .map((position, index) => ({
      position,
      index,
      distanceSquared: (position[0] - focusX) ** 2 + (position[2] - focusZ) ** 2,
    }))
    .sort((a, b) => a.distanceSquared - b.distanceSquared || a.index - b.index)
    .slice(0, Math.min(positions.length, count))
    .map(({ position }) => position);
}

function selectNearestArchitecturalLights(
  candidates: readonly ArchitecturalLightCandidate[],
  count: number,
  focusX: number,
  focusZ: number,
): ArchitecturalLightCandidate[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      distanceSquared:
        (candidate.position[0] - focusX) ** 2 + (candidate.position[2] - focusZ) ** 2,
    }))
    .sort((a, b) => a.distanceSquared - b.distanceSquared || a.index - b.index)
    .slice(0, Math.min(candidates.length, count))
    .map(({ candidate }) => candidate);
}

function architecturalFlareScale(source: ArchitecturalLightCandidate['source']): number {
  if (source === 'stadium') {
    return 4.2;
  }
  return source === 'mood' ? 1.35 : 2.25;
}

function createSignalHead(
  root: Group,
  position: readonly [number, number, number],
  materials: Readonly<Record<TrafficSignalAspect, SpriteNodeMaterial>>,
  name: string,
): SignalHead {
  const housingMaterial = createBasicMaterial(0x151a20, `${name}-housing`);
  addBox(root, [0.68, 1.92, 0.48], position, housingMaterial, `${name}-housing-mesh`);
  const lamps = {} as Record<TrafficSignalAspect, SignalLamp>;
  const yOffsets: Readonly<Record<TrafficSignalAspect, number>> = {
    red: 0.6,
    amber: 0,
    green: -0.6,
  };

  for (const aspect of SIGNAL_ASPECTS) {
    const material = createBasicMaterial(SIGNAL_OFF_COLOR, `${name}-${aspect}-lamp`);
    const bulb = new Mesh(new SphereGeometry(0.16, 10, 8), material);
    bulb.position.set(position[0], position[1] + yOffsets[aspect], position[2] + 0.28);
    bulb.name = `${name}-${aspect}-bulb`;
    root.add(bulb);

    const flare = new Sprite(materials[aspect]);
    flare.position.set(position[0], position[1] + yOffsets[aspect], position[2] + 0.37);
    flare.scale.set(1.05, 1.05, 1);
    flare.visible = false;
    flare.name = `${name}-${aspect}-diffraction`;
    root.add(flare);
    lamps[aspect] = { material, flare };
  }
  return { lamps, active: null };
}

function applySignalAspect(head: SignalHead, aspect: TrafficSignalAspect): void {
  if (head.active === aspect) {
    return;
  }
  for (const lampAspect of SIGNAL_ASPECTS) {
    const lamp = head.lamps[lampAspect];
    lamp.material.color.setHex(
      lampAspect === aspect ? SIGNAL_ON_COLOR[lampAspect] : SIGNAL_OFF_COLOR,
    );
    lamp.flare.visible = lampAspect === aspect;
  }
  head.active = aspect;
}

/** Placement options used when the authored Aohara block is mounted in the driving world. */
export interface UrbanNightWorldOptions {
  /** World-space root position; omitted for the standalone look-dev scene at the origin. */
  readonly position?: readonly [number, number, number];
  /** Shared solved graph supplies the integrated city's sidewalk-aligned street-light placements. */
  readonly roadNetwork?: RoadNetwork;
  /** Shared physics world for dynamic traffic when this city is mounted in the driving scene. */
  readonly physics?: PhysicsWorld;
  /** Road ribbons/lanes/sidewalks/crossings come from RoadWorld in the driving composition. */
  readonly networkIntegrated?: boolean;
  /** Shared static-world map owner; omitted for a standalone city look-dev scene. */
  readonly surfaceTextures?: SurfaceTextureLibrary;
  /** Player-selectable traffic amount for the integrated driving city. */
  readonly trafficIntensity?: import('../config/game-preferences').TrafficIntensity;
}

/**
 * Aohara's bounded night-lighting block: high-rise silhouettes/windows, street lamps, local
 * Gaussian-diffraction sprites, a marked crossing, and timed signals. It can be viewed in the
 * isolated `?scene=city` look-dev composition or placed at the shared city road junction.
 */
export class UrbanNightWorld implements SceneContent {
  readonly root = new Group();
  readonly kind = 'aohara-city-night';
  readonly #tier: TierId;
  readonly #nightGain = uniform(0);
  readonly #wetness = uniform(URBAN_CITY_CONFIG.wetRoad.wetnessDay);
  readonly #streetLightGain = uniform(1);
  readonly #architecturalLightGain = uniform(1);
  readonly #streetLights: PointLight[] = [];
  readonly #streetLightFlares: Sprite[] = [];
  readonly #streetLightFlareMaterials: readonly SpriteNodeMaterial[];
  readonly #streetLightCandidates: (readonly [number, number, number])[] = [];
  readonly #architecturalLights: PointLight[] = [];
  readonly #architecturalFlares: Sprite[] = [];
  readonly #architecturalLightCandidates: ArchitecturalLightCandidate[] = [];
  readonly #architecturalFlareMaterials = new Map<number, SpriteNodeMaterial>();
  readonly #highRiseNightAccentInstances: number;
  readonly #storefrontNightAccentInstances: number;
  readonly #streetLightBollardInstances: number;
  readonly #nightMoodLightCandidates: number;
  readonly #activeArchitecturalCandidates: ArchitecturalLightCandidate[] = [];
  readonly #signalHeads: SignalHead[] = [];
  readonly #windowInstances: number;
  readonly #facadeWindowInstances: number;
  readonly #facadeDetailInstances: number;
  readonly #flareCount: number;
  readonly #buildingColliders: StaticBuildingBox[] = [];
  readonly #cityTypologyStats: CityTypologyStats;
  readonly #activity: UrbanStreetActivity | null;
  readonly #streetFurniture: UrbanStreetFurniture;
  readonly #backstreetFrontages: UrbanAlleyFrontages | null;
  readonly #backstreetProps: UrbanBackstreetProps | null;
  readonly #surfaceTextures: SurfaceTextureLibrary;
  readonly #ownsSurfaceTextures: boolean;
  readonly #networkIntegrated: boolean;
  readonly #towers: readonly TowerSpec[];
  readonly #cityBlockCount: number;
  readonly #streetLightPoleCount: number;
  readonly #cityOriginX: number;
  readonly #cityOriginZ: number;
  readonly #streetLightBudget: number;
  readonly #architecturalLightBudget: number;
  #streetLightSpatialGain = 1;
  #architecturalLightSpatialGain = 1;
  #lastStreetLightFocus: { x: number; z: number } | null = null;
  #signalSeconds = 0;
  #surfacesBound = false;
  #disposed = false;

  constructor(tier: TierId = 'B', options: UrbanNightWorldOptions = {}) {
    this.#tier = tier;
    this.#surfaceTextures = options.surfaceTextures ?? new SurfaceTextureLibrary();
    this.#ownsSurfaceTextures = options.surfaceTextures === undefined;
    this.#networkIntegrated = options.networkIntegrated ?? false;
    const [originX, originY, originZ] = options.position ?? [0, 0, 0];
    this.#cityOriginX = originX;
    this.#cityOriginZ = originZ;
    this.root.position.set(originX, originY, originZ);
    this.#towers = this.#networkIntegrated ? AOHARA_CITY_TOWERS : LOOKDEV_TOWERS;
    this.#cityBlockCount = this.#networkIntegrated
      ? (AOHARA_GRID_ROWS.length - 1) * (AOHARA_GRID_COLUMNS.length - 1)
      : 1;
    this.#buildingColliders.push(
      ...this.#towers.map((tower) => ({
        x: originX + tower.x,
        z: originZ + tower.z,
        yaw: 0,
        halfWidth: tower.width / 2,
        halfDepth: tower.depth / 2,
      })),
    );
    this.root.name = 'AoharaNightLightingBlock';
    const budget = URBAN_NIGHT_TIER_BUDGET[tier];
    const activityBudget = URBAN_ACTIVITY_TIER_BUDGET[tier];
    this.#streetLightBudget = budget.streetPointLights;
    this.#architecturalLightBudget = budget.architecturalPointLights;
    this.#streetLightFlareMaterials = STREET_LAMP_PALETTE.map((color, index) =>
      createFlareMaterial(
        color,
        this.#nightGain,
        budget.cardinalStarburst,
        budget.diagonalStarburst,
        `aohara-streetlight-color-${index + 1}-diffraction`,
        this.#streetLightGain,
      ),
    );
    const signalFlares: Readonly<Record<TrafficSignalAspect, SpriteNodeMaterial>> = {
      red: createFlareMaterial(
        SIGNAL_ON_COLOR.red,
        this.#nightGain,
        budget.cardinalStarburst * 0.8,
        budget.diagonalStarburst * 0.8,
        'aohara-red-signal-diffraction',
      ),
      amber: createFlareMaterial(
        SIGNAL_ON_COLOR.amber,
        this.#nightGain,
        budget.cardinalStarburst * 0.8,
        budget.diagonalStarburst * 0.8,
        'aohara-amber-signal-diffraction',
      ),
      green: createFlareMaterial(
        SIGNAL_ON_COLOR.green,
        this.#nightGain,
        budget.cardinalStarburst * 0.8,
        budget.diagonalStarburst * 0.8,
        'aohara-green-signal-diffraction',
      ),
    };

    this.#buildStreetAndCrossing();
    this.#buildTowers(this.#towers);
    const existingBuildings = buildCityBuildingSpecs(this.#networkIntegrated);
    const existingFootprints = [
      ...this.#buildingColliders,
      ...existingBuildings.map((building) => cityBuildingFootprint(building, originX, originZ)),
    ];
    const frontageBuildings = this.#networkIntegrated
      ? selectClearCityBuildings(
          buildAoharaFrontageBuildingSpecs(),
          existingFootprints,
          options.roadNetwork,
          originX,
          originZ,
        )
      : [];
    const infillBlockedFootprints = [
      ...existingFootprints,
      ...frontageBuildings.map((building) => cityBuildingFootprint(building, originX, originZ)),
    ];
    const infillBuildings = this.#networkIntegrated
      ? applyInfillRoofMix(
          selectClearCityBuildings(
            buildAoharaInfillBuildingCandidates(),
            infillBlockedFootprints,
            options.roadNetwork,
            originX,
            originZ,
            activityBudget.infillBuildings,
          ),
        )
      : [];
    const additionalBuildings = [...existingBuildings, ...frontageBuildings, ...infillBuildings];
    const typologyCounts = this.#buildCityTypologies(additionalBuildings);
    this.#backstreetFrontages =
      this.#networkIntegrated && options.roadNetwork !== undefined
        ? new UrbanAlleyFrontages(tier, options.roadNetwork, [originX, originY, originZ])
        : null;
    if (this.#backstreetFrontages !== null) {
      this.root.add(this.#backstreetFrontages.root);
    }
    this.#backstreetProps =
      this.#networkIntegrated && options.roadNetwork !== undefined
        ? new UrbanBackstreetProps(tier, options.roadNetwork, this.#buildingColliders, [
            originX,
            originY,
            originZ,
          ])
        : null;
    if (this.#backstreetProps !== null) {
      this.root.add(this.#backstreetProps.root);
    }
    const accentStats = this.#buildNightArchitectureAccents(this.#towers, additionalBuildings);
    this.#highRiseNightAccentInstances = accentStats.highRiseInstances;
    this.#storefrontNightAccentInstances = accentStats.storefrontInstances;
    this.#facadeDetailInstances = this.#buildFacadeDetails(
      this.#towers,
      additionalBuildings,
      budget.facadeDetailInstances,
    );
    const windowStats = createWindowInstances(
      this.root,
      this.#nightGain,
      budget.litWindowInstances,
      budget.facadeWindowInstances,
      this.#towers,
      additionalBuildings,
    );
    this.#windowInstances = windowStats.illuminatedWindows;
    this.#facadeWindowInstances = windowStats.facadeWindows;
    this.#streetFurniture = new UrbanStreetFurniture(tier, {
      networkIntegrated: this.#networkIntegrated,
      origin: [originX, originY, originZ],
      buildingFootprints: this.#buildingColliders,
      surfaceTextures: this.#surfaceTextures,
      ...(options.roadNetwork === undefined ? {} : { roadNetwork: options.roadNetwork }),
    });
    this.root.add(this.#streetFurniture.root);
    const streetStats = this.#buildStreetLights(
      budget.streetPointLights,
      options.roadNetwork,
      originX,
      originZ,
    );
    this.#streetLightPoleCount = streetStats.poleCount;
    this.#streetLightBollardInstances = streetStats.bollardCount;
    this.#nightMoodLightCandidates = streetStats.moodLightCandidateCount;
    this.#cityTypologyStats = { ...typologyCounts, districtBanners: streetStats.bannerCount };
    for (const colorHex of new Set(this.#architecturalLightCandidates.map(({ color }) => color))) {
      const colorName = colorHex.toString(16).padStart(6, '0');
      this.#architecturalFlareMaterials.set(
        colorHex,
        createFlareMaterial(
          colorHex,
          this.#nightGain,
          budget.cardinalStarburst * 0.76,
          budget.diagonalStarburst * 0.7,
          `aohara-architectural-${colorName}-gaussian-diffraction`,
          this.#architecturalLightGain,
        ),
      );
    }
    this.#buildArchitecturalLights(budget.architecturalPointLights);
    this.#buildSignals(signalFlares);
    this.#activity = this.#networkIntegrated
      ? new UrbanStreetActivity(tier, {
          ...(options.physics === undefined ? {} : { physics: options.physics }),
          ...(options.trafficIntensity === undefined
            ? {}
            : { trafficIntensity: options.trafficIntensity }),
          origin: [originX, originY, originZ],
        })
      : null;
    if (this.#activity !== null) {
      this.root.add(this.#activity.root);
    }
    this.#flareCount =
      this.#streetLights.length +
      this.#architecturalLights.length +
      this.#signalHeads.length * SIGNAL_ASPECTS.length;
    this.#synchronizeSignals();
  }

  /** Binds shared CC0 maps to opaque city surfaces; glass, emitters and mixed-metal kits stay distinct. */
  async loadSurfaces(): Promise<void> {
    if (this.#disposed || this.#surfacesBound) {
      return;
    }
    const [asphalt, sidewalk, concrete] = await Promise.all([
      this.#surfaceTextures.load('tex-asphalt-03-1k'),
      this.#surfaceTextures.load('tex-gravel-concrete-03-1k'),
      this.#surfaceTextures.load('tex-concrete-wall-009-1k'),
    ]);
    await this.#streetFurniture.loadSurfaces();
    if (this.#disposed) {
      return;
    }

    if (asphalt !== null) {
      configureTiledSurface(asphalt);
      const roadBindings = [
        {
          name: 'aohara-dark-asphalt-wet-look-clearcoat',
          repeat: [2, Math.max(1, Math.round(URBAN_CITY_CONFIG.avenue.lengthMeters / 6))],
        },
        {
          name: 'aohara-cross-street-asphalt-wet-look-clearcoat',
          repeat: [2, Math.max(1, Math.round(URBAN_CITY_CONFIG.crossStreet.depthMeters / 6))],
        },
      ] as const;
      for (const binding of roadBindings) {
        const asphaltMaterials = bindScannedSurfaceToMaterials(
          this.root,
          asphalt,
          (material) => material.name === binding.name,
          {
            repeat: binding.repeat,
            normalStrength: 0.65,
            albedoTint: vec4(0.72, 0.77, 0.83, 1),
          },
        );
        if (asphalt.arm !== null) {
          const asphaltUv = uv().mul(vec2(binding.repeat[0], binding.repeat[1]));
          for (const material of asphaltMaterials) {
            material.roughnessNode = mix(
              texture(asphalt.arm, asphaltUv).g,
              float(URBAN_CITY_CONFIG.wetRoad.wetRoughness),
              this.#wetness,
            );
            material.needsUpdate = true;
          }
        }
      }
    }

    if (sidewalk !== null) {
      configureTiledSurface(sidewalk);
      bindScannedSurfaceToMaterials(
        this.root,
        sidewalk,
        (material) => material.name === 'aohara-sidewalk-concrete',
        {
          repeat: [3, Math.max(1, Math.round(URBAN_CITY_CONFIG.avenue.lengthMeters / 2))],
          normalStrength: 0.54,
          albedoTint: vec4(0.65, 0.68, 0.72, 1),
        },
      );
    }

    if (concrete !== null) {
      configureTiledSurface(concrete);
      bindScannedSurfaceToMaterials(
        this.root,
        concrete,
        (material) =>
          material.name.startsWith('aohara-low-rise-facade-pbr-') &&
          material.color.r + material.color.g + material.color.b > 0.3,
        { repeat: [8, 6], normalStrength: 0.46 },
      );
    }
    this.#surfacesBound = true;
  }

  setDaylight(state: DaylightState): void {
    this.#nightGain.value = resolveUrbanNightGain(state.sunElevationDegrees);
    this.#wetness.value = resolveUrbanWetness(state.sunElevationDegrees);
    this.#setStreetLightIntensity();
    this.#setArchitecturalLightIntensity();
  }

  /** Keep only the nearest tier-budgeted Aohara point lights active around the streamed focus. */
  updateStreaming(focus: { readonly x: number; readonly y: number; readonly z: number }): void {
    if (this.#disposed || !this.#networkIntegrated || this.#streetLightCandidates.length === 0) {
      return;
    }
    const localX = focus.x - this.#cityOriginX;
    const localZ = focus.z - this.#cityOriginZ;
    const distanceFromCenter = Math.hypot(localX, localZ);
    const coverage = resolveUrbanStreetLightCoverage(distanceFromCenter);
    const previous = this.#lastStreetLightFocus;
    if (
      previous !== null &&
      Math.hypot(localX - previous.x, localZ - previous.z) <
        URBAN_CITY_CONFIG.streetLamp.activeLightRefreshDistanceMeters &&
      Math.abs(coverage - this.#streetLightSpatialGain) < 0.015
    ) {
      return;
    }

    this.#lastStreetLightFocus = { x: localX, z: localZ };
    this.#streetLightSpatialGain = coverage;
    this.#streetLightGain.value = coverage;
    const nearest = selectNearestStreetLights(
      this.#streetLightCandidates,
      this.#streetLightBudget,
      localX,
      localZ,
    );
    nearest.forEach((position, index) => {
      const light = this.#streetLights[index];
      const flare = this.#streetLightFlares[index];
      if (light === undefined || flare === undefined) {
        return;
      }
      const paletteIndex = streetLampPaletteIndex(position);
      light.position.set(...position);
      light.color.setHex(STREET_LAMP_PALETTE[paletteIndex]!);
      flare.position.set(...position);
      flare.material = this.#streetLightFlareMaterials[paletteIndex]!;
      flare.visible = coverage > 0;
    });
    this.#setStreetLightIntensity();
    this.#updateArchitecturalLightSelection(localX, localZ, coverage);
  }

  update(deltaSeconds: number): void {
    if (this.#disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }
    this.#signalSeconds =
      (this.#signalSeconds + deltaSeconds) % URBAN_CITY_CONFIG.trafficSignal.cycleSeconds;
    this.#synchronizeSignals();
    this.#activity?.update(deltaSeconds, this.#signalHeads[0]?.active ?? 'red');
  }

  get trafficSignalAspects(): readonly TrafficSignalAspect[] {
    return this.#signalHeads.map((head) => head.active ?? 'red');
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      cityBlocks: this.#cityBlockCount,
      highRiseBuildings: this.#towers.length,
      infillBuildings: this.#cityTypologyStats.infillBuildings,
      infillHippedRoofs: this.#cityTypologyStats.infillHippedRoofs,
      infillFlatRoofs: this.#cityTypologyStats.infillFlatRoofs,
      frontageBuildings: this.#cityTypologyStats.frontageBuildings,
      streetLightPoles: this.#streetLightPoleCount,
      streetLightBollards: this.#streetLightBollardInstances,
      nightMoodLightCandidates: this.#nightMoodLightCandidates,
      activeMoodPointLights: this.#activeArchitecturalCandidates.filter(
        (candidate) => candidate.source === 'mood',
      ).length,
      highRiseNightAccentInstances: this.#highRiseNightAccentInstances,
      storefrontNightAccentInstances: this.#storefrontNightAccentInstances,
      streetLightPointLights: this.#streetLights.length,
      architecturalPointLights: this.#architecturalLights.length,
      activePointLights: this.#streetLights.length + this.#architecturalLights.length,
      stadiums: this.#cityTypologyStats.stadiums,
      casinos: this.#cityTypologyStats.casinos,
      mansions: this.#cityTypologyStats.mansions,
      houses: this.#cityTypologyStats.houses,
      townhouses: this.#cityTypologyStats.townhouses,
      shops: this.#cityTypologyStats.shops,
      billboards: this.#cityTypologyStats.billboards,
      districtBanners: this.#cityTypologyStats.districtBanners,
      decorativeLights: this.#cityTypologyStats.decorativeLights,
      illuminatedWindows: this.#windowInstances,
      facadeWindowInstances: this.#facadeWindowInstances,
      facadeDetailInstances: this.#facadeDetailInstances,
      opticalFlares: this.#flareCount,
      trafficSignals: this.#signalHeads.length,
      wetSurfaceIntensity: Number(this.#wetness.value.toFixed(3)),
      streetLightFocusGain: Number(this.#streetLightSpatialGain.toFixed(3)),
      architecturalLightFocusGain: Number(this.#architecturalLightSpatialGain.toFixed(3)),
      ...(this.#activity?.getContentStats() ?? {
        urbanTrafficVehicles: 0,
        urbanTrafficPhysicsBodies: 0,
        urbanTrafficImpactFeedbacks: 0,
        urbanPedestrians: 0,
        urbanActivityBatches: 0,
      }),
      ...(this.#backstreetProps?.getContentStats() ?? {
        urbanAlleyProps: 0,
        urbanAlleyPropsBudget: 0,
        urbanAlleyWasteBins: 0,
        urbanAlleyDumpsters: 0,
        urbanAlleyCardboardStacks: 0,
        urbanAlleyHandCarts: 0,
        urbanAlleyCrateStacks: 0,
        urbanAlleyPallets: 0,
        urbanAlleyPropBatches: 0,
      }),
      ...(this.#backstreetFrontages?.getContentStats() ?? {
        urbanAlleyFacadeBuildings: 0,
        urbanAlleyFacadeWindows: 0,
        urbanAlleyFacadeDoors: 0,
        urbanAlleyFacadeWallRuns: 0,
        urbanAlleyFacadeBatches: 0,
      }),
      ...this.#streetFurniture.getContentStats(),
      qualityTierCode: this.#tier === 'C' ? 0 : this.#tier === 'B' ? 1 : 2,
    };
  }

  /** Static city-building footprints stop the player car through the existing collision response. */
  collide(car: TownCarProbe): TownHit[] {
    if (this.#disposed) return [];
    return [
      ...collideCarWithStaticBoxes(car, this.#buildingColliders),
      ...(this.#backstreetFrontages?.collide(car) ?? []),
      ...collideCarWithStaticBoxes(car, this.#backstreetProps?.collisionBoxes ?? []),
    ];
  }

  /** Read-only diagnostic copy used to audit city building clearances against the road graph. */
  getStaticBuildingFootprints(): readonly StaticBuildingBox[] {
    return this.#buildingColliders.map((box) => ({ ...box }));
  }

  /** Collision footprints for the continuous building walls bordering Aohara's alleys. */
  getBackstreetFacadeFootprints(): readonly StaticBuildingBox[] {
    return (this.#backstreetFrontages?.collisionBoxes ?? []).map((box) => ({ ...box }));
  }

  /** Read-only diagnostic copy of collision footprints for the bounded alley clutter. */
  getBackstreetPropFootprints(): readonly StaticBuildingBox[] {
    return (this.#backstreetProps?.collisionBoxes ?? []).map((box) => ({ ...box }));
  }

  dispose(): void {
    // The scene manager owns and sweeps this content's attached geometries/materials. The bounded
    // activity owns its dynamic buffers, so release those here before its root is detached.
    this.#disposed = true;
    this.#activity?.dispose();
    this.#streetFurniture.dispose();
    this.#backstreetFrontages?.dispose();
    this.#backstreetProps?.dispose();
    if (this.#ownsSurfaceTextures) {
      this.#surfaceTextures.dispose();
    }
  }

  #buildStreetAndCrossing(): void {
    // The driving world owns all road, sidewalk and crossing geometry from the shared graph.
    // The orbit-only look-dev composition keeps its small standalone roadway below.
    if (this.#networkIntegrated) {
      return;
    }
    const deckMaterial = new MeshStandardNodeMaterial();
    deckMaterial.color.setHex(0x121923);
    deckMaterial.roughness = 0.82;
    deckMaterial.name = 'aohara-city-deck';
    addBox(
      this.root,
      [URBAN_CITY_CONFIG.cityDeck.widthMeters, 0.65, URBAN_CITY_CONFIG.cityDeck.lengthMeters],
      [0, WORLD_BASE_Y - 0.33, URBAN_CITY_CONFIG.cityDeck.centerZ],
      deckMaterial,
      'aohara-ground-deck',
    );

    if (!this.#networkIntegrated) {
      const createWetLookAsphalt = (name: string): MeshPhysicalNodeMaterial => {
        const asphalt = new MeshPhysicalNodeMaterial();
        asphalt.color.setHex(0x1d252e);
        asphalt.roughness = URBAN_CITY_CONFIG.wetRoad.dryRoughness;
        asphalt.metalness = 0.025;
        asphalt.roughnessNode = mix(
          float(URBAN_CITY_CONFIG.wetRoad.dryRoughness),
          float(URBAN_CITY_CONFIG.wetRoad.wetRoughness),
          this.#wetness,
        );
        asphalt.clearcoatNode = mix(
          float(URBAN_CITY_CONFIG.wetRoad.dryClearcoat),
          float(URBAN_CITY_CONFIG.wetRoad.wetClearcoat),
          this.#wetness,
        );
        asphalt.clearcoatRoughnessNode = mix(
          float(URBAN_CITY_CONFIG.wetRoad.dryClearcoatRoughness),
          float(URBAN_CITY_CONFIG.wetRoad.wetClearcoatRoughness),
          this.#wetness,
        );
        asphalt.name = name;
        return asphalt;
      };
      const asphalt = createWetLookAsphalt('aohara-dark-asphalt-wet-look-clearcoat');
      const crossStreetAsphalt = createWetLookAsphalt(
        'aohara-cross-street-asphalt-wet-look-clearcoat',
      );
      addPlane(
        this.root,
        URBAN_CITY_CONFIG.avenue.widthMeters,
        URBAN_CITY_CONFIG.avenue.lengthMeters,
        0,
        ROAD_Y,
        URBAN_CITY_CONFIG.avenue.centerZ,
        asphalt,
        'aohara-main-avenue',
      );
      addPlane(
        this.root,
        URBAN_CITY_CONFIG.crossStreet.widthMeters,
        URBAN_CITY_CONFIG.crossStreet.depthMeters,
        0,
        ROAD_Y + 0.002,
        0,
        crossStreetAsphalt,
        'aohara-signalized-cross-street',
      );
    }

    const sidewalkMaterial = new MeshStandardNodeMaterial();
    sidewalkMaterial.color.setHex(0x424a50);
    sidewalkMaterial.roughness = 0.88;
    sidewalkMaterial.name = 'aohara-sidewalk-concrete';
    const sidewalkX = URBAN_CITY_CONFIG.sidewalk.centerOffsetXMeters;
    for (const side of [-1, 1]) {
      addBox(
        this.root,
        [URBAN_CITY_CONFIG.sidewalk.widthMeters, 0.48, URBAN_CITY_CONFIG.sidewalk.lengthMeters],
        [side * sidewalkX, WORLD_BASE_Y + 0.24, URBAN_CITY_CONFIG.avenue.centerZ],
        sidewalkMaterial,
        `aohara-sidewalk-${side}`,
      );
    }

    const white = createBasicMaterial(0xb8c2c7, 'aohara-road-marking-white');
    if (!this.#networkIntegrated) {
      const yellow = createBasicMaterial(0xd9b65b, 'aohara-road-marking-amber');
      const laneDashGeometry = new BoxGeometry(0.13, 0.025, 6.2);
      const laneDashes: TransformSpec[] = [];
      for (let z = -91; z <= 47; z += 14) {
        for (const x of [-3.4, 3.4]) {
          laneDashes.push({ x, y: ROAD_Y + 0.025, z });
        }
      }
      addInstancedBoxes(this.root, laneDashGeometry, white, laneDashes, 'aohara-white-lane-dashes');

      const centerLineGeometry = new BoxGeometry(0.11, 0.026, 5.5);
      const centerLines: TransformSpec[] = [];
      for (let z = -91; z <= 47; z += 14) {
        centerLines.push(
          {
            x: -0.18,
            y: ROAD_Y + 0.027,
            z,
          },
          { x: 0.18, y: ROAD_Y + 0.027, z },
        );
      }
      addInstancedBoxes(
        this.root,
        centerLineGeometry,
        yellow,
        centerLines,
        'aohara-double-center-lines',
      );
    }

    const crosswalkMaterial = createBasicMaterial(0xd3dadd, 'aohara-crosswalk-marking');
    const barThickness = 0.032;
    const stripeWidth = 0.55;
    const markingY = ROAD_Y + (this.#networkIntegrated ? 0.004 : 0.035);
    const acrossRoadMeters = URBAN_CITY_CONFIG.avenue.widthMeters - 3.6;
    const avenueBars: TransformSpec[] = [];
    const crossStreetBars: TransformSpec[] = [];
    for (const centreZ of [-8.3, 8.3]) {
      for (let offset = -2.8; offset <= 2.8; offset += 0.8) {
        avenueBars.push({ x: 0, y: markingY, z: centreZ + offset });
      }
    }
    for (const centreX of [-11.5, 11.5]) {
      for (let offset = -2.8; offset <= 2.8; offset += 0.8) {
        crossStreetBars.push({ x: centreX + offset, y: markingY, z: 0 });
      }
    }
    addInstancedBoxes(
      this.root,
      new BoxGeometry(acrossRoadMeters, barThickness, stripeWidth),
      crosswalkMaterial,
      avenueBars,
      'aohara-avenue-zebra-crossings',
    );
    addInstancedBoxes(
      this.root,
      new BoxGeometry(stripeWidth, barThickness, acrossRoadMeters),
      crosswalkMaterial,
      crossStreetBars,
      'aohara-cross-street-zebra-crossings',
    );
    addInstancedBoxes(
      this.root,
      new BoxGeometry(URBAN_CITY_CONFIG.avenue.widthMeters, 0.035, 0.32),
      white,
      [
        { x: 0, y: markingY, z: -13.7 },
        { x: 0, y: markingY, z: 13.7 },
      ],
      'aohara-avenue-stop-lines',
    );
    addInstancedBoxes(
      this.root,
      new BoxGeometry(0.32, 0.035, URBAN_CITY_CONFIG.crossStreet.depthMeters),
      white,
      [
        { x: -17.7, y: markingY, z: 0 },
        { x: 17.7, y: markingY, z: 0 },
      ],
      'aohara-cross-street-stop-lines',
    );
  }

  #buildTowers(towers: readonly TowerSpec[]): void {
    const unitBox = new BoxGeometry(1, 1, 1);
    const groups = new Map<number, TowerSpec[]>();
    for (const tower of towers) {
      const group = groups.get(tower.color) ?? [];
      group.push(tower);
      groups.set(tower.color, group);
    }

    const transform = new Object3D();
    let paletteIndex = 0;
    for (const [color, group] of groups) {
      const wall = createArchitecturalMaterial({
        name: `aohara-tower-facade-pbr-${paletteIndex}`,
        colorHex: color,
        roughness: 0.72,
        metalness: 0.16,
        detailAmplitude: 0.028,
        clearcoat: 0.16,
        clearcoatRoughness: 0.32,
      });
      const mesh = new InstancedMesh(unitBox, wall, group.length);
      mesh.name = `aohara-high-rise-facades-${paletteIndex}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.forEach((tower, index) => {
        transform.position.set(tower.x, WORLD_BASE_Y + tower.height / 2, tower.z);
        transform.scale.set(tower.width, tower.height, tower.depth);
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
      paletteIndex += 1;
    }

    const roofMaterial = createArchitecturalMaterial({
      name: 'aohara-rooftop-caps-pbr',
      colorHex: 0x10161e,
      roughness: 0.86,
      metalness: 0.08,
      detailAmplitude: 0.018,
      clearcoat: 0.08,
      clearcoatRoughness: 0.42,
    });
    const roofs = new InstancedMesh(unitBox, roofMaterial, towers.length);
    roofs.name = 'aohara-rooftop-caps';
    roofs.frustumCulled = false;
    towers.forEach((tower, index) => {
      transform.position.set(tower.x, WORLD_BASE_Y + tower.height + 0.35, tower.z);
      transform.scale.set(tower.width + 0.5, 0.7, tower.depth + 0.5);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      roofs.setMatrixAt(index, transform.matrix);
    });
    roofs.instanceMatrix.needsUpdate = true;
    this.root.add(roofs);
  }

  /** Adds tier-bounded neon crown strips and storefront accents, gated by the shared night gain. */
  #buildNightArchitectureAccents(
    towers: readonly TowerSpec[],
    buildings: readonly CityBuildingSpec[],
  ): NightArchitectureAccentStats {
    const unitBox = new BoxGeometry(1, 1, 1);
    const towerGroups = new Map<number, TransformSpec[]>();
    const storefrontGroups = new Map<number, TransformSpec[]>();
    const addTransform = (
      groups: Map<number, TransformSpec[]>,
      color: number,
      transform: TransformSpec,
    ): void => {
      const group = groups.get(color) ?? [];
      group.push(transform);
      groups.set(color, group);
    };
    const towerStride = this.#tier === 'C' ? 4 : this.#tier === 'B' ? 3 : 2;
    towers.forEach((tower, towerIndex) => {
      if (towerIndex % towerStride !== 0) {
        return;
      }
      const color =
        NIGHT_DECORATION_PALETTE[
          Math.floor(towerIndex / towerStride) % NIGHT_DECORATION_PALETTE.length
        ]!;
      const stripHeight = Math.max(8, tower.height - 10);
      const frontZ = tower.z + tower.depth / 2 + 0.1;
      for (const side of [-1, 1] as const) {
        addTransform(towerGroups, color, {
          x: tower.x + side * (tower.width / 2 + 0.025),
          y: WORLD_BASE_Y + 5 + stripHeight / 2,
          z: frontZ,
          scale: [0.16, stripHeight, 0.12],
        });
      }
      addTransform(towerGroups, color, {
        x: tower.x,
        y: WORLD_BASE_Y + tower.height - 0.7,
        z: frontZ,
        scale: [tower.width * 0.78, 0.14, 0.12],
      });
    });
    for (const [index, [color, transforms]] of [...towerGroups].entries()) {
      addInstancedBoxes(
        this.root,
        unitBox,
        createNightEmissiveMaterial(
          color,
          this.#nightGain,
          `aohara-highrise-night-accent-${index}`,
        ),
        transforms,
        `aohara-highrise-night-accent-strips-${index}`,
      );
    }

    let commercialIndex = 0;
    for (const building of buildings) {
      if (building.kind !== 'shop' && building.kind !== 'casino') {
        continue;
      }
      const color = NIGHT_DECORATION_PALETTE[commercialIndex % NIGHT_DECORATION_PALETTE.length]!;
      commercialIndex += 1;
      const yaw = building.yaw ?? 0;
      const frontDistance = building.width / 2 + 0.16;
      const frontX = building.x + Math.cos(yaw) * frontDistance;
      const frontZ = building.z - Math.sin(yaw) * frontDistance;
      const awningY =
        WORLD_BASE_Y + Math.min(building.height - 1.4, Math.max(2.6, building.height * 0.52));
      const awningLength = Math.min(building.depth * 0.76, building.kind === 'casino' ? 28 : 14);
      addTransform(storefrontGroups, color, {
        x: frontX,
        y: awningY,
        z: frontZ,
        yaw,
        scale: [0.18, 0.16, awningLength],
      });
      for (const side of [-1, 1] as const) {
        const along = (side * awningLength) / 2;
        addTransform(storefrontGroups, color, {
          x: frontX + Math.sin(yaw) * along,
          y: awningY - 0.85,
          z: frontZ + Math.cos(yaw) * along,
          yaw,
          scale: [0.16, 1.7, 0.16],
        });
      }
    }
    for (const [index, [color, transforms]] of [...storefrontGroups].entries()) {
      addInstancedBoxes(
        this.root,
        unitBox,
        createNightEmissiveMaterial(
          color,
          this.#nightGain,
          `aohara-storefront-night-accent-${index}`,
        ),
        transforms,
        `aohara-storefront-night-accents-${index}`,
      );
    }

    return {
      highRiseInstances: [...towerGroups.values()].reduce(
        (total, group) => total + group.length,
        0,
      ),
      storefrontInstances: [...storefrontGroups.values()].reduce(
        (total, group) => total + group.length,
        0,
      ),
    };
  }

  /** Bounded instanced ribs, floor bands, plinths and rooftop plant across all current city buildings. */
  #buildFacadeDetails(
    towers: readonly TowerSpec[],
    buildings: readonly CityBuildingSpec[],
    budget: number,
  ): number {
    const unitBox = new BoxGeometry(1, 1, 1);
    const foundationAndRibTransforms: TransformSpec[] = [];
    const floorBandCandidates: RankedFacadeBand[] = [];
    const rooftopCandidates: TransformSpec[] = [];

    towers.forEach((tower, towerIndex) => {
      for (const sideX of [-1, 1] as const) {
        for (const sideZ of [-1, 1] as const) {
          foundationAndRibTransforms.push({
            x: tower.x + sideX * (tower.width / 2 - 0.11),
            y: WORLD_BASE_Y + tower.height / 2,
            z: tower.z + sideZ * (tower.depth / 2 - 0.11),
            scale: [0.22, tower.height, 0.22],
          });
        }
      }
      const floors = Math.floor((tower.height - 6) / URBAN_CITY_CONFIG.window.floorSpacingMeters);
      for (let floor = 1; floor < floors; floor += 1) {
        floorBandCandidates.push({
          x: tower.x,
          y: WORLD_BASE_Y + 3.1 + (floor - 0.5) * URBAN_CITY_CONFIG.window.floorSpacingMeters,
          z: tower.z,
          scale: [tower.width + 0.24, 0.11, tower.depth + 0.24],
          rank: stableUnit(towerIndex, floor, 641),
        });
      }
      for (const side of [-1, 1] as const) {
        rooftopCandidates.push({
          x: tower.x + side * tower.width * 0.19,
          y: WORLD_BASE_Y + tower.height + 0.62,
          z: tower.z,
          scale: [1.55, 1.08, 1.35],
        });
        rooftopCandidates.push({
          x: tower.x,
          y: WORLD_BASE_Y + tower.height + 0.55,
          z: tower.z + side * tower.depth * 0.18,
          scale: [0.78, 1.2, 0.82],
        });
      }
    });

    buildings.forEach((building, index) => {
      const yaw = building.yaw ?? 0;
      const pitched = hasPitchedRoof(building);
      foundationAndRibTransforms.push({
        x: building.x,
        y: WORLD_BASE_Y + 0.2,
        z: building.z,
        yaw,
        scale: [building.width * 0.96, 0.38, building.depth * 0.96],
      });
      foundationAndRibTransforms.push({
        x: building.x,
        y: WORLD_BASE_Y + building.height - (pitched ? 0.02 : 0.16),
        z: building.z,
        yaw,
        scale: [building.width + 0.25, pitched ? 0.12 : 0.2, building.depth + 0.25],
      });
      if (!pitched) {
        rooftopCandidates.push({
          x: building.x + Math.cos(yaw) * building.width * 0.18,
          y: WORLD_BASE_Y + building.height + 0.55,
          z: building.z - Math.sin(yaw) * building.width * 0.18,
          yaw,
          scale: [1.2, 0.72, 0.92],
        });
      } else if (index % 2 === 0) {
        rooftopCandidates.push({
          x: building.x - Math.sin(yaw) * building.width * 0.18,
          y: WORLD_BASE_Y + building.height + 0.86,
          z: building.z + Math.cos(yaw) * building.width * 0.18,
          yaw,
          scale: [0.52, 1.3, 0.52],
        });
      }
    });

    const selectedRoof = rooftopCandidates.slice(
      0,
      Math.min(rooftopCandidates.length, Math.floor(budget * 0.14)),
    );
    const structuralCapacity = Math.max(0, budget - selectedRoof.length);
    const structuralBase = foundationAndRibTransforms.slice(0, structuralCapacity);
    const remaining = Math.max(0, structuralCapacity - structuralBase.length);
    const selectedBands = floorBandCandidates
      .sort((a, b) => a.rank - b.rank)
      .slice(0, remaining)
      .map(({ x, y, z, scale }) => ({ x, y, z, scale }));
    const structural = [...structuralBase, ...selectedBands];

    if (structural.length > 0) {
      const material = createArchitecturalMaterial({
        name: 'aohara-facade-ribs-and-cornices-pbr',
        colorHex: 0x34414a,
        roughness: 0.54,
        metalness: 0.26,
        detailAmplitude: 0.014,
        clearcoat: 0.14,
        clearcoatRoughness: 0.31,
      });
      const mesh = addInstancedBoxes(
        this.root,
        unitBox,
        material,
        structural,
        'aohara-facade-ribs-cornices-and-plinths',
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    if (selectedRoof.length > 0) {
      const roofMaterial = createArchitecturalMaterial({
        name: 'aohara-rooftop-mechanical-units-pbr',
        colorHex: 0x49535a,
        roughness: 0.48,
        metalness: 0.34,
        detailAmplitude: 0.018,
        clearcoat: 0.2,
        clearcoatRoughness: 0.28,
      });
      const mesh = addInstancedBoxes(
        this.root,
        unitBox,
        roofMaterial,
        selectedRoof,
        'aohara-rooftop-hvac-and-vents',
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    return structural.length + selectedRoof.length;
  }

  #buildCityTypologies(buildings: readonly CityBuildingSpec[]): CityTypologyStats {
    const unitBox = new BoxGeometry(1, 1, 1);
    const wallGroups = new Map<number, TransformSpec[]>();
    const flatRoofGroups = new Map<number, TransformSpec[]>();
    const pitchedRoofGroups = new Map<number, TransformSpec[]>();
    let infillHippedRoofs = 0;
    let infillFlatRoofs = 0;
    for (const building of buildings) {
      const yaw = building.yaw ?? 0;
      const pitched = hasPitchedRoof(building);
      if (building.kind === 'infill') {
        if (pitched) {
          infillHippedRoofs += 1;
        } else {
          infillFlatRoofs += 1;
        }
      }
      const wallTransforms = wallGroups.get(building.color) ?? [];
      wallTransforms.push({
        x: building.x,
        y: WORLD_BASE_Y + building.height / 2,
        z: building.z,
        yaw,
        scale: [building.width, building.height, building.depth],
      });
      wallGroups.set(building.color, wallTransforms);
      this.#buildingColliders.push({
        x: this.#cityOriginX + building.x,
        z: this.#cityOriginZ + building.z,
        yaw,
        halfWidth: building.width / 2,
        halfDepth: building.depth / 2,
      });

      const roofGroups = pitched ? pitchedRoofGroups : flatRoofGroups;
      const roofTransforms = roofGroups.get(building.roofColor) ?? [];
      roofTransforms.push({
        x: building.x,
        y: WORLD_BASE_Y + building.height + (pitched ? 0.72 : 0.28),
        z: building.z,
        yaw: yaw + (pitched ? Math.PI / 4 : 0),
        scale: pitched
          ? [building.width * 0.53, Math.min(2.2, building.height * 0.25), building.depth * 0.53]
          : [building.width + 0.6, 0.56, building.depth + 0.6],
      });
      roofGroups.set(building.roofColor, roofTransforms);
    }

    for (const [index, [color, transforms]] of [...wallGroups].entries()) {
      const material = createArchitecturalMaterial({
        name: `aohara-low-rise-facade-pbr-${index}`,
        colorHex: color,
        roughness: 0.77,
        metalness: 0.06,
        detailAmplitude: 0.025,
        clearcoat: 0.1,
        clearcoatRoughness: 0.38,
      });
      const mesh = addInstancedBoxes(
        this.root,
        unitBox,
        material,
        transforms,
        `aohara-low-rise-facades-${index}`,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    for (const [index, [color, transforms]] of [...flatRoofGroups].entries()) {
      const material = createArchitecturalMaterial({
        name: `aohara-flat-roof-pbr-${index}`,
        colorHex: color,
        roughness: 0.82,
        metalness: 0.08,
        detailAmplitude: 0.02,
        clearcoat: 0.08,
        clearcoatRoughness: 0.42,
      });
      addInstancedBoxes(this.root, unitBox, material, transforms, `aohara-flat-roofs-${index}`);
    }
    const pitchedRoofGeometry = new ConeGeometry(1, 1, 4);
    for (const [index, [color, transforms]] of [...pitchedRoofGroups].entries()) {
      const material = createArchitecturalMaterial({
        name: `aohara-hip-roof-pbr-${index}`,
        colorHex: color,
        roughness: 0.86,
        metalness: 0.04,
        detailAmplitude: 0.018,
        clearcoat: 0.06,
        clearcoatRoughness: 0.46,
      });
      addInstancedBoxes(
        this.root,
        pitchedRoofGeometry,
        material,
        transforms,
        `aohara-hip-roofs-${index}`,
      );
    }

    const stadium = this.#networkIntegrated
      ? { x: 0, z: 460, width: 90, depth: 70, height: 14 }
      : { x: 60, z: -88, width: 30, depth: 24, height: 8 };
    const stadiumWallMaterial = createArchitecturalMaterial({
      name: 'aohara-stadium-concrete-and-steel-shell-pbr',
      colorHex: 0x3b4650,
      roughness: 0.68,
      metalness: 0.12,
      detailAmplitude: 0.022,
      clearcoat: 0.12,
      clearcoatRoughness: 0.34,
    });
    const stadiumThickness = this.#networkIntegrated ? 8 : 2.2;
    const stadiumWalls: TransformSpec[] = [
      {
        x: stadium.x,
        y: WORLD_BASE_Y + stadium.height / 2,
        z: stadium.z - stadium.depth / 2 + stadiumThickness / 2,
        scale: [stadium.width, stadium.height, stadiumThickness],
      },
      {
        x: stadium.x,
        y: WORLD_BASE_Y + stadium.height / 2,
        z: stadium.z + stadium.depth / 2 - stadiumThickness / 2,
        scale: [stadium.width, stadium.height, stadiumThickness],
      },
      {
        x: stadium.x - stadium.width / 2 + stadiumThickness / 2,
        y: WORLD_BASE_Y + stadium.height / 2,
        z: stadium.z,
        scale: [stadiumThickness, stadium.height, stadium.depth - 2 * stadiumThickness],
      },
      {
        x: stadium.x + stadium.width / 2 - stadiumThickness / 2,
        y: WORLD_BASE_Y + stadium.height / 2,
        z: stadium.z,
        scale: [stadiumThickness, stadium.height, stadium.depth - 2 * stadiumThickness],
      },
    ];
    addInstancedBoxes(
      this.root,
      unitBox,
      stadiumWallMaterial,
      stadiumWalls,
      'aohara-stadium-open-bowl-shell',
    );
    const field = new MeshStandardNodeMaterial();
    field.color.setHex(0x274d3a);
    field.roughness = 0.91;
    field.name = 'aohara-stadium-field';
    addBox(
      this.root,
      [stadium.width - 4 * stadiumThickness, 0.16, stadium.depth - 4 * stadiumThickness],
      [stadium.x, WORLD_BASE_Y + 1.15, stadium.z],
      field,
      'aohara-stadium-playing-field',
    );
    const seatMaterial = new MeshStandardNodeMaterial();
    seatMaterial.color.setHex(0x6c7a7e);
    seatMaterial.roughness = 0.84;
    seatMaterial.name = 'aohara-stadium-seating';
    const seatRows: TransformSpec[] = [];
    const seatRowsCount = this.#networkIntegrated ? 3 : 2;
    for (let row = 0; row < seatRowsCount; row += 1) {
      const rise = 2.2 + row * 1.4;
      const inset = stadiumThickness + 2 + row * 2.2;
      seatRows.push(
        {
          x: stadium.x,
          y: WORLD_BASE_Y + rise,
          z: stadium.z - stadium.depth / 2 + inset,
          scale: [stadium.width - 2 * stadiumThickness, 0.62, 1.6],
        },
        {
          x: stadium.x,
          y: WORLD_BASE_Y + rise,
          z: stadium.z + stadium.depth / 2 - inset,
          scale: [stadium.width - 2 * stadiumThickness, 0.62, 1.6],
        },
        {
          x: stadium.x - stadium.width / 2 + inset,
          y: WORLD_BASE_Y + rise,
          z: stadium.z,
          scale: [1.6, 0.62, stadium.depth - 2 * stadiumThickness],
        },
        {
          x: stadium.x + stadium.width / 2 - inset,
          y: WORLD_BASE_Y + rise,
          z: stadium.z,
          scale: [1.6, 0.62, stadium.depth - 2 * stadiumThickness],
        },
      );
    }
    addInstancedBoxes(this.root, unitBox, seatMaterial, seatRows, 'aohara-stadium-stepped-seating');
    const stadiumLightMaterial = createNightEmissiveMaterial(
      0x80d8df,
      this.#nightGain,
      'aohara-stadium-roof-edge-lights',
    );
    const stadiumRing: TransformSpec[] = [
      {
        x: stadium.x,
        y: WORLD_BASE_Y + stadium.height + 0.2,
        z: stadium.z - stadium.depth / 2 + 2,
        scale: [stadium.width, 0.32, 0.72],
      },
      {
        x: stadium.x,
        y: WORLD_BASE_Y + stadium.height + 0.2,
        z: stadium.z + stadium.depth / 2 - 2,
        scale: [stadium.width, 0.32, 0.72],
      },
      {
        x: stadium.x - stadium.width / 2 + 2,
        y: WORLD_BASE_Y + stadium.height + 0.2,
        z: stadium.z,
        scale: [0.72, 0.32, stadium.depth - 4],
      },
      {
        x: stadium.x + stadium.width / 2 - 2,
        y: WORLD_BASE_Y + stadium.height + 0.2,
        z: stadium.z,
        scale: [0.72, 0.32, stadium.depth - 4],
      },
    ];
    addInstancedBoxes(
      this.root,
      unitBox,
      stadiumLightMaterial,
      stadiumRing,
      'aohara-stadium-night-roof-ring',
    );
    this.#buildingColliders.push({
      x: this.#cityOriginX + stadium.x,
      z: this.#cityOriginZ + stadium.z,
      yaw: 0,
      halfWidth: stadium.width / 2,
      halfDepth: stadium.depth / 2,
    });
    const roofEdgeOffsetX = stadium.width / 2 - 3;
    const roofEdgeOffsetZ = stadium.depth / 2 - 3;
    this.#architecturalLightCandidates.push(
      {
        position: [stadium.x, WORLD_BASE_Y + stadium.height + 1.2, stadium.z - roofEdgeOffsetZ],
        color: 0xa6f3ee,
        intensity: 32,
        distance: this.#networkIntegrated ? 82 : 54,
        source: 'stadium',
      },
      {
        position: [stadium.x, WORLD_BASE_Y + stadium.height + 1.2, stadium.z + roofEdgeOffsetZ],
        color: 0xa6f3ee,
        intensity: 32,
        distance: this.#networkIntegrated ? 82 : 54,
        source: 'stadium',
      },
      {
        position: [stadium.x - roofEdgeOffsetX, WORLD_BASE_Y + stadium.height + 1.2, stadium.z],
        color: 0x9edcff,
        intensity: 28,
        distance: this.#networkIntegrated ? 76 : 48,
        source: 'stadium',
      },
      {
        position: [stadium.x + roofEdgeOffsetX, WORLD_BASE_Y + stadium.height + 1.2, stadium.z],
        color: 0x9edcff,
        intensity: 28,
        distance: this.#networkIntegrated ? 76 : 48,
        source: 'stadium',
      },
    );

    const lanternMaterial = createNightEmissiveMaterial(
      0xffbd72,
      this.#nightGain,
      'aohara-building-entry-lanterns',
    );
    const lanternTransforms: TransformSpec[] = [];
    for (const [index, building] of buildings.entries()) {
      const yaw = building.yaw ?? 0;
      const frontX = building.x + Math.cos(yaw) * (building.width / 2 + 0.42);
      const frontZ = building.z - Math.sin(yaw) * (building.width / 2 + 0.42);
      const lanternY =
        WORLD_BASE_Y + Math.min(building.height - 0.8, Math.max(2.5, building.height * 0.58));
      lanternTransforms.push({
        x: frontX,
        y: lanternY,
        z: frontZ,
        yaw,
        scale: [0.42, 0.62, 0.42],
      });
      this.#architecturalLightCandidates.push({
        position: [frontX + Math.cos(yaw) * 0.65, lanternY, frontZ - Math.sin(yaw) * 0.65],
        color: building.kind === 'casino' ? 0xffd285 : 0xffbd72,
        intensity:
          building.kind === 'casino'
            ? 20
            : building.kind === 'shop'
              ? 14
              : building.kind === 'mansion'
                ? 9
                : 7,
        distance: building.kind === 'casino' ? 46 : building.kind === 'shop' ? 30 : 22,
        source:
          building.kind === 'casino' ? 'casino' : building.kind === 'shop' ? 'shop' : 'lantern',
      });
      if (index % 3 === 0) {
        lanternTransforms[lanternTransforms.length - 1] = {
          ...lanternTransforms[lanternTransforms.length - 1]!,
          scale: [0.5, 0.74, 0.5],
        };
      }
    }
    if (lanternTransforms.length > 0) {
      addInstancedBoxes(
        this.root,
        new SphereGeometry(1, 8, 6),
        lanternMaterial,
        lanternTransforms,
        'aohara-low-rise-entry-lanterns',
      );
    }

    const billboardColors = NIGHT_DECORATION_PALETTE;
    const billboards: BillboardSpec[] = [];
    const attachedBuildings = buildings.filter(
      (building) => building.kind === 'shop' || building.kind === 'casino',
    );
    attachedBuildings.forEach((building, index) => {
      const yaw = building.yaw ?? 0;
      const distance = building.width / 2 + 0.18;
      const color = billboardColors[index % billboardColors.length]!;
      billboards.push({
        x: building.x + Math.cos(yaw) * distance,
        y: WORLD_BASE_Y + building.height + 0.82,
        z: building.z - Math.sin(yaw) * distance,
        yaw,
        width: building.kind === 'casino' ? 8.5 : 5.4,
        height: building.kind === 'casino' ? 1.8 : 1.35,
        color,
        lightColor: color,
      });
    });
    for (const [index, side] of [-1, 1].entries()) {
      for (const z of this.#networkIntegrated ? [-240, -80, 80, 240] : [-70, -22, 25, 52]) {
        const color =
          billboardColors[(index + Math.abs(Math.trunc(z / 16))) % billboardColors.length]!;
        billboards.push({
          x: side * 16.4,
          y: WORLD_BASE_Y + 4.5,
          z,
          yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          width: this.#networkIntegrated ? 5.8 : 3.8,
          height: this.#networkIntegrated ? 2.2 : 1.6,
          color,
          lightColor: color,
        });
      }
    }
    for (const [index, side] of [-1, 1].entries()) {
      const yaw = index === 0 ? 0 : Math.PI / 2;
      billboards.push({
        x: stadium.x + side * (yaw === 0 ? 0 : stadium.width / 2 - 4),
        y: WORLD_BASE_Y + stadium.height + 1.35,
        z: stadium.z + (yaw === 0 ? side * (stadium.depth / 2 - 4) : 0),
        yaw,
        width: this.#networkIntegrated ? 10 : 4.6,
        height: this.#networkIntegrated ? 2.3 : 1.4,
        color: billboardColors[(index + 1) % billboardColors.length]!,
        lightColor: 0xa6f3ee,
      });
    }
    // A second pair on the stadium's other two sides makes it read as a venue, not a glowing box.
    for (const side of [-1, 1]) {
      billboards.push({
        x: stadium.x + side * (stadium.width / 2 - 4),
        y: WORLD_BASE_Y + stadium.height + 1.35,
        z: stadium.z,
        yaw: Math.PI / 2,
        width: this.#networkIntegrated ? 10 : 4.6,
        height: this.#networkIntegrated ? 2.3 : 1.4,
        color: billboardColors[side < 0 ? 0 : 2]!,
        lightColor: 0x9edcff,
      });
    }

    const billboardGroups = new Map<number, TransformSpec[]>();
    billboards.forEach((billboard) => {
      const group = billboardGroups.get(billboard.color) ?? [];
      group.push({
        x: billboard.x,
        y: billboard.y,
        z: billboard.z,
        yaw: billboard.yaw ?? 0,
        scale: [billboard.width, billboard.height, 0.18],
      });
      billboardGroups.set(billboard.color, group);
      this.#architecturalLightCandidates.push({
        position: [billboard.x, billboard.y, billboard.z],
        color: billboard.lightColor,
        intensity: 12,
        distance: 34,
        source: 'billboard',
      });
    });
    for (const [index, [color, transforms]] of [...billboardGroups].entries()) {
      addInstancedBoxes(
        this.root,
        unitBox,
        createNightEmissiveMaterial(color, this.#nightGain, `aohara-billboard-glow-${index}`),
        transforms,
        `aohara-abstract-billboards-${index}`,
      );
    }
    const roadsideBillboards = billboards.slice(
      attachedBuildings.length,
      attachedBuildings.length + 8,
    );
    if (roadsideBillboards.length > 0) {
      const posts = roadsideBillboards.map((billboard) => {
        const postBottom = WORLD_BASE_Y + 0.32;
        const postTop = billboard.y - billboard.height / 2;
        const postHeight = postTop - postBottom;
        return {
          x: billboard.x,
          y: (postTop + postBottom) / 2,
          z: billboard.z,
          yaw: billboard.yaw ?? 0,
          scale: [0.16, postHeight, 0.16] as const,
        };
      });
      const postMaterial = new MeshStandardNodeMaterial();
      postMaterial.color.setHex(0x424b53);
      postMaterial.roughness = 0.62;
      postMaterial.metalness = 0.48;
      postMaterial.name = 'aohara-billboard-support-metal';
      addInstancedBoxes(this.root, unitBox, postMaterial, posts, 'aohara-billboard-support-posts');
    }

    return {
      stadiums: 1,
      infillBuildings: buildings.filter((building) => building.kind === 'infill').length,
      infillHippedRoofs,
      infillFlatRoofs,
      frontageBuildings: buildings.filter((building) => building.frontage === true).length,
      casinos: buildings.filter((building) => building.kind === 'casino').length,
      mansions: buildings.filter((building) => building.kind === 'mansion').length,
      houses: buildings.filter((building) => building.kind === 'house').length,
      townhouses: buildings.filter((building) => building.kind === 'townhouse').length,
      shops: buildings.filter((building) => building.kind === 'shop').length,
      billboards: billboards.length,
      districtBanners: 0,
      decorativeLights: lanternTransforms.length + billboards.length + stadiumRing.length,
    };
  }

  #buildStreetLights(
    pointLightBudget: number,
    roadNetwork: RoadNetwork | undefined,
    originX: number,
    originZ: number,
  ): StreetLampBuildStats {
    const poleMaterial = new MeshStandardNodeMaterial();
    poleMaterial.color.setHex(0x39414a);
    poleMaterial.roughness = 0.52;
    poleMaterial.metalness = 0.68;
    poleMaterial.name = 'aohara-lamp-pole-metal';

    let placements: readonly StreetLampPlacement[];
    if (this.#networkIntegrated && roadNetwork !== undefined) {
      placements = createStreetLampPlacements(roadNetwork, originX, originZ);
    } else {
      placements = URBAN_CITY_CONFIG.streetLamp.spacingPositionsZ.flatMap((z) =>
        ([-1, 1] as const).map((side) => {
          const x = side * URBAN_CITY_CONFIG.streetLamp.sideXMeters;
          const yaw = side < 0 ? 0 : Math.PI;
          const bulbY = WORLD_BASE_Y + URBAN_CITY_CONFIG.streetLamp.heightMeters - 0.4;
          return {
            pole: { x, y: WORLD_BASE_Y, z, yaw },
            bulb: [x + (side < 0 ? 1.88 : -1.88), bulbY, z] as const,
          };
        }),
      );
    }

    if (placements.length > 0) {
      addInstancedBoxes(
        this.root,
        createLampGeometry(),
        poleMaterial,
        placements.map((placement) => placement.pole),
        'aohara-street-lamp-poles',
      );
    }

    const bannerPalette = NIGHT_DECORATION_PALETTE;
    const bannerGroups = new Map<number, TransformSpec[]>();
    const bannerStride = this.#networkIntegrated ? 4 : 2;
    const bannerPlacements = placements
      .filter((_, index) => index % bannerStride === 0)
      .map((placement, index) => {
        const transform: TransformSpec = {
          x: placement.pole.x + (placement.pole.yaw === 0 ? 0.2 : -0.2),
          y: WORLD_BASE_Y + 4.1,
          z: placement.pole.z,
          yaw: placement.pole.yaw ?? 0,
          scale: [index % 2 === 0 ? 0.88 : 0.68, index % 3 === 0 ? 1.75 : 1.4, 0.12],
        };
        const color = bannerPalette[index % bannerPalette.length]!;
        const group = bannerGroups.get(color) ?? [];
        group.push(transform);
        bannerGroups.set(color, group);
        return transform;
      });
    for (const [index, [color, transforms]] of [...bannerGroups].entries()) {
      const material = createNightEmissiveMaterial(
        color,
        this.#nightGain,
        `aohara-district-banner-${index}`,
      );
      addInstancedBoxes(
        this.root,
        new BoxGeometry(1, 1, 1),
        material,
        transforms,
        `aohara-street-banner-panels-${index}`,
      );
    }

    const emitterGeometry = new SphereGeometry(0.25, 10, 8);
    const bulbPositions = placements.map((placement) => placement.bulb);
    this.#streetLightCandidates.push(...bulbPositions);
    const emitterGroups = new Map<number, TransformSpec[]>();
    for (const [x, y, z] of bulbPositions) {
      const color = STREET_LAMP_PALETTE[streetLampPaletteIndex([x, y, z])]!;
      const group = emitterGroups.get(color) ?? [];
      group.push({ x, y, z });
      emitterGroups.set(color, group);
    }
    for (const [index, [color, transforms]] of [...emitterGroups].entries()) {
      const tint = new Color(color);
      const emitter = new MeshBasicNodeMaterial();
      emitter.colorNode = vec4(vec3(tint.r, tint.g, tint.b).mul(this.#nightGain), 1);
      emitter.toneMapped = false;
      emitter.name = `aohara-street-lamp-emitter-${index}`;
      addInstancedBoxes(
        this.root,
        emitterGeometry,
        emitter,
        transforms,
        `aohara-street-lamp-emitters-${index}`,
      );
    }

    const bollardStride = pointLightBudget === 4 ? 12 : pointLightBudget === 6 ? 8 : 6;
    const bollardGroups = new Map<number, TransformSpec[]>();
    let bollardCount = 0;
    let moodLightCandidateCount = 0;
    placements.forEach((placement, index) => {
      if (index % bollardStride !== 0) {
        return;
      }
      const yaw = placement.pole.yaw ?? 0;
      const x = placement.pole.x - Math.cos(yaw) * 1.28;
      const z = placement.pole.z + Math.sin(yaw) * 1.28;
      const color = NIGHT_DECORATION_PALETTE[bollardCount % NIGHT_DECORATION_PALETTE.length]!;
      const group = bollardGroups.get(color) ?? [];
      group.push({ x, y: WORLD_BASE_Y + 0.46, z });
      bollardGroups.set(color, group);
      bollardCount += 1;

      // Every second curb beacon can supply a low-energy, local road-edge pool when it is among
      // the nearest architecture lights. Active point-light totals remain within the C/B/A cap.
      if ((bollardCount - 1) % 2 === 0) {
        this.#architecturalLightCandidates.push({
          position: [x, WORLD_BASE_Y + 0.82, z],
          color,
          intensity: 7.5,
          distance: 24,
          source: 'mood',
        });
        moodLightCandidateCount += 1;
      }
    });
    const bollardGeometry = new CylinderGeometry(0.13, 0.18, 0.92, 8);
    for (const [index, [color, transforms]] of [...bollardGroups].entries()) {
      const bollards = addInstancedBoxes(
        this.root,
        bollardGeometry,
        createNightEmissiveMaterial(color, this.#nightGain, `aohara-curb-bollard-glow-${index}`),
        transforms,
        `aohara-sidewalk-light-bollards-${index}`,
      );
      bollards.castShadow = false;
      bollards.receiveShadow = false;
    }

    const defaultSpawnZ = -AOHARA_DISTRICT_CONFIG.gridSpacingMeters / 2;
    const budgetedPositions = this.#networkIntegrated
      ? selectNearestStreetLights(bulbPositions, pointLightBudget, 0, defaultSpawnZ)
      : bulbPositions.slice(0, pointLightBudget);
    budgetedPositions.forEach((position, index) => {
      const [x, y, z] = position;
      const paletteIndex = streetLampPaletteIndex(position);
      const light = new PointLight(
        STREET_LAMP_PALETTE[paletteIndex]!,
        URBAN_CITY_CONFIG.streetLamp.pointLightIntensity *
          this.#nightGain.value *
          this.#streetLightSpatialGain,
        URBAN_CITY_CONFIG.streetLamp.pointLightDistanceMeters,
        2,
      );
      light.position.set(x, y, z);
      light.name = `aohara-streetlight-point-${index + 1}`;
      light.castShadow = false;
      this.root.add(light);
      this.#streetLights.push(light);

      const flare = new Sprite(this.#streetLightFlareMaterials[paletteIndex]!);
      flare.position.set(x, y, z);
      flare.scale.setScalar(URBAN_CITY_CONFIG.streetLamp.haloScaleMeters);
      flare.visible = this.#streetLightSpatialGain > 0;
      flare.name = `aohara-streetlight-gaussian-flare-${index + 1}`;
      this.root.add(flare);
      this.#streetLightFlares.push(flare);
    });
    return {
      poleCount: placements.length,
      bannerCount: bannerPlacements.length,
      bollardCount,
      moodLightCandidateCount,
    };
  }

  #buildArchitecturalLights(pointLightBudget: number): void {
    const focusZ = this.#networkIntegrated ? -AOHARA_DISTRICT_CONFIG.gridSpacingMeters / 2 : 0;
    this.#updateArchitecturalLightSelection(0, focusZ, 1);
    this.#activeArchitecturalCandidates.forEach((candidate, index) => {
      const light = new PointLight(
        candidate.color,
        candidate.intensity * this.#nightGain.value,
        candidate.distance,
        2,
      );
      light.position.set(...candidate.position);
      light.name = `aohara-architecture-${candidate.source}-point-${index + 1}`;
      light.castShadow = false;
      this.root.add(light);
      this.#architecturalLights.push(light);

      const flareMaterial = this.#architecturalFlareMaterials.get(candidate.color);
      if (flareMaterial === undefined) {
        throw new Error(`missing Aohara architectural flare material for ${candidate.color}`);
      }
      const flare = new Sprite(flareMaterial);
      flare.position.set(...candidate.position);
      flare.scale.setScalar(architecturalFlareScale(candidate.source));
      flare.visible = true;
      flare.name = `aohara-architecture-${candidate.source}-diffraction-${index + 1}`;
      this.root.add(flare);
      this.#architecturalFlares.push(flare);
    });
    // Retain the tier cap as a hard assertion for future candidate additions.
    if (this.#architecturalLights.length > pointLightBudget) {
      throw new Error('Aohara architectural light tier budget exceeded.');
    }
    this.#setArchitecturalLightIntensity();
  }

  #updateArchitecturalLightSelection(focusX: number, focusZ: number, coverage: number): void {
    const nearest = selectNearestArchitecturalLights(
      this.#architecturalLightCandidates,
      this.#architecturalLightBudget,
      focusX,
      focusZ,
    );
    this.#activeArchitecturalCandidates.splice(
      0,
      this.#activeArchitecturalCandidates.length,
      ...nearest,
    );
    this.#architecturalLightSpatialGain = coverage;
    this.#architecturalLightGain.value = coverage;
    nearest.forEach((candidate, index) => {
      const light = this.#architecturalLights[index];
      const flare = this.#architecturalFlares[index];
      if (light === undefined || flare === undefined) {
        return;
      }
      light.position.set(...candidate.position);
      light.color.setHex(candidate.color);
      light.distance = candidate.distance;
      flare.position.set(...candidate.position);
      const flareMaterial = this.#architecturalFlareMaterials.get(candidate.color);
      if (flareMaterial !== undefined) {
        flare.material = flareMaterial;
      }
      flare.scale.setScalar(architecturalFlareScale(candidate.source));
      flare.visible = coverage > 0;
    });
    this.#setArchitecturalLightIntensity();
  }

  #buildSignals(signalFlares: Readonly<Record<TrafficSignalAspect, SpriteNodeMaterial>>): void {
    const poleMaterial = new MeshStandardNodeMaterial();
    poleMaterial.color.setHex(0x313a42);
    poleMaterial.roughness = 0.56;
    poleMaterial.metalness = 0.62;
    poleMaterial.name = 'aohara-signal-pole-metal';
    const signalPoleGeometry = new CylinderGeometry(0.12, 0.16, 6.2, 8);
    for (const [index, x] of [-11.5, 11.5].entries()) {
      const pole = new Mesh(signalPoleGeometry, poleMaterial);
      pole.position.set(x, WORLD_BASE_Y + 3.1, index === 0 ? -1.5 : 1.5);
      pole.name = `aohara-signal-post-${index + 1}`;
      pole.castShadow = true;
      this.root.add(pole);

      const z = index === 0 ? -1.5 : 1.5;
      const head = createSignalHead(
        this.root,
        [x, WORLD_BASE_Y + 5.15, z + (index === 0 ? 0.25 : -0.25)],
        signalFlares,
        `aohara-signal-${index === 0 ? 'avenue' : 'cross-street'}`,
      );
      this.#signalHeads.push(head);
    }
  }

  #setStreetLightIntensity(): void {
    const intensity =
      URBAN_CITY_CONFIG.streetLamp.pointLightIntensity *
      this.#nightGain.value *
      this.#streetLightSpatialGain;
    for (const light of this.#streetLights) {
      light.intensity = intensity;
    }
  }

  #setArchitecturalLightIntensity(): void {
    this.#architecturalLights.forEach((light, index) => {
      const candidate = this.#activeArchitecturalCandidates[index];
      light.intensity =
        (candidate?.intensity ?? 0) * this.#nightGain.value * this.#architecturalLightSpatialGain;
    });
  }

  #synchronizeSignals(): void {
    const mainAspect = resolveTrafficSignalAspect(this.#signalSeconds);
    const crossAspect = resolveTrafficSignalAspect(
      this.#signalSeconds,
      URBAN_CITY_CONFIG.trafficSignal.opposingPhaseOffsetSeconds,
    );
    if (this.#signalHeads[0] !== undefined) {
      applySignalAspect(this.#signalHeads[0], mainAspect);
    }
    if (this.#signalHeads[1] !== undefined) {
      applySignalAspect(this.#signalHeads[1], crossAspect);
    }
  }
}

/** Scene-content factory used by the dedicated `?scene=city` look-dev composition root. */
export function createUrbanNightWorld(context: SceneContentContext): UrbanNightWorld {
  const tier: TierId =
    context.qualityTier === 'A' || context.qualityTier === 'B' ? context.qualityTier : 'C';
  return new UrbanNightWorld(tier);
}
