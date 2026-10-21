import {
  AdditiveBlending,
  DataTexture,
  Group,
  LinearFilter,
  NormalBlending,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import type { WebGPURenderer } from 'three/webgpu';

import { VEHICLE_EFFECTS_CONFIG } from '../config/vehicle-effects';
import { VEHICLE_CONFIG } from '../config/vehicle';
import type { RendererBackendName } from '../config/render';
import type { TierId } from '../config/tiers';
import { rotateVec3ByQuat, vec3, type Vec3 } from '../shared/vector';
import type { VehiclePose, VehicleTelemetry, WheelState } from './types';
import { GpuParticlePool } from './GpuParticlePool';
import { resolveAirflowIntensity, resolveTireSmokeStrength } from './vehicle-effects';

/**
 * Fixed-capacity GPU vehicle effects. Emitter decisions and spawn payloads are prepared on the CPU;
 * WebGPU compute owns integration and opacity, and WebGL2 disables the effects instead of falling
 * back to CPU simulation.
 */
export class CarEffects {
  readonly root = new Group();
  readonly #tier: TierId;
  readonly #smokeTexture: DataTexture;
  readonly #streakTexture: DataTexture;
  readonly #smoke: GpuParticlePool;
  readonly #sparks: GpuParticlePool;
  readonly #airflow: GpuParticlePool;
  #renderer: WebGPURenderer | null = null;
  #configuredBackend: RendererBackendName | null = null;
  #lastSpawnRequests = { smoke: 0, sparks: 0, airflow: 0 };
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
    this.#smoke = new GpuParticlePool(
      'car-smoke',
      capacity.smoke,
      this.#smokeTexture,
      NormalBlending,
      1,
      8,
    );
    this.#sparks = new GpuParticlePool(
      'gear-shift-sparks',
      capacity.sparks,
      this.#streakTexture,
      AdditiveBlending,
      1,
      10,
    );
    this.#airflow = new GpuParticlePool(
      'speed-airflow',
      capacity.airflow,
      this.#streakTexture,
      AdditiveBlending,
      1,
      7,
    );
    this.root.add(this.#airflow.mesh, this.#smoke.mesh, this.#sparks.mesh);
  }

  get simulationMode(): 'pending' | 'webgpu-compute' | 'webgl2-disabled' {
    if (this.#renderer !== null) {
      return 'webgpu-compute';
    }
    return this.#configuredBackend === 'webgl2' ? 'webgl2-disabled' : 'pending';
  }

  get lastSpawnRequests(): Readonly<{ smoke: number; sparks: number; airflow: number }> {
    return this.#lastSpawnRequests;
  }

  /** Backend is known only after WebGPURenderer.init() resolves. */
  configureBackend(backend: RendererBackendName | null, renderer: WebGPURenderer): void {
    this.#configuredBackend = backend;
    this.#renderer = backend === 'webgpu' ? renderer : null;
    const enabled = this.#renderer !== null;
    this.#smoke.setComputeEnabled(enabled);
    this.#sparks.setComputeEnabled(enabled);
    this.#airflow.setComputeEnabled(enabled);
    this.reset();
  }

  update(
    delta: number,
    pose: VehiclePose,
    telemetry: VehicleTelemetry,
    wheels: readonly WheelState[],
    linearVelocity: Vec3,
  ): void {
    if (this.#disposed) {
      return;
    }
    const renderer = this.#renderer;
    if (renderer === null) {
      this.#lastSpawnRequests = { smoke: 0, sparks: 0, airflow: 0 };
      return;
    }

    const dt = Math.min(0.1, Math.max(0, delta));
    this.#smoke.beginFrame();
    this.#sparks.beginFrame();
    this.#airflow.beginFrame();

    if (dt > 0) {
      this.#updateExhaust(dt, pose, telemetry, linearVelocity);
      this.#updateTireSmoke(dt, pose, telemetry, wheels, linearVelocity);
      this.#updateShiftSparks(pose, telemetry, linearVelocity);
      this.#updateAirflow(dt, pose, telemetry, linearVelocity);
    }

    // CPU work is restricted to emitter requests. Integration, aging, rebasing, billboard sizing
    // and opacity are computed in the three GPU kernels before the scene draw.
    this.#smoke.prepareCompute(
      dt,
      (VEHICLE_EFFECTS_CONFIG.exhaust.buoyancyMetersPerSecondSquared +
        VEHICLE_EFFECTS_CONFIG.tireSmoke.buoyancyMetersPerSecondSquared) /
        2,
      (VEHICLE_EFFECTS_CONFIG.exhaust.dragPerSecond +
        VEHICLE_EFFECTS_CONFIG.tireSmoke.dragPerSecond) /
        2,
    );
    this.#sparks.prepareCompute(
      dt,
      -VEHICLE_EFFECTS_CONFIG.shiftSparks.gravityMetersPerSecondSquared,
      0.12,
    );
    this.#airflow.prepareCompute(dt, 0, 0);
    renderer.compute([
      this.#smoke.computeNode,
      this.#sparks.computeNode,
      this.#airflow.computeNode,
    ]);
    this.#smoke.finishCompute();
    this.#sparks.finishCompute();
    this.#airflow.finishCompute();
    this.#lastSpawnRequests = {
      smoke: this.#smoke.spawnRequests,
      sparks: this.#sparks.spawnRequests,
      airflow: this.#airflow.spawnRequests,
    };
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
    this.#lastSpawnRequests = { smoke: 0, sparks: 0, airflow: 0 };
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
      startSizeY: size * 0.38,
      endSizeY: size * 0.65,
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

function add(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}
