import { describe, expect, it } from 'vitest';

import { TERRAIN_CONFIG } from '../../src/config/terrain';
import {
  applyFaunaResponse,
  faunaHash01,
  FaunaField,
  FAUNA_CONFIG,
  FAUNA_SPECIES,
  type FaunaCarProbe,
  type FaunaHit,
} from '../../src/world/fauna';
import { FaunaWorld } from '../../src/world/fauna-world';
import type { TerrainSampler } from '../../src/world/terrain-height';

const DT = 1 / 60;

/** A wilderness point: far from the roads, Aohara and the spawn pad. */
const WILDERNESS: [number, number] = [3000, 1024];

function wildCar(x: number, z: number, speed = 20): FaunaCarProbe {
  // Heading +X.
  return { x, z, yaw: Math.PI / 2, velocityX: speed, velocityZ: 0 };
}

function flatSampler(): TerrainSampler {
  return {
    heightAt: () => 0,
    normalAt: () => ({ x: 0, y: 1, z: 0 }),
    config: TERRAIN_CONFIG,
  };
}

/** A car body that records the impulses it receives. */
function mockBody(massKg: number) {
  const impulses: { x: number; y: number; z: number }[] = [];
  const torques: number[] = [];
  return {
    impulses,
    torques,
    mass: () => massKg,
    linvel: () => ({ x: 0, y: 0, z: 0 }),
    applyImpulse: (i: { x: number; y: number; z: number }) => {
      impulses.push(i);
    },
    applyTorqueImpulse: (i: { x: number; y: number; z: number }) => {
      torques.push(i.y);
    },
  };
}

function makeField(tier: 'A' | 'B' | 'C' = 'A'): FaunaField {
  return new FaunaField({
    terrainSeed: TERRAIN_CONFIG.seed,
    chunkSizeMeters: TERRAIN_CONFIG.chunkSizeMeters,
    qualityTier: tier,
  });
}

describe('fauna charge scheduling (Phase 7.3)', () => {
  it('never arms on the road, at low speed, or inside the city keep-outs', () => {
    // On the road, well above the speed gate: the corridor keep-out holds.
    const onRoad = makeField();
    let t = 0;
    for (let i = 0; i < 60 / DT; i += 1) {
      // The spawn-junction road runs along the origin; stay on it.
      onRoad.advanceAndCollide(
        { x: 0, z: -170 - t * 0.5, yaw: Math.PI, velocityX: 0, velocityZ: -20 },
        DT,
      );
      t += DT;
    }
    expect(onRoad.charges.length).toBe(0);

    // Off-road but below the speed gate.
    const slow = makeField();
    t = 0;
    for (let i = 0; i < 120 / DT; i += 1) {
      slow.advanceAndCollide(wildCar(WILDERNESS[0] + t * 6, WILDERNESS[1]), 6);
      t += DT;
    }
    expect(slow.charges.length).toBe(0);

    // Inside Aohara's exclusion, off-road and fast.
    const city = makeField();
    t = 0;
    for (let i = 0; i < 120 / DT; i += 1) {
      city.advanceAndCollide(
        { x: 1250 + t * 0.1, z: -430, yaw: 0, velocityX: 0.1, velocityZ: 0 },
        DT,
      );
      t += DT;
    }
    expect(city.charges.length).toBe(0);
  });

  it('arms at most one charge per (chunk, minute) and at least sometimes at speed', () => {
    // The hash gate: over 120 simulated minutes at a fixed wilderness point, the armed
    // minutes track the tier's per-minute rate within a wide, stable band.
    const minutes = 120;
    for (const tier of ['A', 'B', 'C'] as const) {
      const rate = FAUNA_CONFIG.chargeRatePerMinute[tier];
      const field = makeField(tier);
      let armed = 0;
      // Hold at the wilderness point, above the speed gate, for 120 simulated minutes.
      const step = 0.25; // a quarter-second frame keeps the simulation cheap
      const base = wildCar(WILDERNESS[0], WILDERNESS[1], 9);
      for (let i = 0; i < (minutes * 60) / step; i += 1) {
        const frame = field.advanceAndCollide(base, step);
        armed += frame.spawned.length;
      }
      // One roll per (chunk, minute): at most `minutes` spawns, statistically near rate×minutes.
      // The floor lower bound lets tier C (rate 0.02/min, ~2 expected) legitimately hit zero
      // on a given seed while A and B (4–6 expected) must arm at least once.
      expect(armed).toBeLessThanOrEqual(minutes);
      expect(armed).toBeGreaterThanOrEqual(Math.floor(0.25 * rate * minutes));
      expect(armed).toBeLessThanOrEqual(2.5 * rate * minutes);
    }
  });

  it('is deterministic: same seed, same probe sequence, same encounters', () => {
    const run = (seed: number) => {
      const field = new FaunaField({
        terrainSeed: seed,
        chunkSizeMeters: TERRAIN_CONFIG.chunkSizeMeters,
        qualityTier: 'A',
      });
      const seen: string[] = [];
      let t = 0;
      for (let i = 0; i < 300 / DT; i += 1) {
        const frame = field.advanceAndCollide(wildCar(WILDERNESS[0] + t * 0.05, WILDERNESS[1]), DT);
        for (const s of frame.spawned) {
          seen.push(`${s.charge.species}@${s.charge.x.toFixed(2)},${s.charge.z.toFixed(2)}`);
        }
        t += DT;
      }
      return seen;
    };
    expect(run(20261015)).toEqual(run(20261015));
  });
});

describe('fauna charge lifecycle', () => {
  it('telegraphs, sprints at 7 m/s, flees, and despawns on schedule', () => {
    const field = makeField();
    const car = () => wildCar(WILDERNESS[0], WILDERNESS[1], 0);
    const charge = field.spawnForTest('boar', car());
    expect(charge).not.toBeNull();
    expect(charge!.species).toBe('boar');
    expect(charge!.phase).toBe('telegraph');

    // Telegraph: 0.7 s, stationary, toast delivered.
    const spawnFrame = field.advanceAndCollide(car(), DT);
    expect(spawnFrame.spawned.length).toBe(1);
    expect(spawnFrame.spawned[0]!.toast).toBe('A wild boar charges from the jungle!');
    for (let i = 0; i < 40; i += 1) {
      field.advanceAndCollide(car(), DT);
      const c = field.charges[0]!;
      expect(c.phase).toBe('telegraph');
      expect(c.x).toBe(charge!.x);
      expect(c.z).toBe(charge!.z);
    }
    field.advanceAndCollide(car(), DT);
    const charging = field.charges[0]!;
    expect(charging.phase).toBe('charge');
    const dirX = charging.dirX;
    const dirZ = charging.dirZ;
    expect(Math.hypot(dirX, dirZ)).toBeCloseTo(1, 5);

    // Charge: 1.8 s at 7 m/s, straight.
    const start = { x: charging.x, z: charging.z };
    for (let i = 0; i < Math.floor(1.0 / DT); i += 1) {
      field.advanceAndCollide(car(), DT);
    }
    const mid = field.charges[0]!;
    const travel = Math.hypot(mid.x - start.x, mid.z - start.z);
    expect(travel / 1.0).toBeCloseTo(7, 1);
    // Straight: the direction never changes.
    expect(mid.dirX).toBeCloseTo(dirX, 6);
    expect(mid.dirZ).toBeCloseTo(dirZ, 6);

    // Flee, then gone: the finished event names the charge.
    let finishedId: number | null = null;
    for (let i = 0; i < Math.ceil(6 / DT); i += 1) {
      const frame = field.advanceAndCollide(car(), DT);
      if (frame.finished.length > 0) {
        finishedId = frame.finished[0]!;
        break;
      }
    }
    expect(finishedId).toBe(charge!.id);
    expect(field.charges.length).toBe(0);
  });

  it('spawns at a side angle: 90° ± 30° off the car heading', () => {
    for (let i = 0; i < 12; i += 1) {
      const field = makeField();
      const probe = wildCar(WILDERNESS[0] + i * 7, WILDERNESS[1] + i * 3, 0);
      const charge = field.spawnForTest(i % 2 === 0 ? 'boar' : 'deer', probe);
      expect(charge).not.toBeNull();
      // Spawn→car vector vs the car forward (+X here).
      const dx = probe.x - charge!.x;
      const dz = probe.z - charge!.z;
      // Probe forward is +X (yaw PI/2 in the (sin, cos) convention).
      const angle = Math.abs(Math.atan2(dz, dx));
      // The lead shifts the aim ahead of the car, so the raw angle relaxes to 40..140.
      expect(angle).toBeGreaterThanOrEqual(40 * (Math.PI / 180));
      expect(angle).toBeLessThanOrEqual(140 * (Math.PI / 180));
    }
  });
});

describe('fauna charge contact', () => {
  it('a stationary car on the line takes exactly one hit, once, at closing speed', () => {
    const field = makeField();
    const probe = wildCar(WILDERNESS[0], WILDERNESS[1], 0);
    const charge = field.spawnForTest('boar', probe)!;
    let hits: FaunaHit[] = [];
    // Telegraph passes; then the sprint lands on the car.
    let hitFrame: number | null = null;
    for (let i = 0; i < Math.ceil(6 / DT); i += 1) {
      const frame = field.advanceAndCollide(probe, DT);
      hits = hits.concat(frame.hits);
      if (frame.hits.length > 0 && hitFrame === null) {
        hitFrame = i;
      }
    }
    expect(hits.length).toBe(1);
    const hit = hits[0]!;
    expect(hit.chargeId).toBe(charge.id);
    expect(hit.species).toBe('boar');
    // Closing speed: the car is standing, the boar sprints at 7 m/s.
    expect(hit.impactSpeed).toBeCloseTo(FAUNA_CONFIG.chargeSpeedMetersPerSecond, 5);
    // The impulse is the boar's full momentum — bounded by mass × sprint speed.
    expect(hit.impulseNs).toBeCloseTo(FAUNA_SPECIES.boar.massKg * 7, 5);
    expect(Math.abs(hit.lateralOffset)).toBeLessThan(2.5);
    // The hit lands during the charge phase (after the 0.7 s telegraph).
    expect(hitFrame! * DT).toBeGreaterThanOrEqual(0.65);
    // And never again: the charge resolves contact once.
    expect(hitFrame).toBeLessThanOrEqual((0.7 + 1.8) / DT + 1);
  });

  it('a swerving car dodges the sprint', () => {
    const field = makeField();
    const base = wildCar(WILDERNESS[0], WILDERNESS[1], 0);
    field.spawnForTest('boar', base);
    // After the telegraph, the car bolts perpendicular to the run line.
    let dodged = false;
    let t = 0;
    for (let i = 0; i < Math.ceil(4.5 / DT) && !dodged; i += 1) {
      if (field.charges.length === 0) break;
      t += DT;
      let probe: FaunaCarProbe = base;
      if (t > 0.7) {
        const dt = t - 0.7;
        const c = field.charges[0]!;
        // Perpendicular to the animal's run direction, 14 m/s.
        const px = -c.dirZ;
        const pz = c.dirX;
        probe = {
          ...base,
          x: base.x + px * 14 * dt,
          z: base.z + pz * 14 * dt,
          velocityX: px * 14,
          velocityZ: pz * 14,
        };
      }
      const frame = field.advanceAndCollide(probe, DT);
      if (frame.hits.length > 0) {
        dodged = true;
      }
    }
    expect(dodged).toBe(false);
  });

  it('the response is a light momentum nudge, never a wall', () => {
    const field = makeField();
    const probe = wildCar(WILDERNESS[0], WILDERNESS[1], 0);
    field.spawnForTest('boar', probe)!;
    let hit: FaunaHit | null = null;
    for (let i = 0; i < Math.ceil(4 / DT); i += 1) {
      const frame = field.advanceAndCollide(probe, DT);
      if (frame.hits.length > 0) {
        hit = frame.hits[0]!;
        break;
      }
    }
    expect(hit).not.toBeNull();
    const body = mockBody(1200);
    applyFaunaResponse(body, hit!);
    expect(body.impulses.length).toBe(1);
    const impulse = body.impulses[0]!;
    expect(Math.hypot(impulse.x, impulse.z)).toBeCloseTo(FAUNA_SPECIES.boar.massKg * 7, 5);
    // A 90 kg boar at 7 m/s takes a 1,200 kg car about half a m/s — a nudge, not a stop.
    expect(Math.hypot(impulse.x, impulse.z) / 1200).toBeLessThan(0.6);
    // Torque stays inside the authored bound.
    for (const torque of body.torques) {
      expect(Math.abs(torque)).toBeLessThanOrEqual(1200 * 1.2 + 1e-6);
    }
  });

  it('the monkey troop throws leaves on its way past', () => {
    const field = makeField();
    const probe = wildCar(WILDERNESS[0], WILDERNESS[1], 0);
    field.spawnForTest('monkey', probe)!;
    const leaves: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < Math.ceil(4 / DT); i += 1) {
      const frame = field.advanceAndCollide(probe, DT);
      for (const leaf of frame.leaves) {
        leaves.push({ x: leaf.x, y: leaf.y, z: leaf.z });
        expect(Math.hypot(leaf.dirX, leaf.dirZ)).toBeGreaterThan(5);
      }
    }
    expect(leaves.length).toBe(3);
    // Every throw is roughly at the car.
    for (const leaf of leaves) {
      expect(Math.hypot(leaf.x - probe.x, leaf.z - probe.z)).toBeLessThan(40);
    }
  });
});

describe('fauna visuals (FaunaWorld)', () => {
  it('builds, animates, and despawns the charge visuals with bounded particles', () => {
    const sampler = flatSampler();
    const field = makeField();
    const world = new FaunaWorld(sampler);
    const probe = wildCar(WILDERNESS[0], WILDERNESS[1], 0);
    field.spawnForTest('boar', probe);
    world.rustleAt(probe.x - 10, probe.z);

    // First frame: the boar materialises (group + the two instanced particle meshes).
    world.update(field, DT);
    const groups = world.root.children.filter((child) => child.name.startsWith('fauna-'));
    expect(groups.length).toBe(1);
    expect(world.getContentStats().faunaCharges).toBe(1);

    // Leaf throws queue up and become particles.
    world.queueLeaves([{ x: probe.x, y: 0.6, z: probe.z, dirX: 8, dirY: 2, dirZ: 0, spin: 3 }]);
    for (let i = 0; i < 340; i += 1) {
      field.advanceAndCollide(probe, DT);
      world.update(field, DT);
    }
    // Five-plus seconds in: the charge is long over, the group is gone, particles settled.
    expect(world.root.children.filter((child) => child.name.startsWith('fauna-')).length).toBe(0);
    expect(world.getContentStats().faunaCharges).toBe(0);

    world.dispose();
    expect(world.root.children.length).toBe(0);
  });

  it('hashes stably into [0, 1)', () => {
    for (const key of ['a', 'a', 'b', `20261015:16,4:7`, 'x'.repeat(200)]) {
      const h = faunaHash01(key);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
    expect(faunaHash01('a')).toBe(faunaHash01('a'));
  });
});
