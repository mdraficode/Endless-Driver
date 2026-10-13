import { describe, expect, it } from 'vitest';
import { VEHICLE_CONFIG } from '../../src/config/vehicle';
import { WHEEL_INDEX } from '../../src/vehicles/types';

/** Handling-configuration invariants: the numbers behind the vehicle model must stay coherent. */
describe('vehicle configuration', () => {
  it('describes a plausible car mass and inertia', () => {
    const { chassis } = VEHICLE_CONFIG;
    expect(chassis.mass).toBeGreaterThan(600);
    expect(chassis.mass).toBeLessThan(2500);
    for (const extent of chassis.halfExtents) {
      expect(extent).toBeGreaterThan(0);
    }
    // A car is longer than it is wide and taller than it is tall.
    expect(chassis.halfExtents[2]).toBeGreaterThan(chassis.halfExtents[0]);
    expect(chassis.halfExtents[0]).toBeGreaterThan(chassis.halfExtents[1]);
    // Center of mass sits low in the body, which is what keeps the car from tipping.
    expect(chassis.centerOfMass[1]).toBeLessThan(0);
    expect(Math.abs(chassis.centerOfMass[1])).toBeLessThan(chassis.halfExtents[1]);
    expect(chassis.ccd).toBe(true);
    expect(chassis.outOfBoundsY).toBeLessThan(-5);
  });

  it('places four wheels symmetrically on a wheelbase', () => {
    const { wheels } = VEHICLE_CONFIG;
    expect(wheels.halfTrack).toBeGreaterThan(0.5);
    expect(wheels.frontZ).toBeLessThan(0);
    expect(wheels.rearZ).toBeGreaterThan(0);
    expect(wheels.frontZ).toBeLessThan(wheels.rearZ);
    // Track and wheelbase are both inside the chassis box.
    expect(wheels.halfTrack).toBeLessThan(VEHICLE_CONFIG.chassis.halfExtents[0] + 0.2);
    expect(Math.abs(wheels.frontZ)).toBeLessThan(VEHICLE_CONFIG.chassis.halfExtents[2]);
    expect(wheels.rearZ).toBeLessThan(VEHICLE_CONFIG.chassis.halfExtents[2]);
    expect(WHEEL_INDEX.frontLeft).toBe(0);
    expect(WHEEL_INDEX.rearRight).toBe(3);
  });

  it('keeps suspension travel, stiffness, and force limits consistent', () => {
    const { wheels, chassis } = VEHICLE_CONFIG;
    expect(wheels.minLength).toBeGreaterThan(0);
    expect(wheels.minLength).toBeLessThan(wheels.restLength);
    expect(wheels.restLength).toBeLessThan(wheels.maxLength);
    expect(wheels.stiffness).toBeGreaterThan(0);
    expect(wheels.compressionDamping).toBeGreaterThan(0);
    expect(wheels.reboundDamping).toBeGreaterThan(0);
    expect(wheels.antiRollStiffness).toBeGreaterThanOrEqual(0);

    // The springs must hold the car's static weight with usable travel left: static load per wheel
    // divided by stiffness has to sit comfortably inside the travel range.
    const staticLoad = (chassis.mass * 9.81) / 4;
    const staticCompression = staticLoad / wheels.stiffness;
    const travel = wheels.restLength - wheels.minLength;
    expect(staticCompression).toBeGreaterThan(0.02);
    expect(staticCompression).toBeLessThan(travel * 0.6);
    // Force ceiling must exceed static load, otherwise the car would sink on its bump stops.
    expect(wheels.maxForce).toBeGreaterThan(staticLoad * 2);
  });

  it('keeps tire parameters inside the physically meaningful ranges', () => {
    const { tires } = VEHICLE_CONFIG;
    expect(tires.frictionCoefficient).toBeGreaterThan(0.7);
    expect(tires.frictionCoefficient).toBeLessThan(1.6);
    expect(tires.loadSensitivity).toBeGreaterThan(0);
    expect(tires.loadSensitivity).toBeLessThan(0.4);
    // E near 1 removes the force peak; the model needs a real peak to allow drifting.
    expect(tires.lateralCurvature).toBeGreaterThanOrEqual(0);
    expect(tires.lateralCurvature).toBeLessThan(0.5);
    expect(tires.lateralStiffness).toBeGreaterThan(3);
    expect(tires.lateralShape).toBeGreaterThan(1);
    expect(tires.handbrakeGripScale).toBeGreaterThan(0);
    expect(tires.handbrakeGripScale).toBeLessThan(1);
    expect(tires.slipAngleReferenceSpeed).toBeGreaterThan(0);
  });

  it('orders the gearbox and the torque curve consistently', () => {
    const { drivetrain } = VEHICLE_CONFIG;
    expect(drivetrain.gearRatios.length).toBeGreaterThanOrEqual(5);
    for (let index = 1; index < drivetrain.gearRatios.length; index += 1) {
      expect(drivetrain.gearRatios[index]).toBeLessThan(drivetrain.gearRatios[index - 1] as number);
    }
    expect(drivetrain.reverseRatio).toBeGreaterThan(0);
    expect(drivetrain.finalDrive).toBeGreaterThan(1);
    expect(drivetrain.efficiency).toBeGreaterThan(0.5);
    expect(drivetrain.efficiency).toBeLessThanOrEqual(1);
    expect(drivetrain.idleRpm).toBeLessThan(drivetrain.shiftUpRpm);
    expect(drivetrain.shiftDownRpm).toBeLessThan(drivetrain.shiftUpRpm);
    expect(drivetrain.shiftUpRpm).toBeLessThan(drivetrain.maxRpm);
    expect(drivetrain.shiftTorqueFactor).toBeGreaterThanOrEqual(0);
    expect(drivetrain.shiftTorqueFactor).toBeLessThan(1);
    expect(drivetrain.responseSeconds).toBeGreaterThan(0);
    expect(['rear', 'all']).toContain(drivetrain.drivenWheels);
  });

  it('gives the brakes enough force to stop the car but less than the tires can hold', () => {
    const { brakes, chassis, tires } = VEHICLE_CONFIG;
    for (const force of [brakes.frontForce, brakes.rearForce, brakes.handbrakeForce]) {
      expect(force).toBeGreaterThan(0);
    }
    expect(brakes.frontForce).toBeGreaterThan(brakes.rearForce);
    const gripAvailable = tires.frictionCoefficient * chassis.mass * 9.81;
    expect(brakes.frontForce + brakes.rearForce).toBeLessThanOrEqual(gripAvailable);
    // Rear-only handbrake force must be able to lock the rear axle at speed.
    expect(brakes.handbrakeForce).toBeGreaterThan(brakes.rearForce * 0.8);
  });

  it('keeps the steering limits usable and the cornering budget slightly over the grip limit', () => {
    const { steering, wheels } = VEHICLE_CONFIG;
    expect(steering.maxAngle).toBeGreaterThan(0.3);
    expect(steering.maxAngle).toBeLessThan(0.8);
    expect(steering.minAngle).toBeGreaterThan(0);
    expect(steering.minAngle).toBeLessThan(steering.maxAngle);
    // A budget slightly above the tire limit keeps full lock at the edge of grip rather than far
    // beyond it, while still allowing the rear to break away under power.
    expect(steering.gripBudgetFactor).toBeGreaterThan(1);
    expect(steering.gripBudgetFactor).toBeLessThan(1.8);
    expect(steering.slipReliefFactor).toBeGreaterThan(0);
    expect(steering.ackermann).toBeGreaterThanOrEqual(0);
    expect(steering.ackermann).toBeLessThan(0.5);
    // Wheelbase must be positive for the cornering-budget formula to be meaningful.
    expect(Math.abs(wheels.rearZ - wheels.frontZ)).toBeGreaterThan(1.5);
  });

  it('keeps aero and hold-damping terms small enough not to dominate the tire model', () => {
    const { aero, tires, chassis } = VEHICLE_CONFIG;
    expect(aero.downforceCoefficient).toBeGreaterThanOrEqual(0);
    expect(aero.dragCoefficient).toBeGreaterThan(0);
    // At 40 m/s neither drag nor downforce may exceed a third of the car's weight.
    const weight = chassis.mass * 9.81;
    expect(aero.dragCoefficient * 1600).toBeLessThan(weight / 3);
    expect(aero.downforceCoefficient * 1600).toBeLessThan(weight / 3);
    expect(tires.holdSpeed).toBeGreaterThan(0);
    expect(tires.holdDamping).toBeGreaterThan(0);
    expect(tires.rollingResistance).toBeGreaterThanOrEqual(0);
    expect(tires.rollingResistance).toBeLessThan(0.1);
  });
});
