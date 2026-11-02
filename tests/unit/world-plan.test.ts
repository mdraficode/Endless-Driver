import { describe, expect, it } from 'vitest';
import {
  MEGACITY_BLOCK_METERS,
  REGION_CELL_METERS,
  URBAN_FRINGE_BLOCK_METERS,
  WORLD_PLAN_VERSION,
  createWorldPlan,
  planArchetypeCounts,
  type RegionArchetype,
  type RegionPlan,
} from '../../src/world/world-plan';

/** The serializable subset of a region, for deep comparisons. */
function snapshot(r: RegionPlan): Record<string, unknown> {
  return {
    id: r.id,
    ix: r.ix,
    iz: r.iz,
    centerX: r.centerX,
    centerZ: r.centerZ,
    archetype: r.archetype,
    seed: r.seed,
    blockMeters: r.cityGrid?.blockMeters,
    lines: r.cityGrid
      ? [-3, -2, -1, 0, 1, 2, 3].map((l) => [l, r.cityGrid?.lineClass(l)] as const)
      : null,
    district: r.district,
  };
}

const SAMPLED_CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [3, -2],
  [-4, 5],
  [12, 12],
  [-30, 17],
  [5, -40],
];

describe('world-plan', () => {
  it('is deterministic: the same seed rebuilds the identical plan', () => {
    const a = createWorldPlan(20261102);
    const b = createWorldPlan(20261102);
    expect(a.seed).toBe(20261102);
    expect(a.generatorVersion).toBe(WORLD_PLAN_VERSION);
    for (const [ix, iz] of SAMPLED_CELLS) {
      expect(snapshot(a.regionAtCell(ix, iz))).toEqual(snapshot(b.regionAtCell(ix, iz)));
    }
    expect(a.spawn).toEqual(b.spawn);
  });

  it('a different seed produces a different plan', () => {
    const a = createWorldPlan(20261102);
    const b = createWorldPlan(20261103);
    const same = SAMPLED_CELLS.every(
      ([ix, iz]) =>
        a.regionAtCell(ix, iz).archetype === b.regionAtCell(ix, iz).archetype &&
        a.regionAtCell(ix, iz).seed === b.regionAtCell(ix, iz).seed,
    );
    expect(same).toBe(false);
  });

  it('the home cell (0,0) is always urban, and the spawn sits in it', () => {
    for (const seed of [1, 7, 999, 20261102, 0xdeadbeef]) {
      const plan = createWorldPlan(seed);
      const home = plan.regionAtCell(0, 0);
      expect(home.archetype).toBe('megacity');
      expect(home.cityGrid).toBeDefined();
      expect(plan.spawn.region).toBe('megacity');
      expect(plan.spawn.preferredClass).toBe('urban-arterial');
      expect(plan.spawn.x).toBe(0);
      expect(plan.spawn.z).toBe(0);
    }
  });

  it('regionAt maps world points to cells on the 4 km lattice, centred on the origin', () => {
    const plan = createWorldPlan(42);
    expect(plan.regionAt(0, 0).id).toBe('r0-0');
    expect(plan.regionAt(1999.9, 1999.9).id).toBe('r0-0');
    expect(plan.regionAt(-1999.9, -1999.9).id).toBe('r0-0');
    expect(plan.regionAt(2000, 0).id).toBe('r1-0');
    // Half-open cells: the edge belongs to the cell on its + side.
    expect(plan.regionAt(0, -2000).id).toBe('r0-0');
    expect(plan.regionAt(0, -2000.1).id).toBe('r0--1');
    expect(plan.regionAt(2000, 2000).id).toBe('r1-1');
    expect(REGION_CELL_METERS).toBe(4000);
  });

  it('generates a mostly-urban mix over a wide sample', () => {
    const plan = createWorldPlan(20261102);
    const counts = planArchetypeCounts(plan, 20); // 41x41 = 1681 cells
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(1681);
    const urban = counts.megacity + counts['urban-fringe'];
    expect(urban / total).toBeGreaterThan(0.35);
    // "Most of the map is one giant city" (owner) — vast, but rural pockets persist.
    expect(urban / total).toBeLessThan(0.8);
    expect(counts['small-town'] / total).toBeGreaterThan(0.03);
    expect(counts.rural / total).toBeGreaterThan(0.05);
    // Every archetype must be reachable for this seed somewhere in the sample.
    for (const archetype of Object.keys(counts) as RegionArchetype[]) {
      expect(counts[archetype]).toBeGreaterThan(0);
    }
  });

  it('keeps neighbouring urban cells on the same global grid (shared line classes agree)', () => {
    const plan = createWorldPlan(777);
    const other = createWorldPlan(777);
    const home = plan.regionAtCell(0, 0);
    if (!home.cityGrid) return; // home is always urban — keep the guard for clarity
    // The world line on the +x cell boundary is at x = 2000 → global line 2000/block.
    const sharedLine = 2000 / home.cityGrid.blockMeters;
    expect(Number.isInteger(sharedLine)).toBe(true);
    for (const [ox, oz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      const neighbour = plan.regionAtCell(ox, oz);
      if (!neighbour.cityGrid || home.cityGrid.blockMeters !== neighbour.cityGrid.blockMeters) {
        continue; // different lattice (fringe vs megacity) or non-urban — nothing to share
      }
      // The shared boundary line is a global line: both cells classify it alike, and a
      // rebuilt plan (same seed) agrees as well.
      expect(home.cityGrid.lineClass(sharedLine)).toBe(neighbour.cityGrid.lineClass(sharedLine));
      expect(home.cityGrid.lineClass(sharedLine)).toBe(
        other.regionAtCell(ox, oz).cityGrid!.lineClass(sharedLine),
      );
    }
  });

  it('megacity cells carry a coherent mix of arterials and local streets', () => {
    const plan = createWorldPlan(31337);
    let found = false;
    for (let ix = -4; ix <= 4 && !found; ix += 1) {
      for (let iz = -4; iz <= 4 && !found; iz += 1) {
        const r = plan.regionAtCell(ix, iz);
        if (r.archetype !== 'megacity' || !r.cityGrid) continue;
        found = true;
        const linesPerCell = REGION_CELL_METERS / r.cityGrid.blockMeters;
        const startLine =
          (ix * REGION_CELL_METERS - REGION_CELL_METERS / 2) / r.cityGrid.blockMeters;
        let arterials = 0;
        for (let i = 0; i < linesPerCell; i += 1) {
          if (r.cityGrid.lineClass(startLine + i) === 'urban-arterial') arterials += 1;
        }
        const fraction = arterials / linesPerCell;
        expect(fraction).toBeGreaterThan(0.15);
        expect(fraction).toBeLessThan(0.45);
      }
    }
    expect(found).toBe(true);
  });

  it('urban cells carry the correct global block lattice', () => {
    const plan = createWorldPlan(4242);
    for (const [ix, iz] of SAMPLED_CELLS) {
      const r = plan.regionAtCell(ix, iz);
      if (r.archetype === 'megacity') {
        expect(r.cityGrid?.blockMeters).toBe(MEGACITY_BLOCK_METERS);
      } else if (r.archetype === 'urban-fringe') {
        expect(r.cityGrid?.blockMeters).toBe(URBAN_FRINGE_BLOCK_METERS);
      } else {
        expect(r.cityGrid).toBeUndefined();
      }
    }
  });

  it('districts are bounded soft discs inside their cell', () => {
    const plan = createWorldPlan(42);
    for (const [ix, iz] of SAMPLED_CELLS) {
      const r = plan.regionAtCell(ix, iz);
      const d = r.district;
      expect(d.radiusMeters).toBeGreaterThan(REGION_CELL_METERS * 0.4);
      expect(d.radiusMeters).toBeLessThan(REGION_CELL_METERS * 1.0);
      const maxJitter = 0.35 * REGION_CELL_METERS;
      expect(Math.abs(d.centerX - r.centerX)).toBeLessThanOrEqual(maxJitter);
      expect(Math.abs(d.centerZ - r.centerZ)).toBeLessThanOrEqual(maxJitter);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.id).toBe(`d-${r.id}`);
    }
  });

  it('region seeds are a separate stream from the world seed and differ per cell', () => {
    const plan = createWorldPlan(1234);
    const a = plan.regionAtCell(0, 0);
    const b = plan.regionAtCell(1, 1);
    expect(a.seed).not.toBe(b.seed);
    expect(a.seed).not.toBe(1234);
  });
});
