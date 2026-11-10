import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { uniform } from 'three/tsl';

import { terrainConfigForTier } from '../../src/config/terrain';
import { homeCityAnchor, massingCityForRegion } from '../../src/world/city-content';
import { buildRoadLayout } from '../../src/world/road-layout';
import type { RoadNetwork } from '../../src/world/road-network';
import { createWorldPlan, terrainSeedFor } from '../../src/world/world-plan';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { buildAoharaTowerSpecs, clearTowersAgainstRoads } from '../../src/world/urban-night';
import { MassingCityWorld } from '../../src/world/urban-massing';
import { computeParkedPlacements, ParkedTrafficWorld } from '../../src/world/parked-traffic';

/**
 * Phase 10 pass 3 — buildings where the road is not. Regression for the three placement
 * bugs the owner hit in the field: (1) towers and infill straddling the sub-divisions and
 * routed connectors, (2) a 4 km city built on one ground datum floating or burying its
 * buildings on rolling terrain, (3) parked cars that the car drove straight through.
 */

function worldFor(seed: number): {
  network: RoadNetwork;
  sampler: ReturnType<typeof createWorldTerrainSampler>;
  plan: ReturnType<typeof createWorldPlan>;
} {
  const plan = createWorldPlan(seed);
  const anchor = homeCityAnchor(plan);
  const { config } = buildRoadLayout(plan);
  const terrainConfig = terrainConfigForTier('A', terrainSeedFor(seed));
  const sampler = createWorldTerrainSampler(
    terrainConfig,
    config,
    {
      x: anchor.x,
      z: anchor.z,
      flatRadiusMeters: anchor.flatRadiusMeters,
      blendRadiusMeters: anchor.blendRadiusMeters,
    },
    [],
  );
  const network = sampler.roadNetwork;
  if (network === undefined) {
    throw new Error('world sampler must carry the road network');
  }
  return { network, sampler, plan };
}

/** Footprint probes: centre, edge midpoints and corners. */
const PROBE_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.5, 0],
  [-0.5, 0],
  [0, 0.5],
  [0, -0.5],
  [0.5, 0.5],
  [-0.5, -0.5],
];

function pavementHits(
  network: RoadNetwork,
  x: number,
  z: number,
  width: number,
  depth: number,
): number {
  let hits = 0;
  for (const [fx, fz] of PROBE_OFFSETS) {
    const sample = network.sample(x + fx * width, z + fz * depth);
    if (sample !== null && sample.distance <= sample.halfWidthMeters) {
      hits += 1;
    }
  }
  return hits;
}

// Phase 11.0a: grade-constrained routing adds a few seconds per build; these
// multi-seed builds outgrow the 5 s default.
describe('massing city placement (Phase 10 pass 3)', { timeout: 60_000 }, () => {
  it('no tower or infill stands on the pavement, across seeds', () => {
    for (const seed of [20261102, 4242]) {
      const { network, plan } = worldFor(seed);
      let buildings = 0;
      for (let iz = -1; iz <= 1; iz += 1) {
        for (let ix = -1; ix <= 1; ix += 1) {
          if (ix === 0 && iz === 0) continue;
          const region = plan.regionAtCell(ix, iz);
          if (region.archetype !== 'megacity' && region.archetype !== 'urban-fringe') {
            continue;
          }
          const spec = massingCityForRegion(region, { network });
          for (const tower of spec.towers) {
            buildings += 1;
            expect(
              pavementHits(network, spec.x + tower.x, spec.z + tower.z, tower.width, tower.depth),
              `tower at (${(spec.x + tower.x).toFixed(0)}, ${(spec.z + tower.z).toFixed(0)})`,
            ).toBe(0);
          }
          for (const box of spec.infill) {
            buildings += 1;
            expect(
              pavementHits(network, spec.x + box.x, spec.z + box.z, box.width, box.depth),
              `infill at (${(spec.x + box.x).toFixed(0)}, ${(spec.z + box.z).toFixed(0)})`,
            ).toBe(0);
          }
        }
      }
      expect(buildings).toBeGreaterThan(0);
    }
  });

  it('stays deterministic with the same seed and network', () => {
    const { network, plan } = worldFor(20261102);
    const region = plan.regionAtCell(0, 1);
    if (region.archetype !== 'megacity' && region.archetype !== 'urban-fringe') {
      return;
    }
    const a = massingCityForRegion(region, { network });
    const b = massingCityForRegion(region, { network });
    expect(JSON.stringify(a.towers)).toBe(JSON.stringify(b.towers));
    expect(JSON.stringify(a.infill)).toBe(JSON.stringify(b.infill));
  });
});

describe('home city kit towers (Phase 10 pass 3)', { timeout: 30_000 }, () => {
  it('clears the generated city-access connectors before building', () => {
    const { network, plan } = worldFor(20261102);
    const anchor = homeCityAnchor(plan);
    const raw = buildAoharaTowerSpecs();
    const cleared = clearTowersAgainstRoads(raw, network, anchor.x, anchor.z);
    for (const tower of cleared) {
      expect(
        pavementHits(network, anchor.x + tower.x, anchor.z + tower.z, tower.width, tower.depth),
        `tower at (${tower.x}, ${tower.z})`,
      ).toBe(0);
    }
    // The kit loses at most a few towers to a shaving connector — never the skyline.
    expect(cleared.length).toBeGreaterThanOrEqual(raw.length - 3);
  });
});

describe('massing terrain following (Phase 10 pass 3)', { timeout: 30_000 }, () => {
  it('stands every mass on the local ground, not the district datum', () => {
    const region = (() => {
      const plan = createWorldPlan(20261102);
      for (let iz = -2; iz <= 2; iz += 1) {
        for (let ix = -2; ix <= 2; ix += 1) {
          if (ix === 0 && iz === 0) continue;
          const candidate = plan.regionAtCell(ix, iz);
          if (candidate.archetype === 'megacity' || candidate.archetype === 'urban-fringe') {
            return candidate;
          }
        }
      }
      throw new Error('no urban region in the test window');
    })();
    const { sampler } = worldFor(20261102);
    const spec = massingCityForRegion(region);
    if (spec.towers.length === 0) {
      return; // a region with no towers still passes — the massing list is the contract
    }
    const baseY = sampler.heightAt(region.district.centerX, region.district.centerZ);
    const nightGain = uniform(1);
    // A constant +40 m lift stub: every mass must stand exactly 40 m above the datum.
    const LIFT = 40;
    const world = new MassingCityWorld(spec, 'A', {
      nightGain,
      baseY,
      heightAt: () => baseY + LIFT,
    });
    const actual: number[] = [];
    world.root.traverse((node) => {
      if (!node.name.startsWith('massing-facades-')) {
        return;
      }
      const mesh = node as unknown as {
        count: number;
        getMatrixAt(i: number, m: Matrix4): Matrix4;
      };
      const matrix = new Matrix4();
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, matrix);
        actual.push(matrix.elements[13]!);
      }
    });
    const expected: number[] = [];
    for (const t of spec.towers) {
      const bodyHeight = t.crown === null ? t.height : t.height - t.crown.height;
      expected.push(-0.55 + LIFT + bodyHeight / 2);
      if (t.crown !== null) {
        expected.push(-0.55 + LIFT + t.height - t.crown.height / 2);
      }
    }
    actual.sort((a, b) => a - b);
    expected.sort((a, b) => a - b);
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i += 1) {
      expect(actual[i]).toBeCloseTo(expected[i]!, 3);
    }
    world.dispose();
  });
});

describe('parked car collision (Phase 10 pass 3)', { timeout: 30_000 }, () => {
  it('a parked car is solid and the lane beside it stays drivable', () => {
    const { network } = worldFor(20261102);
    const placements = computeParkedPlacements(network, 20261102);
    expect(placements.length).toBeGreaterThan(0);
    const world = new ParkedTrafficWorld(network, { tier: 'A', worldSeed: 20261102 });
    const parked = placements[0]!;
    // Dead on the car's footprint: a hit.
    const into = world.collideTown({
      x: parked.x,
      z: parked.z,
      yaw: parked.yaw,
      velocityX: 0,
      velocityZ: 0,
    });
    expect(into.length).toBeGreaterThan(0);
    // The lane beside the row stays drivable: 3.5 m off the car's side is clear,
    // whichever side faces the street.
    const sideX = Math.cos(parked.yaw) * 3.5;
    const sideZ = -Math.sin(parked.yaw) * 3.5;
    const probe = (dx: number, dz: number): number =>
      world.collideTown({
        x: parked.x + dx,
        z: parked.z + dz,
        yaw: parked.yaw,
        velocityX: 0,
        velocityZ: 0,
      }).length;
    expect(probe(sideX, sideZ) + probe(-sideX, -sideZ)).toBe(0);
    world.dispose();
  });
});
