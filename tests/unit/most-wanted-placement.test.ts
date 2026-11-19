import { describe, expect, it } from 'vitest';

import { MW_PLACEMENT } from '../../src/config/most-wanted';
import { computeRegionMwEvents } from '../../src/most-wanted/SeededMwPlacement';
import { buildRoadLayout } from '../../src/world/road-layout';
import { buildRoadNetwork } from '../../src/world/road-network';
import { createWorldPlan, REGION_CELL_METERS } from '../../src/world/world-plan';

/** Same analytic height the Phase 10.5 fixture uses (Node-testable, no terrain worker). */
const TEST_HEIGHT = (x: number, z: number): number =>
  Math.sin(x * 0.001) * 4 + Math.cos(z * 0.001) * 3;

/**
 * Build the test world and pick a region whose Most Wanted placement meets every
 * category's minimum (so the count-bounds test is stable). The per-seed volcano moves the
 * pass cells around, so we scan the nearby urban cells and pick on content, not position.
 */
function buildWorld() {
  const plan = createWorldPlan(20261104);
  const network = buildRoadNetwork(buildRoadLayout(plan).config, TEST_HEIGHT);
  let region = null;
  for (let iz = -1; iz <= 1 && region === null; iz += 1) {
    for (let ix = -1; ix <= 1 && region === null; ix += 1) {
      if (ix === 0 && iz === 0) continue;
      const candidate = plan.regionAtCell(ix, iz);
      if (candidate.archetype !== 'megacity' && candidate.archetype !== 'urban-fringe') {
        continue;
      }
      const events = computeRegionMwEvents(candidate, network, MW_PLACEMENT);
      if (events.hideSpots.length < MW_PLACEMENT.hideSpots[0]) continue;
      if (events.pursuitBreakers.length < MW_PLACEMENT.pursuitBreakers[0]) continue;
      if (events.bountySpots.length < MW_PLACEMENT.bountySpots[0]) continue;
      if (events.policeAnchors.length < MW_PLACEMENT.policeAnchors[0]) continue;
      region = candidate;
    }
  }
  if (region === null)
    throw new Error('no region with a full MW placement found in the test world');
  return { plan, network, region };
}

const allPoints = (e: ReturnType<typeof computeRegionMwEvents>) => [
  ...e.hideSpots,
  ...e.pursuitBreakers,
  ...e.bountySpots,
  ...e.policeAnchors,
];

describe('Most Wanted seeded placement (Phase 10)', () => {
  it('is deterministic for a fixed region', () => {
    const { network, region } = buildWorld();
    const a = computeRegionMwEvents(region, network, MW_PLACEMENT);
    const b = computeRegionMwEvents(region, network, MW_PLACEMENT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('places every point on a valid edge, on the road, near the region centre', () => {
    const { network, region } = buildWorld();
    const events = computeRegionMwEvents(region, network, MW_PLACEMENT);
    const edges = new Map(network.edges.map((e) => [e.id, e]));
    const all = allPoints(events);
    expect(all.length).toBeGreaterThan(0);
    const bound = REGION_CELL_METERS * MW_PLACEMENT.radiusFactor + 160;
    for (const p of all) {
      const edge = edges.get(p.edgeId);
      expect(edge).toBeDefined();
      expect(p.alongMeters).toBeGreaterThanOrEqual(0);
      expect(p.alongMeters).toBeLessThanOrEqual(edge!.lengthMeters + 1e-3);
      // The point sits on the solved pavement, so the network finds it.
      expect(network.sample(p.x, p.z)).not.toBeNull();
      // ...and stays local to the region.
      expect(Math.hypot(p.x - region.centerX, p.z - region.centerZ)).toBeLessThanOrEqual(bound);
    }
  });

  it('respects the config count bounds per category', () => {
    const { network, region } = buildWorld();
    const events = computeRegionMwEvents(region, network, MW_PLACEMENT);
    const check = (n: number, range: readonly [number, number]): void => {
      expect(n).toBeGreaterThanOrEqual(range[0]);
      expect(n).toBeLessThanOrEqual(range[1]);
    };
    check(events.hideSpots.length, MW_PLACEMENT.hideSpots);
    check(events.pursuitBreakers.length, MW_PLACEMENT.pursuitBreakers);
    check(events.bountySpots.length, MW_PLACEMENT.bountySpots);
    check(events.policeAnchors.length, MW_PLACEMENT.policeAnchors);
  });

  it('does not mutate its inputs', () => {
    const { network, region } = buildWorld();
    const snapshot = () =>
      JSON.stringify(network.edges.map((e) => e.points.map((p) => [p.x, p.y, p.z, p.alongMeters])));
    const before = snapshot();
    computeRegionMwEvents(region, network, MW_PLACEMENT);
    expect(snapshot()).toBe(before);
  });
});
