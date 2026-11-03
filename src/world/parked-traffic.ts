/**
 * Phase 10.1 — parked traffic: the static cars lining the residential streets, alley mouths and
 * commercial curbs.
 *
 * Placement is a pure function of the solved road network (edge id + seeded spacing), so every
 * world gets the same parking clutter for the same seed, and the cars sit on the solved road
 * elevation (the conforming profile), not on the raw terrain. The meshes are fully static —
 * built once, never updated — so they cost nothing per frame beyond the draw calls.
 */
import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { TRAFFIC_VEHICLE_CLASSES, type TrafficVehicleClass } from '../config/traffic-vehicles';
import type { TierId } from '../config/tiers';
import { createTrafficVehicleModel } from './traffic-vehicle-models';
import type { RoadEdge, RoadNetwork } from './road-network';

export interface ParkedCarPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly type: TrafficVehicleClass;
}

export interface ParkedTrafficOptions {
  readonly tier?: TierId;
  readonly worldSeed?: number;
}

const PARKED_BUDGET: Readonly<Record<TierId, number>> = { A: 4000, B: 2600, C: 1500 };
const JUNCTION_CLEARANCE_METERS = 26;
const PARK_LATERAL_METERS = 1.15; // beyond the pavement edge to the car centreline
const MAX_PARKED_PER_EDGE = 14;

function pick(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/** Centreline point at `distance` metres along the edge's solved profile. */
function centerlineAt(
  edge: RoadEdge,
  distance: number,
): { x: number; y: number; z: number; tx: number; tz: number } {
  const points = edge.points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (distance <= first.alongMeters) {
    const next = points[1] ?? last;
    const len = Math.hypot(next.x - first.x, next.z - first.z) || 1;
    return {
      x: first.x,
      y: first.y,
      z: first.z,
      tx: (next.x - first.x) / len,
      tz: (next.z - first.z) / len,
    };
  }
  if (distance >= last.alongMeters) {
    const prev = points[points.length - 2] ?? first;
    const len = Math.hypot(last.x - prev.x, last.z - prev.z) || 1;
    return {
      x: last.x,
      y: last.y,
      z: last.z,
      tx: (last.x - prev.x) / len,
      tz: (last.z - prev.z) / len,
    };
  }
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (distance >= a.alongMeters && distance <= b.alongMeters) {
      const span = Math.max(1e-9, b.alongMeters - a.alongMeters);
      const t = (distance - a.alongMeters) / span;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        tx: (b.x - a.x) / Math.max(1e-9, Math.hypot(b.x - a.x, b.z - a.z)),
        tz: (b.z - a.z) / Math.max(1e-9, Math.hypot(b.x - a.x, b.z - a.z)),
      };
    }
  }
  return { x: last.x, y: last.y, z: last.z, tx: 0, tz: 1 };
}

export function computeParkedPlacements(
  network: RoadNetwork,
  worldSeed: number,
): readonly ParkedCarPlacement[] {
  const placements: ParkedCarPlacement[] = [];
  const seed = worldSeed | 0;
  for (const edge of network.edges) {
    if (edge.roadClass === 'urban-alley' || edge.roadClass === 'touge') {
      continue; // no parking in alleys; the pass road stays clear
    }
    if (edge.lengthMeters < JUNCTION_CLEARANCE_METERS * 2 + 6) {
      continue;
    }
    const edgeHash = hashString(edge.id, seed);
    const start = JUNCTION_CLEARANCE_METERS + 2 * pick(edgeHash, 0x31, 1);
    const end = edge.lengthMeters - JUNCTION_CLEARANCE_METERS - 2 * pick(edgeHash, 0x32, 2);
    if (end - start < 8) {
      continue;
    }
    // Parkable fraction by class: residential streets are cluttered, arterials sparser.
    const parkableFraction =
      edge.roadClass === 'urban-local' ? 0.5 : edge.roadClass === 'rural' ? 0.34 : 0.24;
    const interval = 17 + 13 * pick(edgeHash, 0x33, 3);
    let distance = start + 4 * pick(edgeHash, 0x34, 4);
    let count = 0;
    while (distance < end && count < MAX_PARKED_PER_EDGE) {
      if (pick(edgeHash, 0x35 + count, 5 + count) < parkableFraction) {
        const p = centerlineAt(edge, distance);
        const side = pick(edgeHash, 0x51 + count, 7 + count) < 0.5 ? -1 : 1;
        // side = rotate tangent -90° (x, z) → (z, -x); flip for the other curb.
        const sx = p.tz * side;
        const sz = -p.tx * side;
        const lateral = edge.halfWidthMeters + PARK_LATERAL_METERS;
        const candidateX = p.x + sx * lateral;
        const candidateZ = p.z + sz * lateral;
        // A parkway or city-access road can cut through the block diagonally: never park a
        // car inside another road's drivable pavement.
        const nearest = network.sample(candidateX, candidateZ);
        if (nearest !== null && nearest.distance < nearest.halfWidthMeters + 0.3) {
          distance += interval;
          count += 1;
          continue;
        }
        const heading = pick(edgeHash, 0x52 + count, 9 + count) < 0.5 ? 1 : -1;
        const tx = p.tx * heading;
        const tz = p.tz * heading;
        const type = pickType(edgeHash, count, seed, edge.roadClass);
        placements.push({
          x: candidateX,
          y: p.y + 0.02,
          z: candidateZ,
          yaw: Math.atan2(-tx, -tz),
          type,
        });
      }
      distance += interval * (0.75 + 0.5 * pick(edgeHash, 0x53 + count, 11 + count));
      count += 1;
    }
  }
  return placements;
}

function pickType(
  edgeHash: number,
  count: number,
  seed: number,
  roadClass: RoadEdge['roadClass'],
): TrafficVehicleClass {
  const roll = pick(edgeHash, 0x60 + count, seed % 997);
  if (roadClass === 'rural') {
    if (roll < 0.5) return 'passenger-car';
    if (roll < 0.78) return 'rigid-truck';
    if (roll < 0.9) return 'farm-tractor';
    return 'semi-trailer-rig';
  }
  if (roll < 0.74) return 'passenger-car';
  if (roll < 0.9) return 'rigid-truck';
  if (roll < 0.97) return 'city-bus';
  return 'semi-trailer-rig';
}

function hashString(text: string, seed: number): number {
  let h = seed | 0;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  h ^= h >>> 13;
  return Math.imul(h, 0xc2b2ae35);
}

/**
 * Static instanced parked cars for a solved network. Built once at world start; the group is
 * added to the driving world root and never updated.
 */
export class ParkedTrafficWorld {
  readonly root = new Group();
  readonly count: number;
  #meshes: InstancedMesh[] = [];
  #materials: MeshPhysicalNodeMaterial[] = [];

  constructor(network: RoadNetwork, options: ParkedTrafficOptions = {}) {
    const tier: TierId = options.tier ?? 'C';
    const placements = computeParkedPlacements(network, options.worldSeed ?? 0);
    const budget = PARKED_BUDGET[tier];
    const byType = new Map<TrafficVehicleClass, ParkedCarPlacement[]>();
    let used = 0;
    for (const placement of placements) {
      if (used >= budget) break;
      const list = byType.get(placement.type) ?? [];
      list.push(placement);
      byType.set(placement.type, list);
      used += 1;
    }
    for (const type of TRAFFIC_VEHICLE_CLASSES) {
      const list = byType.get(type);
      if (list === undefined || list.length === 0) continue;
      const model = createTrafficVehicleModel(type);
      const paint = new MeshPhysicalNodeMaterial();
      paint.name = `parked-${type}-paint`;
      paint.color.setHex(model.bodyColor);
      paint.metalness = 0.16;
      paint.roughness = 0.5;
      paint.clearcoat = 0.25;
      paint.clearcoatRoughness = 0.3;
      this.#materials.push(paint);
      const trim = new MeshPhysicalNodeMaterial();
      trim.name = `parked-${type}-trim`;
      trim.color.setHex(0x14171a);
      trim.roughness = 0.7;
      this.#materials.push(trim);
      const accent = new MeshPhysicalNodeMaterial();
      accent.name = `parked-${type}-accent`;
      accent.color.setHex(0x9aa2ab);
      accent.metalness = 0.7;
      accent.roughness = 0.35;
      this.#materials.push(accent);
      const mesh = new InstancedMesh(model.geometry, [paint, trim, accent], list.length);
      mesh.name = `parked-traffic-${type}`;
      mesh.frustumCulled = false;
      const matrix = new Matrix4();
      const position = new Vector3();
      const quaternion = new Quaternion();
      const scale = new Vector3(1, 1, 1);
      for (let i = 0; i < list.length; i += 1) {
        const p = list[i]!;
        position.set(p.x, p.y, p.z);
        quaternion.set(0, Math.sin(p.yaw), 0, Math.cos(p.yaw)).normalize();
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.#meshes.push(mesh);
      this.root.add(mesh);
    }
    this.count = used;
  }

  dispose(): void {
    for (const mesh of this.#meshes) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    for (const material of this.#materials) {
      material.dispose();
    }
    this.#meshes = [];
    this.#materials = [];
    this.root.removeFromParent();
  }
}
