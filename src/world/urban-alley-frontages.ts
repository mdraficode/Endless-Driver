import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';

import type { TierId } from '../config/tiers';
import type { RoadEdge, RoadNetwork } from './road-network';
import { collideCarWithStaticBoxes, type StaticBuildingBox } from './static-building-collision';
import type { TownCarProbe, TownHit } from './town';

// The frontage line stays beyond the narrow clutter strip while remaining one car-width off the alley.
const FACADE_WALL_GAP_METERS = 2.75;
const FACADE_WALL_THICKNESS_METERS = 0.18;
const FACADE_COLLISION_SEGMENT_METERS = 2;
const FACADE_MIN_ROAD_CLEARANCE_METERS = 2.5;
const FACADE_MAX_ADDITIONAL_SETBACK_METERS = 16;
const FACADE_BUILDING_DEPTH_METERS = 6.8;
const FACADE_ACCESS_SETBACK_METERS = 16.5;
const FACADE_HUB_SETBACK_METERS = 14;
const FACADE_COURTYARD_SETBACK_METERS = 1.25;
const FACADE_BASE_Y = -0.55;
const FACADE_WALL_HEIGHT_METERS = 8.6;
const FACADE_MODULE_LENGTH_METERS: Readonly<Record<TierId, number>> = {
  C: 14,
  B: 12,
  A: 10,
};
const FACADE_WALL_PALETTE = [0x554f49, 0x4e5556, 0x62584e, 0x4a535d, 0x665c52, 0x545a50] as const;
const FACADE_ROOF_PALETTE = [0x263039, 0x30343a, 0x363432, 0x2b3538] as const;
const FACADE_WINDOW_COLORS = [0x263642, 0x37403f, 0x3a3430, 0x5c4b38, 0x39464b] as const;

export interface UrbanAlleyFacadePlacement {
  readonly id: string;
  readonly roadEdgeId: string;
  readonly side: -1 | 1;
  readonly alongMeters: number;
  readonly startAlongMeters: number;
  readonly endAlongMeters: number;
  readonly x: number;
  readonly z: number;
  /** Y-rotation used by Three.js meshes, which points the local X axis along the alley. */
  readonly yaw: number;
  readonly tangentX: number;
  readonly tangentZ: number;
  readonly normalX: number;
  readonly normalZ: number;
  readonly halfWidthMeters: number;
  /** Side-specific distance from the road centerline to this continuous facade plane. */
  readonly wallOffsetMeters: number;
  readonly widthMeters: number;
  readonly depthMeters: number;
  readonly heightMeters: number;
  readonly color: number;
  readonly roofColor: number;
}

interface RoadFrame {
  readonly x: number;
  readonly z: number;
  readonly tangentX: number;
  readonly tangentZ: number;
  readonly normalX: number;
  readonly normalZ: number;
}

function stableUnit(a: number, b: number, salt: number): number {
  let value = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ Math.imul(b + salt, 0xc2b2ae35), 0x27d4eb2f);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0x1_0000_0000;
}

function roadPositionAt(
  edge: RoadEdge,
  distanceMeters: number,
): { readonly x: number; readonly z: number } {
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
  return {
    x: start.x + (end.x - start.x) * t,
    z: start.z + (end.z - start.z) * t,
  };
}

function roadFrameAt(edge: RoadEdge, distanceMeters: number): RoadFrame {
  const point = roadPositionAt(edge, distanceMeters);
  const tangentWindow = 1.5;
  const before = roadPositionAt(edge, Math.max(0, distanceMeters - tangentWindow));
  const after = roadPositionAt(edge, Math.min(edge.lengthMeters, distanceMeters + tangentWindow));
  const tangentLength = Math.hypot(after.x - before.x, after.z - before.z) || 1;
  const tangentX = (after.x - before.x) / tangentLength;
  const tangentZ = (after.z - before.z) / tangentLength;
  return {
    x: point.x,
    z: point.z,
    tangentX,
    tangentZ,
    normalX: tangentZ,
    normalZ: -tangentX,
  };
}

function hasFacadeRoadClearance(network: RoadNetwork, x: number, z: number): boolean {
  const nearestRoad = network.sample(x, z);
  return (
    nearestRoad === null ||
    nearestRoad.distance - nearestRoad.halfWidthMeters - nearestRoad.shoulderMeters >=
      FACADE_MIN_ROAD_CLEARANCE_METERS
  );
}

function resolveFacadeWallOffset(
  network: RoadNetwork,
  edge: RoadEdge,
  side: -1 | 1,
  startAlongMeters: number,
  endAlongMeters: number,
): number {
  const baseOffset = edge.halfWidthMeters + FACADE_WALL_GAP_METERS;
  for (
    let additionalOffset = 0;
    additionalOffset <= FACADE_MAX_ADDITIONAL_SETBACK_METERS;
    additionalOffset += 0.5
  ) {
    const wallOffset = baseOffset + additionalOffset;
    let isClear = true;
    const sampleCount = Math.max(
      1,
      Math.ceil((endAlongMeters - startAlongMeters) / FACADE_COLLISION_SEGMENT_METERS),
    );
    for (let index = 0; index <= sampleCount; index += 1) {
      const alongMeters =
        startAlongMeters + ((endAlongMeters - startAlongMeters) * index) / sampleCount;
      const frame = roadFrameAt(edge, alongMeters);
      const wallCenterOffset = wallOffset - 0.05 + FACADE_WALL_THICKNESS_METERS / 2;
      if (
        !hasFacadeRoadClearance(
          network,
          frame.x + frame.normalX * side * wallCenterOffset,
          frame.z + frame.normalZ * side * wallCenterOffset,
        )
      ) {
        isClear = false;
        break;
      }
    }
    if (isClear) return wallOffset;
  }
  return baseOffset + FACADE_MAX_ADDITIONAL_SETBACK_METERS;
}

function facadeRunFor(edge: RoadEdge): { readonly start: number; readonly end: number } {
  const isCourtyardLink = edge.from.endsWith('-hub') || edge.to.endsWith('-yard');
  const start = edge.from.startsWith('aohara-access-')
    ? FACADE_ACCESS_SETBACK_METERS
    : isCourtyardLink
      ? FACADE_COURTYARD_SETBACK_METERS
      : FACADE_HUB_SETBACK_METERS;
  const end = edge.to.startsWith('aohara-access-')
    ? FACADE_ACCESS_SETBACK_METERS
    : edge.to.endsWith('-hub')
      ? FACADE_HUB_SETBACK_METERS
      : FACADE_COURTYARD_SETBACK_METERS;
  return {
    start: Math.min(start, Math.max(0, edge.lengthMeters / 2 - 0.5)),
    end: Math.min(end, Math.max(0, edge.lengthMeters / 2 - 0.5)),
  };
}

function choosePalette<T>(palette: readonly T[], seed: number, salt: number): T {
  const index = Math.floor(stableUnit(seed, salt, 1601) * palette.length);
  return palette[index] ?? palette[0]!;
}

/** Deterministic building modules form close-set rows on both sides of every Aohara passage. */
export function generateAoharaAlleyFacadePlacements(
  network: RoadNetwork,
  tier: TierId,
): readonly UrbanAlleyFacadePlacement[] {
  const placements: UrbanAlleyFacadePlacement[] = [];
  const targetModuleLength = FACADE_MODULE_LENGTH_METERS[tier];
  const alleyEdges = network.edges.filter((edge) => edge.roadClass === 'urban-alley');

  alleyEdges.forEach((edge, edgeIndex) => {
    const run = facadeRunFor(edge);
    const availableLength = Math.max(0, edge.lengthMeters - run.start - run.end);
    if (availableLength < 1) return;
    const endAlongMeters = edge.lengthMeters - run.end;
    const rowOffsets: Readonly<Record<-1 | 1, number>> = {
      [-1]: resolveFacadeWallOffset(network, edge, -1, run.start, endAlongMeters),
      [1]: resolveFacadeWallOffset(network, edge, 1, run.start, endAlongMeters),
    };
    const moduleCount = Math.max(1, Math.ceil(availableLength / targetModuleLength));
    const moduleLength = availableLength / moduleCount;
    const wallColor = choosePalette(FACADE_WALL_PALETTE, edgeIndex, 1637);
    const roofColor = choosePalette(FACADE_ROOF_PALETTE, edgeIndex, 1657);

    for (let moduleIndex = 0; moduleIndex < moduleCount; moduleIndex += 1) {
      const startAlongMeters = run.start + moduleIndex * moduleLength;
      const endAlongMeters =
        moduleIndex === moduleCount - 1
          ? edge.lengthMeters - run.end
          : startAlongMeters + moduleLength;
      const alongMeters = (startAlongMeters + endAlongMeters) / 2;
      const frame = roadFrameAt(edge, alongMeters);
      const depthMeters = FACADE_BUILDING_DEPTH_METERS;
      const yaw = Math.atan2(-frame.tangentZ, frame.tangentX);
      const heightMeters = 9.2 + stableUnit(edgeIndex, moduleIndex, 1669) * 4.1;

      for (const side of [-1, 1] as const) {
        const wallOffsetMeters = rowOffsets[side];
        const centerOffset = wallOffsetMeters + depthMeters / 2 - 0.05;
        placements.push({
          id: `${edge.id}:${side}:${moduleIndex}`,
          roadEdgeId: edge.id,
          side,
          alongMeters,
          startAlongMeters,
          endAlongMeters,
          x: frame.x + frame.normalX * side * centerOffset,
          z: frame.z + frame.normalZ * side * centerOffset,
          yaw,
          tangentX: frame.tangentX,
          tangentZ: frame.tangentZ,
          normalX: frame.normalX,
          normalZ: frame.normalZ,
          halfWidthMeters: edge.halfWidthMeters,
          wallOffsetMeters,
          widthMeters: endAlongMeters - startAlongMeters,
          depthMeters,
          heightMeters,
          color: wallColor,
          roofColor,
        });
      }
    }
  });

  return placements;
}

function createContinuousWallGeometry(
  network: RoadNetwork,
  placements: readonly UrbanAlleyFacadePlacement[],
  originX: number,
  originZ: number,
): BufferGeometry {
  const placementsByEdge = new Map<string, UrbanAlleyFacadePlacement[]>();
  for (const placement of placements) {
    const edgePlacements = placementsByEdge.get(placement.roadEdgeId) ?? [];
    edgePlacements.push(placement);
    placementsByEdge.set(placement.roadEdgeId, edgePlacements);
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const appendQuad = (
    points: readonly [
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
    ],
    color: Color,
  ): void => {
    const order = [0, 1, 2, 0, 2, 3] as const;
    for (const index of order) {
      const vertex = points[index]!;
      positions.push(vertex[0], vertex[1], vertex[2]);
      colors.push(color.r, color.g, color.b);
    }
  };

  for (const edge of network.edges) {
    if (edge.roadClass !== 'urban-alley') continue;
    const edgePlacements = placementsByEdge.get(edge.id);
    if (edgePlacements === undefined || edgePlacements.length === 0) continue;
    const run = facadeRunFor(edge);
    const facadeColor = new Color(edgePlacements[0]!.color);
    const endAlongMeters = edge.lengthMeters - run.end;
    const wallSegmentCount = Math.max(
      1,
      Math.ceil((endAlongMeters - run.start) / FACADE_COLLISION_SEGMENT_METERS),
    );
    const sampleDistances = Array.from(
      { length: wallSegmentCount + 1 },
      (_, index) => run.start + ((endAlongMeters - run.start) * index) / wallSegmentCount,
    );

    for (const side of [-1, 1] as const) {
      const sidePlacement = edgePlacements.find((placement) => placement.side === side);
      if (sidePlacement === undefined) continue;
      const wallOffset = sidePlacement.wallOffsetMeters;
      for (let index = 0; index + 1 < sampleDistances.length; index += 1) {
        const startDistance = sampleDistances[index]!;
        const endDistance = sampleDistances[index + 1]!;
        const middle = roadFrameAt(edge, (startDistance + endDistance) / 2);
        const wallCenterOffset = wallOffset - 0.05 + FACADE_WALL_THICKNESS_METERS / 2;
        if (
          !hasFacadeRoadClearance(
            network,
            middle.x + middle.normalX * side * wallCenterOffset,
            middle.z + middle.normalZ * side * wallCenterOffset,
          )
        ) {
          continue;
        }
        const start = roadFrameAt(edge, startDistance);
        const end = roadFrameAt(edge, endDistance);
        const startX = start.x + start.normalX * side * wallOffset - originX;
        const startZ = start.z + start.normalZ * side * wallOffset - originZ;
        const endX = end.x + end.normalX * side * wallOffset - originX;
        const endZ = end.z + end.normalZ * side * wallOffset - originZ;
        const lowerY = FACADE_BASE_Y;
        const upperY = FACADE_BASE_Y + FACADE_WALL_HEIGHT_METERS;
        appendQuad(
          [
            [startX, lowerY, startZ],
            [endX, lowerY, endZ],
            [endX, upperY, endZ],
            [startX, upperY, startZ],
          ],
          facadeColor,
        );
      }

      // Close each end at the street mouth and small interior court to avoid open wall caps.
      const first = roadFrameAt(edge, run.start);
      const last = roadFrameAt(edge, edge.lengthMeters - run.end);
      for (const [frame, facing] of [
        [first, -1],
        [last, 1],
      ] as const) {
        const x = frame.x + frame.normalX * side * wallOffset - originX;
        const z = frame.z + frame.normalZ * side * wallOffset - originZ;
        const halfDepth = FACADE_WALL_THICKNESS_METERS / 2;
        const capCenterX = x - frame.tangentX * facing * halfDepth;
        const capCenterZ = z - frame.tangentZ * facing * halfDepth;
        const alongX = frame.normalX * side * halfDepth;
        const alongZ = frame.normalZ * side * halfDepth;
        appendQuad(
          [
            [capCenterX - alongX, FACADE_BASE_Y, capCenterZ - alongZ],
            [capCenterX + alongX, FACADE_BASE_Y, capCenterZ + alongZ],
            [capCenterX + alongX, FACADE_BASE_Y + FACADE_WALL_HEIGHT_METERS, capCenterZ + alongZ],
            [capCenterX - alongX, FACADE_BASE_Y + FACADE_WALL_HEIGHT_METERS, capCenterZ - alongZ],
          ],
          facadeColor,
        );
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.name = 'aohara-continuous-alley-frontage-walls';
  return geometry;
}

function makeCollisionBoxes(
  network: RoadNetwork,
  placements: readonly UrbanAlleyFacadePlacement[],
): readonly StaticBuildingBox[] {
  const edgeById = new Map(network.edges.map((edge) => [edge.id, edge]));
  const boxes: StaticBuildingBox[] = [];
  for (const placement of placements) {
    const edge = edgeById.get(placement.roadEdgeId);
    if (edge === undefined) continue;
    const segmentCount = Math.max(
      1,
      Math.ceil(placement.widthMeters / FACADE_COLLISION_SEGMENT_METERS),
    );
    const segmentLength = placement.widthMeters / segmentCount;
    const wallCenterOffset = placement.wallOffsetMeters - 0.05 + FACADE_WALL_THICKNESS_METERS / 2;
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const alongMeters = placement.startAlongMeters + (segmentIndex + 0.5) * segmentLength;
      const frame = roadFrameAt(edge, alongMeters);
      boxes.push({
        x: frame.x + frame.normalX * placement.side * wallCenterOffset,
        z: frame.z + frame.normalZ * placement.side * wallCenterOffset,
        // Static collision uses local X aligned to (cos(yaw), sin(yaw)); this sign differs from
        // Three.js Y-rotation, so compute the equivalent tangent-aligned collision yaw explicitly.
        yaw: Math.atan2(frame.tangentZ, frame.tangentX),
        halfWidth: segmentLength / 2 + 0.02,
        halfDepth: FACADE_WALL_THICKNESS_METERS / 2,
      });
    }
  }
  return boxes;
}

/** Continuous, windowed low-rise façades that make narrow backstreets read as building canyons. */
export class UrbanAlleyFrontages {
  readonly root = new Group();
  readonly placements: readonly UrbanAlleyFacadePlacement[];
  readonly collisionBoxes: readonly StaticBuildingBox[];
  readonly #meshes: InstancedMesh[] = [];
  readonly #geometries: BufferGeometry[] = [];
  readonly #materials: MeshStandardNodeMaterial[] = [];
  readonly #collisionCells = new Map<string, StaticBuildingBox[]>();
  readonly #stats: Readonly<Record<string, number>>;
  #disposed = false;

  constructor(tier: TierId, network: RoadNetwork, origin: readonly [number, number, number]) {
    this.root.name = 'aohara-backstreet-frontages';
    this.placements = generateAoharaAlleyFacadePlacements(network, tier);
    this.collisionBoxes = makeCollisionBoxes(network, this.placements);
    this.#buildCollisionIndex();
    const [originX, , originZ] = origin;
    const wallGeometry = createContinuousWallGeometry(network, this.placements, originX, originZ);
    const wallMaterial = new MeshStandardNodeMaterial();
    wallMaterial.name = 'aohara-continuous-alley-facade-material';
    wallMaterial.color.setHex(0xffffff);
    wallMaterial.vertexColors = true;
    wallMaterial.roughness = 0.88;
    wallMaterial.metalness = 0.03;
    wallMaterial.side = DoubleSide;
    const walls = new Mesh(wallGeometry, wallMaterial);
    walls.name = 'aohara-continuous-alley-facade-walls';
    walls.castShadow = true;
    walls.receiveShadow = true;
    this.root.add(walls);
    this.#geometries.push(wallGeometry);
    this.#materials.push(wallMaterial);

    const buildingGeometry = new BoxGeometry(1, 1, 1);
    buildingGeometry.name = 'aohara-alley-rowhouse-volume-geometry';
    const buildingMaterial = new MeshStandardNodeMaterial();
    buildingMaterial.name = 'aohara-alley-rowhouse-facade-material';
    buildingMaterial.color.setHex(0xffffff);
    buildingMaterial.roughness = 0.82;
    buildingMaterial.metalness = 0.04;
    const buildings = new InstancedMesh(buildingGeometry, buildingMaterial, this.placements.length);
    buildings.name = 'aohara-alley-rowhouse-volumes';
    buildings.frustumCulled = false;
    buildings.castShadow = true;
    buildings.receiveShadow = true;

    const roofGeometry = new BoxGeometry(1, 1, 1);
    roofGeometry.name = 'aohara-alley-rowhouse-roof-geometry';
    const roofMaterial = new MeshStandardNodeMaterial();
    roofMaterial.name = 'aohara-alley-rowhouse-roof-material';
    roofMaterial.color.setHex(0xffffff);
    roofMaterial.roughness = 0.91;
    roofMaterial.metalness = 0.02;
    const roofs = new InstancedMesh(roofGeometry, roofMaterial, this.placements.length);
    roofs.name = 'aohara-alley-rowhouse-roofs';
    roofs.frustumCulled = false;
    roofs.castShadow = true;
    roofs.receiveShadow = true;

    const windowGeometry = new BoxGeometry(1, 1, 0.08);
    windowGeometry.name = 'aohara-alley-window-geometry';
    const windowMaterial = new MeshStandardNodeMaterial();
    windowMaterial.name = 'aohara-alley-tinted-window-material';
    windowMaterial.color.setHex(0xffffff);
    windowMaterial.roughness = 0.35;
    windowMaterial.metalness = 0.12;
    const windowTransforms: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly yaw: number;
      readonly width: number;
      readonly height: number;
      readonly color: number;
    }[] = [];

    const doorGeometry = new BoxGeometry(1, 1, 0.1);
    doorGeometry.name = 'aohara-alley-door-geometry';
    const doorMaterial = new MeshStandardNodeMaterial();
    doorMaterial.name = 'aohara-alley-door-material';
    doorMaterial.color.setHex(0x3b3028);
    doorMaterial.roughness = 0.84;
    const doorPlacements: UrbanAlleyFacadePlacement[] = [];

    const transform = new Object3D();
    this.placements.forEach((placement, index) => {
      transform.position.set(
        placement.x - originX,
        FACADE_BASE_Y + placement.heightMeters / 2,
        placement.z - originZ,
      );
      transform.rotation.set(0, placement.yaw, 0);
      transform.scale.set(
        placement.widthMeters + 0.02,
        placement.heightMeters,
        placement.depthMeters,
      );
      transform.updateMatrix();
      buildings.setMatrixAt(index, transform.matrix);
      buildings.setColorAt(index, new Color(placement.color));

      const roofHeight = 0.28;
      transform.position.set(
        placement.x - originX,
        FACADE_BASE_Y + placement.heightMeters + roofHeight / 2,
        placement.z - originZ,
      );
      transform.rotation.set(0, placement.yaw, 0);
      transform.scale.set(placement.widthMeters + 0.18, roofHeight, placement.depthMeters + 0.22);
      transform.updateMatrix();
      roofs.setMatrixAt(index, transform.matrix);
      roofs.setColorAt(index, new Color(placement.roofColor));

      // The visible, alley-facing wall is just in front of the shell's road-side plane.
      const faceOffset = placement.depthMeters / 2 + 0.02;
      const faceX = placement.x - placement.normalX * placement.side * faceOffset;
      const faceZ = placement.z - placement.normalZ * placement.side * faceOffset;
      const alongOffsets = [-placement.widthMeters * 0.28, 0, placement.widthMeters * 0.28];
      const floorHeights = placement.heightMeters >= 11.2 ? [2.7, 5.7, 8.7] : [2.7, 5.7];
      for (const localAlong of alongOffsets) {
        for (const floorY of floorHeights) {
          windowTransforms.push({
            x: faceX + placement.tangentX * localAlong,
            y: FACADE_BASE_Y + floorY,
            z: faceZ + placement.tangentZ * localAlong,
            yaw: placement.yaw,
            width: 1.25,
            height: 1.55,
            color: choosePalette(
              FACADE_WINDOW_COLORS,
              index,
              Math.round((localAlong + 100) * 3 + floorY * 11),
            ),
          });
        }
      }
      if (index % 3 === 0) doorPlacements.push(placement);
    });

    buildings.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor !== null) buildings.instanceColor.needsUpdate = true;
    if (roofs.instanceColor !== null) roofs.instanceColor.needsUpdate = true;
    this.root.add(buildings, roofs);
    this.#meshes.push(buildings, roofs);
    this.#geometries.push(buildingGeometry, roofGeometry);
    this.#materials.push(buildingMaterial, roofMaterial);

    const windows = new InstancedMesh(windowGeometry, windowMaterial, windowTransforms.length);
    windows.name = 'aohara-alley-frontage-windows';
    windows.frustumCulled = false;
    windows.castShadow = false;
    windows.receiveShadow = true;
    windowTransforms.forEach((window, index) => {
      transform.position.set(window.x - originX, window.y, window.z - originZ);
      transform.rotation.set(0, window.yaw, 0);
      transform.scale.set(window.width, window.height, 1);
      transform.updateMatrix();
      windows.setMatrixAt(index, transform.matrix);
      windows.setColorAt(index, new Color(window.color));
    });
    windows.instanceMatrix.needsUpdate = true;
    if (windows.instanceColor !== null) windows.instanceColor.needsUpdate = true;
    this.root.add(windows);
    this.#meshes.push(windows);
    this.#geometries.push(windowGeometry);
    this.#materials.push(windowMaterial);

    const doors = new InstancedMesh(doorGeometry, doorMaterial, doorPlacements.length);
    doors.name = 'aohara-alley-frontage-doors';
    doors.frustumCulled = false;
    doors.castShadow = false;
    doors.receiveShadow = true;
    doorPlacements.forEach((placement, index) => {
      const faceOffset = placement.depthMeters / 2 + 0.02;
      const faceX = placement.x - placement.normalX * placement.side * faceOffset;
      const faceZ = placement.z - placement.normalZ * placement.side * faceOffset;
      transform.position.set(faceX - originX, FACADE_BASE_Y + 1.2, faceZ - originZ);
      transform.rotation.set(0, placement.yaw, 0);
      transform.scale.set(1.25, 2.4, 1);
      transform.updateMatrix();
      doors.setMatrixAt(index, transform.matrix);
    });
    doors.instanceMatrix.needsUpdate = true;
    this.root.add(doors);
    this.#meshes.push(doors);
    this.#geometries.push(doorGeometry);
    this.#materials.push(doorMaterial);

    const alleyEdgeCount = network.edges.filter((edge) => edge.roadClass === 'urban-alley').length;
    this.#stats = {
      urbanAlleyFacadeBuildings: this.placements.length,
      urbanAlleyFacadeWindows: windowTransforms.length,
      urbanAlleyFacadeDoors: doorPlacements.length,
      urbanAlleyFacadeWallRuns: alleyEdgeCount * 2,
      urbanAlleyFacadeBatches: this.#meshes.length + 1,
    };
  }

  #buildCollisionIndex(): void {
    const cellSize = 32;
    for (const box of this.collisionBoxes) {
      const boundsRadius = Math.hypot(box.halfWidth, box.halfDepth);
      const minCellX = Math.floor((box.x - boundsRadius) / cellSize);
      const maxCellX = Math.floor((box.x + boundsRadius) / cellSize);
      const minCellZ = Math.floor((box.z - boundsRadius) / cellSize);
      const maxCellZ = Math.floor((box.z + boundsRadius) / cellSize);
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const key = `${cellX}:${cellZ}`;
          const boxes = this.#collisionCells.get(key) ?? [];
          boxes.push(box);
          this.#collisionCells.set(key, boxes);
        }
      }
    }
  }

  collide(car: TownCarProbe): TownHit[] {
    if (this.#disposed) return [];
    const cellSize = 32;
    const searchRadius = 5.5;
    const minCellX = Math.floor((car.x - searchRadius) / cellSize);
    const maxCellX = Math.floor((car.x + searchRadius) / cellSize);
    const minCellZ = Math.floor((car.z - searchRadius) / cellSize);
    const maxCellZ = Math.floor((car.z + searchRadius) / cellSize);
    const nearby = new Set<StaticBuildingBox>();
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        for (const box of this.#collisionCells.get(`${cellX}:${cellZ}`) ?? []) {
          nearby.add(box);
        }
      }
    }
    return collideCarWithStaticBoxes(car, [...nearby]);
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
