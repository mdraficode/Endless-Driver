import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Object3D,
  type Material,
  type BufferGeometry,
} from 'three';
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  URBAN_ACTIVITY_TIER_BUDGET,
  URBAN_CITY_CONFIG,
  type TrafficSignalAspect,
} from '../config/urban-city';
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
import type { TierId } from '../config/tiers';
import {
  TRAFFIC_VEHICLE_CLASSES,
  type TrafficVehicleClass,
} from '../config/traffic-vehicles';
import { createTrafficVehicleModel, getTrafficVehicleSpec } from './traffic-vehicle-models';

const ROAD_Y = -0.46;
const SIDEWALK_LIFT = 0.035;
const LANE_OFFSET_METERS = 3.4;
const MAX_UPDATE_DELTA_SECONDS = 0.1;

const PEDESTRIAN_COLORS = [0x455d76, 0x805749, 0x536348, 0x414248, 0x897753, 0x715d76] as const;
const SKIN_COLORS = [0xc58e6c, 0xe0b890, 0x9d7259] as const;

type Point2 = readonly [number, number];

interface RouteSegment {
  readonly startX: number;
  readonly startZ: number;
  readonly dx: number;
  readonly dz: number;
  readonly startDistance: number;
  readonly length: number;
  readonly yaw: number;
}

interface UrbanRoute {
  readonly segments: readonly RouteSegment[];
  readonly length: number;
  readonly stopDistance: number;
}

interface RoutePose {
  x: number;
  z: number;
  yaw: number;
}

interface BoxPart {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface TrafficVehicle {
  readonly index: number;
  readonly routeIndex: number;
  readonly type: TrafficVehicleClass;
  readonly instanceIndex: number;
  readonly lengthMeters: number;
  readonly speedMetersPerSecond: number;
  distance: number;
}

interface Pedestrian {
  readonly index: number;
  readonly routeIndex: number;
  readonly speedMetersPerSecond: number;
  phase: number;
  distance: number;
}

interface TrafficQueueEntry {
  readonly vehicleIndex: number;
  distanceToSignal: number;
}

function wrapDistance(distance: number, routeLength: number): number {
  return ((distance % routeLength) + routeLength) % routeLength;
}

function createRoute(
  points: readonly Point2[],
  stopDistance = Number.POSITIVE_INFINITY,
): UrbanRoute {
  const segments: RouteSegment[] = [];
  let totalLength = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    if (length <= 1e-4) {
      continue;
    }
    segments.push({
      startX: start[0],
      startZ: start[1],
      dx,
      dz,
      startDistance: totalLength,
      length,
      yaw: Math.atan2(-dx, -dz),
    });
    totalLength += length;
  }
  if (segments.length === 0 || totalLength <= 0) {
    throw new Error('Aohara activity route needs at least one non-zero segment');
  }
  return { segments, length: totalLength, stopDistance };
}

function sampleRoute(route: UrbanRoute, distance: number, pose: RoutePose): void {
  const wrapped = wrapDistance(distance, route.length);
  for (let index = 0; index < route.segments.length; index += 1) {
    const segment = route.segments[index]!;
    if (wrapped > segment.startDistance + segment.length && index < route.segments.length - 1) {
      continue;
    }
    const along = Math.min(1, Math.max(0, (wrapped - segment.startDistance) / segment.length));
    pose.x = segment.startX + segment.dx * along;
    pose.z = segment.startZ + segment.dz * along;
    pose.yaw = segment.yaw;
    return;
  }
}

function buildTrafficRoutes(): readonly UrbanRoute[] {
  const halfGrid = AOHARA_DISTRICT_CONFIG.gridSpacingMeters;
  const outerLane = halfGrid + LANE_OFFSET_METERS;
  const { stopLineOffsetMeters } = URBAN_CITY_CONFIG.trafficSignal;
  const stopDistance = halfGrid - stopLineOffsetMeters;
  const lane = LANE_OFFSET_METERS;

  // Two deterministic one-way loops put opposing lanes on opposite sides of the centreline.
  // Both cross the signalized central arterial and use its avenue phase; no traffic collider is added.
  return [
    createRoute(
      [
        [-halfGrid, -lane],
        [halfGrid, -lane],
        [outerLane, 0],
        [outerLane, halfGrid],
        [halfGrid, outerLane],
        [-halfGrid, outerLane],
        [-outerLane, halfGrid],
        [-outerLane, 0],
      ],
      stopDistance,
    ),
    createRoute(
      [
        [halfGrid, lane],
        [-halfGrid, lane],
        [-outerLane, 0],
        [-outerLane, -halfGrid],
        [-halfGrid, -outerLane],
        [halfGrid, -outerLane],
        [outerLane, -halfGrid],
        [outerLane, 0],
      ],
      stopDistance,
    ),
  ];
}

function buildSidewalkRoutes(): readonly UrbanRoute[] {
  const { shoulderMeters, localStreetHalfWidthMeters, arterialHalfWidthMeters } =
    AOHARA_DISTRICT_CONFIG;
  const localOffset =
    localStreetHalfWidthMeters + shoulderMeters + URBAN_CITY_CONFIG.sidewalk.widthMeters / 2;
  const arterialOffset =
    arterialHalfWidthMeters + shoulderMeters + URBAN_CITY_CONFIG.sidewalk.widthMeters / 2;
  const halfGrid = AOHARA_DISTRICT_CONFIG.gridSpacingMeters;
  const routes: UrbanRoute[] = [];

  for (const xSide of [-1, 1] as const) {
    for (const zSide of [-1, 1] as const) {
      const innerX = xSide * arterialOffset;
      const outerX = xSide * (halfGrid - localOffset);
      const innerZ = zSide * arterialOffset;
      const outerZ = zSide * (halfGrid - localOffset);
      const minX = Math.min(innerX, outerX);
      const maxX = Math.max(innerX, outerX);
      const minZ = Math.min(innerZ, outerZ);
      const maxZ = Math.max(innerZ, outerZ);
      routes.push(
        createRoute([
          [minX, minZ],
          [maxX, minZ],
          [maxX, maxZ],
          [minX, maxZ],
        ]),
      );
    }
  }
  return routes;
}

function mergeBoxes(parts: readonly BoxPart[], name: string): BufferGeometry {
  const source = parts.map((part) => {
    const geometry = new BoxGeometry(part.width, part.height, part.depth);
    geometry.translate(part.x, part.y, part.z);
    return geometry;
  });
  const merged = mergeGeometries(source, false);
  for (const geometry of source) {
    geometry.dispose();
  }
  if (merged === null) {
    throw new Error(`Aohara activity geometry could not be merged: ${name}`);
  }
  merged.name = name;
  return merged;
}

function createPedestrianBodyGeometry(): BufferGeometry {
  return mergeBoxes(
    [
      { width: 0.13, height: 0.42, depth: 0.16, x: -0.09, y: 0.21, z: 0 },
      { width: 0.13, height: 0.42, depth: 0.16, x: 0.09, y: 0.21, z: 0 },
      { width: 0.36, height: 0.58, depth: 0.22, x: 0, y: 0.65, z: 0 },
      { width: 0.11, height: 0.46, depth: 0.13, x: -0.23, y: 0.68, z: 0 },
      { width: 0.11, height: 0.46, depth: 0.13, x: 0.23, y: 0.68, z: 0 },
    ],
    'aohara-sidewalk-pedestrian-body',
  );
}

function createActivityMaterial(name: string, roughness = 0.78): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.color.setHex(0xffffff);
  material.roughness = roughness;
  material.metalness = 0.04;
  material.name = name;
  return material;
}

function spreadCount(total: number, groupCount: number): number[] {
  const base = Math.floor(total / groupCount);
  const remainder = total % groupCount;
  return Array.from({ length: groupCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function deterministicUnit(index: number, salt: number): number {
  let value = Math.imul(index + salt * 31 + 1, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

/**
 * Advances a traffic actor without passing its queued stop-line slot on a red/amber phase.
 * `queuePosition` is zero for the lead vehicle; callers with mixed vehicle lengths may pass an
 * explicit center-to-slot offset so long buses and rigs retain a realistic bumper gap.
 */
export function advanceTrafficWithSignal(
  currentDistance: number,
  routeLength: number,
  stopDistance: number,
  requestedTravelMeters: number,
  aspect: TrafficSignalAspect,
  queuePosition = 0,
  queueOffsetMeters?: number,
): number {
  if (
    !Number.isFinite(currentDistance) ||
    !Number.isFinite(routeLength) ||
    routeLength <= 0 ||
    !Number.isFinite(stopDistance) ||
    !Number.isFinite(requestedTravelMeters) ||
    requestedTravelMeters <= 0
  ) {
    return currentDistance;
  }

  const distanceToStop = wrapDistance(stopDistance - currentDistance, routeLength);
  const mustStop =
    aspect === 'red' ||
    (aspect === 'amber' &&
      distanceToStop > URBAN_CITY_CONFIG.trafficSignal.amberCommitDistanceMeters);
  const requestedTravel = Math.max(0, requestedTravelMeters);
  if (!mustStop) {
    return wrapDistance(currentDistance + requestedTravel, routeLength);
  }

  const queueOffset =
    queueOffsetMeters !== undefined && Number.isFinite(queueOffsetMeters)
      ? Math.max(0, queueOffsetMeters)
      : Math.max(0, queuePosition) * URBAN_CITY_CONFIG.trafficSignal.queueGapMeters;
  const distanceToQueueSlot = Math.max(0, distanceToStop - queueOffset);
  if (distanceToQueueSlot <= 0.03) {
    return wrapDistance(currentDistance, routeLength);
  }
  const brakingFraction = Math.min(
    1,
    distanceToQueueSlot / URBAN_CITY_CONFIG.trafficSignal.brakingDistanceMeters,
  );
  const allowedTravel = Math.min(requestedTravel * brakingFraction, distanceToQueueSlot);
  return wrapDistance(currentDistance + allowedTravel, routeLength);
}

/**
 * Bounded, visual-only Aohara activity: instanced path-following vehicles and pedestrians, no second
 * physics solver and no moving colliders. Traffic obeys the avenue phase and keeps a class-length-aware
 * bumper gap; pedestrians stay on the four central-block sidewalks until crossing-right-of-way is implemented.
 */
export class UrbanStreetActivity {
  readonly root = new Group();
  readonly #trafficRoutes = buildTrafficRoutes();
  readonly #sidewalkRoutes = buildSidewalkRoutes();
  readonly #vehicles: TrafficVehicle[];
  readonly #vehiclesByRoute: TrafficVehicle[][];
  readonly #trafficQueueScratch: TrafficQueueEntry[][];
  readonly #trafficClassCounts = new Map<TrafficVehicleClass, number>(
    TRAFFIC_VEHICLE_CLASSES.map((type) => [type, 0] as const),
  );
  readonly #trafficMeshes = new Map<TrafficVehicleClass, InstancedMesh>();
  readonly #pedestrians: Pedestrian[];
  readonly #pedestrianBodyMesh: InstancedMesh;
  readonly #pedestrianHeadMesh: InstancedMesh;
  readonly #meshes: InstancedMesh[] = [];
  readonly #materials: Material[] = [];
  readonly #pose: RoutePose = { x: 0, z: 0, yaw: 0 };
  readonly #transform = new Object3D();
  #disposed = false;

  constructor(tier: TierId) {
    const budget = URBAN_ACTIVITY_TIER_BUDGET[tier];
    this.root.name = 'aohara-urban-street-activity';
    this.#vehiclesByRoute = this.#createVehicles(budget.trafficVehicles);
    this.#vehicles = this.#vehiclesByRoute.flat();
    this.#trafficQueueScratch = this.#vehiclesByRoute.map((vehicles) =>
      vehicles.map((vehicle) => ({ vehicleIndex: vehicle.index, distanceToSignal: 0 })),
    );
    this.#pedestrians = this.#createPedestrians(budget.pedestrians);

    const vehicleTrimMaterial = createActivityMaterial(
      'aohara-traffic-vehicle-glass-and-tyres',
      0.9,
    );
    vehicleTrimMaterial.color.setHex(0x242b31);
    const vehicleAccentMaterial = createActivityMaterial('aohara-traffic-vehicle-metal-accents', 0.36);
    vehicleAccentMaterial.color.setHex(0xaab5bd);
    vehicleAccentMaterial.metalness = 0.62;
    const pedestrianBodyMaterial = createActivityMaterial(
      'aohara-sidewalk-pedestrian-clothing',
      0.91,
    );
    const pedestrianHeadMaterial = createActivityMaterial('aohara-sidewalk-pedestrian-skin', 0.9);
    this.#materials.push(vehicleTrimMaterial, vehicleAccentMaterial, pedestrianBodyMaterial, pedestrianHeadMaterial);

    for (const type of TRAFFIC_VEHICLE_CLASSES) {
      const count = this.#trafficClassCounts.get(type) ?? 0;
      if (count === 0) {
        continue;
      }
      const model = createTrafficVehicleModel(type);
      const bodyMaterial = new MeshPhysicalNodeMaterial();
      bodyMaterial.name = `aohara-${type}-physical-paint`;
      bodyMaterial.color.setHex(model.bodyColor);
      bodyMaterial.metalness = 0.18;
      bodyMaterial.roughness = 0.4;
      bodyMaterial.clearcoat = 0.34;
      bodyMaterial.clearcoatRoughness = 0.24;
      this.#materials.push(bodyMaterial);
      this.#trafficMeshes.set(
        type,
        this.#createMesh(
          model.geometry,
          [bodyMaterial, vehicleTrimMaterial, vehicleAccentMaterial],
          count,
          `aohara-traffic-${type}-instances`,
        ),
      );
    }
    this.#pedestrianBodyMesh = this.#createMesh(
      createPedestrianBodyGeometry(),
      pedestrianBodyMaterial,
      budget.pedestrians,
      'aohara-sidewalk-pedestrian-bodies',
    );
    this.#pedestrianHeadMesh = this.#createMesh(
      new BoxGeometry(0.22, 0.22, 0.22),
      pedestrianHeadMaterial,
      budget.pedestrians,
      'aohara-sidewalk-pedestrian-heads',
    );

    for (const pedestrian of this.#pedestrians) {
      this.#pedestrianBodyMesh.setColorAt(
        pedestrian.index,
        new Color(PEDESTRIAN_COLORS[pedestrian.index % PEDESTRIAN_COLORS.length]!),
      );
      this.#pedestrianHeadMesh.setColorAt(
        pedestrian.index,
        new Color(SKIN_COLORS[pedestrian.index % SKIN_COLORS.length]!),
      );
    }
    for (const mesh of [this.#pedestrianBodyMesh, this.#pedestrianHeadMesh]) {
      if (mesh.instanceColor !== null) {
        mesh.instanceColor.needsUpdate = true;
      }
    }

    this.#writeTrafficMatrices();
    this.#writePedestrianMatrices();
  }

  update(deltaSeconds: number, aspect: TrafficSignalAspect): void {
    if (this.#disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }
    const delta = Math.min(MAX_UPDATE_DELTA_SECONDS, deltaSeconds);
    for (let routeIndex = 0; routeIndex < this.#vehiclesByRoute.length; routeIndex += 1) {
      const route = this.#trafficRoutes[routeIndex]!;
      const queue = this.#trafficQueueScratch[routeIndex]!;
      for (const entry of queue) {
        const vehicle = this.#vehicles[entry.vehicleIndex]!;
        entry.distanceToSignal = wrapDistance(route.stopDistance - vehicle.distance, route.length);
      }
      queue.sort(
        (first, second) =>
          first.distanceToSignal - second.distanceToSignal ||
          first.vehicleIndex - second.vehicleIndex,
      );
      let queueOffsetMeters = 0;
      queue.forEach((entry, queuePosition) => {
        const vehicle = this.#vehicles[entry.vehicleIndex]!;
        const centerToSlotMeters = queueOffsetMeters + vehicle.lengthMeters / 2;
        vehicle.distance = advanceTrafficWithSignal(
          vehicle.distance,
          route.length,
          route.stopDistance,
          vehicle.speedMetersPerSecond * delta,
          aspect,
          queuePosition,
          centerToSlotMeters,
        );
        queueOffsetMeters += vehicle.lengthMeters + URBAN_CITY_CONFIG.trafficSignal.queueGapMeters;
      });
    }

    for (const pedestrian of this.#pedestrians) {
      const route = this.#sidewalkRoutes[pedestrian.routeIndex]!;
      pedestrian.distance = wrapDistance(
        pedestrian.distance + pedestrian.speedMetersPerSecond * delta,
        route.length,
      );
      pedestrian.phase += delta * pedestrian.speedMetersPerSecond * 2.2;
    }
    this.#writeTrafficMatrices();
    this.#writePedestrianMatrices();
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      urbanTrafficVehicles: this.#vehicles.length,
      urbanTrafficPassengerCars: this.#trafficClassCounts.get('passenger-car') ?? 0,
      urbanTrafficCityBuses: this.#trafficClassCounts.get('city-bus') ?? 0,
      urbanTrafficRigidTrucks: this.#trafficClassCounts.get('rigid-truck') ?? 0,
      urbanTrafficSemiTrailerRigs: this.#trafficClassCounts.get('semi-trailer-rig') ?? 0,
      urbanTrafficFarmTractors: this.#trafficClassCounts.get('farm-tractor') ?? 0,
      urbanTrafficBatches: this.#trafficMeshes.size,
      urbanPedestrians: this.#pedestrians.length,
      urbanActivityBatches: this.#meshes.length,
    };
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
    this.root.removeFromParent();
  }

  #createVehicles(count: number): TrafficVehicle[][] {
    const counts = spreadCount(count, this.#trafficRoutes.length);
    const groups: TrafficVehicle[][] = [];
    let index = 0;
    this.#trafficRoutes.forEach((route, routeIndex) => {
      const vehicles: TrafficVehicle[] = [];
      for (let localIndex = 0; localIndex < counts[routeIndex]!; localIndex += 1) {
        const type = TRAFFIC_VEHICLE_CLASSES[index % TRAFFIC_VEHICLE_CLASSES.length]!;
        const spec = getTrafficVehicleSpec(type);
        const instanceIndex = this.#trafficClassCounts.get(type) ?? 0;
        this.#trafficClassCounts.set(type, instanceIndex + 1);
        vehicles.push({
          index,
          routeIndex,
          type,
          instanceIndex,
          lengthMeters: spec.lengthMeters,
          distance: ((localIndex + 0.5) / counts[routeIndex]!) * route.length,
          speedMetersPerSecond:
            spec.minimumSpeedMetersPerSecond +
            deterministicUnit(index, routeIndex + 11) *
              (spec.maximumSpeedMetersPerSecond - spec.minimumSpeedMetersPerSecond),
        });
        index += 1;
      }
      groups.push(vehicles);
    });
    return groups;
  }

  #createPedestrians(count: number): Pedestrian[] {
    const counts = spreadCount(count, this.#sidewalkRoutes.length);
    const pedestrians: Pedestrian[] = [];
    let index = 0;
    this.#sidewalkRoutes.forEach((route, routeIndex) => {
      for (let localIndex = 0; localIndex < counts[routeIndex]!; localIndex += 1) {
        pedestrians.push({
          index,
          routeIndex,
          distance: ((localIndex + 0.5) / counts[routeIndex]!) * route.length,
          speedMetersPerSecond: 0.9 + deterministicUnit(index, routeIndex + 29) * 0.4,
          phase: deterministicUnit(index, routeIndex + 43) * Math.PI * 2,
        });
        index += 1;
      }
    });
    return pedestrians;
  }

  #createMesh(
    geometry: BufferGeometry,
    material: Material | Material[],
    count: number,
    name: string,
  ): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.count = count;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.root.add(mesh);
    this.#meshes.push(mesh);
    return mesh;
  }

  #writeTrafficMatrices(): void {
    for (const vehicle of this.#vehicles) {
      const route = this.#trafficRoutes[vehicle.routeIndex]!;
      sampleRoute(route, vehicle.distance, this.#pose);
      this.#transform.position.set(this.#pose.x, ROAD_Y, this.#pose.z);
      this.#transform.rotation.set(0, this.#pose.yaw, 0);
      this.#transform.scale.set(1, 1, 1);
      this.#transform.updateMatrix();
      this.#trafficMeshes.get(vehicle.type)?.setMatrixAt(vehicle.instanceIndex, this.#transform.matrix);
    }
    for (const mesh of this.#trafficMeshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  #writePedestrianMatrices(): void {
    for (const pedestrian of this.#pedestrians) {
      const route = this.#sidewalkRoutes[pedestrian.routeIndex]!;
      sampleRoute(route, pedestrian.distance, this.#pose);
      const bob = Math.abs(Math.sin(pedestrian.phase)) * 0.025;
      this.#transform.position.set(this.#pose.x, ROAD_Y + SIDEWALK_LIFT + bob, this.#pose.z);
      this.#transform.rotation.set(0, this.#pose.yaw, 0);
      this.#transform.scale.set(1, 1, 1);
      this.#transform.updateMatrix();
      this.#pedestrianBodyMesh.setMatrixAt(pedestrian.index, this.#transform.matrix);

      this.#transform.position.y += 1.08;
      this.#transform.updateMatrix();
      this.#pedestrianHeadMesh.setMatrixAt(pedestrian.index, this.#transform.matrix);
    }
    this.#pedestrianBodyMesh.instanceMatrix.needsUpdate = true;
    this.#pedestrianHeadMesh.instanceMatrix.needsUpdate = true;
  }
}
