import type { WebGPURenderer } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { VEHICLE_EFFECTS_CONFIG } from '../../src/config/vehicle-effects';
import { VEHICLE_CONFIG } from '../../src/config/vehicle';
import { CarEffects } from '../../src/vehicles/CarEffects';
import type { VehiclePose, VehicleTelemetry, WheelState } from '../../src/vehicles/types';

const pose: VehiclePose = {
  position: { x: 0, y: 0.7, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  wheels: [
    { isFront: true, steerAngle: 0, spinAngle: 0, suspensionLength: 0.37 },
    { isFront: true, steerAngle: 0, spinAngle: 0, suspensionLength: 0.37 },
    { isFront: false, steerAngle: 0, spinAngle: 0, suspensionLength: 0.37 },
    { isFront: false, steerAngle: 0, spinAngle: 0, suspensionLength: 0.37 },
  ],
};

const wheels: WheelState[] = Array.from({ length: 4 }, (_, index) => {
  const isFront = index < 2;
  const side: -1 | 1 = index % 2 === 0 ? -1 : 1;
  const z = isFront ? VEHICLE_CONFIG.wheels.frontZ : VEHICLE_CONFIG.wheels.rearZ;
  return {
    index,
    isFront,
    side,
    anchor: { x: side * VEHICLE_CONFIG.wheels.halfTrack, y: 0, z },
    inContact: true,
    contactPoint: { x: 0, y: 0, z: 0 },
    contactNormal: { x: 0, y: 1, z: 0 },
    suspensionLength: VEHICLE_CONFIG.wheels.restLength,
    compression: 0,
    smoothedCompression: 0,
    suspensionForce: 0,
    normalLoad: 3000,
    tireLoad: 3000,
    slipAngle: 0.34,
    longitudinalForce: 0,
    lateralForce: 0,
    steerAngle: 0,
    spinAngle: 0,
    utilization: 0.97,
    surfaceVelocity: { x: 0, y: 0, z: 0 },
    surfaceId: 'asphalt',
    surfaceGripModifier: 1,
    surfaceRollingResistance: VEHICLE_CONFIG.tires.rollingResistance,
  };
});

const telemetry: VehicleTelemetry = {
  speedMps: 20,
  speedKph: 72,
  forwardSpeed: 20,
  rpm: 3200,
  gear: 1,
  shifting: false,
  throttle: 0.8,
  brake: 0,
  handbrake: false,
  steerAngle: 0,
  contactCount: 4,
  isGrounded: true,
  slipAngle: 0,
  lateralAcceleration: 0,
  longitudinalAcceleration: 0,
  drifting: false,
  distanceTravelled: 0,
};

function createComputeRecorder(): { renderer: WebGPURenderer; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const renderer = {
    compute(nodes: unknown): void {
      calls.push(Array.isArray(nodes) ? nodes : [nodes]);
    },
  } as unknown as WebGPURenderer;
  return { renderer, calls };
}

describe('GPU-compute vehicle effects', () => {
  it('queues bounded emitter requests and batches their compute work on WebGPU', () => {
    const effects = new CarEffects('C');
    const { renderer, calls } = createComputeRecorder();
    effects.configureBackend('webgpu', renderer);
    expect(effects.simulationMode).toBe('webgpu-compute');
    expect(effects.root.children.every((child) => child.visible)).toBe(true);

    const velocity = { x: 0, y: 0, z: -20 };
    let smokeRequests = 0;
    for (let frame = 0; frame < 10; frame += 1) {
      effects.update(0.1, pose, telemetry, wheels, velocity);
      smokeRequests += effects.lastSpawnRequests.smoke;
    }
    expect(smokeRequests).toBeGreaterThan(0);
    expect(effects.lastSpawnRequests.airflow).toBe(0);

    const fast = { ...telemetry, speedMps: 50, speedKph: 180, forwardSpeed: 50 };
    let airflowRequests = 0;
    for (let frame = 0; frame < 5; frame += 1) {
      effects.update(0.1, pose, fast, wheels, { x: 0, y: 0, z: -50 });
      airflowRequests += effects.lastSpawnRequests.airflow;
    }
    expect(airflowRequests).toBeGreaterThan(0);

    effects.update(1 / 60, pose, { ...fast, gear: 2, shifting: true }, wheels, {
      x: 0,
      y: 0,
      z: -50,
    });
    expect(effects.lastSpawnRequests.sparks).toBe(VEHICLE_EFFECTS_CONFIG.shiftSparks.countByTier.C);
    expect(calls.length).toBe(16);
    expect(calls.every((batch) => batch.length === 3)).toBe(true);
    expect(calls.at(-1)).toHaveLength(3);
    expect(calls.at(-1)?.every((node) => (node as { isComputeNode?: boolean }).isComputeNode)).toBe(
      true,
    );

    // Fixed instance counts stay equal to the existing C-tier budgets; no CPU particle list is kept.
    const budget = VEHICLE_EFFECTS_CONFIG.particleCapacityByTier.C;
    expect((effects.root.children[0] as { count: number }).count).toBe(budget.airflow);
    expect((effects.root.children[1] as { count: number }).count).toBe(budget.smoke);
    expect((effects.root.children[2] as { count: number }).count).toBe(budget.sparks);

    effects.shiftBy(256, -512);
    effects.reset();
    expect(effects.lastSpawnRequests).toEqual({ smoke: 0, sparks: 0, airflow: 0 });
    effects.dispose();
    expect(effects.root.children).toHaveLength(0);
  });

  it('disables compute effects on WebGL2 instead of using a CPU simulation fallback', () => {
    const effects = new CarEffects('C');
    const { renderer, calls } = createComputeRecorder();
    effects.configureBackend('webgl2', renderer);
    expect(effects.simulationMode).toBe('webgl2-disabled');
    expect(effects.root.children.every((child) => !child.visible)).toBe(true);

    for (let frame = 0; frame < 20; frame += 1) {
      effects.update(0.1, pose, telemetry, wheels, { x: 0, y: 0, z: -20 });
    }
    expect(calls).toHaveLength(0);
    expect(effects.lastSpawnRequests).toEqual({ smoke: 0, sparks: 0, airflow: 0 });
    effects.dispose();
  });
});
