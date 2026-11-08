import { describe, expect, it } from 'vitest';

import { createWorldPlan, terrainSeedFor } from '../../src/world/world-plan';
import { buildRoadLayout } from '../../src/world/road-layout';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { homeCityAnchor } from '../../src/world/city-content';
import { placeHideouts, hideoutPits } from '../../src/world/hideouts';
import { terrainConfigForTier } from '../../src/config/terrain';
import type { RoadNetwork } from '../../src/world/road-network';
import { buildTunnelCapGeometry, buildTunnelPortalGeometry } from '../../src/world/road-geometry';

/**
 * Phase 10 pass 3 — tunnels and overpasses: the world's biggest ridges carry a mainline
 * road under them (a capped tunnel with portal faces), and a seeded few flat arterial
 * crossings lift their through-street onto a deck over the other street. Contracts:
 * the dip is grade-feasible and clears a semi-trailer, the deck clears the street below
 * and ramps back down at grade, and both are deterministic per world seed.
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

/** A few metres of deck, never a canyon: overpass spans stay out of the bridge range. */
function overpassClearanceBounds(network: RoadNetwork): void {
  for (const span of network.overpassSpans) {
    let minClearance = Infinity;
    let maxClearance = 0;
    for (const point of span.points) {
      const clearance = point.y - point.baseY;
      minClearance = Math.min(minClearance, clearance);
      maxClearance = Math.max(maxClearance, clearance);
    }
    expect(maxClearance).toBeLessThan(12);
    expect(maxClearance).toBeGreaterThanOrEqual(5);
    expect(minClearance).toBeGreaterThan(2.9);
  }
}

describe('tunnels in the generated world', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: capped runs clear a semi-trailer, stay at grade, and fit the budget`, () => {
      const { network, heightAt } = buildGeneratedWorld(seed);
      // The world's biggest ridges tunnel; the rest keep the cut.
      expect(network.tunnelSpans.length).toBeLessThanOrEqual(8);
      expect(network.tunnelSpans.length).toBeGreaterThan(0);
      for (const span of network.tunnelSpans) {
        const edge = network.edges.find((candidate) => candidate.id === span.edgeId);
        expect(edge).toBeDefined();
        if (!edge) continue;
        // Spans are continuous runs of the edge's solved profile.
        for (let i = 1; i < span.points.length; i += 1) {
          const p = span.points[i - 1]!;
          const q = span.points[i]!;
          expect(Math.abs(q.alongMeters - p.alongMeters)).toBeLessThanOrEqual(40);
          // The floor stays inside the edge's grade budget (no wall at the ramp).
          const run = Math.hypot(q.x - p.x, q.z - p.z);
          if (run > 0.01) {
            expect(Math.abs(q.y - p.y) / run).toBeLessThanOrEqual(edge.maxGrade * 1.05 + 1e-6);
          }
        }
        // Every point of the capped run holds a semi-trailer (4 m) under the roof.
        for (const point of span.points) {
          expect(point.baseY - point.y).toBeGreaterThanOrEqual(4.45);
        }
        // The carve keeps the floor under the tyres: the physics surface is the profile.
        const mid = span.points[Math.floor(span.points.length / 2)]!;
        expect(heightAt(mid.x, mid.z)).toBeGreaterThanOrEqual(mid.y - 0.2);
        expect(heightAt(mid.x, mid.z)).toBeLessThanOrEqual(mid.y + 0.05);
      }
    });

    it(`seed ${seed}: tunnel spans are deterministic`, () => {
      const first = buildGeneratedWorld(seed).network.tunnelSpans;
      const second = buildGeneratedWorld(seed).network.tunnelSpans;
      expect(second.length).toBe(first.length);
      for (let i = 0; i < first.length; i += 1) {
        const a = first[i]!;
        const b = second[i]!;
        expect(b.edgeId).toBe(a.edgeId);
        expect(b.points.length).toBe(a.points.length);
        for (let j = 0; j < a.points.length; j += 1) {
          expect(b.points[j]!.y).toBe(a.points[j]!.y);
          expect(b.points[j]!.x).toBe(a.points[j]!.x);
        }
      }
    });
  }
});

describe('overpasses in the generated world', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: the lifted street clears the street below and ramps back at grade`, () => {
      const { network } = buildGeneratedWorld(seed);
      expect(network.overpassEdgeIds.size).toBeGreaterThan(0);
      expect(network.overpassSpans.length).toBeGreaterThan(0);
      // A few crossings at most, and the spans stay out of the ravine-bridge range.
      expect(network.overpassSpans.length).toBeLessThanOrEqual(4);
      overpassClearanceBounds(network);

      // The deck crosses its junction above the street that keeps the junction elevation,
      // and both deck and ramps stay inside the lifted edge's grade budget.
      const nodes = new Map(network.nodes.map((node) => [node.id, node]));
      for (const edge of network.edges) {
        if (!network.overpassEdgeIds.has(edge.id)) continue;
        const fromNode = nodes.get(edge.from);
        const toNode = nodes.get(edge.to);
        if (!fromNode || !toNode) continue;
        const fromDelta = edge.points[0]!.y - fromNode.y;
        const toDelta = edge.points[edge.points.length - 1]!.y - toNode.y;
        // Exactly one end crosses the junction on the deck; the other stays pinned.
        const deckDelta = Math.max(fromDelta, toDelta);
        const otherDelta = Math.min(fromDelta, toDelta);
        expect(deckDelta).toBeGreaterThanOrEqual(4);
        expect(deckDelta).toBeLessThanOrEqual(7);
        expect(Math.abs(otherDelta)).toBeLessThan(0.05);
        // Grade across the whole lifted edge, deck and ramps included.
        for (let i = 1; i < edge.points.length; i += 1) {
          const p = edge.points[i - 1]!;
          const q = edge.points[i]!;
          const run = Math.hypot(q.x - p.x, q.z - p.z);
          if (run < 0.01) continue;
          expect(Math.abs(q.y - p.y) / run).toBeLessThanOrEqual(edge.maxGrade * 1.05 + 1e-6);
        }
      }
    });

    it(`seed ${seed}: overpass picks and decks are deterministic`, () => {
      const first = buildGeneratedWorld(seed).network;
      const second = buildGeneratedWorld(seed).network;
      expect(second.overpassEdgeIds.size).toBe(first.overpassEdgeIds.size);
      for (const id of first.overpassEdgeIds) {
        expect(second.overpassEdgeIds.has(id)).toBe(true);
      }
      expect(second.overpassSpans.length).toBe(first.overpassSpans.length);
      for (let i = 0; i < first.overpassSpans.length; i += 1) {
        const a = first.overpassSpans[i]!;
        const b = second.overpassSpans[i]!;
        expect(b.edgeId).toBe(a.edgeId);
        expect(b.points.length).toBe(a.points.length);
        for (let j = 0; j < a.points.length; j += 1) {
          expect(b.points[j]!.y).toBe(a.points[j]!.y);
        }
      }
    });
  }
});

describe('tunnel cap and portal geometry', () => {
  // A synthetic span: 10 points along +x, floor at y=0, natural ground 8 m above.
  const makeSpan = (overrides?: { baseY?: number; blendWidthMeters?: number }) => {
    const points = [];
    for (let i = 0; i < 10; i += 1) {
      points.push({
        x: i * 10,
        z: 0,
        y: 0,
        alongMeters: i * 10,
        baseY: overrides?.baseY ?? 8,
      });
    }
    return {
      edgeId: 'cap-test',
      roadClass: 'urban-arterial' as const,
      halfWidthMeters: 2.75,
      shoulderMeters: 2.2,
      blendWidthMeters: overrides?.blendWidthMeters ?? 30,
      points,
    };
  };

  it('caps the span at the natural height over the full influence footprint', () => {
    const span = makeSpan();
    const cap = buildTunnelCapGeometry(span);
    expect(cap).not.toBeNull();
    if (cap === null) return;
    const position = cap.getAttribute('position');
    const color = cap.getAttribute('color');
    expect(position).not.toBeNull();
    expect(color).not.toBeNull();
    if (position === null || color === null) return;
    expect(position.count).toBe(span.points.length * 2);
    expect(color.count).toBe(span.points.length * 2);
    // The sheet sits at the natural ground height, laterally out to the blend edge.
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      expect(y).toBeCloseTo(8 + 0.12, 5);
      expect(Math.abs(z)).toBeCloseTo(2.75 + 2.2 + 30, 5);
    }
  });

  it('frames the mouth with concrete, and only when the dip is deep enough', () => {
    const deep = buildTunnelPortalGeometry(makeSpan({ baseY: 8 }));
    expect(deep.concrete).not.toBeNull();
    expect(deep.lamps).not.toBeNull();
    if (deep.concrete !== null) {
      const position = deep.concrete.getAttribute('position');
      expect(position).not.toBeNull();
      if (position !== null) {
        for (let i = 0; i < position.count; i += 1) {
          expect(Number.isFinite(position.getY(i))).toBe(true);
        }
      }
    }
    // A shallow dip (1.5 m) has no mouth to frame.
    const shallow = buildTunnelPortalGeometry(makeSpan({ baseY: 1.5 }));
    expect(shallow.concrete).toBeNull();
    expect(shallow.lamps).toBeNull();
  });

  it('degrades gracefully on degenerate spans', () => {
    const onePoint = makeSpan();
    expect(buildTunnelCapGeometry({ ...onePoint, points: [onePoint.points[0]!] })).toBeNull();
  });
});
