import { describe, expect, it } from 'vitest';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { createTerrainSampler } from '../../src/world/terrain-height';
import { buildChunkGeometry } from '../../src/world/terrain-geometry';
import { planChunks, planPhysicsChunks, segmentsForRing } from '../../src/world/terrain-chunks';

/**
 * Phase 4 terrain contracts, tested headlessly against the pure modules:
 * determinism from the seed, the flat spawn plateau, border-exact chunk seams, and the
 * streaming planner. These are the properties the acceptance criteria ("deterministic
 * regeneration", "no seams") reduce to before a GPU ever gets involved.
 */

const PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [37.5, -112.25],
  [640, 640],
  [-1500, -2100],
  [1234.75, -987.5],
  [-4321, 2048],
];

describe('terrain sampler', () => {
  it('regenerates bit-identical heights from the same seed', () => {
    const a = createTerrainSampler(TERRAIN_CONFIG);
    const b = createTerrainSampler(TERRAIN_CONFIG);
    for (const [x, z] of PROBES) {
      expect(b.heightAt(x, z)).toBe(a.heightAt(x, z));
    }
  });

  it('produces a different world from a different seed', () => {
    const a = createTerrainSampler(TERRAIN_CONFIG);
    const b = createTerrainSampler({ ...TERRAIN_CONFIG, seed: TERRAIN_CONFIG.seed + 1 });
    const differences = PROBES.filter(([x, z]) => a.heightAt(x, z) !== b.heightAt(x, z));
    expect(differences.length).toBeGreaterThan(0);
  });

  it('keeps the spawn plateau exactly flat at y=0', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    for (const [x, z] of [
      [0, 0],
      [20, -15],
      [-44, 3],
      [10, 40],
    ] as const) {
      expect(sampler.heightAt(x, z)).toBe(0);
    }
  });

  it('rises to a mountain at the volcano anchor', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const [vx, vz] = TERRAIN_CONFIG.volcano.position;
    expect(sampler.heightAt(vx, vz)).toBeGreaterThan(200);
  });

  it('is continuous: no cliffs between nearby samples outside the plateau', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    for (const [x, z] of PROBES) {
      const here = sampler.heightAt(x, z);
      const near = sampler.heightAt(x + 0.5, z + 0.5);
      expect(Math.abs(near - here)).toBeLessThan(2);
    }
  });
});

describe('chunk geometry', () => {
  it('builds the expected vertex and triangle counts, skirt included', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const segments = 16;
    const geometry = buildChunkGeometry(sampler, 0, 0, segments);
    const vertsPerEdge = segments + 1;
    expect(geometry.getAttribute('position').count).toBe(
      vertsPerEdge * vertsPerEdge + segments * 4,
    );
    expect((geometry.index?.count ?? 0) / 3).toBe(segments * segments * 2 + segments * 4 * 2);
    geometry.dispose();
  });

  it('shares border heights and normals exactly with its same-LOD neighbour', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const segments = 16;
    const vertsPerEdge = segments + 1;
    const west = buildChunkGeometry(sampler, 0, 0, segments);
    const east = buildChunkGeometry(sampler, 1, 0, segments);
    const westPos = west.getAttribute('position');
    const eastPos = east.getAttribute('position');
    const westNormal = west.getAttribute('normal');
    const eastNormal = east.getAttribute('normal');
    for (let j = 0; j < vertsPerEdge; j += 1) {
      const westIndex = j * vertsPerEdge + segments; // west chunk's east edge
      const eastIndex = j * vertsPerEdge; // east chunk's west edge
      for (const component of [0, 1, 2]) {
        expect(eastPos.getComponent(eastIndex, component)).toBe(
          westPos.getComponent(westIndex, component),
        );
        expect(
          Math.abs(
            eastNormal.getComponent(eastIndex, component) -
              westNormal.getComponent(westIndex, component),
          ),
        ).toBeLessThan(1e-6);
      }
    }
    west.dispose();
    east.dispose();
  });
});

describe('streaming planner', () => {
  it('plans the full (2r+1)^2 square, nearest first, finest at the centre', () => {
    const plan = planChunks(TERRAIN_CONFIG, 10, -20);
    expect(plan).toHaveLength((2 * TERRAIN_CONFIG.viewRadiusChunks + 1) ** 2);
    expect(plan[0]?.ring).toBe(0);
    expect(plan[0]?.segments).toBe(TERRAIN_CONFIG.lodSegments[0]);
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i]?.ring ?? 0).toBeGreaterThanOrEqual(plan[i - 1]?.ring ?? 0);
    }
  });

  it('steps LOD down by ring per the configured ring starts', () => {
    expect(segmentsForRing(TERRAIN_CONFIG, 0)).toBe(TERRAIN_CONFIG.lodSegments[0]);
    expect(segmentsForRing(TERRAIN_CONFIG, 3)).toBe(TERRAIN_CONFIG.lodSegments[1]);
    expect(segmentsForRing(TERRAIN_CONFIG, 9)).toBe(TERRAIN_CONFIG.lodSegments[2]);
  });

  it('plans a 3x3 physics window at physics radius 1', () => {
    const window = planPhysicsChunks(TERRAIN_CONFIG, 0, 0);
    expect(window).toHaveLength(9);
    expect(window).toContainEqual({ cx: 0, cz: 0 });
    expect(window).toContainEqual({ cx: -1, cz: 1 });
  });
});
