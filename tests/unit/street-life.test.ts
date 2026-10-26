import { InstancedMesh, Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';

import {
  URBAN_ACTIVITY_TIER_BUDGET,
  URBAN_STREET_LIFE_TIER_BUDGET,
} from '../../src/config/urban-city';
import { UrbanStreetActivity } from '../../src/world/urban-activity';
import type { TownCarProbe } from '../../src/world/town';

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
      // Phase 8.2b: the fallback (no network) slots still fill every 8.2b budget.
      expect(stats.urbanAlleySitters).toBe(budget.alleySitters);
      expect(stats.urbanHomeDoors).toBe(budget.homeDoors);
      expect(stats.urbanEasterEggs).toBe(budget.easterEggs);
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
    // Tier B street life: cyclists 3, vendors 4, motorbikes 3 = 10 more → 17.
    // Phase 8.2b: sitters 3, home doors 2, eggs (juggler 3 + dog 1 + balloon cart 4) 8 → 30.
    const activity = new UrbanStreetActivity('B');
    expect(activity.getContentStats().urbanActivityBatches).toBe(30);
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
      'aohara-alley-sitter-bodies',
      'aohara-alley-sitter-heads',
      'aohara-alley-sitter-cardboard',
      'aohara-home-door-resident-bodies',
      'aohara-home-door-resident-heads',
      'aohara-egg-juggler-bodies',
      'aohara-egg-juggler-heads',
      'aohara-egg-juggler-cones',
      'aohara-egg-dogs',
      'aohara-egg-balloon-carts',
      'aohara-egg-balloon-vendor-bodies',
      'aohara-egg-balloon-vendor-heads',
      'aohara-egg-balloons',
    ]) {
      expect(activity.root.getObjectByName(name)).toBeDefined();
    }
    // Tier C has no motorbikes, so its batch count drops by the three maniac meshes:
    // 17 - 3 + sitters 3 + doors 2 + eggs (juggler 3 + dog 1) 4 = 23.
    const low = new UrbanStreetActivity('C');
    expect(low.getContentStats().urbanActivityBatches).toBe(23);
    expect(low.root.getObjectByName('aohara-motorbike-frames')).toBeUndefined();
    // Tier C has only the first two egg kinds; the balloon cart and spinner exist from B up.
    expect(low.root.getObjectByName('aohara-egg-balloon-carts')).toBeUndefined();
    expect(low.root.getObjectByName('aohara-egg-spinner-bodies')).toBeUndefined();
    expect(activity.root.getObjectByName('aohara-egg-spinner-bodies')).toBeUndefined();
    const rich = new UrbanStreetActivity('A');
    expect(rich.getContentStats().urbanActivityBatches).toBe(32);
    expect(rich.root.getObjectByName('aohara-egg-spinner-bodies')).toBeDefined();
    rich.dispose();
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

  it('sits homeless sitters on explicit alley slots, deterministically, with cardboard boxes', () => {
    const slots = [
      { x: -12.5, z: 44.5, yaw: 0.7 },
      { x: 30.5, z: -20.5, yaw: -1.9 },
      { x: 2.5, z: 78.5, yaw: 2.6 },
    ];
    // Tier A budgets three sitters, so all three explicit slots are used; a lower tier would
    // take only its budget from the same list.
    const a = new UrbanStreetActivity('A', { alleySitterSlots: slots });
    expect(a.getContentStats().urbanAlleySitters).toBe(3);
    const capped = new UrbanStreetActivity('C', { alleySitterSlots: slots });
    expect(capped.getContentStats().urbanAlleySitters).toBe(1);
    capped.dispose();
    const body = streetLifeMesh(a, 'aohara-alley-sitter-bodies');
    const cardboard = streetLifeMesh(a, 'aohara-alley-sitter-cardboard');
    const hidden = new Matrix4().makeScale(0, 0, 0);
    for (let index = 0; index < slots.length; index += 1) {
      const [x, , z] = meshPosition(body, index);
      expect(x).toBeCloseTo(slots[index]!.x, 6);
      expect(z).toBeCloseTo(slots[index]!.z, 6);
      if (index % 2 === 0) {
        // Cardboard sitters: the box sits beside them, not hidden.
        cardboard.getMatrixAt(index, SAMPLE);
        expect(Math.abs(SAMPLE.elements[12]! - x)).toBeGreaterThan(0.3);
      } else {
        cardboard.getMatrixAt(index, SAMPLE);
        expect(SAMPLE.elements[0]).toBeCloseTo(hidden.elements[0]!, 9);
        expect(SAMPLE.elements[5]).toBeCloseTo(hidden.elements[5]!, 9);
      }
    }
    // The sitters sway: the same seat produces the same pose in two independent instances.
    const b = new UrbanStreetActivity('A', { alleySitterSlots: slots });
    for (let frame = 0; frame < 6000; frame += 1) {
      a.update(1 / 60, 'green');
      b.update(1 / 60, 'green');
    }
    const matrixA = new Matrix4();
    const matrixB = new Matrix4();
    const headA = streetLifeMesh(a, 'aohara-alley-sitter-heads');
    const headB = streetLifeMesh(b, 'aohara-alley-sitter-heads');
    for (let index = 0; index < slots.length; index += 1) {
      headA.getMatrixAt(index, matrixA);
      headB.getMatrixAt(index, matrixB);
      for (let channel = 0; channel < 16; channel += 1) {
        expect(matrixA.elements[channel]).toBeCloseTo(matrixB.elements[channel]!, 9);
      }
      body.getMatrixAt(index, matrixA);
      // Seated on the road plane with a millimetre breathing sway.
      expect(matrixA.elements[13]).toBeGreaterThan(-0.5);
      expect(matrixA.elements[13]).toBeLessThan(-0.4);
    }
    a.dispose();
    b.dispose();
  });

  it('moves home-door residents through wait, enter, hidden-inside, and exit cycles', () => {
    const slots = [{ x: 10, z: 20, yaw: 1.2 }];
    const a = new UrbanStreetActivity('C', { homeDoorSlots: slots });
    expect(a.getContentStats().urbanHomeDoors).toBe(1);
    const body = streetLifeMesh(a, 'aohara-home-door-resident-bodies');
    // The slot faces local +Z: door point = slot + 0.18 along (sin yaw, cos yaw), stand spot
    // ~2.2 m further out (plus a deterministic lateral spread of at most 1.1 m).
    const doorX = 10 + Math.sin(1.2) * 0.18;
    const doorZ = 20 + Math.cos(1.2) * 0.18;
    let hiddenOnce = false;
    let visibleOnce = false;
    let sawWalk = false;
    const b = new UrbanStreetActivity('C', { homeDoorSlots: slots });
    // 200 s at 30 Hz covers several full wait→enter→dwell→exit cycles (longest ~60 s).
    for (let frame = 0; frame < 6000; frame += 1) {
      a.update(1 / 30, 'green');
      b.update(1 / 30, 'green');
      body.getMatrixAt(0, SAMPLE);
      const scale = Math.hypot(SAMPLE.elements[0]!, SAMPLE.elements[5]!);
      if (scale < 1e-6) {
        hiddenOnce = true;
      } else {
        visibleOnce = true;
        const x = SAMPLE.elements[12]!;
        const z = SAMPLE.elements[14]!;
        const distance = Math.hypot(x - doorX, z - doorZ);
        if (distance > 0.4 && distance < 3.0) {
          sawWalk = true;
        }
      }
    }
    expect(hiddenOnce).toBe(true);
    expect(visibleOnce).toBe(true);
    expect(sawWalk).toBe(true);
    // Fully deterministic: after the same 200 s both instances sit at the same matrix.
    const matrixA = new Matrix4();
    const matrixB = new Matrix4();
    body.getMatrixAt(0, matrixA);
    const bBody = streetLifeMesh(b, 'aohara-home-door-resident-bodies');
    bBody.getMatrixAt(0, matrixB);
    for (let channel = 0; channel < 16; channel += 1) {
      expect(matrixA.elements[channel]).toBeCloseTo(matrixB.elements[channel]!, 9);
    }
    a.dispose();
    b.dispose();
  });

  it('runs the deterministic easter-egg moments (juggler cones, dog wake, balloon release, spin)', () => {
    const a = new UrbanStreetActivity('A');
    const stats = a.getContentStats();
    expect(stats.urbanEasterEggs).toBe(4);
    const cones = streetLifeMesh(a, 'aohara-egg-juggler-cones');
    const jugglers = streetLifeMesh(a, 'aohara-egg-juggler-bodies');
    const dog = streetLifeMesh(a, 'aohara-egg-dogs');
    const balloons = streetLifeMesh(a, 'aohara-egg-balloons');
    const spinnerBody = streetLifeMesh(a, 'aohara-egg-spinner-bodies');
    const baseY = -0.46 + 0.035;
    let jugglerPos: [number, number, number] | null = null;
    let dogMinY = Infinity;
    let dogMaxY = -Infinity;
    let balloonMaxY = -Infinity;
    let balloonHiddenOnce = false;
    let spinnerCosMin = Infinity;
    let spinnerCosMax = -Infinity;
    // One full 27 s dog cycle, one 18 s balloon period, one 14 s spinner cycle, and 30 s of cones.
    for (let frame = 0; frame < 60 * 45; frame += 1) {
      a.update(1 / 60, 'green');
      if (frame % 60 === 0 && jugglerPos === null) {
        jugglers.getMatrixAt(0, SAMPLE);
        jugglerPos = [SAMPLE.elements[12]!, SAMPLE.elements[13]!, SAMPLE.elements[14]!];
      }
      // Cones orbit within reach of the juggler and stay hand-to-head height above the walk.
      if (frame % 60 === 0) {
        for (let index = 0; index < cones.count; index += 1) {
          cones.getMatrixAt(index, SAMPLE);
          const x = SAMPLE.elements[12]!;
          const y = SAMPLE.elements[13]!;
          const z = SAMPLE.elements[14]!;
          if (jugglerPos !== null) {
            expect(Math.hypot(x - jugglerPos[0], z - jugglerPos[2])).toBeLessThanOrEqual(0.4);
          }
          expect(y).toBeGreaterThanOrEqual(baseY + 0.1);
          expect(y).toBeLessThanOrEqual(baseY + 1.15);
        }
      }
      // The dog sleeps at sidewalk height, then wakes a few centimetres higher.
      dog.getMatrixAt(0, SAMPLE);
      dogMinY = Math.min(dogMinY, SAMPLE.elements[13]!);
      dogMaxY = Math.max(dogMaxY, SAMPLE.elements[13]!);
      // One balloon leaves the cluster and drifts ~4.5 m up, then is hidden until its turn.
      for (let index = 0; index < balloons.count; index += 1) {
        balloons.getMatrixAt(index, SAMPLE);
        const scale = Math.hypot(SAMPLE.elements[0]!, SAMPLE.elements[5]!);
        if (scale < 1e-6) {
          balloonHiddenOnce = true;
        } else {
          balloonMaxY = Math.max(balloonMaxY, SAMPLE.elements[13]!);
        }
      }
      // The spinner completes a full 360°: its body yaw cosine sweeps the whole range.
      spinnerBody.getMatrixAt(0, SAMPLE);
      spinnerCosMin = Math.min(spinnerCosMin, SAMPLE.elements[0]!);
      spinnerCosMax = Math.max(spinnerCosMax, SAMPLE.elements[0]!);
    }
    expect(dogMaxY - dogMinY).toBeGreaterThanOrEqual(0.08);
    expect(balloonMaxY).toBeGreaterThanOrEqual(baseY + 4.4);
    expect(balloonHiddenOnce).toBe(true);
    expect(spinnerCosMin).toBeLessThan(-0.95);
    expect(spinnerCosMax).toBeGreaterThan(0.95);
    a.dispose();
  });

  it('sends the easter-egg dog fleeing when the car hits it, and shortens the flee once it has tumbled four times', () => {
    const activity = new UrbanStreetActivity('A');
    expect(activity.getContentStats().urbanEasterEggs).toBe(4);
    const dog = streetLifeMesh(activity, 'aohara-egg-dogs');
    activity.update(1 / 60, 'green');
    const [baseX, , baseZ] = meshPosition(dog, 0);

    // The car's front contact circle reaches the dog (wide radius 0.45) at 1.53 m centre
    // distance: 1.18 + 0.45 - 0.1 overlap, driving straight into it at 8 m/s.
    const makeProbe = (): TownCarProbe => ({
      x: baseX - 1.53,
      z: baseZ,
      yaw: -Math.PI / 2,
      velocityX: 8,
      velocityZ: 0,
    });

    for (let strike = 1; strike <= 5; strike += 1) {
      const hits = activity.collideActors(makeProbe());
      const absorbed = new Set(
        hits.filter((hit) => hit.element === 'street-actor').map((hit) => hit.absorbedSpeed),
      );
      // The dog's hit absorbs the 2.2 m/s street-actor cap (min(closing 8, cap 2.2)).
      expect(absorbed.has(2.2)).toBe(true);

      // Follow the dog out and back to its spot.
      let maxDistance = 0;
      let returnedFrame = -1;
      for (let frame = 0; frame < 360; frame += 1) {
        activity.update(1 / 60, 'green');
        const [x, , z] = meshPosition(dog, 0);
        const distance = Math.hypot(x - baseX, z - baseZ);
        maxDistance = Math.max(maxDistance, distance);
        if (returnedFrame < 0 && frame >= 30 && distance < 0.02) {
          returnedFrame = frame;
        }
      }
      expect(maxDistance).toBeGreaterThan(6.9);
      if (strike <= 3) {
        // A full flee covers the 7 m over the whole 4 s: still out at 3 s, back by ~4 s.
        expect(returnedFrame).toBeGreaterThan(180);
        expect(returnedFrame).toBeLessThanOrEqual(242);
      } else {
        // The fourth strong strike is the fourth tumble: the exhausted flee is cut to 1.2 s.
        expect(returnedFrame).toBeGreaterThanOrEqual(30);
        expect(returnedFrame).toBeLessThanOrEqual(120);
      }
    }
    expect(activity.getContentStats().urbanStreetActorImpacts).toBeGreaterThanOrEqual(5);
    activity.dispose();
  });

  it('knocks a street-life actor down deterministically: fall, lie, get up', () => {
    const slots = [{ x: 5, z: 5, yaw: 0.5 }];
    const a = new UrbanStreetActivity('A', { alleySitterSlots: slots });
    const b = new UrbanStreetActivity('A', { alleySitterSlots: slots });
    const probe: TownCarProbe = {
      x: 5 - 1.38, // 1.18 + 0.3 body radius - 0.1 overlap
      z: 5,
      yaw: -Math.PI / 2,
      velocityX: 8,
      velocityZ: 0,
    };
    const hitsA = a.collideActors(probe);
    const hitsB = b.collideActors(probe);
    expect(hitsA.length).toBe(hitsB.length);
    expect(hitsA.some((hit) => hit.element === 'street-actor' && hit.absorbedSpeed === 2.2)).toBe(
      true,
    );

    const bodyA = streetLifeMesh(a, 'aohara-alley-sitter-bodies');
    const bodyB = streetLifeMesh(b, 'aohara-alley-sitter-bodies');
    const headA = streetLifeMesh(a, 'aohara-alley-sitter-heads');
    const headB = streetLifeMesh(b, 'aohara-alley-sitter-heads');
    const baseY = -0.46 + 0.035;

    const mA = new Matrix4();
    const mB = new Matrix4();
    // Same strike in two independent instances → the whole knockdown must match exactly.
    const expectSamePose = (tLabel: string): void => {
      bodyA.getMatrixAt(0, mA);
      bodyB.getMatrixAt(0, mB);
      headA.getMatrixAt(0, mA);
      headB.getMatrixAt(0, mB);
      for (let channel = 0; channel < 16; channel += 1) {
        expect(mA.elements[channel], `seated matrix channel ${channel} at ${tLabel}`).toBeCloseTo(
          mB.elements[channel]!,
          9,
        );
      }
    };
    const headBodyOffset = (): [number, number] => {
      bodyA.getMatrixAt(0, mA);
      headA.getMatrixAt(0, mB);
      return [
        Math.hypot(mB.elements[12]! - mA.elements[12]!, mB.elements[14]! - mA.elements[14]!),
        mB.elements[13]!,
      ];
    };

    // 0.25 s: mid-fall. The head is part-way over, still well above the ground.
    for (let frame = 0; frame < 15; frame += 1) {
      a.update(1 / 60, 'green');
      b.update(1 / 60, 'green');
    }
    let [offset, headY] = headBodyOffset();
    expect(offset).toBeGreaterThan(0.3);
    expect(offset).toBeLessThan(1.0);
    expect(headY).toBeGreaterThan(baseY + 0.4);
    expectSamePose('0.25 s');

    // 2 s and 4 s: lying flat. The head rests a body-length from the body, at ground level.
    let elapsedFrames = 15;
    for (const target of [120, 240]) {
      for (let frame = elapsedFrames; frame < target; frame += 1) {
        a.update(1 / 60, 'green');
        b.update(1 / 60, 'green');
      }
      elapsedFrames = target;
      [offset, headY] = headBodyOffset();
      expect(offset).toBeGreaterThan(1.02);
      expect(offset).toBeLessThan(1.14);
      expect(headY).toBeGreaterThan(baseY - 0.05);
      expect(headY).toBeLessThan(baseY + 0.15);
      expectSamePose(`${target / 60} s`);
    }

    // 5.5 s: the fall (0.55 s) + lie (<= 4.5 s) + get-up (0.45 s) is over: seated again, head
    // back over the body.
    for (let frame = 0; frame < 90; frame += 1) {
      a.update(1 / 60, 'green');
      b.update(1 / 60, 'green');
    }
    [offset, headY] = headBodyOffset();
    expect(offset).toBeLessThan(0.15);
    // The head is back over the body, not lying on the ground.
    expect(headY).toBeGreaterThan(baseY + 0.9);
    bodyA.getMatrixAt(0, mA);
    expect(mA.elements[13]).toBeGreaterThan(-0.5);
    expect(mA.elements[13]).toBeLessThan(-0.4);
    expectSamePose('5.5 s');
    a.dispose();
    b.dispose();
  });

  it('treats cart vendors as solid: the car absorbs to the cart stop speed and the cart never moves', () => {
    const activity = new UrbanStreetActivity('A');
    activity.update(1 / 60, 'green');
    const cart = streetLifeMesh(activity, 'aohara-cart-vendor-carts');
    const [cx, cy, cz] = meshPosition(cart, 0);
    const probe: TownCarProbe = {
      x: cx - 1.93, // 1.18 + 0.85 cart radius - 0.1 overlap
      z: cz,
      yaw: -Math.PI / 2,
      velocityX: 8,
      velocityZ: 0,
    };
    const hits = activity.collideActors(probe);
    // The cart is the only street actor with the 4 m/s absorb cap.
    const cartHits = hits.filter(
      (hit) => hit.element === 'street-actor' && hit.absorbedSpeed === 4,
    );
    expect(cartHits.length).toBeGreaterThanOrEqual(1);
    for (const hit of cartHits) {
      expect(hit.impactSpeed).toBeGreaterThan(0);
    }
    // The cart is furniture: the hit does not move it (vendors stay planted).
    for (let frame = 0; frame < 180; frame += 1) {
      activity.update(1 / 60, 'green');
      const [x, y, z] = meshPosition(cart, 0);
      expect(x).toBeCloseTo(cx, 9);
      expect(y).toBeCloseTo(cy, 9);
      expect(z).toBeCloseTo(cz, 9);
    }
    activity.dispose();
  });

  it("scatters the juggler's cones when knocked down and gathers them back after the get-up", () => {
    const activity = new UrbanStreetActivity('A');
    const jugglers = streetLifeMesh(activity, 'aohara-egg-juggler-bodies');
    const cones = streetLifeMesh(activity, 'aohara-egg-juggler-cones');
    activity.update(1 / 60, 'green');
    const [jx, , jz] = meshPosition(jugglers, 0);
    const baseY = -0.46 + 0.035;
    const probe: TownCarProbe = {
      x: jx - 1.53,
      z: jz,
      yaw: -Math.PI / 2,
      velocityX: 8,
      velocityZ: 0,
    };
    const hits = activity.collideActors(probe);
    expect(hits.some((hit) => hit.element === 'street-actor' && hit.absorbedSpeed === 2.2)).toBe(
      true,
    );

    // 0.3 s after the hit: all three cones rest at their deterministic scatter spots.
    for (let frame = 0; frame < 18; frame += 1) {
      activity.update(1 / 60, 'green');
    }
    for (let cone = 0; cone < 3; cone += 1) {
      const [x, y, z] = meshPosition(cones, cone);
      const distance = Math.hypot(x - jx, z - jz);
      expect(distance).toBeGreaterThanOrEqual(0.55);
      expect(distance).toBeLessThan(1.06);
      expect(y).toBeCloseTo(baseY + 0.05, 5);
    }
    // By 7.2 s the scatter window (0.58 + 1.2 + 5 s) has closed and the cones orbit again.
    for (let frame = 18; frame < Math.round(60 * 7.2); frame += 1) {
      activity.update(1 / 60, 'green');
    }
    for (let cone = 0; cone < 3; cone += 1) {
      const [x, y, z] = meshPosition(cones, cone);
      expect(Math.hypot(x - jx, z - jz)).toBeLessThanOrEqual(0.4);
      expect(y).toBeGreaterThanOrEqual(baseY + 0.1);
      expect(y).toBeLessThanOrEqual(baseY + 1.15);
    }
    activity.dispose();
  });
});
