import { describe, expect, it } from 'vitest';
import {
  buildRaceRouteFromNetwork,
  buildRoute,
  pointAlongRoute,
  progressAlongRoute,
  straightRoute,
  type RaceRouteNetwork,
} from '../../src/most-wanted/BlacklistRoute';

/**
 * A tiny fake road network for the walker tests:
 *
 *   A(0,0) ── B(0,-100) ── C(0,-200) ── D(100,-200) ── E(200,-200)
 *                            │
 *                            F(0,-300)
 *
 * Every edge is a straight 100 m run.
 */
function fakeNetwork(): RaceRouteNetwork {
  const nodes = [
    { id: 'A', x: 0, z: 0 },
    { id: 'B', x: 0, z: -100 },
    { id: 'C', x: 0, z: -200 },
    { id: 'D', x: 100, z: -200 },
    { id: 'E', x: 200, z: -200 },
    { id: 'F', x: 0, z: -300 },
  ];
  const seg = (a: number, b: number, c: number, d: number) => [
    { x: a, z: b },
    { x: c, z: d },
  ];
  const edges = [
    { id: 'AB', from: 'A', to: 'B', points: seg(0, 0, 0, -100), lengthMeters: 100 },
    { id: 'BC', from: 'B', to: 'C', points: seg(0, -100, 0, -200), lengthMeters: 100 },
    { id: 'CD', from: 'C', to: 'D', points: seg(0, -200, 100, -200), lengthMeters: 100 },
    { id: 'DE', from: 'D', to: 'E', points: seg(100, -200, 200, -200), lengthMeters: 100 },
    { id: 'CF', from: 'C', to: 'F', points: seg(0, -200, 0, -300), lengthMeters: 100 },
  ];
  const adj: Record<string, string[]> = {
    A: ['B'],
    B: ['A', 'C'],
    C: ['B', 'D', 'F'],
    D: ['C', 'E'],
    E: ['D'],
    F: ['C'],
  };
  return {
    edges,
    nodes,
    neighboursOf: (id) => adj[id] ?? [],
    nodeById: (id) => nodes.find((n) => n.id === id) ?? null,
  };
}

describe('Most Wanted — Blacklist race route (M5b-1)', () => {
  it('buildRoute computes cumulative arc length and total length', () => {
    const route = buildRoute([
      { x: 0, z: 0 },
      { x: 0, z: -100 },
      { x: 0, z: -200 },
    ]);
    expect(route.lengthMeters).toBeCloseTo(200, 6);
    expect(route.cumulative).toEqual([0, 100, 200]);
  });

  it('buildRoute drops consecutive duplicate points', () => {
    const route = buildRoute([
      { x: 0, z: 0 },
      { x: 0, z: 0.0001 },
      { x: 0, z: 0 },
      { x: 0, z: -100 },
    ]);
    expect(route.points.length).toBe(2);
    expect(route.lengthMeters).toBeCloseTo(100, 6);
  });

  it('pointAlongRoute: 0 → start, 1 → finish, 0.5 → midpoint, forward yaw', () => {
    const route = buildRoute([
      { x: 0, z: 0 },
      { x: 0, z: -200 },
    ]);
    expect(pointAlongRoute(route, 0)).toMatchObject({ x: 0, z: 0, yaw: 0 });
    const end = pointAlongRoute(route, 1);
    expect(end.x).toBeCloseTo(0, 6);
    expect(end.z).toBeCloseTo(-200, 6);
    // forward (-sin0, -cos0) = (0,-1) — the direction of travel.
    expect(end.yaw).toBeCloseTo(0, 6);
    const mid = pointAlongRoute(route, 0.5);
    expect(mid.z).toBeCloseTo(-100, 6);
  });

  it('pointAlongRoute clamps the fraction into 0..1', () => {
    const route = buildRoute([
      { x: 0, z: 0 },
      { x: 0, z: -200 },
    ]);
    expect(pointAlongRoute(route, -5).z).toBeCloseTo(0, 6);
    expect(pointAlongRoute(route, 5).z).toBeCloseTo(-200, 6);
  });

  it('progressAlongRoute maps a point to its nearest arc-length fraction', () => {
    const route = buildRoute([
      { x: 0, z: 0 },
      { x: 0, z: -100 },
      { x: 0, z: -200 },
    ]);
    expect(progressAlongRoute(route, 0, 0)).toBeCloseTo(0, 6);
    expect(progressAlongRoute(route, 0, -50)).toBeCloseTo(0.25, 6);
    expect(progressAlongRoute(route, 0, -150)).toBeCloseTo(0.75, 6);
    expect(progressAlongRoute(route, 0, -200)).toBeCloseTo(1, 6);
    // 50 m off the centreline still maps to the nearest point on it (z=-50 → 0.25).
    expect(progressAlongRoute(route, 50, -50)).toBeCloseTo(0.25, 6);
  });

  it('buildRaceRouteFromNetwork walks forward from the player, continuing the heading', () => {
    // Start at A(0,0) heading -z: should run A→B→C→F (keeps going straight down, not onto D–E).
    const route = buildRaceRouteFromNetwork(fakeNetwork(), 0, 0, 300, { x: 0, z: -1 });
    expect(route.lengthMeters).toBeCloseTo(300, 6);
    // Ends at F (0,-300).
    const end = pointAlongRoute(route, 1);
    expect(end.x).toBeCloseTo(0, 4);
    expect(end.z).toBeCloseTo(-300, 4);
    // Begins at the player.
    expect(route.points[0]).toMatchObject({ x: 0, z: 0 });
  });

  it('buildRaceRouteFromNetwork turns with the heading (start at C heading +x → C→D→E)', () => {
    const route = buildRaceRouteFromNetwork(fakeNetwork(), 0, -200, 200, { x: 1, z: 0 });
    expect(route.lengthMeters).toBeCloseTo(200, 6);
    const end = pointAlongRoute(route, 1);
    expect(end.x).toBeCloseTo(200, 4);
    expect(end.z).toBeCloseTo(-200, 4);
  });

  it('buildRaceRouteFromNetwork stops at a dead end even if more length was requested', () => {
    // Only 300 m exist on the A→B→C→F branch; asking for 1000 m yields a 300 m route.
    const route = buildRaceRouteFromNetwork(fakeNetwork(), 0, 0, 1000, { x: 0, z: -1 });
    expect(route.lengthMeters).toBeCloseTo(300, 6);
  });

  it('straightRoute lays a line of the right length in the given direction', () => {
    const route = straightRoute(0, 0, { x: 0, z: -1 }, 600, 50);
    expect(route.lengthMeters).toBeCloseTo(600, 6);
    expect(pointAlongRoute(route, 1).z).toBeCloseTo(-600, 6);
    expect(progressAlongRoute(route, 0, -300)).toBeCloseTo(0.5, 6);
  });

  it('the player sits at progress 0 at the start of a generated route', () => {
    const route = buildRaceRouteFromNetwork(fakeNetwork(), 0, 0, 300, { x: 0, z: -1 });
    expect(progressAlongRoute(route, 0, 0)).toBeCloseTo(0, 6);
  });
});
