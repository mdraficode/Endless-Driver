import {
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';

/**
 * The precipitation field (Phase 7): thin falling streaks in a volume around the car.
 *
 * One instanced draw call and one small transparent material (precompiled with the
 * startup graph, so it never recompiles in play). The count scales with the quality
 * tier and with the live rain intensity, so a transition changes how much rain there
 * is, never a material or a program. The drops are simulated in world space, so a
 * moving car shears the rain past it naturally; drops that fall out of the volume
 * respawn at the top of it.
 */
const VOLUME_HALF_WIDTH = 18;
const VOLUME_ABOVE = 14;
const VOLUME_BELOW = 9;
const STREAK_HEIGHT = 0.55;
const FALL_SPEED = 10.5;
/** The sideways wind that tilts the streaks (m/s), a gentle constant for now. */
const WIND_X = 2.1;
const WIND_Z = 0.9;

const ONE_SCALE = new Vector3(1, 1, 1);

/** The streak tilt: the angle between vertical and the falling direction. */
const STREAK_TILT = new Quaternion().setFromAxisAngle(
  new Vector3(WIND_Z, 0, -WIND_X).normalize(),
  Math.atan2(Math.hypot(WIND_X, WIND_Z), FALL_SPEED),
);

interface Drop {
  x: number;
  y: number;
  z: number;
}

export class RainField {
  readonly root = new Group();
  readonly #mesh: InstancedMesh;
  readonly #drops: Drop[] = [];
  readonly #material: MeshBasicMaterial;
  readonly #matrix = new Matrix4();
  readonly #position = new Vector3();
  #intensity = 0;
  #initialized = false;

  constructor(maxDrops: number) {
    this.root.name = 'rain-field';
    const geometry = new PlaneGeometry(0.018, STREAK_HEIGHT, 1, 1);
    this.#material = new MeshBasicMaterial({
      color: 0xc3d3e4,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: DoubleSide,
    });
    this.#mesh = new InstancedMesh(geometry, this.#material, maxDrops);
    this.#mesh.name = 'rain-streaks';
    this.#mesh.frustumCulled = false;
    this.#mesh.castShadow = false;
    this.#mesh.receiveShadow = false;
    this.#mesh.count = 0;
    this.#mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < maxDrops; i += 1) {
      this.#drops.push({ x: 0, y: 0, z: 0 });
    }
    this.root.visible = false; // dry until the first intensity
    this.root.add(this.#mesh);
  }

  get activeDropCount(): number {
    return this.#mesh.count;
  }

  /** Sets how much rain is falling (0 = dry, 1 = full). A no-op when unchanged. */
  setIntensity(intensity: number): void {
    const clamped = Math.min(1, Math.max(0, intensity));
    if (clamped === this.#intensity) return;
    this.#intensity = clamped;
    this.#mesh.count = Math.round(this.#drops.length * clamped);
    this.root.visible = this.#mesh.count > 0;
  }

  /**
   * Probes the field's one material for the startup prewarm: the streaks are hidden while
   * it is not raining and the scene compile skips hidden objects, so the program would
   * otherwise compile live on the first rain. One drop stands in for the material; the
   * application restores the true intensity when the warm-up finishes.
   */
  prepareCompilation(): void {
    this.#mesh.count = Math.max(1, this.#mesh.count);
    this.root.visible = true;
  }

  /**
   * Advances the drops around the car's position. The volume follows the car, so the
   * field is always visible when rain is falling, whatever the car does.
   */
  update(deltaSeconds: number, carX: number, carY: number, carZ: number): void {
    if (this.#mesh.count === 0 || deltaSeconds <= 0) return;
    const delta = Math.min(deltaSeconds, 0.1);

    if (!this.#initialized) {
      for (const drop of this.#drops) {
        this.#spawn(drop, carX, carY, carZ, true);
      }
      this.#initialized = true;
    }

    const minX = carX - VOLUME_HALF_WIDTH;
    const maxX = carX + VOLUME_HALF_WIDTH;
    const minZ = carZ - VOLUME_HALF_WIDTH;
    const maxZ = carZ + VOLUME_HALF_WIDTH;
    const bottom = carY - VOLUME_BELOW;

    for (let i = 0; i < this.#mesh.count; i += 1) {
      const drop = this.#drops[i]!;
      drop.y -= FALL_SPEED * delta;
      drop.x += WIND_X * delta;
      drop.z += WIND_Z * delta;
      if (drop.y < bottom || drop.x < minX || drop.x > maxX || drop.z < minZ || drop.z > maxZ) {
        this.#spawn(drop, carX, carY, carZ, false);
      }
      this.#position.set(drop.x, drop.y, drop.z);
      this.#matrix.compose(this.#position, STREAK_TILT, ONE_SCALE);
      this.#mesh.setMatrixAt(i, this.#matrix);
    }
    this.#mesh.instanceMatrix.needsUpdate = true;
  }

  #spawn(drop: Drop, carX: number, carY: number, carZ: number, scatterVertically: boolean): void {
    drop.x = carX - VOLUME_HALF_WIDTH + Math.random() * (2 * VOLUME_HALF_WIDTH);
    drop.z = carZ - VOLUME_HALF_WIDTH + Math.random() * (2 * VOLUME_HALF_WIDTH);
    drop.y = scatterVertically
      ? carY - VOLUME_BELOW + Math.random() * (VOLUME_ABOVE + VOLUME_BELOW)
      : carY + VOLUME_ABOVE * (0.6 + Math.random() * 0.4);
  }

  dispose(): void {
    this.#mesh.geometry.dispose();
    this.#material.dispose();
  }
}
