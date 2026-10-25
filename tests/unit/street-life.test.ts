import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  URBAN_ACTIVITY_TIER_BUDGET,
  URBAN_STREET_LIFE_TIER_BUDGET,
} from '../../src/config/urban-city';
import { UrbanStreetActivity } from '../../src/world/urban-activity';

const SAMPLE = new Matrix4();

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
      const meshA = a.root.getObjectByName(name);
      const meshB = b.root.getObjectByName(name);
      if (meshA === undefined || meshB === undefined) {
        throw new Error(`missing street-life mesh ${name}`);
      }
      for (let index = 0; index < meshA.count; index += 1) {
        meshA.getMatrixAt(index, SAMPLE);
        const ax = SAMPLE.elements[12]!;
        const ay = SAMPLE.elements[13]!;
        const az = SAMPLE.elements[14]!;
        meshB.getMatrixAt(index, SAMPLE);
        expect(SAMPLE.elements[12]).toBeCloseTo(ax, 9);
        expect(SAMPLE.elements[13]).toBeCloseTo(ay, 9);
        expect(SAMPLE.elements[14]).toBeCloseTo(az, 9);
      }
    }
    a.dispose();
    b.dispose();
  });

  it('keeps every street-life matrix finite over a long drive and vendors stay planted', () => {
    const activity = new UrbanStreetActivity('A');
    const before = activity.root
      .getObjectByName('aohara-cart-vendor-carts')!
      .getMatrixAt(0, new Matrix4())
      .clone();
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
      const mesh = activity.root.getObjectByName(name);
      expect(mesh).toBeDefined();
      if (mesh === undefined) continue;
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, SAMPLE);
        for (const value of SAMPLE.elements) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
    const after = activity.root
      .getObjectByName('aohara-cart-vendor-carts')!
      .getMatrixAt(0, new Matrix4())
      .clone();
    expect(after.elements[12]).toBeCloseTo(before.elements[12]!, 9);
    expect(after.elements[13]).toBeCloseTo(before.elements[13]!, 9);
    expect(after.elements[14]).toBeCloseTo(before.elements[14]!, 9);
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
    const afterGreen = green.root
      .getObjectByName('aohara-motorbike-frames')!
      .getMatrixAt(0, new Matrix4())
      .clone();
    // 150 s of red covers the worst-case maniac's full loop reach at 11 m/s.
    for (let frame = 0; frame < 9000; frame += 1) {
      green.update(1 / 60, 'red');
    }
    const settledA = green.root
      .getObjectByName('aohara-motorbike-frames')!
      .getMatrixAt(0, new Matrix4())
      .clone();
    green.update(1 / 60, 'red');
    const settledB = green.root
      .getObjectByName('aohara-motorbike-frames')!
      .getMatrixAt(0, new Matrix4())
      .clone();
    // The maniac moved on green...
    const movedOnGreen =
      Math.abs(afterGreen.elements[12]! - settledA.elements[12]!) +
      Math.abs(afterGreen.elements[14]! - settledA.elements[14]!);
    expect(movedOnGreen).toBeGreaterThan(0.5);
    // ...and is fully settled after the long red: no further route progress.
    expect(settledB.elements[12]).toBeCloseTo(settledA.elements[12]!, 9);
    expect(settledB.elements[13]).toBeCloseTo(settledA.elements[13]!, 9);
    expect(settledB.elements[14]).toBeCloseTo(settledA.elements[14]!, 9);
    green.dispose();
  });
});
