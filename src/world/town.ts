import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { vertexColor } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { BUILDING_ARCHETYPES, TOWN_CONFIG } from '../config/town';
import { DISTRICTS } from '../config/districts';
import type { TerrainSampler } from './terrain-height';
import type { RoadNetwork } from './road-network';
import { districtAt } from './districts';
import { generateChunkVegetation } from './vegetation-placement';
import { hash01 } from './vegetation-placement';

/**
 * Yūhi Town (Phase 4 Increment 5b): the built district. Placement is pure and
 * deterministic — buildings on a jittered plot grid inside the town district
 * (road-fronting, slope-checked, never through a tree), utility poles walking
 * every road edge at fixed spacing. Buildings are solid (two-circle vs OBB
 * analytic collision, same response contract as the trees); poles fold over
 * when hit hard, animated in place. Geometry is an authored low-poly kit —
 * walls/roofs as separate instanced meshes sharing transforms — behind the
 * same registry philosophy as the vegetation: scanned CC0 buildings can
 * replace these archetypes later without touching placement.
 */

export interface BuildingPlacement {
  readonly key: string;
  readonly archetype: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
}

export interface PolePlacement {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

function townDistrict() {
  return DISTRICTS.find((district) => district.id === 'yuhi-town')!;
}

/** Direction (yaw) of the road nearest a point, from the solved edge polylines. */
function nearestRoadYaw(network: RoadNetwork, x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  let yaw = 0;
  for (const edge of network.edges) {
    for (let index = 0; index + 1 < edge.points.length; index += 1) {
      const a = edge.points[index]!;
      const b = edge.points[index + 1]!;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const d = (mx - x) ** 2 + (mz - z) ** 2;
      if (d < best) {
        best = d;
        yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      }
    }
  }
  return yaw;
}

export function generateTownBuildings(
  sampler: TerrainSampler,
  network: RoadNetwork | null,
): BuildingPlacement[] {
  const district = townDistrict();
  const placements: BuildingPlacement[] = [];
  if (network === null) {
    return placements;
  }
  // Trees got there first (chronologically the forest is older than the town):
  // collect nearby vegetation so no house swallows a tree.
  const treeCells = new Set<string>();
  const chunkSize = sampler.config.chunkSizeMeters;
  const minChunkX = Math.floor((district.centerX - district.radiusMeters) / chunkSize);
  const maxChunkX = Math.floor((district.centerX + district.radiusMeters) / chunkSize);
  const minChunkZ = Math.floor((district.centerZ - district.radiusMeters) / chunkSize);
  const maxChunkZ = Math.floor((district.centerZ + district.radiusMeters) / chunkSize);
  for (let cz = minChunkZ; cz <= maxChunkZ; cz += 1) {
    for (let cx = minChunkX; cx <= maxChunkX; cx += 1) {
      for (const plant of generateChunkVegetation(sampler, cx, cz)) {
        if (plant.species !== 'rock') {
          treeCells.add(`${Math.round(plant.x / 4)},${Math.round(plant.z / 4)}`);
        }
      }
    }
  }

  const pitch = TOWN_CONFIG.plotPitchMeters;
  const radius = district.radiusMeters * TOWN_CONFIG.districtRadiusFraction;
  const steps = Math.ceil((radius * 2) / pitch);
  for (let iz = 0; iz < steps; iz += 1) {
    for (let ix = 0; ix < steps; ix += 1) {
      const gx = district.centerX - radius + ix * pitch;
      const gz = district.centerZ - radius + iz * pitch;
      const cellX = Math.round(gx / pitch);
      const cellZ = Math.round(gz / pitch);
      const x = gx + (hash01(cellX, cellZ, 211) - 0.5) * 7;
      const z = gz + (hash01(cellX, cellZ, 223) - 0.5) * 7;
      if (Math.hypot(x - district.centerX, z - district.centerZ) > radius) {
        continue;
      }
      if (districtAt(x, z)?.id !== district.id) {
        continue;
      }
      if (hash01(cellX, cellZ, 227) < 0.22) {
        continue; // empty lots, gardens, the odd car park
      }
      const road = sampler.roadAt?.(x, z) ?? null;
      if (
        road !== null &&
        road.distance <
          Math.max(TOWN_CONFIG.roadClearanceMeters, road.halfWidthMeters + road.shoulderMeters + 3)
      ) {
        continue;
      }
      if (sampler.normalAt(x, z).y < 0.93) {
        continue;
      }
      let nearTree = false;
      for (let dz = -1; dz <= 1 && !nearTree; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (treeCells.has(`${Math.round(x / 4) + dx},${Math.round(z / 4) + dz}`)) {
            nearTree = true;
            break;
          }
        }
      }
      if (nearTree) {
        continue;
      }
      const archetype = Math.floor(hash01(cellX, cellZ, 229) * BUILDING_ARCHETYPES.length);
      const spec = BUILDING_ARCHETYPES[archetype]!;
      const roadYaw = nearestRoadYaw(network, x, z);
      // Front the street: align to the road, or to the grid when far from one.
      const yaw =
        road !== null && road.distance < 30
          ? roadYaw + (hash01(cellX, cellZ, 233) < 0.5 ? 0 : Math.PI)
          : Math.floor(hash01(cellX, cellZ, 239) * 4) * (Math.PI / 2);
      const scale = 0.92 + hash01(cellX, cellZ, 241) * 0.22;
      placements.push({
        key: `b${cellX},${cellZ}`,
        archetype,
        x,
        y: sampler.heightAt(x, z) - 0.25,
        z,
        yaw,
        scale,
        halfWidth: (spec.width / 2) * scale,
        halfDepth: (spec.depth / 2) * scale,
      });
    }
  }
  return placements;
}

export function generateRoadPoles(sampler: TerrainSampler, network: RoadNetwork): PolePlacement[] {
  const poles: PolePlacement[] = [];
  const spacing = TOWN_CONFIG.poleSpacingMeters;
  network.edges.forEach((edge, edgeIndex) => {
    // Urban streets use the Aohara luminaire kit, not rural utility poles. The access connector
    // keeps poles but moves them beyond its wider shoulder.
    if (edge.roadClass === 'urban-local' || edge.roadClass === 'urban-arterial') {
      return;
    }
    const roadSideOffset = Math.max(
      TOWN_CONFIG.poleOffsetMeters,
      edge.halfWidthMeters + edge.shoulderMeters + 0.5,
    );
    let sinceLast = spacing * 0.5;
    let poleIndex = 0;
    for (let index = 0; index + 1 < edge.points.length; index += 1) {
      const a = edge.points[index]!;
      const b = edge.points[index + 1]!;
      const segmentLength = Math.hypot(b.x - a.x, b.z - a.z);
      if (segmentLength < 0.01) {
        continue;
      }
      sinceLast += segmentLength;
      if (sinceLast < spacing) {
        continue;
      }
      sinceLast = 0;
      const t = 0.5;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const dirX = (b.x - a.x) / segmentLength;
      const dirZ = (b.z - a.z) / segmentLength;
      const side = (edgeIndex + poleIndex) % 2 === 0 ? 1 : -1;
      poleIndex += 1;
      const px = x + -dirZ * side * roadSideOffset;
      const pz = z + dirX * side * roadSideOffset;
      // Keep junctions walkable and poles off absurd slopes.
      let nearNode = false;
      for (const node of network.nodes) {
        if (Math.hypot(node.x - px, node.z - pz) < TOWN_CONFIG.junctionClearanceMeters) {
          nearNode = true;
          break;
        }
      }
      if (nearNode || sampler.normalAt(px, pz).y < 0.82) {
        continue;
      }
      poles.push({
        key: `p${edge.id}:${poleIndex}`,
        x: px,
        y: sampler.heightAt(px, pz) - 0.1,
        z: pz,
        yaw: Math.atan2(dirX, dirZ),
      });
    }
  });
  return poles;
}

// ---------------------------------------------------------------------------
// Kit geometry (vertex-coloured, merged): walls and roofs share transforms.
// ---------------------------------------------------------------------------

function paint(geometry: BufferGeometry, hex: number): BufferGeometry {
  const color = new Color(hex);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function box(
  w: number,
  h: number,
  d: number,
  hex: number,
  x: number,
  y: number,
  z: number,
): BufferGeometry {
  const geometry = paint(new BoxGeometry(w, h, d).toNonIndexed(), hex);
  geometry.translate(x, y, z);
  return geometry;
}

const WALL_COLORS = [0xe8e0cc, 0xdfe5ea, 0xe6d3b8] as const;
const ROOF_COLORS = [0x3d4450, 0x7a4a38, 0x54443a] as const;

function buildWallGeometry(archetype: number): BufferGeometry {
  const spec = BUILDING_ARCHETYPES[archetype]!;
  const parts = [
    box(spec.width, spec.height, spec.depth, WALL_COLORS[archetype]!, 0, spec.height / 2, 0),
    // Window band: dark insets on the street face, door below.
    box(spec.width * 0.62, 0.85, 0.08, 0x39434f, 0, spec.height * 0.62, spec.depth / 2 + 0.03),
    box(0.9, 1.9, 0.08, 0x4c3a2a, -spec.width * 0.28, 0.95, spec.depth / 2 + 0.03),
  ];
  if (archetype === 1) {
    // Shop: sign band + awning strip.
    parts.push(
      box(spec.width * 0.92, 0.55, 0.1, 0xb8452e, 0, spec.height - 0.45, spec.depth / 2 + 0.05),
    );
    parts.push(
      box(spec.width * 0.8, 0.08, 1.1, 0x2e4a5e, 0, spec.height * 0.52, spec.depth / 2 + 0.5),
    );
  }
  if (archetype === 2) {
    parts.push(
      box(spec.width * 0.6, 0.8, 0.08, 0x39434f, 0, spec.height * 0.3, spec.depth / 2 + 0.03),
    );
  }
  return mergeGeometries(parts)!;
}

function buildRoofGeometry(archetype: number): BufferGeometry {
  const spec = BUILDING_ARCHETYPES[archetype]!;
  const roof = paint(
    new ConeGeometry(0.74, spec.roofHeight, 4).toNonIndexed(),
    ROOF_COLORS[archetype]!,
  );
  roof.rotateY(Math.PI / 4);
  roof.scale(spec.width, 1, spec.depth);
  roof.translate(0, spec.height + spec.roofHeight / 2 - 0.04, 0);
  // Ridge cap.
  const cap = box(
    spec.width * 0.5,
    0.12,
    0.3,
    0x2c3138,
    0,
    spec.height + spec.roofHeight - 0.02,
    0,
  );
  return mergeGeometries([roof, cap])!;
}

function buildPoleGeometry(): BufferGeometry {
  const parts = [
    paint(new CylinderGeometry(0.09, 0.13, 7.4, 5).toNonIndexed(), 0x4a3b2e).translate(0, 3.7, 0),
    box(2.0, 0.1, 0.1, 0x4a3b2e, 0, 6.7, 0),
    box(1.5, 0.09, 0.09, 0x4a3b2e, 0, 6.05, 0),
  ];
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------------------
// Collision (analytic; response contract shared with tree-collision.ts).
// ---------------------------------------------------------------------------

export interface TownHit {
  readonly normalX: number;
  readonly normalZ: number;
  readonly penetration: number;
  readonly absorbedSpeed: number;
  readonly solid: boolean;
  readonly impact: boolean;
  readonly impactSpeed: number;
  readonly lateralOffset: number;
}

export interface TownCarProbe {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly velocityX: number;
  readonly velocityZ: number;
}

const CAR_CIRCLE_OFFSET = 1.05;
const CAR_CIRCLE_RADIUS = 1.18;

interface PoleRecord {
  damage: number;
  lastHitTime: number;
  down: boolean;
  leanAngle: number;
  leanVelocity: number;
  dirX: number;
  dirZ: number;
}

const UP = new Vector3(0, 1, 0);

export class TownWorld {
  readonly root = new Group();
  readonly buildings: readonly BuildingPlacement[];
  readonly poles: readonly PolePlacement[];
  readonly #poleRecords = new Map<string, PoleRecord>();
  readonly #poleMesh: InstancedMesh;
  readonly #poleIndex = new Map<string, number>();
  #polesDown = 0;
  #time = 0;
  #disposed = false;

  constructor(sampler: TerrainSampler) {
    this.root.name = 'TownWorld';
    const network = sampler.roadNetwork ?? null;
    this.buildings = generateTownBuildings(sampler, network);
    this.poles = network === null ? [] : generateRoadPoles(sampler, network);

    const material = new MeshStandardNodeMaterial();
    material.colorNode = vertexColor();
    material.roughness = 0.9;

    const dummy = new Object3D();
    for (let archetype = 0; archetype < BUILDING_ARCHETYPES.length; archetype += 1) {
      const placed = this.buildings.filter((b) => b.archetype === archetype);
      for (const [kind, build] of [
        ['walls', buildWallGeometry],
        ['roofs', buildRoofGeometry],
      ] as const) {
        const mesh = new InstancedMesh(build(archetype), material, Math.max(1, placed.length));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.count = placed.length;
        mesh.name = `town-${kind}-${archetype}`;
        placed.forEach((building, index) => {
          dummy.position.set(building.x, building.y, building.z);
          dummy.quaternion.setFromAxisAngle(UP, building.yaw);
          dummy.scale.setScalar(building.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.root.add(mesh);
      }
    }

    const poleMesh = new InstancedMesh(
      buildPoleGeometry(),
      material,
      Math.max(1, this.poles.length),
    );
    poleMesh.castShadow = true;
    poleMesh.frustumCulled = false;
    poleMesh.count = this.poles.length;
    poleMesh.name = 'town-poles';
    this.poles.forEach((pole, index) => {
      dummy.position.set(pole.x, pole.y, pole.z);
      dummy.quaternion.setFromAxisAngle(UP, pole.yaw);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poleMesh.setMatrixAt(index, dummy.matrix);
      this.#poleIndex.set(pole.key, index);
    });
    poleMesh.instanceMatrix.needsUpdate = true;
    this.root.add(poleMesh);
    this.#poleMesh = poleMesh;
    this.#material = material;
  }

  readonly #material: MeshStandardNodeMaterial;

  /**
   * Tests the car (two plan circles) against buildings and standing poles.
   * Poles that fold register here and animate in `updateStreaming`.
   */
  collide(car: TownCarProbe, deltaSeconds: number): TownHit[] {
    this.#time += deltaSeconds;
    const hits: TownHit[] = [];
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    const forwardX = -sin;
    const forwardZ = -cos;
    const circles = [
      { x: car.x + forwardX * CAR_CIRCLE_OFFSET, z: car.z + forwardZ * CAR_CIRCLE_OFFSET },
      { x: car.x - forwardX * CAR_CIRCLE_OFFSET, z: car.z - forwardZ * CAR_CIRCLE_OFFSET },
    ];

    const testCircleVsBox = (
      cx: number,
      cz: number,
      box: { x: number; z: number; yaw: number; halfWidth: number; halfDepth: number },
    ): { normalX: number; normalZ: number; penetration: number } | null => {
      const dx = cx - box.x;
      const dz = cz - box.z;
      const bcos = Math.cos(box.yaw);
      const bsin = Math.sin(box.yaw);
      const lx = dx * bcos - dz * bsin;
      const lz = dx * bsin + dz * bcos;
      const closestX = Math.max(-box.halfWidth, Math.min(box.halfWidth, lx));
      const closestZ = Math.max(-box.halfDepth, Math.min(box.halfDepth, lz));
      const offX = lx - closestX;
      const offZ = lz - closestZ;
      const distSq = offX * offX + offZ * offZ;
      if (distSq >= CAR_CIRCLE_RADIUS * CAR_CIRCLE_RADIUS) {
        return null;
      }
      let nlx: number;
      let nlz: number;
      let penetration: number;
      if (distSq > 1e-9) {
        const dist = Math.sqrt(distSq);
        nlx = offX / dist;
        nlz = offZ / dist;
        penetration = CAR_CIRCLE_RADIUS - dist;
      } else {
        // Circle centre inside the box: exit along the shallowest face.
        if (box.halfWidth - Math.abs(lx) < box.halfDepth - Math.abs(lz)) {
          nlx = lx >= 0 ? 1 : -1;
          nlz = 0;
          penetration = box.halfWidth - Math.abs(lx) + CAR_CIRCLE_RADIUS;
        } else {
          nlx = 0;
          nlz = lz >= 0 ? 1 : -1;
          penetration = box.halfDepth - Math.abs(lz) + CAR_CIRCLE_RADIUS;
        }
      }
      return {
        normalX: nlx * bcos + nlz * bsin,
        normalZ: -nlx * bsin + nlz * bcos,
        penetration,
      };
    };

    for (const building of this.buildings) {
      if ((building.x - car.x) ** 2 + (building.z - car.z) ** 2 > 900) {
        continue;
      }
      for (const circle of circles) {
        const contact = testCircleVsBox(circle.x, circle.z, building);
        if (contact === null) {
          continue;
        }
        const vn = car.velocityX * contact.normalX + car.velocityZ * contact.normalZ;
        hits.push({
          ...contact,
          absorbedSpeed: Math.max(0, -vn),
          solid: true,
          impact: false,
          impactSpeed: Math.max(0, -vn),
          lateralOffset: (circle.x - car.x) * cos - (circle.z - car.z) * sin,
        });
        break;
      }
    }

    for (const pole of this.poles) {
      const record = this.#poleRecords.get(pole.key);
      if (record?.down) {
        continue;
      }
      const dx = pole.x - car.x;
      const dz = pole.z - car.z;
      if (dx * dx + dz * dz > 36) {
        continue;
      }
      for (const circle of circles) {
        const offX = pole.x - circle.x;
        const offZ = pole.z - circle.z;
        const dist = Math.hypot(offX, offZ);
        const radius = 0.16 + CAR_CIRCLE_RADIUS;
        if (dist >= radius || dist < 1e-6) {
          continue;
        }
        const normalX = -offX / dist;
        const normalZ = -offZ / dist;
        const vn = car.velocityX * normalX + car.velocityZ * normalZ;
        const closing = Math.max(0, -vn);
        const rec: PoleRecord = record ?? {
          damage: 0,
          lastHitTime: -Number.POSITIVE_INFINITY,
          down: false,
          leanAngle: 0,
          leanVelocity: 0,
          dirX: -normalX,
          dirZ: -normalZ,
        };
        let impact = false;
        const onCooldown = this.#time - rec.lastHitTime < TOWN_CONFIG.poleHitCooldownSeconds;
        if (closing > 0.9 && !onCooldown) {
          rec.damage += closing * 10;
          rec.lastHitTime = this.#time;
          rec.dirX = -normalX;
          rec.dirZ = -normalZ;
          impact = rec.damage >= TOWN_CONFIG.poleHitPoints;
          if (impact) {
            rec.down = true;
            rec.leanVelocity = 1.2;
            this.#polesDown += 1;
          }
          this.#poleRecords.set(pole.key, rec);
        }
        hits.push({
          normalX,
          normalZ,
          penetration: radius - dist,
          absorbedSpeed: Math.min(closing, TOWN_CONFIG.poleStopSpeed),
          solid: false,
          impact,
          impactSpeed: closing,
          lateralOffset: (circle.x - car.x) * cos - (circle.z - car.z) * sin,
        });
        break;
      }
    }
    return hits;
  }

  /** Animates folding poles (runs beside the terrain streaming hook). */
  updateStreaming(_focus: { x: number; z: number }, deltaSeconds: number): void {
    if (this.#disposed || deltaSeconds <= 0 || this.#poleRecords.size === 0) {
      return;
    }
    const dt = Math.min(deltaSeconds, 0.05);
    const dummy = new Object3D();
    for (const [key, record] of this.#poleRecords) {
      if (!record.down) {
        continue;
      }
      const index = this.#poleIndex.get(key);
      const pole = this.poles.find((candidate) => candidate.key === key);
      if (index === undefined || pole === undefined) {
        continue;
      }
      // Tip over: accelerate to ~80 degrees and settle (no spring-back).
      record.leanVelocity += Math.sin(Math.max(0, 1.45 - record.leanAngle)) * 6 * dt;
      record.leanVelocity *= Math.pow(0.25, dt);
      record.leanAngle = Math.min(1.45, record.leanAngle + record.leanVelocity * dt);
      const axis = new Vector3(record.dirZ, 0, -record.dirX).normalize();
      dummy.position.set(pole.x, pole.y, pole.z);
      dummy.quaternion
        .setFromAxisAngle(UP, pole.yaw)
        .multiply(new Quaternion().setFromAxisAngle(axis, record.leanAngle));
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#poleMesh.setMatrixAt(index, dummy.matrix);
      this.#poleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      townBuildings: this.buildings.length,
      townPoles: this.poles.length,
      townPolesDown: this.#polesDown,
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.root.traverse((object) => {
      if (object instanceof InstancedMesh) {
        object.geometry.dispose();
        object.dispose();
      }
    });
    this.#material.dispose();
    this.root.removeFromParent();
  }
}
