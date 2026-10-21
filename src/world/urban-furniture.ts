import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uv, vec2, vertexColor } from 'three/tsl';

import { configureTiledSurface, SurfaceTextureLibrary } from '../assets/SurfaceTextureLibrary';
import { bindScannedPbrMaps } from './scanned-pbr';

import {
  URBAN_CITY_CONFIG,
  URBAN_STREET_FURNITURE_CONFIG,
  URBAN_STREET_FURNITURE_TIER_BUDGET,
  type UrbanStreetFurnitureTierBudget,
} from '../config/urban-city';
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
import { DEFAULT_SPAWN_ID, SPAWN_POINTS } from '../config/spawns';
import type { TierId } from '../config/tiers';
import type { RoadEdge, RoadNetwork } from './road-network';
import type { StaticBuildingBox } from './static-building-collision';

export type UrbanStreetFurnitureKind = 'bench' | 'planter' | 'wasteBin' | 'bicycleRack';

type FurnitureBudgetKey = keyof UrbanStreetFurnitureTierBudget;

interface FurnitureDimensions {
  /** Half-width across the sidewalk in the local X axis. */
  readonly halfWidthMeters: number;
  /** Half-length along the sidewalk in the local Z axis. */
  readonly halfDepthMeters: number;
}

const FURNITURE_BUDGET_KEY: Readonly<Record<UrbanStreetFurnitureKind, FurnitureBudgetKey>> = {
  bench: 'benches',
  planter: 'planters',
  wasteBin: 'wasteBins',
  bicycleRack: 'bicycleRacks',
};

const FURNITURE_DIMENSIONS: Readonly<Record<UrbanStreetFurnitureKind, FurnitureDimensions>> = {
  bench: { halfWidthMeters: 0.35, halfDepthMeters: 0.82 },
  planter: { halfWidthMeters: 0.44, halfDepthMeters: 0.67 },
  wasteBin: { halfWidthMeters: 0.3, halfDepthMeters: 0.32 },
  bicycleRack: { halfWidthMeters: 0.36, halfDepthMeters: 0.18 },
};

const FURNITURE_KINDS: readonly UrbanStreetFurnitureKind[] = [
  'bench',
  'planter',
  'wasteBin',
  'bicycleRack',
];
const MAX_FURNITURE_HALF_WIDTH_METERS = Math.max(
  ...Object.values(FURNITURE_DIMENSIONS).map((dimensions) => dimensions.halfWidthMeters),
);
const SIDEWALK_LIFT_METERS = 0.16;

export interface UrbanStreetFurniturePlacement {
  readonly slotId: string;
  readonly kind: UrbanStreetFurnitureKind;
  /** World-space position; the renderer subtracts the Aohara content origin when instancing. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly roadEdgeId: string;
  readonly alongMeters: number;
  readonly side: -1 | 1;
  readonly halfWidthMeters: number;
  readonly halfDepthMeters: number;
}

interface CandidateSlot {
  readonly slotId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly roadEdgeId: string;
  readonly alongMeters: number;
  readonly side: -1 | 1;
}

interface RoadPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly tangentX: number;
  readonly tangentZ: number;
}

export interface UrbanStreetFurnitureOptions {
  readonly networkIntegrated: boolean;
  readonly roadNetwork?: RoadNetwork;
  readonly origin: readonly [number, number, number];
  readonly buildingFootprints: readonly StaticBuildingBox[];
  /** Shared per-world owner for scanned CC0 wood/concrete map sets. */
  readonly surfaceTextures?: SurfaceTextureLibrary;
}

function roadPositionAt(edge: RoadEdge, distanceMeters: number): RoadPosition {
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
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
    tangentX: tangentX / tangentLength,
    tangentZ: tangentZ / tangentLength,
  };
}

function stablePriority(key: string, salt: number): number {
  let hash = (0x811c9dc5 ^ Math.imul(salt + 1, 0x45d9f3b)) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 0x1_0000_0000;
}

function footprintSeparation(a: StaticBuildingBox, b: StaticBuildingBox): number {
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
      const aRadius =
        a.halfWidth * Math.abs(aAxes[0]![0] * axisX + aAxes[0]![1] * axisZ) +
        a.halfDepth * Math.abs(aAxes[1]![0] * axisX + aAxes[1]![1] * axisZ);
      const bRadius =
        b.halfWidth * Math.abs(bAxes[0]![0] * axisX + bAxes[0]![1] * axisZ) +
        b.halfDepth * Math.abs(bAxes[1]![0] * axisX + bAxes[1]![1] * axisZ);
      return centerDistance - aRadius - bRadius;
    }),
  );
}

function asFootprint(
  placement: Pick<
    UrbanStreetFurniturePlacement,
    'x' | 'z' | 'yaw' | 'halfWidthMeters' | 'halfDepthMeters'
  >,
): StaticBuildingBox {
  return {
    x: placement.x,
    z: placement.z,
    yaw: placement.yaw,
    halfWidth: placement.halfWidthMeters,
    halfDepth: placement.halfDepthMeters,
  };
}

function roadAndWalkwayClearanceIsValid(network: RoadNetwork, slot: CandidateSlot): boolean {
  const sample = network.sample(slot.x, slot.z);
  if (
    sample === null ||
    (sample.roadClass !== 'urban-local' && sample.roadClass !== 'urban-arterial')
  ) {
    return false;
  }
  const innerClearance =
    sample.distance -
    sample.halfWidthMeters -
    sample.shoulderMeters -
    MAX_FURNITURE_HALF_WIDTH_METERS;
  const sidewalkOuterEdge =
    sample.halfWidthMeters + sample.shoulderMeters + URBAN_CITY_CONFIG.sidewalk.widthMeters;
  const curbClearance = sidewalkOuterEdge - sample.distance - MAX_FURNITURE_HALF_WIDTH_METERS;
  return (
    innerClearance + 1e-4 >= URBAN_STREET_FURNITURE_CONFIG.minimumWalkwayClearanceMeters &&
    curbClearance + 1e-4 >= URBAN_STREET_FURNITURE_CONFIG.outerCurbMarginMeters
  );
}

function buildCandidateSlots(network: RoadNetwork): CandidateSlot[] {
  const slots: CandidateSlot[] = [];
  const { slotSpacingMeters, slotPhaseMeters, intersectionClearanceMeters } =
    URBAN_STREET_FURNITURE_CONFIG;
  const sidewalk = URBAN_CITY_CONFIG.sidewalk;
  const lateralOffsetFromInnerEdge =
    sidewalk.widthMeters -
    URBAN_STREET_FURNITURE_CONFIG.outerCurbMarginMeters -
    MAX_FURNITURE_HALF_WIDTH_METERS -
    URBAN_STREET_FURNITURE_CONFIG.additionalCurbInsetMeters;
  const maximumCrosswalkApproachMeters =
    Math.max(
      AOHARA_DISTRICT_CONFIG.arterialHalfWidthMeters,
      AOHARA_DISTRICT_CONFIG.localStreetHalfWidthMeters,
    ) + 3.8;
  const maximumRoadMarkingApproachMeters = Math.max(
    maximumCrosswalkApproachMeters,
    URBAN_CITY_CONFIG.trafficSignal.stopLineOffsetMeters,
  );
  const markingClearance = URBAN_STREET_FURNITURE_CONFIG.minimumRoadMarkingClearanceMeters;
  const spawn = SPAWN_POINTS.find((point) => point.id === DEFAULT_SPAWN_ID);

  for (const edge of network.edges) {
    if (edge.roadClass !== 'urban-local' && edge.roadClass !== 'urban-arterial') {
      continue;
    }
    for (
      let alongMeters = slotPhaseMeters;
      alongMeters <= edge.lengthMeters - slotPhaseMeters;
      alongMeters += slotSpacingMeters
    ) {
      const endpointClearanceMeters = Math.min(alongMeters, edge.lengthMeters - alongMeters);
      if (endpointClearanceMeters < intersectionClearanceMeters) {
        continue;
      }
      if (
        endpointClearanceMeters -
          maximumRoadMarkingApproachMeters -
          Math.max(
            ...Object.values(FURNITURE_DIMENSIONS).map((dimensions) => dimensions.halfDepthMeters),
          ) <
        markingClearance
      ) {
        continue;
      }
      const point = roadPositionAt(edge, alongMeters);
      const innerEdgeOffset = edge.halfWidthMeters + edge.shoulderMeters;
      const sidewalkOffset = innerEdgeOffset + lateralOffsetFromInnerEdge;
      for (const side of [-1, 1] as const) {
        const outwardX = point.tangentZ * side;
        const outwardZ = -point.tangentX * side;
        const slot: CandidateSlot = {
          slotId: `${edge.id}:${side}:${Math.round(alongMeters * 100)}`,
          x: point.x + outwardX * sidewalkOffset,
          y: point.y + SIDEWALK_LIFT_METERS,
          z: point.z + outwardZ * sidewalkOffset,
          // Local X points inward from the sidewalk edge; local Z stays aligned with the street.
          yaw: Math.atan2(point.tangentX, point.tangentZ) + (side > 0 ? Math.PI : 0),
          roadEdgeId: edge.id,
          alongMeters,
          side,
        };
        if (
          spawn !== undefined &&
          Math.hypot(slot.x - spawn.x, slot.z - spawn.z) <
            URBAN_STREET_FURNITURE_CONFIG.spawnClearanceMeters
        ) {
          continue;
        }
        if (roadAndWalkwayClearanceIsValid(network, slot)) {
          slots.push(slot);
        }
      }
    }
  }
  return slots;
}

function makePlacement(
  slot: CandidateSlot,
  kind: UrbanStreetFurnitureKind,
): UrbanStreetFurniturePlacement {
  return {
    slotId: slot.slotId,
    kind,
    x: slot.x,
    y: slot.y,
    z: slot.z,
    yaw: slot.yaw,
    roadEdgeId: slot.roadEdgeId,
    alongMeters: slot.alongMeters,
    side: slot.side,
    ...FURNITURE_DIMENSIONS[kind],
  };
}

/** Deterministic, clearance-tested Aohara furniture slots; all per-kind tier budgets are hard caps. */
export function generateAoharaStreetFurniturePlacements(
  network: RoadNetwork,
  tier: TierId,
  buildingFootprints: readonly StaticBuildingBox[] = [],
): UrbanStreetFurniturePlacement[] {
  const candidates = buildCandidateSlots(network);
  const budget = URBAN_STREET_FURNITURE_TIER_BUDGET[tier];
  const selected: UrbanStreetFurniturePlacement[] = [];
  const usedSlots = new Set<string>();

  FURNITURE_KINDS.forEach((kind, kindIndex) => {
    const targetCount = budget[FURNITURE_BUDGET_KEY[kind]];
    const rankedCandidates = candidates
      .filter((candidate) => !usedSlots.has(candidate.slotId))
      .sort((a, b) => {
        const scoreDifference =
          stablePriority(a.slotId, kindIndex + 17) - stablePriority(b.slotId, kindIndex + 17);
        return scoreDifference || a.slotId.localeCompare(b.slotId);
      });
    let accepted = 0;
    for (const candidate of rankedCandidates) {
      const placement = makePlacement(candidate, kind);
      const footprint = asFootprint(placement);
      if (
        buildingFootprints.some(
          (building) =>
            footprintSeparation(footprint, building) <=
            URBAN_STREET_FURNITURE_CONFIG.buildingFootprintClearanceMeters,
        ) ||
        selected.some(
          (other) =>
            footprintSeparation(footprint, asFootprint(other)) <
            URBAN_STREET_FURNITURE_CONFIG.minimumFurnitureSeparationMeters,
        )
      ) {
        continue;
      }
      selected.push(placement);
      usedSlots.add(candidate.slotId);
      accepted += 1;
      if (accepted >= targetCount) {
        break;
      }
    }
  });

  return selected;
}

function createLookdevPlacements(
  tier: TierId,
  origin: readonly [number, number, number],
): UrbanStreetFurniturePlacement[] {
  const [originX, originY, originZ] = origin;
  const counts: Readonly<Record<TierId, Readonly<Record<UrbanStreetFurnitureKind, number>>>> = {
    C: { bench: 2, planter: 4, wasteBin: 2, bicycleRack: 2 },
    B: { bench: 3, planter: 6, wasteBin: 3, bicycleRack: 3 },
    A: { bench: 4, planter: 8, wasteBin: 4, bicycleRack: 4 },
  };
  const lists: Readonly<Record<UrbanStreetFurnitureKind, readonly { side: -1 | 1; z: number }[]>> =
    {
      bench: [
        { side: -1, z: -74 },
        { side: 1, z: -74 },
        { side: -1, z: 42 },
        { side: 1, z: 42 },
      ],
      planter: [
        { side: -1, z: -48 },
        { side: 1, z: -48 },
        { side: -1, z: -30 },
        { side: 1, z: -30 },
        { side: -1, z: 24 },
        { side: 1, z: 24 },
        { side: -1, z: 50 },
        { side: 1, z: 50 },
      ],
      wasteBin: [
        { side: -1, z: -92 },
        { side: 1, z: -92 },
        { side: -1, z: 60 },
        { side: 1, z: 60 },
      ],
      bicycleRack: [
        { side: -1, z: -58 },
        { side: 1, z: -58 },
        { side: -1, z: 34 },
        { side: 1, z: 34 },
      ],
    };
  const placements: UrbanStreetFurniturePlacement[] = [];
  for (const kind of FURNITURE_KINDS) {
    const selected = lists[kind].slice(0, counts[tier][kind]);
    selected.forEach(({ side, z }, index) => {
      const slot: CandidateSlot = {
        slotId: `lookdev:${kind}:${side}:${index}`,
        x: originX + side * 12.55,
        y: originY - 0.05,
        z: originZ + z,
        yaw: side > 0 ? Math.PI : 0,
        roadEdgeId: 'lookdev-avenue',
        alongMeters: Math.abs(z - URBAN_CITY_CONFIG.avenue.centerZ),
        side,
      };
      placements.push(makePlacement(slot, kind));
    });
  }
  return placements;
}

interface GeometryGroupSpan {
  start: number;
  count: number;
  materialIndex: number;
}

interface FurnitureGeometryBuffers {
  readonly positions: number[];
  readonly colors: number[];
  readonly uvs: number[];
  readonly groups: GeometryGroupSpan[];
}

function createGeometryBuffers(): FurnitureGeometryBuffers {
  return { positions: [], colors: [], uvs: [], groups: [] };
}

function appendGeometry(
  buffers: FurnitureGeometryBuffers,
  geometry: BufferGeometry,
  colorHex: number,
  materialIndex = 0,
): void {
  const position = geometry.getAttribute('position');
  const uvAttribute = geometry.getAttribute('uv');
  if (uvAttribute === undefined) {
    geometry.dispose();
    throw new Error(`furniture source geometry "${geometry.name}" has no UV coordinates`);
  }
  const index = geometry.getIndex();
  const color = new Color(colorHex);
  const start = buffers.positions.length / 3;
  const vertexCount = index?.count ?? position.count;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const sourceIndex = index?.getX(vertex) ?? vertex;
    buffers.positions.push(
      position.getX(sourceIndex),
      position.getY(sourceIndex),
      position.getZ(sourceIndex),
    );
    buffers.colors.push(color.r, color.g, color.b);
    buffers.uvs.push(uvAttribute.getX(sourceIndex), uvAttribute.getY(sourceIndex));
  }
  buffers.groups.push({ start, count: vertexCount, materialIndex });
  geometry.dispose();
}

function appendBox(
  buffers: FurnitureGeometryBuffers,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  color: number,
  materialIndex = 0,
): void {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  appendGeometry(buffers, geometry, color, materialIndex);
}

function finishGeometry(name: string, buffers: FurnitureGeometryBuffers): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = name;
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(buffers.positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(buffers.colors), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(buffers.uvs), 2));

  const mergedGroups: GeometryGroupSpan[] = [];
  for (const group of buffers.groups) {
    const previous = mergedGroups.at(-1);
    if (
      previous !== undefined &&
      previous.materialIndex === group.materialIndex &&
      previous.start + previous.count === group.start
    ) {
      previous.count += group.count;
    } else {
      mergedGroups.push({ ...group });
    }
  }
  mergedGroups.forEach((group) => geometry.addGroup(group.start, group.count, group.materialIndex));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildBenchGeometry(): BufferGeometry {
  const buffers = createGeometryBuffers();
  appendBox(buffers, 0.68, 0.1, 1.58, 0, 0.46, 0, 0x72583f, 0);
  appendBox(buffers, 0.05, 0.46, 1.5, -0.295, 0.72, 0, 0x39434a, 1);
  for (const x of [-0.24, 0.24]) {
    for (const z of [-0.58, 0.58]) {
      appendBox(buffers, 0.055, 0.43, 0.06, x, 0.215, z, 0x39434a, 1);
    }
  }
  return finishGeometry('aohara-street-furniture-bench', buffers);
}

function buildPlanterGeometry(): BufferGeometry {
  const buffers = createGeometryBuffers();
  appendBox(buffers, 0.84, 0.48, 1.3, 0, 0.24, 0, 0x777d7b, 0);
  appendBox(buffers, 0.88, 0.07, 1.34, 0, 0.49, 0, 0x8e9188, 0);
  appendBox(buffers, 0.7, 0.035, 1.15, 0, 0.54, 0, 0x443f34, 0);
  const shrubs = [
    { x: -0.08, y: 0.72, z: -0.38, scale: [0.23, 0.22, 0.23] as const, color: 0x3c6245 },
    { x: 0.06, y: 0.75, z: 0.02, scale: [0.25, 0.24, 0.24] as const, color: 0x52724a },
    { x: -0.06, y: 0.72, z: 0.39, scale: [0.22, 0.21, 0.23] as const, color: 0x426b4b },
  ] as const;
  for (const shrub of shrubs) {
    const geometry = new IcosahedronGeometry(1, 1);
    geometry.scale(shrub.scale[0], shrub.scale[1], shrub.scale[2]);
    geometry.translate(shrub.x, shrub.y, shrub.z);
    appendGeometry(buffers, geometry, shrub.color, 1);
  }
  return finishGeometry('aohara-street-furniture-planter', buffers);
}

function buildWasteBinGeometry(): BufferGeometry {
  const buffers = createGeometryBuffers();
  appendBox(buffers, 0.56, 0.84, 0.56, 0, 0.42, 0, 0x354f53);
  appendBox(buffers, 0.6, 0.08, 0.6, 0, 0.88, 0, 0x27383c);
  appendBox(buffers, 0.24, 0.04, 0.035, 0, 0.83, 0.3, 0xc1b894);
  return finishGeometry('aohara-street-furniture-waste-bin', buffers);
}

function buildBicycleRackGeometry(): BufferGeometry {
  const buffers = createGeometryBuffers();
  for (const x of [-0.31, 0.31]) {
    const leg = new CylinderGeometry(0.035, 0.04, 0.62, 8);
    leg.translate(x, 0.31, 0);
    appendGeometry(buffers, leg, 0x59636a);
  }
  const rail = new CylinderGeometry(0.035, 0.035, 0.64, 8);
  rail.rotateZ(Math.PI / 2);
  rail.translate(0, 0.62, 0);
  appendGeometry(buffers, rail, 0x737a7d);
  return finishGeometry('aohara-street-furniture-bicycle-rack', buffers);
}

function buildFurnitureGeometry(kind: UrbanStreetFurnitureKind): BufferGeometry {
  switch (kind) {
    case 'bench':
      return buildBenchGeometry();
    case 'planter':
      return buildPlanterGeometry();
    case 'wasteBin':
      return buildWasteBinGeometry();
    case 'bicycleRack':
      return buildBicycleRackGeometry();
  }
}

function batchName(kind: UrbanStreetFurnitureKind): string {
  switch (kind) {
    case 'bench':
      return 'aohara-street-benches';
    case 'planter':
      return 'aohara-street-planters';
    case 'wasteBin':
      return 'aohara-street-waste-bins';
    case 'bicycleRack':
      return 'aohara-street-bicycle-racks';
  }
}

function createFurnitureMaterial(
  name: string,
  roughness: number,
  metalness: number,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.colorNode = vertexColor();
  material.roughness = roughness;
  material.metalness = metalness;
  material.name = name;
  return material;
}

/** Fixed, non-colliding instanced sidewalk detail shared by the driving world and city look-dev. */
export class UrbanStreetFurniture {
  readonly root = new Group();
  readonly #tier: TierId;
  readonly #budget: UrbanStreetFurnitureTierBudget;
  readonly #placements: readonly UrbanStreetFurniturePlacement[];
  readonly #benchMaterial: MeshStandardNodeMaterial;
  readonly #benchSupportMaterial: MeshStandardNodeMaterial;
  readonly #planterMaterial: MeshStandardNodeMaterial;
  readonly #foliageMaterial: MeshStandardNodeMaterial;
  readonly #wasteBinMaterial: MeshStandardNodeMaterial;
  readonly #bicycleRackMaterial: MeshStandardNodeMaterial;
  readonly #materials: readonly MeshStandardNodeMaterial[];
  readonly #surfaceTextures: SurfaceTextureLibrary;
  readonly #ownsSurfaceTextures: boolean;
  readonly #meshes: InstancedMesh[] = [];
  readonly #counts: Record<UrbanStreetFurnitureKind, number> = {
    bench: 0,
    planter: 0,
    wasteBin: 0,
    bicycleRack: 0,
  };
  #woodSurfaceBound = false;
  #concreteSurfaceBound = false;
  #disposed = false;

  constructor(tier: TierId, options: UrbanStreetFurnitureOptions) {
    this.#tier = tier;
    this.#budget = URBAN_STREET_FURNITURE_TIER_BUDGET[tier];
    this.#surfaceTextures = options.surfaceTextures ?? new SurfaceTextureLibrary();
    this.#ownsSurfaceTextures = options.surfaceTextures === undefined;
    const [originX, originY, originZ] = options.origin;
    this.root.name = 'aohara-street-furniture';
    this.#placements = options.networkIntegrated
      ? options.roadNetwork === undefined
        ? []
        : generateAoharaStreetFurniturePlacements(
            options.roadNetwork,
            tier,
            options.buildingFootprints,
          )
      : createLookdevPlacements(tier, options.origin);

    this.#benchMaterial = createFurnitureMaterial('aohara-bench-cedar-pbr', 0.84, 0);
    this.#benchSupportMaterial = createFurnitureMaterial(
      'aohara-bench-painted-steel-pbr',
      0.58,
      0.04,
    );
    this.#planterMaterial = createFurnitureMaterial(
      'aohara-planter-aggregate-concrete-pbr',
      0.9,
      0,
    );
    this.#foliageMaterial = createFurnitureMaterial('aohara-planter-shrubs-pbr', 0.92, 0);
    this.#wasteBinMaterial = createFurnitureMaterial(
      'aohara-waste-bin-painted-steel-pbr',
      0.66,
      0.04,
    );
    this.#bicycleRackMaterial = createFurnitureMaterial(
      'aohara-bicycle-rack-metal-pbr',
      0.48,
      0.72,
    );
    this.#materials = [
      this.#benchMaterial,
      this.#benchSupportMaterial,
      this.#planterMaterial,
      this.#foliageMaterial,
      this.#wasteBinMaterial,
      this.#bicycleRackMaterial,
    ];

    const dummy = new Object3D();
    for (const kind of FURNITURE_KINDS) {
      const placements = this.#placements.filter((placement) => placement.kind === kind);
      this.#counts[kind] = placements.length;
      if (placements.length === 0) {
        continue;
      }
      const meshMaterials =
        kind === 'bench'
          ? [this.#benchMaterial, this.#benchSupportMaterial]
          : kind === 'planter'
            ? [this.#planterMaterial, this.#foliageMaterial]
            : [kind === 'wasteBin' ? this.#wasteBinMaterial : this.#bicycleRackMaterial];
      const mesh = new InstancedMesh(
        buildFurnitureGeometry(kind),
        meshMaterials,
        placements.length,
      );
      mesh.name = batchName(kind);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      placements.forEach((placement, index) => {
        dummy.position.set(placement.x - originX, placement.y - originY, placement.z - originZ);
        dummy.rotation.set(0, placement.yaw, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
      this.#meshes.push(mesh);
    }
  }

  /** Applies scans only to the wooden bench boards and concrete planter shell. */
  async loadSurfaces(): Promise<void> {
    if (this.#placements.length === 0 || this.#disposed) {
      return;
    }
    const [wood, concrete] = await Promise.all([
      this.#surfaceTextures.load('tex-japanese-cedar-planks-1k'),
      this.#surfaceTextures.load('tex-gravel-concrete-03-1k'),
    ]);
    if (this.#disposed) {
      return;
    }
    if (wood !== null && !this.#woodSurfaceBound) {
      configureTiledSurface(wood);
      bindScannedPbrMaps(this.#benchMaterial, wood, uv(), {
        albedoTint: this.#benchMaterial.colorNode ?? vertexColor(),
        normalStrength: 0.46,
        aoStrength: 0.72,
        metalnessScale: 0,
      });
      this.#woodSurfaceBound = true;
    }
    if (concrete !== null && !this.#concreteSurfaceBound) {
      configureTiledSurface(concrete);
      bindScannedPbrMaps(this.#planterMaterial, concrete, uv(), {
        albedoTint: this.#planterMaterial.colorNode ?? vertexColor(),
        normalStrength: 0.52,
        aoStrength: 0.72,
        metalnessScale: 0,
      });
      this.#concreteSurfaceBound = true;
    }
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      urbanStreetFurnitureBatches: this.#meshes.length,
      urbanStreetFurnitureInstances: this.#placements.length,
      urbanStreetFurnitureInstanceBudget:
        this.#budget.benches +
        this.#budget.planters +
        this.#budget.wasteBins +
        this.#budget.bicycleRacks,
      urbanStreetBenches: this.#counts.bench,
      urbanStreetBenchesBudget: this.#budget.benches,
      urbanStreetPlanters: this.#counts.planter,
      urbanStreetPlantersBudget: this.#budget.planters,
      urbanStreetWasteBins: this.#counts.wasteBin,
      urbanStreetWasteBinsBudget: this.#budget.wasteBins,
      urbanStreetBicycleRacks: this.#counts.bicycleRack,
      urbanStreetBicycleRacksBudget: this.#budget.bicycleRacks,
      urbanStreetFurnitureTierCode: this.#tier === 'C' ? 0 : this.#tier === 'B' ? 1 : 2,
    };
  }

  /** Test/diagnostic snapshot; mutations of the returned list do not alter the mounted instances. */
  getPlacements(): readonly UrbanStreetFurniturePlacement[] {
    return this.#placements.map((placement) => ({ ...placement }));
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const mesh of this.#meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    for (const material of this.#materials) {
      material.dispose();
    }
    if (this.#ownsSurfaceTextures) {
      this.#surfaceTextures.dispose();
    }
    this.root.removeFromParent();
  }
}
