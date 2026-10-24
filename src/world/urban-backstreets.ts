import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Object3D,
  type BufferGeometry,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { URBAN_ACTIVITY_TIER_BUDGET } from '../config/urban-city';
import { AOHARA_BACKSTREET_BLOCKS } from '../config/aohara-backstreets';
import type { TierId } from '../config/tiers';
import { DEFAULT_SPAWN_ID, SPAWN_POINTS } from '../config/spawns';
import type { RoadNetwork } from './road-network';
import type { StaticBuildingBox } from './static-building-collision';

export type UrbanAlleyPropKind =
  'waste-bin' | 'dumpster' | 'cardboard-stack' | 'hand-cart' | 'crate-stack' | 'pallet';

export interface UrbanAlleyPropPlacement {
  readonly id: string;
  readonly kind: UrbanAlleyPropKind;
  readonly roadEdgeId: string;
  readonly alongMeters: number;
  /** World coordinates, so these stay aligned with the shared road graph. */
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly widthMeters: number;
  readonly depthMeters: number;
  readonly heightMeters: number;
  readonly color: number;
}

interface PropDimensions {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

// Keep the prop footprint narrow across the alley while allowing carts, stacks and dumpsters to
// extend along the wall; the 1.4 m vehicle apron remains available in front of each building row.
const ALLEY_PROP_DIMENSIONS: Readonly<Record<UrbanAlleyPropKind, PropDimensions>> = {
  'waste-bin': { width: 0.74, depth: 0.72, height: 1.16 },
  dumpster: { width: 0.8, depth: 1.62, height: 1.42 },
  'cardboard-stack': { width: 0.78, depth: 1.04, height: 0.96 },
  'hand-cart': { width: 0.72, depth: 1.32, height: 1.28 },
  'crate-stack': { width: 0.78, depth: 1.02, height: 1.32 },
  pallet: { width: 0.8, depth: 1.26, height: 0.28 },
};

const ALLEY_PROP_COLORS: Readonly<Record<UrbanAlleyPropKind, readonly number[]>> = {
  'waste-bin': [0x405e55, 0x596553, 0x52636a],
  dumpster: [0x344d48, 0x4b5550, 0x3b4c57],
  'cardboard-stack': [0x9a7450, 0x866849, 0xa08057],
  'hand-cart': [0x59636a, 0x46525a, 0x6b6154],
  'crate-stack': [0x8b6644, 0x73563d, 0x99764e],
  pallet: [0x96734d, 0x826b4d, 0xa1855d],
};

const ALLEY_PROP_KINDS: readonly UrbanAlleyPropKind[] = [
  'waste-bin',
  'dumpster',
  'cardboard-stack',
  'hand-cart',
  'crate-stack',
  'pallet',
];

const ALLEY_PROP_MINIMUM_SEPARATION_METERS = 0.28;
const ALLEY_PROP_BUILDING_CLEARANCE_METERS = 0.25;
const ALLEY_PROP_ROAD_CLEARANCE_METERS = 0.22;
const ALLEY_PROP_VEHICLE_CLEARANCE_METERS = 1.4;
const ALLEY_PROP_ACCESS_CLEARANCE_METERS = 20;
const ALLEY_PROP_HUB_CLEARANCE_METERS = 14;
const ALLEY_PROP_SPAWN_CLEARANCE_METERS = 18;
const ALLEY_PROP_BASE_Y = -0.55;

function stableUnit(a: number, b: number, salt: number): number {
  let value = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ Math.imul(b + salt, 0xc2b2ae35), 0x27d4eb2f);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0x1_0000_0000;
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
  const separations = [...aAxes, ...bAxes].map(([axisX, axisZ]) => {
    const centerDistance = Math.abs(dx * axisX + dz * axisZ);
    const aRadius =
      (a.halfWidth + margin) * Math.abs(aAxes[0]![0] * axisX + aAxes[0]![1] * axisZ) +
      (a.halfDepth + margin) * Math.abs(aAxes[1]![0] * axisX + aAxes[1]![1] * axisZ);
    const bRadius =
      (b.halfWidth + margin) * Math.abs(bAxes[0]![0] * axisX + bAxes[0]![1] * axisZ) +
      (b.halfDepth + margin) * Math.abs(bAxes[1]![0] * axisX + bAxes[1]![1] * axisZ);
    return centerDistance - aRadius - bRadius;
  });
  return Math.max(...separations);
}

function roadPositionAt(
  edge: RoadNetwork['edges'][number],
  distanceMeters: number,
): {
  readonly x: number;
  readonly z: number;
  readonly tangentX: number;
  readonly tangentZ: number;
} {
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
    tangentX: tangentX / tangentLength,
    tangentZ: tangentZ / tangentLength,
  };
}

function choosePropKind(value: number): UrbanAlleyPropKind {
  if (value < 0.23) return 'waste-bin';
  if (value < 0.4) return 'dumpster';
  if (value < 0.61) return 'cardboard-stack';
  if (value < 0.76) return 'hand-cart';
  if (value < 0.9) return 'crate-stack';
  return 'pallet';
}

function makePropFootprint(
  placement: Pick<UrbanAlleyPropPlacement, 'x' | 'z' | 'yaw' | 'widthMeters' | 'depthMeters'>,
): StaticBuildingBox {
  return {
    x: placement.x,
    z: placement.z,
    yaw: placement.yaw,
    halfWidth: placement.widthMeters / 2,
    halfDepth: placement.depthMeters / 2,
  };
}

function isPlacementClear(
  network: RoadNetwork,
  candidate: UrbanAlleyPropPlacement,
  buildings: readonly StaticBuildingBox[],
  accepted: readonly UrbanAlleyPropPlacement[],
): boolean {
  const footprint = makePropFootprint(candidate);
  for (const building of buildings) {
    if (footprintSeparation(footprint, building, ALLEY_PROP_BUILDING_CLEARANCE_METERS) <= 0) {
      return false;
    }
  }
  for (const placement of accepted) {
    if (
      footprintSeparation(
        footprint,
        makePropFootprint(placement),
        ALLEY_PROP_MINIMUM_SEPARATION_METERS,
      ) <= 0
    ) {
      return false;
    }
  }
  const road = network.sample(candidate.x, candidate.z);
  if (
    road !== null &&
    road.distance - road.halfWidthMeters - road.shoulderMeters <
      candidate.widthMeters / 2 + ALLEY_PROP_ROAD_CLEARANCE_METERS
  ) {
    return false;
  }
  const spawn = SPAWN_POINTS.find((point) => point.id === DEFAULT_SPAWN_ID);
  return (
    spawn === undefined ||
    Math.hypot(candidate.x - spawn.x, candidate.z - spawn.z) >= ALLEY_PROP_SPAWN_CLEARANCE_METERS
  );
}

/**
 * Deterministic, tier-bounded service-lane clutter. Props stay outside the driveable pavement and
 * clear of static shells/spawn; placement and kind selection use only stable graph/block indices.
 */
export function generateAoharaAlleyPropPlacements(
  network: RoadNetwork,
  tier: TierId,
  buildingFootprints: readonly StaticBuildingBox[],
): readonly UrbanAlleyPropPlacement[] {
  const budget = URBAN_ACTIVITY_TIER_BUDGET[tier].alleyProps;
  const basePerBlock = Math.floor(budget / AOHARA_BACKSTREET_BLOCKS.length);
  const remainder = budget % AOHARA_BACKSTREET_BLOCKS.length;
  const placements: UrbanAlleyPropPlacement[] = [];

  AOHARA_BACKSTREET_BLOCKS.forEach((block, blockIndex) => {
    const target = basePerBlock + (blockIndex < remainder ? 1 : 0);
    const blockEdges = [
      ...Object.values(block.accesses).map((access) =>
        network.edges.find(
          (edge) =>
            edge.roadClass === 'urban-alley' &&
            ((edge.from === access.nodeId && edge.to === block.hubNodeId) ||
              (edge.to === access.nodeId && edge.from === block.hubNodeId)),
        ),
      ),
      network.edges.find(
        (edge) =>
          edge.roadClass === 'urban-alley' &&
          ((edge.from === block.hubNodeId && edge.to === block.courtyardNodeId) ||
            (edge.to === block.hubNodeId && edge.from === block.courtyardNodeId)),
      ),
    ].filter((edge): edge is NonNullable<typeof edge> => edge !== undefined);
    const candidates: { readonly rank: number; readonly placement: UrbanAlleyPropPlacement }[] = [];

    blockEdges.forEach((edge, edgeIndex) => {
      const shortCourt = edge.lengthMeters < 20;
      const step = shortCourt ? edge.lengthMeters + 1 : 12;
      const firstAlong = shortCourt
        ? edge.lengthMeters / 2
        : ALLEY_PROP_ACCESS_CLEARANCE_METERS + stableUnit(blockIndex, edgeIndex, 137) * 2;
      let positionIndex = 0;
      for (
        let alongMeters = firstAlong;
        alongMeters < edge.lengthMeters - (shortCourt ? 0 : ALLEY_PROP_HUB_CLEARANCE_METERS);
        alongMeters += step
      ) {
        const point = roadPositionAt(edge, alongMeters);
        const sideX = point.tangentZ;
        const sideZ = -point.tangentX;
        for (const side of [-1, 1] as const) {
          const sideIndex = side < 0 ? 0 : 1;
          const kindRank = stableUnit(
            blockIndex * 31 + edgeIndex,
            positionIndex * 2 + sideIndex,
            151,
          );
          const kind = choosePropKind(kindRank);
          const dimensions = ALLEY_PROP_DIMENSIONS[kind];
          const outwardX = sideX * side;
          const outwardZ = sideZ * side;
          const lateralOffset =
            edge.halfWidthMeters + dimensions.width / 2 + ALLEY_PROP_VEHICLE_CLEARANCE_METERS;
          const colorPalette = ALLEY_PROP_COLORS[kind];
          const color =
            colorPalette[
              Math.floor(
                stableUnit(blockIndex, positionIndex + edgeIndex * 7 + sideIndex, 163) *
                  colorPalette.length,
              )
            ] ?? colorPalette[0]!;
          const placement: UrbanAlleyPropPlacement = {
            id: `${block.id}:${edge.id}:${side}:${Math.round(alongMeters * 100)}`,
            kind,
            roadEdgeId: edge.id,
            alongMeters,
            x: point.x + outwardX * lateralOffset,
            z: point.z + outwardZ * lateralOffset,
            yaw: Math.atan2(point.tangentX, point.tangentZ),
            widthMeters: dimensions.width,
            depthMeters: dimensions.depth,
            heightMeters: dimensions.height,
            color,
          };
          candidates.push({
            rank: stableUnit(blockIndex * 113 + edgeIndex * 7, positionIndex * 2 + sideIndex, 179),
            placement,
          });
        }
        positionIndex += 1;
      }
    });

    candidates.sort(
      (first, second) =>
        first.rank - second.rank || first.placement.id.localeCompare(second.placement.id),
    );
    const selectedForBlock: UrbanAlleyPropPlacement[] = [];
    for (const { placement } of candidates) {
      if (selectedForBlock.length >= target) break;
      if (isPlacementClear(network, placement, buildingFootprints, placements)) {
        placements.push(placement);
        selectedForBlock.push(placement);
      }
    }
  });
  return placements;
}

function boxPart(
  dimensions: readonly [number, number, number],
  position: readonly [number, number, number],
): BufferGeometry {
  const geometry = new BoxGeometry(...dimensions);
  geometry.translate(...position);
  return geometry;
}

function cylinderPart(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: readonly [number, number, number],
  rotationZ = 0,
): BufferGeometry {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, 9, 1);
  if (rotationZ !== 0) geometry.rotateZ(rotationZ);
  geometry.translate(...position);
  return geometry;
}

function mergedPropGeometry(kind: UrbanAlleyPropKind): BufferGeometry {
  const dimensions = ALLEY_PROP_DIMENSIONS[kind];
  const [width, depth, height] = [dimensions.width, dimensions.depth, dimensions.height];
  let parts: BufferGeometry[];
  switch (kind) {
    case 'waste-bin':
      parts = [
        boxPart([width * 0.86, height * 0.78, depth * 0.86], [0, height * 0.42, 0]),
        boxPart([width, 0.12, depth], [0, height * 0.84, 0]),
        boxPart([width * 0.34, 0.06, depth * 0.08], [0, height * 0.56, -depth * 0.48]),
      ];
      break;
    case 'dumpster':
      parts = [
        boxPart([width * 0.92, height * 0.72, depth * 0.86], [0, height * 0.38, 0]),
        boxPart([width, 0.11, depth], [0, height * 0.76, 0]),
        cylinderPart(0.14, 0.14, 0.12, [-width * 0.34, 0.15, depth * 0.37], Math.PI / 2),
        cylinderPart(0.14, 0.14, 0.12, [width * 0.34, 0.15, depth * 0.37], Math.PI / 2),
      ];
      break;
    case 'cardboard-stack':
      parts = [
        boxPart([width * 0.62, height * 0.57, depth * 0.67], [-width * 0.16, height * 0.285, 0]),
        boxPart(
          [width * 0.6, height * 0.43, depth * 0.58],
          [width * 0.18, height * 0.215, depth * 0.13],
        ),
        boxPart([width * 0.2, 0.025, depth * 0.55], [-width * 0.16, height * 0.58, 0]),
      ];
      break;
    case 'hand-cart':
      parts = [
        boxPart([width * 0.82, 0.13, depth * 0.78], [0, height * 0.24, depth * 0.03]),
        boxPart([width * 0.66, 0.1, depth * 0.22], [0, height * 0.35, -depth * 0.25]),
        boxPart([0.08, height * 0.53, 0.08], [-width * 0.36, height * 0.65, -depth * 0.28]),
        boxPart([0.08, height * 0.53, 0.08], [width * 0.36, height * 0.65, -depth * 0.28]),
        boxPart([width * 0.8, 0.07, 0.08], [0, height * 0.9, -depth * 0.28]),
        cylinderPart(0.19, 0.19, 0.12, [-width * 0.38, 0.2, depth * 0.22], Math.PI / 2),
        cylinderPart(0.19, 0.19, 0.12, [width * 0.38, 0.2, depth * 0.22], Math.PI / 2),
      ];
      break;
    case 'crate-stack':
      parts = [
        boxPart([width * 0.72, height * 0.48, depth * 0.82], [-width * 0.1, height * 0.24, 0]),
        boxPart(
          [width * 0.63, height * 0.42, depth * 0.7],
          [width * 0.16, height * 0.69, -depth * 0.06],
        ),
        boxPart([width * 0.77, 0.055, depth * 0.07], [-width * 0.1, height * 0.48, -depth * 0.37]),
        boxPart([width * 0.77, 0.055, depth * 0.07], [-width * 0.1, height * 0.48, depth * 0.37]),
      ];
      break;
    case 'pallet':
      parts = [
        boxPart([width, 0.06, depth * 0.22], [0, height * 0.65, -depth * 0.36]),
        boxPart([width, 0.06, depth * 0.22], [0, height * 0.65, 0]),
        boxPart([width, 0.06, depth * 0.22], [0, height * 0.65, depth * 0.36]),
        boxPart([width * 0.18, 0.12, depth], [-width * 0.32, height * 0.34, 0]),
        boxPart([width * 0.18, 0.12, depth], [0, height * 0.34, 0]),
        boxPart([width * 0.18, 0.12, depth], [width * 0.32, height * 0.34, 0]),
      ];
      break;
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (merged === null) {
    throw new Error(`could not merge Aohara alley prop geometry: ${kind}`);
  }
  merged.name = `aohara-alley-prop-${kind}-geometry`;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Tier-bounded instanced visual and collision batch for the Aohara backstreet clutter. */
export class UrbanBackstreetProps {
  readonly root = new Group();
  readonly placements: readonly UrbanAlleyPropPlacement[];
  readonly collisionBoxes: readonly StaticBuildingBox[];
  readonly #meshes: InstancedMesh[] = [];
  readonly #geometries: BufferGeometry[] = [];
  readonly #materials: MeshStandardNodeMaterial[] = [];
  readonly #stats: Readonly<Record<string, number>>;
  #disposed = false;

  constructor(
    tier: TierId,
    network: RoadNetwork,
    buildingFootprints: readonly StaticBuildingBox[],
    origin: readonly [number, number, number],
  ) {
    this.root.name = 'aohara-alley-props';
    this.placements = generateAoharaAlleyPropPlacements(network, tier, buildingFootprints);
    this.collisionBoxes = this.placements.map((placement) => makePropFootprint(placement));
    const originX = origin[0];
    const originZ = origin[2];
    const kindCounts = new Map<UrbanAlleyPropKind, number>(
      ALLEY_PROP_KINDS.map((kind) => [kind, 0] as const),
    );

    for (const kind of ALLEY_PROP_KINDS) {
      const instances = this.placements.filter((placement) => placement.kind === kind);
      if (instances.length === 0) continue;
      const geometry = mergedPropGeometry(kind);
      const material = new MeshStandardNodeMaterial();
      material.color.setHex(0xffffff);
      material.roughness = kind === 'dumpster' || kind === 'hand-cart' ? 0.74 : 0.92;
      material.metalness = kind === 'dumpster' || kind === 'hand-cart' ? 0.2 : 0.02;
      material.name = `aohara-alley-${kind}-paint-and-material`;
      const mesh = new InstancedMesh(geometry, material, instances.length);
      mesh.name = `aohara-alley-${kind}-instances`;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const transform = new Object3D();
      instances.forEach((placement, index) => {
        transform.position.set(placement.x - originX, ALLEY_PROP_BASE_Y, placement.z - originZ);
        transform.rotation.set(0, placement.yaw, 0);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        mesh.setColorAt(index, new Color(placement.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
      this.root.add(mesh);
      this.#meshes.push(mesh);
      this.#geometries.push(geometry);
      this.#materials.push(material);
      kindCounts.set(kind, instances.length);
    }

    this.#stats = {
      urbanAlleyProps: this.placements.length,
      urbanAlleyPropsBudget: URBAN_ACTIVITY_TIER_BUDGET[tier].alleyProps,
      urbanAlleyWasteBins: kindCounts.get('waste-bin') ?? 0,
      urbanAlleyDumpsters: kindCounts.get('dumpster') ?? 0,
      urbanAlleyCardboardStacks: kindCounts.get('cardboard-stack') ?? 0,
      urbanAlleyHandCarts: kindCounts.get('hand-cart') ?? 0,
      urbanAlleyCrateStacks: kindCounts.get('crate-stack') ?? 0,
      urbanAlleyPallets: kindCounts.get('pallet') ?? 0,
      urbanAlleyPropBatches: this.#meshes.length,
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
