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
  const state = { vx: 0, vz: speedZ, impulses: [] as { x: number; z: number }[] };
  return {
    state,
    mass: () => 1200,
    linvel: () => ({ x: state.vx, y: 0, z: state.vz }),
    applyImpulse: (impulse: { x: number; y: number; z: number }) => {
      state.impulses.push({ x: impulse.x, z: impulse.z });
      state.vx += impulse.x / 1200;
      state.vz += impulse.z / 1200;
    },
    applyTorqueImpulse: () => undefined,
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

  it('removes the configured velocity from the car, and rocks stop it dead', () => {
    const tree = findPlacement('conifer');
    const field = new TreeCollisionField(sampler);
    field.sync(tree.x, tree.z);
    const hit = field.evaluate(carAt(tree, 10), 1 / 60).find((h) => h.key === tree.key)!;
    const body = fakeBody(-10);
    field.respond(body as never, hit);
    // Conifer stopSpeed 5.5: the car keeps 4.5 m/s and breaks through.
    expect(body.state.vz).toBeCloseTo(-4.5, 5);

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

  it('ignores trees the car is not touching', () => {
    const field = new TreeCollisionField(sampler);
    const tree = findPlacement('conifer');
    field.sync(tree.x, tree.z);
    const car = carAt(tree, 10);
    car.x += 6; // six metres east of the trunk: clean miss
    expect(field.evaluate(car, 1 / 60)).toEqual([]);
  });
});
