import { describe, expect, it } from 'vitest';
import { ACTIVE_TERRAIN_SURFACE_ASSETS, TERRAIN_CONFIG } from '../../src/config/terrain';
import {
  createTerrainSampler,
  terrainColorAt,
  terrainPatchAt,
  terrainSurfaceWeights,
  terrainVariationAt,
} from '../../src/world/terrain-height';
import { buildChunkGeometry } from '../../src/world/terrain-geometry';
import { groundTintAt } from '../../src/world/districts';
import { sampleTerrainSurface } from '../../src/world/terrain-surface';
import {
  planChunks,
  planPhysicsChunks,
  predictPrefetchFocus,
  resolveWindowCenter,
  segmentsForRing,
} from '../../src/world/terrain-chunks';

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

describe('surface splat and driving response', () => {
  it('loads no snow texture into gameplay terrain', () => {
    expect(ACTIVE_TERRAIN_SURFACE_ASSETS).toEqual([
      'tex-leafy-grass-1k',
      'tex-brown-mud-dry-1k',
      'tex-rock-face-03-1k',
    ]);
    expect(ACTIVE_TERRAIN_SURFACE_ASSETS.some((asset) => asset.includes('snow'))).toBe(false);
  });

  it('writes normalised splat weights and a sane tint per vertex', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const geometry = buildChunkGeometry(sampler, 3, -2, 8);
    const splat = geometry.getAttribute('splat');
    const tint = geometry.getAttribute('tint');
    expect(splat.itemSize).toBe(4);
    expect(tint.count).toBe(splat.count);
    for (let index = 0; index < splat.count; index += 1) {
      const sum =
        splat.getComponent(index, 0) +
        splat.getComponent(index, 1) +
        splat.getComponent(index, 2) +
        splat.getComponent(index, 3);
      expect(sum).toBeCloseTo(1, 4);
      expect(tint.getComponent(index, 0)).toBeGreaterThan(0.6);
      expect(tint.getComponent(index, 0)).toBeLessThan(1.1);
      expect(splat.getComponent(index, 3)).toBe(0);
    }
    geometry.dispose();
  });

  it('never generates a snow layer or pale macro ground, including at the summit', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const [vx, vz] = TERRAIN_CONFIG.volcano.position;
    const summitKinds = new Set<string>();
    for (let dx = -1100; dx <= 1100; dx += 55) {
      for (let dz = -1100; dz <= 1100; dz += 55) {
        const x = vx + dx;
        const z = vz + dz;
        const height = sampler.heightAt(x, z);
        const slope = 1 - sampler.normalAt(x, z).y;
        const variation = terrainVariationAt(TERRAIN_CONFIG, x, z);
        const patch = terrainPatchAt(TERRAIN_CONFIG, x, z);
        const weights = terrainSurfaceWeights(TERRAIN_CONFIG, height, slope, variation, patch);
        const surface = sampleTerrainSurface(sampler, x, z);
        const macro = terrainColorAt(
          TERRAIN_CONFIG,
          height,
          slope,
          variation,
          1,
          groundTintAt(x, z),
          patch,
        );

        // The fourth splat channel is reserved for compatibility, not snow.
        expect(weights[3]).toBe(0);
        expect(surface.weights[3]).toBe(0);
        expect(surface.id).not.toBe('snow');
        // The distance/macro colour can never become a white field or LOD seam.
        expect(Math.max(...macro)).toBeLessThan(0.5);
        if (height > 200) summitKinds.add(surface.id);
      }
    }
    expect(summitKinds.has('rock')).toBe(true);
  });

  it('varies the lowland ground instead of laying one green carpet', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const kinds = new Set<string>();
    let maxRockWeight = 0;
    // 20 m pitch: outcrops are deliberately clustered, tens of metres across.
    for (let x = -600; x <= 700; x += 20) {
      for (let z = -700; z <= 700; z += 20) {
        const surface = sampleTerrainSurface(sampler, x, z);
        kinds.add(surface.id);
        maxRockWeight = Math.max(maxRockWeight, surface.weights[2]);
      }
    }
    expect(kinds.has('grass')).toBe(true);
    expect(kinds.has('soil')).toBe(true);
    // Rock outcrops break crests even where grass/soil own the flats.
    expect(maxRockWeight).toBeGreaterThan(0.25);
  });

  it('drives like grass on the spawn plateau and like exposed rock on the volcano', () => {
    const sampler = createTerrainSampler(TERRAIN_CONFIG);
    const plateau = sampleTerrainSurface(sampler, 10, -10);
    expect(plateau.id).toBe('grass');
    expect(plateau.gripModifier).toBeGreaterThan(0.7);
    expect(plateau.gripModifier).toBeLessThan(0.9);
    expect(plateau.rollingResistance).toBeGreaterThan(0.025);
    const [vx, vz] = TERRAIN_CONFIG.volcano.position;
    const summit = sampleTerrainSurface(sampler, vx, vz);
    expect(summit.weights[2]).toBeGreaterThan(0.25);
    expect(summit.weights[3]).toBe(0);
    const flank = sampleTerrainSurface(sampler, vx + 420, vz + 260);
    expect(flank.gripModifier).not.toBeCloseTo(plateau.gripModifier, 2);
  });
});

describe('streaming planner', () => {
  it('projects a bounded focus ahead of travel and leaves a stopped focus unchanged', () => {
    expect(predictPrefetchFocus(TERRAIN_CONFIG, { x: 12, z: -8 }, { x: 0, z: 0 })).toEqual({
      x: 12,
      z: -8,
    });
    expect(predictPrefetchFocus(TERRAIN_CONFIG, { x: 12, z: -8 }, { x: 10, z: 0 })).toEqual({
      x: 26,
      z: -8,
    });
    expect(predictPrefetchFocus(TERRAIN_CONFIG, { x: 12, z: -8 }, { x: 0, z: -200 })).toEqual({
      x: 12,
      z: -120,
    });
  });

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

  it('holds the window centre against chunk-seam jitter (hysteresis)', () => {
    const centre = resolveWindowCenter(null, TERRAIN_CONFIG, 10, 10);
    expect(centre).toEqual({ cx: 0, cz: 0 });
    // Jitter across the x=128 seam and back: the centre must not move.
    expect(resolveWindowCenter(centre, TERRAIN_CONFIG, 129, 10)).toEqual(centre);
    expect(resolveWindowCenter(centre, TERRAIN_CONFIG, 127, 10)).toEqual(centre);
    expect(resolveWindowCenter(centre, TERRAIN_CONFIG, 140, -10)).toEqual(centre);
    // Genuinely leaving the expanded centre chunk recentres on the focus chunk.
    expect(resolveWindowCenter(centre, TERRAIN_CONFIG, 200, 10)).toEqual({ cx: 1, cz: 0 });
  });

  it('plans a 3x3 physics window at physics radius 1', () => {
    const window = planPhysicsChunks(TERRAIN_CONFIG, 0, 0);
    expect(window).toHaveLength(9);
    expect(window).toContainEqual({ cx: 0, cz: 0 });
    expect(window).toContainEqual({ cx: -1, cz: 1 });
  });
});
