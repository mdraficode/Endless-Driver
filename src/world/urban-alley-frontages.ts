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
import { aoharaBoulevardDistanceMeters } from '../config/roads';
import type { RoadEdge, RoadNetwork } from './road-network';
import { collideCarWithStaticBoxes, type StaticBuildingBox } from './static-building-collision';
import type { TownCarProbe, TownHit } from './town';

// The frontage line stays beyond the narrow clutter strip while remaining one car-width off the alley.
const FACADE_WALL_GAP_METERS = 3.2;
const FACADE_WALL_THICKNESS_METERS = 0.18;
const FACADE_COLLISION_SEGMENT_METERS = 2;
const FACADE_PROP_CLEARANCE_SEGMENT_METERS = 6;
const FACADE_ROAD_SAMPLE_METERS = 0.1;
const FACADE_MIN_ROAD_CLEARANCE_METERS = 2.55;
// Perpendicular distance a facade must keep from the grand boulevard's centerline:
// the avenue's paint (centerline + 17 m of junction trim) plus a car circle plus margin,
// so no street row stops at the avenue's asphalt.
const FACADE_BOULEVARD_CLEARANCE_METERS = 15.3;
const FACADE_MODULE_MAX_ADJUSTMENT_METERS = 2;
const FACADE_MODULE_ADJUSTMENT_STEP_METERS = 0.25;
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
  if (
    nearestRoad !== null &&
    nearestRoad.distance - nearestRoad.halfWidthMeters - nearestRoad.shoulderMeters <
      FACADE_MIN_ROAD_CLEARANCE_METERS
  ) {
    return false;
  }
  // The grand boulevard is a real street; facades must clear its full right-of-way
  // (halfwidth + shoulder + sidewalk half + car circle + margin) even where the
  // nearest probed road is only the local street.
  return Math.abs(aoharaBoulevardDistanceMeters(x, z)) >= FACADE_BOULEVARD_CLEARANCE_METERS;
}

function hasFacadeOffsetTransitionClearance(
  network: RoadNetwork,
  edge: RoadEdge,
  side: -1 | 1,
  alongMeters: number,
  startOffsetMeters: number,
  endOffsetMeters: number,
): boolean {
  const frame = roadFrameAt(edge, alongMeters);
  const stepCount = Math.max(1, Math.ceil(Math.abs(endOffsetMeters - startOffsetMeters) / 0.1));
  for (let index = 0; index <= stepCount; index += 1) {
    const t = index / stepCount;
    const wallOffset = startOffsetMeters + (endOffsetMeters - startOffsetMeters) * t;
    const centerOffset = wallOffset - 0.05 + FACADE_WALL_THICKNESS_METERS / 2;
    if (
      !hasFacadeRoadClearance(
        network,
        frame.x + frame.normalX * side * centerOffset,
        frame.z + frame.normalZ * side * centerOffset,
      )
    ) {
      return false;
    }
  }
  return true;
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

const FACADE_PLACEMENT_CACHE = new WeakMap<
  RoadNetwork,
  Map<TierId, readonly UrbanAlleyFacadePlacement[]>
>();

/** Deterministic building modules form close-set rows on both sides of every Aohara passage. */
export function generateAoharaAlleyFacadePlacements(
  network: RoadNetwork,
  tier: TierId,
): readonly UrbanAlleyFacadePlacement[] {
  const cachedPlacements = FACADE_PLACEMENT_CACHE.get(network)?.get(tier);
  if (cachedPlacements !== undefined) return cachedPlacements;

  const placements: UrbanAlleyFacadePlacement[] = [];
  const targetModuleLength = FACADE_MODULE_LENGTH_METERS[tier];
  const alleyEdges = network.edges.filter((edge) => edge.roadClass === 'urban-alley');

  alleyEdges.forEach((edge, edgeIndex) => {
    const run = facadeRunFor(edge);
    const availableLength = Math.max(0, edge.lengthMeters - run.start - run.end);
    if (availableLength < 1) return;
    const moduleCount = Math.max(1, Math.ceil(availableLength / targetModuleLength));
    const moduleLength = availableLength / moduleCount;
    const wallColor = choosePalette(FACADE_WALL_PALETTE, edgeIndex, 1637);
    const roofColor = choosePalette(FACADE_ROOF_PALETTE, edgeIndex, 1657);
    const wallOffsetMeters = edge.halfWidthMeters + FACADE_WALL_GAP_METERS;
    const wallCenterOffset = wallOffsetMeters - 0.05 + FACADE_WALL_THICKNESS_METERS / 2;

    for (let moduleIndex = 0; moduleIndex < moduleCount; moduleIndex += 1) {
      const moduleStartMeters = run.start + moduleIndex * moduleLength;
      const moduleEndMeters =
        moduleIndex === moduleCount - 1
          ? edge.lengthMeters - run.end
          : moduleStartMeters + moduleLength;
      const sampleCount = Math.max(
        1,
        Math.ceil((moduleEndMeters - moduleStartMeters) / FACADE_ROAD_SAMPLE_METERS),
      );
      const sampleDistances = Array.from(
        { length: sampleCount + 1 },
        (_, sampleIndex) =>
          moduleStartMeters + ((moduleEndMeters - moduleStartMeters) * sampleIndex) / sampleCount,
      );
      const sampleFrames = sampleDistances.map((distance) => roadFrameAt(edge, distance));
      const depthMeters = FACADE_BUILDING_DEPTH_METERS;
      const heightMeters = 9.2 + stableUnit(edgeIndex, moduleIndex, 1669) * 4.1;

      for (const side of [-1, 1] as const) {
        const clearSamples = sampleFrames.map((frame) =>
          hasFacadeRoadClearance(
            network,
            frame.x + frame.normalX * side * wallCenterOffset,
            frame.z + frame.normalZ * side * wallCenterOffset,
          ),
        );
        let spanIndex = 0;
        const appendSpan = (
          startAlongMeters: number,
          endAlongMeters: number,
          spanWallOffsetMeters: number,
        ): void => {
          if (endAlongMeters - startAlongMeters < 0.1) return;
          const alongMeters = (startAlongMeters + endAlongMeters) / 2;
          const frame = roadFrameAt(edge, alongMeters);
          const yaw = Math.atan2(-frame.tangentZ, frame.tangentX);
          const centerOffset = spanWallOffsetMeters + depthMeters / 2 - 0.05;
          placements.push({
            id: `${edge.id}:${side}:${moduleIndex}:${spanIndex}`,
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
            wallOffsetMeters: spanWallOffsetMeters,
            widthMeters: endAlongMeters - startAlongMeters,
            depthMeters,
            heightMeters,
            color: wallColor,
            roofColor,
          });
          spanIndex += 1;
        };

        let fullModuleWallOffset: number | null = clearSamples.every(Boolean)
          ? wallOffsetMeters
          : null;
        // Nudge a whole module only if a nearby setback clears every sample; otherwise keep only
        // the clear spans at the tight frontage line and open the small conflicting road pocket.
        if (fullModuleWallOffset === null) {
          const minimumWallOffset =
            edge.halfWidthMeters +
            edge.shoulderMeters +
            FACADE_MIN_ROAD_CLEARANCE_METERS -
            0.05 +
            FACADE_WALL_THICKNESS_METERS / 2;
          const checkpointIndices = [
            ...new Set([
              0,
              Math.round(sampleCount / 4),
              Math.round(sampleCount / 2),
              Math.round((sampleCount * 3) / 4),
              sampleCount,
            ]),
          ];
          for (
            let step = 1;
            step * FACADE_MODULE_ADJUSTMENT_STEP_METERS <= FACADE_MODULE_MAX_ADJUSTMENT_METERS &&
            fullModuleWallOffset === null;
            step += 1
          ) {
            const delta = step * FACADE_MODULE_ADJUSTMENT_STEP_METERS;
            for (const candidateOffset of [wallOffsetMeters - delta, wallOffsetMeters + delta]) {
              if (candidateOffset < minimumWallOffset) continue;
              const candidateCenterOffset =
                candidateOffset - 0.05 + FACADE_WALL_THICKNESS_METERS / 2;
              const hasClearCheckpoints = checkpointIndices.every((sampleIndex) => {
                const frame = sampleFrames[sampleIndex]!;
                return hasFacadeRoadClearance(
                  network,
                  frame.x + frame.normalX * side * candidateCenterOffset,
                  frame.z + frame.normalZ * side * candidateCenterOffset,
                );
              });
              if (!hasClearCheckpoints) continue;
              const hasClearModule = sampleFrames.every((frame) =>
                hasFacadeRoadClearance(
                  network,
                  frame.x + frame.normalX * side * candidateCenterOffset,
                  frame.z + frame.normalZ * side * candidateCenterOffset,
                ),
              );
              if (hasClearModule) {
                fullModuleWallOffset = candidateOffset;
                break;
              }
            }
          }
        }

        if (fullModuleWallOffset !== null) {
          appendSpan(moduleStartMeters, moduleEndMeters, fullModuleWallOffset);
          continue;
        }

        let clearRunStart = -1;
        for (let intervalIndex = 0; intervalIndex < sampleCount; intervalIndex += 1) {
          const intervalClear = clearSamples[intervalIndex] && clearSamples[intervalIndex + 1];
          if (intervalClear) {
            if (clearRunStart < 0) clearRunStart = intervalIndex;
          } else if (clearRunStart >= 0) {
            appendSpan(
              sampleDistances[clearRunStart]!,
              sampleDistances[intervalIndex]!,
              wallOffsetMeters,
            );
            clearRunStart = -1;
          }
        }
        if (clearRunStart >= 0) {
          appendSpan(
            sampleDistances[clearRunStart]!,
            sampleDistances[sampleCount]!,
            wallOffsetMeters,
          );
        }
      }
    }
  });

  let cachedByTier = FACADE_PLACEMENT_CACHE.get(network);
  if (cachedByTier === undefined) {
    cachedByTier = new Map();
    FACADE_PLACEMENT_CACHE.set(network, cachedByTier);
  }
  cachedByTier.set(tier, placements);
  return placements;
}

interface FacadeOffsetConnector {
  readonly edge: RoadEdge;
  readonly frame: RoadFrame;
  readonly side: -1 | 1;
  readonly startOffsetMeters: number;
  readonly endOffsetMeters: number;
  readonly footprint: StaticBuildingBox;
}

function adjacentFacadePlacementPairs(
  placements: readonly UrbanAlleyFacadePlacement[],
): readonly (readonly [UrbanAlleyFacadePlacement, UrbanAlleyFacadePlacement])[] {
  const placementsByRow = new Map<string, UrbanAlleyFacadePlacement[]>();
  for (const placement of placements) {
    const key = `${placement.roadEdgeId}:${placement.side}`;
    const row = placementsByRow.get(key) ?? [];
    row.push(placement);
    placementsByRow.set(key, row);
  }

  const pairs: (readonly [UrbanAlleyFacadePlacement, UrbanAlleyFacadePlacement])[] = [];
  for (const row of placementsByRow.values()) {
    row.sort((first, second) => first.startAlongMeters - second.startAlongMeters);
    for (let index = 1; index < row.length; index += 1) {
      const previous = row[index - 1]!;
      const current = row[index]!;
      if (Math.abs(previous.endAlongMeters - current.startAlongMeters) <= 1e-6) {
        pairs.push([previous, current]);
      }
    }
  }
  return pairs;
}

function makeFacadeOffsetConnector(
  network: RoadNetwork,
  previous: UrbanAlleyFacadePlacement,
  current: UrbanAlleyFacadePlacement,
): FacadeOffsetConnector | null {
  const offsetDifference = current.wallOffsetMeters - previous.wallOffsetMeters;
  if (
    Math.abs(offsetDifference) <= 1e-6 ||
    current.roadEdgeId !== previous.roadEdgeId ||
    current.side !== previous.side
  ) {
    return null;
  }
  const edge = network.edges.find((candidate) => candidate.id === previous.roadEdgeId);
  if (
    edge === undefined ||
    !hasFacadeOffsetTransitionClearance(
      network,
      edge,
      previous.side,
      previous.endAlongMeters,
      previous.wallOffsetMeters,
      current.wallOffsetMeters,
    )
  ) {
    return null;
  }

  const frame = roadFrameAt(edge, previous.endAlongMeters);
  const centerOffset =
    (previous.wallOffsetMeters + current.wallOffsetMeters) / 2 -
    0.05 +
    FACADE_WALL_THICKNESS_METERS / 2;
  return {
    edge,
    frame,
    side: previous.side,
    startOffsetMeters: previous.wallOffsetMeters,
    endOffsetMeters: current.wallOffsetMeters,
    footprint: {
      x: frame.x + frame.normalX * previous.side * centerOffset,
      z: frame.z + frame.normalZ * previous.side * centerOffset,
      yaw: Math.atan2(frame.normalZ * previous.side, frame.normalX * previous.side),
      halfWidth: Math.abs(offsetDifference) / 2 + 0.02,
      halfDepth: FACADE_WALL_THICKNESS_METERS / 2,
    },
  };
}

function createContinuousWallGeometry(
  network: RoadNetwork,
  placements: readonly UrbanAlleyFacadePlacement[],
  originX: number,
  originZ: number,
): BufferGeometry {
  const edgeById = new Map(network.edges.map((edge) => [edge.id, edge]));
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

  for (const placement of placements) {
    const edge = edgeById.get(placement.roadEdgeId);
    if (edge === undefined) continue;
    const color = new Color(placement.color);
    const segmentCount = Math.max(
      1,
      Math.ceil(placement.widthMeters / FACADE_COLLISION_SEGMENT_METERS),
    );
    const segmentLength = placement.widthMeters / segmentCount;
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const startDistance = placement.startAlongMeters + segmentIndex * segmentLength;
      const endDistance =
        segmentIndex === segmentCount - 1
          ? placement.endAlongMeters
          : startDistance + segmentLength;
      const start = roadFrameAt(edge, startDistance);
      const end = roadFrameAt(edge, endDistance);
      const side = placement.side;
      const wallOffset = placement.wallOffsetMeters;
      const startX = start.x + start.normalX * side * wallOffset - originX;
      const startZ = start.z + start.normalZ * side * wallOffset - originZ;
      const endX = end.x + end.normalX * side * wallOffset - originX;
      const endZ = end.z + end.normalZ * side * wallOffset - originZ;
      appendQuad(
        [
          [startX, FACADE_BASE_Y, startZ],
          [endX, FACADE_BASE_Y, endZ],
          [endX, FACADE_BASE_Y + FACADE_WALL_HEIGHT_METERS, endZ],
          [startX, FACADE_BASE_Y + FACADE_WALL_HEIGHT_METERS, startZ],
        ],
        color,
      );
    }
  }

  for (const [previous, current] of adjacentFacadePlacementPairs(placements)) {
    const connector = makeFacadeOffsetConnector(network, previous, current);
    if (connector === null) continue;
    const { frame, side, startOffsetMeters, endOffsetMeters } = connector;
    const startX = frame.x + frame.normalX * side * startOffsetMeters - originX;
    const startZ = frame.z + frame.normalZ * side * startOffsetMeters - originZ;
    const endX = frame.x + frame.normalX * side * endOffsetMeters - originX;
    const endZ = frame.z + frame.normalZ * side * endOffsetMeters - originZ;
    appendQuad(
      [
        [startX, FACADE_BASE_Y, startZ],
        [endX, FACADE_BASE_Y, endZ],
        [endX, FACADE_BASE_Y + FACADE_WALL_HEIGHT_METERS, endZ],
        [startX, FACADE_BASE_Y + FACADE_WALL_HEIGHT_METERS, startZ],
      ],
      new Color(current.color),
    );
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
  for (const [previous, current] of adjacentFacadePlacementPairs(placements)) {
    const connector = makeFacadeOffsetConnector(network, previous, current);
    if (connector !== null) boxes.push(connector.footprint);
  }
  return boxes;
}

function makePropClearanceFootprints(
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
      Math.ceil(placement.widthMeters / FACADE_PROP_CLEARANCE_SEGMENT_METERS),
    );
    const segmentLength = placement.widthMeters / segmentCount;
    const wallCenterOffset = placement.wallOffsetMeters - 0.05 + FACADE_WALL_THICKNESS_METERS / 2;
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const alongMeters = placement.startAlongMeters + (segmentIndex + 0.5) * segmentLength;
      const frame = roadFrameAt(edge, alongMeters);
      boxes.push({
        x: frame.x + frame.normalX * placement.side * wallCenterOffset,
        z: frame.z + frame.normalZ * placement.side * wallCenterOffset,
        yaw: Math.atan2(frame.tangentZ, frame.tangentX),
        halfWidth: segmentLength / 2 + 0.05,
        halfDepth: FACADE_WALL_THICKNESS_METERS / 2 + 0.02,
      });
    }
  }
  for (const [previous, current] of adjacentFacadePlacementPairs(placements)) {
    const connector = makeFacadeOffsetConnector(network, previous, current);
    if (connector !== null) {
      boxes.push({
        ...connector.footprint,
        halfWidth: connector.footprint.halfWidth + 0.05,
        halfDepth: connector.footprint.halfDepth + 0.02,
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
  readonly propClearanceFootprints: readonly StaticBuildingBox[];
  readonly #meshes: InstancedMesh[] = [];
  readonly #geometries: BufferGeometry[] = [];
  readonly #materials: MeshStandardNodeMaterial[] = [];
  readonly #collisionCells = new Map<string, StaticBuildingBox[]>();
  readonly #stats: Readonly<Record<string, number>>;
  #disposed = false;

  constructor(tier: TierId, network: RoadNetwork, origin: readonly [number, number, number]) {
    this.root.name = 'aohara-backstreet-frontages';
    this.placements = generateAoharaAlleyFacadePlacements(network, tier);
    const visiblePlacements = this.placements;
    this.collisionBoxes = makeCollisionBoxes(network, visiblePlacements);
    this.propClearanceFootprints = makePropClearanceFootprints(network, visiblePlacements);
    this.#buildCollisionIndex();
    const [originX, , originZ] = origin;
    const wallGeometry = createContinuousWallGeometry(network, visiblePlacements, originX, originZ);
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
    const buildings = new InstancedMesh(
      buildingGeometry,
      buildingMaterial,
      visiblePlacements.length,
    );
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
    const roofs = new InstancedMesh(roofGeometry, roofMaterial, visiblePlacements.length);
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
    visiblePlacements.forEach((placement, index) => {
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
      const alongOffsets =
        placement.widthMeters >= 6
          ? [-placement.widthMeters * 0.28, 0, placement.widthMeters * 0.28]
          : placement.widthMeters >= 3
            ? [0]
            : [];
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
      if (index % 3 === 0 && placement.widthMeters >= 2.5) doorPlacements.push(placement);
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

    const lastPlacementByRow = new Map<string, UrbanAlleyFacadePlacement>();
    let wallRunCount = 0;
    for (const placement of this.placements) {
      const rowKey = `${placement.roadEdgeId}:${placement.side}`;
      const previous = lastPlacementByRow.get(rowKey);
      if (
        previous === undefined ||
        Math.abs(previous.endAlongMeters - placement.startAlongMeters) > 1e-6
      ) {
        wallRunCount += 1;
      }
      lastPlacementByRow.set(rowKey, placement);
    }
    this.#stats = {
      urbanAlleyFacadeBuildings: visiblePlacements.length,
      urbanAlleyFacadeWindows: windowTransforms.length,
      urbanAlleyFacadeDoors: doorPlacements.length,
      urbanAlleyFacadeWallRuns: wallRunCount,
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
