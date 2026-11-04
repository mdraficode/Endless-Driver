import { describe, expect, it } from 'vitest';
import { uniform } from 'three/tsl';

import { createWorldPlan } from '../../src/world/world-plan';
import { buildRoadLayout } from '../../src/world/road-layout';
import { massingCityForRegion, type MassingCitySpec } from '../../src/world/city-content';
import { MassingCityWorld } from '../../src/world/urban-massing';
import { computeRegionClutter } from '../../src/world/urban-clutter';
import { buildRoadNetwork } from '../../src/world/road-network';

/** Find the first urban-fringe slum-colony region in a growing ring around the origin. */
function findSlumRegion(seed: number): {
  ix: number;
  iz: number;
  region: ReturnType<ReturnType<typeof createWorldPlan>['regionAtCell']>;
} {
  const plan = createWorldPlan(seed);
  for (let ring = 1; ring <= 6; ring += 1) {
    for (let iz = -ring; iz <= ring; iz += 1) {
      for (let ix = -ring; ix <= ring; ix += 1) {
        if (Math.max(Math.abs(ix), Math.abs(iz)) !== ring) continue;
        const region = plan.regionAtCell(ix, iz);
        if (region.subArchetype === 'slum-colony') {
          return { ix, iz, region };
        }
      }
    }
  }
  throw new Error(`no slum-colony region within ring 6 of seed ${seed}`);
}

describe('slum-colony sub-archetype (Phase 10 pass 2)', () => {
  it('arms on urban-fringe cells only, deterministically, at a stable share', () => {
    const plan = createWorldPlan(20261102);
    let slums = 0;
    let fringe = 0;
    for (let ix = -5; ix <= 5; ix += 1) {
      for (let iz = -5; iz <= 5; iz += 1) {
        const region = plan.regionAtCell(ix, iz);
        if (region.archetype === 'urban-fringe') {
          fringe += 1;
          if (region.subArchetype === 'slum-colony') slums += 1;
        } else {
          expect(region.subArchetype).toBeUndefined();
        }
      }
    }
    expect(fringe).toBeGreaterThan(0);
    // ~35% by design; a wide band keeps the test honest without flaking on seeds.
    expect(slums).toBeGreaterThanOrEqual(0.12 * fringe);
    expect(slums).toBeLessThanOrEqual(0.6 * fringe);

    // Deterministic: the same seed rolls the same colonies twice.
    const plan2 = createWorldPlan(20261102);
    const same = [1, -1, 2, 3].every((ix) =>
      [-1, 0, 1].every(
        (iz) => plan.regionAtCell(ix, iz).subArchetype === plan2.regionAtCell(ix, iz).subArchetype,
      ),
    );
    expect(same).toBe(true);
  });

  it('runs the colony on tighter blocks with more backstreets', () => {
    const { ix, iz, region } = findSlumRegion(4242);
    const { config } = buildRoadLayout(createWorldPlan(4242));
    // The slum grid nodes sit 240 m apart (the fringe runs 320).
    const gridNodes = config.nodes.filter((node) => node.id.startsWith(`g${ix}-${iz}-`));
    expect(gridNodes.length).toBeGreaterThan(0);
    const spacings = new Set<number>();
    for (let i = 0; i < gridNodes.length; i += 1) {
      for (let j = i + 1; j < gridNodes.length; j += 1) {
        const a = gridNodes[i]!;
        const b = gridNodes[j]!;
        const dx = Math.abs(a.x - b.x);
        const dz = Math.abs(a.z - b.z);
        if (dx === 0 && dz > 50 && dz < 260) spacings.add(Math.round(dz));
        if (dz === 0 && dx > 50 && dx < 260) spacings.add(Math.round(dx));
      }
    }
    expect(spacings.has(240)).toBe(true);
    // No 320 m fringe spacing survives in the colony.
    expect(spacings.has(320)).toBe(false);

    // Backstreets: the colony's alley share far exceeds the fringe norm.
    const slumEdges = config.edges.filter(
      (edge) =>
        edge.roadClass === 'urban-alley' &&
        (edge.from.startsWith(`g${ix}-${iz}-`) ||
          edge.to.startsWith(`g${ix}-${iz}-`) ||
          edge.from.startsWith(`sp${ix}-${iz}-`) ||
          edge.to.startsWith(`sp${ix}-${iz}-`)),
    );
    expect(slumEdges.length).toBeGreaterThan(20);
    void region;
  });

  it('masses low, narrow towers with dimmed window light', () => {
    const { region } = findSlumRegion(4242);
    const spec = massingCityForRegion(region);
    expect(spec.windowDimming).toBeCloseTo(0.6);
    expect(spec.clutterDensity).toBeCloseTo(1.6);
    expect(spec.streetSpacing).toBe(240);
    // Low rise: the colony's tallest mass stays under a fringe tower's reach.
    const tallest = Math.max(...spec.towers.map((tower) => tower.height));
    expect(tallest).toBeLessThan(30);
    const widest = Math.max(...spec.towers.map((tower) => tower.width));
    expect(widest).toBeLessThan(22);
    expect(spec.towers.length).toBeGreaterThan(0);

    // The dimmed city lights fewer windows than its undimmed twin with the same seed.
    const nightGain = uniform(1);
    const base: MassingCitySpec = {
      regionId: spec.regionId,
      x: spec.x,
      z: spec.z,
      streetSpacing: spec.streetSpacing,
      gridNodes: spec.gridNodes,
      towers: spec.towers,
      infill: spec.infill,
      lamps: spec.lamps,
      plots: spec.plots,
      blocks: spec.blocks,
    };
    const baseWorld = new MassingCityWorld(base, 'A', { nightGain, baseY: 0 });
    const slumWorld = new MassingCityWorld(spec, 'A', { nightGain, baseY: 0 });
    const countWindows = (world: MassingCityWorld): number => {
      let count = 0;
      world.root.traverse((node) => {
        if (node.name.startsWith('massing-windows-')) {
          count += (node as unknown as { count: number }).count ?? 0;
        }
      });
      return count;
    };
    expect(countWindows(slumWorld)).toBeLessThan(countWindows(baseWorld));
    baseWorld.dispose();
    slumWorld.dispose();
  });

  it('dresses the colony streets with denser, leaner clutter', () => {
    const { region } = findSlumRegion(4242);
    const spec = massingCityForRegion(region);
    const layout = buildRoadLayout(createWorldPlan(4242));
    const network = buildRoadNetwork(layout.config, () => 0);
    const slumClutter = computeRegionClutter(spec, network, 'A', 4242);
    const baseSpec: MassingCitySpec = {
      regionId: spec.regionId,
      x: spec.x,
      z: spec.z,
      streetSpacing: spec.streetSpacing,
      gridNodes: spec.gridNodes,
      towers: spec.towers,
      infill: spec.infill,
      lamps: spec.lamps,
      plots: spec.plots,
      blocks: spec.blocks,
    };
    const baseClutter = computeRegionClutter(baseSpec, network, 'A', 4242);
    expect(slumClutter.clutter.length).toBeGreaterThan(baseClutter.clutter.length);
    // The lean skew: debris + crates dominate the colony's prop mix.
    const lean = slumClutter.clutter.filter(
      (item) => item.kind === 'debris' || item.kind === 'crate',
    ).length;
    expect(lean / Math.max(1, slumClutter.clutter.length)).toBeGreaterThan(0.5);
  });
});
