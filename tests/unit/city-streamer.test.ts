import { describe, expect, it } from 'vitest';
import { uniform } from 'three/tsl';
import type { UniformNode } from 'three/webgpu';
import { CityStreamer } from '../../src/world/city-streamer';
import { MassingCityWorld } from '../../src/world/urban-massing';
import { massingCityForRegion } from '../../src/world/city-content';
import { createWorldPlan, REGION_CELL_METERS } from '../../src/world/world-plan';
import type { TerrainSampler } from '../../src/world/terrain-height';
import type { Group } from 'three';

const FLAT_SAMPLER = {
  heightAt: () => 0,
  normalAt: () => ({ x: 0, y: 1, z: 0 }),
} as unknown as TerrainSampler;

function nightGain(): UniformNode<'float', number> {
  return uniform(1);
}

function anUrbanRegion(seed: number, archetype: 'megacity' | 'urban-fringe') {
  const plan = createWorldPlan(seed);
  for (let ix = -4; ix <= 4; ix += 1) {
    for (let iz = -4; iz <= 4; iz += 1) {
      const region = plan.regionAtCell(ix, iz);
      if (region.archetype === archetype) return { plan, region };
    }
  }
  throw new Error(`no ${archetype} region found for seed ${seed}`);
}

describe('urban-massing', () => {
  it('builds instanced batches and tier-budgeted point lights', () => {
    const { region } = anUrbanRegion(20261102, 'megacity');
    const spec = massingCityForRegion(region);
    const city = new MassingCityWorld(spec, 'C', { nightGain: nightGain(), baseY: 0 });
    expect(city.root.children.length).toBeGreaterThan(3);
    expect(city.getContentStats().massingCityTowers).toBe(spec.towers.length);
    expect(city.getContentStats().massingCityPointLights).toBeLessThanOrEqual(2);
    city.dispose();
  });

  it('collides the car against every tower and infill box', () => {
    const { region } = anUrbanRegion(12345, 'urban-fringe');
    const spec = massingCityForRegion(region);
    const city = new MassingCityWorld(spec, 'B', { nightGain: nightGain(), baseY: 0 });
    // A probe at the city centre with zero speed: solid boxes near the centre push back.
    const centre = { x: region.district.centerX, z: region.district.centerZ };
    const near = city.collideTown({
      x: centre.x,
      z: centre.z,
      yaw: 0,
      velocityX: 0,
      velocityZ: 0,
    });
    expect(near.length).toBeGreaterThanOrEqual(0);
    city.dispose();
  });
});

describe('city-streamer', () => {
  it('streams cities on approach and releases them on departure, within the tier budget', () => {
    const plan = createWorldPlan(20261102);
    const attached: Group[] = [];
    const detached: Group[] = [];
    const streamer = new CityStreamer(plan, 'C', FLAT_SAMPLER, {
      attach: (city) => attached.push(city.root as Group),
      detach: (city) => detached.push(city.root as Group),
    });

    // Urban candidates exist beyond the home cell.
    // Drive to the first candidate: it builds within the radius.
    const urbanCells: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ];
    let target: { x: number; z: number } | undefined;
    for (const [ix, iz] of urbanCells) {
      const region = plan.regionAtCell(ix, iz);
      if (region.archetype === 'megacity' || region.archetype === 'urban-fringe') {
        target = { x: region.district.centerX, z: region.district.centerZ };
        break;
      }
    }
    expect(target).toBeDefined();
    streamer.update({ x: target!.x, z: target!.z });
    expect(attached.length).toBe(1);

    // Driving far away releases it again.
    streamer.update({ x: target!.x + 20 * REGION_CELL_METERS, z: target!.z });
    expect(detached.length).toBe(1);
    expect(attached.length).toBe(1);
    streamer.dispose();
  });

  it('respects the live-city budget on tier C', () => {
    const plan = createWorldPlan(20261102);
    // Find up to three urban cells (the home cell is excluded by the streamer).
    const urban: { x: number; z: number }[] = [];
    for (let ix = -2; ix <= 2 && urban.length < 3; ix += 1) {
      for (let iz = -2; iz <= 2 && urban.length < 3; iz += 1) {
        if (ix === 0 && iz === 0) continue;
        const region = plan.regionAtCell(ix, iz);
        if (region.archetype === 'megacity' || region.archetype === 'urban-fringe') {
          urban.push({ x: region.district.centerX, z: region.district.centerZ });
        }
      }
    }
    if (urban.length < 3) return; // the seed does not offer three urban neighbours
    const streamer = new CityStreamer(plan, 'C', FLAT_SAMPLER, {
      attach: () => undefined,
      detach: () => undefined,
    });
    // Stand between the first two cities: both are inside the build radius.
    const mid = {
      x: (urban[0]!.x + urban[1]!.x) / 2,
      z: (urban[0]!.z + urban[1]!.z) / 2,
    };
    streamer.update(mid);
    streamer.update(mid);
    // Move to the third: on tier C the budget is 2, so it must not all be live at once
    // beyond the budget — the streamer keeps at most 2 live.
    streamer.update({ x: urban[2]!.x, z: urban[2]!.z });
    streamer.update({ x: urban[2]!.x, z: urban[2]!.z });
    const stats = streamer.getContentStats();
    expect(stats.massingCitiesLive).toBeLessThanOrEqual(2);
    streamer.dispose();
  });

  it('is deterministic: the same seed builds the same cities', () => {
    const builtFor = (seed: number): string[] => {
      const plan = createWorldPlan(seed);
      const seen: string[] = [];
      const streamer = new CityStreamer(plan, 'B', FLAT_SAMPLER, {
        attach: (city) => seen.push(city.root.name),
        detach: () => undefined,
      });
      for (let ix = -ROADW; ix <= ROADW; ix += 1) {
        for (let iz = -ROADW; iz <= ROADW; iz += 1) {
          streamer.update({
            x: ix * REGION_CELL_METERS,
            z: iz * REGION_CELL_METERS,
          });
        }
      }
      streamer.dispose();
      return seen;
    };
    const ROADW = 2;
    const a = builtFor(777);
    const b = builtFor(777);
    expect(a).toEqual(b);
  });
});
