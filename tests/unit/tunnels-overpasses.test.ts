import { describe, expect, it } from 'vitest';

import { createWorldPlan, terrainSeedFor } from '../../src/world/world-plan';
import { buildRoadLayout } from '../../src/world/road-layout';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { homeCityAnchor } from '../../src/world/city-content';
import { placeHideouts, hideoutPits } from '../../src/world/hideouts';
import { terrainConfigForTier } from '../../src/config/terrain';
import type { RoadNetwork } from '../../src/world/road-network';
import {
  buildTunnelCapGeometry,
  buildTunnelPortalGeometry,
  buildDeckBellyGeometry,
} from '../../src/world/road-geometry';
import { RoadWorld } from '../../src/world/RoadWorld';

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
    const cover = 2.75 + 2.2 + (overrides?.blendWidthMeters ?? 30);
    const baseY = overrides?.baseY ?? 8;
    const points = [];
    for (let i = 0; i < 10; i += 1) {
      points.push({
        x: i * 10,
        z: 0,
        y: 0,
        alongMeters: i * 10,
        baseY,
        leftX: i * 10,
        leftZ: -cover,
        leftY: baseY,
        rightX: i * 10,
        rightZ: cover,
        rightY: baseY,
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
    // Cap rows (one per point, two edge vertices) plus one cut-face bottom row per
    // mouth (depth 8 m is in the [0.5, 12] m face range, so both mouths get a face).
    expect(position.count).toBe(span.points.length * 2 + 4);
    expect(color.count).toBe(span.points.length * 2 + 4);
    // The sheet sits at the natural ground height, laterally out to the blend edge.
    for (let i = 0; i < span.points.length * 2; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      expect(y).toBeCloseTo(8 + 0.12, 5);
      expect(Math.abs(z)).toBeCloseTo(2.75 + 2.2 + 30, 5);
    }
    // The cut-face bottom rows land at the road, sealing the mouth down to the floor.
    for (let i = span.points.length * 2; i < position.count; i += 1) {
      expect(position.getY(i)).toBeCloseTo(-0.15, 5);
      expect(Math.abs(position.getZ(i))).toBeCloseTo(2.75 + 2.2 + 30, 5);
    }
  });

  it('no cut face or frame where the mouth is a cliff (depth beyond 12 m)', () => {
    const cliff = makeSpan({ baseY: 50 });
    const cap = buildTunnelCapGeometry(cliff);
    expect(cap).not.toBeNull();
    if (cap !== null) {
      const position = cap.getAttribute('position');
      expect(position).not.toBeNull();
      // Only the cap rows — no bottom rows for the 50 m cliff mouths.
      expect(position!.count).toBe(cliff.points.length * 2);
    }
    const portal = buildTunnelPortalGeometry(cliff);
    expect(portal.concrete).toBeNull();
    expect(portal.lamps).toBeNull();
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

type BarriersMesh = {
  geometry: {
    getAttribute(n: string): {
      count: number;
      getX(i: number): number;
      getY(i: number): number;
      getZ(i: number): number;
    } | null;
  };
};

describe('tunnel cap and overpass structure (world-level regression)', () => {
  // Owner device report: tunnel caps floated in the air and ended in a sky gap at the
  // mouth, cliff mouths grew needle portals, and overpass decks read as floating sheets
  // (no underside, centreline piers standing in the road below). These pin the fixes.

  it('every cap edge sits on the visible (carved) terrain — no floating seam', () => {
    for (const seed of SEEDS) {
      const { network, heightAt } = buildGeneratedWorld(seed);
      for (const span of network.tunnelSpans) {
        const cap = buildTunnelCapGeometry(span);
        expect(cap, `cap for ${span.edgeId}`).not.toBeNull();
        if (cap === null) continue;
        const position = cap.getAttribute('position');
        expect(position).not.toBeNull();
        if (position === null) continue;
        // Every cap ROW vertex must sit at or just above the visible ground under it:
        // the cap rebuilds the surface, it does not hover over it. (The cut-face bottom
        // vertices sit at the road level, buried in the hillside by design.)
        for (let i = 0; i < span.points.length * 2; i += 1) {
          const x = position.getX(i);
          const y = position.getY(i);
          const z = position.getZ(i);
          const ground = heightAt(x, z);
          expect(
            y - ground,
            `vertex ${i} of ${span.edgeId} floats ${y - ground} m`,
          ).toBeLessThanOrEqual(0.35);
          expect(
            y - ground,
            `vertex ${i} of ${span.edgeId} is sunk below the ground`,
          ).toBeGreaterThanOrEqual(-0.3);
        }
      }
    }
  });

  it('cliff mouths get rock, not concrete: no frame or lamps beyond 12 m depth', () => {
    let deepMouthsSeen = 0;
    for (const seed of SEEDS) {
      const { network } = buildGeneratedWorld(seed);
      for (const span of network.tunnelSpans) {
        const depthA = span.points[0]!.baseY - span.points[0]!.y;
        const depthB =
          span.points[span.points.length - 1]!.baseY - span.points[span.points.length - 1]!.y;
        const portal = buildTunnelPortalGeometry(span);
        const bothCliff = depthA > 12 && depthB > 12;
        const mixed =
          (depthA > 12 && depthB >= 2 && depthB <= 12) ||
          (depthB > 12 && depthA >= 2 && depthA <= 12);
        if (depthA > 12 || depthB > 12) deepMouthsSeen += 1;
        if (bothCliff) {
          expect(portal.concrete, `${span.edgeId} cliff frame`).toBeNull();
          expect(portal.lamps, `${span.edgeId} cliff lamps`).toBeNull();
        }
        if (mixed) {
          // The hill mouth may still carry its frame; the cliff mouth must not.
          expect(portal.concrete, `${span.edgeId} hill mouth frame`).not.toBeNull();
        }
      }
    }
    // Phase 11.2: terrain-following routes hug the ground, so full-cliff (both mouths
    // > 12 m) crossings are rare — but the audited seeds still carry at least one
    // deep mouth, which exercises the rock-not-concrete path.
    expect(deepMouthsSeen).toBeGreaterThanOrEqual(1);
  });

  it('overpass decks have a concrete underside and edge piers (no centreline piers)', () => {
    for (const seed of SEEDS) {
      const { network } = buildGeneratedWorld(seed);
      expect(network.overpassSpans.length).toBeGreaterThan(0);
      const world = new RoadWorld(network);
      let barriers: BarriersMesh | undefined;
      world.object.traverse((object) => {
        if (object.name === 'concrete-barriers') {
          barriers = object as unknown as BarriersMesh;
        }
      });
      expect(barriers).toBeDefined();
      if (barriers === undefined) return;
      const position = barriers.geometry.getAttribute('position');
      expect(position).not.toBeNull();
      if (position === null) return;
      // Spatial hash of the concrete batch so the pier lookups stay O(1) per column.
      const CELL = 4;
      const buckets = new Map<string, number[]>();
      for (let i = 0; i < position.count; i += 1) {
        const key = `${Math.floor(position.getX(i) / CELL)}:${Math.floor(position.getZ(i) / CELL)}`;
        const list = buckets.get(key);
        if (list === undefined) buckets.set(key, [i]);
        else list.push(i);
      }
      const nearVertex = (ex: number, ez: number, test: (vy: number) => boolean): boolean => {
        const cx = Math.floor(ex / CELL);
        const cz = Math.floor(ez / CELL);
        for (let ox = -1; ox <= 1; ox += 1) {
          for (let oz = -1; oz <= 1; oz += 1) {
            const list = buckets.get(`${cx + ox}:${cz + oz}`);
            if (list === undefined) continue;
            for (const i of list) {
              if (
                Math.abs(position.getX(i) - ex) < 1.4 &&
                Math.abs(position.getZ(i) - ez) < 1.4 &&
                test(position.getY(i))
              ) {
                return true;
              }
            }
          }
        }
        return false;
      };

      for (const span of network.overpassSpans) {
        // The belly: one downward-facing strip under the whole span.
        const belly = buildDeckBellyGeometry(
          span.points,
          span.halfWidthMeters,
          span.shoulderMeters,
        );
        expect(belly, `belly for ${span.edgeId}`).not.toBeNull();
        if (belly !== null) {
          const normal = belly.getAttribute('normal');
          expect(normal).not.toBeNull();
          if (normal !== null) {
            for (let i = 0; i < normal.count; i += 1) {
              expect(normal.getY(i), 'belly normal must face the valley').toBeLessThanOrEqual(0.05);
            }
          }
        }
        // The piers: expected columns at the deck edges exist in the concrete batch,
        // and nothing was built on the centreline.
        const pierOffset = span.halfWidthMeters + span.shoulderMeters - 1.2;
        const spanLength =
          span.points[span.points.length - 1]!.alongMeters - span.points[0]!.alongMeters;
        const pierCount = Math.max(2, Math.ceil(spanLength / 20) + 1);
        for (let p = 0; p < pierCount; p += 1) {
          const along = span.points[0]!.alongMeters + (spanLength * (p + 0.5)) / pierCount;
          let nearest = span.points[0]!;
          let nearestIndex = 0;
          span.points.forEach((point, index) => {
            if (Math.abs(point.alongMeters - along) < Math.abs(nearest.alongMeters - along)) {
              nearest = point;
              nearestIndex = index;
            }
          });
          const topY = nearest.y;
          const bottomY = nearest.baseY - 0.8;
          if (topY - bottomY < 2 || topY - bottomY > 25) continue;
          const prev = span.points[Math.max(0, nearestIndex - 1)]!;
          const next = span.points[Math.min(span.points.length - 1, nearestIndex + 1)]!;
          const runX = next.x - prev.x;
          const runZ = next.z - prev.z;
          const runLength = Math.hypot(runX, runZ) || 1;
          const nx = -runZ / runLength;
          const nz = runX / runLength;
          const inColumn = (vy: number): boolean =>
            vy > bottomY + (topY - bottomY) * 0.4 && vy < topY + 0.3;
          for (const sideSign of [-1, 1] as const) {
            const ex = nearest.x + nx * pierOffset * sideSign;
            const ez = nearest.z + nz * pierOffset * sideSign;
            expect(
              nearVertex(ex, ez, inColumn),
              `edge pier at (${ex.toFixed(1)}, ${ez.toFixed(1)}) for ${span.edgeId}`,
            ).toBe(true);
          }
          expect(
            nearVertex(nearest.x, nearest.z, inColumn),
            `no centreline pier at (${nearest.x.toFixed(1)}, ${nearest.z.toFixed(1)}) for ${span.edgeId}`,
          ).toBe(false);
        }
      }
    }
  }, 60000);
});
