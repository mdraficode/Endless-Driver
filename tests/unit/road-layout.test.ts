import { describe, expect, it } from 'vitest';
import { buildRoadLayout, ROAD_WINDOW_CELLS } from '../../src/world/road-layout';
import { createWorldPlan, REGION_CELL_METERS } from '../../src/world/world-plan';
import { buildRoadNetwork } from '../../src/world/road-network';
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
    expect(network.edges.length).toBe(config.edges.length);
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
