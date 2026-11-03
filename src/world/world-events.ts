/**
 * Phase 10.5 (C5) — the world's emergent gameplay: speed traps, drift zones, smashable bonus
 * boards and the off-road jump. Placement is a pure function of the region seed (plan §5) —
 * the same world always plays the same. The manager keeps the player's active region live,
 * resolves trap passes, charges nitro from drifting, and hands the application its impulses,
 * boost deltas and toast messages (all consumed once per frame).
 */
import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
} from 'three';
import { WORLD_EVENTS_CONFIG } from '../config/world-events';
import { REGION_CELL_METERS, type RegionPlan, type WorldPlan } from './world-plan';
import type { RoadEdge, RoadNetwork } from './road-network';

export interface SpeedTrapEvent {
  readonly key: string;
  readonly edgeId: string;
  /** Position along the edge (metres from its `from` end). */
  readonly alongMeters: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Road heading (forward = (-sin yaw, -cos yaw), matching the network). */
  readonly yaw: number;
  readonly lengthMeters: number;
  readonly halfWidthMeters: number;
}

export interface DriftZoneEvent {
  readonly key: string;
  readonly edgeId: string;
  /** Position along the edge (metres from its `from` end). */
  readonly alongMeters: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly lengthMeters: number;
  readonly halfWidthMeters: number;
}

export interface BonusBoardEvent {
  readonly key: string;
  readonly edgeId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export interface RegionEventSet {
  readonly regionId: string;
  readonly speedTraps: readonly SpeedTrapEvent[];
  readonly driftZones: readonly DriftZoneEvent[];
  readonly bonusBoards: readonly BonusBoardEvent[];
}

export interface WorldEventMessage {
  readonly text: string;
  readonly tone: 'info' | 'error';
  /** World-space position of a visual effect (the smash burst), when applicable. */
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
}

/** Deterministic unit in [0, 1) for (a, b, seed) — the project's standard hash. */
function unit(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

interface EdgePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** Point and heading on an edge at metres `alongMeters` from its `from` end. */
function edgePointAt(edge: RoadEdge, alongMeters: number): EdgePoint {
  const points = edge.points;
  const s = Math.max(0, Math.min(edge.lengthMeters, alongMeters));
  let i = 1;
  while (i < points.length - 1 && (points[i]!.alongMeters ?? 0) < s) {
    i += 1;
  }
  const a = points[Math.max(0, i - 1)]!;
  const b = points[Math.min(points.length - 1, i)]!;
  const span = Math.max(1e-3, b.alongMeters - a.alongMeters);
  const t = Math.max(0, Math.min(1, (s - a.alongMeters) / span));
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const z = a.z + (b.z - a.z) * t;
  const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  return { x, y, z, yaw };
}

/**
 * Derive one region's events from its solved road network. Pure in (region, network): the
 * candidate edges are walked in stable (sorted id) order and every choice hashes on the
 * region seed, so the same world always places the same traps, zones and boards.
 */
export function computeRegionEvents(region: RegionPlan, network: RoadNetwork): RegionEventSet {
  const { seed, id: regionId } = region;
  const radius = REGION_CELL_METERS * 0.55;
  // Candidate roads: drivable through streets inside the cell (never alleys or driveways).
  const candidates: RoadEdge[] = [];
  for (const edge of network.edges) {
    const a = network.nodeById(edge.from);
    const b = network.nodeById(edge.to);
    if (a === null || b === null) continue;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    if (Math.hypot(mx - region.centerX, mz - region.centerZ) > radius) continue;
    if (
      edge.roadClass !== 'urban-arterial' &&
      edge.roadClass !== 'urban-local' &&
      edge.roadClass !== 'city-access'
    ) {
      continue;
    }
    if (edge.lengthMeters < 40) continue;
    candidates.push(edge);
  }
  candidates.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  if (candidates.length === 0) {
    return { regionId, speedTraps: [], driftZones: [], bonusBoards: [] };
  }

  const countFor = (salt: number): number => {
    const h = unit(regionId.length + salt, 0x77, seed);
    return h < 0.3 ? 0 : h < 0.8 ? 1 : 2;
  };
  const pickDistinct = (salt: number, count: number): RoadEdge[] => {
    const out: RoadEdge[] = [];
    let guard = 0;
    while (out.length < count && guard < 64) {
      guard += 1;
      const h = unit(regionId.length * 31 + guard, salt, seed);
      const edge = candidates[Math.floor(h * candidates.length)]!;
      if (edge !== undefined && !out.includes(edge)) out.push(edge);
    }
    return out;
  };

  const traps: SpeedTrapEvent[] = [];
  for (const edge of pickDistinct(0x11, countFor(0x11))) {
    const f = 0.35 + unit(edge.lengthMeters, 0x12, seed) * 0.3;
    const at = edgePointAt(edge, f * edge.lengthMeters);
    traps.push({
      key: `${regionId}:${edge.id}:trap`,
      edgeId: edge.id,
      alongMeters: f * edge.lengthMeters,
      x: at.x,
      y: at.y,
      z: at.z,
      yaw: at.yaw,
      lengthMeters: WORLD_EVENTS_CONFIG.speedTrap.zoneLengthMeters,
      halfWidthMeters: edge.halfWidthMeters,
    });
  }

  const zones: DriftZoneEvent[] = [];
  for (const edge of pickDistinct(0x21, countFor(0x21))) {
    if (edge.lengthMeters < 60) continue;
    const lengthMeters = Math.min(
      WORLD_EVENTS_CONFIG.driftZone.zoneLengthMeters,
      Math.max(12, edge.lengthMeters - 16),
    );
    const f = 0.3 + unit(edge.lengthMeters, 0x22, seed) * 0.4;
    const at = edgePointAt(edge, f * edge.lengthMeters);
    zones.push({
      key: `${regionId}:${edge.id}:drift`,
      edgeId: edge.id,
      alongMeters: f * edge.lengthMeters,
      x: at.x,
      y: at.y,
      z: at.z,
      yaw: at.yaw,
      lengthMeters,
      halfWidthMeters: edge.halfWidthMeters,
    });
  }

  const boards: BonusBoardEvent[] = [];
  const boardCount = 1 + (unit(regionId.length + 0x31, 0x32, seed) < 0.5 ? 1 : 0);
  for (const edge of pickDistinct(0x31, boardCount)) {
    const f = 0.3 + unit(edge.lengthMeters, 0x33, seed) * 0.4;
    const at = edgePointAt(edge, f * edge.lengthMeters);
    // The board stands on the right shoulder, clear of the travel lanes.
    const offset = edge.halfWidthMeters + 2.4;
    boards.push({
      key: `${regionId}:${edge.id}:board`,
      edgeId: edge.id,
      x: at.x + Math.cos(at.yaw) * offset,
      y: at.y,
      z: at.z - Math.sin(at.yaw) * offset,
      yaw: at.yaw,
    });
  }

  return { regionId, speedTraps: traps, driftZones: zones, bonusBoards: boards };
}

// ---------------------------------------------------------------------------
// visuals: road ribbons, trap gates and boards (basic/standard, few materials)
// ---------------------------------------------------------------------------

interface RibbonColumn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx: number;
  readonly rz: number;
}

function ribbonColumn(edge: RoadEdge, s: number, halfWidth: number): RibbonColumn | null {
  const points = edge.points;
  const target = Math.max(0, Math.min(edge.lengthMeters, s));
  let i = 1;
  while (i < points.length - 1 && (points[i]!.alongMeters ?? 0) < target) {
    i += 1;
  }
  const a = points[Math.max(0, i - 1)]!;
  const b = points[Math.min(points.length - 1, i)]!;
  const span = Math.max(1e-3, b.alongMeters - a.alongMeters);
  const t = Math.max(0, Math.min(1, (target - a.alongMeters) / span));
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t + 0.06;
  const z = a.z + (b.z - a.z) * t;
  const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  return { x, y, z, rx: Math.cos(yaw) * halfWidth, rz: -Math.sin(yaw) * halfWidth };
}

/**
 * A flat ribbon over a road segment [s0, s1] of `edge`: one column at each solved point in
 * range (plus the exact endpoints), two vertices per column, an indexed triangle strip.
 */
function roadRibbon(
  edge: RoadEdge,
  s0: number,
  s1: number,
  halfWidth: number,
): { geometry: BufferGeometry; material: MeshBasicMaterial } | null {
  if (s1 - s0 < 2) return null;
  const columns: RibbonColumn[] = [];
  const first = ribbonColumn(edge, s0, halfWidth);
  if (first === null) return null;
  columns.push(first);
  for (let i = 1; i < edge.points.length - 1; i += 1) {
    const p = edge.points[i]!;
    const along = p.alongMeters;
    if (along <= s0 + 1e-3 || along >= s1 - 1e-3) continue;
    const column = ribbonColumn(edge, along, halfWidth);
    if (column !== null) columns.push(column);
  }
  const last = ribbonColumn(edge, s1, halfWidth);
  if (last !== null && columns.length > 0) {
    const prev = columns[columns.length - 1]!;
    if (Math.hypot(last.x - prev.x, last.z - prev.z) > 0.5) columns.push(last);
  }
  if (columns.length < 2) return null;
  const positions = new Float32Array(columns.length * 6);
  columns.forEach((c, k) => {
    positions[k * 6] = c.x + c.rx;
    positions[k * 6 + 1] = c.y;
    positions[k * 6 + 2] = c.z + c.rz;
    positions[k * 6 + 3] = c.x - c.rx;
    positions[k * 6 + 4] = c.y;
    positions[k * 6 + 5] = c.z - c.rz;
  });
  const indices: number[] = [];
  for (let k = 0; k < columns.length - 1; k += 1) {
    const o = k * 2;
    indices.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setIndex(indices);
  const material = new MeshBasicMaterial({
    vertexColors: true,
    side: DoubleSide,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  });
  return { geometry, material };
}

class EventVisuals {
  readonly root: Group;
  readonly boardMeshes = new Map<string, Mesh>();
  readonly geometries: BufferGeometry[] = [];
  readonly materials: Material[] = [];

  constructor(name: string) {
    this.root = new Group();
    this.root.name = name;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent();
  }
}

function addRibbon(
  visuals: EventVisuals,
  ribbon: { geometry: BufferGeometry; material: MeshBasicMaterial },
  name: string,
  color: (column: number, side: number) => readonly [number, number, number],
): void {
  const colors = ribbon.geometry.getAttribute('color') as BufferAttribute;
  for (let k = 0; k < colors.count; k += 2) {
    const [r1, g1, b1] = color(k / 2, 0);
    const [r2, g2, b2] = color(k / 2, 1);
    colors.setXYZ(k, r1, g1, b1);
    colors.setXYZ(k + 1, r2, g2, b2);
  }
  colors.needsUpdate = true;
  const mesh = new Mesh(ribbon.geometry, ribbon.material);
  mesh.name = name;
  mesh.frustumCulled = false;
  visuals.root.add(mesh);
  visuals.geometries.push(ribbon.geometry);
  visuals.materials.push(ribbon.material);
}

// ---------------------------------------------------------------------------

interface TrapState {
  state: 'armed' | 'busted' | 'cleared';
  entryS: number;
  entryTime: number;
  hasEntry: boolean;
}

export interface WorldEventCarSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly speedMps: number;
  readonly forwardSpeed: number;
  readonly yaw: number;
  readonly drifting: boolean;
}

/**
 * Keeps the player's active region's events live: resolves speed-trap passes, charges nitro
 * from drifting, smashes boards and launches the off-road jump. The application consumes
 * `consumeMessages`, `consumeBoostDelta` and `consumeImpulse` once per frame.
 */
export class WorldEventManager {
  readonly root: Group;
  #network: RoadNetwork;
  #plan: WorldPlan;
  #terrainHeight: ((x: number, z: number) => number) | null;
  readonly #config = WORLD_EVENTS_CONFIG;
  #activeRegionId: string | null = null;
  #events: RegionEventSet | null = null;
  #trapStates = new Map<string, TrapState>();
  #boardSmashed = new Set<string>();
  #messages: WorldEventMessage[] = [];
  #boostDelta = 0;
  #impulse: { x: number; y: number; z: number } | null = null;
  #jumpCooldownUntil = 0;
  #clock = 0;
  #visuals: EventVisuals | null = null;
  #disposed = false;

  constructor(
    network: RoadNetwork,
    plan: WorldPlan,
    terrainHeight: ((x: number, z: number) => number) | null,
  ) {
    this.#network = network;
    this.#plan = plan;
    this.#terrainHeight = terrainHeight;
    this.root = new Group();
    this.root.name = 'world-events';
  }

  /** The grip multiplier at a world point (the drift zone's modifier inside, 1 otherwise). */
  zoneGripModifier(x: number, z: number): number {
    const events = this.#events;
    if (events === null) return 1;
    for (const zone of events.driftZones) {
      if (this.#lateral(zone.x, zone.z, zone.yaw, x, z) > zone.halfWidthMeters + 1.2) continue;
      const s = this.#along(zone.x, zone.z, zone.yaw, x, z);
      if (Math.abs(s) <= zone.lengthMeters / 2) return this.#config.driftZone.gripModifier;
    }
    return 1;
  }

  #along(cx: number, cz: number, yaw: number, x: number, z: number): number {
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    return (x - cx) * dx + (z - cz) * dz;
  }

  #lateral(cx: number, cz: number, yaw: number, x: number, z: number): number {
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    return Math.abs((x - cx) * rx + (z - cz) * rz);
  }

  update(delta: number, focus: { x: number; z: number }, car: WorldEventCarSample): void {
    if (this.#disposed) return;
    this.#clock += delta;
    const region = this.#plan.regionAt(focus.x, focus.z);
    if (this.#activeRegionId !== region.id) {
      this.#ingestRegion(region);
    }
    const events = this.#events;
    if (events === null) return;

    // Speed traps: arm on entry, resolve on clean exit (a U-turn cancels the run).
    for (const trap of events.speedTraps) {
      const state = this.#trapStates.get(trap.key);
      if (state === undefined || state.state !== 'armed') continue;
      const s = this.#along(trap.x, trap.z, trap.yaw, focus.x, focus.z);
      const lat = this.#lateral(trap.x, trap.z, trap.yaw, focus.x, focus.z);
      const inside =
        Math.abs(s) <= trap.lengthMeters / 2 + 1.2 && lat <= trap.halfWidthMeters + 1.5;
      if (inside) {
        if (!state.hasEntry) {
          state.hasEntry = true;
          state.entryS = s;
          state.entryTime = this.#clock;
        } else if (s < state.entryS - 1.5) {
          state.hasEntry = false; // reversing out: the run is void
        }
      } else if (state.hasEntry) {
        const time = Math.max(0.25, this.#clock - state.entryTime);
        const travelled = Math.abs(s - state.entryS);
        const average = travelled / time;
        const limit = this.#config.speedTrap.speedLimitKph / 3.6;
        state.hasEntry = false;
        state.state = average > limit ? 'busted' : 'cleared';
        if (state.state === 'busted') {
          this.#boostDelta -= this.#config.speedTrap.bustedBoostPenalty;
          this.#messages.push({ text: 'Speed trap busted −30% nitro', tone: 'error' });
        } else {
          this.#boostDelta += this.#config.speedTrap.cleanBoostBonus;
          this.#messages.push({ text: 'Clean pass +8% nitro', tone: 'info' });
        }
      }
    }

    // Drift zones: charge nitro while drifting inside.
    for (const zone of events.driftZones) {
      const s = this.#along(zone.x, zone.z, zone.yaw, focus.x, focus.z);
      const lat = this.#lateral(zone.x, zone.z, zone.yaw, focus.x, focus.z);
      if (
        Math.abs(s) <= zone.lengthMeters / 2 &&
        lat <= zone.halfWidthMeters + 1.2 &&
        car.drifting
      ) {
        this.#boostDelta += this.#config.driftZone.driftBoostPerSecond * delta;
      }
    }

    // Bonus boards: a fast contact smashes them.
    for (const board of events.bonusBoards) {
      if (this.#boardSmashed.has(board.key)) continue;
      const d = Math.hypot(board.x - focus.x, board.z - focus.z);
      if (
        d <= this.#config.bonusBoard.hitRadiusMeters &&
        car.forwardSpeed >= this.#config.bonusBoard.hitSpeedMetersPerSecond
      ) {
        this.#boardSmashed.add(board.key);
        this.#boostDelta += this.#config.bonusBoard.boostBonus;
        const mesh = this.#visuals?.boardMeshes.get(board.key);
        if (mesh !== undefined) mesh.visible = false;
        this.#messages.push({
          text: 'Bonus board smashed +15% nitro',
          tone: 'info',
          position: { x: board.x, y: board.y + 0.8, z: board.z },
        });
      }
    }

    // Off-road jump: a crest ahead at speed launches the car (with a long cooldown).
    const jump = this.#config.offroadJump;
    if (
      this.#clock >= this.#jumpCooldownUntil &&
      car.forwardSpeed >= jump.minForwardSpeedMetersPerSecond &&
      this.#terrainHeight !== null
    ) {
      const fx = -Math.sin(car.yaw);
      const fz = -Math.cos(car.yaw);
      const h0 = this.#terrainHeight(focus.x, focus.z);
      const h1 = this.#terrainHeight(
        focus.x + fx * jump.lookAheadMeters,
        focus.z + fz * jump.lookAheadMeters,
      );
      const grounded = car.y - h0 < 0.7;
      if (grounded && h1 - h0 >= jump.minTerrainRiseMeters) {
        this.#jumpCooldownUntil = this.#clock + jump.cooldownSeconds;
        this.#boostDelta += jump.boostBonus;
        this.#impulse = {
          x: 0,
          y: jump.impulsePerMetersPerSecond * car.forwardSpeed,
          z: 0,
        };
        this.#messages.push({ text: 'Jump! +10% nitro', tone: 'info' });
      }
    }
  }

  #ingestRegion(region: RegionPlan): void {
    this.#activeRegionId = region.id;
    this.#events = computeRegionEvents(region, this.#network);
    this.#trapStates.clear();
    this.#boardSmashed.clear();
    this.#visuals?.dispose();
    const visuals = new EventVisuals(`world-events-${region.id}`);
    const events = this.#events;
    for (const trap of events.speedTraps) {
      this.#trapStates.set(trap.key, { state: 'armed', entryS: 0, entryTime: 0, hasEntry: false });
      this.#addTrapVisual(visuals, trap);
    }
    for (const zone of events.driftZones) {
      this.#addDriftVisual(visuals, zone);
    }
    for (const board of events.bonusBoards) {
      this.#addBoardVisual(visuals, board);
    }
    this.root.add(visuals.root);
    this.#visuals = visuals;
  }

  #edgeByKey(event: { readonly edgeId: string }): RoadEdge | null {
    for (const edge of this.#network.edges) {
      if (edge.id === event.edgeId) return edge;
    }
    return null;
  }

  #addTrapVisual(visuals: EventVisuals, trap: SpeedTrapEvent): void {
    const edge = this.#edgeByKey(trap);
    if (edge !== null) {
      const half = trap.lengthMeters / 2;
      const ribbon = roadRibbon(
        edge,
        Math.max(0, trap.alongMeters - half),
        Math.min(edge.lengthMeters, trap.alongMeters + half),
        trap.halfWidthMeters * 0.92,
      );
      if (ribbon !== null) {
        // A red/white checker down the road marks the enforced stretch.
        addRibbon(visuals, ribbon, 'world-event-trap-ribbon', (column) =>
          column % 2 === 0 ? [0.85, 0.12, 0.1] : [0.95, 0.92, 0.92],
        );
      }
    }
    const postGeo = new BoxGeometry(0.18, 2.4, 0.18);
    const postMat = new MeshStandardMaterial({ color: 0x1c2126, roughness: 0.7, metalness: 0.4 });
    const barGeo = new BoxGeometry(0.12, 0.5, trap.halfWidthMeters * 2 + 1.6);
    const barMat = new MeshStandardMaterial({ color: 0xd8b13c, roughness: 0.5, metalness: 0.3 });
    visuals.geometries.push(postGeo, barGeo);
    visuals.materials.push(postMat, barMat);
    for (const side of [-1, 1]) {
      const rx = Math.cos(trap.yaw);
      const rz = -Math.sin(trap.yaw);
      const post = new Mesh(postGeo, postMat);
      post.position.set(
        trap.x + rx * (trap.halfWidthMeters + 0.9) * side,
        trap.y + 1.2,
        trap.z + rz * (trap.halfWidthMeters + 0.9) * side,
      );
      post.rotation.y = trap.yaw;
      post.name = 'world-event-trap-post';
      post.frustumCulled = false;
      visuals.root.add(post);
    }
    const bar = new Mesh(barGeo, barMat);
    bar.position.set(trap.x, trap.y + 2.5, trap.z);
    bar.rotation.y = trap.yaw;
    bar.name = 'world-event-trap-bar';
    bar.frustumCulled = false;
    visuals.root.add(bar);
  }

  #addDriftVisual(visuals: EventVisuals, zone: DriftZoneEvent): void {
    const edge = this.#edgeByKey(zone);
    if (edge === null) return;
    const half = zone.lengthMeters / 2;
    const ribbon = roadRibbon(
      edge,
      Math.max(0, zone.alongMeters - half),
      Math.min(edge.lengthMeters, zone.alongMeters + half),
      zone.halfWidthMeters * 0.9,
    );
    if (ribbon === null) return;
    ribbon.material.opacity = 0.55;
    addRibbon(visuals, ribbon, 'world-event-drift-ribbon', (_column, side) =>
      side === 0 ? [0.35, 0.55, 0.95] : [0.16, 0.16, 0.95],
    );
  }

  #addBoardVisual(visuals: EventVisuals, board: BonusBoardEvent): void {
    const geo = new BoxGeometry(2.4, 1.4, 0.25);
    const mat = new MeshStandardMaterial({ color: 0xe8542f, roughness: 0.45, metalness: 0.25 });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(board.x, board.y + 0.85, board.z);
    mesh.rotation.y = board.yaw;
    mesh.name = 'world-event-board';
    mesh.frustumCulled = false;
    visuals.root.add(mesh);
    visuals.geometries.push(geo);
    visuals.materials.push(mat);
    visuals.boardMeshes.set(board.key, mesh);
  }

  consumeMessages(): readonly WorldEventMessage[] {
    if (this.#messages.length === 0) return [];
    const out = this.#messages.slice();
    this.#messages.length = 0;
    return out;
  }

  consumeBoostDelta(): number {
    const out = this.#boostDelta;
    this.#boostDelta = 0;
    return out;
  }

  consumeImpulse(): { x: number; y: number; z: number } | null {
    const out = this.#impulse;
    this.#impulse = null;
    return out;
  }

  getContentStats(): Readonly<Record<string, number>> {
    const events = this.#events;
    return {
      worldEventTraps: events?.speedTraps.length ?? 0,
      worldEventDriftZones: events?.driftZones.length ?? 0,
      worldEventBoards: events?.bonusBoards.length ?? 0,
      worldEventBoardsSmashed: this.#boardSmashed.size,
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#visuals?.dispose();
    this.#visuals = null;
    this.root.removeFromParent();
  }
}
