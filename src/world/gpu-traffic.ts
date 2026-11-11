/**
 * Phase 10.5 (C5) — AI traffic for the streamed cities.
 *
 * The vehicle simulation runs as a two-kernel WebGPU compute pass (car-following target
 * speeds, then integration + route sampling + turn signals), reading and writing the same
 * storage the vertex shaders read, so the rendered position needs no CPU round-trip. A CPU
 * shadow of the identical integrator runs on every backend: it owns player collision
 * (no read-back), drives the instanced matrices on the WebGL2 backend (the hidden fallback),
 * and keeps both copies in step because they share constants, inputs and spawn events.
 *
 * Everything is pure in (plan, network, seed, focus) apart from the integration clock: the
 * route loops, the vehicle fleet and its class mix are deterministic per world (plan §5).
 */
import {
  BufferAttribute,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  Group,
  InstancedMesh,
  NearestFilter,
  NoColorSpace,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Vector2,
  type BufferGeometry,
  type Material,
} from 'three';
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  StorageInstancedBufferAttribute,
  type UniformNode,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  attribute,
  cameraProjectionMatrix,
  cameraViewMatrix,
  cos,
  float,
  fract,
  instanceIndex,
  mix,
  mod,
  mx_atan2,
  positionGeometry,
  positionWorld,
  select,
  sin,
  storage,
  storageBarrier,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  STREAMED_TRAFFIC_BUDGET,
  STREAMED_TRAFFIC_CLASS_BUDGET,
  STREAMED_TRAFFIC_CLASSES,
  TRAFFIC_BEHAVIOR,
  TRAFFIC_LANE_INSET_METERS,
  TRAFFIC_MAX_ROUTES,
  TRAFFIC_ROUTE_ACTIVATION_METERS,
  TRAFFIC_ROUTE_RELEASE_METERS,
  TRAFFIC_ROUTE_SAMPLES,
} from '../config/world-events';
import { TRAFFIC_VEHICLE_SPECS, type TrafficVehicleClass } from '../config/traffic-vehicles';
import type { TierId } from '../config/tiers';
import { createTrafficVehicleModel } from './traffic-vehicle-models';
import { deriveRegionRoutes, type TrafficRoute } from './traffic-routes';
import type { RoadNetwork } from './road-network';
import type { WorldPlan } from './world-plan';

type ComputeNodeLike = Extract<
  Parameters<WebGPURenderer['compute']>[0],
  { readonly isComputeNode: boolean }
>;

/** Shared integrator constants (the GPU kernels and the CPU shadow must agree). */
export const TRAFFIC_INTEGRATOR = {
  accelMetersPerSecondSquared: 3.5,
  brakeMetersPerSecondSquared: 6.5,
  /** Bumper gap beyond half-lengths before the follower starts easing off. */
  fullSpeedGapMeters: 28,
  /** Gap at which the follower is fully stopped. */
  stopGapMeters: 2.5,
  /** Extra bumper clearance (m). */
  bumperGapMeters: 1.5,
  /** Closing speed (m/s) that counts as a hit. */
  hitSpeedMetersPerSecond: 3,
  /** Collision radius around the player centre (m). */
  hitRadiusMeters: 2.6,
  /** How long a hit vehicle stays stopped (s). */
  hitHoldSeconds: 4,
} as const;

/**
 * Overtake decision (Phase 10.5 pass B). The WGSL kernel mirrors this expression exactly.
 * Gaps are bumper-to-bumper along the route; `ownLeaderGapMeters` may be negative
 * (overlap) and `otherLane*GapMeters` is +Infinity when the adjacent lane is empty.
 */
export function evaluateOvertake(args: {
  readonly ownLeaderGapMeters: number;
  readonly otherLaneLeaderGapMeters: number;
  readonly otherLaneFollowerGapMeters: number;
  readonly speedMetersPerSecond: number;
  readonly laneCooldownSeconds: number;
  /** Phase 12.2 — personality: multiplies the trigger gap (aggressive passes sooner). */
  readonly aggression: number;
}): boolean {
  // The kernel compares against the same 10 ms threshold: both copies agree the
  // cooldown is expired on the same frame (float32 drift never crosses 0.01).
  if (args.laneCooldownSeconds >= 0.01) return false;
  if (args.speedMetersPerSecond < TRAFFIC_BEHAVIOR.overtakeMinSpeedMetersPerSecond) return false;
  if (args.ownLeaderGapMeters >= TRAFFIC_BEHAVIOR.overtakeTriggerGapMeters * args.aggression)
    return false;
  if (args.otherLaneLeaderGapMeters < TRAFFIC_BEHAVIOR.overtakeLeaderClearMeters) return false;
  if (args.otherLaneFollowerGapMeters < TRAFFIC_BEHAVIOR.overtakeFollowerClearMeters) return false;
  return true;
}

/**
 * Speed target while the player is a leader on this route (Phase 10.5 pass B): match the
 * player's along-route speed at the bumper gap, then recover toward cruise across the
 * car-following gap band. `gapMeters` is bumper-to-bumper (may be ≤ 0 alongside).
 */
export function playerLeadTargetMetersPerSecond(
  gapMeters: number,
  playerSpeedAlongMetersPerSecond: number,
  cruiseMetersPerSecond: number,
): number {
  const { stopGapMeters, fullSpeedGapMeters } = TRAFFIC_INTEGRATOR;
  const clearance = Math.max(0, gapMeters - stopGapMeters);
  const band = Math.max(1e-6, fullSpeedGapMeters - stopGapMeters);
  const target =
    playerSpeedAlongMetersPerSecond +
    (clearance / band) * TRAFFIC_BEHAVIOR.playerRecoveryMetersPerSecond;
  return Math.min(cruiseMetersPerSecond, Math.max(0, target));
}

/**
 * Phase 12.2 — player-obstacle braking target. The GPU kernel mirrors this expression
 * exactly (forward-cone math on the previous-frame pose, same constants). Returns the
 * maximum speed the vehicle should hold while the player is inside its forward cone,
 * or `null` when the player is outside the cone (no influence).
 *
 * `forwardMeters` is the player's distance ahead along the vehicle's heading and
 * `lateralMeters` the signed side offset (right positive); both are world-space.
 */
export function playerObstacleTargetMetersPerSecond(args: {
  readonly forwardMeters: number;
  readonly lateralMeters: number;
  readonly vehicleLengthMeters: number;
  readonly playerForwardSpeedMetersPerSecond: number;
  readonly cruiseMetersPerSecond: number;
}): number | null {
  const { playerObstacleMaxMeters, playerObstacleLateralMeters } = TRAFFIC_BEHAVIOR;
  // The WGSL mirror uses comparisons (NaN fails them); the JS gate needs explicit
  // finiteness because NaN slips through `<=`/`>=`.
  if (
    !Number.isFinite(args.forwardMeters) ||
    args.forwardMeters <= 0 ||
    args.forwardMeters >= playerObstacleMaxMeters
  ) {
    return null;
  }
  if (
    !Number.isFinite(args.lateralMeters) ||
    Math.abs(args.lateralMeters) >= playerObstacleLateralMeters
  ) {
    return null;
  }
  const bumperGap =
    args.forwardMeters -
    args.vehicleLengthMeters / 2 -
    TRAFFIC_BEHAVIOR.playerHalfLengthMeters -
    TRAFFIC_INTEGRATOR.bumperGapMeters;
  return playerLeadTargetMetersPerSecond(
    bumperGap,
    args.playerForwardSpeedMetersPerSecond,
    args.cruiseMetersPerSecond,
  );
}

/** One eased step of the lateral lane transition toward `targetLateralMeters`. */
export function stepLaneLateral(
  currentLateralMeters: number,
  targetLateralMeters: number,
  deltaSeconds: number,
): number {
  const step = TRAFFIC_BEHAVIOR.laneChangeRateMetersPerSecond * deltaSeconds;
  const delta = targetLateralMeters - currentLateralMeters;
  if (Math.abs(delta) <= step) return targetLateralMeters;
  return currentLateralMeters + Math.sign(delta) * step;
}

const REQUEST_RESPAWN = 1;
const REQUEST_HIT = 2;
const REQUEST_KILL = 4;

interface ShadowVehicle {
  routeIdx: number;
  lane: 1 | -1;
  distance: number;
  speed: number;
  alive: number;
  hitUntil: number;
  length: number;
  cruise: number;
  /** Current lateral offset from the centreline (m; + is the +1 lane side). */
  lateral: number;
  /** Seconds remaining before another lane change may be attempted. */
  laneCooldown: number;
  /** Phase 12.2 — personality: multiplies the car-following gaps (scales the band). */
  patience: number;
  /** Phase 12.2 — personality: multiplies the overtake trigger gap. */
  aggression: number;
}

export interface StreamedTrafficStats {
  streamedTrafficVehicles: number;
  streamedTrafficRoutes: number;
  /** 1 when the compute path drives the render, 0 on the CPU fallback. */
  streamedTrafficGpu: 0 | 1;
  /** Cumulative overtakes (lane changes) performed by the AI fleet. */
  streamedTrafficLaneChanges: number;
}

export class GpuTrafficWorld {
  readonly root = new Group();

  readonly #capacity: number;
  readonly #classCounts: readonly number[];
  readonly #classBases: readonly number[];

  // --- GPU storage -------------------------------------------------------------
  readonly #stateA: StorageInstancedBufferAttribute; // route, lane, distance, speed
  readonly #stateB: StorageInstancedBufferAttribute; // yaw, brake, blinkL, blinkR
  readonly #stateC: StorageInstancedBufferAttribute; // x, y, z, alive
  readonly #stateD: StorageInstancedBufferAttribute; // lateral, laneCooldown, 0, wantChange
  readonly #speedTarget: StorageInstancedBufferAttribute;
  readonly #requests: StorageInstancedBufferAttribute; // route, lane, dist, flags
  readonly #vehicleStatic: StorageInstancedBufferAttribute; // length, cruise, class, phase
  /** Phase 12.2 — per-slot personality (patience, aggression, 0, 0). */
  readonly #personality: StorageInstancedBufferAttribute;
  /** CPU-written each frame: (distance ahead to player, player speed along the route). */
  readonly #playerLead: StorageInstancedBufferAttribute;

  // --- route LUT ---------------------------------------------------------------
  readonly #routeTexture: DataTexture;
  readonly #routeMetaTexture: DataTexture;
  readonly #routeTable: (TrafficRoute | null)[];
  #routeTableDirty = false;
  readonly #activeRegions = new Set<string>();

  // --- uniforms / compute ------------------------------------------------------
  readonly #dt = uniform(0);
  readonly #time = uniform(0);
  readonly #playerXZ = uniform(new Vector2());
  /** Phase 12.2 — player world velocity (m/s) for the obstacle-braking cone. */
  readonly #playerVelocityXZ = uniform(new Vector2());
  readonly #useStorage = uniform(0);
  readonly nightGain: UniformNode<'float', number> = uniform(1);
  #computeNode: ComputeNodeLike | null = null;
  #renderer: WebGPURenderer | null = null;
  #backend: 'webgpu' | 'webgl2' | null = null;

  // --- CPU shadow --------------------------------------------------------------
  readonly #shadow: ShadowVehicle[];
  #requestsDirty = false;

  // --- meshes ------------------------------------------------------------------
  readonly #meshes: InstancedMesh[] = [];
  readonly #materials: Material[] = [];
  readonly #geometries: BufferGeometry[] = [];
  readonly #transform = new Object3D();

  // --- per-frame out ------------------------------------------------------------
  readonly #pendingImpulses: { x: number; y: number; z: number }[] = [];
  #timeAccumulator = 0;
  #laneChanges = 0;
  /** Per-route player projection cache (rebuilt as the focus moves, per frame). */
  readonly #routePlayerCache = new Map<
    number,
    { s: number; ok: boolean; dirX: number; dirZ: number }
  >();
  #disposed = false;

  constructor(network: RoadNetwork, plan: WorldPlan, tier: TierId) {
    this.#network = network;
    this.#plan = plan;
    this.#capacity = STREAMED_TRAFFIC_BUDGET[tier] ?? 24;
    const counts = STREAMED_TRAFFIC_CLASS_BUDGET[tier] ?? [12, 5, 4, 2, 1];
    this.#classCounts = counts;
    const bases: number[] = [];
    let base = 0;
    for (let k = 0; k < counts.length; k += 1) {
      bases.push(base);
      base += counts[k] ?? 0;
    }
    this.#classBases = bases;

    this.#stateA = createStorage(this.#capacity, 4);
    this.#stateB = createStorage(this.#capacity, 4);
    this.#stateC = createStorage(this.#capacity, 4);
    this.#stateD = createStorage(this.#capacity, 4);
    this.#speedTarget = createStorage(this.#capacity, 1);
    this.#requests = createStorage(this.#capacity, 4);
    this.#vehicleStatic = createStorage(this.#capacity, 4);
    this.#personality = createStorage(this.#capacity, 4);
    this.#playerLead = createStorage(this.#capacity, 2);

    this.#routeTable = new Array<TrafficRoute | null>(TRAFFIC_MAX_ROUTES).fill(null);
    this.#routeTexture = new DataTexture(
      new Float32Array(TRAFFIC_ROUTE_SAMPLES * TRAFFIC_MAX_ROUTES * 4),
      TRAFFIC_ROUTE_SAMPLES,
      TRAFFIC_MAX_ROUTES,
    );
    configureLutTexture(this.#routeTexture);
    this.#routeMetaTexture = new DataTexture(
      new Float32Array(TRAFFIC_MAX_ROUTES * 4),
      TRAFFIC_MAX_ROUTES,
      1,
    );
    configureLutTexture(this.#routeMetaTexture);

    this.#shadow = [];
    for (let i = 0; i < this.#capacity; i += 1) {
      this.#shadow.push({
        routeIdx: 0,
        lane: 1,
        distance: 0,
        speed: 0,
        alive: 0,
        hitUntil: 0,
        length: 4.5,
        cruise: 8,
        lateral: TRAFFIC_LANE_INSET_METERS,
        laneCooldown: 0,
        patience: 1,
        aggression: 1,
      });
    }

    this.root.name = 'streamed-traffic';
    this.#buildMeshes();
    this.#buildCompute();
  }

  /** The compute pass exists only once the backend is known (Engine.init). */
  configureBackend(backend: 'webgpu' | 'webgl2' | null, renderer: WebGPURenderer): void {
    this.#backend = backend;
    this.#renderer = renderer;
    this.#useStorage.value = backend === 'webgpu' ? 1 : 0;
    if (backend === 'webgl2') {
      // The storage-driven vertex path is unreachable; matrices take over.
      this.root.visible = true;
    }
  }

  consumeImpulses(): { x: number; y: number; z: number }[] {
    if (this.#pendingImpulses.length === 0) return [];
    const out = this.#pendingImpulses.slice();
    this.#pendingImpulses.length = 0;
    return out;
  }

  /**
   * Read-only CPU shadow snapshot (Phase 12.2 behavior tests). The GPU path runs
   * the same model; the shadow is the side testable without a WebGPU device.
   */
  getShadowSnapshot(): readonly {
    readonly routeIdx: number;
    readonly lane: 1 | -1;
    readonly distance: number;
    readonly speed: number;
    readonly alive: number;
    readonly cruise: number;
    readonly patience: number;
    readonly aggression: number;
  }[] {
    return this.#shadow.map((v) => ({
      routeIdx: v.routeIdx,
      lane: v.lane,
      distance: v.distance,
      speed: v.speed,
      alive: v.alive,
      cruise: v.cruise,
      patience: v.patience,
      aggression: v.aggression,
    }));
  }

  /** World pose on the vehicle's route `metersAhead` in front of it (tests). */
  getPoseAhead(index: number, metersAhead: number): { x: number; z: number; yaw: number } | null {
    const v = this.#shadow[index];
    if (v === undefined || v.alive <= 0) return null;
    const route = this.#routeTable[v.routeIdx];
    if (route === null || route === undefined) return null;
    const pos = sampleRoute(route, wrapDistance(v.distance + metersAhead, route.length), 0);
    return { x: pos.x, z: pos.z, yaw: sampleRouteYaw(route, v.distance + metersAhead) };
  }

  /** Read-only world pose of one shadow slot (Phase 12.2 behavior tests). */
  getVehicleWorldPose(index: number): {
    x: number;
    z: number;
    yaw: number;
    speed: number;
    lane: 1 | -1;
    alive: number;
  } | null {
    const v = this.#shadow[index];
    if (v === undefined || v.alive <= 0) return null;
    const route = this.#routeTable[v.routeIdx];
    if (route === null || route === undefined) return null;
    const pos = sampleRoute(route, v.distance, v.lateral);
    return {
      x: pos.x,
      z: pos.z,
      yaw: sampleRouteYaw(route, v.distance),
      speed: v.speed,
      lane: v.lane,
      alive: v.alive,
    };
  }

  getContentStats(): StreamedTrafficStats {
    let alive = 0;
    for (const v of this.#shadow) if (v.alive > 0) alive += 1;
    let routes = 0;
    for (const route of this.#routeTable) if (route !== null) routes += 1;
    return {
      streamedTrafficVehicles: alive,
      streamedTrafficRoutes: routes,
      streamedTrafficGpu: this.#backend === 'webgpu' ? 1 : 0,
      streamedTrafficLaneChanges: this.#laneChanges,
    };
  }

  setNightGain(gain: number): void {
    this.nightGain.value = gain;
  }

  update(
    deltaSeconds: number,
    focus: { x: number; z: number },
    playerVelocity: { x: number; z: number } | undefined,
  ): void {
    if (this.#disposed) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.min(0.1, Math.max(0, deltaSeconds)) : 0;
    this.#timeAccumulator += delta;
    this.#time.value = this.#timeAccumulator;
    this.#playerXZ.value.set(focus.x, focus.z);
    this.#playerVelocityXZ.value.set(playerVelocity?.x ?? 0, playerVelocity?.z ?? 0);

    this.#maintainRoutes(focus);
    this.#stepShadow(delta, focus, playerVelocity);
    this.#playerLead.needsUpdate = true; // the kernel reads the per-vehicle player lead
    this.#flushRequests();

    if (this.#backend === 'webgpu' && this.#renderer !== null && this.#computeNode !== null) {
      this.#dt.value = delta;
      this.#renderer.compute([this.#computeNode]);
    } else {
      this.#writeMatrices();
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#computeNode?.dispose();
    for (const geometry of this.#geometries) geometry.dispose();
    for (const material of this.#materials) material.dispose();
    for (const mesh of this.#meshes) mesh.removeFromParent();
    this.#routeTexture.dispose();
    this.#routeMetaTexture.dispose();
    this.nightGain.dispose?.();
    this.root.removeFromParent();
  }

  // --- route table maintenance -------------------------------------------------

  #maintainRoutes(focus: { x: number; z: number }): void {
    const plan = this.#plan;
    if (plan !== null) {
      const region = plan.regionAt(focus.x, focus.z);
      if (
        (region.archetype === 'megacity' || region.archetype === 'urban-fringe') &&
        !this.#activeRegions.has(region.id)
      ) {
        this.#activeRegions.add(region.id);
        this.#ingestRegionRoutes(region);
      }
    }
    // Release routes the player has driven away from.
    for (let i = 0; i < this.#routeTable.length; i += 1) {
      const route = this.#routeTable[i]!;
      if (route === null) continue;
      const centre = this.#routeCentre(route);
      const distance = Math.hypot(centre.x - focus.x, centre.z - focus.z);
      if (distance > TRAFFIC_ROUTE_RELEASE_METERS) {
        for (let v = 0; v < this.#capacity; v += 1) {
          const shadow = this.#shadow[v]!;
          if (shadow.alive > 0 && shadow.routeIdx === i) {
            shadow.alive = 0;
            this.#setRequest(v, REQUEST_KILL, 0, 0, 0);
          }
        }
        this.#routeTable[i] = null;
        this.#routeTableDirty = true;
      }
    }
    // Spawn up to the budget, nearest active routes first.
    let alive = 0;
    for (const v of this.#shadow) if (v.alive > 0) alive += 1;
    if (alive < this.#capacity) {
      const candidates: { index: number; distance: number; load: number }[] = [];
      for (let i = 0; i < this.#routeTable.length; i += 1) {
        const route = this.#routeTable[i]!;
        if (route === null) continue;
        const centre = this.#routeCentre(route);
        const distance = Math.hypot(centre.x - focus.x, centre.z - focus.z);
        if (distance > TRAFFIC_ROUTE_ACTIVATION_METERS) continue;
        let load = 0;
        for (const v of this.#shadow) if (v.alive > 0 && v.routeIdx === i) load += 1;
        candidates.push({ index: i, distance, load });
      }
      candidates.sort((a, b) => a.distance - b.distance || a.load - b.load || a.index - b.index);
      let spawned = 0;
      for (let k = 0; k < candidates.length && alive < this.#capacity && spawned < 4; k += 1) {
        const slot = this.#findDeadSlot();
        if (slot === -1) continue;
        this.#spawn(slot, candidates[k]!.index);
        alive += 1;
        spawned += 1;
      }
    }
  }

  readonly #plan: WorldPlan | null;

  #ingestRegionRoutes(region: {
    id: string;
    ix: number;
    iz: number;
    archetype: string;
    district: { readonly centerX: number; readonly centerZ: number };
  }): void {
    if (this.#network === null) return;
    const derived = deriveRegionRoutes(this.#network, region);
    let rows = 0;
    for (const route of derived.routes) {
      let slot = -1;
      for (let i = 0; i < this.#routeTable.length; i += 1) {
        if (this.#routeTable[i] === null) {
          slot = i;
          break;
        }
      }
      if (slot === -1) break;
      this.#routeTable[slot] = route;
      rows += 1;
    }
    if (rows > 0) this.#routeTableDirty = true;
  }

  readonly #network: RoadNetwork | null;

  #routeCentre(route: TrafficRoute): { x: number; z: number } {
    const a = route.points[0]!;
    const b = route.points[route.points.length >> 1]!;
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  }

  #findDeadSlot(): number {
    for (let i = 0; i < this.#capacity; i += 1) {
      if (this.#shadow[i]!.alive <= 0) return i;
    }
    return -1;
  }

  #spawn(slot: number, routeIdx: number): void {
    const shadow = this.#shadow[slot]!;
    const route = this.#routeTable[routeIdx]!;
    if (route === null) return;
    const hash = deterministicUnit(slot * 131 + routeIdx * 17 + Math.floor(this.#timeAccumulator));
    const classIdx = this.#classIndexOfSlot(slot);
    const type = STREAMED_TRAFFIC_CLASSES[classIdx]!;
    const spec = TRAFFIC_VEHICLE_SPECS[type];
    shadow.routeIdx = routeIdx;
    shadow.lane = hash < 0.5 ? 1 : -1;
    shadow.distance = hash * route.length;
    shadow.speed = 0;
    shadow.alive = 1;
    shadow.hitUntil = 0;
    shadow.length = spec.lengthMeters;
    shadow.lateral = shadow.lane * TRAFFIC_LANE_INSET_METERS;
    shadow.laneCooldown = 0;
    shadow.cruise =
      spec.minimumSpeedMetersPerSecond +
      deterministicUnit(slot * 7919 + 3) *
        (spec.maximumSpeedMetersPerSecond - spec.minimumSpeedMetersPerSecond);
    // Phase 12.2 — per-slot driver personality (deterministic; the CPU shadow and
    // the GPU kernel read the same values, so the fleet behaves identically on both).
    const {
      personalityPatienceMin,
      personalityPatienceMax,
      personalityAggressionMin,
      personalityAggressionMax,
    } = TRAFFIC_BEHAVIOR;
    shadow.patience =
      personalityPatienceMin +
      deterministicUnit(slot * 104729 + 11) * (personalityPatienceMax - personalityPatienceMin);
    shadow.aggression =
      personalityAggressionMin +
      deterministicUnit(slot * 15485863 + 23) *
        (personalityAggressionMax - personalityAggressionMin);
    // The GPU static table mirrors the shadow's per-vehicle constants.
    const o = slot * 4;
    const staticArray = this.#vehicleStatic.array as Float32Array;
    staticArray[o] = spec.lengthMeters;
    staticArray[o + 1] = shadow.cruise;
    staticArray[o + 2] = classIdx;
    staticArray[o + 3] = deterministicUnit(slot * 31 + 7);
    this.#vehicleStatic.needsUpdate = true;
    const personalityArray = this.#personality.array as Float32Array;
    personalityArray[o] = shadow.patience;
    personalityArray[o + 1] = shadow.aggression;
    personalityArray[o + 2] = 0;
    personalityArray[o + 3] = 0;
    this.#personality.needsUpdate = true;
    this.#setRequest(slot, REQUEST_RESPAWN, routeIdx, shadow.lane, shadow.distance);
  }

  // --- CPU shadow step -----------------------------------------------------------

  #stepShadow(
    delta: number,
    focus: { x: number; z: number },
    playerVelocity: { x: number; z: number } | undefined,
  ): void {
    if (delta <= 0) return;
    const playerSpeed = Math.hypot(playerVelocity?.x ?? 0, playerVelocity?.z ?? 0);
    const playerVX = playerVelocity?.x ?? 0;
    const playerVZ = playerVelocity?.z ?? 0;
    this.#routePlayerCache.clear(); // the projection is valid for this frame's focus only
    for (let i = 0; i < this.#capacity; i += 1) {
      const v = this.#shadow[i]!;
      if (v.alive <= 0) continue;
      const route = this.#routeTable[v.routeIdx]!;
      if (route === null) {
        v.alive = 0;
        this.#setRequest(i, REQUEST_KILL, 0, 0, 0);
        continue;
      }
      // Expired hit hold: clear the GPU flag.
      if (v.alive <= 0.5) {
        if (this.#timeAccumulator >= v.hitUntil) {
          v.alive = 1;
          this.#setRequest(i, 0, 0, 0, 0);
        } else {
          continue; // stopped; the GPU holds the flag
        }
      }
      // Car following: nearest leader/follower gaps on this route, per lane
      // (Phase 10.5 pass B — the adjacent-lane gaps feed the overtake decision).
      let ownLeaderGap = Number.POSITIVE_INFINITY;
      let otherLeaderGap = Number.POSITIVE_INFINITY;
      let otherFollowerGap = Number.POSITIVE_INFINITY;
      for (let j = 0; j < this.#capacity; j += 1) {
        if (j === i) continue;
        const other = this.#shadow[j]!;
        if (other.alive <= 0.5 || other.routeIdx !== v.routeIdx) continue;
        const halfLens = (other.length + v.length) / 2 + TRAFFIC_INTEGRATOR.bumperGapMeters;
        const dAhead = wrapDistance(other.distance - v.distance, route.length);
        if (other.lane === v.lane) {
          const gap = dAhead - halfLens;
          if (gap < ownLeaderGap) ownLeaderGap = gap;
        } else if (dAhead < route.length / 2) {
          const gap = dAhead - halfLens;
          if (gap < otherLeaderGap) otherLeaderGap = gap;
        } else {
          const gap = route.length - dAhead - halfLens;
          if (gap < otherFollowerGap) otherFollowerGap = gap;
        }
      }
      // Overtake decision (mirrors evaluateOvertake and the kernel's phase 1).
      if (v.laneCooldown > 0) v.laneCooldown = Math.max(0, v.laneCooldown - delta);
      const wantChange = evaluateOvertake({
        ownLeaderGapMeters: ownLeaderGap,
        otherLaneLeaderGapMeters: otherLeaderGap,
        otherLaneFollowerGapMeters: otherFollowerGap,
        speedMetersPerSecond: v.speed,
        laneCooldownSeconds: v.laneCooldown,
        aggression: v.aggression,
      });
      if (wantChange) {
        v.lane = v.lane === 1 ? -1 : 1;
        v.laneCooldown = TRAFFIC_BEHAVIOR.laneChangeCooldownSeconds;
        this.#laneChanges += 1;
      }
      // The player as a leader (Phase 10.5 pass B): project the focus onto the route.
      let leadDs = 1e6;
      let leadSpeed = 0;
      let info = this.#routePlayerCache.get(v.routeIdx);
      if (info === undefined) {
        info = this.#projectPlayerOntoRoute(route, focus.x, focus.z);
        this.#routePlayerCache.set(v.routeIdx, info);
      }
      if (info.ok) {
        const ds = wrapDistance(info.s - v.distance, route.length);
        if (
          ds > TRAFFIC_BEHAVIOR.playerAheadMinMeters &&
          ds < TRAFFIC_BEHAVIOR.playerAheadMaxMeters
        ) {
          leadDs = ds;
          leadSpeed = playerVX * info.dirX + playerVZ * info.dirZ;
        }
      }
      this.#writePlayerLead(i, leadDs, leadSpeed);
      const { stopGapMeters, fullSpeedGapMeters } = TRAFFIC_INTEGRATOR;
      // Phase 12.2 — patience scales the follower band (the kernel reads the same
      // per-slot value from the personality buffer).
      const stopGap = stopGapMeters * v.patience;
      const fullSpeedGap = fullSpeedGapMeters * v.patience;
      let target =
        ownLeaderGap <= stopGap
          ? 0
          : Math.min(1, (ownLeaderGap - stopGap) / Math.max(1e-6, fullSpeedGap - stopGap)) *
            v.cruise;
      if (leadDs < 1e5) {
        const gap =
          leadDs -
          v.length / 2 -
          TRAFFIC_BEHAVIOR.playerHalfLengthMeters -
          TRAFFIC_INTEGRATOR.bumperGapMeters;
        target = Math.min(target, playerLeadTargetMetersPerSecond(gap, leadSpeed, v.cruise));
      }
      // Phase 12.2 — brake for the player in this vehicle's forward cone. The
      // on-route leader pass only sees the player when the projection falls on the
      // route line; this world-space cone catches the player alongside or across
      // the lanes. The kernel mirrors the same cone on the previous-frame pose
      // (stateC/stateB), so the shadow uses this step's pre-integration pose.
      {
        const yaw = sampleRouteYaw(route, v.distance);
        const tx = -Math.sin(yaw);
        const tz = -Math.cos(yaw);
        const pose = sampleRoute(route, v.distance, v.lateral);
        const rx = focus.x - pose.x;
        const rz = focus.z - pose.z;
        const forward = rx * tx + rz * tz;
        // Right of travel = (tz, -tx): lateral = rel · right = rx*tz - rz*tx.
        const obstacle = playerObstacleTargetMetersPerSecond({
          forwardMeters: forward,
          lateralMeters: rx * tz - rz * tx,
          vehicleLengthMeters: v.length,
          playerForwardSpeedMetersPerSecond: playerVX * tx + playerVZ * tz,
          cruiseMetersPerSecond: v.cruise,
        });
        if (obstacle !== null) target = Math.min(target, obstacle);
      }
      const clamped = clampSpeedDelta(target - v.speed, delta);
      v.speed = Math.max(0, v.speed + clamped);
      v.distance = wrapDistance(v.distance + v.speed * delta, route.length);
      // Lateral transition toward the (possibly new) lane.
      v.lateral = stepLaneLateral(v.lateral, v.lane * TRAFFIC_LANE_INSET_METERS, delta);
      // Player collision (the CPU is the only side that knows both positions).
      const pos = sampleRoute(route, v.distance, v.lateral);
      const dx = pos.x - focus.x;
      const dz = pos.z - focus.z;
      const distance = Math.hypot(dx, dz);
      if (distance < TRAFFIC_INTEGRATOR.hitRadiusMeters + 1.2 && v.alive > 0.5) {
        const closing =
          playerSpeed > 0.5
            ? (playerVelocity!.x * dx + playerVelocity!.z * dz) / Math.max(0.01, distance)
            : 0;
        if (closing > TRAFFIC_INTEGRATOR.hitSpeedMetersPerSecond) {
          v.alive = 0.5;
          v.hitUntil = this.#timeAccumulator + TRAFFIC_INTEGRATOR.hitHoldSeconds;
          this.#setRequest(i, REQUEST_HIT, 0, 0, 0);
          const deltaV = Math.min(2.5, closing * 0.4);
          this.#pendingImpulses.push({
            x: (-dx / Math.max(0.01, distance)) * deltaV,
            y: 0,
            z: (-dz / Math.max(0.01, distance)) * deltaV,
          });
        }
      }
    }
  }

  // --- request flush + matrix fallback ------------------------------------------

  #flushRequests(): void {
    if (this.#routeTableDirty) {
      this.#rebuildRouteLut();
    }
    if (this.#requestsDirty) {
      this.#requests.needsUpdate = true;
      this.#requestsDirty = false;
    }
  }

  #rebuildRouteLut(): void {
    const data = this.#routeTexture.image.data as Float32Array;
    const meta = this.#routeMetaTexture.image.data as Float32Array;
    data.fill(0);
    meta.fill(0);
    for (let i = 0; i < this.#routeTable.length; i += 1) {
      const route = this.#routeTable[i]!;
      if (route === null) continue;
      for (let s = 0; s < TRAFFIC_ROUTE_SAMPLES; s += 1) {
        const p = route.points[s]!;
        const o = (i * TRAFFIC_ROUTE_SAMPLES + s) * 4;
        data[o] = p.x;
        data[o + 1] = p.z;
        data[o + 2] = p.y;
        data[o + 3] = p.yaw;
      }
      const m = i * 4;
      meta[m] = route.length;
      meta[m + 1] = route.spacing;
      meta[m + 2] = route.halfWidthMeters;
      meta[m + 3] = 1;
    }
    this.#routeTexture.needsUpdate = true;
    this.#routeMetaTexture.needsUpdate = true;
    this.#routeTableDirty = false;
  }

  #writeMatrices(): void {
    for (let i = 0; i < this.#capacity; i += 1) {
      const v = this.#shadow[i]!;
      const route = this.#routeTable[v.routeIdx]!;
      const visible = v.alive > 0 && route !== null;
      const classIdx = Math.min(this.#classCounts.length - 1, this.#classIndexOfSlot(i));
      const base = this.#classBases[classIdx]!;
      const local = i - base;
      const mesh = this.#meshes[classIdx]!;
      if (mesh === undefined) continue;
      if (!visible || local >= mesh.count) {
        this.#transform.position.set(0, -50, 0);
        this.#transform.scale.set(0.0001, 0.0001, 0.0001);
      } else {
        const pos = sampleRoute(route!, v.distance, v.lateral);
        const yaw = sampleRouteYaw(route!, v.distance);
        this.#transform.position.set(pos.x, pos.y, pos.z);
        this.#transform.rotation.set(0, yaw, 0);
        this.#transform.scale.set(1, 1, 1);
      }
      this.#transform.updateMatrix();
      if (local >= 0 && local < mesh.count) mesh.setMatrixAt(local, this.#transform.matrix);
      const light = this.#lightMeshes[classIdx]!;
      if (light !== undefined && local >= 0 && local < light.count) {
        light.setMatrixAt(local, this.#transform.matrix);
      }
    }
    for (const mesh of this.#meshes) mesh.instanceMatrix.needsUpdate = true;
    for (const light of this.#lightMeshes) light.instanceMatrix.needsUpdate = true;
  }

  #writePlayerLead(slot: number, dsMeters: number, speedAlongMetersPerSecond: number): void {
    const arr = this.#playerLead.array as Float32Array;
    arr[slot * 2] = dsMeters;
    arr[slot * 2 + 1] = speedAlongMetersPerSecond;
  }

  /**
   * Project the focus (the player) onto a route: nearest arc-length position (refined
   * along the sample segment) plus the route direction there. The lateral test decides
   * whether the player is actually on this carriageway (Phase 10.5 pass B).
   */
  #projectPlayerOntoRoute(
    route: TrafficRoute,
    px: number,
    pz: number,
  ): { s: number; ok: boolean; dirX: number; dirZ: number } {
    const points = route.points;
    const count = points.length;
    let bestD2 = Number.POSITIVE_INFINITY;
    let bestI = 0;
    for (let i = 0; i < count; i += 1) {
      const p = points[i]!;
      const dx = px - p.x;
      const dz = pz - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestI = i;
      }
    }
    const p = points[bestI]!;
    const q = points[(bestI + 1) % count]!;
    const segX = q.x - p.x;
    const segZ = q.z - p.z;
    const segLen2 = Math.max(1e-9, segX * segX + segZ * segZ);
    const t = Math.max(0, Math.min(1, ((px - p.x) * segX + (pz - p.z) * segZ) / segLen2));
    const s = (bestI + t) * route.spacing;
    // Right of travel at the sample: (-cos yaw, sin yaw) — the lane-offset convention.
    const rx = -Math.cos(p.yaw);
    const rz = Math.sin(p.yaw);
    const lateral = (px - p.x) * rx + (pz - p.z) * rz;
    return {
      s,
      ok: Math.abs(lateral) <= TRAFFIC_BEHAVIOR.playerRouteLateralToleranceMeters,
      dirX: -Math.sin(p.yaw),
      dirZ: -Math.cos(p.yaw),
    };
  }

  #classIndexOfSlot(slot: number): number {
    for (let k = this.#classBases.length - 1; k >= 0; k -= 1) {
      if (slot >= this.#classBases[k]!) return k;
    }
    return 0;
  }

  // --- construction --------------------------------------------------------------

  readonly #lightMeshes: InstancedMesh[] = [];

  #buildMeshes(): void {
    for (let k = 0; k < STREAMED_TRAFFIC_CLASSES.length; k += 1) {
      const type = STREAMED_TRAFFIC_CLASSES[k]!;
      const count = this.#classCounts[k]!;
      if (count === 0) {
        this.#lightMeshes.push(undefined as unknown as InstancedMesh);
        continue;
      }
      const model = createTrafficVehicleModel(type);
      this.#geometries.push(model.geometry);
      const bodyMaterial = new MeshPhysicalNodeMaterial();
      bodyMaterial.name = `streamed-traffic-${type}-paint`;
      bodyMaterial.color.setHex(model.bodyColor);
      bodyMaterial.metalness = 0.18;
      bodyMaterial.roughness = 0.4;
      bodyMaterial.clearcoat = 0.34;
      bodyMaterial.clearcoatRoughness = 0.24;
      // Trim/accent are per-class: the vertex node carries the class's instance base offset.
      const trimMaterial = new MeshStandardNodeMaterial();
      trimMaterial.name = `streamed-traffic-${type}-glass-and-tyres`;
      trimMaterial.color.setHex(0x242b31);
      trimMaterial.roughness = 0.9;
      trimMaterial.metalness = 0.04;
      const accentMaterial = new MeshStandardNodeMaterial();
      accentMaterial.name = `streamed-traffic-${type}-metal-accents`;
      accentMaterial.color.setHex(0xaab5bd);
      accentMaterial.metalness = 0.62;
      accentMaterial.roughness = 0.36;
      const baseOffset = this.#classBases[k]!;
      const vertexNode = createTrafficVertexNode(
        this.#stateB,
        this.#stateC,
        this.#useStorage,
        this.#capacity,
        baseOffset,
        `streamed-traffic-${type}-vertex`,
      );
      bodyMaterial.vertexNode = vertexNode;
      trimMaterial.vertexNode = vertexNode;
      accentMaterial.vertexNode = vertexNode;
      this.#materials.push(bodyMaterial, trimMaterial, accentMaterial);
      const mesh = new InstancedMesh(
        model.geometry,
        [bodyMaterial, trimMaterial, accentMaterial],
        count,
      );
      mesh.name = `streamed-traffic-${type}`;
      mesh.frustumCulled = false;
      this.#meshes.push(mesh);
      this.root.add(mesh);

      // Light strips: headlights, taillights, blinkers — one basic-material mesh.
      const lightGeometry = buildLightStrips(type, this.#geometries);
      const lightMaterial = this.#track(
        createLightMaterial(
          this.#stateB,
          this.#stateC,
          this.#time,
          this.nightGain,
          this.#capacity,
          baseOffset,
          `streamed-traffic-${type}-lights`,
        ),
        this.#materials,
      );
      const lightMesh = new InstancedMesh(lightGeometry, lightMaterial, count);
      lightMesh.name = `streamed-traffic-${type}-lights`;
      lightMesh.frustumCulled = false;
      lightMesh.renderOrder = 2;
      this.#lightMeshes.push(lightMesh);
      this.root.add(lightMesh);
    }
    // Hide the fleet until the first spawn fills the slots (all matrices start at the origin).
    for (const mesh of this.#meshes) {
      for (let i = 0; i < mesh.count; i += 1) {
        this.#transform.position.set(0, -50, 0);
        this.#transform.scale.set(0.0001, 0.0001, 0.0001);
        this.#transform.rotation.set(0, 0, 0);
        this.#transform.updateMatrix();
        mesh.setMatrixAt(i, this.#transform.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const light of this.#lightMeshes) {
      if (light === undefined) continue;
      for (let i = 0; i < light.count; i += 1) {
        this.#transform.position.set(0, -50, 0);
        this.#transform.scale.set(0.0001, 0.0001, 0.0001);
        this.#transform.rotation.set(0, 0, 0);
        this.#transform.updateMatrix();
        light.setMatrixAt(i, this.#transform.matrix);
      }
      light.instanceMatrix.needsUpdate = true;
    }
  }

  #track<T>(value: T, list: T[]): T {
    list.push(value);
    return value;
  }

  #setRequest(slot: number, flags: number, routeIdx: number, lane: number, distance: number): void {
    const o = slot * 4;
    const current = this.#requests.array as Float32Array;
    if ((current[o + 3] ?? 0) === 0 && flags === 0 && current[o] === routeIdx) return;
    current[o] = routeIdx;
    current[o + 1] = lane;
    current[o + 2] = distance;
    current[o + 3] = flags;
    this.#requestsDirty = true;
  }

  #buildCompute(): void {
    this.#computeNode = createTrafficComputeNode(
      {
        stateA: this.#stateA,
        stateB: this.#stateB,
        stateC: this.#stateC,
        stateD: this.#stateD,
        speedTarget: this.#speedTarget,
        requests: this.#requests,
        vehicleStatic: this.#vehicleStatic,
        personality: this.#personality,
        playerLead: this.#playerLead,
        routeTexture: this.#routeTexture,
        routeMetaTexture: this.#routeMetaTexture,
        dt: this.#dt,
        playerXZ: this.#playerXZ,
        playerVelocityXZ: this.#playerVelocityXZ,
      },
      this.#capacity,
    );
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createStorage(capacity: number, itemSize: number): StorageInstancedBufferAttribute {
  const attribute = new StorageInstancedBufferAttribute(
    new Float32Array(capacity * itemSize),
    itemSize,
  );
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

function configureLutTexture(texture: DataTexture): void {
  texture.colorSpace = NoColorSpace;
  texture.type = FloatType;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}

function wrapDistance(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function clampSpeedDelta(delta: number, frameDelta: number): number {
  const { accelMetersPerSecondSquared, brakeMetersPerSecondSquared } = TRAFFIC_INTEGRATOR;
  return Math.max(
    -brakeMetersPerSecondSquared * frameDelta,
    Math.min(accelMetersPerSecondSquared * frameDelta, delta),
  );
}

/** Deterministic [0, 1) hash for spawn variation. */
function deterministicUnit(seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

/** CPU-side route sampling: the lane offset is applied on the right of travel. */
function sampleRoute(
  route: TrafficRoute,
  distance: number,
  laneOffsetMeters: number,
): { x: number; y: number; z: number } {
  const count = route.points.length;
  const u = wrapDistance(distance, route.length) / route.spacing;
  const i0 = Math.floor(u) % count;
  const f = u - Math.floor(u);
  const p0 = route.points[i0]!;
  const p1 = route.points[(i0 + 1) % count]!;
  const x = p0.x + (p1.x - p0.x) * f;
  const y = p0.y + (p1.y - p0.y) * f;
  const z = p0.z + (p1.z - p0.z) * f;
  const yaw = lerpAngle(p0.yaw, p1.yaw, f);
  // Travel = (-sin yaw, -cos yaw); the right of travel = (t.z, -t.x).
  const tx = -Math.sin(yaw);
  const tz = -Math.cos(yaw);
  return { x: x + tz * laneOffsetMeters, y, z: z - tx * laneOffsetMeters };
}

function sampleRouteYaw(route: TrafficRoute, distance: number): number {
  const count = route.points.length;
  const u = wrapDistance(distance, route.length) / route.spacing;
  const i0 = Math.floor(u) % count;
  const f = u - Math.floor(u);
  const p0 = route.points[i0]!;
  const p1 = route.points[(i0 + 1) % count]!;
  return lerpAngle(p0.yaw, p1.yaw, f);
}

// ---------------------------------------------------------------------------
// light strips (headlights, taillights, blinkers)
// ---------------------------------------------------------------------------

const STRIP_HEADLIGHT = 1;
const STRIP_TAILLIGHT = 2;
const STRIP_BLINK_LEFT = 3;
const STRIP_BLINK_RIGHT = 4;

function buildLightStrips(type: TrafficVehicleClass, geometries: BufferGeometry[]): BufferGeometry {
  const spec = TRAFFIC_VEHICLE_SPECS[type];
  const L = spec.lengthMeters;
  const W = spec.widthMeters;
  const parts: BufferGeometry[] = [];
  const strip = (
    width: number,
    height: number,
    x: number,
    y: number,
    z: number,
    ry: number,
    id: number,
  ): void => {
    const geometry = new PlaneGeometry(width, height);
    geometry.rotateY(ry);
    geometry.translate(x, y, z);
    const count = geometry.getAttribute('position').count;
    const color = new Float32Array(count * 3);
    for (let v = 0; v < count; v += 1) {
      color[v * 3] = id;
      color[v * 3 + 1] = 0;
      color[v * 3 + 2] = 0;
    }
    geometry.setAttribute('color', new BufferAttribute(color, 3));
    parts.push(geometry);
  };
  const frontZ = -L / 2 - 0.03;
  const rearZ = L / 2 + 0.03;
  const lightY = 0.55;
  strip(0.4, 0.16, -(W / 2 - 0.4), lightY, frontZ, Math.PI, STRIP_HEADLIGHT);
  strip(0.4, 0.16, W / 2 - 0.4, lightY, frontZ, Math.PI, STRIP_HEADLIGHT);
  strip(0.42, 0.18, -(W / 2 - 0.42), lightY, rearZ, 0, STRIP_TAILLIGHT);
  strip(0.42, 0.18, W / 2 - 0.42, lightY, rearZ, 0, STRIP_TAILLIGHT);
  strip(0.3, 0.14, -(W / 2 + 0.02), lightY + 0.1, frontZ + 0.45, -Math.PI / 2, STRIP_BLINK_LEFT);
  strip(0.3, 0.14, W / 2 + 0.02, lightY + 0.1, frontZ + 0.45, Math.PI / 2, STRIP_BLINK_RIGHT);
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (merged === null) throw new Error(`unable to merge light strips for ${type}`);
  geometries.push(merged);
  return merged;
}

function createLightMaterial(
  stateB: StorageInstancedBufferAttribute,
  stateC: StorageInstancedBufferAttribute,
  time: UniformNode<'float', number>,
  nightGain: UniformNode<'float', number>,
  capacity: number,
  baseOffset: number,
  name: string,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = name;
  material.toneMapped = false;
  material.transparent = true;
  material.depthWrite = false;

  const stateBN = storage(stateB, 'vec4', capacity).toReadOnly();
  const stateCN = storage(stateC, 'vec4', capacity).toReadOnly();
  const base = uniform(baseOffset, 'float');
  const index = float(instanceIndex).add(base);
  const pose = stateBN.element(index).toVar();
  const alive = stateCN.element(index).w;
  const stripId = attribute('color', 'vec3').x;

  // 1.6 Hz square blink, per-vehicle phase folded into the blink flags below.
  const phase = float((baseOffset % 7) * 0.13);
  const wave = select(
    fract(time.mul(float(1.6)).add(phase)).lessThan(float(0.55)),
    float(1),
    float(0),
  );

  const headlight = stripId.lessThan(float(1.5));
  const taillight = stripId.greaterThan(float(1.5)).and(stripId.lessThan(float(2.5)));
  const blinkLeft = stripId.greaterThan(float(2.5)).and(stripId.lessThan(float(3.5)));
  const blinkRight = stripId.greaterThan(float(3.5));

  const headColor = vec4(1.0, 0.93, 0.78, 1).mul(mix(float(0.5), float(2.4), nightGain));
  const tailColor = vec4(0.85, 0.05, 0.04, 1)
    .mul(float(0.6).add(pose.y.mul(float(2.2))))
    .mul(mix(float(0.6), float(1.3), nightGain));
  const blinkColor = vec4(1.0, 0.6, 0.05, 1).mul(wave).mul(float(2.6));

  const colour = select(
    headlight,
    headColor,
    select(
      taillight,
      tailColor,
      select(
        blinkLeft.and(pose.z.greaterThan(0.5)),
        blinkColor,
        select(blinkRight.and(pose.w.greaterThan(0.5)), blinkColor, vec4(0, 0, 0, 1)),
      ),
    ),
  );
  material.colorNode = colour.mul(select(alive.greaterThan(float(0.5)), float(1), float(0)));
  material.opacityNode = float(1);
  return material;
}

// ---------------------------------------------------------------------------
// vertex node: the storage-driven instance transform (with the matrix fallback)
// ---------------------------------------------------------------------------

/**
 * TSL node names become GLSL identifiers on the WebGL2 backend: dashes and dots
 * are illegal there (they compile fine in WGSL), so the name must be a plain
 * `[a-zA-Z][a-zA-Z0-9_]*` identifier or every traffic vehicle's vertex shader
 * fails to compile and the fleet never renders on WebGL2 devices.
 */
export function toGlslIdentifier(name: string): string {
  const camel = name.replace(/[-.\s]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
  const cleaned = camel.replace(/[^a-zA-Z0-9_]/g, '');
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned || 'node';
}

function createTrafficVertexNode(
  stateB: StorageInstancedBufferAttribute,
  stateC: StorageInstancedBufferAttribute,
  useStorage: UniformNode<'float', number>,
  capacity: number,
  baseOffset: number,
  name: string,
) {
  const stateBNode = storage(stateB, 'vec4', capacity).toReadOnly();
  const stateCNode = storage(stateC, 'vec4', capacity).toReadOnly();
  const base = uniform(baseOffset, 'float');
  return Fn(() => {
    const index = float(instanceIndex).add(base);
    const pos = stateCNode.element(index).toVar();
    const pose = stateBNode.element(index).toVar();
    const s = sin(pose.x);
    const c = cos(pose.x);
    const local = positionGeometry;
    // rotation.y = yaw maps (x, z) -> (x c + z s, -x s + z c); the vehicle's
    // forward (local -z) lands on (-sin yaw, -cos yaw) in world.
    const rotated = vec3(
      local.x.mul(c).add(local.z.mul(s)),
      local.y,
      local.x.negate().mul(s).add(local.z.mul(c)),
    );
    const storagePosition = cameraProjectionMatrix.mul(
      cameraViewMatrix.mul(vec4(pos.xyz.add(rotated), float(1))),
    );
    const matrixPosition = cameraProjectionMatrix.mul(
      cameraViewMatrix.mul(vec4(positionWorld, float(1))),
    );
    return select(useStorage.greaterThan(float(0.5)), storagePosition, matrixPosition);
  })().setName(toGlslIdentifier(`GpuTraffic.${name}`));
}

// ---------------------------------------------------------------------------
// compute kernel: car following (phase 1) + integration/sampling (phase 2)
// ---------------------------------------------------------------------------

interface TrafficComputeBuffers {
  readonly stateA: StorageInstancedBufferAttribute;
  readonly stateB: StorageInstancedBufferAttribute;
  readonly stateC: StorageInstancedBufferAttribute;
  readonly stateD: StorageInstancedBufferAttribute;
  readonly speedTarget: StorageInstancedBufferAttribute;
  readonly requests: StorageInstancedBufferAttribute;
  readonly vehicleStatic: StorageInstancedBufferAttribute;
  /** Phase 12.2 — per-slot personality (patience, aggression, 0, 0). */
  readonly personality: StorageInstancedBufferAttribute;
  readonly playerLead: StorageInstancedBufferAttribute;
  readonly routeTexture: DataTexture;
  readonly routeMetaTexture: DataTexture;
  readonly dt: UniformNode<'float', number>;
  readonly playerXZ: UniformNode<'vec2', Vector2>;
  /** Phase 12.2 — player world velocity for the obstacle cone. */
  readonly playerVelocityXZ: UniformNode<'vec2', Vector2>;
}

function createTrafficComputeNode(
  buffers: TrafficComputeBuffers,
  capacity: number,
): ComputeNodeLike {
  const stateA = storage(buffers.stateA, 'vec4', capacity);
  const stateB = storage(buffers.stateB, 'vec4', capacity);
  const stateC = storage(buffers.stateC, 'vec4', capacity);
  const stateD = storage(buffers.stateD, 'vec4', capacity);
  const speedTarget = storage(buffers.speedTarget, 'float', capacity);
  const requests = storage(buffers.requests, 'vec4', capacity);
  const vehicleStatic = storage(buffers.vehicleStatic, 'vec4', capacity).toReadOnly();
  const personality = storage(buffers.personality, 'vec4', capacity).toReadOnly();
  const playerLead = storage(buffers.playerLead, 'vec2', capacity).toReadOnly();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSL node graph values.
  type TSLAny = any;
  const metaAt = (routeIdx: TSLAny): TSLAny =>
    texture(
      buffers.routeMetaTexture,
      vec2(routeIdx.add(float(0.5)).div(float(TRAFFIC_MAX_ROUTES)), float(0.5)),
    ) as TSLAny;
  const pointAt = (routeIdx: TSLAny, sample: TSLAny): TSLAny =>
    texture(
      buffers.routeTexture,
      vec2(
        sample.add(float(0.5)).div(float(TRAFFIC_ROUTE_SAMPLES)),
        routeIdx.add(float(0.5)).div(float(TRAFFIC_MAX_ROUTES)),
      ),
    ) as TSLAny;

  const {
    accelMetersPerSecondSquared,
    brakeMetersPerSecondSquared,
    fullSpeedGapMeters,
    stopGapMeters,
    bumperGapMeters,
  } = TRAFFIC_INTEGRATOR;
  const {
    overtakeTriggerGapMeters,
    overtakeLeaderClearMeters,
    overtakeFollowerClearMeters,
    overtakeMinSpeedMetersPerSecond,
    laneChangeCooldownSeconds,
    laneChangeRateMetersPerSecond,
    laneChangeSettleMeters,
    playerAheadMinMeters,
    playerAheadMaxMeters,
    playerHalfLengthMeters,
    playerRecoveryMetersPerSecond,
    playerObstacleMaxMeters,
    playerObstacleLateralMeters,
  } = TRAFFIC_BEHAVIOR;

  return Fn(() => {
    const i = instanceIndex;
    // ----- Phase 1: car-following target speed (reads the previous frame) -----
    const a0 = stateA.element(i).toVar();
    const b0 = stateB.element(i).toVar();
    const c0 = stateC.element(i).toVar();
    const staticI = vehicleStatic.element(i).toVar();
    const d0 = stateD.element(i).toVar();
    const personalityI = personality.element(i).toVar();
    const target = float(0).toVar();
    const wantChange = float(0).toVar();
    If(c0.w.greaterThan(float(0.5)), () => {
      const meta = metaAt(a0.x);
      const routeLen = meta.x;
      const minGap = float(1e6).toVar();
      const otherLead = float(1e6).toVar();
      const otherFollow = float(1e6).toVar();
      Loop(capacity, ({ i: j }) => {
        If(j.notEqual(i), () => {
          const aj = stateA.element(j).toVar();
          const cj = stateC.element(j).toVar();
          If(aj.x.equal(a0.x).and(cj.w.greaterThan(float(0.5))), () => {
            const staticJ = vehicleStatic.element(j).toVar();
            const dAhead = mod(aj.z.sub(a0.z).add(routeLen), routeLen);
            const halfLens = staticJ.x.add(staticI.x).mul(float(0.5)).add(float(bumperGapMeters));
            If(aj.y.equal(a0.y), () => {
              const gap = dAhead.sub(halfLens);
              If(gap.lessThan(minGap), () => {
                minGap.assign(gap);
              });
            });
            // Phase 10.5 pass B: adjacent-lane clearance for the overtake decision.
            If(aj.y.notEqual(a0.y).and(dAhead.lessThan(routeLen.mul(float(0.5)))), () => {
              const gap = dAhead.sub(halfLens);
              If(gap.lessThan(otherLead), () => {
                otherLead.assign(gap);
              });
            });
            If(aj.y.notEqual(a0.y).and(dAhead.greaterThanEqual(routeLen.mul(float(0.5)))), () => {
              const gap = routeLen.sub(dAhead).sub(halfLens);
              If(gap.lessThan(otherFollow), () => {
                otherFollow.assign(gap);
              });
            });
          });
        });
      });
      // Phase 12.2 — patience (personality.x) scales the follower band; the CPU
      // shadow applies the same per-slot value.
      const stopGap = float(stopGapMeters).mul(personalityI.x);
      const fullGap = float(fullSpeedGapMeters).mul(personalityI.x);
      target.assign(
        select(
          minGap.lessThanEqual(stopGap),
          float(0),
          minGap
            .sub(stopGap)
            .div(fullGap.sub(stopGap).max(float(1e-6)))
            .clamp(0, 1)
            .mul(staticI.y),
        ),
      );
      // The cooldown decays before the decision so the CPU shadow (which decays first)
      // and this pass attempt the lane change on the same frame.
      const cooldown = d0.y.sub(buffers.dt).clamp(float(0), float(100));
      If(
        cooldown
          .lessThan(float(0.01))
          .and(a0.w.greaterThan(float(overtakeMinSpeedMetersPerSecond)))
          // Phase 12.2 — aggressiveness (personality.y) scales the trigger gap.
          .and(minGap.lessThan(float(overtakeTriggerGapMeters).mul(personalityI.y)))
          .and(otherLead.greaterThan(float(overtakeLeaderClearMeters)))
          .and(otherFollow.greaterThan(float(overtakeFollowerClearMeters))),
        () => {
          wantChange.assign(float(1));
        },
      );
      // Phase 12.2 — brake for the player inside the forward cone (world space).
      // Mirrors playerObstacleTargetMetersPerSecond; the CPU shadow runs the same
      // cone on this step's pre-integration pose, the previous frame's stateC/B.
      {
        const tx = sin(b0.x).negate();
        const tz = cos(b0.x).negate();
        const rx = buffers.playerXZ.x.sub(c0.x);
        const rz = buffers.playerXZ.y.sub(c0.z);
        const forward = rx.mul(tx).add(rz.mul(tz));
        // Right of travel = (tz, -tx): lateral = rel · right = rx*tz - rz*tx.
        const lateral = rx.mul(tz).sub(rz.mul(tx));
        If(
          forward
            .greaterThan(float(0))
            .and(forward.lessThan(float(playerObstacleMaxMeters)))
            .and(lateral.abs().lessThan(float(playerObstacleLateralMeters))),
          () => {
            const gap = forward
              .sub(staticI.x.mul(float(0.5)))
              .sub(float(playerHalfLengthMeters))
              .sub(float(bumperGapMeters));
            const playerFwd = buffers.playerVelocityXZ.x
              .mul(tx)
              .add(buffers.playerVelocityXZ.y.mul(tz));
            const clearance = gap.sub(float(stopGapMeters)).clamp(float(0), float(1e6));
            const obstacleTarget = playerFwd
              .add(
                clearance
                  .div(float(fullSpeedGapMeters - stopGapMeters))
                  .mul(float(playerRecoveryMetersPerSecond)),
              )
              .clamp(float(0), staticI.y);
            If(obstacleTarget.lessThan(target), () => {
              target.assign(obstacleTarget);
            });
          },
        );
      }
      stateD.element(i).assign(vec4(d0.x, cooldown, float(0), wantChange));
    });
    speedTarget.element(i).assign(target);
    storageBarrier();

    // ----- Phase 2: requests, integration, route sampling -----
    const req = requests.element(i).toVar();
    const flags = req.w;
    const alive = c0.w.toVar();
    const routeIdx = a0.x.toVar();
    const lane = a0.y.toVar();
    const distance = a0.z.toVar();
    const speed = a0.w.toVar();
    const dState = stateD.element(i).toVar();

    If(flags.greaterThan(float(0.5)), () => {
      If(flags.lessThan(float(1.5)), () => {
        // respawn: adopt the requested route/lane/distance; settle straight into the lane.
        routeIdx.assign(req.x);
        lane.assign(req.y);
        distance.assign(req.z);
        speed.assign(float(0));
        alive.assign(float(1));
        stateD
          .element(i)
          .assign(vec4(req.y.mul(float(TRAFFIC_LANE_INSET_METERS)), float(0), float(0), float(0)));
        dState.assign(stateD.element(i));
      });
      If(flags.greaterThan(float(1.5)).and(flags.lessThan(float(2.5))), () => {
        alive.assign(float(0.5));
        speed.assign(float(0));
      });
      If(flags.greaterThan(float(2.5)), () => {
        alive.assign(float(0));
        speed.assign(float(0));
      });
      // The CPU mirror of the request buffer is cleared after the compute; the flag
      // itself is consumed here so a stale upload cannot retrigger.
      requests.element(i).assign(vec4(req.x, req.y, req.z, float(0)));
    });

    // Overtake applied (Phase 10.5 pass B): the flag was set by phase 1 — the CPU
    // shadow flips the same lane on the same frame from the same decision.
    If(dState.w.greaterThan(float(0.5)), () => {
      lane.assign(lane.mul(float(-1)));
      dState.y.assign(float(laneChangeCooldownSeconds));
    });

    const meta = metaAt(routeIdx);
    const routeLen = meta.x;
    const spacing = meta.y;
    const goal = speedTarget.element(i).toVar();
    // Player-aware clamp (Phase 10.5 pass B): the CPU projects the player onto each
    // route; while the player is ahead on this route, cap the target to follow them.
    const lead = playerLead.element(i);
    If(
      alive
        .greaterThan(float(0.5))
        .and(lead.x.greaterThan(float(playerAheadMinMeters)))
        .and(lead.x.lessThan(float(playerAheadMaxMeters))),
      () => {
        const gap = lead.x
          .sub(staticI.x.mul(float(0.5)))
          .sub(float(playerHalfLengthMeters))
          .sub(float(bumperGapMeters));
        const pTarget = lead.y
          .add(
            gap
              .sub(float(stopGapMeters))
              .clamp(float(0), float(1e6))
              .div(float(fullSpeedGapMeters - stopGapMeters))
              .mul(float(playerRecoveryMetersPerSecond)),
          )
          .clamp(float(0), staticI.y);
        If(pTarget.lessThan(goal), () => {
          goal.assign(pTarget);
        });
      },
    );
    const dSpeed = goal
      .sub(speed)
      .clamp(
        float(brakeMetersPerSecondSquared).mul(buffers.dt).negate(),
        float(accelMetersPerSecondSquared).mul(buffers.dt),
      );
    speed.assign(speed.add(dSpeed).clamp(0, float(50)));
    distance.assign(mod(distance.add(speed.mul(buffers.dt)), routeLen));

    // Sample the route LUT (position, yaw) one step ahead for the turn signal.
    const u = distance.div(spacing);
    const u0 = u.floor();
    const f0 = u.fract();
    const p0 = pointAt(routeIdx, u0);
    const p1 = pointAt(routeIdx, u0.add(float(1)));
    const yawDelta0: TSLAny = mx_atan2(sin(p1.w.sub(p0.w)), cos(p1.w.sub(p0.w)));
    const yaw = p0.w.add(yawDelta0.mul(f0));
    // Lateral lane transition toward the (possibly new) lane (Phase 10.5 pass B).
    const targetLateral = lane.mul(float(TRAFFIC_LANE_INSET_METERS));
    const lateralStep = float(laneChangeRateMetersPerSecond).mul(buffers.dt);
    const eased = dState.x.add(
      targetLateral.sub(dState.x).clamp(lateralStep.mul(float(-1)), lateralStep),
    );
    const pos = vec3(
      p0.x.add(p1.x.sub(p0.x).mul(f0)),
      p0.y.add(p1.y.sub(p0.y).mul(f0)),
      p0.z.add(p1.z.sub(p0.z).mul(f0)),
    ).add(vec3(cos(yaw).negate(), float(0), sin(yaw)).mul(eased));
    const uAhead = u.add(float(45).div(spacing));
    const u1 = uAhead.floor();
    const f1 = uAhead.fract();
    const q0 = pointAt(routeIdx, u1);
    const q1 = pointAt(routeIdx, u1.add(float(1)));
    const yawDelta1: TSLAny = mx_atan2(sin(q1.w.sub(q0.w)), cos(q1.w.sub(q0.w)));
    const yawAhead = q0.w.add(yawDelta1.mul(f1));
    const turn: TSLAny = mx_atan2(sin(yawAhead.sub(yaw)), cos(yawAhead.sub(yaw)));
    // In the (forward = -sin yaw, -cos yaw) convention a LEFT turn increases yaw,
    // so a positive lookahead delta is a left turn and a negative one is right.
    // The +lane side is the RIGHT of travel, so a transition toward +lateral blinks right.
    const transitioning = targetLateral.sub(eased).abs().greaterThan(float(laneChangeSettleMeters));
    const blinkLeft = select(
      turn.greaterThan(float(0.3)).or(transitioning.and(targetLateral.lessThan(float(-0.5)))),
      float(1),
      float(0),
    );
    const blinkRight = select(
      turn.lessThan(float(-0.3)).or(transitioning.and(targetLateral.greaterThan(float(0.5)))),
      float(1),
      float(0),
    );
    const brake = goal.sub(speed).div(float(3)).clamp(0, 1);

    stateA.element(i).assign(vec4(routeIdx, lane, distance, speed));
    stateB.element(i).assign(vec4(yaw, brake, blinkLeft, blinkRight));
    stateC
      .element(i)
      .assign(vec4(pos.x, pos.y, pos.z, select(alive.greaterThan(float(0.5)), float(1), alive)));
    stateD.element(i).assign(vec4(eased, dState.y, float(0), float(0)));
  })()
    .compute(capacity, [64])
    .setName('GpuTraffic.step');
}
