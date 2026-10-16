import { describe, expect, it } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { TreeCollisionField } from '../../src/world/tree-collision';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import {
  generateChunkVegetation,
  type VegetationPlacement,
} from '../../src/world/vegetation-placement';

/**
 * Destructive vegetation, physics side: the same placements the renderer draws
 * are collided analytically. Severity ladder pinned — brush bends, repeated or
 * solid hits snap, one fast hit shatters, rock never breaks — and the response
 * impulse removes exactly the configured velocity from the car.
 */

const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);

function findPlacement(species: string): VegetationPlacement {
  const chunk = generateChunkVegetation(sampler, -4, -8);
  const found = chunk.find((p) => p.species === species);
  if (found === undefined) throw new Error(`no ${species} in cedar chunk`);
  return found;
}

/** Car state driving north (-Z) at `speed`, `gap` metres south of the tree. */
function carAt(placement: VegetationPlacement, speed: number, gap = 2.2) {
  return {
    x: placement.x,
    z: placement.z + gap,
    yaw: 0,
    velocityX: 0,
    velocityZ: -speed,
  };
}

function fakeBody(speedZ: number) {
  const state = {
    vx: 0,
    vz: speedZ,
    impulses: [] as { x: number; z: number }[],
    torques: [] as { y: number }[],
  };
  return {
    state,
    mass: () => 1200,
    linvel: () => ({ x: state.vx, y: 0, z: state.vz }),
    applyImpulse: (impulse: { x: number; y: number; z: number }) => {
      state.impulses.push({ x: impulse.x, z: impulse.z });
      state.vx += impulse.x / 1200;
      state.vz += impulse.z / 1200;
    },
    applyTorqueImpulse: (impulse: { x: number; y: number; z: number }) => {
      state.torques.push({ y: impulse.y });
    },
  };
}

describe('tree collision field', () => {
  it('bends a conifer on a brush and leans it away from the car', () => {
    const field = new TreeCollisionField(sampler);
    const tree = findPlacement('conifer');
    field.sync(tree.x, tree.z);
    const hits = field.evaluate(carAt(tree, 2), 1 / 60);
    const hit = hits.find((h) => h.key === tree.key);
    expect(hit?.impact).toBe(true);
    expect(hit?.outcome).toBe('bend');
    expect(field.getVisualState(tree.key)?.condition).toBe('bent');
    expect(field.getVisualState(tree.key)?.leanAngleRad).toBeGreaterThan(0.1);
    expect(field.stats.bent).toBe(1);
  });

  it('snaps after accumulated damage and shatters on one fast hit', () => {
    const tree = findPlacement('conifer');
    const field = new TreeCollisionField(sampler);
    field.sync(tree.x, tree.z);
    // 8 m/s costs 80 of 100 hit points per hit: first bends hard, second snaps.
    expect(field.evaluate(carAt(tree, 8), 0.5).find((h) => h.key === tree.key)?.outcome).toBe(
      'bend',
    );
    expect(field.evaluate(carAt(tree, 8), 0.5).find((h) => h.key === tree.key)?.outcome).toBe(
      'snap',
    );
    expect(field.stats.snapped).toBe(1);
    // A snapped tree no longer collides.
    expect(field.evaluate(carAt(tree, 8), 0.5).find((h) => h.key === tree.key)).toBeUndefined();

    const fast = new TreeCollisionField(sampler);
    fast.sync(tree.x, tree.z);
    const hit = fast.evaluate(carAt(tree, 16), 1 / 60).find((h) => h.key === tree.key);
    expect(hit?.outcome).toBe('shatter');
    expect(fast.stats.shattered).toBe(1);
  });

  it('exchanges momentum with the car, and rocks stop it dead', () => {
    const tree = findPlacement('conifer');
    const field = new TreeCollisionField(sampler);
    field.sync(tree.x, tree.z);
    const hit = field.evaluate(carAt(tree, 10), 1 / 60).find((h) => h.key === tree.key)!;
    expect(hit.outcome).toBe('snap');
    const body = fakeBody(-10);
    const applied = field.respond(body as never, hit);
    // Conifer snap takes 74% of the closing speed: 36 km/h in, ~9 km/h out.
    expect(body.state.vz).toBeCloseTo(-2.6, 5);
    // Equal and opposite: the impulse on the car is exactly the reaction
    // impulse recorded for the tree, pointed back along the contact normal.
    expect(hit.reactionImpulseNs).toBeCloseTo(1200 * hit.absorbedSpeed, 5);
    expect(applied).toBeCloseTo(hit.reactionImpulseNs, 5);
    const impulse = body.state.impulses[0]!;
    expect(Math.hypot(impulse.x, impulse.z)).toBeCloseTo(hit.reactionImpulseNs, 5);
    expect(impulse.z).toBeGreaterThan(0); // car drove -Z; the tree pushed +Z
    expect(hit.reactionSpeed).toBeGreaterThan(1.5);

    // One fast hit shatters — and still takes 58% of the speed out first.
    const fastField = new TreeCollisionField(sampler);
    fastField.sync(tree.x, tree.z);
    const fastHit = fastField.evaluate(carAt(tree, 16), 1 / 60).find((h) => h.key === tree.key)!;
    expect(fastHit.outcome).toBe('shatter');
    const fastBody = fakeBody(-16);
    fastField.respond(fastBody as never, fastHit);
    expect(fastBody.state.vz).toBeCloseTo(-6.72, 5);

    // Rock: solid, undamaged, full stop.
    const rockChunk = generateChunkVegetation(sampler, -12, -17);
    const rock = rockChunk.find((p) => p.species === 'rock');
    expect(rock).toBeDefined();
    const rockField = new TreeCollisionField(sampler);
    rockField.sync(rock!.x, rock!.z);
    const rockHit = rockField.evaluate(carAt(rock!, 9), 1 / 60).find((h) => h.key === rock!.key)!;
    expect(rockHit.solid).toBe(true);
    expect(rockHit.impact).toBe(false);
    const rockBody = fakeBody(-9);
    rockField.respond(rockBody as never, rockHit);
    expect(rockBody.state.vz).toBeGreaterThanOrEqual(0);
    expect(rockField.stats).toEqual({ bent: 0, snapped: 0, shattered: 0 });
  });

  it('keeps resisting as a rooted obstacle between damage hits', () => {
    const tree = findPlacement('conifer');
    const field = new TreeCollisionField(sampler);
    field.sync(tree.x, tree.z);
    // First touch bends the tree; it stays rooted, not a hole to push through.
    const first = field.evaluate(carAt(tree, 2), 1 / 60).find((h) => h.key === tree.key)!;
    expect(first.outcome).toBe('bend');
    const bendBody = fakeBody(-2);
    field.respond(bendBody as never, first);
    // Rooted and unbroken: the car loses its closing speed and rebounds dull.
    expect(bendBody.state.vz).toBeCloseTo(0.16, 5);

    // Inside the damage cooldown the contact is not an impact event, but it
    // still removes the whole closing speed and pushes the overlap apart.
    const pushing = field.evaluate(carAt(tree, 2), 1 / 60).find((h) => h.key === tree.key)!;
    expect(pushing.impact).toBe(false);
    expect(pushing.rooted).toBe(true);
    expect(pushing.absorbedSpeed).toBeCloseTo(2, 5);
    const pushBody = fakeBody(-2);
    field.respond(pushBody as never, pushing);
    expect(pushBody.state.vz).toBeGreaterThan(0.3);
    expect(field.stats.bent).toBe(1);
  });

  it('kicks the car in yaw on an off-centre hit, from the same impulse', () => {
    const tree = findPlacement('conifer');
    const field = new TreeCollisionField(sampler);
    field.sync(tree.x, tree.z);
    const car = carAt(tree, 10);
    car.x += 0.55; // trunk meets the front corner, not the centreline
    const hit = field.evaluate(car, 1 / 60).find((h) => h.key === tree.key)!;
    expect(Math.abs(hit.yawLeverArmMeters)).toBeGreaterThan(0.3);
    const body = fakeBody(-10);
    field.respond(body as never, hit);
    expect(body.state.torques).toHaveLength(1);
    expect(Math.abs(body.state.torques[0]!.y)).toBeGreaterThan(100);
  });

  it('ignores trees the car is not touching', () => {
    const field = new TreeCollisionField(sampler);
    const tree = findPlacement('conifer');
    field.sync(tree.x, tree.z);
    const car = carAt(tree, 10);
    car.x += 6; // six metres east of the trunk: clean miss
    expect(field.evaluate(car, 1 / 60)).toEqual([]);
  });
});
