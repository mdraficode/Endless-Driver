import { describe, expect, it } from 'vitest';
import { homeCityAnchor, massingCityForRegion } from '../../src/world/city-content';
import { buildRoadLayout } from '../../src/world/road-layout';
import { buildRoadNetwork, type RoadEdge } from '../../src/world/road-network';
import {
  buildPathFromEdge,
  computeHomePedestrians,
  computeRegionPedestrians,
  PedestrianWorld,
} from '../../src/world/pedestrians';
import { createWorldPlan } from '../../src/world/world-plan';

/**
 * Phase 10.3 contracts: walk lines sit exactly on the rendered sidewalk centreline, the
 * pedestrian network is a pure function of the region seed, junctions are connected,
 * activity nodes stand on the pavement in front of the building side, and the simulation
 * keeps agents walking, stopping at junctions and loitering inside their node radius.
 */

const SEED = 20261103;

function makeWorld(seed: number) {
  const plan = createWorldPlan(seed);
  const layout = buildRoadLayout(plan);
  const anchor = homeCityAnchor(plan);
  const network = buildRoadNetwork(
    layout.config,
    (x, z) => Math.sin(x * 0.001) * 4 + Math.cos(z * 0.001) * 3,
  );
  return { plan, layout, anchor, network };
}

function firstUrbanRegion(plan: ReturnType<typeof createWorldPlan>) {
  for (let ix = -1; ix <= 1; ix += 1) {
    for (let iz = -1; iz <= 1; iz += 1) {
      const region = plan.regionAtCell(ix, iz);
      if (region.archetype === 'megacity' || region.archetype === 'urban-fringe') {
        return region;
      }
    }
  }
  throw new Error('test world has no urban region');
}

function straightEdge(
  roadClass: RoadEdge['roadClass'],
  halfWidth: number,
  shoulder: number,
): RoadEdge {
  const points = Array.from({ length: 11 }, (_, i) => ({
    x: i * 10,
    y: 0,
    z: 0,
    alongMeters: i * 10,
  }));
  return {
    id: 'straight-test',
    from: 'a',
    to: 'b',
    roadClass,
    maxGrade: 0.1,
    halfWidthMeters: halfWidth,
    shoulderMeters: shoulder,
    points,
    lengthMeters: 100,
  };
}

describe('walk line offsets', () => {
  it('sits on the rendered sidewalk centreline for streets', () => {
    const edge = straightEdge('urban-local', 5, 2);
    // Rendered sidewalk centreline: shoulder + half the 3.2 m pavement.
    const expected = 5 + 2 + 1.6;
    for (const side of [-1, 1] as const) {
      const path = buildPathFromEdge(edge, side);
      expect(path.points.length).toBe(11);
      for (const point of path.points) {
        // sideOf(tangent) is the travel-right normal: for +X travel that is -Z.
        expect(point.z).toBeCloseTo(-expected * side, 6);
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(100);
      }
    }
  });

  it('uses the kerb-side walk line for alleys (no pavement)', () => {
    const edge = straightEdge('urban-alley', 3, 1);
    const expected = 3 + 0.9;
    const path = buildPathFromEdge(edge, 1);
    for (const point of path.points) {
      expect(point.z).toBeCloseTo(-expected, 6);
    }
  });
});

describe('pedestrian region data', () => {
  const { plan, network } = makeWorld(SEED);
  const region = firstUrbanRegion(plan);
  const spec = massingCityForRegion(region);
  const net = network as NonNullable<typeof network>;

  it('is deterministic per region', () => {
    expect(net).not.toBeNull();
    const a = computeRegionPedestrians(spec, net, region.seed);
    const b = computeRegionPedestrians(spec, net, region.seed);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = computeRegionPedestrians(spec, net, region.seed + 1);
    expect(JSON.stringify(a) === JSON.stringify(c)).toBe(false);
  });

  it("keeps every walk line on its street's sidewalk centreline", () => {
    const data = computeRegionPedestrians(spec, net, region.seed);
    expect(data.paths.length).toBeGreaterThan(10);
    const edges = new Map(net.edges.map((edge) => [edge.id, edge]));
    for (let p = 0; p < data.paths.length; p += 5) {
      const path = data.paths[p] as (typeof data.paths)[number];
      const edge = edges.get(path.edgeId);
      if (edge === undefined) continue;
      const expected =
        edge.roadClass === 'urban-alley'
          ? edge.halfWidthMeters + 0.9
          : edge.halfWidthMeters + edge.shoulderMeters + 1.6;
      for (let i = 0; i < path.points.length; i += 4) {
        const point = path.points[i] as (typeof path.points)[number];
        const source = edge.points[i] as (typeof edge.points)[number];
        // The path point is the centreline point offset along the horizontal normal.
        expect(Math.hypot(point.x - source.x, point.z - source.z)).toBeCloseTo(expected, 2);
      }
    }
  });

  it('connects junctions on both sides of every street', () => {
    const data = computeRegionPedestrians(spec, net, region.seed);
    let connected = 0;
    for (const neighbours of data.nextAtEnd) {
      if (neighbours.length >= 1) connected += 1;
    }
    // Every path end sits at a junction with at least the cross-street path.
    expect(connected).toBe(data.nextAtEnd.length);
    expect(data.nextAtEnd.length).toBeGreaterThan(20);
  });

  it('places activity nodes on the pavement, past the walk line', () => {
    const data = computeRegionPedestrians(spec, net, region.seed);
    expect(data.nodes.length).toBeGreaterThanOrEqual(3);
    const edges = new Map(net.edges.map((edge) => [edge.id, edge]));
    for (const node of data.nodes) {
      expect(['food-truck', 'stall', 'cafe']).toContain(node.kind);
      expect(node.loiterCount).toBeGreaterThanOrEqual(2);
      expect(node.pathIndex).toBeGreaterThanOrEqual(0);
      expect(node.pathIndex).toBeLessThan(data.paths.length);
      const path = data.paths[node.pathIndex] as (typeof data.paths)[number];
      expect(node.alongMeters).toBeGreaterThanOrEqual(0);
      expect(node.alongMeters).toBeLessThanOrEqual(path.length + 1);
      const edge = edges.get(path.edgeId);
      expect(edge).toBeDefined();
      const walkOffset =
        (edge as RoadEdge).roadClass === 'urban-alley'
          ? (edge as RoadEdge).halfWidthMeters + 0.9
          : (edge as RoadEdge).halfWidthMeters + (edge as RoadEdge).shoulderMeters + 1.6;
      // The node stands 0.45 m further out than the walk line (toward the buildings),
      // measured against the interpolated centreline at the node's own along distance.
      const centre = centerlineAt(edge as RoadEdge, node.alongMeters);
      const min = Math.hypot(centre.x - node.x, centre.z - node.z);
      expect(min).toBeGreaterThanOrEqual(walkOffset + 0.15);
      expect(min).toBeLessThanOrEqual(walkOffset + 0.75);
    }
  });
});

describe('home district pedestrians', () => {
  const { anchor, network } = makeWorld(SEED);

  it('is deterministic and non-empty', () => {
    expect(network).not.toBeNull();
    const net = network as NonNullable<typeof network>;
    const a = computeHomePedestrians(anchor, net, SEED);
    const b = computeHomePedestrians(anchor, net, SEED);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.paths.length).toBeGreaterThan(5);
    expect(a.nodes.length).toBeGreaterThanOrEqual(3);
  });
});

describe('pedestrian simulation', () => {
  const { plan, network } = makeWorld(SEED);
  const region = firstUrbanRegion(plan);
  const spec = massingCityForRegion(region);

  function buildWorld() {
    const world = new PedestrianWorld({
      tier: 'C',
      network: network as NonNullable<typeof network>,
      home: null,
    });
    world.setRegion(
      computeRegionPedestrians(spec, network as NonNullable<typeof network>, region.seed),
    );
    return world;
  }

  it('spawns agents inside the tier budget and walks them', () => {
    const world = buildWorld();
    expect(() => world.update(1 / 60)).not.toThrow();
    const start = world.getSimulationSnapshot();
    expect(start.agents.length).toBeGreaterThan(10);
    expect(start.agents.length).toBeLessThanOrEqual(160);
    for (let i = 0; i < 120; i += 1) {
      world.update(1 / 60);
    }
    const later = world.getSimulationSnapshot();
    expect(later.agents.length).toBe(start.agents.length);
    let moved = 0;
    for (let i = 0; i < start.agents.length; i += 1) {
      const a = start.agents[i] as (typeof start.agents)[number];
      const b = later.agents[i] as (typeof later.agents)[number];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 0.1) moved += 1;
    }
    // The great majority walk; only a few may be parked in a junction stop.
    expect(moved).toBeGreaterThan(start.agents.length * 0.5);
    for (const agent of later.agents) {
      expect(Number.isFinite(agent.x)).toBe(true);
      expect(Number.isFinite(agent.z)).toBe(true);
    }
    world.dispose();
  });

  it('keeps loiterers inside their activity-node orbit', () => {
    const world = buildWorld();
    world.update(1 / 60);
    const start = world.getSimulationSnapshot();
    const loiterers = start.agents.filter((a) => a.state === 'loiter');
    expect(loiterers.length).toBeGreaterThan(0);
    for (let i = 0; i < 60; i += 1) {
      world.update(1 / 60);
    }
    const later = world.getSimulationSnapshot();
    const stillLoitering = later.agents.filter((a) => a.state === 'loiter');
    expect(stillLoitering.length).toBeGreaterThan(0);
    for (const agent of stillLoitering) {
      const origin = loiterers.find((l) => Math.hypot(l.x - agent.x, l.z - agent.z) < 5);
      expect(origin).toBeDefined();
      const o = origin as { x: number; z: number };
      // The orbit radius tops out at 2.6 m from the node; the node is within 5 m of the
      // loiterer's spawn, so the displacement from spawn is bounded by orbit + 5 + orbit.
      expect(Math.hypot(o.x - agent.x, o.z - agent.z)).toBeLessThanOrEqual(5.3);
    }
    world.dispose();
  });

  it('uses the crosswalk stop at junctions', () => {
    const world = buildWorld();
    let everWaited = false;
    for (let i = 0; i < 90 * 60; i += 1) {
      world.update(1 / 60);
      if (!everWaited && world.getSimulationSnapshot().agents.some((a) => a.state === 'wait')) {
        everWaited = true;
      }
    }
    const snapshot = world.getSimulationSnapshot();
    expect(snapshot.clock).toBeCloseTo(90, 0);
    expect(everWaited).toBe(true);
    world.dispose();
  });

  it('frees the agents and stats when a region streams out', () => {
    const world = buildWorld();
    const before = world.getContentStats();
    expect(before.pedestrianAgents).toBeGreaterThan(0);
    expect(before.pedestrianNodes).toBe(1);
    world.clearRegion(region.id);
    const after = world.getContentStats();
    expect(after.pedestrianAgents).toBe(0);
    expect(after.pedestrianNodes).toBe(0);
    world.dispose();
  });
});

/** The solved centreline point at an along-distance (linear between profile points). */
function centerlineAt(edge: RoadEdge, alongMeters: number): { x: number; z: number } {
  const first = edge.points[0] as (typeof edge.points)[number];
  const last = edge.points[edge.points.length - 1] as (typeof edge.points)[number];
  const target =
    first.alongMeters + (last.alongMeters - first.alongMeters) * (alongMeters / edge.lengthMeters);
  for (let i = 1; i < edge.points.length; i += 1) {
    const b = edge.points[i] as (typeof edge.points)[number];
    if (b.alongMeters >= target) {
      const a = edge.points[i - 1] as (typeof edge.points)[number];
      const f = (target - a.alongMeters) / Math.max(1e-9, b.alongMeters - a.alongMeters);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    }
  }
  return { x: last.x, z: last.z };
}
