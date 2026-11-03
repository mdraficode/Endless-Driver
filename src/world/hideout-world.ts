/**
 * Phase 10.2 — the hideout renderer: streamed visuals + static collision for the world's
 * secret corners (see `hideouts.ts` for placement).
 *
 * A hideout builds the first frame its cell enters 3 km of the player and disposes 5 km
 * out, the same stream-in/stream-out contract as the massing cities. All materials come
 * from the existing program families (createArchitecturalMaterial, the night-emissive
 * MeshBasicNodeMaterial pattern, the traffic paint materials), so hideouts add no new
 * shader stages.
 */
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Object3D,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { uniform, vec4 } from 'three/tsl';
import { MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, type UniformNode } from 'three/webgpu';
import { resolveUrbanNightGain } from '../config/urban-city';
import { createArchitecturalMaterial } from './architectural-materials';
import { createTrafficVehicleModel } from './traffic-vehicle-models';
import { collideCarWithStaticBoxes, type StaticBuildingBox } from './static-building-collision';
import type { TownCarProbe, TownHit } from './town';
import type { TerrainSampler } from './terrain-height';
import type { DaylightState } from '../environment/EnvironmentClock';
import type { HideoutSpec } from './hideouts';

const BUILD_DISTANCE_METERS = 3000;
const DISPOSE_DISTANCE_METERS = 5200;
const SIGN_COLORS: Readonly<Record<HideoutSpec['kind'], number>> = {
  warehouse: 0xe08037,
  junkyard: 0xd0483e,
  garage: 0x37e0c8,
};

function pick(a: number, b: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

interface BuiltHideout {
  readonly group: Group;
  readonly boxes: StaticBuildingBox[];
  readonly geometries: BufferGeometry[];
  readonly materials: Material[];
  readonly cars: number;
}

export class HideoutWorld {
  readonly root = new Group();
  readonly #hideouts: readonly HideoutSpec[];
  readonly #sampler: TerrainSampler;
  readonly #nightGain: UniformNode<'float', number> = uniform(1);
  #built = new Map<string, BuiltHideout>();
  #disposed = false;

  constructor(hideouts: readonly HideoutSpec[], sampler: TerrainSampler) {
    this.#hideouts = hideouts;
    this.#sampler = sampler;
    this.root.name = 'hideouts';
  }

  setDaylight(state: DaylightState): void {
    this.#nightGain.value = resolveUrbanNightGain(state.sunElevationDegrees);
  }

  update(focus: { readonly x: number; readonly z: number }): void {
    if (this.#disposed) return;
    for (const spec of this.#hideouts) {
      const built = this.#built.get(spec.id);
      const distance = Math.hypot(spec.x - focus.x, spec.z - focus.z);
      if (built === undefined && distance < BUILD_DISTANCE_METERS) {
        // One build per frame keeps the streaming budget honest.
        this.#buildOne(spec);
        return;
      }
      if (built !== undefined && distance > DISPOSE_DISTANCE_METERS) {
        this.#disposeOne(spec.id);
      }
    }
  }

  /** Static building collision, in world space (same contract as town/Aohara hits). */
  collideTown(car: TownCarProbe): readonly TownHit[] {
    if (this.#disposed) return [];
    const hits: TownHit[] = [];
    for (const built of this.#built.values()) {
      hits.push(...collideCarWithStaticBoxes(car, built.boxes));
    }
    return hits;
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      hideoutsPlaced: this.#hideouts.length,
      hideoutsBuilt: this.#built.size,
      hideoutCars: [...this.#built.values()].reduce((sum, b) => sum + b.cars, 0),
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const id of [...this.#built.keys()]) {
      this.#disposeOne(id);
    }
    this.#nightGain.dispose?.();
    this.root.removeFromParent();
  }

  #disposeOne(id: string): void {
    const built = this.#built.get(id);
    if (built === undefined) return;
    built.group.removeFromParent();
    for (const geometry of built.geometries) geometry.dispose();
    for (const material of built.materials) material.dispose();
    this.#built.delete(id);
  }

  #buildOne(spec: HideoutSpec): void {
    const groundY = this.#sampler.heightAt(spec.x, spec.z);
    const group = new Group();
    group.name = `hideout-${spec.kind}-${spec.id}`;
    group.position.set(spec.x, groundY, spec.z);
    group.rotation.y = spec.yaw;
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];

    const concrete = createArchitecturalMaterial({
      name: `hideout-concrete-${spec.id}`,
      colorHex: 0x70767c,
      roughness: 0.92,
      metalness: 0.02,
      detailAmplitude: 0.02,
      clearcoat: 0.03,
      clearcoatRoughness: 0.6,
    });
    const darkMetal = createArchitecturalMaterial({
      name: `hideout-dark-metal-${spec.id}`,
      colorHex: 0x343b44,
      roughness: 0.55,
      metalness: 0.5,
      detailAmplitude: 0.012,
      clearcoat: 0.15,
      clearcoatRoughness: 0.4,
    });
    const signMaterial = new MeshBasicNodeMaterial();
    signMaterial.name = `hideout-sign-${spec.id}`;
    signMaterial.toneMapped = false;
    const signColor = new Color(SIGN_COLORS[spec.kind]);
    const signColorU = uniform(new Vector3(signColor.r, signColor.g, signColor.b), 'vec3');
    signMaterial.colorNode = vec4(signColorU.mul(this.#nightGain).mul(1.6), 1);
    materials.push(concrete, darkMetal, signMaterial);

    const boxGeometry = new BoxGeometry(1, 1, 1);
    geometries.push(boxGeometry);
    const transform = new Object3D();
    const boxes: StaticBuildingBox[] = [];

    let cars: number;
    if (spec.kind === 'garage') {
      cars = this.#buildGarage(spec, group, concrete, signMaterial, boxGeometry, transform, boxes);
    } else if (spec.kind === 'warehouse') {
      cars = this.#buildWarehouse(
        spec,
        group,
        concrete,
        darkMetal,
        signMaterial,
        boxGeometry,
        transform,
        boxes,
      );
    } else {
      cars = this.#buildJunkyard(
        spec,
        group,
        concrete,
        darkMetal,
        signMaterial,
        boxGeometry,
        transform,
        boxes,
        materials,
      );
    }

    this.root.add(group);
    this.#built.set(spec.id, { group, boxes, geometries, materials, cars });
  }

  /** A fence ring (2 m posts, two rails) with an entry gap on the -z side. */
  #buildFence(
    group: Group,
    material: Material,
    width: number,
    depth: number,
    transform: Object3D,
  ): void {
    const postGeometry = new BoxGeometry(0.09, 1.15, 0.09);
    const railGeometry = new BoxGeometry(1, 0.06, 0.05);
    const halfW = width / 2;
    const halfD = depth / 2;
    const gapHalf = 3;
    const posts: { x: number; z: number }[] = [];
    const rails: { x: number; z: number; axis: 0 | 1; y: number }[] = [];
    for (let s = -halfW; s < halfW; s += 2) {
      for (const fixed of [-halfD, halfD]) {
        posts.push({ x: s, z: fixed });
        rails.push({ x: s, z: fixed, axis: 0, y: 0.35 });
        rails.push({ x: s, z: fixed, axis: 0, y: 0.85 });
      }
    }
    for (let s = -halfD; s < halfD; s += 2) {
      for (const fixed of [-halfW, halfW]) {
        posts.push({ x: fixed, z: s });
        rails.push({ x: fixed, z: s, axis: 1, y: 0.35 });
        rails.push({ x: fixed, z: s, axis: 1, y: 0.85 });
      }
    }
    // Entry gap: drop the posts/rails on the -z side within `gapHalf` of the centre.
    const inGap = (r: { x: number; z: number }): boolean =>
      r.z < -halfD + 0.6 && Math.abs(r.x) < gapHalf;
    const keptPosts = posts.filter((p) => !inGap(p));
    const keptRails = rails.filter((r) => !inGap(r));
    const postsMesh = new InstancedMesh(postGeometry, material, Math.max(1, keptPosts.length));
    const railsMesh = new InstancedMesh(railGeometry, material, Math.max(1, keptRails.length));
    keptPosts.forEach((p, i) => {
      transform.position.set(p.x, 0.57, p.z);
      transform.scale.set(1, 1, 1);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      postsMesh.setMatrixAt(i, transform.matrix);
    });
    keptRails.forEach((r, i) => {
      transform.position.set(r.x, r.y, r.z);
      transform.scale.set(r.axis === 0 ? 2 : 0.05, 1, r.axis === 0 ? 0.05 : 2);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      railsMesh.setMatrixAt(i, transform.matrix);
    });
    postsMesh.count = keptPosts.length;
    railsMesh.count = keptRails.length;
    postsMesh.instanceMatrix.needsUpdate = true;
    railsMesh.instanceMatrix.needsUpdate = true;
    postsMesh.frustumCulled = false;
    railsMesh.frustumCulled = false;
    group.add(postsMesh);
    group.add(railsMesh);
  }

  /** One InstancedMesh of traffic cars with the three-group paint/trim/accent materials. */
  #carBatch(
    materials: Material[],
    spec: HideoutSpec,
    label: string,
  ): [Material, Material, Material] {
    const paint = new MeshPhysicalNodeMaterial();
    paint.name = `hideout-${label}-paint-${spec.id}`;
    paint.metalness = 0.2;
    paint.roughness = 0.5;
    const trim = new MeshPhysicalNodeMaterial();
    trim.name = `hideout-${label}-trim-${spec.id}`;
    trim.color.setHex(0x14171a);
    trim.roughness = 0.7;
    const accent = new MeshPhysicalNodeMaterial();
    accent.name = `hideout-${label}-accent-${spec.id}`;
    accent.color.setHex(0x9aa2ab);
    accent.metalness = 0.7;
    accent.roughness = 0.35;
    materials.push(paint, trim, accent);
    return [paint, trim, accent];
  }

  #buildGarage(
    spec: HideoutSpec,
    group: Group,
    concrete: Material,
    signMaterial: Material,
    boxGeometry: BoxGeometry,
    transform: Object3D,
    boxes: StaticBuildingBox[],
  ): number {
    const width = 52;
    const depth = 40;
    const halfW = width / 2;
    const halfD = depth / 2;
    // Everything sits on the pit bowl (the terrain IS the lot floor), so every part
    // takes its height from the shared sampler — nothing floats, nothing gets buried.
    const floorY = group.position.y;
    const cos = Math.cos(spec.yaw);
    const sin = Math.sin(spec.yaw);
    const groundH = (lx: number, lz: number): number =>
      this.#sampler.heightAt(spec.x + lx * cos - lz * sin, spec.z + lx * sin + lz * cos) - floorY;
    const slab = new InstancedMesh(boxGeometry, concrete, 64);
    slab.name = `hideout-garage-${spec.id}`;
    slab.frustumCulled = false;
    let slabCount = 0;
    const put = (
      sx: number,
      sy: number,
      sz: number,
      lx: number,
      ly: number,
      lz: number,
      rotY = 0,
      rotZ = 0,
    ): void => {
      transform.position.set(lx, ly, lz);
      transform.scale.set(sx, sy, sz);
      transform.rotation.set(0, rotY, rotZ);
      transform.updateMatrix();
      if (slabCount < slab.count) slab.setMatrixAt(slabCount++, transform.matrix);
    };
    // Rim walls: 4 m segments that follow the bowl, 0.8 m proud of the local terrain and
    // sunk 0.3 m below it. The entry gap (~8 m) stays open on the -z side.
    const seg = 4;
    const wall = (lx: number, lz: number, alongX: boolean): void => {
      const h = groundH(lx, lz) + 0.8;
      const base = -0.3;
      if (alongX) {
        put(seg + 0.1, h - base, 0.8, lx, base + (h - base) / 2, lz);
      } else {
        put(0.8, h - base, seg + 0.1, lx, base + (h - base) / 2, lz);
      }
    };
    for (let x = -halfW + seg / 2; x < halfW; x += seg) {
      wall(x, halfD, true);
      if (Math.abs(x) >= 2.5) wall(x, -halfD, true);
    }
    for (let z = -halfD + seg / 2; z < halfD; z += seg) {
      wall(halfW, z, false);
      wall(-halfW, z, false);
    }
    // Canopy over the rear two-thirds, on four columns that rise from the bowl.
    put(width - 8, 0.9, depth - 12, 0, 5.6, 5, 0, 0);
    for (const cx of [-halfW + 3, halfW - 3]) {
      for (const cz of [-halfD + 5, halfD - 3]) {
        const base = groundH(cx, cz);
        put(0.5, 5.6 - base, 0.5, cx, base + (5.6 - base) / 2, cz);
      }
    }
    slab.count = slabCount;
    slab.instanceMatrix.needsUpdate = true;
    group.add(slab);
    // The neon marker bar above the entry, at grade with the bowl rim.
    const sign = new InstancedMesh(boxGeometry, signMaterial, 1);
    transform.position.set(0, groundH(0, -halfD - 0.5) + 1.6, -halfD - 0.5);
    transform.scale.set(7, 0.5, 0.3);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    sign.setMatrixAt(0, transform.matrix);
    sign.instanceMatrix.needsUpdate = true;
    sign.frustumCulled = false;
    group.add(sign);
    // Parked cars on the pit floor, the centre bay left open.
    const carModel = createTrafficVehicleModel('passenger-car');
    const [paint, trim, accent] = this.#carBatch([], spec, 'garage-car');
    void trim;
    void accent;
    let cars = 0;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if (row === 1 && col === 1) continue;
        const cx = (col - 1) * 7 + (pick(row, col, spec.seed) - 0.5) * 1.5;
        const cz = (row - 1) * 7 + (pick(row, col + 9, spec.seed) - 0.5) * 1.5;
        const car = new InstancedMesh(carModel.geometry, [paint, trim, accent], 1);
        transform.position.set(cx, groundH(cx, cz) + 0.05, cz);
        transform.scale.set(1, 1, 1);
        transform.rotation.set(0, (pick(row, col + 7, spec.seed) - 0.5) * 0.8, 0);
        transform.updateMatrix();
        car.setMatrixAt(0, transform.matrix);
        car.instanceMatrix.needsUpdate = true;
        car.frustumCulled = false;
        group.add(car);
        cars += 1;
      }
    }
    // Collision: the rim walls in world space (the group carries the yaw).
    const addWall = (lx: number, lz: number, hx: number, hz: number): void => {
      boxes.push({
        x: spec.x + lx * cos - lz * sin,
        z: spec.z + lx * sin + lz * cos,
        yaw: spec.yaw,
        halfWidth: hx,
        halfDepth: hz,
      });
    };
    addWall(0, halfD, width / 2, 0.5);
    addWall(halfW, 0, 0.5, depth / 2);
    addWall(-halfW, 0, 0.5, depth / 2);
    addWall(-(3 + (halfW - 3) / 2), -halfD, (halfW - 3) / 2, 0.5);
    addWall(3 + (halfW - 3) / 2, -halfD, (halfW - 3) / 2, 0.5);
    return cars;
  }

  #buildWarehouse(
    spec: HideoutSpec,
    group: Group,
    concrete: Material,
    darkMetal: Material,
    signMaterial: Material,
    boxGeometry: BoxGeometry,
    transform: Object3D,
    boxes: StaticBuildingBox[],
  ): number {
    const width = 44;
    const depth = 36;
    const shellH = 12;
    const slab = new InstancedMesh(boxGeometry, concrete, 24);
    slab.name = `hideout-warehouse-${spec.id}`;
    slab.frustumCulled = false;
    let slabCount = 0;
    const put = (
      sx: number,
      sy: number,
      sz: number,
      lx: number,
      ly: number,
      lz: number,
      rotY = 0,
      rotZ = 0,
    ): void => {
      transform.position.set(lx, ly, lz);
      transform.scale.set(sx, sy, sz);
      transform.rotation.set(0, rotY, rotZ);
      transform.updateMatrix();
      if (slabCount < slab.count) slab.setMatrixAt(slabCount++, transform.matrix);
    };
    put(width + 4, 0.3, depth + 4, 0, 0.15, 0);
    put(width, shellH, depth, 0, shellH / 2 + 0.3, 0);
    const gableAngle = Math.atan2(5, width / 2);
    const gableLength = Math.hypot(width / 2, 5);
    put(gableLength, 0.5, depth + 1, -width / 4, shellH + 2.8, 0, 0, gableAngle);
    put(gableLength, 0.5, depth + 1, width / 4, shellH + 2.8, 0, 0, -gableAngle);
    put(9, 7, 0.5, 0, 3.8, depth / 2 + 0.3);
    put(14, 0.5, 9, width / 2 + 4, 0.55, 0);
    for (let i = 0; i < 9; i += 1) {
      const size = 0.8 + pick(i, 1, spec.seed) * 1.6;
      put(
        size,
        size * 0.7,
        size,
        (pick(i, 2, spec.seed) - 0.5) * (width + 2),
        size * 0.35 + 0.3,
        depth / 2 + 2 + pick(i, 3, spec.seed) * 5,
        pick(i, 4, spec.seed) * Math.PI,
      );
    }
    slab.count = slabCount;
    slab.instanceMatrix.needsUpdate = true;
    group.add(slab);
    // Rusted trucks at the dock.
    const truckModel = createTrafficVehicleModel('rigid-truck');
    const paint = new MeshPhysicalNodeMaterial();
    paint.name = `hideout-warehouse-truck-paint-${spec.id}`;
    paint.color.setHex(0x4a4238);
    paint.metalness = 0.15;
    paint.roughness = 0.7;
    const trim = new MeshPhysicalNodeMaterial();
    trim.name = `hideout-warehouse-truck-trim-${spec.id}`;
    trim.color.setHex(0x181b1e);
    trim.roughness = 0.75;
    const accent = new MeshPhysicalNodeMaterial();
    accent.name = `hideout-warehouse-truck-accent-${spec.id}`;
    accent.color.setHex(0x6b6f75);
    accent.metalness = 0.6;
    accent.roughness = 0.4;
    for (let t = 0; t < 2; t += 1) {
      const truck = new InstancedMesh(truckModel.geometry, [paint, trim, accent], 1);
      transform.position.set(width / 2 + 5, 0.35, -8 + t * 14);
      transform.scale.set(1, 1, 1);
      transform.rotation.set(0, Math.PI / 2, 0);
      transform.updateMatrix();
      truck.setMatrixAt(0, transform.matrix);
      truck.instanceMatrix.needsUpdate = true;
      truck.frustumCulled = false;
      group.add(truck);
    }
    // Neon bar above the front.
    const sign = new InstancedMesh(boxGeometry, signMaterial, 1);
    transform.position.set(0, 8.5, depth / 2 + 0.8);
    transform.scale.set(6, 0.5, 0.3);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    sign.setMatrixAt(0, transform.matrix);
    sign.instanceMatrix.needsUpdate = true;
    sign.frustumCulled = false;
    group.add(sign);
    this.#buildFence(group, darkMetal, width + 16, depth + 16, transform);
    boxes.push({ x: spec.x, z: spec.z, yaw: spec.yaw, halfWidth: width / 2, halfDepth: depth / 2 });
    return 2;
  }

  #buildJunkyard(
    spec: HideoutSpec,
    group: Group,
    concrete: Material,
    darkMetal: Material,
    signMaterial: Material,
    boxGeometry: BoxGeometry,
    transform: Object3D,
    boxes: StaticBuildingBox[],
    materials: Material[],
  ): number {
    const width = 52;
    const depth = 40;
    const halfW = width / 2;
    const halfD = depth / 2;
    const pad = new InstancedMesh(boxGeometry, concrete, 1);
    transform.position.set(0, 0.12, 0);
    transform.scale.set(width, 0.25, depth);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    pad.setMatrixAt(0, transform.matrix);
    pad.instanceMatrix.needsUpdate = true;
    pad.frustumCulled = false;
    pad.name = `hideout-junkyard-${spec.id}`;
    group.add(pad);
    // Car shells: two ground rows plus an irregular rusted tier.
    const carModel = createTrafficVehicleModel('passenger-car');
    const [paint, trim, accent] = this.#carBatch(materials, spec, 'junkyard-car');
    let cars = 0;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (row === 2 && col % 2 === 1) continue;
        const cx = (col - 2) * 3.4 + (pick(row, col, spec.seed) - 0.5) * 0.8;
        const cz = (row - 1) * 3.2 + (pick(row, col + 3, spec.seed) - 0.5) * 0.8;
        const stacked = row === 2;
        const car = new InstancedMesh(carModel.geometry, [paint, trim, accent], 1);
        transform.position.set(cx, stacked ? 1.35 : 0.28, cz);
        transform.scale.set(1, 1, 1);
        transform.rotation.set(
          (pick(row, col + 5, spec.seed) - 0.5) * (stacked ? 0.5 : 0.16),
          (pick(row, col + 6, spec.seed) - 0.5) * 1.2,
          (pick(row, col + 7, spec.seed) - 0.5) * (stacked ? 0.5 : 0.16),
        );
        transform.updateMatrix();
        car.setMatrixAt(0, transform.matrix);
        car.instanceMatrix.needsUpdate = true;
        car.frustumCulled = false;
        group.add(car);
        cars += 1;
      }
    }
    // Shipping containers, the last two stacked.
    const containerColors = [0x7c4a3a, 0x3a5a7c, 0x557c3a];
    for (let i = 0; i < 6; i += 1) {
      const stacked = i >= 4;
      const containerMaterial = new MeshPhysicalNodeMaterial();
      containerMaterial.name = `hideout-container-${spec.id}-${i}`;
      containerMaterial.color.setHex(containerColors[i % 3] ?? 0x7c4a3a);
      containerMaterial.metalness = 0.4;
      containerMaterial.roughness = 0.6;
      materials.push(containerMaterial);
      const container = new InstancedMesh(boxGeometry, containerMaterial, 1);
      transform.position.set(((i % 3) - 1) * 6.8, (stacked ? 2.6 : 1.3) + 0.25, -halfD + 6);
      transform.scale.set(6, 2.6, 2.4);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      container.setMatrixAt(0, transform.matrix);
      container.instanceMatrix.needsUpdate = true;
      container.frustumCulled = false;
      group.add(container);
    }
    // Neon marker at the fence.
    const sign = new InstancedMesh(boxGeometry, signMaterial, 1);
    transform.position.set(0, 1.8, -halfD - 0.5);
    transform.scale.set(5, 0.5, 0.3);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    sign.setMatrixAt(0, transform.matrix);
    sign.instanceMatrix.needsUpdate = true;
    sign.frustumCulled = false;
    group.add(sign);
    this.#buildFence(group, darkMetal, width, depth, transform);
    const cos = Math.cos(spec.yaw);
    const sin = Math.sin(spec.yaw);
    const addWall = (lx: number, lz: number, hx: number, hz: number): void => {
      boxes.push({
        x: spec.x + lx * cos - lz * sin,
        z: spec.z + lx * sin + lz * cos,
        yaw: spec.yaw,
        halfWidth: hx,
        halfDepth: hz,
      });
    };
    addWall(0, halfD, halfW, 0.5);
    addWall(halfW, 0, 0.5, halfD);
    addWall(-halfW, 0, 0.5, halfD);
    addWall(-(3 + (halfW - 3) / 2), -halfD, (halfW - 3) / 2, 0.5);
    addWall(3 + (halfW - 3) / 2, -halfD, (halfW - 3) / 2, 0.5);
    return cars;
  }
}
