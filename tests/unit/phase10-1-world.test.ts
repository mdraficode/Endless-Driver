import { describe, expect, it } from 'vitest';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { createTerrainSampler } from '../../src/world/terrain-height';
import { buildRibbonGeometry } from '../../src/world/road-geometry';
import { plotSpotsForBlock, type BlockRect } from '../../src/world/urban-plots';
import { computeParkedPlacements } from '../../src/world/parked-traffic';
import { buildRoadLayout } from '../../src/world/road-layout';
import { createWorldPlan } from '../../src/world/world-plan';
import { buildRoadNetwork, type RoadEdge } from '../../src/world/road-network';

/**
 * Phase 10.1 contracts: country elevation stays deterministic and fades out around the city,
 * the ribbon banks toward the inside of corners, plots are stable functions of (cell, block),
 * and parked cars never block alleys or pass roads.
 */

const ARC_RADIUS = 50;

function makeArcEdge(roadClass: RoadEdge['roadClass']): RoadEdge {
  // A left-bowing arc (centre on the +z side): the inside of the corner is the profile's
  // "left" vertex, and the bank must lift that edge.
  const points = [];
  for (let i = 0; i <= 24; i += 1) {
    const theta = (i / 24) * (Math.PI / 2);
    const x = ARC_RADIUS * Math.sin(theta);
    const z = ARC_RADIUS * (1 - Math.cos(theta));
    points.push({ x, y: 0, z, alongMeters: i * 3 });
  }
  return {
    id: 'arc-test',
    from: 'a',
    to: 'b',
    roadClass,
    maxGrade: 0.1,
    halfWidthMeters: 5,
    shoulderMeters: 2,
    points,
    lengthMeters: 72,
  };
}

describe('country elevation (Phase 10.1)', () => {
  const config = { ...TERRAIN_CONFIG, seed: 20261102, elevationFadeCenter: [0, 0] as const };
  const flat = { ...config, elevationAmplitudeMeters: 0 };

  it('is bit-identical for the same seed', () => {
    const a = createTerrainSampler(config);
    const b = createTerrainSampler(config);
    for (let i = 0; i < 500; i += 1) {
      const x = (i % 40) * 487.3 - 9600;
      const z = Math.floor(i / 40) * 511.7 - 6000;
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
    }
  });

  it('fades to zero inside the city fade radius', () => {
    const withElevation = createTerrainSampler(config);
    const without = createTerrainSampler(flat);
    for (const [x, z] of [
      [100, 50],
      [-300, 200],
      [300, -300],
    ] as const) {
      expect(withElevation.heightAt(x, z)).toBe(without.heightAt(x, z));
    }
  });

  it('adds real relief beyond the fade radius', () => {
    const withElevation = createTerrainSampler(config);
    const without = createTerrainSampler(flat);
    let maxDelta = 0;
    for (let i = 0; i < 400; i += 1) {
      const angle = (i / 400) * Math.PI * 2;
      const radius = 3000 + 60 * Math.sin(i * 1.7);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      maxDelta = Math.max(
        maxDelta,
        Math.abs(withElevation.heightAt(x, z) - without.heightAt(x, z)),
      );
    }
    expect(maxDelta).toBeGreaterThan(8);
  });

  it('keeps the country below the alpine rockline outside the volcano', () => {
    const sampler = createTerrainSampler(config);
    for (let z = -18000; z <= 18000; z += 600) {
      for (let x = -18000; x <= 18000; x += 600) {
        const distanceToVolcano = Math.hypot(x + 1500, z + 2100);
        if (distanceToVolcano < 3000) {
          continue;
        }
        expect(sampler.heightAt(x, z)).toBeLessThan(TERRAIN_CONFIG.alpineRocklineMeters);
      }
    }
  });
});

describe('ribbon superelevation', () => {
  it('lifts the inside edge through a corner and caps the bank', () => {
    const geometry = buildRibbonGeometry(makeArcEdge('urban-arterial'), 10, 0.04);
    const positions = geometry.getAttribute('position');
    // Interior sample (away from the feathered ends): vertices 8..16 of the profile.
    let minSplit = Infinity;
    let maxSplit = -Infinity;
    for (let i = 8; i < 17; i += 1) {
      const left = positions.getY(i * 2);
      const right = positions.getY(i * 2 + 1);
      const split = left - right;
      minSplit = Math.min(minSplit, split);
      maxSplit = Math.max(maxSplit, split);
    }
    // This arc is a left turn for the profile, so the left edge carries the lift.
    expect(maxSplit).toBeGreaterThan(0.02);
    // The cap is 0.5 m total split (MAX_BANK), with feathering below it.
    expect(maxSplit).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(minSplit).toBeGreaterThan(-0.05);
  });

  it('stays level on a straight edge', () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      x: i * 10,
      y: 0,
      z: 0,
      alongMeters: i * 10,
    }));
    const edge: RoadEdge = {
      id: 'straight',
      from: 'a',
      to: 'b',
      roadClass: 'urban-arterial',
      maxGrade: 0.1,
      halfWidthMeters: 5,
      shoulderMeters: 2,
      points,
      lengthMeters: 190,
    };
    const geometry = buildRibbonGeometry(edge, 10, 0.04);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 1) {
      expect(positions.getY(i)).toBeCloseTo(0.04, 5);
    }
  });
});

describe('building plots', () => {
  const rect: BlockRect = { minX: 0, minZ: 0, maxX: 240, maxZ: 240 };

  it('is deterministic in (cell, block, seed)', () => {
    const a = plotSpotsForBlock(1, 2, 3, 4, rect, 999, 3.2);
    const b = plotSpotsForBlock(1, 2, 3, 4, rect, 999, 3.2);
    expect(a).toEqual(b);
    const c = plotSpotsForBlock(1, 2, 3, 4, rect, 1000, 3.2);
    expect(JSON.stringify(a) === JSON.stringify(c)).toBe(false);
  });

  it('places at most two lots per block with the curb on the street line', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const spots = plotSpotsForBlock(0, 0, seed % 8, Math.floor(seed / 8), rect, seed, 3.2);
      expect(spots.length).toBeGreaterThanOrEqual(0);
      expect(spots.length).toBeLessThanOrEqual(2);
      for (const spot of spots) {
        const onStreetLine =
          (Math.abs(spot.curbZ - rect.minZ) < 1e-6 &&
            spot.curbX >= rect.minX &&
            spot.curbX <= rect.maxX) ||
          (Math.abs(spot.curbZ - rect.maxZ) < 1e-6 &&
            spot.curbX >= rect.minX &&
            spot.curbX <= rect.maxX) ||
          (Math.abs(spot.curbX - rect.minX) < 1e-6 &&
            spot.curbZ >= rect.minZ &&
            spot.curbZ <= rect.maxZ) ||
          (Math.abs(spot.curbX - rect.maxX) < 1e-6 &&
            spot.curbZ >= rect.minZ &&
            spot.curbZ <= rect.maxZ);
        expect(onStreetLine).toBe(true);
        // The lot front sits inside the block, back from the curb.
        expect(spot.x).toBeGreaterThan(rect.minX);
        expect(spot.x).toBeLessThan(rect.maxX);
        expect(spot.z).toBeGreaterThan(rect.minZ);
        expect(spot.z).toBeLessThan(rect.maxZ);
      }
    }
  });
});

describe('parked traffic placement', () => {
  const plan = createWorldPlan(777);
  const layout = buildRoadLayout(plan);
  const network = buildRoadNetwork(
    layout.config,
    (x, z) => Math.sin(x * 0.001) * 4 + Math.cos(z * 0.001) * 3,
  );

  it('places cars on residential and arterial streets', () => {
    const placements = computeParkedPlacements(network, 777);
    expect(placements.length).toBeGreaterThan(50);
  });

  it('is deterministic per seed', () => {
    const a = computeParkedPlacements(network, 777);
    const b = computeParkedPlacements(network, 777);
    expect(a).toEqual(b);
  });

  it('never parks inside any drivable pavement, including alleys and the pass', () => {
    const placements = computeParkedPlacements(network, 777);
    expect(placements.length).toBeGreaterThan(0);
    for (const placement of placements) {
      const sample = network.sample(placement.x, placement.z);
      if (sample === null) {
        continue;
      }
      // Whatever road the car is closest to, it must clear that road's lanes.
      expect(sample.distance).toBeGreaterThanOrEqual(sample.halfWidthMeters + 0.2);
    }
  });
});

describe('variable routing layout', () => {
  it('adds residential streets, alleys and driveways to urban blocks', () => {
    const plan = createWorldPlan(20261102);
    const layout = buildRoadLayout(plan);
    const residential = layout.config.edges.filter((edge) => edge.halfWidthMeters === 2.2);
    const driveways = layout.config.edges.filter((edge) => edge.halfWidthMeters === 1.5);
    const alleys = layout.config.edges.filter(
      (edge) => edge.roadClass === 'urban-alley' && (edge.halfWidthMeters ?? 1.6) === 1.6,
    );
    expect(residential.length).toBeGreaterThan(20);
    expect(driveways.length).toBeGreaterThan(20);
    expect(alleys.length).toBeGreaterThan(5);
  });
});
