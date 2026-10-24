import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';

import { RENDER_CONFIG } from '../../src/config/render';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { URBAN_ACTIVITY_TIER_BUDGET } from '../../src/config/urban-city';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { WORLD_CONFIG } from '../../src/config/world';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import {
  loadRapier,
  type RapierModule,
  type RapierRigidBody,
} from '../../src/physics/RapierModule';
import { createDrivingWorld } from '../../src/world/DrivingWorld';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';

let rapier: RapierModule;

beforeAll(async () => {
  rapier = await loadRapier();
});

describe('physics-backed Aohara traffic', () => {
  it('creates shared-world dynamic traffic bodies and animates a player-to-traffic impact', () => {
    const terrainSampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const physics = new PhysicsWorld({
      rapier,
      worldConfig: {
        ...WORLD_CONFIG,
        obstacles: [],
        ground: { ...WORLD_CONFIG.ground, size: 2_000 },
      },
      gravity: { x: 0, y: 0, z: 0 },
    });
    physics.enableTerrain(terrainSampler);
    const content = createDrivingWorld({
      config: RENDER_CONFIG,
      worldConfig: WORLD_CONFIG,
      terrainSampler,
      physics,
      qualityTier: 'C',
    });
    const activityRoot = content.root.getObjectByName('aohara-urban-street-activity');

    expect(content.getContentStats?.()).toMatchObject({
      urbanTrafficPhysicsBodies: URBAN_ACTIVITY_TIER_BUDGET.C.trafficVehicles,
      urbanTrafficImpactFeedbacks: 0,
      urbanTrafficRouteRejoins: 0,
    });
    expect(activityRoot).not.toBeUndefined();
    if (activityRoot === undefined) {
      throw new Error('the integrated Aohara activity should be mounted in the driving world');
    }

    const trafficBodies: RapierRigidBody[] = [];
    physics.world.bodies.forEach((body) => {
      const userData = body.userData as { kind?: string } | undefined;
      if (userData?.kind === 'aohara-traffic') {
        trafficBodies.push(body);
      }
    });
    expect(trafficBodies).toHaveLength(URBAN_ACTIVITY_TIER_BUDGET.C.trafficVehicles);

    // Let the route motor build speed, then place a player-sized collider in one traffic car's path.
    for (let step = 0; step < 12; step += 1) {
      physics.update(1 / 60);
    }
    const trafficBody = trafficBodies[0]!;
    const beforeOriginSlide = trafficBody.translation();
    const trafficWorldPosition = {
      x: beforeOriginSlide.x + physics.originOffset.x,
      z: beforeOriginSlide.z + physics.originOffset.z,
    };
    physics.setOriginOffset(32, 64);
    const afterOriginSlide = trafficBody.translation();
    expect(afterOriginSlide.x + physics.originOffset.x).toBeCloseTo(trafficWorldPosition.x);
    expect(afterOriginSlide.z + physics.originOffset.z).toBeCloseTo(trafficWorldPosition.z);

    const playerBody = physics.createDynamicBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(afterOriginSlide.x, afterOriginSlide.y, afterOriginSlide.z)
        .setGravityScale(0)
        .setUserData({ kind: 'test-player' }),
    );
    physics.attachCollider(
      rapier.ColliderDesc.cuboid(0.8, 0.8, 0.8).setActiveEvents(
        rapier.ActiveEvents.COLLISION_EVENTS,
      ),
      playerBody,
    );
    physics.update(1 / 60);
    content.update?.(1 / 60);

    expect(content.getContentStats?.().urbanTrafficImpactFeedbacks).toBeGreaterThan(0);

    const metadata = trafficBody.userData as { instanceIndex: number; type: string };
    const mesh = activityRoot.getObjectByName(
      `aohara-traffic-${metadata.type}-instances`,
    ) as InstancedMesh | null;
    expect(mesh).toBeInstanceOf(InstancedMesh);
    if (!(mesh instanceof InstancedMesh)) {
      throw new Error('colliding traffic must retain its visible instanced model');
    }
    const matrix = new Matrix4();
    mesh.getMatrixAt(metadata.instanceIndex, matrix);
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    matrix.decompose(position, rotation, scale);
    const euler = new Euler().setFromQuaternion(rotation);
    expect(Math.abs(euler.x) + Math.abs(euler.z)).toBeGreaterThan(0);

    for (let step = 0; step < 120; step += 1) {
      physics.update(1 / 60);
      content.update?.(1 / 60);
    }
    expect(content.getContentStats?.().urbanTrafficRouteRejoins).toBeGreaterThan(0);

    content.dispose();
    expect(physics.statistics.bodies).toBe(1); // the player remains; traffic bodies were removed.
    physics.removeBody(playerBody);
    expect(physics.statistics.bodies).toBe(0); // the terrain-enabled world has no placeholder slab.
    physics.dispose();
  });
});
