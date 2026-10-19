import {
  AdditiveBlending,
  type Blending,
  Color,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
  type Camera,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute } from 'three/tsl';

import { VEHICLE_EFFECTS_CONFIG } from '../config/vehicle-effects';
import { VEHICLE_CONFIG } from '../config/vehicle';
import type { TierId } from '../config/tiers';
import { rotateVec3ByQuat, vec3, type Vec3 } from '../shared/vector';
import type { VehiclePose, VehicleTelemetry, WheelState } from './types';
import { resolveAirflowIntensity, resolveTireSmokeStrength } from './vehicle-effects';

interface Particle {
  active: boolean;
  age: number;
  lifetime: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  startSizeX: number;
  endSizeX: number;
  startSizeY: number;
  endSizeY: number;
  opacity: number;
  color: number;
  roll: number;
  fadeInSeconds: number;
}

interface ParticleSpawn {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly lifetime: number;
  readonly startSizeX: number;
  readonly endSizeX: number;
  readonly startSizeY: number;
  readonly endSizeY: number;
  readonly opacity: number;
  readonly color: number;
  readonly roll: number;
  readonly fadeInSeconds: number;
}

class ParticlePool {
  readonly particles: Particle[];
  readonly mesh: InstancedMesh;
  readonly #opacity: InstancedBufferAttribute;
  readonly #dummy = new Object3D();
  readonly #color = new Color();
  readonly #rotationAxis = new Vector3(0, 0, 1);
  readonly #cameraQuaternion = new Quaternion();
  readonly #rollQuaternion = new Quaternion();
  readonly #visible: Particle[] = [];
  #cursor = 0;
  #activeCount = 0;

  constructor(
    name: string,
    capacity: number,
    texture: DataTexture,
    blending: Blending,
    opacityScale = 1,
    renderOrder = 10,
  ) {
    const geometry = new PlaneGeometry(1, 1);
    this.#opacity = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.#opacity.setUsage(DynamicDrawUsage);
    geometry.setAttribute('particleOpacity', this.#opacity);

    const material = new MeshBasicNodeMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending,
      toneMapped: blending !== AdditiveBlending,
    });
    material.opacityNode = attribute('particleOpacity', 'float').mul(opacityScale);

    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.particles = Array.from({ length: capacity }, () => createParticle());
  }

  get activeCount(): number {
    return this.#activeCount;
  }

  spawn(spawn: ParticleSpawn): void {
    const particle = this.particles[this.#cursor];
    this.#cursor = (this.#cursor + 1) % this.particles.length;
    if (!particle) {
      return;
    }
    if (!particle.active) {
      this.#activeCount += 1;
    }
    particle.active = true;
    particle.age = 0;
    particle.lifetime = spawn.lifetime;
    particle.x = spawn.position.x;
    particle.y = spawn.position.y;
    particle.z = spawn.position.z;
    particle.vx = spawn.velocity.x;
    particle.vy = spawn.velocity.y;
    particle.vz = spawn.velocity.z;
    particle.startSizeX = spawn.startSizeX;
    particle.endSizeX = spawn.endSizeX;
    particle.startSizeY = spawn.startSizeY;
    particle.endSizeY = spawn.endSizeY;
    particle.opacity = spawn.opacity;
    particle.color = spawn.color;
    particle.roll = spawn.roll;
    particle.fadeInSeconds = spawn.fadeInSeconds;
  }

  update(dt: number, verticalAcceleration: number, dragPerSecond: number): void {
    if (dt <= 0) {
      return;
    }
    const drag = dragPerSecond > 0 ? Math.exp(-dragPerSecond * dt) : 1;
    for (const particle of this.particles) {
      if (!particle.active) {
        continue;
      }
      particle.age += dt;
      if (particle.age >= particle.lifetime) {
        particle.active = false;
        this.#activeCount -= 1;
        continue;
      }
      particle.vy += verticalAcceleration * dt;
      particle.vx *= drag;
      particle.vy *= drag;
      particle.vz *= drag;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
    }
  }

  writeInstances(cameraRotation: Quaternion, cameraPosition: Vec3): void {
    // Small pools are sorted back-to-front so translucent smoke blends predictably without
    // relying on a per-particle draw call.
    this.#visible.length = 0;
    for (const particle of this.particles) {
      if (particle.active) {
        this.#visible.push(particle);
      }
    }
    this.#visible.sort(
      (a, b) => distanceSquared(b, cameraPosition) - distanceSquared(a, cameraPosition),
    );
    this.mesh.count = this.#visible.length;
    this.#cameraQuaternion.copy(cameraRotation);

    let index = 0;
    for (const particle of this.#visible) {
      const life = particle.age / particle.lifetime;
      const fadeIn =
        particle.fadeInSeconds > 0 ? smoothUnit(particle.age / particle.fadeInSeconds) : 1;
      const fadeOut = 1 - smoothUnit((life - 0.55) / 0.45);
      const alpha = particle.opacity * fadeIn * fadeOut;
      const sizeX = lerp(particle.startSizeX, particle.endSizeX, smoothUnit(life));
      const sizeY = lerp(particle.startSizeY, particle.endSizeY, smoothUnit(life));

      this.#dummy.position.set(particle.x, particle.y, particle.z);
      this.#rollQuaternion.setFromAxisAngle(this.#rotationAxis, particle.roll);
      this.#dummy.quaternion.copy(this.#cameraQuaternion).multiply(this.#rollQuaternion);
      this.#dummy.scale.set(sizeX, sizeY, 1);
      this.#dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.#dummy.matrix);
      this.mesh.setColorAt(index, this.#color.setHex(particle.color));
      this.#opacity.setX(index, alpha);
      index += 1;
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.setUsage(DynamicDrawUsage);
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.#opacity.needsUpdate = true;
  }

  shiftBy(dx: number, dz: number): void {
    for (const particle of this.particles) {
      if (particle.active) {
        particle.x -= dx;
        particle.z -= dz;
      }
    }
  }

  reset(): void {
    for (const particle of this.particles) {
      particle.active = false;
      particle.age = 0;
    }
    this.#activeCount = 0;
    this.#cursor = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const material = this.mesh.material;
    if (!Array.isArray(material)) {
      material.dispose();
    }
    this.mesh.removeFromParent();
  }
}

/**
 * Small, fixed-capacity vehicle effects. Particles live in the same rebased simulation coordinates
 * as the visible car, while the camera-facing quads are batched in three instanced draws.
 */
export class CarEffects {
  readonly root = new Group();
  readonly #tier: TierId;
  readonly #smokeTexture: DataTexture;
  readonly #streakTexture: DataTexture;
  readonly #smoke: ParticlePool;
  readonly #sparks: ParticlePool;
  readonly #airflow: ParticlePool;
  readonly #cameraQuaternion = new Quaternion();
  readonly #cameraPosition = new Vector3();
  readonly #rotatedLocal = vec3();
  readonly #randomState = { value: 0x6d2b79f5 };
  readonly #wheelLayout = VEHICLE_CONFIG.wheels;
  #exhaustAccumulator = 0;
  #airflowAccumulator = 0;
  #tireAccumulators = [0, 0, 0, 0];
  #exhaustOutlet = 0;
  #lastGear = 1;
  #disposed = false;

  constructor(tier: TierId) {
    this.#tier = tier;
    this.root.name = 'car-effects';
    const capacity = VEHICLE_EFFECTS_CONFIG.particleCapacityByTier[tier];
    this.#smokeTexture = makeRadialTexture();
    this.#streakTexture = makeStreakTexture();
    this.#smoke = new ParticlePool(
      'car-smoke',
      capacity.smoke,
      this.#smokeTexture,
      NormalBlending,
      1,
      8,
    );
    this.#sparks = new ParticlePool(
      'gear-shift-sparks',
      capacity.sparks,
      this.#streakTexture,
      AdditiveBlending,
      1,
      10,
    );
    this.#airflow = new ParticlePool(
      'speed-airflow',
      capacity.airflow,
      this.#streakTexture,
      AdditiveBlending,
      1,
      7,
    );
    this.root.add(this.#airflow.mesh, this.#smoke.mesh, this.#sparks.mesh);
  }

  get activeParticleCounts(): Readonly<{ smoke: number; sparks: number; airflow: number }> {
    return {
      smoke: this.#smoke.activeCount,
      sparks: this.#sparks.activeCount,
      airflow: this.#airflow.activeCount,
    };
  }

  update(
    delta: number,
    pose: VehiclePose,
    telemetry: VehicleTelemetry,
    wheels: readonly WheelState[],
    linearVelocity: Vec3,
    camera: Camera,
  ): void {
    if (this.#disposed) {
      return;
    }
    const dt = Math.min(0.1, Math.max(0, delta));
    camera.getWorldPosition(this.#cameraPosition);
    camera.getWorldQuaternion(this.#cameraQuaternion);

    if (dt > 0) {
      this.#updateExhaust(dt, pose, telemetry, linearVelocity);
      this.#updateTireSmoke(dt, pose, telemetry, wheels, linearVelocity);
      this.#updateShiftSparks(pose, telemetry, linearVelocity);
      this.#updateAirflow(dt, pose, telemetry, linearVelocity);
      // Exhaust and tire smoke share one bounded, batched pool; use a restrained midpoint for
      // their common buoyancy/drag so neither emitter dominates the other.
      this.#smoke.update(
        dt,
        (VEHICLE_EFFECTS_CONFIG.exhaust.buoyancyMetersPerSecondSquared +
          VEHICLE_EFFECTS_CONFIG.tireSmoke.buoyancyMetersPerSecondSquared) /
          2,
        (VEHICLE_EFFECTS_CONFIG.exhaust.dragPerSecond +
          VEHICLE_EFFECTS_CONFIG.tireSmoke.dragPerSecond) /
          2,
      );
      this.#sparks.update(
        dt,
        -VEHICLE_EFFECTS_CONFIG.shiftSparks.gravityMetersPerSecondSquared,
        0.12,
      );
      this.#airflow.update(dt, 0, 0);
    }

    this.#smoke.writeInstances(this.#cameraQuaternion, this.#cameraPosition);
    this.#sparks.writeInstances(this.#cameraQuaternion, this.#cameraPosition);
    this.#airflow.writeInstances(this.#cameraQuaternion, this.#cameraPosition);
  }

  /** Keeps already-emitted particles aligned when the simulation origin rebases. */
  shiftBy(dx: number, dz: number): void {
    this.#smoke.shiftBy(dx, dz);
    this.#sparks.shiftBy(dx, dz);
    this.#airflow.shiftBy(dx, dz);
  }

  reset(): void {
    this.#smoke.reset();
    this.#sparks.reset();
    this.#airflow.reset();
    this.#exhaustAccumulator = 0;
    this.#airflowAccumulator = 0;
    this.#tireAccumulators.fill(0);
    this.#exhaustOutlet = 0;
    this.#lastGear = 1;
    this.#randomState.value = 0x6d2b79f5;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#smoke.dispose();
    this.#sparks.dispose();
    this.#airflow.dispose();
    this.#smokeTexture.dispose();
    this.#streakTexture.dispose();
    this.root.clear();
  }

  #updateExhaust(dt: number, pose: VehiclePose, telemetry: VehicleTelemetry, velocity: Vec3): void {
    const config = VEHICLE_EFFECTS_CONFIG.exhaust;
    const engineLoad = telemetry.gear < 0 ? telemetry.brake : telemetry.throttle;
    const shiftLoad = telemetry.shifting ? config.shiftPuffsPerSecond : 0;
    const rate = config.idlePuffsPerSecond + engineLoad * config.loadPuffsPerSecond + shiftLoad;
    this.#exhaustAccumulator += rate * dt;
    while (this.#exhaustAccumulator >= 1) {
      this.#exhaustAccumulator -= 1;
      this.#emitExhaustPuff(pose, velocity, engineLoad);
    }
  }

  #updateTireSmoke(
    dt: number,
    pose: VehiclePose,
    telemetry: VehicleTelemetry,
    wheels: readonly WheelState[],
    velocity: Vec3,
  ): void {
    const config = VEHICLE_EFFECTS_CONFIG.tireSmoke;
    const { halfTrack, frontZ, rearZ, anchorY, radius } = this.#wheelLayout;
    for (let index = 0; index < 4; index += 1) {
      const wheel = wheels[index];
      if (!wheel) {
        this.#tireAccumulators[index] = 0;
        continue;
      }
      const strength = resolveTireSmokeStrength(wheel, telemetry.speedMps, telemetry.handbrake);
      if (strength <= 0) {
        this.#tireAccumulators[index] = 0;
        continue;
      }
      this.#tireAccumulators[index] =
        (this.#tireAccumulators[index] ?? 0) + config.puffsPerSecondPerWheel * strength * dt;
      while ((this.#tireAccumulators[index] ?? 0) >= 1) {
        this.#tireAccumulators[index] = (this.#tireAccumulators[index] ?? 0) - 1;
        const local = {
          x: wheel.side * halfTrack,
          y: anchorY - wheel.suspensionLength - radius,
          z: wheel.isFront ? frontZ : rearZ,
        };
        this.#emitTirePuff(pose, velocity, local, strength);
      }
    }
  }

  #updateShiftSparks(pose: VehiclePose, telemetry: VehicleTelemetry, velocity: Vec3): void {
    if (this.#lastGear > 0 && telemetry.gear > 0 && telemetry.gear !== this.#lastGear) {
      const count = VEHICLE_EFFECTS_CONFIG.shiftSparks.countByTier[this.#tier];
      for (let index = 0; index < count; index += 1) {
        this.#emitShiftSpark(pose, velocity, index);
      }
    }
    this.#lastGear = telemetry.gear;
  }

  #updateAirflow(dt: number, pose: VehiclePose, telemetry: VehicleTelemetry, velocity: Vec3): void {
    const intensity = resolveAirflowIntensity(telemetry.forwardSpeed * 3.6);
    if (intensity <= 0) {
      this.#airflowAccumulator = 0;
      return;
    }
    this.#airflowAccumulator +=
      VEHICLE_EFFECTS_CONFIG.airflow.puffsPerSecondAtFullSpeed * intensity * dt;
    while (this.#airflowAccumulator >= 1) {
      this.#airflowAccumulator -= 1;
      this.#emitAirflowMark(pose, telemetry, velocity, intensity);
    }
  }

  #emitExhaustPuff(pose: VehiclePose, velocity: Vec3, engineLoad: number): void {
    const config = VEHICLE_EFFECTS_CONFIG.exhaust;
    const outlet = config.outlets[this.#exhaustOutlet % config.outlets.length] ?? config.outlets[0];
    this.#exhaustOutlet += 1;
    const position = this.#localToSimulation(outlet, pose);
    const relative = this.#rotateLocal(
      {
        x: this.#randomSigned() * 0.13,
        y: 0.12 + this.#random() * 0.22,
        z: 0.18 + this.#random() * (0.48 + engineLoad * 0.9),
      },
      pose,
    );
    const startSize = this.#range(config.startSizeMeters.min, config.startSizeMeters.max);
    const endSize = this.#range(config.endSizeMeters.min, config.endSizeMeters.max);
    this.#smoke.spawn({
      position,
      velocity: add(velocity, relative),
      lifetime: this.#range(config.lifetimeSeconds.min, config.lifetimeSeconds.max),
      startSizeX: startSize,
      endSizeX: endSize,
      startSizeY: startSize * 0.78,
      endSizeY: endSize * 0.88,
      opacity: lerp(config.opacity.idle, config.opacity.loaded, engineLoad),
      color: this.#random() > 0.5 ? 0x6e7880 : 0x828a90,
      roll: this.#randomSigned() * Math.PI,
      fadeInSeconds: 0.08,
    });
  }

  #emitTirePuff(pose: VehiclePose, velocity: Vec3, localPosition: Vec3, strength: number): void {
    const config = VEHICLE_EFFECTS_CONFIG.tireSmoke;
    const position = this.#localToSimulation(
      {
        x: localPosition.x + this.#randomSigned() * 0.13,
        y: localPosition.y + 0.04,
        z: localPosition.z + this.#randomSigned() * 0.12,
      },
      pose,
    );
    const relative = this.#rotateLocal(
      {
        x: this.#randomSigned() * 0.42,
        y: 0.3 + this.#random() * 0.4,
        z: 0.18 + this.#random() * 0.55,
      },
      pose,
    );
    const startSize = this.#range(config.startSizeMeters.min, config.startSizeMeters.max);
    const endSize = this.#range(config.endSizeMeters.min, config.endSizeMeters.max);
    this.#smoke.spawn({
      position,
      velocity: add(velocity, relative),
      lifetime: this.#range(config.lifetimeSeconds.min, config.lifetimeSeconds.max),
      startSizeX: startSize,
      endSizeX: endSize,
      startSizeY: startSize * 0.82,
      endSizeY: endSize * 0.95,
      opacity: config.opacity * strength,
      color: this.#random() > 0.5 ? 0x7d8589 : 0x91989a,
      roll: this.#randomSigned() * Math.PI,
      fadeInSeconds: 0.05,
    });
  }

  #emitShiftSpark(pose: VehiclePose, velocity: Vec3, index: number): void {
    const config = VEHICLE_EFFECTS_CONFIG.shiftSparks;
    const outlets = VEHICLE_EFFECTS_CONFIG.exhaust.outlets;
    const outlet = outlets[index % outlets.length] ?? outlets[0];
    const position = this.#localToSimulation(outlet, pose);
    const lateralSign = this.#random() > 0.5 ? 1 : -1;
    const relative = this.#rotateLocal(
      {
        x: lateralSign * this.#random() * config.localSpeedMetersPerSecond.lateral,
        y: config.localSpeedMetersPerSecond.vertical * (0.55 + this.#random() * 0.65),
        z: this.#range(
          config.localSpeedMetersPerSecond.rear.min,
          config.localSpeedMetersPerSecond.rear.max,
        ),
      },
      pose,
    );
    const size = this.#range(config.sizeMeters.min, config.sizeMeters.max);
    this.#sparks.spawn({
      position,
      velocity: add(velocity, relative),
      lifetime: this.#range(config.lifetimeSeconds.min, config.lifetimeSeconds.max),
      startSizeX: size * 0.65,
      endSizeX: size * 1.7,
      startSizeY: size * 0.24,
      endSizeY: size * 0.35,
      opacity: config.opacity,
      color: [0xffe3a1, 0xffb34a, 0xff7d2f][index % 3] ?? 0xffb34a,
      roll: this.#randomSigned() * 0.32,
      fadeInSeconds: 0.008,
    });
  }

  #emitAirflowMark(
    pose: VehiclePose,
    telemetry: VehicleTelemetry,
    velocity: Vec3,
    intensity: number,
  ): void {
    const config = VEHICLE_EFFECTS_CONFIG.airflow;
    const side = this.#random() > 0.5 ? 1 : -1;
    const offset = this.#range(config.lateralOffsetMeters.min, config.lateralOffsetMeters.max);
    const localPosition = {
      x: side * offset,
      y: this.#range(config.heightOffsetMeters.min, config.heightOffsetMeters.max),
      z: this.#range(config.spawnForwardOffsetMeters.min, config.spawnForwardOffsetMeters.max),
    };
    const position = this.#localToSimulation(localPosition, pose);
    const relative = this.#rotateLocal(
      { x: 0, y: 0, z: Math.max(0, telemetry.forwardSpeed) * config.relativeFlowSpeedMultiplier },
      pose,
    );
    const length = this.#range(config.sizeXMeters.min, config.sizeXMeters.max);
    const thickness = this.#range(config.sizeYMeters.min, config.sizeYMeters.max);
    this.#airflow.spawn({
      position,
      velocity: add(velocity, relative),
      lifetime: this.#range(config.lifetimeSeconds.min, config.lifetimeSeconds.max),
      startSizeX: length * 0.55,
      endSizeX: length,
      startSizeY: thickness,
      endSizeY: thickness * 0.55,
      opacity: config.opacity * (0.35 + intensity * 0.65),
      color: this.#random() > 0.5 ? 0xa9c6dc : 0xd4e5f0,
      roll: this.#randomSigned() * 0.06,
      fadeInSeconds: 0.04,
    });
  }

  #localToSimulation(local: Vec3, pose: VehiclePose): Vec3 {
    const offset = this.#rotateLocal(local, pose);
    return {
      x: pose.position.x + offset.x,
      y: pose.position.y + offset.y,
      z: pose.position.z + offset.z,
    };
  }

  #rotateLocal(local: Vec3, pose: VehiclePose): Vec3 {
    return rotateVec3ByQuat(this.#rotatedLocal, local, pose.rotation);
  }

  #random(): number {
    let value = this.#randomState.value;
    value = (value * 1664525 + 1013904223) >>> 0;
    this.#randomState.value = value;
    return value / 0x1_0000_0000;
  }

  #randomSigned(): number {
    return this.#random() * 2 - 1;
  }

  #range(min: number, max: number): number {
    return min + (max - min) * this.#random();
  }
}

function createParticle(): Particle {
  return {
    active: false,
    age: 0,
    lifetime: 0,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    startSizeX: 0,
    endSizeX: 0,
    startSizeY: 0,
    endSizeY: 0,
    opacity: 0,
    color: 0xffffff,
    roll: 0,
    fadeInSeconds: 0,
  };
}

function makeRadialTexture(): DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const distance = Math.sqrt(nx * nx + ny * ny);
      const edge = 1 - smoothUnit((distance - 0.38) / 0.62);
      const alpha = Math.round(edge * 255);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = alpha;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function makeStreakTexture(): DataTexture {
  const width = 64;
  const height = 16;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const along = (x + 0.5) / width;
      const across = Math.abs(((y + 0.5) / height) * 2 - 1);
      const endFade = smoothUnit(along / 0.18) * (1 - smoothUnit((along - 0.78) / 0.22));
      const sideFade = 1 - smoothUnit((across - 0.14) / 0.86);
      const alpha = Math.round(endFade * sideFade * 255);
      const index = (y * width + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = alpha;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function smoothUnit(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function distanceSquared(particle: Particle, position: Vec3): number {
  const x = particle.x - position.x;
  const y = particle.y - position.y;
  const z = particle.z - position.z;
  return x * x + y * y + z * z;
}

function add(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}
