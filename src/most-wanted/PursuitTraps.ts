/**
 * Phase 10 Most Wanted — Milestone 4b-2: the **visible physical traps** (roadblock + spike strip).
 *
 * A thin Three.js renderer over the pure `PursuitTrapsModel` state. Each committed trap becomes a
 * low-poly kinematic visual: a row of barriers + cones for the roadblock, a dark strip for the
 * spike strip. Positions are fixed (the model snapshots them), so this just keeps the meshes in
 * sync with the state. Full physical collision is out of scope; the hit is a proximity event from
 * the pure model (see `PursuitTrapsModel.ts`).
 */
import * as THREE from 'three';

import type { SceneManager } from '../core/SceneManager';
import type { TrapState } from './PursuitTrapsModel';

interface TrapMesh {
  readonly group: THREE.Group;
}

export class PursuitTraps {
  private readonly scene: SceneManager;

  #roadblock: TrapMesh | null = null;
  #spike: TrapMesh | null = null;

  // Shared geometries / materials (cached once, disposed on teardown).
  private readonly barrierGeo = new THREE.BoxGeometry(2.6, 1.0, 0.35);
  private readonly barrierBaseGeo = new THREE.BoxGeometry(2.6, 0.3, 0.35);
  private readonly spikeGeo = new THREE.BoxGeometry(9, 0.08, 2.2);
  private readonly coneGeo = new THREE.ConeGeometry(0.32, 0.7, 10);
  private readonly barrierMat = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.6 });
  private readonly barrierBaseMat = new THREE.MeshStandardMaterial({
    color: 0x2a2d33,
    roughness: 0.8,
  });
  private readonly coneMat = new THREE.MeshStandardMaterial({
    color: 0xff6a1a,
    emissive: 0xff6a1a,
    emissiveIntensity: 0.25,
  });
  private readonly spikeMat = new THREE.MeshStandardMaterial({
    color: 0x141519,
    roughness: 0.9,
    metalness: 0.1,
    emissive: 0x5a1010,
    emissiveIntensity: 0.4,
  });

  constructor(scene: SceneManager) {
    this.scene = scene;
  }

  get roadblockPresent(): boolean {
    return this.#roadblock !== null;
  }
  get spikePresent(): boolean {
    return this.#spike !== null;
  }

  /** Keep the trap meshes in sync with the model state. `groundY` is the road height near the player. */
  sync(state: TrapState, groundY: number): void {
    if (state.roadblock !== null) {
      if (this.#roadblock === null) this.#roadblock = this.#buildRoadblock();
      this.#place(this.#roadblock, state.roadblock, groundY);
    } else if (this.#roadblock !== null) {
      this.scene.removeObject(this.#roadblock.group);
      this.#roadblock = null;
    }

    if (state.spikeStrip !== null) {
      if (this.#spike === null) this.#spike = this.#buildSpike();
      this.#place(this.#spike, state.spikeStrip, groundY);
    } else if (this.#spike !== null) {
      this.scene.removeObject(this.#spike.group);
      this.#spike = null;
    }
  }

  #place(mesh: TrapMesh, at: { x: number; z: number; yaw: number }, groundY: number): void {
    mesh.group.position.set(at.x, groundY, at.z);
    mesh.group.rotation.y = at.yaw;
  }

  /** A roadblock: a row of barriers across the road, with cones at the flanks. */
  #buildRoadblock(): TrapMesh {
    const group = new THREE.Group();
    // Barriers span the road width along local x (travel is along local -z at yaw 0).
    for (const x of [-3.4, -1.15, 1.15, 3.4]) {
      const base = new THREE.Mesh(this.barrierBaseGeo, this.barrierBaseMat);
      base.position.set(x, 0.15, 0);
      const bar = new THREE.Mesh(this.barrierGeo, this.barrierMat);
      bar.position.set(x, 0.85, 0);
      group.add(base, bar);
    }
    for (const x of [-4.6, 4.6]) {
      const cone = new THREE.Mesh(this.coneGeo, this.coneMat);
      cone.position.set(x, 0.35, 0);
      group.add(cone);
    }
    this.scene.addObject(group);
    return { group };
  }

  /** A spike strip: a flat dark strip laid across the road the player will drive over. */
  #buildSpike(): TrapMesh {
    const group = new THREE.Group();
    const strip = new THREE.Mesh(this.spikeGeo, this.spikeMat);
    strip.position.set(0, 0.05, 0);
    group.add(strip);
    this.scene.addObject(group);
    return { group };
  }

  /** Remove both traps (pursuit ended / busted / stood down). */
  clear(): void {
    if (this.#roadblock !== null) {
      this.scene.removeObject(this.#roadblock.group);
      this.#roadblock = null;
    }
    if (this.#spike !== null) {
      this.scene.removeObject(this.#spike.group);
      this.#spike = null;
    }
  }

  dispose(): void {
    this.clear();
    this.barrierGeo.dispose();
    this.barrierBaseGeo.dispose();
    this.spikeGeo.dispose();
    this.coneGeo.dispose();
    this.barrierMat.dispose();
    this.barrierBaseMat.dispose();
    this.coneMat.dispose();
    this.spikeMat.dispose();
  }
}
