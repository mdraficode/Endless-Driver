/**
 * Phase 10.3 (C3) — the NPC ecosystem: instanced pedestrians on the sidewalks.
 *
 * Hundreds of pedestrians walk the generated city's sidewalks in a single draw call. Each
 * pedestrian is one instance of a low-poly articulated figure; the walk cycle itself runs
 * in the vertex shader (three r186 has no InstancedSkinnedMesh), driven by a per-instance
 * phase attribute the CPU advances. Positions follow the solved road profiles offset to
 * the sidewalk centreline — the same offset the rendered sidewalks use — so feet stay on
 * the pavement the player sees.
 *
 * Behavior: pedestrians walk along street segments, occasionally stop at a junction
 * (the crosswalk moment), pick a continuing street at the junction or turn around, and a
 * share of them cluster at activity nodes — food trucks, vendor stalls and outdoor cafés —
 * loitering in a small orbit before rejoining the flow.
 *
 * Determinism: paths, activity nodes and every agent roll are pure functions of the
 * region seed (plan §5). Streaming: region data enters when the region's massing city is
 * built and leaves when it is released; the instance pool is tier-bounded.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  attribute,
  cos,
  float,
  instancedBufferAttribute,
  instancedDynamicBufferAttribute,
  positionLocal,
  sin,
  uniform,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl';
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  type Node,
  type UniformNode,
} from 'three/webgpu';
import { URBAN_CITY_CONFIG, resolveUrbanNightGain } from '../config/urban-city';
import type { TierId } from '../config/tiers';
import type { DaylightState } from '../environment/EnvironmentClock';
import type { MassingCitySpec } from './city-content';
import type { RoadEdge, RoadNetwork } from './road-network';

/** Same stand-off the rendered sidewalks use (RoadWorld), so feet sit on the pavement. */
const SIDEWALK_LIFT = 0.14;
/** The rendered sidewalk centreline offset beyond the shoulder. */
const SIDEWALK_HALF = URBAN_CITY_CONFIG.sidewalk.widthMeters / 2;
/** Alleys have no pavement; pedestrians walk just inside the kerb line. */
const ALLEY_WALK_OFFSET = 0.9;
/** Junction (crosswalk) stop distance. */
const JUNCTION_STOP_METERS = 9;
const STOP_PROBABILITY = 0.5;
/** After a junction transition, don't re-stop at the same crossing for this long. */
const STOP_COOLDOWN_SECONDS = 3;
/** Home-district reach: the 5×5 kit grid extends ~350 m from the district centre. */
const HOME_REACH_METERS = 520;

export type ActivityNodeKind = 'food-truck' | 'stall' | 'cafe';

export interface SidewalkPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One walkable street side, sampled from the solved profile. */
export interface PedestrianPath {
  readonly points: readonly SidewalkPoint[];
  readonly cumulative: readonly number[];
  readonly length: number;
  readonly startNode: string;
  readonly endNode: string;
  /** The road edge this walk line was offset from. */
  readonly edgeId: string;
}

export interface ActivityNodeSpec {
  readonly id: string;
  readonly kind: ActivityNodeKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Front faces the street. */
  readonly yaw: number;
  /** The sidewalk path the loiterers rejoin, and their spawn point on it. */
  readonly pathIndex: number;
  readonly alongMeters: number;
  readonly loiterCount: number;
  readonly canopyHex: number;
  readonly signHex: number;
  /** Sign placement in the node's local frame (front is +Z). */
  readonly sign: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
    readonly h: number;
  };
}

export interface RegionPedestrianData {
  readonly regionId: string;
  readonly paths: readonly PedestrianPath[];
  /**
   * For every path end (index = pathIndex*2 + end, end 0 = start node, 1 = end node):
   * the neighbouring path ends at the same junction, as (pathIndex, entryEnd) pairs where
   * entryEnd is the end of that path sitting at the junction.
   */
  readonly nextAtEnd: readonly (readonly [number, 0 | 1])[][];
  readonly nodes: readonly ActivityNodeSpec[];
}

/** Integer hash in [0, 1), same family as the layout/placement hashes. */
function pick(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/** A stable per-string seed for region data. */
function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tangentAt(points: readonly SidewalkPoint[], index: number): { x: number; z: number } {
  const previous = points[Math.max(0, index - 1)] as SidewalkPoint;
  const next = points[Math.min(points.length - 1, index + 1)] as SidewalkPoint;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

/** Side direction (centre → right edge) for a tangent: rotate -90° about Y. */
function sideOf(tangent: { x: number; z: number }): { x: number; z: number } {
  return { x: tangent.z, z: -tangent.x };
}

function isWalkableEdge(edge: RoadEdge): boolean {
  return (
    (edge.roadClass === 'urban-local' ||
      edge.roadClass === 'urban-arterial' ||
      edge.roadClass === 'urban-alley') &&
    edge.lengthMeters >= 25 &&
    edge.points.length >= 2
  );
}

/** The sidewalk walk-line for one street side, sampled from the solved profile. */
export function buildPathFromEdge(edge: RoadEdge, side: 1 | -1): PedestrianPath {
  const offset =
    edge.roadClass === 'urban-alley'
      ? edge.halfWidthMeters + ALLEY_WALK_OFFSET
      : edge.halfWidthMeters + edge.shoulderMeters + SIDEWALK_HALF;
  const points: SidewalkPoint[] = edge.points.map((point, index) => {
    const sideVector = sideOf(tangentAt(edge.points, index));
    return {
      x: point.x + sideVector.x * side * offset,
      y: point.y + SIDEWALK_LIFT,
      z: point.z + sideVector.z * side * offset,
    };
  });
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as SidewalkPoint;
    const b = points[i] as SidewalkPoint;
    cumulative.push((cumulative[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return {
    points,
    cumulative,
    length: cumulative[cumulative.length - 1] ?? 0,
    startNode: edge.from,
    endNode: edge.to,
    edgeId: edge.id,
  };
}

/** A point and tangent on a solved edge at a 0..1 fraction of its length. */
function edgeFractionPoint(
  edge: RoadEdge,
  t: number,
): { x: number; z: number; tangent: { x: number; z: number } } {
  const first = edge.points[0] as (typeof edge.points)[number];
  const last = edge.points[edge.points.length - 1] as (typeof edge.points)[number];
  const target = first.alongMeters + (last.alongMeters - first.alongMeters) * t;
  let index = 1;
  while (
    index < edge.points.length - 1 &&
    (edge.points[index] as (typeof edge.points)[number]).alongMeters < target
  ) {
    index += 1;
  }
  const a = edge.points[index - 1] as (typeof edge.points)[number];
  const b = edge.points[index] as (typeof edge.points)[number];
  const span = Math.max(1e-9, b.alongMeters - a.alongMeters);
  const f = Math.min(1, Math.max(0, (target - a.alongMeters) / span));
  return {
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    tangent: tangentAt(edge.points, Math.max(0, index - 1)),
  };
}

const CANOPY_COLORS = [0xc2503f, 0x3f7ec2, 0xd2a53f, 0x4fae6b, 0xb0568f] as const;
const SIGN_COLORS = [0x37e0c8, 0xe08037, 0xd0483e, 0x6b8ff0, 0x8fe037] as const;

function computeActivityNodes(
  regionId: string,
  edges: readonly RoadEdge[],
  pathIndexFor: (edgeIndex: number, side: 1 | -1) => number,
  seed: number,
  count: number,
): ActivityNodeSpec[] {
  // Prefer local streets (the commercial frontage); alleys and arterials rank lower.
  const ranked = edges
    .map((edge, index) => ({
      edge,
      index,
      score: pick(index, 0x51, seed) * (edge.roadClass === 'urban-local' ? 1 : 1.4),
    }))
    .sort((a, b) => a.score - b.score);
  const nodes: ActivityNodeSpec[] = [];
  for (let k = 0; k < count && k < ranked.length; k += 1) {
    const { edge, index } = ranked[k] as (typeof ranked)[number];
    const salt = seed + index * 97;
    const t = 0.3 + 0.4 * pick(index, 0x52, salt);
    const side: 1 | -1 = pick(index, 0x53, salt) < 0.5 ? 1 : -1;
    const { x, z, tangent } = edgeFractionPoint(edge, t);
    const offset =
      edge.roadClass === 'urban-alley'
        ? edge.halfWidthMeters + ALLEY_WALK_OFFSET
        : edge.halfWidthMeters + edge.shoulderMeters + SIDEWALK_HALF;
    const sideVector = sideOf(tangent);
    const firstY = (edge.points[0] as (typeof edge.points)[number]).y;
    const kindRoll = pick(index, 0x54, salt);
    const kind: ActivityNodeKind =
      kindRoll < 0.4 ? 'food-truck' : kindRoll < 0.75 ? 'stall' : 'cafe';
    const canopyHex =
      CANOPY_COLORS[Math.floor(pick(index, 0x55, salt) * CANOPY_COLORS.length)] ?? 0xc2503f;
    const signHex =
      SIGN_COLORS[Math.floor(pick(index, 0x56, salt) * SIGN_COLORS.length)] ?? 0x37e0c8;
    const sign =
      kind === 'food-truck'
        ? { x: 0, y: 2.35, z: 1.38, w: 2.4, h: 0.5 }
        : kind === 'stall'
          ? { x: 0, y: 2.0, z: 1.4, w: 1.8, h: 0.35 }
          : { x: -1.3, y: 2.35, z: 0.2, w: 0.9, h: 0.3 };
    nodes.push({
      id: `${regionId}-node-${k}`,
      kind,
      x: x + sideVector.x * side * (offset + 0.45),
      y: firstY + SIDEWALK_LIFT,
      z: z + sideVector.z * side * (offset + 0.45),
      // Front faces the street (away from the building side).
      yaw: Math.atan2(-sideVector.x * side, -sideVector.z * side),
      pathIndex: pathIndexFor(index, side),
      alongMeters: t * edge.lengthMeters,
      loiterCount: (kind === 'cafe' ? 2 : 3) + (pick(index, 0x57, salt) < 0.3 ? 1 : 0),
      canopyHex,
      signHex,
      sign,
    });
  }
  return nodes;
}

function buildRegionData(
  regionId: string,
  edges: readonly RoadEdge[],
  seed: number,
  nodeCount: number,
): RegionPedestrianData {
  const paths: PedestrianPath[] = [];
  const pathIndexFor = (edgeIndex: number, side: 1 | -1): number =>
    edgeIndex * 2 + (side < 0 ? 0 : 1);
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i] as RoadEdge;
    for (const side of [-1, 1] as const) {
      paths.push(buildPathFromEdge(edge, side));
    }
  }
  // Junction connectivity: every path end at a node connects to the other ends there.
  const endsByNode = new Map<string, { path: number; end: 0 | 1 }[]>();
  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i] as PedestrianPath;
    for (const end of [0, 1] as const) {
      const node = end === 0 ? path.startNode : path.endNode;
      const list = endsByNode.get(node) ?? [];
      list.push({ path: i, end });
      endsByNode.set(node, list);
    }
  }
  const nextAtEnd: (readonly [number, 0 | 1])[][] = new Array(paths.length * 2);
  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i] as PedestrianPath;
    for (const end of [0, 1] as const) {
      const node = end === 0 ? path.startNode : path.endNode;
      const neighbours = (endsByNode.get(node) ?? []).filter(
        (entry) => !(entry.path === i && entry.end === end),
      );
      nextAtEnd[i * 2 + end] = neighbours.map((entry) => [entry.path, entry.end] as const);
    }
  }
  const nodes = computeActivityNodes(regionId, edges, pathIndexFor, seed, nodeCount);
  return { regionId, paths, nextAtEnd, nodes };
}

/**
 * The walkable sidewalks and activity nodes for one streamed massing city: every
 * local/arterial/alley edge inside the district lattice, both sides.
 */
export function computeRegionPedestrians(
  spec: MassingCitySpec,
  network: RoadNetwork,
  seed: number,
): RegionPedestrianData {
  const half = ((spec.gridNodes - 1) / 2) * spec.streetSpacing;
  const reach = half + spec.streetSpacing;
  const edges = network.edges.filter((edge) => {
    if (!isWalkableEdge(edge)) return false;
    const mid = edge.points[Math.floor(edge.points.length / 2)] as (typeof edge.points)[number];
    return Math.hypot(mid.x - spec.x, mid.z - spec.z) <= reach;
  });
  return buildRegionData(spec.regionId, edges, seed, spec.gridNodes >= 9 ? 4 : 3);
}

/**
 * The resident pedestrian network for the home district (the Aohara kit): urban edges
 * around the district centre. Built once — the home city is never streamed out.
 */
export function computeHomePedestrians(
  center: { readonly x: number; readonly z: number },
  network: RoadNetwork,
  seed: number,
): RegionPedestrianData {
  const edges = network.edges.filter((edge) => {
    if (!isWalkableEdge(edge)) return false;
    const mid = edge.points[Math.floor(edge.points.length / 2)] as (typeof edge.points)[number];
    return Math.hypot(mid.x - center.x, mid.z - center.z) <= HOME_REACH_METERS;
  });
  return buildRegionData('home', edges, seed, 4);
}

// --- The instanced figure ---------------------------------------------------------

/**
 * The pedestrian figure: six boxes (head, torso, two legs, two arms) merged into one
 * geometry. Each vertex carries its part's pivot and swing weight; the walk cycle is a
 * per-part rotation about the X axis driven by the per-instance phase in the shader.
 * Origin at the feet, +Z forward, ~1.72 m tall.
 */
function buildFigureGeometry(): BufferGeometry {
  interface Part {
    readonly size: [number, number, number];
    readonly center: [number, number, number];
    readonly pivot: [number, number, number];
    readonly swing: number;
    readonly tint: [number, number, number];
  }
  const parts: Part[] = [
    {
      size: [0.22, 0.24, 0.22],
      center: [0, 1.6, 0],
      pivot: [0, 1.6, 0],
      swing: 0,
      tint: [1.2, 1.08, 0.98],
    },
    {
      size: [0.36, 0.62, 0.24],
      center: [0, 1.18, 0],
      pivot: [0, 1.18, 0],
      swing: 0,
      tint: [1, 1, 1],
    },
    {
      size: [0.1, 0.56, 0.12],
      center: [-0.24, 1.14, 0],
      pivot: [-0.24, 1.42, 0],
      swing: -0.6,
      tint: [1, 1, 1],
    },
    {
      size: [0.1, 0.56, 0.12],
      center: [0.24, 1.14, 0],
      pivot: [0.24, 1.42, 0],
      swing: 0.6,
      tint: [1, 1, 1],
    },
    {
      size: [0.14, 0.88, 0.16],
      center: [-0.09, 0.42, 0],
      pivot: [-0.09, 0.86, 0],
      swing: 1,
      tint: [0.45, 0.45, 0.5],
    },
    {
      size: [0.14, 0.88, 0.16],
      center: [0.09, 0.42, 0],
      pivot: [0.09, 0.86, 0],
      swing: -1,
      tint: [0.45, 0.45, 0.5],
    },
  ];
  const geometries: BufferGeometry[] = parts.map((part) => {
    const geometry = new BoxGeometry(...part.size);
    geometry.translate(...part.center);
    const vertexCount = geometry.getAttribute('position').count;
    const pivot = new Float32Array(vertexCount * 3);
    const swing = new Float32Array(vertexCount);
    const tint = new Float32Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v += 1) {
      pivot[v * 3] = part.pivot[0];
      pivot[v * 3 + 1] = part.pivot[1];
      pivot[v * 3 + 2] = part.pivot[2];
      swing[v] = part.swing;
      tint[v * 3] = part.tint[0];
      tint[v * 3 + 1] = part.tint[1];
      tint[v * 3 + 2] = part.tint[2];
    }
    geometry.setAttribute('pivot', new BufferAttribute(pivot, 3));
    geometry.setAttribute('swing', new BufferAttribute(swing, 1));
    geometry.setAttribute('color', new BufferAttribute(tint, 3));
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (merged === null) {
    throw new Error('pedestrian figure merge failed');
  }
  merged.computeBoundingSphere();
  return merged;
}

/**
 * The walk cycle: each vertex swings about its part pivot by sin(phase)·0.5·swing.
 * Returns the displaced local position for `material.positionNode`.
 */
function buildWalkPositionNode(phase: Node<'float'>): Node<'vec3'> {
  const pos = positionLocal;
  const pivot = attribute('pivot', 'vec3');
  const swing = attribute('swing', 'float');
  const angle = sin(phase).mul(0.5).mul(swing);
  const c = cos(angle);
  const s = sin(angle);
  const dy = pos.y.sub(pivot.y);
  const dz = pos.z.sub(pivot.z);
  return pos.add(
    vec3(float(0), dy.mul(c).sub(dz.mul(s)).sub(dy), dy.mul(s).add(dz.mul(c)).sub(dz)),
  );
}

const CLOTHING_COLORS = [
  0x8a4b3c, 0x3c4b8a, 0x566b52, 0x6b5260, 0x7a6f57, 0x44586e, 0x946b52, 0x5f5f66, 0x6e4a4a,
  0x4a6e5f,
] as const;

const AGENT_BUDGET: Readonly<Record<TierId, number>> = { A: 480, B: 300, C: 160 };
const REGION_AGENT_TARGET: Readonly<Record<TierId, number>> = { A: 80, B: 55, C: 26 };
const HOME_AGENT_TARGET: Readonly<Record<TierId, number>> = { A: 50, B: 35, C: 18 };

interface Agent {
  readonly id: number;
  readonly regionId: string;
  path: number;
  dir: 1 | -1;
  distance: number;
  speed: number;
  phase: number;
  state: 'walk' | 'wait' | 'loiter';
  stateUntil: number;
  stopCooldownUntil: number;
  loiterX: number;
  loiterZ: number;
  loiterRadius: number;
  loiterAngle: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  scale: number;
  colorR: number;
  colorG: number;
  colorB: number;
}

/** Test/debug view of the simulation. */
export interface PedestrianSimulationSnapshot {
  readonly clock: number;
  readonly agents: readonly {
    readonly state: 'walk' | 'wait' | 'loiter';
    readonly distance: number;
    readonly x: number;
    readonly z: number;
  }[];
}

export interface PedestrianWorldOptions {
  readonly tier: TierId;
  readonly network: RoadNetwork | null;
  /** The resident home-district network (built once, never streamed out). */
  readonly home?: RegionPedestrianData | null;
}

interface RegionVisuals {
  readonly structureMesh: Mesh | null;
  readonly signMesh: Mesh | null;
  readonly structureGeometry: BufferGeometry | null;
  readonly signGeometry: BufferGeometry | null;
}

export class PedestrianWorld {
  readonly root = new Group();
  readonly #tier: TierId;
  readonly #capacity: number;
  readonly #nightGain: UniformNode<'float', number>;

  readonly #figureGeometry: BufferGeometry;
  readonly #figureMaterial: MeshPhysicalNodeMaterial;
  readonly #structureMaterial: MeshPhysicalNodeMaterial;
  readonly #signMaterial: MeshBasicNodeMaterial;
  readonly #phaseAttribute: InstancedBufferAttribute;
  readonly #colorAttribute: InstancedBufferAttribute;
  readonly #figureMesh: InstancedMesh;

  readonly #agents: Agent[] = [];
  #agentId = 0;
  readonly #paths: PedestrianPath[] = [];
  readonly #nextAtEnd: (readonly [number, 0 | 1])[][] = [];
  readonly #regionPaths = new Map<string, { readonly start: number; readonly count: number }>();
  readonly #regionVisuals = new Map<string, RegionVisuals>();
  #clock = 0;
  #disposed = false;

  constructor(options: PedestrianWorldOptions) {
    this.#tier = options.tier;
    this.#capacity = AGENT_BUDGET[options.tier] ?? 160;
    this.root.name = 'pedestrians';
    this.#nightGain = uniform(1);

    this.#figureGeometry = buildFigureGeometry();
    const phaseAttr = new InstancedBufferAttribute(new Float32Array(this.#capacity), 1);
    phaseAttr.setUsage(DynamicDrawUsage);
    const colorAttr = new InstancedBufferAttribute(new Float32Array(this.#capacity * 3), 3);
    this.#phaseAttribute = phaseAttr;
    this.#colorAttribute = colorAttr;
    this.#figureGeometry.setAttribute('aPhase', phaseAttr);
    this.#figureGeometry.setAttribute('aColor', colorAttr);

    this.#figureMaterial = new MeshPhysicalNodeMaterial();
    this.#figureMaterial.name = 'pedestrian-figure-shared';
    this.#figureMaterial.roughness = 0.85;
    this.#figureMaterial.metalness = 0.02;
    this.#figureMaterial.colorNode = vec4(
      vertexColor().mul(instancedBufferAttribute(colorAttr, 'vec3')),
      1,
    );
    this.#figureMaterial.positionNode = buildWalkPositionNode(
      instancedDynamicBufferAttribute(phaseAttr, 'float'),
    );

    this.#structureMaterial = new MeshPhysicalNodeMaterial();
    this.#structureMaterial.name = 'pedestrian-structure-shared';
    this.#structureMaterial.roughness = 0.8;
    this.#structureMaterial.metalness = 0.15;
    this.#structureMaterial.colorNode = vec4(vertexColor(), 1);

    this.#signMaterial = new MeshBasicNodeMaterial();
    this.#signMaterial.name = 'pedestrian-sign-shared';
    this.#signMaterial.toneMapped = false;
    this.#signMaterial.colorNode = vec4(vertexColor().mul(this.#nightGain).mul(1.5), 1);

    this.#figureMesh = new InstancedMesh(
      this.#figureGeometry,
      this.#figureMaterial,
      this.#capacity,
    );
    this.#figureMesh.name = 'pedestrian-figures';
    this.#figureMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.#figureMesh.frustumCulled = false;
    this.#figureMesh.count = 0;
    // Park the unused instances at zero scale.
    const zero = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.#capacity; i += 1) {
      this.#figureMesh.setMatrixAt(i, zero);
    }
    this.#figureMesh.instanceMatrix.needsUpdate = true;
    this.root.add(this.#figureMesh);

    if (options.home !== undefined && options.home !== null) {
      this.setRegion(options.home);
    }
  }

  setDaylight(state: DaylightState): void {
    this.#nightGain.value = resolveUrbanNightGain(state.sunElevationDegrees);
  }

  /**
   * Registers one region's walkable data and spawns its agents. Re-registering a region
   * (a revisit after streaming out) reuses the pooled paths and respawns agents and props.
   */
  setRegion(data: RegionPedestrianData): void {
    if (this.#disposed) return;
    const existing = this.#regionPaths.get(data.regionId);
    if (existing === undefined) {
      const start = this.#paths.length;
      for (const path of data.paths) {
        this.#paths.push(path);
      }
      for (let i = 0; i < data.nextAtEnd.length; i += 1) {
        this.#nextAtEnd.push(data.nextAtEnd[i] as (readonly [number, 0 | 1])[]);
      }
      this.#regionPaths.set(data.regionId, { start, count: data.paths.length });
    }
    this.#clearAgents(data.regionId);
    this.#disposeRegionVisuals(data.regionId);
    this.#buildRegionVisuals(data);
    this.#spawnAgents(data);
  }

  clearRegion(regionId: string): void {
    if (this.#disposed) return;
    this.#clearAgents(regionId);
    this.#disposeRegionVisuals(regionId);
  }

  /** Advances the simulation and refreshes the instance buffers. */
  update(deltaSeconds: number): void {
    if (this.#disposed) return;
    const dt = Math.min(0.05, Math.max(0, deltaSeconds));
    if (dt === 0 || this.#agents.length === 0) {
      return;
    }
    this.#clock += dt;
    const transform = new Object3D();
    const up = new Vector3(0, 1, 0);
    const colorArray = this.#colorAttribute.array as Float32Array;
    const phaseArray = this.#phaseAttribute.array as Float32Array;
    for (let i = 0; i < this.#agents.length; i += 1) {
      const agent = this.#agents[i] as Agent;
      const path = this.#paths[agent.path] as PedestrianPath;
      if (agent.state === 'walk') {
        const endKey = agent.dir > 0 ? 1 : 0;
        const endDistance = agent.dir > 0 ? path.length - agent.distance : agent.distance;
        if (
          endDistance < JUNCTION_STOP_METERS &&
          this.#clock >= agent.stopCooldownUntil &&
          pick(agent.id, agent.path * 2 + endKey, 0x5eed) < STOP_PROBABILITY
        ) {
          agent.state = 'wait';
          agent.stateUntil =
            this.#clock + 0.8 + pick(agent.id, agent.path * 2 + endKey + 7, 0x5eed) * 2.5;
        } else {
          agent.distance += agent.dir * agent.speed * dt;
          agent.phase += (agent.speed / 0.72) * Math.PI * 2 * dt;
        }
        if (agent.state === 'walk' && agent.dir > 0 && agent.distance >= path.length) {
          agent.distance = path.length;
          this.#transition(agent, 1);
        } else if (agent.state === 'walk' && agent.dir < 0 && agent.distance <= 0) {
          agent.distance = 0;
          this.#transition(agent, 0);
        }
      } else if (agent.state === 'wait') {
        if (this.#clock >= agent.stateUntil) {
          const endKey = agent.dir > 0 ? 1 : 0;
          const endDistance = agent.dir > 0 ? path.length - agent.distance : agent.distance;
          agent.state = 'walk';
          if (endDistance < JUNCTION_STOP_METERS) {
            this.#transition(agent, endKey);
          }
        }
      } else {
        // Loitering: a slow orbit around the activity node.
        agent.loiterAngle += 0.25 * dt;
        agent.phase += 0.9 * dt;
        if (this.#clock >= agent.stateUntil) {
          agent.state = 'walk';
          agent.stopCooldownUntil = this.#clock + STOP_COOLDOWN_SECONDS;
        }
      }
      if (agent.state === 'loiter') {
        agent.x = agent.loiterX + Math.cos(agent.loiterAngle) * agent.loiterRadius;
        agent.z = agent.loiterZ + Math.sin(agent.loiterAngle) * agent.loiterRadius;
      } else {
        const sample = samplePath(path, agent.distance);
        agent.x = sample.x;
        agent.y = sample.y;
        agent.z = sample.z;
        agent.heading = Math.atan2(sample.tx * agent.dir, sample.tz * agent.dir);
      }
      transform.position.set(agent.x, agent.y, agent.z);
      transform.scale.setScalar(agent.scale);
      transform.quaternion.setFromAxisAngle(up, agent.heading);
      transform.updateMatrix();
      this.#figureMesh.setMatrixAt(i, transform.matrix);
      phaseArray[i] = agent.phase;
      colorArray[i * 3] = agent.colorR;
      colorArray[i * 3 + 1] = agent.colorG;
      colorArray[i * 3 + 2] = agent.colorB;
    }
    this.#figureMesh.count = this.#agents.length;
    this.#figureMesh.instanceMatrix.needsUpdate = true;
    this.#phaseAttribute.needsUpdate = true;
    this.#colorAttribute.needsUpdate = true;
  }

  getContentStats(): Readonly<Record<string, number>> {
    let loiterers = 0;
    for (const agent of this.#agents) {
      if (agent.state === 'loiter') loiterers += 1;
    }
    return {
      pedestrianAgents: this.#agents.length,
      pedestrianLoiterers: loiterers,
      pedestrianNodes: this.#regionVisuals.size,
    };
  }

  /** Test hook: the live agent states. */
  getSimulationSnapshot(): PedestrianSimulationSnapshot {
    return {
      clock: this.#clock,
      agents: this.#agents.map((agent) => ({
        state: agent.state,
        distance: agent.distance,
        x: agent.x,
        z: agent.z,
      })),
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const regionId of [...this.#regionVisuals.keys()]) {
      this.#disposeRegionVisuals(regionId);
    }
    this.#figureGeometry.dispose();
    this.#figureMaterial.dispose();
    this.#structureMaterial.dispose();
    this.#signMaterial.dispose();
    this.#nightGain.dispose?.();
    this.root.removeFromParent();
  }

  /** Jumps an arriving agent onto a continuing street, or turns it around. */
  #transition(agent: Agent, end: 0 | 1): void {
    const path = this.#paths[agent.path] as PedestrianPath;
    const candidates = this.#nextAtEnd[agent.path * 2 + end] ?? [];
    if (candidates.length === 0) {
      agent.dir = agent.dir === 1 ? -1 : 1;
      agent.distance = end === 1 ? path.length - 0.05 : 0.05;
      agent.stopCooldownUntil = this.#clock + STOP_COOLDOWN_SECONDS;
      return;
    }
    // Prefer continuing in roughly the same direction; a few pedestrians cross the street.
    const tangent = tangentAt(path.points, end === 1 ? path.points.length - 1 : 0);
    const incomingX = tangent.x * agent.dir;
    const incomingZ = tangent.z * agent.dir;
    let pool: readonly (readonly [number, 0 | 1])[] = candidates;
    if (pick(agent.id, agent.path * 13 + end, 0x5eed) < 0.8) {
      const continuing = candidates.filter(([pathIndex, entryEnd]) => {
        const other = this.#paths[pathIndex] as PedestrianPath;
        const t = tangentAt(other.points, entryEnd === 1 ? other.points.length - 1 : 0);
        const outX = entryEnd === 0 ? t.x : -t.x;
        const outZ = entryEnd === 0 ? t.z : -t.z;
        return incomingX * outX + incomingZ * outZ > 0.2;
      });
      if (continuing.length > 0) pool = continuing;
    }
    const choice =
      pool[Math.floor(pick(agent.id, agent.path * 31 + end * 7 + 3, 0x5eed) * pool.length)];
    if (choice === undefined) return;
    const [pathIndex, entryEnd] = choice;
    const nextPath = this.#paths[pathIndex] as PedestrianPath;
    agent.path = pathIndex;
    agent.dir = entryEnd === 0 ? 1 : -1;
    agent.distance = entryEnd === 0 ? 0.05 : nextPath.length - 0.05;
    agent.stopCooldownUntil = this.#clock + STOP_COOLDOWN_SECONDS;
  }

  #clearAgents(regionId: string): void {
    for (let i = this.#agents.length - 1; i >= 0; i -= 1) {
      if ((this.#agents[i] as Agent).regionId === regionId) {
        const last = this.#agents[this.#agents.length - 1] as Agent;
        this.#agents[i] = last;
        this.#agents.pop();
      }
    }
  }

  #spawnAgents(data: RegionPedestrianData): void {
    const target =
      data.regionId === 'home' ? HOME_AGENT_TARGET[this.#tier] : REGION_AGENT_TARGET[this.#tier];
    const capacityLeft = this.#capacity - this.#agents.length;
    if (capacityLeft <= 0 || data.paths.length === 0) return;
    const seed = seedFromId(data.regionId);
    const count = Math.min(target, capacityLeft, data.paths.length * 4);
    let spawned = 0;
    // Loiterers first (tied to the activity nodes), then the street flow.
    for (const node of data.nodes) {
      for (let l = 0; l < node.loiterCount && spawned < count; l += 1) {
        const salt = seedFromId(node.id) + l * 13;
        const roll = pick(salt, 0x66, 0x5eed);
        this.#addAgent({
          regionId: data.regionId,
          path: node.pathIndex,
          dir: pick(salt, 0x67, 0x5eed) < 0.5 ? 1 : -1,
          distance: node.alongMeters,
          speed: 0.9 + pick(salt, 0x68, 0x5eed) * 0.4,
          phase: roll * Math.PI * 2,
          state: 'loiter',
          stateUntil: this.#clock + 10 + pick(salt, 0x69, 0x5eed) * 30,
          stopCooldownUntil: 0,
          loiterX: node.x,
          loiterZ: node.z,
          loiterRadius: 1.2 + pick(salt, 0x6a, 0x5eed) * 1.4,
          loiterAngle: roll * Math.PI * 2,
          x: node.x,
          y: node.y,
          z: node.z,
          heading: node.yaw,
          scale: 0.92 + pick(salt, 0x6b, 0x5eed) * 0.16,
        });
        spawned += 1;
      }
    }
    for (let i = 0; i + spawned < count; i += 1) {
      const salt = seed + 1000 + i * 17;
      const pathIndex = Math.floor(pick(salt, 0x61, 0x5eed) * data.paths.length);
      const path = data.paths[pathIndex] as PedestrianPath;
      this.#addAgent({
        regionId: data.regionId,
        path: pathIndex,
        dir: pick(salt, 0x63, 0x5eed) < 0.5 ? 1 : -1,
        distance: pick(salt, 0x62, 0x5eed) * path.length,
        speed: 1.05 + pick(salt, 0x64, 0x5eed) * 0.55,
        phase: pick(salt, 0x60, 0x5eed) * Math.PI * 2,
        state: 'walk',
        stateUntil: 0,
        stopCooldownUntil: 0,
        loiterX: 0,
        loiterZ: 0,
        loiterRadius: 0,
        loiterAngle: 0,
        x: 0,
        y: 0,
        z: 0,
        heading: 0,
        scale: 0.92 + pick(salt, 0x65, 0x5eed) * 0.16,
      });
      spawned += 1;
    }
  }

  #addAgent(init: Omit<Agent, 'id' | 'colorR' | 'colorG' | 'colorB'>): void {
    if (this.#agents.length >= this.#capacity) return;
    const id = this.#agentId;
    this.#agentId += 1;
    const hex =
      CLOTHING_COLORS[Math.floor(pick(id, 0x6c, 0x5eed) * CLOTHING_COLORS.length)] ?? 0x5f5f66;
    const color = new Color(hex);
    this.#agents.push({ ...init, id, colorR: color.r, colorG: color.g, colorB: color.b });
  }

  #buildRegionVisuals(data: RegionPedestrianData): void {
    const structureBoxes: BufferGeometry[] = [];
    const signBoxes: BufferGeometry[] = [];
    const addBox = (
      size: [number, number, number],
      center: [number, number, number],
      hex: number,
      node: ActivityNodeSpec,
      target: BufferGeometry[],
    ): void => {
      const geometry = new BoxGeometry(...size);
      const color = new Color(hex);
      const vertexCount = geometry.getAttribute('position').count;
      const tint = new Float32Array(vertexCount * 3);
      for (let v = 0; v < vertexCount; v += 1) {
        tint[v * 3] = color.r;
        tint[v * 3 + 1] = color.g;
        tint[v * 3 + 2] = color.b;
      }
      geometry.setAttribute('color', new BufferAttribute(tint, 3));
      geometry.rotateY(node.yaw);
      geometry.translate(node.x, node.y + center[1], node.z);
      target.push(geometry);
    };
    for (const node of data.nodes) {
      const dark = 0x2e343b;
      if (node.kind === 'food-truck') {
        addBox([5.6, 0.6, 2.4], [0, 0.55, 0], dark, node, structureBoxes);
        addBox([6.0, 2.2, 2.6], [0, 1.9, 0], 0x77808a, node, structureBoxes);
        addBox([5.6, 0.8, 0.08], [0, 1.9, 1.31], 0x333a42, node, structureBoxes);
        addBox([6.2, 0.12, 1.3], [0, 2.75, 2.0], node.canopyHex, node, structureBoxes);
        addBox([0.08, 0.9, 0.08], [2.8, 2.3, 2.55], dark, node, structureBoxes);
        addBox([0.08, 0.9, 0.08], [-2.8, 2.3, 2.55], dark, node, structureBoxes);
      } else if (node.kind === 'stall') {
        for (const px of [-1.3, 1.3]) {
          for (const pz of [-1.3, 1.3]) {
            addBox([0.08, 2.2, 0.08], [px, 1.1, pz], dark, node, structureBoxes);
          }
        }
        addBox([3.0, 0.08, 3.0], [0, 2.25, 0], node.canopyHex, node, structureBoxes);
        addBox([1.6, 0.08, 0.9], [0, 0.82, 0.3], 0x6e5a43, node, structureBoxes);
        addBox([0.5, 0.8, 0.5], [0, 0.4, 0.3], dark, node, structureBoxes);
        addBox([0.5, 0.5, 0.5], [1.0, 0.25, 0.9], 0x5a5148, node, structureBoxes);
        addBox([0.5, 0.5, 0.5], [-1.0, 0.25, 0.9], 0x5a5148, node, structureBoxes);
      } else {
        for (const tx of [-1.3, 1.3]) {
          addBox([1.1, 0.07, 1.1], [tx, 0.72, 0.2], 0x6e5a43, node, structureBoxes);
          addBox([0.08, 0.72, 0.08], [tx, 0.36, 0.2], dark, node, structureBoxes);
          for (const cx of [tx - 0.85, tx + 0.85]) {
            addBox([0.45, 0.5, 0.45], [cx, 0.25, 0.2], 0x44586e, node, structureBoxes);
          }
        }
        addBox([0.06, 2.6, 0.06], [-1.3, 1.3, 0.2], dark, node, structureBoxes);
        addBox([2.4, 0.07, 2.4], [-1.3, 2.6, 0.2], node.canopyHex, node, structureBoxes);
      }
      addBox(
        [node.sign.w, node.sign.h, 0.1],
        [node.sign.x, node.sign.y, node.sign.z],
        node.signHex,
        node,
        signBoxes,
      );
    }
    const structureGeometry = mergeGeometries(structureBoxes, false);
    for (const box of structureBoxes) box.dispose();
    const signGeometry = signBoxes.length > 0 ? mergeGeometries(signBoxes, false) : null;
    for (const box of signBoxes) box.dispose();
    let structureMesh: Mesh | null = null;
    let signMesh: Mesh | null = null;
    if (structureGeometry !== null) {
      structureGeometry.computeBoundingSphere();
      structureMesh = new Mesh(structureGeometry, this.#structureMaterial);
      structureMesh.name = `pedestrian-structure-${data.regionId}`;
      structureMesh.castShadow = false;
      structureMesh.receiveShadow = true;
      structureMesh.frustumCulled = false;
      this.root.add(structureMesh);
    }
    if (signGeometry !== null) {
      signGeometry.computeBoundingSphere();
      signMesh = new Mesh(signGeometry, this.#signMaterial);
      signMesh.name = `pedestrian-signs-${data.regionId}`;
      signMesh.frustumCulled = false;
      this.root.add(signMesh);
    }
    this.#regionVisuals.set(data.regionId, {
      structureMesh,
      signMesh,
      structureGeometry,
      signGeometry,
    });
  }

  #disposeRegionVisuals(regionId: string): void {
    const visuals = this.#regionVisuals.get(regionId);
    if (visuals === undefined) return;
    visuals.structureGeometry?.dispose();
    visuals.signGeometry?.dispose();
    visuals.structureMesh?.removeFromParent();
    visuals.signMesh?.removeFromParent();
    this.#regionVisuals.delete(regionId);
  }
}

/** A point and horizontal tangent on a path at a distance along it. */
function samplePath(
  path: PedestrianPath,
  distance: number,
): { x: number; y: number; z: number; tx: number; tz: number } {
  const d = Math.min(path.length, Math.max(0, distance));
  const cumulative = path.cumulative;
  let low = 0;
  let high = cumulative.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if ((cumulative[middle] ?? 0) <= d) low = middle;
    else high = middle;
  }
  const a = path.points[low] as SidewalkPoint;
  const b = path.points[Math.min(low + 1, path.points.length - 1)] as SidewalkPoint;
  const span = Math.max(1e-9, (cumulative[high] ?? 0) - (cumulative[low] ?? 0));
  const t = Math.min(1, Math.max(0, (d - (cumulative[low] ?? 0)) / span));
  const tx = b.x - a.x;
  const tz = b.z - a.z;
  const length = Math.hypot(tx, tz) || 1;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    tx: tx / length,
    tz: tz / length,
  };
}
