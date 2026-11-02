import { describe, expect, it } from 'vitest';
import { AOHARA_DISTRICT_CONFIG } from '../../src/config/urban-district';
import {
  homeCityAnchor,
  homeCityRoadGraph,
  massingCityForRegion,
  proceduralSpawn,
} from '../../src/world/city-content';
import { createWorldPlan, REGION_CELL_METERS } from '../../src/world/world-plan';

describe('city-content', () => {
  it('anchors the home city at the plan’s home district, on the city plateau radii', () => {
    const plan = createWorldPlan(20261102);
    const district = plan.regionAtCell(0, 0).district;
    const anchor = homeCityAnchor(plan);
    expect(anchor.x).toBe(district.centerX);
    expect(anchor.z).toBe(district.centerZ);
    expect(anchor.flatRadiusMeters).toBe(AOHARA_DISTRICT_CONFIG.flatRadiusMeters);
    expect(anchor.blendRadiusMeters).toBe(AOHARA_DISTRICT_CONFIG.terrainBlendRadiusMeters);
  });

  it('translates the kit graph to the anchor, preserving ids and geometry', () => {
    const plan = createWorldPlan(4242);
    const anchor = homeCityAnchor(plan);
    const dx = anchor.x - AOHARA_DISTRICT_CONFIG.centerX;
    const dz = anchor.z - AOHARA_DISTRICT_CONFIG.centerZ;
    const { nodes, edges } = homeCityRoadGraph(anchor);

    const centre = nodes.find((node) => node.id === 'aohara-center');
    expect(centre).toBeDefined();
    expect(centre!.x).toBeCloseTo(anchor.x, 3);
    expect(centre!.z).toBeCloseTo(anchor.z, 3);

    // The kit’s north-outer-west-outer corner keeps its −350/−320 offset from the centre.
    const corner = nodes.find((node) => node.id === 'aohara-north-outer-west-outer');
    expect(corner!.x).toBeCloseTo(anchor.x - 350, 3);
    expect(corner!.z).toBeCloseTo(anchor.z - 320, 3);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.z)).toBe(true);
    }
    for (const edge of edges) {
      expect(nodes.some((node) => node.id === edge.from)).toBe(true);
      expect(nodes.some((node) => node.id === edge.to)).toBe(true);
    }
    expect(dx !== 0 || dz !== 0).toBe(true);
  });

  it('spawns on Central Avenue, midway between the centre and the north street', () => {
    const plan = createWorldPlan(7);
    const spawn = proceduralSpawn(homeCityAnchor(plan));
    expect(spawn.x).toBe(homeCityAnchor(plan).x);
    // aoharaRowOffsetMeters(1) = -150 → the spawn sits 75 m north of the centre row.
    expect(spawn.z).toBe(homeCityAnchor(plan).z - 75);
    expect(spawn.yaw).toBe(0);
    expect(spawn.id).toBe('procedural-city');
  });

  it('generates empty massing for non-urban regions', () => {
    const plan = createWorldPlan(20261102);
    // Find a rural or mountain region in the window.
    for (let ix = -4; ix <= 4; ix += 1) {
      for (let iz = -4; iz <= 4; iz += 1) {
        const region = plan.regionAtCell(ix, iz);
        if (region.archetype === 'megacity' || region.archetype === 'urban-fringe') continue;
        const spec = massingCityForRegion(region);
        expect(spec.towers).toHaveLength(0);
        expect(spec.infill).toHaveLength(0);
        expect(spec.lamps).toHaveLength(0);
        return;
      }
    }
    throw new Error('no non-urban region found');
  });

  it('generates deterministic, bounded massing cities for urban regions', () => {
    const planA = createWorldPlan(12345);
    const planB = createWorldPlan(12345);
    const a = massingCityForRegion(planA.regionAtCell(1, 0));
    const b = massingCityForRegion(planB.regionAtCell(1, 0));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    const region = planA.regionAtCell(1, 0);
    if (region.archetype !== 'megacity' && region.archetype !== 'urban-fringe') return;
    const n = a.gridNodes;
    expect(a.lamps).toHaveLength(n * n);
    const half = ((n - 1) / 2) * a.streetSpacing;
    for (const tower of a.towers) {
      expect(Math.abs(tower.x)).toBeLessThanOrEqual(half + 50);
      expect(Math.abs(tower.z)).toBeLessThanOrEqual(half + 50);
      expect(tower.height).toBeGreaterThanOrEqual(34);
      expect(tower.width).toBeGreaterThan(15);
      expect(tower.width).toBeLessThan(50);
    }
    for (const box of a.infill) {
      expect(Math.abs(box.x)).toBeLessThanOrEqual(half + 50);
      expect(Math.abs(box.z)).toBeLessThanOrEqual(half + 50);
    }
    // A megacity cell carries more skyline than a fringe cell of the same plan.
    if (region.archetype === 'megacity') {
      expect(a.towers.length).toBeGreaterThan(50);
    }
  });

  it('keeps the home district inside the home cell', () => {
    for (const seed of [1, 2, 3, 4242, 99999]) {
      const plan = createWorldPlan(seed);
      const district = plan.regionAtCell(0, 0).district;
      expect(Math.abs(district.centerX)).toBeLessThan(REGION_CELL_METERS / 2);
      expect(Math.abs(district.centerZ)).toBeLessThan(REGION_CELL_METERS / 2);
    }
  });
});
