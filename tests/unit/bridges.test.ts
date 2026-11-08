import { describe, expect, it } from 'vitest';

import { terrainConfigForTier } from '../../src/config/terrain';
import { homeCityAnchor } from '../../src/world/city-content';
import { buildRoadLayout } from '../../src/world/road-layout';
import { buildRoadNetwork } from '../../src/world/road-network';
import type { RoadNetworkConfig } from '../../src/config/roads';
import { createWorldPlan, terrainSeedFor } from '../../src/world/world-plan';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';

/**
 * Phase 10 pass 2 — bridges, validated. A span is a run of profile points whose deck holds
 * well over a dozen metres above the natural ground: the solver grade-limits the crossing,
 * the carve keeps the ground under the deck, and the car rides the deck surface.
 */

const syntheticConfig: RoadNetworkConfig = {
  halfWidthMeters: 4,
  shoulderMeters: 2.4,
  blendWidthMeters: 30,
  // Tight spacing so the 80 m-wide notch resolves into several deck points.
  sampleSpacingMeters: 8,
  maxGrade: 0.15,
  nodes: [
    { id: 'n0', x: 0, z: 300 },
    { id: 'n1', x: 0, z: -300 },
  ],
  edges: [
    {
      from: 'n0',
      to: 'n1',
      roadClass: 'rural',
      maxGrade: 0.15,
      halfWidthMeters: 4,
      shoulderMeters: 2.4,
    },
  ],
};

/**
 * A 40 m-deep V-ravine along x at z = 0, 80 m wide — 100 % walls the 15 % grade cap cannot
 * follow, so the solver must hold a deck across it.
 */
const ravineHeightAt = (x: number, z: number): number => {
  const bump = 2 * Math.sin(x * 0.002) * Math.sin(z * 0.0015);
  const notch = 40 * Math.max(0, 1 - Math.abs(z) / 40);
  return 10 + bump - notch;
};

describe('bridge span detection (synthetic ravine)', () => {
  const network = buildRoadNetwork(syntheticConfig, ravineHeightAt);

  it('holds one decked span across the ravine with real clearance', () => {
    expect(network.bridgeSpans.length).toBe(1);
    const span = network.bridgeSpans[0]!;
    expect(span.points.length).toBeGreaterThanOrEqual(3);
    for (const point of span.points) {
      expect(point.y - point.baseY).toBeGreaterThan(12);
      expect(point.baseY).toBeLessThan(0);
    }
    // The deck is a held structure: nearly level across the crossing.
    const deckY = span.points.map((p) => p.y);
    expect(Math.max(...deckY) - Math.min(...deckY)).toBeLessThan(10);
  });

  it('obeys the grade cap on the approach and on the deck', () => {
    const edge = network.edges[0]!;
    for (let i = 1; i < edge.points.length; i += 1) {
      const p = edge.points[i - 1]!;
      const q = edge.points[i]!;
      const run = Math.hypot(q.x - p.x, q.z - p.z);
      if (run < 0.01) continue;
      expect(Math.abs(q.y - p.y) / run).toBeLessThanOrEqual(0.15 + 1e-6);
    }
  });

  it('samples onBridge only inside the span', () => {
    const span = network.bridgeSpans[0]!;
    const mid = span.points[Math.floor(span.points.length / 2)]!;
    const sample = network.sample(mid.x, mid.z);
    expect(sample).not.toBeNull();
    expect(sample!.onBridge).toBe(true);
    expect(sample!.elevation).toBeCloseTo(mid.y, 4);
    // Far from the ravine the road follows the ground cut — not a bridge.
    expect(network.sample(0, 280)?.onBridge).toBe(false);
  });

  it('is deterministic for the same base height', () => {
    const a = buildRoadNetwork(syntheticConfig, ravineHeightAt);
    const b = buildRoadNetwork(syntheticConfig, ravineHeightAt);
    expect(JSON.stringify(a.bridgeSpans)).toBe(JSON.stringify(b.bridgeSpans));
  });
});

describe('bridges in the generated world', () => {
  const seed = 20261102;
  const plan = createWorldPlan(seed);
  const anchor = homeCityAnchor(plan);
  const { config } = buildRoadLayout(plan);
  const terrainConfig = terrainConfigForTier('A', terrainSeedFor(seed));
  const worldSampler = createWorldTerrainSampler(terrainConfig, config, {
    x: anchor.x,
    z: anchor.z,
    flatRadiusMeters: anchor.flatRadiusMeters,
    blendRadiusMeters: anchor.blendRadiusMeters,
  });
  const network =
    worldSampler.roadNetwork ??
    (() => {
      throw new Error('world sampler must expose the road network used by terrain and physics');
    })();

  it('finds the real ravine crossings and keeps shallow bumps as causeways', () => {
    expect(network.bridgeSpans.length).toBeGreaterThan(0);
    for (const span of network.bridgeSpans) {
      for (const point of span.points) {
        // A bridge is a real ravine: the natural ground well under the deck, never a bump.
        expect(point.y - point.baseY).toBeGreaterThan(12);
        expect(point.y - point.baseY).toBeLessThan(180);
      }
      // Spans are continuous runs of the edge's solved profile.
      const edge = network.edges.find((e) => e.id === span.edgeId);
      expect(edge).toBeDefined();
      for (let i = 1; i < span.points.length; i += 1) {
        const p = span.points[i - 1]!;
        const q = span.points[i]!;
        expect(Math.abs(q.alongMeters - p.alongMeters)).toBeLessThanOrEqual(40);
      }
    }
  });

  it('rides the deck: the physics surface at a span is the solved deck height', () => {
    for (const span of network.bridgeSpans) {
      const mid = span.points[Math.floor(span.points.length / 2)]!;
      // On the pavement the carve keeps full influence — ground is the deck.
      expect(worldSampler.heightAt(mid.x, mid.z)).toBeCloseTo(mid.y, 1);
      // The shelf extends past the shoulder: a few metres out is still deck. The shelf
      // follows the local deck plane — for a flat crossing that is the span's height, and
      // for a long grade-limited ramp over a canyon wall it is the deck elevation of the
      // nearest centreline point (the carve samples the profile at the pavement edge).
      const dirX = span.points[span.points.length - 1]!.x - span.points[0]!.x;
      const dirZ = span.points[span.points.length - 1]!.z - span.points[0]!.z;
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = -dirZ / len;
      const nz = dirX / len;
      const d = span.halfWidthMeters + span.shoulderMeters + 2.5;
      const shelfX = mid.x + nx * d;
      const shelfZ = mid.z + nz * d;
      const shelfSample = network.sample(shelfX, shelfZ);
      expect(shelfSample).not.toBeNull();
      expect(worldSampler.heightAt(shelfX, shelfZ)).toBeCloseTo(shelfSample!.elevation, 1);
      // The centreline sample is flagged as deck so the carve applies the shelf.
      const lateral = network.sample(mid.x, mid.z);
      expect(lateral).not.toBeNull();
      expect(lateral!.onBridge).toBe(true);
    }
  });

  it('is deterministic across rebuilds', () => {
    const again = createWorldTerrainSampler(terrainConfig, config, {
      x: anchor.x,
      z: anchor.z,
      flatRadiusMeters: anchor.flatRadiusMeters,
      blendRadiusMeters: anchor.blendRadiusMeters,
    });
    expect(JSON.stringify(again.roadNetwork!.bridgeSpans)).toBe(
      JSON.stringify(network.bridgeSpans),
    );
  });
});
