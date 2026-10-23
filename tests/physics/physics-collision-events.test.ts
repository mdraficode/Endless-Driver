import { beforeAll, describe, expect, it } from 'vitest';

import { WORLD_CONFIG } from '../../src/config/world';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { loadRapier, type RapierModule } from '../../src/physics/RapierModule';

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

describe('physics contact events and origin-aware bodies', () => {
  it('dispatches Rapier contact begin and end events with their rigid bodies', () => {
    const physics = new PhysicsWorld({
      rapier,
      worldConfig: {
        ...WORLD_CONFIG,
        obstacles: [],
        ground: { ...WORLD_CONFIG.ground, size: 200 },
      },
      gravity: { x: 0, y: 0, z: 0 },
    });
    const events: { started: boolean; handles: readonly number[] }[] = [];
    const unsubscribe = physics.addCollisionHandler(
      ({ colliderA, colliderB, bodyA, bodyB, started }) => {
        events.push({
          started,
          handles: [bodyA?.handle ?? -1, bodyB?.handle ?? -1],
        });
        expect([colliderA.handle, colliderB.handle]).toHaveLength(2);
      },
    );

    const moving = physics.createDynamicBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(-2, 4, 0)
        .setLinvel(12, 0, 0)
        .setGravityScale(0),
    );
    const fixed = physics.world.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(0, 4, 0),
    );
    const eventsEnabled = rapier.ActiveEvents.COLLISION_EVENTS;
    physics.attachCollider(
      rapier.ColliderDesc.cuboid(0.55, 0.55, 0.55).setActiveEvents(eventsEnabled),
      moving,
    );
    physics.world.createCollider(
      rapier.ColliderDesc.cuboid(0.55, 0.55, 0.55).setActiveEvents(eventsEnabled),
      fixed,
    );

    for (let step = 0; step < 30; step += 1) {
      physics.update(1 / 60);
    }
    moving.setTranslation({ x: -4, y: 4, z: 0 }, true);
    physics.update(1 / 60);

    expect(events.some((event) => event.started)).toBe(true);
    expect(events.some((event) => !event.started)).toBe(true);
    expect(events.every((event) => event.handles.includes(moving.handle))).toBe(true);
    unsubscribe();
    physics.dispose();
  });

  it('moves registered dynamic bodies by the floating-origin delta without changing world position', () => {
    const physics = new PhysicsWorld({
      rapier,
      worldConfig: { ...WORLD_CONFIG, obstacles: [] },
      gravity: { x: 0, y: 0, z: 0 },
    });
    const body = physics.createDynamicBody(
      rapier.RigidBodyDesc.dynamic().setTranslation(100, 3, 220).setGravityScale(0),
    );
    physics.registerOriginAwareBody(body);

    physics.setOriginOffset(64, 128);
    expect(body.translation()).toMatchObject({ x: 36, y: 3, z: 92 });
    physics.setOriginOffset(96, 160);
    expect(body.translation()).toMatchObject({ x: 4, y: 3, z: 60 });
    expect(physics.originOffset).toEqual({ x: 96, z: 160 });

    physics.dispose();
  });
});
