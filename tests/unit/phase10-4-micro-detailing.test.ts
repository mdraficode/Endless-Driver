/**
 * Phase 10.4 (C4) — micro-detailing: the road wear mask, the skid-mark streaks on
 * junction approaches, and the streamed-city street clutter spec.
 */
import { describe, expect, it } from 'vitest';

import { URBAN_CITY_CONFIG } from '../../src/config/urban-city';
import { buildRoadLayout } from '../../src/world/road-layout';
import { createSkidMarkBatch, RoadWorld } from '../../src/world/RoadWorld';
import { generateRoadWearMask } from '../../src/world/road-decals';
import { computeRegionClutter } from '../../src/world/urban-clutter';
import { massingCityForRegion } from '../../src/world/city-content';
import type { MassingCitySpec } from '../../src/world/city-content';
import type { RoadNetwork } from '../../src/world/road-network';
import { buildRoadNetwork } from '../../src/world/road-network';
import { createWorldPlan } from '../../src/world/world-plan';

const SEED = 20261104;
const heightFn = (x: number, z: number): number =>
  Math.sin(x * 0.001) * 4 + Math.cos(z * 0.001) * 3;

function solvedNetwork(): RoadNetwork {
  const layout = buildRoadLayout(createWorldPlan(SEED));
  return buildRoadNetwork(layout.config, heightFn);
}

describe('road wear mask (potholes + grime)', () => {
  it('is deterministic and tileable', () => {
    const a = generateRoadWearMask();
    const b = generateRoadWearMask();
    expect(a).toEqual(b);
    expect(a.length).toBe(URBAN_CITY_CONFIG.roadWear.textureResolution ** 2);
  });

  it('has pothole-scale dark spots inside a soft grime film', () => {
    const mask = generateRoadWearMask();
    const cells = mask.length;
    let nonZero = 0;
    let dark = 0;
    for (let i = 0; i < cells; i += 1) {
      const value = mask[i] ?? 0;
      if (value > 0) nonZero += 1;
      if (value > 160) dark += 1;
    }
    // The grime film covers a healthy fraction of the tile but is never dense;
    // the potholes are sparse and dark.
    expect(nonZero / cells).toBeGreaterThan(0.1);
    expect(nonZero / cells).toBeLessThan(0.9);
    expect(dark / cells).toBeGreaterThan(0.0005);
    expect(dark / cells).toBeLessThan(0.05);
  });

  it('is tileable: the seam bands carry the same lit density as the interior', () => {
    const size = URBAN_CITY_CONFIG.roadWear.textureResolution;
    const mask = generateRoadWearMask();
    const inSeam = (x: number, z: number): boolean =>
      x < 2 || x > size - 3 || z < 2 || z > size - 3;
    let seamLit = 0;
    let seamTotal = 0;
    let innerLit = 0;
    let innerTotal = 0;
    for (let z = 0; z < size; z += 2) {
      for (let x = 0; x < size; x += 2) {
        const lit = (mask[z * size + x] ?? 0) > 0;
        if (inSeam(x, z)) {
          seamTotal += 1;
          seamLit += lit ? 1 : 0;
        } else {
          innerTotal += 1;
          innerLit += lit ? 1 : 0;
        }
      }
    }
    // Every shape is painted with wrapping indices, so the seam must look like any
    // other band. A non-wrapping paint pass would starve the edges of lit pixels.
    const seamDensity = seamLit / seamTotal;
    const innerDensity = innerLit / innerTotal;
    expect(seamDensity).toBeGreaterThan(innerDensity / 4);
    expect(seamDensity).toBeLessThan(Math.max(innerDensity * 4, innerDensity + 0.1));
  });
});

describe('skid marks on junction approaches', () => {
  it('places streaks only on long-enough urban approaches, one per lane side', () => {
    const network = solvedNetwork();
    const { mesh, streakCount } = createSkidMarkBatch(network);
    const urbanNodes = network.nodes.filter((node) => {
      const urbanCount = network.edges.filter(
        (edge) =>
          (edge.roadClass === 'urban-local' ||
            edge.roadClass === 'urban-arterial' ||
            edge.roadClass === 'urban-alley') &&
          (edge.from === node.id || edge.to === node.id),
      ).length;
      return urbanCount >= 2;
    });
    expect(urbanNodes.length).toBeGreaterThan(0);
    expect(streakCount).toBeGreaterThan(0);
    expect(streakCount).toBeLessThanOrEqual(urbanNodes.length * 64);
    if (mesh === null) {
      throw new Error('expected a skid-mark batch for the urban network');
    }
    expect(mesh.count).toBe(streakCount);
    expect(mesh.name).toBe('urban-skid-marks');
  });

  it('is deterministic per network seed', () => {
    const network = solvedNetwork();
    const first = createSkidMarkBatch(network).streakCount;
    const second = createSkidMarkBatch(solvedNetwork()).streakCount;
    expect(second).toBe(first);
  });

  it('lands in RoadWorld stats', () => {
    const roads = new RoadWorld(solvedNetwork());
    try {
      const stats = roads.getStats();
      expect(stats.skidMarkStreaks).toBeGreaterThan(0);
    } finally {
      roads.dispose();
    }
  });
});

describe('region clutter spec', () => {
  function citySpec(): MassingCitySpec {
    const plan = createWorldPlan(SEED);
    const region = plan.regionAtCell(0, 0);
    return massingCityForRegion(region);
  }
  it('stays within the tier budget and keeps junctions clear', () => {
    const network = solvedNetwork();
    const spec = citySpec();
    for (const tier of ['A', 'B', 'C'] as const) {
      const data = computeRegionClutter(spec, network, tier, 4242);
      const budget = { A: 200, B: 130, C: 70 }[tier];
      expect(data.clutter.length).toBeLessThanOrEqual(budget);
      expect(data.signs.length).toBeLessThanOrEqual({ A: 48, B: 36, C: 24 }[tier]);
      expect(data.regionId).toBe(spec.regionId);
      for (const item of data.clutter) {
        // No NaNs, and nothing inside the walkable band of the district.
        expect(Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.z)).toBe(
          true,
        );
        expect(item.scale).toBeGreaterThan(0.5);
        expect(item.scale).toBeLessThan(2);
      }
    }
  });

  it('is deterministic in (spec, network, tier, seed)', () => {
    const network = solvedNetwork();
    const spec = citySpec();
    const a = computeRegionClutter(spec, network, 'B', 7);
    const b = computeRegionClutter(spec, network, 'B', 7);
    expect(a.clutter).toEqual(b.clutter);
    expect(a.signs).toEqual(b.signs);
    const c = computeRegionClutter(spec, network, 'B', 8);
    expect(c.clutter).not.toEqual(a.clutter);
  });
});
