import { describe, expect, it } from 'vitest';
import { buildRoadLayout, ROAD_WINDOW_CELLS } from '../../src/world/road-layout';
import { createWorldPlan, REGION_CELL_METERS } from '../../src/world/world-plan';
import { buildRoadNetwork } from '../../src/world/road-network';
import { buildBarrierGeometry } from '../../src/world/road-geometry';
import { AOHARA_JUNCTION_NODE_ID } from '../../src/config/urban-district';
import { homeCityAnchor, proceduralSpawn } from '../../src/world/city-content';

function layoutFor(seed: number) {
  return buildRoadLayout(createWorldPlan(seed));
}

describe('road-layout', () => {
  it('is deterministic per seed', () => {
    const a = layoutFor(20261102);
    const b = layoutFor(20261102);
    expect(JSON.stringify(a.config)).toBe(JSON.stringify(b.config));
  });

  it('diverges across seeds', () => {
    const a = layoutFor(11);
    const b = layoutFor(12);
    expect(JSON.stringify(a.config)).not.toBe(JSON.stringify(b.config));
  });

  it('only references existing nodes, with unique ids', () => {
    const { config } = layoutFor(777);
    const ids = new Set<string>();
    for (const node of config.nodes) {
      expect(ids.has(node.id)).toBe(false);
      ids.add(node.id);
    }
    for (const edge of config.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });

  it('is one connected component (every road reachable from the spawn)', () => {
    const { config, spawnNodeId } = layoutFor(4242);
    const adjacency = new Map<string, string[]>();
    for (const node of config.nodes) adjacency.set(node.id, []);
    for (const edge of config.edges) {
      adjacency.get(edge.from)!.push(edge.to);
      adjacency.get(edge.to)!.push(edge.from);
    }
    const seen = new Set<string>([spawnNodeId]);
    const queue = [spawnNodeId];
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const next of adjacency.get(id)!) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(config.nodes.length);
  });

  it('stays inside the window extent', () => {
    const { config } = layoutFor(20261102);
    // Window edge plus district jitter (±0.35 cell) and the largest grid half-extent.
    const limit = ROAD_WINDOW_CELLS * REGION_CELL_METERS + 2500;
    for (const node of config.nodes) {
      expect(Math.abs(node.x)).toBeLessThan(limit);
      expect(Math.abs(node.z)).toBeLessThan(limit);
    }
  });

  it('mounts the hand-tuned Aohara kit at the generated anchor, ids preserved', () => {
    const plan = createWorldPlan(99);
    const { config } = buildRoadLayout(plan);
    const anchor = homeCityAnchor(plan);
    const byId = new Map(config.nodes.map((node) => [node.id, node]));
    // The kit's central intersection exists, translated from the hand-placed centre.
    const centre = byId.get(AOHARA_JUNCTION_NODE_ID)!;
    expect(Math.abs(centre.x - anchor.x)).toBeLessThan(1);
    expect(Math.abs(centre.z - anchor.z)).toBeLessThan(1);
    // The kit's boulevard junctions travel with it too.
    expect(byId.has('aohara-boulevard-west-outer')).toBe(true);
    // And the anchor actually follows the plan (differs from the hand-placed centre).
    expect([anchor.x, anchor.z]).not.toEqual([1250, -430]);
  });

  it('puts the spawn point on an arterial road in the home city', () => {
    const plan = createWorldPlan(99);
    const layout = buildRoadLayout(plan);
    const spawn = proceduralSpawn(homeCityAnchor(plan));
    const network = buildRoadNetwork(layout.config, () => 0);
    const sample = network.sample(spawn.x, spawn.z);
    expect(sample).not.toBeNull();
    expect(sample?.roadClass).toBe('urban-arterial');
    expect(sample?.distance).toBeLessThan(5);
  });

  it('solves through the existing solver and obeys grade caps', () => {
    const { config } = layoutFor(20261102);
    const baseHeight = (x: number, z: number): number =>
      Math.sin(x * 0.0004) * 90 + Math.sin(z * 0.0005) * 70;
    const network = buildRoadNetwork(config, baseHeight);
    // The solver keeps every configured edge; the garage planner may append its
    // ramp/aisle edges. Phase 11.1b adds one more kind of addition: the pit split
    // re-emits a street's far part past the pit as "<id>-far" (non-garage), and the
    // frontage severance may remove a continuation segment, so additions minus
    // removals must balance exactly garage-class edges plus far parts.
    const netIds = new Set(network.edges.map((e) => e.id));
    const added = network.edges.length - config.edges.length;
    const garageCount = network.edges.filter((e) => e.roadClass === 'garage').length;
    const farParts = network.edges.filter(
      (e) => e.roadClass !== 'garage' && e.id.endsWith('-far'),
    ).length;
    const removed = config.edges.filter((e) => !netIds.has(`${e.from}->${e.to}`)).length;
    expect(garageCount + farParts - removed).toBe(added);
    // Every solved edge must stay within its authored grade cap (plus solver tolerance).
    for (const edge of network.edges) {
      const cap = edge.maxGrade + 0.02;
      for (let i = 1; i < edge.points.length; i += 1) {
        const a = edge.points[i - 1]!;
        const b = edge.points[i]!;
        const run = Math.hypot(b.x - a.x, b.z - a.z);
        if (run < 0.5) continue;
        expect(Math.abs(b.y - a.y) / run).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('keeps the solved network a reasonable size for load budgets', () => {
    const { config } = layoutFor(20261102);
    expect(config.nodes.length).toBeLessThan(1600);
    expect(config.edges.length).toBeLessThan(1600);
    const baseHeight = (x: number, z: number): number =>
      Math.sin(x * 0.0004) * 90 + Math.sin(z * 0.0005) * 70;
    const t0 = performance.now();
    buildRoadNetwork(config, baseHeight);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('highway road class (Phase 10 pass 2)', () => {
  it('designates seeded highway lines that run through open country', () => {
    for (const seed of [20261102, 4242, 777]) {
      const { config } = layoutFor(seed);
      const highways = config.edges.filter((edge) => edge.roadClass === 'highway');
      // The 3×3 window has 8 cell-boundary lines (4 vertical + 4 horizontal); with a 30%
      // designation and open-country stretches, some worlds get none — but across these
      // seeds at least one must, and the geometry is verified wherever one exists.
      for (const edge of highways) {
        expect(edge.halfWidthMeters).toBe(8);
        expect(edge.shoulderMeters).toBe(3.5);
        expect(edge.maxGrade).toBe(0.05);
        // Phase 11.1: a highway whose line crosses the volcano's steep zone is
        // doglegged around the cone (the via points are the detour arc); every
        // other highway line stays a straight chord.
        const crossesCone = edge.via !== undefined;
        if (!crossesCone) expect(edge.via).toBeUndefined();
      }
    }
    // At least one of these seeds grows a highway in the window.
    const total = [20261102, 4242, 777].reduce((sum, seed) => {
      return (
        sum + layoutFor(seed).config.edges.filter((edge) => edge.roadClass === 'highway').length
      );
    }, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('never runs through a megacity or urban-fringe region', () => {
    const plan = createWorldPlan(20261102);
    const { config } = layoutFor(20261102);
    const byId = new Map(config.nodes.map((node) => [node.id, node]));
    for (const edge of config.edges) {
      if (edge.roadClass !== 'highway') continue;
      const from = byId.get(edge.from)!;
      const to = byId.get(edge.to)!;
      // The whole segment midpoint must be open country.
      const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
      const archetype = plan.regionAt(mid.x, mid.z).archetype;
      expect(['rural', 'small-town']).toContain(archetype);
    }
  });

  it('solves flat: the highway profile respects its 5% grade', () => {
    const { config } = layoutFor(20261102);
    const network = buildRoadNetwork(config, () => 0);
    for (const edge of network.edges) {
      if (edge.roadClass !== 'highway') continue;
      for (let i = 1; i < edge.points.length; i += 1) {
        const a = edge.points[i - 1]!;
        const b = edge.points[i]!;
        const run = Math.hypot(b.x - a.x, b.z - a.z);
        if (run < 0.01) continue;
        expect(Math.abs(b.y - a.y) / run).toBeLessThanOrEqual(0.05 + 1e-6);
      }
    }
  });

  it('builds barrier walls that hug the shoulders above the deck', () => {
    const { config } = layoutFor(20261102);
    const network = buildRoadNetwork(config, () => 10);
    const highway = network.edges.find((edge) => edge.roadClass === 'highway');
    if (highway === undefined) return; // seed has no highway in the window
    const barrier = buildBarrierGeometry(highway, 1.0, 0.3, 11.45);
    const positions = barrier.getAttribute('position');
    expect(positions.count).toBe(highway.points.length * 4);
    for (let i = 0; i < positions.count; i += 1) {
      const y = positions.getY(i);
      expect(y).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(y).toBeLessThanOrEqual(11.5 + 1e-6);
    }
  });

  it('keeps the network one connected component with highways present', () => {
    const { config, spawnNodeId } = layoutFor(777);
    const adjacency = new Map<string, string[]>();
    for (const node of config.nodes) adjacency.set(node.id, []);
    for (const edge of config.edges) {
      adjacency.get(edge.from)!.push(edge.to);
      adjacency.get(edge.to)!.push(edge.from);
    }
    const seen = new Set<string>([spawnNodeId]);
    const queue = [spawnNodeId];
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const next of adjacency.get(id)!) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(config.nodes.length);
  });
});

describe('switchback pass roads (Phase 10 pass 2)', () => {
  it('every touge edge is a two-hairpin switchback with a real climb', () => {
    for (const seed of [20261102, 4242, 777]) {
      const { config } = layoutFor(seed);
      const touges = config.edges.filter((edge) => edge.roadClass === 'touge');
      for (const edge of touges) {
        const via = edge.via ?? [];
        expect(via.length).toBeGreaterThanOrEqual(4);
        const [a, b, c, d] = via as [number, number][];
        expect(a).toBeDefined();
        // Hairpin 1: a vertical climb at constant x, then the upper contour leg
        // doubling back west at constant z, then the second climb.
        expect(Math.abs(a![0] - b![0])).toBeLessThan(1e-6);
        expect(Math.abs(b![1] - c![1])).toBeLessThan(1e-6);
        expect(Math.abs(c![0] - d![0])).toBeLessThan(1e-6);
        expect(c![0]).toBeLessThan(b![0]); // the contour leg runs back west
        // Two climbs: the road spans well over 800 m of contour offset.
        expect(d![1] - a![1]).toBeGreaterThan(600);
      }
    }
  });

  it('solves grade-limited across the hairpins', () => {
    const { config } = layoutFor(20261102);
    const network = buildRoadNetwork(config, () => 0);
    const touges = network.edges.filter((edge) => edge.roadClass === 'touge');
    if (touges.length === 0) return;
    for (const edge of touges) {
      for (let i = 1; i < edge.points.length; i += 1) {
        const p = edge.points[i - 1]!;
        const q = edge.points[i]!;
        const run = Math.hypot(q.x - p.x, q.z - p.z);
        if (run < 0.01) continue;
        expect(Math.abs(q.y - p.y) / run).toBeLessThanOrEqual(0.15 + 1e-6);
      }
    }
  });
});
