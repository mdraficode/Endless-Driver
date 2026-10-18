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
  MeshStandardNodeMaterial,
  SpriteNodeMaterial,
  type UniformNode,
} from 'three/webgpu';
import { abs, exp, uniform, uv, vec3, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  resolveTrafficSignalAspect,
  resolveUrbanNightGain,
  URBAN_CITY_CONFIG,
  URBAN_NIGHT_TIER_BUDGET,
  type TrafficSignalAspect,
} from '../config/urban-city';
import type { TierId } from '../config/tiers';
import type { DaylightState } from '../environment/EnvironmentClock';
import type { SceneContent, SceneContentContext } from './WorldContent';

interface TowerSpec {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly color: number;
}

/** Compact skyline for the first lighting block; later Phase 9 work will stream full district blocks. */
const TOWERS: readonly TowerSpec[] = [
  { x: -31, z: -56, width: 22, depth: 26, height: 58, color: 0x27323d },
  { x: -31, z: -25, width: 22, depth: 25, height: 82, color: 0x202c39 },
  { x: -31, z: 25, width: 23, depth: 27, height: 68, color: 0x303440 },
  { x: -31, z: 56, width: 24, depth: 27, height: 100, color: 0x222b36 },
  { x: 31, z: -55, width: 23, depth: 26, height: 74, color: 0x29323c },
  { x: 31, z: -24, width: 25, depth: 25, height: 96, color: 0x202a35 },
  { x: 31, z: 25, width: 22, depth: 27, height: 54, color: 0x343541 },
  { x: 31, z: 56, width: 24, depth: 28, height: 86, color: 0x26313c },
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
  const halo = exp(radiusSquared.mul(-5.2)).mul(0.16);
  const core = exp(radiusSquared.mul(-42)).mul(0.13);
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
  const opacity = halo.add(core).add(cardinal).add(diagonal).mul(nightGain).clamp(0, 0.42);
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
): number {
  const candidates: Array<
    TransformSpec & { readonly rank: number; readonly tone: 'warm' | 'cool' }
  > = [];
  for (let towerIndex = 0; towerIndex < TOWERS.length; towerIndex += 1) {
    const tower = TOWERS[towerIndex]!;
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

/**
 * First Aohara Metropolis night-lighting slice: a bounded avenue/intersection, high-rise silhouettes,
 * emissive windows, point-lit lamps, source-local Gaussian glow/diffraction, a crossing, and timed signals.
 * It is a look-dev scene; it is not yet a streamed or driveable district.
 */
export class UrbanNightWorld implements SceneContent {
  readonly root = new Group();
  readonly kind = 'aohara-city-night';
  readonly #tier: TierId;
  readonly #nightGain = uniform(0);
  readonly #streetLights: PointLight[] = [];
  readonly #signalHeads: SignalHead[] = [];
  readonly #windowInstances: number;
  readonly #flareCount: number;
  #signalSeconds = 0;
  #disposed = false;

  constructor(tier: TierId = 'B') {
    this.#tier = tier;
    this.root.name = 'AoharaNightLightingBlock';
    const budget = URBAN_NIGHT_TIER_BUDGET[tier];
    const warmFlare = createFlareMaterial(
      0xffd19a,
      this.#nightGain,
      budget.cardinalStarburst,
      budget.diagonalStarburst,
      'aohara-warm-gaussian-diffraction',
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
    this.#buildTowers();
    this.#windowInstances = createWindowInstances(
      this.root,
      this.#nightGain,
      budget.litWindowInstances,
    );
    this.#buildStreetLights(budget.pointLights, warmFlare);
    this.#buildSignals(signalFlares);
    this.#flareCount = this.#streetLights.length + this.#signalHeads.length * SIGNAL_ASPECTS.length;
    this.#synchronizeSignals();
  }

  setDaylight(state: DaylightState): void {
    const gain = resolveUrbanNightGain(state.sunElevationDegrees);
    this.#nightGain.value = gain;
    for (const light of this.#streetLights) {
      light.intensity = URBAN_CITY_CONFIG.streetLamp.pointLightIntensity * gain;
    }
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
      highRiseBuildings: TOWERS.length,
      streetLightPointLights: this.#streetLights.length,
      illuminatedWindows: this.#windowInstances,
      opticalFlares: this.#flareCount,
      trafficSignals: this.#signalHeads.length,
      qualityTierCode: this.#tier === 'C' ? 0 : this.#tier === 'B' ? 1 : 2,
    };
  }

  dispose(): void {
    // The scene manager owns and sweeps this content's attached geometries/materials. This hook
    // only stops the content-owned update path; no timer, worker, or external listener is created.
    this.#disposed = true;
  }

  #buildStreetAndCrossing(): void {
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

    const asphalt = new MeshStandardNodeMaterial();
    asphalt.color.setHex(0x1d252e);
    asphalt.roughness = 0.24;
    asphalt.metalness = 0.08;
    asphalt.name = 'aohara-dark-asphalt-local-specular';
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
      centerLines.push({ x: -0.18, y: ROAD_Y + 0.027, z }, { x: 0.18, y: ROAD_Y + 0.027, z });
    }
    addInstancedBoxes(
      this.root,
      centerLineGeometry,
      yellow,
      centerLines,
      'aohara-double-center-lines',
    );

    const crosswalkMaterial = createBasicMaterial(0xd3dadd, 'aohara-crosswalk-marking');
    const barGeometry = new BoxGeometry(1.32, 0.032, 0.72);
    const crosswalkBars: TransformSpec[] = [];
    for (const z of [-8.3, 8.3]) {
      for (let x = -8.5; x <= 8.5; x += 2.25) {
        crosswalkBars.push({ x, y: ROAD_Y + 0.035, z });
      }
    }
    addInstancedBoxes(
      this.root,
      barGeometry,
      crosswalkMaterial,
      crosswalkBars,
      'aohara-zebra-crossings',
    );
    addInstancedBoxes(
      this.root,
      new BoxGeometry(URBAN_CITY_CONFIG.avenue.widthMeters, 0.035, 0.32),
      white,
      [
        { x: 0, y: ROAD_Y + 0.035, z: -5.7 },
        { x: 0, y: ROAD_Y + 0.035, z: 5.7 },
      ],
      'aohara-stop-lines',
    );
  }

  #buildTowers(): void {
    for (let index = 0; index < TOWERS.length; index += 1) {
      const tower = TOWERS[index]!;
      const wall = new MeshStandardNodeMaterial();
      wall.color.setHex(tower.color);
      wall.roughness = 0.72;
      wall.metalness = 0.16;
      wall.name = `aohara-tower-facade-${index}`;
      const mesh = new Mesh(new BoxGeometry(tower.width, tower.height, tower.depth), wall);
      mesh.position.set(tower.x, WORLD_BASE_Y + tower.height / 2, tower.z);
      mesh.name = `aohara-high-rise-${index + 1}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);

      const roofMaterial = new MeshStandardNodeMaterial();
      roofMaterial.color.setHex(0x10161e);
      roofMaterial.roughness = 0.86;
      roofMaterial.name = `aohara-rooftop-${index}`;
      addBox(
        this.root,
        [tower.width + 0.5, 0.7, tower.depth + 0.5],
        [tower.x, WORLD_BASE_Y + tower.height + 0.35, tower.z],
        roofMaterial,
        `aohara-rooftop-cap-${index + 1}`,
      );
    }
  }

  #buildStreetLights(pointLightBudget: number, flareMaterial: SpriteNodeMaterial): void {
    const poleMaterial = new MeshStandardNodeMaterial();
    poleMaterial.color.setHex(0x39414a);
    poleMaterial.roughness = 0.52;
    poleMaterial.metalness = 0.68;
    poleMaterial.name = 'aohara-lamp-pole-metal';
    const positions: TransformSpec[] = [];
    const pointPositions: Array<readonly [number, number, number]> = [];
    for (let index = 0; index < URBAN_CITY_CONFIG.streetLamp.spacingPositionsZ.length; index += 1) {
      const z = URBAN_CITY_CONFIG.streetLamp.spacingPositionsZ[index]!;
      for (const side of [-1, 1]) {
        const x = side * URBAN_CITY_CONFIG.streetLamp.sideXMeters;
        positions.push({ x, y: WORLD_BASE_Y, z, yaw: side < 0 ? 0 : Math.PI });
        const lampX = x + (side < 0 ? 1.88 : -1.88);
        pointPositions.push([
          lampX,
          WORLD_BASE_Y + URBAN_CITY_CONFIG.streetLamp.heightMeters - 0.4,
          z,
        ]);
      }
    }
    addInstancedBoxes(
      this.root,
      createLampGeometry(),
      poleMaterial,
      positions,
      'aohara-street-lamp-poles',
    );

    const emitter = new MeshBasicNodeMaterial();
    emitter.colorNode = vec4(vec3(1, 0.76, 0.47).mul(this.#nightGain), 1);
    emitter.toneMapped = false;
    emitter.name = 'aohara-street-lamp-emitter';
    const emitterGeometry = new SphereGeometry(0.25, 10, 8);
    const budgetedPositions = pointPositions.slice(0, pointLightBudget);
    budgetedPositions.forEach(([x, y, z], index) => {
      const light = new PointLight(
        0xffc27a,
        URBAN_CITY_CONFIG.streetLamp.pointLightIntensity,
        URBAN_CITY_CONFIG.streetLamp.pointLightDistanceMeters,
        2,
      );
      light.position.set(x, y, z);
      light.name = `aohara-streetlight-point-${index + 1}`;
      light.castShadow = false;
      this.root.add(light);
      this.#streetLights.push(light);

      const bulb = new Mesh(emitterGeometry, emitter);
      bulb.position.set(x, y, z);
      bulb.name = `aohara-streetlight-emitter-${index + 1}`;
      this.root.add(bulb);

      const flare = new Sprite(flareMaterial);
      flare.position.set(x, y, z);
      flare.scale.setScalar(URBAN_CITY_CONFIG.streetLamp.haloScaleMeters);
      flare.name = `aohara-streetlight-gaussian-flare-${index + 1}`;
      this.root.add(flare);
    });
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
