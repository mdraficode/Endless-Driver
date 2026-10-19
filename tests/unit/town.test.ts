import { InstancedMesh } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { generateRoadPoles, generateTownBuildings, TownWorld } from '../../src/world/town';

/**
 * Yūhi Town as a pure function of the map: buildings fill the district's plots
 * without swallowing roads or trees, poles march the whole network, and the
 * collision contract matches the trees' (buildings solid, poles fold).
 */

const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
const network = sampler.roadNetwork!;

describe('town placement', () => {
  it('builds a deterministic town inside the district, clear of roads', () => {
    const a = generateTownBuildings(sampler, network);
    const b = generateTownBuildings(sampler, network);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(25);
    expect(a.length).toBeLessThan(220);
    for (const building of a) {
      expect(Math.hypot(building.x - 540, building.z - 300)).toBeLessThan(340 * 0.85);
      const road = sampler.roadAt!(building.x, building.z);
      if (road !== null) {
        expect(road.distance).toBeGreaterThanOrEqual(12);
      }
    }
    // No two plots overlap: grid pitch keeps neighbours apart.
    for (let i = 0; i < a.length; i += 1) {
      for (let j = i + 1; j < a.length; j += 1) {
        expect(Math.hypot(a[i]!.x - a[j]!.x, a[i]!.z - a[j]!.z)).toBeGreaterThan(10);
      }
    }
  });

  it('details every rural archetype with reflective glazing and TSL PBR surfaces', () => {
    const world = new TownWorld(sampler);
    const stats = world.getContentStats();
    expect(stats.townFacadeWindows).toBeGreaterThan(world.buildings.length);
    for (let archetype = 0; archetype < 3; archetype += 1) {
      const glazing = world.root.getObjectByName(`town-glazing-${archetype}`);
      const walls = world.root.getObjectByName(`town-walls-${archetype}`);
      const roofs = world.root.getObjectByName(`town-roofs-${archetype}`);
      expect(glazing).toBeInstanceOf(InstancedMesh);
      expect(walls).toBeInstanceOf(InstancedMesh);
      expect(roofs).toBeInstanceOf(InstancedMesh);
      if (!(glazing instanceof InstancedMesh) || !(walls instanceof InstancedMesh)) {
        throw new Error(`town archetype ${archetype} should include facade and glazing batches`);
      }
      expect(glazing.count).toBe(
        world.buildings.filter((building) => building.archetype === archetype).length,
      );
      expect(glazing.material).toBeInstanceOf(MeshPhysicalNodeMaterial);
      expect((glazing.material as MeshPhysicalNodeMaterial).clearcoatNode).not.toBeNull();
      expect(walls.material).toBeInstanceOf(MeshPhysicalNodeMaterial);
      expect((walls.material as MeshPhysicalNodeMaterial).colorNode).not.toBeNull();
      expect(walls.geometry.getAttribute('position').count).toBeGreaterThan(100);
    }
    world.dispose();
  });

  it('marches poles along the network at roadside offset', () => {
    const poles = generateRoadPoles(sampler, network);
    expect(poles.length).toBeGreaterThan(100);
    expect(poles.length).toBeLessThan(260);
    for (const pole of poles) {
      const road = sampler.roadAt!(pole.x, pole.z);
      expect(road).not.toBeNull();
      expect(road!.distance).toBeGreaterThan(5.4);
      expect(road!.distance).toBeLessThan(12);
      expect(road!.roadClass).not.toBe('urban-local');
      expect(road!.roadClass).not.toBe('urban-arterial');
    }
  });
});

describe('town collision', () => {
  it('stops the car at a building face', () => {
    const world = new TownWorld(sampler);
    const building = world.buildings[0]!;
    // Approach the -Z face head-on, driving north.
    const hits = world.collide(
      {
        x: building.x,
        z: building.z + building.halfDepth + 2.4,
        yaw: 0,
        velocityX: 0,
        velocityZ: -8,
      },
      1 / 60,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.solid).toBe(true);
    expect(hits[0]!.absorbedSpeed).toBeCloseTo(8, 0);
    world.dispose();
  });

  it('folds a pole on a hard hit and then ignores it', () => {
    const world = new TownWorld(sampler);
    const pole = world.poles[0]!;
    const car = {
      x: pole.x,
      z: pole.z + 2.2,
      yaw: 0,
      velocityX: 0,
      velocityZ: -9,
    };
    const hits = world.collide(car, 1 / 60);
    const poleHit = hits.find((hit) => hit.impact);
    expect(poleHit).toBeDefined();
    expect(world.getContentStats().townPolesDown).toBe(1);
    // Down poles no longer collide.
    const again = world.collide(car, 1 / 60);
    expect(again.find((hit) => hit.impactSpeed > 0.9)).toBeUndefined();
    world.dispose();
  });

  it('rate-limits pole damage so a slow push cannot farm hits per frame', () => {
    const world = new TownWorld(sampler);
    const pole = world.poles[0]!;
    // 1.5 m/s closing = 15 damage per event; the pole has 30 HP, so it must
    // take two *separate* events — a second call inside the cooldown adds none.
    const car = {
      x: pole.x,
      z: pole.z + 2.2,
      yaw: 0,
      velocityX: 0,
      velocityZ: -1.5,
    };
    world.collide(car, 1 / 60);
    world.collide(car, 1 / 60);
    expect(world.getContentStats().townPolesDown).toBe(0);
    world.collide(car, 0.5);
    expect(world.getContentStats().townPolesDown).toBe(1);
    world.dispose();
  });
});
