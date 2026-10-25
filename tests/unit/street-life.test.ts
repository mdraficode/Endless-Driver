import { InstancedMesh, Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  URBAN_ACTIVITY_TIER_BUDGET,
  URBAN_STREET_LIFE_TIER_BUDGET,
} from '../../src/config/urban-city';
import { UrbanStreetActivity } from '../../src/world/urban-activity';

const SAMPLE = new Matrix4();

function streetLifeMesh(activity: UrbanStreetActivity, name: string): InstancedMesh {
  const mesh = activity.root.getObjectByName(name);
  if (!(mesh instanceof InstancedMesh)) {
    throw new Error(`missing street-life mesh ${name}`);
  }
  return mesh;
}

function meshPosition(mesh: InstancedMesh, index: number): [number, number, number] {
  mesh.getMatrixAt(index, SAMPLE);
  return [SAMPLE.elements[12]!, SAMPLE.elements[13]!, SAMPLE.elements[14]!];
}

/**
 * Phase 8.2 street-life contract: sidewalk cyclists, static cart vendors and fast motorbike
 * maniacs stay inside the tier budgets, are deterministic, remain stable over long runs, and the
 * maniacs hold back before the stop line on a red phase without crossing it.
 */
describe('Aohara street life', () => {
  it('fills the street-life budgets per tier and exposes the new stats', () => {
    for (const tier of ['C', 'B', 'A'] as const) {
      const activity = new UrbanStreetActivity(tier);
      const budget = URBAN_STREET_LIFE_TIER_BUDGET[tier];
      const stats = activity.getContentStats();
      expect(stats.urbanCyclists).toBe(budget.cyclists);
      expect(stats.urbanCartVendors).toBe(budget.cartVendors);
      expect(stats.urbanMotorbikes).toBe(budget.motorbikes);
      // No physics in this composition: maniac bodies are only created with a PhysicsWorld.
      expect(stats.urbanMotorbikePhysicsBodies).toBe(0);
      // Baseline activity is untouched.
      expect(stats.urbanTrafficVehicles).toBe(URBAN_ACTIVITY_TIER_BUDGET[tier].trafficVehicles);
      expect(stats.urbanPedestrians).toBe(URBAN_ACTIVITY_TIER_BUDGET[tier].pedestrians);
      activity.dispose();
    }
    expect(URBAN_STREET_LIFE_TIER_BUDGET.C.cyclists).toBeLessThan(
      URBAN_STREET_LIFE_TIER_BUDGET.A.cyclists,
    );
    expect(URBAN_STREET_LIFE_TIER_BUDGET.C.cartVendors).toBeLessThan(
      URBAN_STREET_LIFE_TIER_BUDGET.A.cartVendors,
    );
    expect(URBAN_STREET_LIFE_TIER_BUDGET.C.motorbikes).toBe(0);
  });

  it('keeps one instanced batch per street-life kind inside the draw-call budget', () => {
    // Core batches: 5 traffic classes + pedestrian body + head = 7.
    // Tier B street life: cyclists 3, vendors 4, motorbikes 3 = 10 more → 17 total.
    const activity = new UrbanStreetActivity('B');
    expect(activity.getContentStats().urbanActivityBatches).toBe(17);
    for (const name of [
      'aohara-cyclist-bikes',
      'aohara-cyclist-rider-bodies',
      'aohara-cyclist-rider-heads',
      'aohara-cart-vendor-carts',
      'aohara-cart-vendor-lanterns',
      'aohara-cart-vendor-bodies',
      'aohara-cart-vendor-heads',
      'aohara-motorbike-frames',
      'aohara-motorbike-rider-bodies',
      'aohara-motorbike-rider-heads',
    ]) {
      expect(activity.root.getObjectByName(name)).toBeDefined();
    }
    // Tier C has no motorbikes, so its batch count drops by the three maniac meshes.
    const low = new UrbanStreetActivity('C');
    expect(low.getContentStats().urbanActivityBatches).toBe(14);
    expect(low.root.getObjectByName('aohara-motorbike-frames')).toBeUndefined();
    low.dispose();
    activity.dispose();
  });

  it('deterministically reproduces street-life matrices across two instances', () => {
    const a = new UrbanStreetActivity('B');
    const b = new UrbanStreetActivity('B');
    for (let frame = 0; frame < 240; frame += 1) {
      a.update(1 / 60, 'green');
      b.update(1 / 60, 'green');
    }
    for (const name of [
      'aohara-cyclist-bikes',
      'aohara-cart-vendor-carts',
      'aohara-motorbike-frames',
    ]) {
      const meshA = streetLifeMesh(a, name);
      const meshB = streetLifeMesh(b, name);
      for (let index = 0; index < meshA.count; index += 1) {
        const [ax, ay, az] = meshPosition(meshA, index);
        const [bx, by, bz] = meshPosition(meshB, index);
        expect(bx).toBeCloseTo(ax, 9);
        expect(by).toBeCloseTo(ay, 9);
        expect(bz).toBeCloseTo(az, 9);
      }
    }
    a.dispose();
    b.dispose();
  });

  it('keeps every street-life matrix finite over a long drive and vendors stay planted', () => {
    const activity = new UrbanStreetActivity('A');
    const before = meshPosition(streetLifeMesh(activity, 'aohara-cart-vendor-carts'), 0);
    for (let frame = 0; frame < 3000; frame += 1) {
      activity.update(1 / 60, frame % 260 < 100 ? 'green' : 'red');
    }
    for (const name of [
      'aohara-cyclist-bikes',
      'aohara-cyclist-rider-heads',
      'aohara-cart-vendor-carts',
      'aohara-cart-vendor-lanterns',
      'aohara-motorbike-frames',
      'aohara-motorbike-rider-heads',
    ]) {
      const mesh = streetLifeMesh(activity, name);
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, SAMPLE);
        for (const value of SAMPLE.elements) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
    const after = meshPosition(streetLifeMesh(activity, 'aohara-cart-vendor-carts'), 0);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
    expect(after[2]).toBeCloseTo(before[2], 9);
    activity.dispose();
  });

  it('holds motorbike maniacs behind their stop-line slot on red without crossing it', () => {
    const activity = new UrbanStreetActivity('B');
    const bikeCount = activity.getContentStats().urbanMotorbikes;
    expect(bikeCount).toBeGreaterThan(0);
    const halfLength = 1.05;
    // The maniac's own queue slot is its half-length ahead of the stop line; the stop band
    // tolerates a 0.03 m approach, so a settled margin sits in [halfLength, halfLength + 0.03].
    for (let frame = 0; frame < 9000; frame += 1) {
      activity.update(1 / 60, 'red');
      for (const margin of activity.getMotorbikeStopLineMargins()) {
        expect(margin).toBeGreaterThanOrEqual(halfLength - 1e-6);
      }
    }
    for (const margin of activity.getMotorbikeStopLineMargins()) {
      expect(margin).toBeGreaterThanOrEqual(halfLength);
      expect(margin).toBeLessThanOrEqual(halfLength + 0.03 + 1e-6);
    }
    activity.dispose();
  });

  it('advances maniacs on green and stops them reproducibly', () => {
    const green = new UrbanStreetActivity('B');
    for (let frame = 0; frame < 120; frame += 1) {
      green.update(1 / 60, 'green');
    }
    const afterGreen = meshPosition(streetLifeMesh(green, 'aohara-motorbike-frames'), 0);
    // 150 s of red covers the worst-case maniac's full loop reach at 11 m/s.
    for (let frame = 0; frame < 9000; frame += 1) {
      green.update(1 / 60, 'red');
    }
    const settledA = meshPosition(streetLifeMesh(green, 'aohara-motorbike-frames'), 0);
    green.update(1 / 60, 'red');
    const settledB = meshPosition(streetLifeMesh(green, 'aohara-motorbike-frames'), 0);
    // The maniac moved on green...
    const movedOnGreen =
      Math.abs(afterGreen[0] - settledA[0]) + Math.abs(afterGreen[2] - settledA[2]);
    expect(movedOnGreen).toBeGreaterThan(0.5);
    // ...and is fully settled after the long red: no further route progress and no weaving.
    expect(settledB[0]).toBeCloseTo(settledA[0], 9);
    expect(settledB[1]).toBeCloseTo(settledA[1], 9);
    expect(settledB[2]).toBeCloseTo(settledA[2], 9);
    green.dispose();
  });
});
