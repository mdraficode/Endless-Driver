import { PerspectiveCamera } from 'three';
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

const camera = new PerspectiveCamera(55, 1, 0.1, 500);
camera.position.set(0, 4, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);

describe('batched car effects', () => {
  it('emits exhaust, tire smoke, gear sparks, and high-speed flow within fixed tier pools', () => {
    const effects = new CarEffects('C');
    const velocity = { x: 0, y: 0, z: -20 };
    for (let frame = 0; frame < 10; frame += 1) {
      effects.update(0.1, pose, telemetry, wheels, velocity, camera);
    }
    expect(effects.activeParticleCounts.smoke).toBeGreaterThan(0);
    expect(effects.activeParticleCounts.airflow).toBe(0);

    const fast = { ...telemetry, speedMps: 50, speedKph: 180, forwardSpeed: 50 };
    for (let frame = 0; frame < 5; frame += 1) {
      effects.update(0.1, pose, fast, wheels, { x: 0, y: 0, z: -50 }, camera);
    }
    expect(effects.activeParticleCounts.airflow).toBeGreaterThan(0);

    effects.update(
      1 / 60,
      pose,
      { ...fast, gear: 2, shifting: true },
      wheels,
      { x: 0, y: 0, z: -50 },
      camera,
    );
    expect(effects.activeParticleCounts.sparks).toBe(
      VEHICLE_EFFECTS_CONFIG.shiftSparks.countByTier.C,
    );
    expect(effects.root.children).toHaveLength(3);

    // Long runs overwrite bounded ring-buffer slots instead of allocating particles forever.
    for (let frame = 0; frame < 100; frame += 1) {
      effects.update(0.1, pose, { ...fast, gear: 2 }, wheels, { x: 0, y: 0, z: -50 }, camera);
    }
    const counts = effects.activeParticleCounts;
    const budget = VEHICLE_EFFECTS_CONFIG.particleCapacityByTier.C;
    expect(counts.smoke).toBeLessThanOrEqual(budget.smoke);
    expect(counts.sparks).toBeLessThanOrEqual(budget.sparks);
    expect(counts.airflow).toBeLessThanOrEqual(budget.airflow);

    effects.shiftBy(256, -512);
    effects.reset();
    expect(effects.activeParticleCounts).toEqual({ smoke: 0, sparks: 0, airflow: 0 });
    effects.dispose();
    expect(effects.root.children).toHaveLength(0);
  });
});
