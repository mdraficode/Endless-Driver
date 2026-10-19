import {
  AdditiveBlending,
  BoxGeometry,
  Color,
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
  type UniformNode,
} from 'three/webgpu';
import { abs, exp, float, mix, uniform, uv, vec3, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  resolveTrafficSignalAspect,
  resolveUrbanNightGain,
  resolveUrbanStreetLightCoverage,
  resolveUrbanWetness,
  URBAN_CITY_CONFIG,
  URBAN_NIGHT_TIER_BUDGET,
  type TrafficSignalAspect,
} from '../config/urban-city';
import {
  AOHARA_DISTRICT_CONFIG,
  AOHARA_GRID_COLUMNS,
  AOHARA_GRID_ROWS,
} from '../config/urban-district';
import type { TierId } from '../config/tiers';
import type { DaylightState } from '../environment/EnvironmentClock';
import { collideCarWithStaticBoxes, type StaticBuildingBox } from './static-building-collision';
import type { RoadNetwork } from './road-network';
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
  { x: -31, z: -56, width: 22, depth: 26, height: 58, color: 0x27333e },
  { x: -31, z: -25, width: 22, depth: 25, height: 82, color: 0x202b36 },
  { x: -31, z: 25, width: 23, depth: 27, height: 68, color: 0x30343e },
  { x: -31, z: 56, width: 24, depth: 27, height: 100, color: 0x202b36 },
  { x: 31, z: -55, width: 23, depth: 26, height: 74, color: 0x27333e },
  { x: 31, z: -24, width: 25, depth: 25, height: 96, color: 0x202b36 },
  { x: 31, z: 25, width: 22, depth: 27, height: 54, color: 0x30343e },
  { x: 31, z: 56, width: 24, depth: 28, height: 86, color: 0x27333e },
];

const SIGNAL_ASPECTS: readonly TrafficSignalAspect[] = ['red', 'amber', 'green'];
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

function createBasicMaterial(color: number, name: string): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.color.setHex(color);
  material.name = name;
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
    dummy.scale.set(1, 1, 1);
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

function createWindowInstances(
  root: Group,
  nightGain: UniformNode<'float', number>,
  budget: number,
  towers: readonly TowerSpec[],
): number {
  const candidates: Array<
    TransformSpec & { readonly rank: number; readonly tone: 'warm' | 'cool' }
  > = [];
  for (let towerIndex = 0; towerIndex < towers.length; towerIndex += 1) {
    const tower = towers[towerIndex]!;
    const side = tower.x < 0 ? -1 : 1;
    const faceX = tower.x - side * (tower.width / 2 + 0.08);
    const floors = Math.floor((tower.height - 6) / URBAN_CITY_CONFIG.window.floorSpacingMeters);
    const columns = Math.max(
      2,
      Math.floor(
        (tower.depth - 2 * URBAN_CITY_CONFIG.window.facadeMarginMeters) /
          URBAN_CITY_CONFIG.window.columnSpacingMeters,
      ),
    );
    for (let floor = 1; floor < floors; floor += 1) {
      for (let column = 0; column < columns; column += 1) {
        const on = stableUnit(towerIndex, floor * 31 + column, 17);
        if (on < 0.31) {
          continue;
        }
        const rank = stableUnit(towerIndex * 101 + floor, column, 59);
        const z =
          tower.z -
          tower.depth / 2 +
          URBAN_CITY_CONFIG.window.facadeMarginMeters +
          column * URBAN_CITY_CONFIG.window.columnSpacingMeters;
        const y = WORLD_BASE_Y + 3.1 + floor * URBAN_CITY_CONFIG.window.floorSpacingMeters;
        candidates.push({
          x: faceX,
          y,
          z,
          rank,
          tone: stableUnit(towerIndex, floor + column, 83) < 0.7 ? 'warm' : 'cool',
        });
      }
    }
  }

  const selected = candidates.sort((a, b) => a.rank - b.rank).slice(0, budget);
  const geometry = new BoxGeometry(
    0.14,
    URBAN_CITY_CONFIG.window.heightMeters,
    URBAN_CITY_CONFIG.window.widthMeters,
  );
  const warm = selected.filter((window) => window.tone === 'warm');
  const cool = selected.filter((window) => window.tone === 'cool');
  if (warm.length > 0) {
    addInstancedBoxes(
      root,
      geometry,
      createWindowMaterial([1.0, 0.56, 0.25], nightGain, 'aohara-warm-window-light'),
      warm,
      'aohara-warm-windows',
    );
  }
  if (cool.length > 0) {
    addInstancedBoxes(
      root,
      geometry,
      createWindowMaterial([0.43, 0.66, 1.0], nightGain, 'aohara-cool-window-light'),
      cool,
      'aohara-cool-windows',
    );
  }
  return selected.length;
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
  /** Road ribbons/lanes/sidewalks/crossings come from RoadWorld in the driving composition. */
  readonly networkIntegrated?: boolean;
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
  readonly #streetLights: PointLight[] = [];
  readonly #streetLightFlares: Sprite[] = [];
  readonly #streetLightCandidates: (readonly [number, number, number])[] = [];
  readonly #signalHeads: SignalHead[] = [];
  readonly #windowInstances: number;
  readonly #flareCount: number;
  readonly #buildingColliders: readonly StaticBuildingBox[];
  readonly #networkIntegrated: boolean;
  readonly #towers: readonly TowerSpec[];
  readonly #cityBlockCount: number;
  readonly #streetLightPoleCount: number;
  readonly #cityOriginX: number;
  readonly #cityOriginZ: number;
  readonly #streetLightBudget: number;
  #streetLightSpatialGain = 1;
  #lastStreetLightFocus: { x: number; z: number } | null = null;
  #signalSeconds = 0;
  #disposed = false;

  constructor(tier: TierId = 'B', options: UrbanNightWorldOptions = {}) {
    this.#tier = tier;
    this.#networkIntegrated = options.networkIntegrated ?? false;
    const [originX, originY, originZ] = options.position ?? [0, 0, 0];
    this.#cityOriginX = originX;
    this.#cityOriginZ = originZ;
    this.root.position.set(originX, originY, originZ);
    this.#towers = this.#networkIntegrated ? AOHARA_CITY_TOWERS : LOOKDEV_TOWERS;
    this.#cityBlockCount = this.#networkIntegrated
      ? (AOHARA_GRID_ROWS.length - 1) * (AOHARA_GRID_COLUMNS.length - 1)
      : 1;
    this.#buildingColliders = this.#towers.map((tower) => ({
      x: originX + tower.x,
      z: originZ + tower.z,
      yaw: 0,
      halfWidth: tower.width / 2,
      halfDepth: tower.depth / 2,
    }));
    this.root.name = 'AoharaNightLightingBlock';
    const budget = URBAN_NIGHT_TIER_BUDGET[tier];
    this.#streetLightBudget = budget.pointLights;
    const warmFlare = createFlareMaterial(
      0xffd19a,
      this.#nightGain,
      budget.cardinalStarburst,
      budget.diagonalStarburst,
      'aohara-warm-gaussian-diffraction',
      this.#streetLightGain,
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
    this.#windowInstances = createWindowInstances(
      this.root,
      this.#nightGain,
      budget.litWindowInstances,
      this.#towers,
    );
    this.#streetLightPoleCount = this.#buildStreetLights(
      budget.pointLights,
      warmFlare,
      options.roadNetwork,
      originX,
      originZ,
    );
    this.#buildSignals(signalFlares);
    this.#flareCount = this.#streetLights.length + this.#signalHeads.length * SIGNAL_ASPECTS.length;
    this.#synchronizeSignals();
  }

  setDaylight(state: DaylightState): void {
    this.#nightGain.value = resolveUrbanNightGain(state.sunElevationDegrees);
    this.#wetness.value = resolveUrbanWetness(state.sunElevationDegrees);
    this.#setStreetLightIntensity();
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
      light.position.set(...position);
      flare.position.set(...position);
      flare.visible = coverage > 0;
    });
    this.#setStreetLightIntensity();
  }

  update(deltaSeconds: number): void {
    if (this.#disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }
    this.#signalSeconds =
      (this.#signalSeconds + deltaSeconds) % URBAN_CITY_CONFIG.trafficSignal.cycleSeconds;
    this.#synchronizeSignals();
  }

  get trafficSignalAspects(): readonly TrafficSignalAspect[] {
    return this.#signalHeads.map((head) => head.active ?? 'red');
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      cityBlocks: this.#cityBlockCount,
      highRiseBuildings: this.#towers.length,
      streetLightPoles: this.#streetLightPoleCount,
      streetLightPointLights: this.#streetLights.length,
      illuminatedWindows: this.#windowInstances,
      opticalFlares: this.#flareCount,
      trafficSignals: this.#signalHeads.length,
      wetSurfaceIntensity: Number(this.#wetness.value.toFixed(3)),
      streetLightFocusGain: Number(this.#streetLightSpatialGain.toFixed(3)),
      qualityTierCode: this.#tier === 'C' ? 0 : this.#tier === 'B' ? 1 : 2,
    };
  }

  /** High-rise footprints stop the player car through the existing Rapier impulse response path. */
  collide(car: TownCarProbe): TownHit[] {
    return this.#disposed ? [] : collideCarWithStaticBoxes(car, this.#buildingColliders);
  }

  dispose(): void {
    // The scene manager owns and sweeps this content's attached geometries/materials. This hook
    // only stops the content-owned update path; no timer, worker, or external listener is created.
    this.#disposed = true;
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
      asphalt.name = 'aohara-dark-asphalt-wet-look-clearcoat';
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
        asphalt,
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
      const wall = new MeshStandardNodeMaterial();
      wall.color.setHex(color);
      wall.roughness = 0.72;
      wall.metalness = 0.16;
      wall.name = `aohara-tower-facade-${paletteIndex}`;
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

    const roofMaterial = new MeshStandardNodeMaterial();
    roofMaterial.color.setHex(0x10161e);
    roofMaterial.roughness = 0.86;
    roofMaterial.name = 'aohara-rooftop-caps';
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

  #buildStreetLights(
    pointLightBudget: number,
    flareMaterial: SpriteNodeMaterial,
    roadNetwork: RoadNetwork | undefined,
    originX: number,
    originZ: number,
  ): number {
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

    const emitter = new MeshBasicNodeMaterial();
    emitter.colorNode = vec4(vec3(1, 0.76, 0.47).mul(this.#nightGain), 1);
    emitter.toneMapped = false;
    emitter.name = 'aohara-street-lamp-emitter';
    const emitterGeometry = new SphereGeometry(0.25, 10, 8);
    const bulbPositions = placements.map((placement) => placement.bulb);
    this.#streetLightCandidates.push(...bulbPositions);
    if (bulbPositions.length > 0) {
      addInstancedBoxes(
        this.root,
        emitterGeometry,
        emitter,
        bulbPositions.map(([x, y, z]) => ({ x, y, z })),
        'aohara-street-lamp-emitters',
      );
    }

    const defaultSpawnZ = -AOHARA_DISTRICT_CONFIG.gridSpacingMeters / 2;
    const budgetedPositions = this.#networkIntegrated
      ? selectNearestStreetLights(bulbPositions, pointLightBudget, 0, defaultSpawnZ)
      : bulbPositions.slice(0, pointLightBudget);
    budgetedPositions.forEach(([x, y, z], index) => {
      const light = new PointLight(
        0xffc27a,
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

      const flare = new Sprite(flareMaterial);
      flare.position.set(x, y, z);
      flare.scale.setScalar(URBAN_CITY_CONFIG.streetLamp.haloScaleMeters);
      flare.visible = this.#streetLightSpatialGain > 0;
      flare.name = `aohara-streetlight-gaussian-flare-${index + 1}`;
      this.root.add(flare);
      this.#streetLightFlares.push(flare);
    });
    return placements.length;
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
    context.qualityTier === 'A' || context.qualityTier === 'C' ? context.qualityTier : 'B';
  return new UrbanNightWorld(tier);
}
