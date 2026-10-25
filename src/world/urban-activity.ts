import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Object3D,
  type Material,
  type BufferGeometry,
} from 'three';
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  type UniformNode,
} from 'three/webgpu';
import { float, vec3, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  trafficVehicleCountFor,
  URBAN_ACTIVITY_TIER_BUDGET,
  URBAN_CITY_CONFIG,
  URBAN_STREET_LIFE_TIER_BUDGET,
  type TrafficSignalAspect,
} from '../config/urban-city';
import type { TrafficIntensity } from '../config/game-preferences';
import { AOHARA_DISTRICT_CONFIG } from '../config/urban-district';
import type { TierId } from '../config/tiers';
import { clamp } from '../shared/math';
import { yawFromQuat } from '../shared/vector';
import type { PhysicsCollisionEvent, PhysicsWorld } from '../physics/PhysicsWorld';
import type { RapierRigidBody } from '../physics/RapierModule';
import { TRAFFIC_VEHICLE_CLASSES, type TrafficVehicleClass } from '../config/traffic-vehicles';
import { createTrafficVehicleModel, getTrafficVehicleSpec } from './traffic-vehicle-models';
import {
  advanceVehicleImpact,
  createVehicleImpactState,
  triggerVehicleImpact,
  type VehicleImpactState,
} from '../vehicles/VehicleImpact';

const ROAD_Y = -0.46;
const SIDEWALK_LIFT = 0.035;
const LANE_OFFSET_METERS = 3.4;
const MAX_UPDATE_DELTA_SECONDS = 0.1;
const MAX_TRAFFIC_ROUTE_REJOIN_DISTANCE_METERS = 8;

const PEDESTRIAN_COLORS = [0x455d76, 0x805749, 0x536348, 0x414248, 0x897753, 0x715d76] as const;
const SKIN_COLORS = [0xc58e6c, 0xe0b890, 0x9d7259] as const;

type Point2 = readonly [number, number];

export interface TrafficRouteProjectionSegment {
  readonly startX: number;
  readonly startZ: number;
  readonly dx: number;
  readonly dz: number;
  readonly startDistance: number;
  readonly length: number;
}

interface RouteSegment extends TrafficRouteProjectionSegment {
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
  readonly heightMeters: number;
  readonly speedMetersPerSecond: number;
  distance: number;
  proposedTravelMeters: number;
  collisionHoldSeconds: number;
  recoveryPending: boolean;
  readonly impact: VehicleImpactState;
  body: RapierRigidBody | null;
  unregisterOriginAware: (() => void) | null;
}

interface Pedestrian {
  readonly index: number;
  readonly routeIndex: number;
  readonly speedMetersPerSecond: number;
  phase: number;
  distance: number;
}

/** Phase 8.2: cyclist route follower on the sidewalk loops (no right-of-way, like pedestrians). */
interface Cyclist {
  readonly index: number;
  readonly routeIndex: number;
  readonly speedMetersPerSecond: number;
  phase: number;
  distance: number;
}

/** Phase 8.2: static cart vendor with a warm lantern; only the sway phase advances. */
interface CartVendor {
  readonly index: number;
  readonly routeIndex: number;
  readonly distance: number;
  swayPhase: number;
}

/**
 * Phase 8.2: fast weaving motorbike maniac on a traffic loop. Route progress uses the same
 * signal-aware advance as traffic; lateral weave is a bounded visual offset, and a Rapier body
 * (when physics is present) retains collision authority against the player and traffic.
 */
interface Motorbike {
  readonly index: number;
  readonly routeIndex: number;
  readonly speedMetersPerSecond: number;
  readonly lengthMeters: number;
  readonly weavePhase: number;
  readonly weaveFrequency: number;
  distance: number;
  proposedTravelMeters: number;
  collisionHoldSeconds: number;
  recoveryPending: boolean;
  /** Smoothed 0..1 gate so a stopped maniac eases back to the lane centre instead of weaving. */
  weaveGain: number;
  readonly impact: VehicleImpactState;
  body: RapierRigidBody | null;
  unregisterOriginAware: (() => void) | null;
}

interface TrafficQueueEntry {
  readonly vehicleIndex: number;
  distanceToSignal: number;
}

function wrapDistance(distance: number, routeLength: number): number {
  return ((distance % routeLength) + routeLength) % routeLength;
}

export interface TrafficRouteProjection {
  readonly distanceMeters: number;
  readonly distanceSquared: number;
}

/** Projects a world position onto its closest segment in route-distance coordinates. */
export function projectTrafficRoutePosition(
  segments: readonly TrafficRouteProjectionSegment[],
  x: number,
  z: number,
): TrafficRouteProjection | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || segments.length === 0) {
    return null;
  }

  let closestDistanceMeters = 0;
  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    if (
      !Number.isFinite(segment.startX) ||
      !Number.isFinite(segment.startZ) ||
      !Number.isFinite(segment.dx) ||
      !Number.isFinite(segment.dz) ||
      !Number.isFinite(segment.startDistance) ||
      !Number.isFinite(segment.length) ||
      segment.length <= 0
    ) {
      continue;
    }
    const segmentLengthSquared = segment.dx * segment.dx + segment.dz * segment.dz;
    if (!Number.isFinite(segmentLengthSquared) || segmentLengthSquared <= 1e-8) {
      continue;
    }
    const fraction = clamp(
      ((x - segment.startX) * segment.dx + (z - segment.startZ) * segment.dz) /
        segmentLengthSquared,
      0,
      1,
    );
    const projectedX = segment.startX + segment.dx * fraction;
    const projectedZ = segment.startZ + segment.dz * fraction;
    const distanceSquared = (x - projectedX) ** 2 + (z - projectedZ) ** 2;
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closestDistanceMeters = segment.startDistance + fraction * segment.length;
    }
  }

  return Number.isFinite(closestDistanceSquared)
    ? { distanceMeters: closestDistanceMeters, distanceSquared: closestDistanceSquared }
    : null;
}

export interface TrafficRouteFollower {
  readonly index: number;
  readonly lengthMeters: number;
  distance: number;
  proposedTravelMeters: number;
}

function compareTrafficDistance(first: TrafficRouteFollower, second: TrafficRouteFollower): number {
  return first.distance - second.distance || first.index - second.index;
}

function wrapAngle(angle: number): number {
  return ((((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
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
  // Both cross the signalized central arterial and use its avenue phase.
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

/** Phase 8.2: upright city bike; local -Z is the riding direction, ground at y = 0. */
function createCyclistBikeGeometry(): BufferGeometry {
  const wheel = (z: number): BufferGeometry => {
    const geometry = new CylinderGeometry(0.32, 0.32, 0.07, 10);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(0, 0.32, z);
    return geometry;
  };
  const parts: BufferGeometry[] = [
    wheel(-0.78),
    wheel(0.78),
    new BoxGeometry(0.08, 0.08, 1.1).translate(0, 0.55, -0.1),
    new BoxGeometry(0.08, 0.35, 0.1).translate(0, 0.35, -0.62),
    new BoxGeometry(0.08, 0.08, 0.8).translate(0, 0.3, 0.45),
    new BoxGeometry(0.06, 0.25, 0.06).translate(0, 0.62, 0.62),
    new BoxGeometry(0.22, 0.06, 0.3).translate(0, 0.75, 0.62),
    new BoxGeometry(0.05, 0.25, 0.05).translate(0, 0.72, -0.72),
    new BoxGeometry(0.4, 0.05, 0.06).translate(0, 0.86, -0.72),
  ];
  return mergeActivityParts(parts, 'aohara-cyclist-bike');
}

/** Phase 8.2: sporty motorbike; local -Z is the riding direction, ground at y = 0. */
function createMotorbikeGeometry(): BufferGeometry {
  const wheel = (z: number): BufferGeometry => {
    const geometry = new CylinderGeometry(0.3, 0.3, 0.1, 10);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(0, 0.3, z);
    return geometry;
  };
  const parts: BufferGeometry[] = [
    wheel(-0.66),
    wheel(0.66),
    new BoxGeometry(0.08, 0.5, 0.1).translate(0, 0.42, -0.62),
    new BoxGeometry(0.34, 0.3, 0.35).translate(0, 0.38, 0.05),
    new BoxGeometry(0.3, 0.25, 0.5).translate(0, 0.62, -0.25),
    new BoxGeometry(0.26, 0.12, 0.6).translate(0, 0.56, 0.35),
    new BoxGeometry(0.2, 0.14, 0.35).translate(0, 0.68, 0.68),
    new BoxGeometry(0.36, 0.3, 0.25).translate(0, 0.6, -0.62),
    new BoxGeometry(0.5, 0.05, 0.08).translate(0, 0.85, -0.68),
  ];
  return mergeActivityParts(parts, 'aohara-motorbike-frame');
}

/** Phase 8.2: hand-pushed street vendor cart with handlebar; ground at y = 0. */
function createCartGeometry(): BufferGeometry {
  const wheel = (x: number, z: number): BufferGeometry => {
    const geometry = new CylinderGeometry(0.14, 0.14, 0.05, 8);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(x, 0.14, z);
    return geometry;
  };
  const parts: BufferGeometry[] = [
    new BoxGeometry(1.1, 0.08, 0.7).translate(0, 0.45, 0.1),
    new BoxGeometry(1.0, 0.06, 0.6).translate(0, 0.25, 0.1),
    new BoxGeometry(0.05, 0.45, 0.05).translate(-0.48, 0.24, 0.4),
    new BoxGeometry(0.05, 0.45, 0.05).translate(0.48, 0.24, 0.4),
    new BoxGeometry(0.05, 0.45, 0.05).translate(-0.48, 0.24, -0.2),
    new BoxGeometry(0.05, 0.45, 0.05).translate(0.48, 0.24, -0.2),
    wheel(-0.48, 0.4),
    wheel(0.48, 0.4),
    wheel(-0.48, -0.2),
    wheel(0.48, -0.2),
    new BoxGeometry(0.04, 0.75, 0.04).translate(-0.4, 0.85, -0.45),
    new BoxGeometry(0.04, 0.75, 0.04).translate(0.4, 0.85, -0.45),
    new BoxGeometry(0.84, 0.05, 0.05).translate(0, 1.2, -0.45),
    new BoxGeometry(0.4, 0.25, 0.35).translate(-0.25, 0.65, 0.15),
    new BoxGeometry(0.35, 0.2, 0.3).translate(0.28, 0.63, 0.05),
  ];
  return mergeActivityParts(parts, 'aohara-cart-vendor-cart');
}

function mergeActivityParts(parts: BufferGeometry[], name: string): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (merged === null) {
    throw new Error(`Aohara street-life geometry could not be merged: ${name}`);
  }
  merged.name = name;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
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

/** Caps route progress to preserve a mixed-size pair's center-to-center following gap. */
export function constrainTrafficFollowingTravel(
  routeLengthMeters: number,
  followerDistance: number,
  followerTravelMeters: number,
  followerLengthMeters: number,
  leaderDistance: number,
  leaderTravelMeters: number,
  leaderLengthMeters: number,
  bumperGapMeters: number,
): number {
  if (
    !Number.isFinite(routeLengthMeters) ||
    routeLengthMeters <= 0 ||
    !Number.isFinite(followerDistance) ||
    !Number.isFinite(leaderDistance) ||
    !Number.isFinite(followerLengthMeters) ||
    followerLengthMeters < 0 ||
    !Number.isFinite(leaderLengthMeters) ||
    leaderLengthMeters < 0
  ) {
    return 0;
  }

  const requestedTravel = Number.isFinite(followerTravelMeters)
    ? Math.max(0, followerTravelMeters)
    : 0;
  const leaderTravel = Number.isFinite(leaderTravelMeters) ? Math.max(0, leaderTravelMeters) : 0;
  const bumperGap = Number.isFinite(bumperGapMeters) ? Math.max(0, bumperGapMeters) : 0;
  const currentGap = wrapDistance(leaderDistance - followerDistance, routeLengthMeters);
  const requiredCenterGap = (followerLengthMeters + leaderLengthMeters) / 2 + bumperGap;
  const availableTravel = Math.max(0, currentGap + leaderTravel - requiredCenterGap);
  return Math.min(requestedTravel, availableTravel);
}

/** Applies one bounded, in-place spacing pass to a cyclic traffic route. */
export function constrainTrafficRouteSpacing(
  vehicles: TrafficRouteFollower[],
  routeLengthMeters: number,
  bumperGapMeters: number,
): void {
  if (vehicles.length < 2 || !Number.isFinite(routeLengthMeters) || routeLengthMeters <= 0) {
    return;
  }

  vehicles.sort(compareTrafficDistance);
  let largestGapIndex = 0;
  let largestGap = -1;
  for (let index = 0; index < vehicles.length; index += 1) {
    const current = vehicles[index]!;
    const next = vehicles[(index + 1) % vehicles.length]!;
    const gap = wrapDistance(next.distance - current.distance, routeLengthMeters);
    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = index;
    }
  }

  // Cut the loop at its largest gap, then walk backward so each follower sees its already-resolved
  // leader. At most one constraint evaluation is needed per vehicle.
  for (let step = 1; step < vehicles.length; step += 1) {
    const followerIndex = (largestGapIndex - step + vehicles.length) % vehicles.length;
    const leaderIndex = (followerIndex + 1) % vehicles.length;
    const follower = vehicles[followerIndex]!;
    const leader = vehicles[leaderIndex]!;
    follower.proposedTravelMeters = constrainTrafficFollowingTravel(
      routeLengthMeters,
      follower.distance,
      follower.proposedTravelMeters,
      follower.lengthMeters,
      leader.distance,
      leader.proposedTravelMeters,
      leader.lengthMeters,
      bumperGapMeters,
    );
  }
}

export interface UrbanStreetActivityOptions {
  readonly physics?: PhysicsWorld;
  /** Runtime traffic budget; pedestrians remain at the selected tier's fixed budget. */
  readonly trafficIntensity?: TrafficIntensity;
  /** World-space position of the activity's parent city root. */
  readonly origin?: readonly [number, number, number];
  /**
   * Phase 8.2: the city's day/night gain drives the warm vendor lanterns so they read at night
   * and stay faint by day. Omitted in the standalone look-dev composition.
   */
  readonly nightGain?: UniformNode<'float', number>;
}

/**
 * Bounded Aohara activity: instanced route visuals backed by lightweight dynamic Rapier vehicles when
 * the driving composition supplies physics. The shared solver owns vehicle-to-vehicle and player-to-traffic
 * response; nearby impacted bodies rebase route progress after a bounded hold, then steer back without a teleport.
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
  readonly #physics: PhysicsWorld | null;
  readonly #worldOrigin: readonly [number, number, number];
  readonly #physicsUnsubscribers: (() => void)[] = [];
  readonly #vehicleByCollider = new Map<number, TrafficVehicle>();
  #trafficImpactCount = 0;
  #trafficRouteRejoinCount = 0;
  #signalAspect: TrafficSignalAspect = 'red';
  readonly #pedestrians: Pedestrian[];
  readonly #pedestrianBodyMesh: InstancedMesh;
  readonly #pedestrianHeadMesh: InstancedMesh;
  // Phase 8.2 street-life actors: sidewalk cyclists, static cart vendors, and road maniacs.
  readonly #cyclists: Cyclist[];
  readonly #cartVendors: CartVendor[];
  readonly #motorbikes: Motorbike[];
  readonly #cyclistBikeMesh: InstancedMesh | null;
  readonly #cyclistRiderBodyMesh: InstancedMesh | null;
  readonly #cyclistRiderHeadMesh: InstancedMesh | null;
  readonly #cartMesh: InstancedMesh | null;
  readonly #cartLanternMesh: InstancedMesh | null;
  readonly #cartVendorBodyMesh: InstancedMesh | null;
  readonly #cartVendorHeadMesh: InstancedMesh | null;
  readonly #motorbikeMesh: InstancedMesh | null;
  readonly #motorbikeRiderBodyMesh: InstancedMesh | null;
  readonly #motorbikeRiderHeadMesh: InstancedMesh | null;
  readonly #motorbikeByCollider = new Map<number, Motorbike>();
  #weaveTime = 0;
  readonly #meshes: InstancedMesh[] = [];
  readonly #materials: Material[] = [];
  readonly #pose: RoutePose = { x: 0, z: 0, yaw: 0 };
  readonly #transform = new Object3D();
  #disposed = false;

  constructor(tier: TierId, options: UrbanStreetActivityOptions = {}) {
    const budget = URBAN_ACTIVITY_TIER_BUDGET[tier];
    this.#physics = options.physics ?? null;
    this.#worldOrigin = options.origin ?? [0, 0, 0];
    this.root.name = 'aohara-urban-street-activity';
    this.#vehiclesByRoute = this.#createVehicles(
      trafficVehicleCountFor(tier, options.trafficIntensity ?? 'standard'),
    );
    this.#vehicles = this.#vehiclesByRoute.flat();
    this.#trafficQueueScratch = this.#vehiclesByRoute.map((vehicles) =>
      vehicles.map((vehicle) => ({ vehicleIndex: vehicle.index, distanceToSignal: 0 })),
    );
    this.#pedestrians = this.#createPedestrians(budget.pedestrians);
    const streetLife = URBAN_STREET_LIFE_TIER_BUDGET[tier];
    this.#cyclists = this.#createCyclists(streetLife.cyclists);
    this.#cartVendors = this.#createCartVendors(streetLife.cartVendors);
    this.#motorbikes = this.#createMotorbikes(streetLife.motorbikes);
    this.#createTrafficBodies();
    this.#createMotorbikeBodies();
    if (this.#physics !== null) {
      this.#physicsUnsubscribers.push(
        this.#physics.addPreStepHandler(this.#driveTrafficBodies),
        this.#physics.addCollisionHandler(this.#onCollision),
      );
    }

    const vehicleTrimMaterial = createActivityMaterial(
      'aohara-traffic-vehicle-glass-and-tyres',
      0.9,
    );
    vehicleTrimMaterial.color.setHex(0x242b31);
    const vehicleAccentMaterial = createActivityMaterial(
      'aohara-traffic-vehicle-metal-accents',
      0.36,
    );
    vehicleAccentMaterial.color.setHex(0xaab5bd);
    vehicleAccentMaterial.metalness = 0.62;
    const pedestrianBodyMaterial = createActivityMaterial(
      'aohara-sidewalk-pedestrian-clothing',
      0.91,
    );
    const pedestrianHeadMaterial = createActivityMaterial('aohara-sidewalk-pedestrian-skin', 0.9);
    this.#materials.push(
      vehicleTrimMaterial,
      vehicleAccentMaterial,
      pedestrianBodyMaterial,
      pedestrianHeadMaterial,
    );

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
    const pedestrianBodyGeometry = createPedestrianBodyGeometry();
    const headGeometry = new BoxGeometry(0.22, 0.22, 0.22);
    this.#pedestrianBodyMesh = this.#createMesh(
      pedestrianBodyGeometry,
      pedestrianBodyMaterial,
      budget.pedestrians,
      'aohara-sidewalk-pedestrian-bodies',
    );
    this.#pedestrianHeadMesh = this.#createMesh(
      headGeometry,
      pedestrianHeadMaterial,
      budget.pedestrians,
      'aohara-sidewalk-pedestrian-heads',
    );

    const cyclistCount = this.#cyclists.length;
    if (cyclistCount > 0) {
      const bikeMaterial = createActivityMaterial('aohara-cyclist-bike-steel', 0.5);
      bikeMaterial.color.setHex(0x2f3a42);
      bikeMaterial.metalness = 0.55;
      this.#materials.push(bikeMaterial);
      this.#cyclistBikeMesh = this.#createMesh(
        createCyclistBikeGeometry(),
        bikeMaterial,
        cyclistCount,
        'aohara-cyclist-bikes',
      );
      this.#cyclistRiderBodyMesh = this.#createMesh(
        pedestrianBodyGeometry,
        pedestrianBodyMaterial,
        cyclistCount,
        'aohara-cyclist-rider-bodies',
      );
      this.#cyclistRiderHeadMesh = this.#createMesh(
        headGeometry,
        pedestrianHeadMaterial,
        cyclistCount,
        'aohara-cyclist-rider-heads',
      );
    } else {
      this.#cyclistBikeMesh = null;
      this.#cyclistRiderBodyMesh = null;
      this.#cyclistRiderHeadMesh = null;
    }

    const vendorCount = this.#cartVendors.length;
    if (vendorCount > 0) {
      const cartMaterial = createActivityMaterial('aohara-cart-vendor-wood', 0.85);
      cartMaterial.color.setHex(0x6b5638);
      this.#materials.push(cartMaterial);
      this.#cartMesh = this.#createMesh(
        createCartGeometry(),
        cartMaterial,
        vendorCount,
        'aohara-cart-vendor-carts',
      );
      const lanternMaterial = new MeshBasicNodeMaterial();
      lanternMaterial.name = 'aohara-cart-vendor-lantern-glow';
      lanternMaterial.toneMapped = false;
      const nightGain = options.nightGain ?? float(0.35);
      lanternMaterial.colorNode = vec4(vec3(1.0, 0.55, 0.22).mul(nightGain), 1);
      this.#materials.push(lanternMaterial);
      this.#cartLanternMesh = this.#createMesh(
        new BoxGeometry(0.16, 0.24, 0.16),
        lanternMaterial,
        vendorCount,
        'aohara-cart-vendor-lanterns',
      );
      this.#cartVendorBodyMesh = this.#createMesh(
        pedestrianBodyGeometry,
        pedestrianBodyMaterial,
        vendorCount,
        'aohara-cart-vendor-bodies',
      );
      this.#cartVendorHeadMesh = this.#createMesh(
        headGeometry,
        pedestrianHeadMaterial,
        vendorCount,
        'aohara-cart-vendor-heads',
      );
    } else {
      this.#cartMesh = null;
      this.#cartLanternMesh = null;
      this.#cartVendorBodyMesh = null;
      this.#cartVendorHeadMesh = null;
    }

    const motorbikeCount = this.#motorbikes.length;
    if (motorbikeCount > 0) {
      const motorbikeMaterial = createActivityMaterial('aohara-motorbike-paint', 0.42);
      motorbikeMaterial.color.setHex(0x7e2a2a);
      motorbikeMaterial.metalness = 0.4;
      this.#materials.push(motorbikeMaterial);
      this.#motorbikeMesh = this.#createMesh(
        createMotorbikeGeometry(),
        motorbikeMaterial,
        motorbikeCount,
        'aohara-motorbike-frames',
      );
      this.#motorbikeRiderBodyMesh = this.#createMesh(
        pedestrianBodyGeometry,
        pedestrianBodyMaterial,
        motorbikeCount,
        'aohara-motorbike-rider-bodies',
      );
      this.#motorbikeRiderHeadMesh = this.#createMesh(
        headGeometry,
        pedestrianHeadMaterial,
        motorbikeCount,
        'aohara-motorbike-rider-heads',
      );
    } else {
      this.#motorbikeMesh = null;
      this.#motorbikeRiderBodyMesh = null;
      this.#motorbikeRiderHeadMesh = null;
    }

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
    const colorStreetLifeActor = (
      bodyMesh: InstancedMesh,
      headMesh: InstancedMesh,
      index: number,
    ): void => {
      bodyMesh.setColorAt(index, new Color(PEDESTRIAN_COLORS[index % PEDESTRIAN_COLORS.length]!));
      headMesh.setColorAt(index, new Color(SKIN_COLORS[index % SKIN_COLORS.length]!));
    };
    for (const cyclist of this.#cyclists) {
      if (this.#cyclistRiderBodyMesh !== null && this.#cyclistRiderHeadMesh !== null) {
        colorStreetLifeActor(this.#cyclistRiderBodyMesh, this.#cyclistRiderHeadMesh, cyclist.index);
      }
    }
    for (const vendor of this.#cartVendors) {
      if (this.#cartVendorBodyMesh !== null && this.#cartVendorHeadMesh !== null) {
        colorStreetLifeActor(this.#cartVendorBodyMesh, this.#cartVendorHeadMesh, vendor.index);
      }
    }
    for (const motorbike of this.#motorbikes) {
      if (this.#motorbikeRiderBodyMesh !== null && this.#motorbikeRiderHeadMesh !== null) {
        colorStreetLifeActor(
          this.#motorbikeRiderBodyMesh,
          this.#motorbikeRiderHeadMesh,
          motorbike.index,
        );
      }
    }
    for (const mesh of [
      this.#pedestrianBodyMesh,
      this.#pedestrianHeadMesh,
      this.#cyclistRiderBodyMesh,
      this.#cyclistRiderHeadMesh,
      this.#cartVendorBodyMesh,
      this.#cartVendorHeadMesh,
      this.#motorbikeRiderBodyMesh,
      this.#motorbikeRiderHeadMesh,
    ]) {
      if (mesh === null) {
        continue;
      }
      if (mesh.instanceColor !== null) {
        mesh.instanceColor.needsUpdate = true;
      }
    }

    this.#writeTrafficMatrices();
    this.#writePedestrianMatrices();
    this.#writeStreetLifeMatrices();
  }

  update(deltaSeconds: number, aspect: TrafficSignalAspect): void {
    if (this.#disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }
    this.#signalAspect = aspect;
    const delta = Math.min(MAX_UPDATE_DELTA_SECONDS, deltaSeconds);
    // Physics-backed traffic advances on fixed simulation steps; visual-only look-dev activity
    // retains the original frame-time route motion. Pedestrian phase is always render-time.
    if (this.#physics === null) {
      this.#advanceTraffic(delta, aspect);
      this.#advanceMotorbikes(delta, aspect);
    }
    this.#weaveTime += delta;
    for (const pedestrian of this.#pedestrians) {
      const route = this.#sidewalkRoutes[pedestrian.routeIndex]!;
      pedestrian.distance = wrapDistance(
        pedestrian.distance + pedestrian.speedMetersPerSecond * delta,
        route.length,
      );
      pedestrian.phase += delta * pedestrian.speedMetersPerSecond * 2.2;
    }
    for (const cyclist of this.#cyclists) {
      const route = this.#sidewalkRoutes[cyclist.routeIndex]!;
      cyclist.distance = wrapDistance(
        cyclist.distance + cyclist.speedMetersPerSecond * delta,
        route.length,
      );
      cyclist.phase += delta * cyclist.speedMetersPerSecond * 1.8;
    }
    for (const vendor of this.#cartVendors) {
      vendor.swayPhase += delta * 0.7;
    }
    this.#writeTrafficMatrices(delta);
    this.#writePedestrianMatrices();
    this.#writeStreetLifeMatrices(delta);
  }

  /**
   * Read-only maniac stop-line margins (metres ahead of the stop line) for diagnostics and
   * tests. A settled maniac parks in its own queue slot, so the margin equals its half-length.
   */
  getMotorbikeStopLineMargins(): readonly number[] {
    return this.#motorbikes.map((bike) => {
      const route = this.#trafficRoutes[bike.routeIndex]!;
      return wrapDistance(route.stopDistance - bike.distance, route.length);
    });
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
      urbanTrafficPhysicsBodies: this.#vehicles.filter((vehicle) => vehicle.body !== null).length,
      urbanTrafficImpactFeedbacks: this.#trafficImpactCount,
      urbanTrafficRouteRejoins: this.#trafficRouteRejoinCount,
      urbanPedestrians: this.#pedestrians.length,
      urbanCyclists: this.#cyclists.length,
      urbanCartVendors: this.#cartVendors.length,
      urbanMotorbikes: this.#motorbikes.length,
      urbanMotorbikePhysicsBodies: this.#motorbikes.filter((bike) => bike.body !== null).length,
      urbanActivityBatches: this.#meshes.length,
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const unsubscribe of this.#physicsUnsubscribers) {
      unsubscribe();
    }
    this.#physicsUnsubscribers.length = 0;
    for (const vehicle of this.#vehicles) {
      if (vehicle.body !== null) {
        vehicle.unregisterOriginAware?.();
        this.#physics?.removeBody(vehicle.body);
        vehicle.body = null;
      }
    }
    for (const bike of this.#motorbikes) {
      if (bike.body !== null) {
        bike.unregisterOriginAware?.();
        this.#physics?.removeBody(bike.body);
        bike.body = null;
      }
    }
    this.#vehicleByCollider.clear();
    this.#motorbikeByCollider.clear();
    for (const mesh of this.#meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    for (const material of this.#materials) {
      material.dispose();
    }
    this.root.removeFromParent();
  }

  #advanceTraffic(deltaSeconds: number, aspect: TrafficSignalAspect): void {
    const delta = Math.min(MAX_UPDATE_DELTA_SECONDS, deltaSeconds);
    if (delta <= 0) {
      return;
    }
    for (let routeIndex = 0; routeIndex < this.#vehiclesByRoute.length; routeIndex += 1) {
      const route = this.#trafficRoutes[routeIndex]!;
      const routeVehicles = this.#vehiclesByRoute[routeIndex]!;
      const queue = this.#trafficQueueScratch[routeIndex]!;
      for (const vehicle of routeVehicles) {
        if (vehicle.recoveryPending && vehicle.collisionHoldSeconds <= 0) {
          this.#rejoinTrafficVehicle(vehicle, route);
        }
      }
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
        const pausedByImpact = vehicle.collisionHoldSeconds > 0;
        vehicle.collisionHoldSeconds = Math.max(0, vehicle.collisionHoldSeconds - delta);
        const nextDistance = advanceTrafficWithSignal(
          vehicle.distance,
          route.length,
          route.stopDistance,
          pausedByImpact ? 0 : vehicle.speedMetersPerSecond * delta,
          aspect,
          queuePosition,
          centerToSlotMeters,
        );
        vehicle.proposedTravelMeters = wrapDistance(nextDistance - vehicle.distance, route.length);
        queueOffsetMeters += vehicle.lengthMeters + URBAN_CITY_CONFIG.trafficSignal.queueGapMeters;
      });

      constrainTrafficRouteSpacing(
        routeVehicles,
        route.length,
        URBAN_CITY_CONFIG.trafficSignal.queueGapMeters,
      );

      for (const vehicle of routeVehicles) {
        vehicle.distance = wrapDistance(
          vehicle.distance + vehicle.proposedTravelMeters,
          route.length,
        );
      }
    }
  }

  #rejoinTrafficVehicle(vehicle: TrafficVehicle, route: UrbanRoute): void {
    vehicle.recoveryPending = false;
    const body = vehicle.body;
    const physics = this.#physics;
    if (body === null || physics === null) {
      return;
    }

    const position = body.translation();
    const originOffset = physics.originOffset;
    const localX = position.x + originOffset.x - this.#worldOrigin[0];
    const localZ = position.z + originOffset.z - this.#worldOrigin[2];
    const projection = projectTrafficRoutePosition(route.segments, localX, localZ);
    if (
      projection === null ||
      projection.distanceSquared > MAX_TRAFFIC_ROUTE_REJOIN_DISTANCE_METERS ** 2
    ) {
      return;
    }

    // Rebase only the route intent: Rapier retains the displaced body and collision authority.
    vehicle.distance = wrapDistance(projection.distanceMeters, route.length);
    this.#trafficRouteRejoinCount += 1;
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
          heightMeters: spec.heightMeters,
          distance: ((localIndex + 0.5) / counts[routeIndex]!) * route.length,
          speedMetersPerSecond:
            spec.minimumSpeedMetersPerSecond +
            deterministicUnit(index, routeIndex + 11) *
              (spec.maximumSpeedMetersPerSecond - spec.minimumSpeedMetersPerSecond),
          proposedTravelMeters: 0,
          collisionHoldSeconds: 0,
          recoveryPending: false,
          impact: createVehicleImpactState(),
          body: null,
          unregisterOriginAware: null,
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

  #createCyclists(count: number): Cyclist[] {
    const counts = spreadCount(count, this.#sidewalkRoutes.length);
    const cyclists: Cyclist[] = [];
    let index = 0;
    this.#sidewalkRoutes.forEach((route, routeIndex) => {
      for (let localIndex = 0; localIndex < counts[routeIndex]!; localIndex += 1) {
        cyclists.push({
          index,
          routeIndex,
          distance: ((localIndex + 0.5) / counts[routeIndex]!) * route.length,
          speedMetersPerSecond: 3.1 + deterministicUnit(index, routeIndex + 61) * 0.7,
          phase: deterministicUnit(index, routeIndex + 73) * Math.PI * 2,
        });
        index += 1;
      }
    });
    return cyclists;
  }

  /** Static vendors keep a deterministic inset so they sit mid-block, never on a crossing corner. */
  #createCartVendors(count: number): CartVendor[] {
    const vendors: CartVendor[] = [];
    for (let index = 0; index < count; index += 1) {
      const routeIndex = index % this.#sidewalkRoutes.length;
      const route = this.#sidewalkRoutes[routeIndex]!;
      const inset = 0.18 + deterministicUnit(index, 91) * 0.64;
      vendors.push({
        index,
        routeIndex,
        distance: inset * route.length,
        swayPhase: deterministicUnit(index, 103) * Math.PI * 2,
      });
    }
    return vendors;
  }

  #createMotorbikes(count: number): Motorbike[] {
    const counts = spreadCount(count, this.#trafficRoutes.length);
    const bikes: Motorbike[] = [];
    let index = 0;
    this.#trafficRoutes.forEach((route, routeIndex) => {
      for (let localIndex = 0; localIndex < counts[routeIndex]!; localIndex += 1) {
        bikes.push({
          index,
          routeIndex,
          speedMetersPerSecond: 11 + deterministicUnit(index, routeIndex + 131) * 3,
          lengthMeters: 2.1,
          weavePhase: deterministicUnit(index, routeIndex + 137) * Math.PI * 2,
          weaveFrequency: 0.5 + deterministicUnit(index, routeIndex + 139) * 0.5,
          distance: ((localIndex + 0.5) / counts[routeIndex]!) * route.length,
          proposedTravelMeters: 0,
          collisionHoldSeconds: 0,
          recoveryPending: false,
          weaveGain: 1,
          impact: createVehicleImpactState(),
          body: null,
          unregisterOriginAware: null,
        });
        index += 1;
      }
    });
    return bikes;
  }

  /**
   * Signal-aware route advance for maniacs. They ride their own queue slot (no traffic following
   * gap), weave laterally for the maniac read, and stop before the stop line on red/amber.
   */
  #advanceMotorbikes(deltaSeconds: number, aspect: TrafficSignalAspect): void {
    const delta = Math.min(MAX_UPDATE_DELTA_SECONDS, deltaSeconds);
    if (delta <= 0) {
      return;
    }
    for (const bike of this.#motorbikes) {
      const route = this.#trafficRoutes[bike.routeIndex]!;
      if (bike.recoveryPending && bike.collisionHoldSeconds <= 0) {
        this.#rejoinMotorbike(bike, route);
      }
      bike.collisionHoldSeconds = Math.max(0, bike.collisionHoldSeconds - delta);
      const nextDistance = advanceTrafficWithSignal(
        bike.distance,
        route.length,
        route.stopDistance,
        bike.collisionHoldSeconds > 0 ? 0 : bike.speedMetersPerSecond * delta,
        aspect,
        0,
        bike.lengthMeters / 2,
      );
      bike.proposedTravelMeters = wrapDistance(nextDistance - bike.distance, route.length);
      bike.distance = nextDistance;
      const moving = bike.collisionHoldSeconds <= 0 && bike.proposedTravelMeters > 1e-4;
      bike.weaveGain += ((moving ? 1 : 0) - bike.weaveGain) * Math.min(1, delta * 6);
    }
  }

  /** Samples the maniac's route pose plus its bounded lateral weave (1.5 m either side). */
  #sampleMotorbikePose(bike: Motorbike): void {
    const route = this.#trafficRoutes[bike.routeIndex]!;
    sampleRoute(route, bike.distance, this.#pose);
    const weave =
      Math.sin(this.#weaveTime * bike.weaveFrequency + bike.weavePhase) * 1.5 * bike.weaveGain;
    // Route forward is (-sin yaw, -cos yaw); its left normal is (cos yaw, -sin yaw).
    this.#pose.x += Math.cos(this.#pose.yaw) * weave;
    this.#pose.z += -Math.sin(this.#pose.yaw) * weave;
  }

  #rejoinMotorbike(bike: Motorbike, route: UrbanRoute): void {
    bike.recoveryPending = false;
    const body = bike.body;
    const physics = this.#physics;
    if (body === null || physics === null) {
      return;
    }
    const position = body.translation();
    const originOffset = physics.originOffset;
    const localX = position.x + originOffset.x - this.#worldOrigin[0];
    const localZ = position.z + originOffset.z - this.#worldOrigin[2];
    const projection = projectTrafficRoutePosition(route.segments, localX, localZ);
    if (
      projection === null ||
      projection.distanceSquared > MAX_TRAFFIC_ROUTE_REJOIN_DISTANCE_METERS ** 2
    ) {
      return;
    }
    bike.distance = wrapDistance(projection.distanceMeters, route.length);
  }

  #createMotorbikeBodies(): void {
    const physics = this.#physics;
    if (physics === null || this.#motorbikes.length === 0) {
      return;
    }
    const rapier = physics.rapier;
    const originOffset = physics.originOffset;
    for (const bike of this.#motorbikes) {
      const route = this.#trafficRoutes[bike.routeIndex]!;
      sampleRoute(route, bike.distance, this.#pose);
      const body = physics.createDynamicBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(
            this.#worldOrigin[0] + this.#pose.x - originOffset.x,
            this.#worldOrigin[1] + ROAD_Y + 0.55,
            this.#worldOrigin[2] + this.#pose.z - originOffset.z,
          )
          .setRotation({
            x: 0,
            y: Math.sin(this.#pose.yaw / 2),
            z: 0,
            w: Math.cos(this.#pose.yaw / 2),
          })
          .setGravityScale(0)
          .setLinearDamping(0.55)
          .setAngularDamping(1.6)
          .setUserData({
            kind: 'aohara-motorbike',
            index: bike.index,
          })
          .enabledTranslations(true, false, true)
          .enabledRotations(false, true, false),
      );
      const collider = physics.attachCollider(
        rapier.ColliderDesc.cuboid(0.28, 0.5, 1.05)
          .setDensity(178)
          .setFriction(0.5)
          .setRestitution(0.03)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      bike.body = body;
      bike.unregisterOriginAware = physics.registerOriginAwareBody(body);
      this.#motorbikeByCollider.set(collider.handle, bike);
    }
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

  #writeTrafficMatrices(deltaSeconds = 0): void {
    const originOffset = this.#physics?.originOffset ?? { x: 0, z: 0 };
    for (const vehicle of this.#vehicles) {
      let x: number;
      let y: number;
      let z: number;
      let yaw: number;
      if (vehicle.body !== null && this.#physics !== null) {
        const position = vehicle.body.translation();
        const rotation = vehicle.body.rotation();
        x = position.x + originOffset.x - this.#worldOrigin[0];
        y = position.y - this.#worldOrigin[1] - vehicle.heightMeters / 2;
        z = position.z + originOffset.z - this.#worldOrigin[2];
        yaw = yawFromQuat(rotation);
      } else {
        const route = this.#trafficRoutes[vehicle.routeIndex]!;
        sampleRoute(route, vehicle.distance, this.#pose);
        x = this.#pose.x;
        y = ROAD_Y;
        z = this.#pose.z;
        yaw = this.#pose.yaw;
      }
      const impact = advanceVehicleImpact(vehicle.impact, deltaSeconds);
      this.#transform.position.set(x, y + impact.bounceMeters, z);
      this.#transform.rotation.set(impact.pitchRadians, yaw, impact.rollRadians);
      this.#transform.scale.set(1, 1, 1);
      this.#transform.updateMatrix();
      this.#trafficMeshes
        .get(vehicle.type)
        ?.setMatrixAt(vehicle.instanceIndex, this.#transform.matrix);
    }
    for (const mesh of this.#trafficMeshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  #createTrafficBodies(): void {
    const physics = this.#physics;
    if (physics === null) {
      return;
    }
    const rapier = physics.rapier;
    const originOffset = physics.originOffset;
    for (const vehicle of this.#vehicles) {
      const route = this.#trafficRoutes[vehicle.routeIndex]!;
      sampleRoute(route, vehicle.distance, this.#pose);
      const spec = getTrafficVehicleSpec(vehicle.type);
      const body = physics.createDynamicBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(
            this.#worldOrigin[0] + this.#pose.x - originOffset.x,
            this.#worldOrigin[1] + ROAD_Y + spec.heightMeters / 2,
            this.#worldOrigin[2] + this.#pose.z - originOffset.z,
          )
          .setRotation({
            x: 0,
            y: Math.sin(this.#pose.yaw / 2),
            z: 0,
            w: Math.cos(this.#pose.yaw / 2),
          })
          .setGravityScale(0)
          .setLinearDamping(0.55)
          .setAngularDamping(1.6)
          .setUserData({
            kind: 'aohara-traffic',
            index: vehicle.index,
            instanceIndex: vehicle.instanceIndex,
            type: vehicle.type,
          })
          .enabledTranslations(true, false, true)
          .enabledRotations(false, true, false),
      );
      const collider = physics.attachCollider(
        rapier.ColliderDesc.cuboid(
          spec.widthMeters / 2,
          spec.heightMeters / 2,
          spec.lengthMeters / 2,
        )
          .setDensity(spec.massKg / (spec.widthMeters * spec.heightMeters * spec.lengthMeters))
          .setFriction(0.48)
          .setRestitution(0.04)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      vehicle.body = body;
      vehicle.unregisterOriginAware = physics.registerOriginAwareBody(body);
      this.#vehicleByCollider.set(collider.handle, vehicle);
    }
  }

  #driveTrafficBodies = (deltaSeconds: number): void => {
    const physics = this.#physics;
    if (this.#disposed || physics === null || deltaSeconds <= 0) {
      return;
    }
    this.#advanceTraffic(deltaSeconds, this.#signalAspect);
    this.#advanceMotorbikes(deltaSeconds, this.#signalAspect);
    const originOffset = physics.originOffset;
    const blend = clamp(deltaSeconds * 4, 0, 1);
    for (const bike of this.#motorbikes) {
      const body = bike.body;
      if (body === null) {
        continue;
      }
      this.#sampleMotorbikePose(bike);
      const position = body.translation();
      const velocity = body.linvel();
      const targetX = this.#worldOrigin[0] + this.#pose.x - originOffset.x;
      const targetZ = this.#worldOrigin[2] + this.#pose.z - originOffset.z;
      const speed = bike.collisionHoldSeconds > 0 ? 0 : bike.speedMetersPerSecond;
      const targetVelocityX = -Math.sin(this.#pose.yaw) * speed + (targetX - position.x) * 0.7;
      const targetVelocityZ = -Math.cos(this.#pose.yaw) * speed + (targetZ - position.z) * 0.7;
      const maximumSpeed = bike.speedMetersPerSecond + 3;
      const targetSpeed = Math.hypot(targetVelocityX, targetVelocityZ);
      if (targetSpeed > maximumSpeed) {
        const scale = maximumSpeed / targetSpeed;
        body.setLinvel(
          {
            x: velocity.x + (targetVelocityX * scale - velocity.x) * blend,
            y: 0,
            z: velocity.z + (targetVelocityZ * scale - velocity.z) * blend,
          },
          true,
        );
      } else {
        body.setLinvel(
          {
            x: velocity.x + (targetVelocityX - velocity.x) * blend,
            y: 0,
            z: velocity.z + (targetVelocityZ - velocity.z) * blend,
          },
          true,
        );
      }
      const rotation = body.rotation();
      const yaw = yawFromQuat(rotation);
      const yawError = wrapAngle(this.#pose.yaw - yaw);
      const angularVelocity = body.angvel();
      const targetYawRate = clamp(yawError * 2.6 - angularVelocity.y * 1.6, -1.8, 1.8);
      body.setAngvel(
        {
          x: 0,
          y: angularVelocity.y + (targetYawRate - angularVelocity.y) * blend,
          z: 0,
        },
        true,
      );
    }
    for (const vehicle of this.#vehicles) {
      const body = vehicle.body;
      if (body === null) {
        continue;
      }
      const route = this.#trafficRoutes[vehicle.routeIndex]!;
      sampleRoute(route, vehicle.distance, this.#pose);
      const position = body.translation();
      const velocity = body.linvel();
      const targetX = this.#worldOrigin[0] + this.#pose.x - originOffset.x;
      const targetZ = this.#worldOrigin[2] + this.#pose.z - originOffset.z;
      const speed = vehicle.collisionHoldSeconds > 0 ? 0 : vehicle.speedMetersPerSecond;
      let targetVelocityX = -Math.sin(this.#pose.yaw) * speed + (targetX - position.x) * 0.7;
      let targetVelocityZ = -Math.cos(this.#pose.yaw) * speed + (targetZ - position.z) * 0.7;
      const maximumSpeed = vehicle.speedMetersPerSecond + 3;
      const targetSpeed = Math.hypot(targetVelocityX, targetVelocityZ);
      if (targetSpeed > maximumSpeed) {
        const scale = maximumSpeed / targetSpeed;
        targetVelocityX *= scale;
        targetVelocityZ *= scale;
      }
      body.setLinvel(
        {
          x: velocity.x + (targetVelocityX - velocity.x) * blend,
          y: 0,
          z: velocity.z + (targetVelocityZ - velocity.z) * blend,
        },
        true,
      );
      const rotation = body.rotation();
      const yaw = yawFromQuat(rotation);
      const yawError = wrapAngle(this.#pose.yaw - yaw);
      const angularVelocity = body.angvel();
      const targetYawRate = clamp(yawError * 2.6 - angularVelocity.y * 1.6, -1.8, 1.8);
      body.setAngvel(
        {
          x: 0,
          y: angularVelocity.y + (targetYawRate - angularVelocity.y) * blend,
          z: 0,
        },
        true,
      );
    }
  };

  #onCollision = (event: PhysicsCollisionEvent): void => {
    if (!event.started) {
      return;
    }
    const vehicleA = this.#vehicleByCollider.get(event.colliderA.handle) ?? null;
    const vehicleB = this.#vehicleByCollider.get(event.colliderB.handle) ?? null;
    const bikeA = this.#motorbikeByCollider.get(event.colliderA.handle) ?? null;
    const bikeB = this.#motorbikeByCollider.get(event.colliderB.handle) ?? null;
    const bodyA = event.bodyA;
    const bodyB = event.bodyB;
    if (
      (vehicleA === null && vehicleB === null && bikeA === null && bikeB === null) ||
      bodyA === null ||
      bodyB === null ||
      !bodyA.isDynamic() ||
      !bodyB.isDynamic()
    ) {
      return;
    }
    const velocityA = bodyA.linvel();
    const velocityB = bodyB.linvel();
    const relativeSpeed = Math.hypot(velocityA.x - velocityB.x, velocityA.z - velocityB.z);
    if (relativeSpeed < 1.25) {
      return;
    }
    if (vehicleA !== null || vehicleB !== null) {
      this.#trafficImpactCount += 1;
    }
    const holdSeconds = clamp(0.22 + relativeSpeed * 0.045, 0.25, 1.2);
    const applyToVehicle = (vehicle: TrafficVehicle | null): void => {
      if (vehicle === null || vehicle.body === null) {
        return;
      }
      const otherBody = bodyA.handle === vehicle.body.handle ? bodyB : bodyA;
      const position = vehicle.body.translation();
      const otherPosition = otherBody.translation();
      const yaw = yawFromQuat(vehicle.body.rotation());
      const side =
        (otherPosition.x - position.x) * Math.cos(yaw) -
        (otherPosition.z - position.z) * Math.sin(yaw);
      triggerVehicleImpact(vehicle.impact, relativeSpeed, side);
      vehicle.collisionHoldSeconds = Math.max(vehicle.collisionHoldSeconds, holdSeconds);
      vehicle.recoveryPending = true;
    };
    const applyToBike = (bike: Motorbike | null): void => {
      if (bike === null || bike.body === null) {
        return;
      }
      const otherBody = bodyA.handle === bike.body.handle ? bodyB : bodyA;
      const position = bike.body.translation();
      const otherPosition = otherBody.translation();
      const yaw = yawFromQuat(bike.body.rotation());
      const side =
        (otherPosition.x - position.x) * Math.cos(yaw) -
        (otherPosition.z - position.z) * Math.sin(yaw);
      triggerVehicleImpact(bike.impact, relativeSpeed, side);
      bike.collisionHoldSeconds = Math.max(bike.collisionHoldSeconds, holdSeconds);
      bike.recoveryPending = true;
    };
    applyToVehicle(vehicleA);
    applyToVehicle(vehicleB);
    applyToBike(bikeA);
    applyToBike(bikeB);
  };

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

  #writeStreetLifeMatrices(deltaSeconds = 0): void {
    const originOffset = this.#physics?.originOffset ?? { x: 0, z: 0 };
    const sidewalkY = ROAD_Y + SIDEWALK_LIFT;
    const setPose = (x: number, y: number, z: number, yaw: number): void => {
      this.#transform.position.set(x, y, z);
      this.#transform.rotation.set(0, yaw, 0);
      this.#transform.scale.set(1, 1, 1);
      this.#transform.updateMatrix();
    };
    const offsetLocal = (localX: number, localZ: number, yaw: number): void => {
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      this.#transform.position.x += cos * localX + sin * localZ;
      this.#transform.position.z += -sin * localX + cos * localZ;
      this.#transform.updateMatrix();
    };

    for (const cyclist of this.#cyclists) {
      const route = this.#sidewalkRoutes[cyclist.routeIndex]!;
      sampleRoute(route, cyclist.distance, this.#pose);
      const bob = Math.abs(Math.sin(cyclist.phase)) * 0.03;
      setPose(this.#pose.x, sidewalkY + bob, this.#pose.z, this.#pose.yaw);
      this.#cyclistBikeMesh?.setMatrixAt(cyclist.index, this.#transform.matrix);
      // The rider reuses the upright pedestrian body, sunk slightly so it reads as seated.
      this.#transform.position.y -= 0.16;
      this.#transform.updateMatrix();
      this.#cyclistRiderBodyMesh?.setMatrixAt(cyclist.index, this.#transform.matrix);
      this.#transform.position.y += 1.08;
      this.#transform.updateMatrix();
      this.#cyclistRiderHeadMesh?.setMatrixAt(cyclist.index, this.#transform.matrix);
    }

    for (const vendor of this.#cartVendors) {
      const route = this.#sidewalkRoutes[vendor.routeIndex]!;
      sampleRoute(route, vendor.distance, this.#pose);
      const yaw = this.#pose.yaw + Math.sin(vendor.swayPhase) * 0.05;
      setPose(this.#pose.x, sidewalkY, this.#pose.z, yaw);
      this.#cartMesh?.setMatrixAt(vendor.index, this.#transform.matrix);
      // The vendor stands beside the handlebar, offset to one side of the cart.
      setPose(this.#pose.x, sidewalkY, this.#pose.z, yaw);
      offsetLocal(0.45, -0.8, yaw);
      this.#cartVendorBodyMesh?.setMatrixAt(vendor.index, this.#transform.matrix);
      this.#transform.position.y += 1.08;
      this.#transform.updateMatrix();
      this.#cartVendorHeadMesh?.setMatrixAt(vendor.index, this.#transform.matrix);
      // The warm lantern hangs over the cart's front corner.
      setPose(this.#pose.x, sidewalkY, this.#pose.z, yaw);
      offsetLocal(0.55, 0.35, yaw);
      this.#transform.position.y += 0.95;
      this.#transform.updateMatrix();
      this.#cartLanternMesh?.setMatrixAt(vendor.index, this.#transform.matrix);
    }

    for (const bike of this.#motorbikes) {
      let x: number;
      let y: number;
      let z: number;
      let yaw: number;
      if (bike.body !== null && this.#physics !== null) {
        const position = bike.body.translation();
        const rotation = bike.body.rotation();
        x = position.x + originOffset.x - this.#worldOrigin[0];
        y = position.y - this.#worldOrigin[1] - 0.55;
        z = position.z + originOffset.z - this.#worldOrigin[2];
        yaw = yawFromQuat(rotation);
      } else {
        this.#sampleMotorbikePose(bike);
        x = this.#pose.x;
        y = ROAD_Y;
        z = this.#pose.z;
        yaw = this.#pose.yaw;
      }
      const impact = advanceVehicleImpact(bike.impact, deltaSeconds);
      setPose(x, y + impact.bounceMeters, z, yaw);
      this.#transform.rotation.set(impact.pitchRadians, yaw, impact.rollRadians);
      this.#transform.updateMatrix();
      this.#motorbikeMesh?.setMatrixAt(bike.index, this.#transform.matrix);
      this.#transform.position.y -= 0.22;
      this.#transform.updateMatrix();
      this.#motorbikeRiderBodyMesh?.setMatrixAt(bike.index, this.#transform.matrix);
      this.#transform.position.y += 1.08;
      this.#transform.updateMatrix();
      this.#motorbikeRiderHeadMesh?.setMatrixAt(bike.index, this.#transform.matrix);
    }

    for (const mesh of [
      this.#cyclistBikeMesh,
      this.#cyclistRiderBodyMesh,
      this.#cyclistRiderHeadMesh,
      this.#cartMesh,
      this.#cartLanternMesh,
      this.#cartVendorBodyMesh,
      this.#cartVendorHeadMesh,
      this.#motorbikeMesh,
      this.#motorbikeRiderBodyMesh,
      this.#motorbikeRiderHeadMesh,
    ]) {
      if (mesh !== null) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
