/**
 * Phase 10 pass 4 — the underground parking garage renderer: streamed visuals + static
 * collision for the pits carved by `planGarages` (see `road-network.ts`).
 *
 * The physics floor IS the terrain: the entrance ramp and the flat pit floor are road
 * carves, so this class only adds what a heightfield cannot — the roof slab (with its
 * entrance shaft), the rim and shaft walls, the columns, the parked cars, the "P" portal
 * and the light strips. Everything is instanced boxes over the existing architectural /
 * emissive material families, streamed exactly like the hideouts.
 *
 * Local frame (the group carries the pit yaw): +z is the ramp direction (from the
 * entrance node toward the pit centre), the entrance lands at z = -24 and the pit spans
 * x ∈ [-34, 34], z ∈ [-44, 44]. The car drives a one-way serpentine of narrow aisles
 * (class `garage`, at floor level) with nose-in bays between the rows.
 */
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Mesh,
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
import type { GarageSpec } from './road-network';

const BUILD_DISTANCE_METERS = 3000;
const DISPOSE_DISTANCE_METERS = 5200;
/** The entrance lands this far inside the pit edge (local z = -halfDepth + 20). */
const ENTRY_INSET_METERS = 20;
const SHAFT_HALF_WIDTH = 5.5;
const CAR_PAINTS = [0x9aa2ab, 0x2b3a55, 0x5a2b2b, 0x303338, 0xc8c2b6, 0x2f4a3a];

function pick(a: number, b: number, c: number, seed: number): number {
  let h = (seed ^ (a * 0x9e3779b9) ^ (b * 0x85ebca6b) ^ (c * 0xc2b2ae35)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

interface BuiltGarage {
  readonly group: Group;
  readonly boxes: StaticBuildingBox[];
  readonly geometries: BufferGeometry[];
  readonly materials: Material[];
  readonly cars: number;
}

export class GarageWorld {
  readonly root = new Group();
  readonly #garages: readonly GarageSpec[];
  readonly #sampler: TerrainSampler;
  readonly #nightGain: UniformNode<'float', number> = uniform(1);
  #built = new Map<string, BuiltGarage>();
  #disposed = false;

  constructor(garages: readonly GarageSpec[], sampler: TerrainSampler) {
    this.#garages = garages;
    this.#sampler = sampler;
    this.root.name = 'garages';
  }

  setDaylight(state: DaylightState): void {
    this.#nightGain.value = resolveUrbanNightGain(state.sunElevationDegrees);
  }

  update(focus: { readonly x: number; readonly z: number }): void {
    if (this.#disposed) return;
    for (const spec of this.#garages) {
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

  /** Static collision in world space (same contract as town/Aohara hits). */
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
      garagesPlaced: this.#garages.length,
      garagesBuilt: this.#built.size,
      garageCars: [...this.#built.values()].reduce((sum, g) => sum + g.cars, 0),
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

  #buildOne(spec: GarageSpec): void {
    if (spec.floorYs.length < 1) return;
    const group = new Group();
    group.name = `garage-${spec.id}`;
    group.position.set(spec.x, 0, spec.z);
    group.rotation.y = spec.yaw;
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];

    const concrete = createArchitecturalMaterial({
      name: `garage-concrete-${spec.id}`,
      colorHex: 0x6d747b,
      roughness: 0.9,
      metalness: 0.03,
      detailAmplitude: 0.03,
      clearcoat: 0.02,
      clearcoatRoughness: 0.7,
    });
    const darkConcrete = createArchitecturalMaterial({
      name: `garage-dark-concrete-${spec.id}`,
      colorHex: 0x4a5057,
      roughness: 0.94,
      metalness: 0.02,
      detailAmplitude: 0.04,
      clearcoat: 0.02,
      clearcoatRoughness: 0.7,
    });
    // Light strips: readable in daylight, carrying the lit look at night.
    const stripMaterial = new MeshBasicNodeMaterial();
    stripMaterial.name = `garage-strips-${spec.id}`;
    stripMaterial.toneMapped = false;
    const stripColor = new Color(0xfff3d6);
    const stripColorU = uniform(new Vector3(stripColor.r, stripColor.g, stripColor.b), 'vec3');
    stripMaterial.colorNode = vec4(stripColorU.mul(this.#nightGain).mul(1.15), 1);
    // The portal sign face (blue plate).
    const signMaterial = new MeshBasicNodeMaterial();
    signMaterial.name = `garage-sign-${spec.id}`;
    signMaterial.toneMapped = false;
    const signColor = new Color(0x1d4ed8);
    const signColorU = uniform(new Vector3(signColor.r, signColor.g, signColor.b), 'vec3');
    signMaterial.colorNode = vec4(signColorU.mul(this.#nightGain).mul(1.5), 1);
    const signWhite = new MeshBasicNodeMaterial();
    signWhite.name = `garage-sign-p-${spec.id}`;
    signWhite.toneMapped = false;
    const whiteColor = new Color(0xf5f7fa);
    const whiteColorU = uniform(new Vector3(whiteColor.r, whiteColor.g, whiteColor.b), 'vec3');
    signWhite.colorNode = vec4(whiteColorU.mul(this.#nightGain).mul(1.4), 1);
    materials.push(concrete, darkConcrete, stripMaterial, signMaterial, signWhite);

    const boxGeometry = new BoxGeometry(1, 1, 1);
    geometries.push(boxGeometry);
    const transform = new Object3D();
    const boxes: StaticBuildingBox[] = [];
    const cars = this.#buildGarage(
      spec,
      group,
      concrete,
      darkConcrete,
      stripMaterial,
      signMaterial,
      signWhite,
      boxGeometry,
      transform,
      boxes,
      materials,
      geometries,
    );

    this.root.add(group);
    this.#built.set(spec.id, { group, boxes, geometries, materials, cars });
  }

  #buildGarage(
    spec: GarageSpec,
    group: Group,
    concrete: Material,
    darkConcrete: Material,
    stripMaterial: Material,
    signMaterial: Material,
    signWhite: Material,
    boxGeometry: BoxGeometry,
    transform: Object3D,
    boxes: StaticBuildingBox[],
    materials: Material[],
    geometries: BufferGeometry[],
  ): number {
    const floorY = spec.floorYs[0]!;
    const halfW = spec.pit.halfWidth;
    const halfD = spec.pit.halfDepth;
    const entryZ = -halfD + ENTRY_INSET_METERS; // -24
    const slabTop = spec.entranceY + 0.06;
    const slabThickness = 1.5;
    const slabMid = slabTop - slabThickness / 2;
    const slabBottom = slabTop - slabThickness;
    const cos = Math.cos(spec.yaw);
    const sin = Math.sin(spec.yaw);
    const groundH = (lx: number, lz: number): number =>
      this.#sampler.heightAt(spec.x + lx * cos - lz * sin, spec.z + lx * sin + lz * cos);
    const toWorldBox = (lx: number, lz: number, hx: number, hz: number): void => {
      boxes.push({
        x: spec.x + lx * cos - lz * sin,
        z: spec.z + lx * sin + lz * cos,
        yaw: spec.yaw,
        halfWidth: hx,
        halfDepth: hz,
      });
    };

    // Roof slab: the whole pit at street level, split around the entrance shaft
    // (x ∈ [-5.5, 5.5], from the edge to just past the ramp landing at z = -20).
    const overhang = 0.6;
    const shaftEndZ = entryZ + 4; // -20
    const slab = new InstancedMesh(boxGeometry, concrete, 4);
    slab.name = `garage-slab-${spec.id}`;
    slab.frustumCulled = false;
    let slabCount = 0;
    const slabPut = (sx: number, sz: number, lx: number, lz: number): void => {
      transform.position.set(lx, slabMid, lz);
      transform.scale.set(sx, slabThickness, sz);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      if (slabCount < slab.count) slab.setMatrixAt(slabCount++, transform.matrix);
    };
    slabPut(halfW * 2 + overhang, halfD - shaftEndZ + overhang / 2, 0, (halfD + shaftEndZ) / 2);
    const southDepth = -shaftEndZ - halfD + overhang / 2;
    for (const side of [-1, 1]) {
      const panelW = halfW - SHAFT_HALF_WIDTH - overhang / 2;
      slabPut(
        panelW,
        southDepth,
        side * (SHAFT_HALF_WIDTH + panelW / 2),
        (-halfD + -shaftEndZ) / 2,
      );
    }
    slab.count = slabCount;
    slab.instanceMatrix.needsUpdate = true;
    group.add(slab);

    // Rim walls: 4 m segments hugging the pit edge, following the terrain and leaving
    // gaps where a street crosses the footprint (that street is its own causeway) or
    // where the entrance shaft opens.
    const rim = new InstancedMesh(boxGeometry, darkConcrete, 96);
    rim.name = `garage-rim-${spec.id}`;
    rim.frustumCulled = false;
    let rimCount = 0;
    const network = this.#sampler.roadNetwork;
    const SEG = 4;
    const rimSeg = (lx: number, lz: number, alongX: boolean): void => {
      const sample = network?.sample(spec.x + lx * cos - lz * sin, spec.z + lx * sin + lz * cos);
      const streetHere =
        sample !== undefined && sample !== null && sample.roadClass !== 'garage'
          ? sample.distance < sample.halfWidthMeters + 5
          : false;
      if (streetHere) return;
      const ground = groundH(lx, lz);
      const base = ground - 0.5;
      const h = 1.8;
      transform.position.set(lx, base + h / 2, lz);
      transform.scale.set(alongX ? SEG + 0.1 : 0.4, h, alongX ? 0.4 : SEG + 0.1);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      if (rimCount < rim.count) rim.setMatrixAt(rimCount++, transform.matrix);
      if (alongX) {
        toWorldBox(lx, lz, SEG / 2, 0.25);
      } else {
        toWorldBox(lx, lz, 0.25, SEG / 2);
      }
    };
    for (let s = -halfW + SEG / 2; s < halfW; s += SEG) {
      rimSeg(s, halfD + 0.25, true); // far edge (+z)
      if (Math.abs(s) >= SHAFT_HALF_WIDTH + 1) rimSeg(s, -halfD - 0.25, true); // entrance edge
    }
    for (let s = -halfD + SEG / 2; s < halfD; s += SEG) {
      rimSeg(halfW + 0.25, s, false);
      rimSeg(-halfW - 0.25, s, false);
    }
    rim.count = rimCount;
    rim.instanceMatrix.needsUpdate = true;
    group.add(rim);

    // Shaft walls + the cross wall at the landing (the ramp corridor stays open).
    const shaft = new InstancedMesh(boxGeometry, darkConcrete, 8);
    shaft.name = `garage-shaft-${spec.id}`;
    shaft.frustumCulled = false;
    let shaftCount = 0;
    const shaftPut = (
      sx: number,
      sy: number,
      sz: number,
      lx: number,
      ly: number,
      lz: number,
    ): void => {
      transform.position.set(lx, ly, lz);
      transform.scale.set(sx, sy, sz);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      if (shaftCount < shaft.count) shaft.setMatrixAt(shaftCount++, transform.matrix);
    };
    const shaftH = slabBottom - floorY;
    const shaftMidY = floorY + shaftH / 2;
    const shaftLen = -shaftEndZ - halfD; // 24
    for (const side of [-1, 1]) {
      shaftPut(
        0.3,
        shaftH,
        shaftLen + 0.4,
        side * (SHAFT_HALF_WIDTH + 0.15),
        shaftMidY,
        (-halfD + -shaftEndZ) / 2,
      );
      toWorldBox(side * (SHAFT_HALF_WIDTH + 0.15), (-halfD + -shaftEndZ) / 2, 0.2, shaftLen / 2);
    }
    // Cross wall at the landing, split around the ramp corridor (±3.6 m).
    const crossHalf = SHAFT_HALF_WIDTH - 3.6;
    for (const side of [-1, 1]) {
      shaftPut(crossHalf, shaftH, 0.3, side * (3.6 + crossHalf / 2), shaftMidY, shaftEndZ + 0.15);
      toWorldBox(side * (3.6 + crossHalf / 2), shaftEndZ + 0.15, crossHalf / 2, 0.2);
    }
    shaft.count = shaftCount;
    shaft.instanceMatrix.needsUpdate = true;
    group.add(shaft);

    // Columns: a grid supporting the roof, clear of the aisles, the bays and the ramp.
    const colH = slabBottom - floorY;
    const cols = new InstancedMesh(boxGeometry, darkConcrete, 32);
    cols.name = `garage-columns-${spec.id}`;
    cols.frustumCulled = false;
    let colCount = 0;
    const colXs = [-31, -14, 14, 31];
    const colZs = [-40, -20, 0, 20, 40];
    for (const cz of colZs) {
      for (const cx of colXs) {
        transform.position.set(cx, floorY + colH / 2, cz);
        transform.scale.set(0.55, colH, 0.55);
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        if (colCount < cols.count) cols.setMatrixAt(colCount++, transform.matrix);
        toWorldBox(cx, cz, 0.3, 0.3);
      }
    }
    cols.count = colCount;
    cols.instanceMatrix.needsUpdate = true;
    group.add(cols);

    // Light strips along both edges of every aisle row.
    const strips = new InstancedMesh(boxGeometry, stripMaterial, 32);
    strips.name = `garage-light-strips-${spec.id}`;
    strips.frustumCulled = false;
    let stripCount = 0;
    for (const row of spec.aisleZs) {
      for (const side of [-1, 1]) {
        transform.position.set(0, floorY + 0.07, row + side * 2.3);
        transform.scale.set(halfW - 5, 0.08, 0.2);
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        if (stripCount < strips.count) strips.setMatrixAt(stripCount++, transform.matrix);
      }
    }
    strips.count = stripCount;
    strips.instanceMatrix.needsUpdate = true;
    group.add(strips);

    // The "P" portal above the shaft, facing the approaching street.
    const sign = new Group();
    sign.name = `garage-sign-${spec.id}`;
    sign.position.set(0, slabTop + 1.15, -halfD - 0.4);
    const plateGeo = new BoxGeometry(3.2, 2.0, 0.25);
    geometries.push(plateGeo);
    const plate = new Mesh(plateGeo, signMaterial);
    sign.add(plate);
    const pBars: [number, number, number, number][] = [
      // width, height, x, y
      [0.34, 1.15, -0.55, -0.05],
      [0.95, 0.34, 0.12, 0.4],
      [0.34, 0.42, 0.42, 0.06],
    ];
    for (const [w, h, px, py] of pBars) {
      const barGeo = new BoxGeometry(w, h, 0.08);
      geometries.push(barGeo);
      const bar = new Mesh(barGeo, signWhite);
      bar.position.set(px, py, 0.17);
      sign.add(bar);
    }
    group.add(sign);

    // Parked cars: nose-in rows in the bays between the aisle rows, on the pit floor.
    // (The car's long axis is local z, so yaw 0/π points the noses at the aisles.)
    const carModel = createTrafficVehicleModel('passenger-car');
    const trimMaterial = new MeshPhysicalNodeMaterial();
    trimMaterial.name = `garage-car-trim-${spec.id}`;
    trimMaterial.color.setHex(0x14171a);
    trimMaterial.roughness = 0.7;
    const accentMaterial = new MeshPhysicalNodeMaterial();
    accentMaterial.name = `garage-car-accent-${spec.id}`;
    accentMaterial.color.setHex(0x9aa2ab);
    accentMaterial.metalness = 0.7;
    accentMaterial.roughness = 0.35;
    materials.push(trimMaterial, accentMaterial);

    const seed = Math.abs(spec.id.charCodeAt(1) ?? 7) * 1013 + 17;
    const carBatches = CAR_PAINTS.map((hex, i) => {
      const paint = new MeshPhysicalNodeMaterial();
      paint.name = `garage-car-paint-${spec.id}-${i}`;
      paint.color.setHex(hex);
      paint.metalness = 0.25;
      paint.roughness = 0.5;
      const mesh = new InstancedMesh(carModel.geometry, [paint, trimMaterial, accentMaterial], 10);
      mesh.frustumCulled = false;
      materials.push(paint);
      return { mesh, count: 0 };
    });
    geometries.push(carModel.geometry);
    let cars = 0;
    const bayRows = [-39, -29, -19, -9, 1, 11, 21, 31];
    for (const row of bayRows) {
      for (let x = -28; x <= 28; x += 3.2) {
        // Keep the entrance ramp slot clear (it runs along x = 0 down to z = -24).
        if (row < -16 && Math.abs(x) < 5.5) continue;
        if (pick(row, x, 1, seed) >= 0.4) continue;
        const batch = carBatches[Math.floor(pick(row, x, 2, seed) * 12) % carBatches.length]!;
        if (batch.count >= batch.mesh.count) continue;
        const carX = x + (pick(row, x, 3, seed) - 0.5) * 0.6;
        const carZ = row + (pick(row, x, 4, seed) - 0.5) * 0.5;
        transform.position.set(carX, floorY + 0.06, carZ);
        transform.scale.set(1, 1, 1);
        transform.rotation.set(0, pick(row, x, 5, seed) > 0.5 ? Math.PI : 0, 0);
        transform.updateMatrix();
        batch.mesh.setMatrixAt(batch.count, transform.matrix);
        batch.count += 1;
        cars += 1;
        toWorldBox(carX, carZ, 1.05, 2.3);
      }
    }
    for (const batch of carBatches) {
      batch.mesh.count = batch.count;
      batch.mesh.instanceMatrix.needsUpdate = true;
      group.add(batch.mesh);
    }

    return cars;
  }
}
