/**
 * Phase 7.3 — the fauna visuals: the procedural animal meshes, the run-cycle rig, the
 * rustle/dust, and the monkey leaves. The charge *truth* lives in `FaunaField`; this
 * world only mirrors it one frame behind (the field advances pre-physics, the stream
 * hooks run post-physics — 16 ms, invisible at these speeds).
 *
 * Everything is built from boxes: one shared geometry set per species, cloned per active
 * charge (at most one charge at a time), and the particle work — dust and leaves — runs
 * on two instanced meshes so the whole effect is two draw calls.
 */
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import type { TerrainSampler } from './terrain-height';
import type { FaunaField } from './fauna';
import type { FaunaCharge, FaunaLeafEvent } from './fauna';

const DUST_POOL = 20;
const LEAF_POOL = 24;
const DUST_LIFE = 0.5;
const LEAF_LIFE = 1.2;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  spin: number;
  active: boolean;
}

function createPool(size: number): Particle[] {
  return Array.from({ length: size }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    age: 0,
    life: 1,
    spin: 0,
    active: false,
  }));
}

/** Shared per-species geometry; the charge groups clone the parts, not the buffers. */
interface SpeciesKit {
  readonly parts: {
    geometry: BoxGeometry;
    material: MeshLambertMaterial;
    /** Local offset + rotation (run pivot) for each body part. */
    transform: {
      position: [number, number, number];
      rotationY: number;
      /** 0 = fixed to the body, 1 = a leg (swings), 2 = the head (nods). */
      kind: 0 | 1 | 2;
    };
  }[];
  /** The leg part indexes (alternating diagonal swing phase). */
  readonly legs: number[];
  readonly head: number;
  /** Troop cluster offsets for the monkey group. */
  readonly cluster?: { x: number; z: number; yaw: number }[];
  readonly dispose: () => void;
}

function boxMaterial(color: number): MeshLambertMaterial {
  return new MeshLambertMaterial({ color });
}

function buildBoarKit(): SpeciesKit {
  const geos: BoxGeometry[] = [
    new BoxGeometry(0.78, 0.62, 1.4), // body
    new BoxGeometry(0.44, 0.42, 0.5), // head
    new BoxGeometry(0.22, 0.18, 0.28), // snout
    new BoxGeometry(0.05, 0.1, 0.12), // tusks (×2)
    new BoxGeometry(0.12, 0.1, 0.12), // ears (×2)
  ];
  const legGeo = new BoxGeometry(0.17, 0.58, 0.17);
  const bodyMat = boxMaterial(0x59452f);
  const legMat = boxMaterial(0x3a2d1e);
  const snoutMat = boxMaterial(0x6d5842);
  const tuskMat = boxMaterial(0xcfc4ae);
  const legs: number[] = [];
  const parts: SpeciesKit['parts'] = [
    {
      geometry: geos[0]!,
      material: bodyMat,
      transform: { position: [0, 0.62, 0], rotationY: 0, kind: 0 },
    },
    {
      geometry: geos[1]!,
      material: bodyMat,
      transform: { position: [0, 0.72, 0.92], rotationY: 0, kind: 2 },
    },
    {
      geometry: geos[2]!,
      material: snoutMat,
      transform: { position: [0, 0.6, 1.28], rotationY: 0, kind: 2 },
    },
    {
      geometry: geos[3]!,
      material: tuskMat,
      transform: { position: [-0.12, 0.5, 1.34], rotationY: 0.5, kind: 2 },
    },
    {
      geometry: geos[3]!,
      material: tuskMat,
      transform: { position: [0.12, 0.5, 1.34], rotationY: -0.5, kind: 2 },
    },
    {
      geometry: geos[4]!,
      material: bodyMat,
      transform: { position: [-0.13, 0.98, 0.78], rotationY: 0, kind: 2 },
    },
    {
      geometry: geos[4]!,
      material: bodyMat,
      transform: { position: [0.13, 0.98, 0.78], rotationY: 0, kind: 2 },
    },
  ];
  const legSpots: [number, number][] = [
    [-0.28, 0.5],
    [0.28, 0.5],
    [-0.28, -0.5],
    [0.28, -0.5],
  ];
  for (const [lx, lz] of legSpots) {
    parts.push({
      geometry: legGeo,
      material: legMat,
      transform: { position: [lx, 0.29, lz], rotationY: 0, kind: 1 },
    });
    legs.push(parts.length - 1);
  }
  const geoms = [...geos, legGeo];
  const mats = [bodyMat, legMat, snoutMat, tuskMat];
  return {
    parts,
    legs,
    head: 1,
    dispose: () => {
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

function buildDeerKit(): SpeciesKit {
  const geos: BoxGeometry[] = [
    new BoxGeometry(0.55, 0.5, 1.2), // body
    new BoxGeometry(0.18, 0.55, 0.2), // neck
    new BoxGeometry(0.24, 0.26, 0.42), // head
    new BoxGeometry(0.035, 0.4, 0.035), // antler stems (×2)
    new BoxGeometry(0.22, 0.035, 0.035), // antler tips (×2)
    new BoxGeometry(0.09, 0.12, 0.1), // tail
  ];
  const legGeo = new BoxGeometry(0.1, 0.72, 0.1);
  const bodyMat = boxMaterial(0x8a6a48);
  const legMat = boxMaterial(0x6d5238);
  const antlerMat = boxMaterial(0x77683f);
  const legs: number[] = [];
  const parts: SpeciesKit['parts'] = [
    {
      geometry: geos[0]!,
      material: bodyMat,
      transform: { position: [0, 0.86, 0], rotationY: 0, kind: 0 },
    },
    {
      geometry: geos[1]!,
      material: bodyMat,
      transform: { position: [0, 1.12, 0.62], rotationY: 0, kind: 2 },
    },
    {
      geometry: geos[2]!,
      material: bodyMat,
      transform: { position: [0, 1.34, 0.78], rotationY: 0, kind: 2 },
    },
    {
      geometry: geos[3]!,
      material: antlerMat,
      transform: { position: [-0.09, 1.62, 0.72], rotationY: 0, kind: 2 },
    },
    {
      geometry: geos[3]!,
      material: antlerMat,
      transform: { position: [0.09, 1.62, 0.72], rotationY: 0, kind: 2 },
    },
    {
      geometry: geos[4]!,
      material: antlerMat,
      transform: { position: [-0.17, 1.78, 0.7], rotationY: 0.5, kind: 2 },
    },
    {
      geometry: geos[4]!,
      material: antlerMat,
      transform: { position: [0.17, 1.78, 0.7], rotationY: -0.5, kind: 2 },
    },
    {
      geometry: geos[5]!,
      material: bodyMat,
      transform: { position: [0, 1.0, -0.62], rotationY: 0, kind: 0 },
    },
  ];
  const legSpots: [number, number][] = [
    [-0.2, 0.45],
    [0.2, 0.45],
    [-0.2, -0.45],
    [0.2, -0.45],
  ];
  for (const [lx, lz] of legSpots) {
    parts.push({
      geometry: legGeo,
      material: legMat,
      transform: { position: [lx, 0.36, lz], rotationY: 0, kind: 1 },
    });
    legs.push(parts.length - 1);
  }
  const geoms = [...geos, legGeo];
  const mats = [bodyMat, legMat, antlerMat];
  return {
    parts,
    legs,
    head: 2,
    dispose: () => {
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

function buildMonkeyKit(troopSize: number): SpeciesKit {
  const geos: BoxGeometry[] = [
    new BoxGeometry(0.24, 0.2, 0.34), // body
    new BoxGeometry(0.17, 0.17, 0.19), // head
    new BoxGeometry(0.04, 0.04, 0.3), // tail
  ];
  const legGeo = new BoxGeometry(0.055, 0.26, 0.055);
  const bodyMat = boxMaterial(0x4a4038);
  const faceMat = boxMaterial(0x8a7a68);
  const legs: number[] = [];
  const parts: SpeciesKit['parts'] = [
    {
      geometry: geos[0]!,
      material: bodyMat,
      transform: { position: [0, 0.38, 0], rotationY: 0, kind: 0 },
    },
    {
      geometry: geos[1]!,
      material: faceMat,
      transform: { position: [0, 0.58, 0.14], rotationY: 0, kind: 2 },
    },
    {
      geometry: geos[2]!,
      material: bodyMat,
      transform: { position: [0, 0.34, -0.28], rotationY: 0, kind: 1 },
    },
  ];
  const legSpots: [number, number][] = [
    [-0.11, 0.12],
    [0.11, 0.12],
    [-0.11, -0.12],
    [0.11, -0.12],
  ];
  for (const [lx, lz] of legSpots) {
    parts.push({
      geometry: legGeo,
      material: bodyMat,
      transform: { position: [lx, 0.13, lz], rotationY: 0, kind: 1 },
    });
    legs.push(parts.length - 1);
  }
  const geoms = [...geos, legGeo];
  const mats = [bodyMat, faceMat];
  const cluster: { x: number; z: number; yaw: number }[] = [];
  for (let i = 0; i < troopSize; i += 1) {
    cluster.push({
      x: Math.sin(i * 2.4) * 0.55,
      z: Math.cos(i * 2.4) * 0.55,
      yaw: i * 1.1,
    });
  }
  return {
    parts,
    legs,
    head: 1,
    cluster,
    dispose: () => {
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

/** One charge's animated group. */
interface ChargeVisual {
  readonly group: Group;
  /** The leg meshes, in kit order (diagonal swing pairs). */
  readonly legs: Group[];
  readonly headPivot: Group;
  readonly body: Group;
  /** Monkey troop: the per-monkey subgroups for the hop offset. */
  readonly monkeys: Group[];
}

const _matrix = new Matrix4();
const _position = new Object3D();

/**
 * The visual owner for the active charges. Construct once per world; feed it the field
 * state each streaming frame.
 */
export class FaunaWorld {
  readonly root = new Group();

  readonly #kits: Partial<Record<'boar' | 'deer', SpeciesKit>> = {};
  readonly #monkeyKits = new Map<number, SpeciesKit>();
  readonly #visuals = new Map<number, ChargeVisual>();
  readonly #sampler: TerrainSampler;
  readonly #dustGeo: BoxGeometry;
  readonly #leafGeo: BoxGeometry;
  readonly #dust: InstancedMesh;
  readonly #leaves: InstancedMesh;
  readonly #dustPool = createPool(DUST_POOL);
  readonly #leafPool = createPool(LEAF_POOL);
  readonly #leafQueue: FaunaLeafEvent[] = [];
  readonly #dustMaterial: MeshBasicMaterial;
  readonly #leafMaterial: MeshBasicMaterial;
  #dustTimer = 0;
  #disposed = false;

  constructor(sampler: TerrainSampler) {
    this.root.name = 'fauna';
    this.#sampler = sampler;
    this.#kits.boar = buildBoarKit();
    this.#kits.deer = buildDeerKit();

    this.#dustGeo = new BoxGeometry(0.3, 0.18, 0.3);
    this.#leafGeo = new BoxGeometry(0.14, 0.02, 0.1);
    this.#dustMaterial = new MeshBasicMaterial({
      color: 0x8a7a5f,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.#leafMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.#dust = new InstancedMesh(this.#dustGeo, this.#dustMaterial, DUST_POOL);
    this.#dust.frustumCulled = false;
    this.#dust.count = 0;
    this.#leaves = new InstancedMesh(this.#leafGeo, this.#leafMaterial, LEAF_POOL);
    this.#leaves.frustumCulled = false;
    this.#leaves.count = 0;
    const green = new Color(0x5a7a3a);
    for (let i = 0; i < LEAF_POOL; i += 1) {
      this.#leaves.setColorAt(i, green.clone().offsetHSL(0, 0, (i % 5) * 0.03 - 0.05));
    }
    this.root.add(this.#dust, this.#leaves);
  }

  /** Queues a leaf throw from the frame the charge fired (consumed next update). */
  queueLeaves(leaves: readonly FaunaLeafEvent[]): void {
    this.#leafQueue.push(...leaves);
  }

  /** The telegraph rustle: a small dust+leaf burst at the animal's hiding spot. */
  rustleAt(x: number, z: number): void {
    const ground = this.#sampler.heightAt(x, z);
    for (let i = 0; i < 6; i += 1) {
      this.#spawnParticle(
        this.#dustPool,
        x + (Math.random() - 0.5) * 1.2,
        ground + 0.15,
        z + (Math.random() - 0.5) * 1.2,
        0.9,
        DUST_LIFE,
      );
    }
  }

  #spawnParticle(
    pool: Particle[],
    x: number,
    y: number,
    z: number,
    speed: number,
    life: number,
  ): void {
    const p = pool.find((candidate) => !candidate.active) ?? pool[0]!;
    p.x = x;
    p.y = y;
    p.z = z;
    const angle = Math.random() * Math.PI * 2;
    p.vx = Math.sin(angle) * speed * 0.4;
    p.vy = 0.5 + Math.random() * speed * 0.5;
    p.vz = Math.cos(angle) * speed * 0.4;
    p.age = 0;
    p.life = life;
    p.spin = (Math.random() * 2 - 1) * 5;
    p.active = true;
  }

  /** Mirrors the field state: builds/updates/despawns the charge visuals and particles. */
  update(field: FaunaField, deltaSeconds: number): void {
    if (this.#disposed) return;
    const charges = field.charges;
    const liveIds = new Set(charges.map((c) => c.id));
    for (const [id, visual] of [...this.#visuals]) {
      if (!liveIds.has(id)) {
        this.root.remove(visual.group);
        this.#visuals.delete(id);
      }
    }

    this.#dustTimer -= deltaSeconds;
    for (const charge of charges) {
      const visual = this.#ensureVisual(charge);
      const ground = this.#sampler.heightAt(charge.x, charge.z);
      const yaw = charge.phase === 'telegraph' ? 0 : Math.atan2(charge.dirX, charge.dirZ);
      visual.group.position.set(charge.x, ground, charge.z);
      visual.group.rotation.y = yaw;

      // Flee fade: the last 0.4 s the animal pops back into the brush.
      const fleeRemaining = charge.phase === 'flee' ? 2.6 - charge.phaseTime : 1;
      const fade = Math.max(0.001, Math.min(1, fleeRemaining / 0.4));
      visual.group.scale.setScalar(fade);

      const t = charge.phaseTime * (charge.phase === 'flee' ? 13 : 10);
      const crouch = charge.phase === 'telegraph' ? 0.12 : 0;
      const bob =
        charge.phase === 'charge' || charge.phase === 'flee' ? Math.abs(Math.sin(t)) * 0.045 : 0;
      const jitter = charge.phase === 'telegraph' ? Math.sin(t * 4) * 0.015 : 0;
      visual.body.position.y = crouch - bob + jitter;
      visual.headPivot.rotation.x = charge.phase === 'charge' ? -0.18 : -0.06;
      visual.legs.forEach((leg, index) => {
        // Diagonal gait: legs 0&2 together, 1&3 together.
        const phase = (index % 2) * Math.PI;
        leg.rotation.x = charge.phase === 'telegraph' ? 0 : Math.sin(t + phase) * 0.85;
      });
      // Monkey hop: the troop scatters with a bouncing gait.
      visual.monkeys.forEach((monkey, index) => {
        monkey.position.y =
          charge.phase === 'charge' || charge.phase === 'flee'
            ? Math.abs(Math.sin(t * 1.4 + index)) * 0.14
            : 0;
      });

      // Hoof dust while sprinting.
      if ((charge.phase === 'charge' || charge.phase === 'flee') && this.#dustTimer <= 0) {
        this.#dustTimer = 0.05;
        for (let i = 0; i < 2; i += 1) {
          this.#spawnParticle(
            this.#dustPool,
            charge.x - charge.dirX * 0.9 + (Math.random() - 0.5) * 0.5,
            ground + 0.1,
            charge.z - charge.dirZ * 0.9 + (Math.random() - 0.5) * 0.5,
            1.1,
            DUST_LIFE,
          );
        }
      }
    }

    // Leaf throws from the most recent frame.
    for (const leaf of this.#leafQueue.splice(0)) {
      this.#spawnLeaf(leaf);
    }
    this.#updateParticles(this.#dustPool, this.#dust, deltaSeconds, false);
    this.#updateParticles(this.#leafPool, this.#leaves, deltaSeconds, true);
  }

  #spawnLeaf(leaf: FaunaLeafEvent): void {
    const p = this.#leafPool.find((candidate) => !candidate.active) ?? this.#leafPool[0]!;
    p.x = leaf.x;
    p.y = leaf.y;
    p.z = leaf.z;
    p.vx = leaf.dirX;
    p.vy = leaf.dirY;
    p.vz = leaf.dirZ;
    p.age = 0;
    p.life = LEAF_LIFE;
    p.spin = leaf.spin;
    p.active = true;
  }

  #updateParticles(
    pool: Particle[],
    mesh: InstancedMesh,
    deltaSeconds: number,
    gravity: boolean,
  ): void {
    let count = 0;
    for (const p of pool) {
      if (!p.active) continue;
      p.age += deltaSeconds;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      if (gravity) {
        p.vy -= 9.8 * deltaSeconds;
      } else {
        p.vy -= 1.2 * deltaSeconds;
        p.vx *= 1 - 1.8 * deltaSeconds;
        p.vz *= 1 - 1.8 * deltaSeconds;
      }
      p.x += p.vx * deltaSeconds;
      p.y += p.vy * deltaSeconds;
      p.z += p.vz * deltaSeconds;
      const ground = this.#sampler.heightAt(p.x, p.z);
      if (p.y < ground + 0.05) {
        p.y = ground + 0.05;
        p.vy = 0;
      }
      const lifeFraction = 1 - p.age / p.life;
      const scale = gravity ? lifeFraction : 0.5 + lifeFraction;
      _position.position.set(p.x, p.y, p.z);
      _position.rotation.set(p.spin * p.age * 0.3, p.spin * p.age, p.spin * p.age * 0.5);
      _position.scale.setScalar(Math.max(0.001, scale));
      _position.updateMatrix();
      _matrix.copy(_position.matrix);
      mesh.setMatrixAt(count, _matrix);
      count += 1;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }

  #ensureVisual(charge: FaunaCharge): ChargeVisual {
    let visual = this.#visuals.get(charge.id);
    if (visual !== undefined) return visual;
    const kit =
      charge.species === 'monkey'
        ? this.#monkeyKitFor(charge.troopSize)
        : this.#kits[charge.species]!;
    const group = new Group();
    group.name = `fauna-${charge.species}-${charge.id}`;
    const body = new Group();
    const legs: Group[] = [];
    const monkeys: Group[] = [];

    // One animal unit: body parts as meshes, legs as hip pivots, the head as a nod pivot.
    const buildUnit = (): Group => {
      const unit = new Group();
      const headPivot = new Group();
      kit.parts.forEach((part, index) => {
        const mesh = new Mesh(part.geometry, part.material);
        if (index === kit.head) {
          headPivot.position.set(...part.transform.position);
          headPivot.add(mesh);
        } else if (part.transform.kind === 1) {
          // A leg: pivot at the hip (top of the leg), mesh hanging below it.
          const halfLength = (part.geometry as BoxGeometry).parameters.height / 2;
          const pivot = new Group();
          pivot.position.set(
            part.transform.position[0],
            part.transform.position[1] + halfLength,
            part.transform.position[2],
          );
          mesh.position.y = -halfLength;
          pivot.add(mesh);
          unit.add(pivot);
          legs.push(pivot);
        } else {
          mesh.position.set(...part.transform.position);
          mesh.rotation.y = part.transform.rotationY;
          unit.add(mesh);
        }
      });
      unit.add(headPivot);
      unit.userData.headPivot = headPivot;
      return unit;
    };

    let headPivot: Group;
    if (kit.cluster !== undefined) {
      // A troop: several small units in a loose cluster; the hop is the gait.
      for (const c of kit.cluster) {
        const unit = buildUnit();
        unit.rotation.y = c.yaw;
        unit.position.set(c.x, 0, c.z);
        body.add(unit);
        monkeys.push(unit);
      }
      headPivot = body.children[0]?.userData.headPivot ?? new Group();
    } else {
      const unit = buildUnit();
      body.add(unit);
      headPivot = unit.userData.headPivot;
    }
    group.add(body);
    group.traverse((node) => {
      node.frustumCulled = false;
    });
    this.root.add(group);
    visual = { group, legs, headPivot, body, monkeys };
    this.#visuals.set(charge.id, visual);
    return visual;
  }

  #monkeyKitFor(troopSize: number): SpeciesKit {
    let kit = this.#monkeyKits.get(troopSize);
    if (kit === undefined) {
      kit = buildMonkeyKit(troopSize);
      this.#monkeyKits.set(troopSize, kit);
    }
    return kit;
  }

  getContentStats(): { faunaCharges: number } {
    return { faunaCharges: this.#visuals.size };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const [id, visual] of this.#visuals) {
      this.root.remove(visual.group);
      this.#visuals.delete(id);
    }
    this.root.remove(this.#dust, this.#leaves);
    this.#kits.boar?.dispose();
    this.#kits.deer?.dispose();
    for (const kit of this.#monkeyKits.values()) {
      kit.dispose();
    }
    this.#dustGeo.dispose();
    this.#leafGeo.dispose();
    this.#dustMaterial.dispose();
    this.#leafMaterial.dispose();
    this.#dust.dispose();
    this.#leaves.dispose();
  }
}
