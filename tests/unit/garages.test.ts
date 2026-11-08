import { describe, expect, it } from 'vitest';

import { createWorldPlan, terrainSeedFor } from '../../src/world/world-plan';
import { buildRoadLayout } from '../../src/world/road-layout';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { homeCityAnchor } from '../../src/world/city-content';
import { placeHideouts, hideoutPits } from '../../src/world/hideouts';
import { terrainConfigForTier } from '../../src/config/terrain';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { AOHARA_JUNCTION_NODE_ID } from '../../src/config/urban-district';
import type { RoadNetwork } from '../../src/world/road-network';
import { massingCityForRegion } from '../../src/world/city-content';

/**
 * Phase 10 pass 4 — underground parking garages: a single open floor of garage aisle
 * edges sunk into a rectangular pit, reached from the street by a max-grade ramp.
 * The heightfield is single-valued, so the pit is carved to one flat floor and the car
 * drives a serpentine of aisles on it. Contracts: the ramp is grade-feasible and lands
 * on the floor, the pit floor is flat and level with the aisles, the selection is
 * bounded and deterministic per seed, massing clears the pits, and the hand-placed
 * fixture (no seed / anchor) is untouched.
 */

interface BuiltWorld {
  network: RoadNetwork;
  heightAt: (x: number, z: number) => number;
}

function buildGeneratedWorld(seed: number): BuiltWorld {
  const plan = createWorldPlan(seed);
  const anchor = homeCityAnchor(plan);
  const layout = buildRoadLayout(plan);
  const hideouts = placeHideouts(plan, layout, seed);
  const terrainConfig = {
    ...terrainConfigForTier('C' as const, terrainSeedFor(seed)),
    volcano: {
      position: [plan.volcano.x, plan.volcano.z] as const,
      heightMeters: plan.volcano.heightMeters,
      radiusMeters: plan.volcano.radiusMeters,
    },
  };
  const sampler = createWorldTerrainSampler(
    terrainConfig,
    layout.config,
    {
      x: anchor.x,
      z: anchor.z,
      flatRadiusMeters: anchor.flatRadiusMeters,
      blendRadiusMeters: anchor.blendRadiusMeters,
    },
    hideoutPits(hideouts),
  );
  if (sampler.roadNetwork === undefined) {
    throw new Error('generated world must expose its road network');
  }
  return { network: sampler.roadNetwork, heightAt: sampler.heightAt };
}

const SEEDS = [20261013, 777, 424242] as const;

/** Local→world using the same convention as the planner (yaw = atan2(rampDirX, Z)). */
function localToWorld(
  g: { x: number; z: number; yaw: number },
  lx: number,
  lz: number,
): { x: number; z: number } {
  const cos = Math.cos(g.yaw);
  const sin = Math.sin(g.yaw);
  return { x: g.x - cos * lx + sin * lz, z: g.z + sin * lx + cos * lz };
}

describe('garage selection in the generated world', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: a bounded, spaced set — one in the home city, none at the spawn junction`, () => {
      const { network } = buildGeneratedWorld(seed);
      const plan = createWorldPlan(seed);
      const anchor = homeCityAnchor(plan);
      expect(network.garages.length).toBeGreaterThanOrEqual(1);
      expect(network.garages.length).toBeLessThanOrEqual(3);
      // The home-city garage sits near the anchor but clear of the spawn pad.
      const home = network.garages.filter((g) => Math.hypot(g.x - anchor.x, g.z - anchor.z) < 900);
      expect(home.length).toBe(1);
      for (const g of home) {
        expect(Math.hypot(g.x - anchor.x, g.z - anchor.z)).toBeGreaterThanOrEqual(180);
      }
      // Generated-city garages are far apart so they read as distinct landmarks.
      const outer = network.garages.filter(
        (g) => Math.hypot(g.x - anchor.x, g.z - anchor.z) >= 900,
      );
      for (let i = 0; i < outer.length; i += 1) {
        for (let j = i + 1; j < outer.length; j += 1) {
          const a = outer[i]!;
          const b = outer[j]!;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(3000);
        }
      }
      // No garage attaches to the spawn junction.
      for (const g of network.garages) {
        expect(g.entranceNodeId).not.toBe(AOHARA_JUNCTION_NODE_ID);
      }
    });

    it(`seed ${seed}: the ramp is grade-feasible and lands on the flat floor`, () => {
      const { network, heightAt } = buildGeneratedWorld(seed);
      for (const g of network.garages) {
        const floorY = g.floorYs[0]!;
        // The floor is one level below the entrance street.
        expect(Math.abs(g.entranceY - floorY)).toBeCloseTo(5, 0);
        const ramp = network.edges.find((e) => e.id === `${g.id}-ramp`);
        expect(ramp).toBeDefined();
        if (!ramp) continue;
        // The ramp starts at the entrance street and ends at the floor.
        expect(ramp.points[0]!.y).toBeCloseTo(g.entranceY, 1);
        expect(ramp.points[ramp.points.length - 1]!.y).toBeCloseTo(floorY, 1);
        // Every segment stays inside the ramp's grade budget.
        for (let i = 1; i < ramp.points.length; i += 1) {
          const p = ramp.points[i - 1]!;
          const q = ramp.points[i]!;
          const run = Math.hypot(q.x - p.x, q.z - p.z);
          if (run > 0.01) {
            expect(Math.abs(q.y - p.y) / run).toBeLessThanOrEqual(ramp.maxGrade * 1.05 + 1e-6);
          }
        }
        // The carve keeps the ramp under the tyres: the physics surface is the profile.
        const mid = ramp.points[Math.floor(ramp.points.length / 2)]!;
        const h = heightAt(mid.x, mid.z);
        expect(h).toBeGreaterThanOrEqual(mid.y - 0.2);
        expect(h).toBeLessThanOrEqual(mid.y + 0.15);
      }
    });

    it(`seed ${seed}: the pit floor is flat and level with the aisles`, () => {
      const { network, heightAt } = buildGeneratedWorld(seed);
      for (const g of network.garages) {
        const floorY = g.floorYs[0]!;
        // Sample a grid of the open floor (away from the ramp slot and street
        // crossings) — the pit is carved to a flat plane at the floor.
        let onFloor = 0;
        let total = 0;
        for (let row = -38; row <= 38; row += 6) {
          for (let lx = -30; lx <= 30; lx += 6) {
            const wpt = localToWorld(g, lx, row);
            const y = heightAt(wpt.x, wpt.z);
            total += 1;
            if (Math.abs(y - floorY) <= 0.6) onFloor += 1;
          }
        }
        // Most of the floor is level; the remainder is the ramp slot and any street
        // causeway crossing the footprint.
        expect(onFloor / total).toBeGreaterThan(0.5);
        // The aisle centrelines hold the floor exactly (the car drives on them).
        for (const row of g.aisleZs) {
          const wpt = localToWorld(g, -15, row);
          const y = heightAt(wpt.x, wpt.z);
          expect(Math.abs(y - floorY)).toBeLessThan(0.2);
        }
      }
    });

    it(`seed ${seed}: the pit is actually dug below the natural ground`, () => {
      const { network } = buildGeneratedWorld(seed);
      for (const g of network.garages) {
        const floorY = g.floorYs[0]!;
        expect(g.pit.floorY).toBeCloseTo(floorY, 5);
        expect(g.pit.depth).toBeCloseTo(g.entranceY - floorY, 5);
        expect(g.pit.depth).toBeGreaterThan(4);
      }
    });

    it(`seed ${seed}: garage placements and floors are deterministic`, () => {
      const a = buildGeneratedWorld(seed).network;
      const b = buildGeneratedWorld(seed).network;
      expect(b.garages.length).toBe(a.garages.length);
      for (let i = 0; i < a.garages.length; i += 1) {
        const ga = a.garages[i]!;
        const gb = b.garages[i]!;
        expect(gb.id).toBe(ga.id);
        expect(gb.x).toBeCloseTo(ga.x, 6);
        expect(gb.z).toBeCloseTo(ga.z, 6);
        expect(gb.yaw).toBeCloseTo(ga.yaw, 6);
        expect(gb.floorYs[0]).toBeCloseTo(ga.floorYs[0]!, 6);
      }
    });

    it(`seed ${seed}: garage edges never register as bridge/overpass/tunnel spans`, () => {
      const { network } = buildGeneratedWorld(seed);
      const garageEdgeIds = new Set(
        network.edges.filter((e) => e.roadClass === 'garage').map((e) => e.id),
      );
      for (const span of [
        ...network.bridgeSpans,
        ...network.overpassSpans,
        ...network.tunnelSpans,
      ]) {
        expect(garageEdgeIds.has(span.edgeId)).toBe(false);
      }
    });
  }
});

describe('massing clears the garage pits', () => {
  it('a placement over a pit is rejected, one beside it is kept', () => {
    const { network } = buildGeneratedWorld(20261013);
    const g = network.garages[0]!;
    expect(g).toBeDefined();
    if (!g) return;
    const pits = network.garages.map((garage) => garage.pit);
    const plan = createWorldPlan(20261013);
    // Find an urban region to run the massing spec against.
    let region = null;
    outer: for (let iz = -2; iz <= 2; iz += 1) {
      for (let ix = -2; ix <= 2; ix += 1) {
        if (ix === 0 && iz === 0) continue;
        const candidate = plan.regionAtCell(ix, iz);
        if (candidate.archetype === 'megacity' || candidate.archetype === 'urban-fringe') {
          region = candidate;
          break outer;
        }
      }
    }
    expect(region).toBeDefined();
    if (region === null) return;
    const spec = massingCityForRegion(region, { pits });
    // No building may stand over the pit rectangle (the ground there is five metres
    // down): mirror the planner's clearance rule with the building's own extents.
    const cos = Math.cos(g.yaw);
    const sin = Math.sin(g.yaw);
    const buildings = [...spec.towers, ...spec.infill];
    expect(buildings.length).toBeGreaterThan(0);
    for (const b of buildings) {
      const wx = spec.x + b.x - g.x;
      const wz = spec.z + b.z - g.z;
      const lx = wx * -cos + wz * sin;
      const lz = wx * sin + wz * cos;
      const overlaps =
        Math.abs(lx) <= g.pit.halfWidth + b.width / 2 + 2 &&
        Math.abs(lz) <= g.pit.halfDepth + b.depth / 2 + 2;
      expect(overlaps).toBe(false);
    }
  });
});

describe('the hand-placed fixture is untouched', () => {
  it('a config without a seed/anchor plans no garages', () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    expect(sampler.roadNetwork).toBeDefined();
    if (sampler.roadNetwork === undefined) return;
    expect(sampler.roadNetwork.garages.length).toBe(0);
  });
});
