import { describe, expect, it } from 'vitest';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { buildRoadLayout } from '../../src/world/road-layout';
import { createWorldPlan } from '../../src/world/world-plan';
import { hideoutPits, layoutClearanceMeters, placeHideouts } from '../../src/world/hideouts';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { homeCityAnchor, massingCityForRegion } from '../../src/world/city-content';

/**
 * Phase 10.2 contracts: hideout placement is a pure function of (plan, layout, seed) with
 * hard road/district clearances; the garage pit is a real carve in the shared heightfield;
 * the massing city's plot fronts and dense-block flags are stable and well-formed.
 */

const SEED = 20261103;

function makeWorld(seed: number) {
  const plan = createWorldPlan(seed);
  const layout = buildRoadLayout(plan);
  const anchor = homeCityAnchor(plan);
  const hideouts = placeHideouts(plan, layout, seed);
  return { plan, layout, anchor, hideouts };
}

describe('hideout placement', () => {
  const { plan, layout, hideouts } = makeWorld(SEED);

  it('places up to four hideouts, the first being the garage', () => {
    expect(hideouts.length).toBeGreaterThanOrEqual(1);
    expect(hideouts.length).toBeLessThanOrEqual(4);
    const garage = hideouts.find((h) => h.kind === 'garage');
    expect(garage).toBeDefined();
    expect(garage?.pit).toBeDefined();
    for (const h of hideouts) {
      if (h.kind !== 'garage') expect(h.pit).toBeUndefined();
    }
  });

  it('is bit-identical for the same seed and different across seeds', () => {
    const a = placeHideouts(plan, layout, SEED);
    const b = placeHideouts(plan, layout, SEED);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = placeHideouts(plan, layout, SEED + 1);
    expect(JSON.stringify(a) === JSON.stringify(c)).toBe(false);
  });

  it('keeps every hideout clear of the road network and the district core', () => {
    const ROAD_CLEARANCE = 65;
    const DISTRICT_CLEARANCE = 700;
    for (const h of hideouts) {
      const clearance = layoutClearanceMeters(layout.config, h.x, h.z);
      expect(clearance).toBeGreaterThanOrEqual(ROAD_CLEARANCE - 1e-6);
      const region = plan.regionAt(h.x, h.z);
      const coreDistance = Math.hypot(h.x - region.district.centerX, h.z - region.district.centerZ);
      expect(coreDistance).toBeGreaterThanOrEqual(DISTRICT_CLEARANCE - 1e-6);
    }
  });
});

describe('garage pit carve', () => {
  const { layout, anchor, hideouts } = makeWorld(SEED);
  const pits = hideoutPits(hideouts);
  const garage = hideouts.find((h) => h.kind === 'garage');
  const pit = garage?.pit ?? pits[0];

  it('carves the full depth at the centre and nothing outside the radius', () => {
    if (pit === undefined) return;
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, layout.config, anchor, pits);
    const plain = createWorldTerrainSampler(TERRAIN_CONFIG, layout.config, anchor);
    const delta = (x: number, z: number): number => plain.heightAt(x, z) - sampler.heightAt(x, z);
    // Full depth at the centre (the bowl's flat floor).
    expect(delta(pit.x, pit.z)).toBeCloseTo(pit.depthMeters, 6);
    // Nothing at all beyond the rim.
    for (const [dx, dz] of [
      [pit.radiusMeters * 1.05, 0],
      [0, pit.radiusMeters * 1.05],
      [pit.radiusMeters * 1.5, pit.radiusMeters * 1.5],
    ] as const) {
      expect(delta(pit.x + dx, pit.z + dz)).toBe(0);
    }
  });

  it('blends monotonically from the floor to the rim', () => {
    if (pit === undefined) return;
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, layout.config, anchor, pits);
    const plain = createWorldTerrainSampler(TERRAIN_CONFIG, layout.config, anchor);
    const delta = (r: number): number =>
      plain.heightAt(pit.x + r, pit.z) - sampler.heightAt(pit.x + r, pit.z);
    let previous = pit.depthMeters;
    for (let i = 1; i <= 12; i += 1) {
      const r = (pit.radiusMeters * i) / 12;
      const depth = delta(r);
      // The bowl shallows monotonically toward the rim.
      expect(depth).toBeLessThanOrEqual(previous + 1e-9);
      expect(depth).toBeGreaterThanOrEqual(0);
      previous = depth;
    }
    expect(delta(0)).toBeCloseTo(pit.depthMeters, 6);
    expect(delta(pit.radiusMeters * 1.1)).toBe(0);
  });
});

describe('massing plots and dense blocks', () => {
  const plan = createWorldPlan(SEED);

  const urbanRegions = (() => {
    const regions = [];
    for (let ix = -2; ix <= 2; ix += 1) {
      for (let iz = -2; iz <= 2; iz += 1) {
        const region = plan.regionAtCell(ix, iz);
        if (region.archetype === 'megacity' || region.archetype === 'urban-fringe') {
          regions.push(region);
        }
      }
    }
    return regions;
  })();

  it('runs only for urban regions', () => {
    expect(urbanRegions.length).toBeGreaterThan(0);
  });

  it('is deterministic per region', () => {
    for (const region of urbanRegions.slice(0, 3)) {
      const a = massingCityForRegion(region);
      const b = massingCityForRegion(region);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('places well-formed lot fronts and flags dense blocks', () => {
    const validYaw = (yaw: number): boolean =>
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].some((k) => Math.abs(yaw - k) < 1e-9);
    let totalPlots = 0;
    const denseWeights: { blocks: number; dense: number; upper: number }[] = [];
    for (const region of urbanRegions) {
      const spec = massingCityForRegion(region);
      // The lattice reach: the outer block edge is half the grid extent plus one spacing.
      const reach = (spec.streetSpacing * spec.gridNodes) / 2 + spec.streetSpacing;
      for (const plot of spec.plots) {
        expect(Math.abs(plot.x)).toBeLessThanOrEqual(reach);
        expect(Math.abs(plot.z)).toBeLessThanOrEqual(reach);
        expect(validYaw(plot.yaw)).toBe(true);
        expect(plot.widthMeters).toBeGreaterThan(5);
        expect(plot.widthMeters).toBeLessThan(spec.streetSpacing / 3);
        expect(plot.depthMeters).toBeGreaterThan(8);
        totalPlots += 1;
      }
      // Phase 10 pass 2: the slum-colony runs ~60% dense by design; the rest ~25%.
      const denseUpper = region.subArchetype === 'slum-colony' ? 0.8 : 0.4;
      denseWeights.push({
        blocks: spec.blocks.length,
        dense: spec.blocks.filter((b) => b.dense).length,
        upper: denseUpper,
      });
    }
    expect(totalPlots).toBeGreaterThan(0);
    // Assert the band per sub-archetype, not the exact roll.
    for (const w of denseWeights) {
      expect(w.dense).toBeGreaterThanOrEqual(w.blocks * 0.05);
      expect(w.dense).toBeLessThan(w.blocks * w.upper);
    }
  });
});
