import { describe, expect, it } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { ChunkGenerator } from '../../src/world/chunk-generator';
import {
  createGenerationSampler,
  handleGenerationRequest,
  requestTransferables,
  resultTransferables,
} from '../../src/world/terrain-generation';
import { buildChunkGeometryData } from '../../src/world/terrain-geometry';
import { createWorldTerrainSampler, worldBaseHeightAt } from '../../src/world/world-terrain';

/**
 * Worker generation protocol, pinned off-thread: the sampler a worker rebuilds from
 * configs must produce bit-identical chunk data to the game's own sampler, or chunk
 * seams would depend on which thread happened to build them. The pool itself falls
 * back to synchronous mode where no Worker exists (this test environment included).
 */

function expectChunkEqual(
  a: ReturnType<typeof buildChunkGeometryData>,
  b: ReturnType<typeof buildChunkGeometryData>,
): void {
  expect(a.positions).toEqual(b.positions);
  expect(a.normals).toEqual(b.normals);
  expect(a.splats).toEqual(b.splats);
  expect(a.tints).toEqual(b.tints);
  expect(a.indices).toEqual(b.indices);
}

describe('generation sampler determinism', () => {
  it('matches the game sampler bit-for-bit, with and without the road carve', () => {
    const gameSampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const workerSampler = createGenerationSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    // A chunk straddling the mountain road (carve active) and one far from any road.
    for (const [cx, cz, segments] of [
      [0, -3, 32],
      [4, 5, 16],
    ] as const) {
      expectChunkEqual(
        buildChunkGeometryData(gameSampler, cx, cz, segments),
        buildChunkGeometryData(workerSampler, cx, cz, segments),
      );
    }
    const plainWorker = createGenerationSampler(TERRAIN_CONFIG, null);
    expectChunkEqual(
      buildChunkGeometryData(plainWorker, 2, 2, 16),
      buildChunkGeometryData(createGenerationSampler(TERRAIN_CONFIG, null), 2, 2, 16),
    );
  });

  it('carries the city plateau and pits to the worker, or the city chunks are raw terrain', () => {
    // Regression: the generated home city sits on a levelled plateau with sunken
    // hideout pits. The worker rebuilds its sampler from the init message, so the
    // plateau and pits must travel with it — without them the worker's chunks are
    // natural terrain (up to the local hill relief above the deck) and the car
    // drives through grassy terrain that visually swallows it.
    const plateau = { x: 120, z: -80, flatRadiusMeters: 300, blendRadiusMeters: 700 };
    const pits = [{ x: 140, z: -60, radiusMeters: 40, depthMeters: 9 }];
    const gameSampler = createWorldTerrainSampler(
      TERRAIN_CONFIG,
      ROAD_NETWORK_CONFIG,
      plateau,
      pits,
    );
    const workerSampler = createGenerationSampler(
      TERRAIN_CONFIG,
      ROAD_NETWORK_CONFIG,
      gameSampler.plateau,
      gameSampler.pits,
    );
    for (const [cx, cz, segments] of [
      [4, -2, 32], // inside the plateau
      [-6, 6, 16], // outside, natural ground with pits nearby
    ] as const) {
      expectChunkEqual(
        buildChunkGeometryData(gameSampler, cx, cz, segments),
        buildChunkGeometryData(workerSampler, cx, cz, segments),
      );
    }
    // And the old init (no plateau, no pits) must NOT match — proves the test is live.
    const staleWorkerSampler = createGenerationSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const fresh = buildChunkGeometryData(gameSampler, 4, -2, 32);
    const stale = buildChunkGeometryData(staleWorkerSampler, 4, -2, 32);
    expect(Array.from(fresh.positions).slice(0, 32)).not.toEqual(
      Array.from(stale.positions).slice(0, 32),
    );
  });

  it('answers protocol requests with echo fields and all buffers transferable', () => {
    const sampler = createGenerationSampler(TERRAIN_CONFIG, null);
    const result = handleGenerationRequest(sampler, {
      type: 'generate',
      id: 42,
      chunkX: -1,
      chunkZ: 2,
      segments: 8,
    });
    expect(result.id).toBe(42);
    expect(result.chunkX).toBe(-1);
    expect(result.segments).toBe(8);
    expect(resultTransferables(result)).toHaveLength(7); // + district tint attribute
    for (const buffer of resultTransferables(result)) {
      expect(buffer.byteLength).toBeGreaterThan(0);
    }
  });
});

describe('chunk generator fallback', () => {
  it('degrades to sync mode where Worker is unavailable', () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const generator = new ChunkGenerator(sampler, TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    expect(generator.mode).toBe('sync');
    expect(generator.backlog).toBe(0);
    expect(generator.takeCompleted(2)).toEqual([]);
    generator.dispose();
  });
});

/**
 * Phase 11.0d: the GPU base path. The rasteriser supplies the pre-carve base as a float32
 * grid at exactly the chunk's halo-grid coordinates; `buildChunkGeometryData` applies the
 * CPU carve on top of it. The acceptance contract pinned here (the per-chunk form of the
 * 512² e2e parity): the GPU-base geometry lands within 1 cm of the CPU path, the carve
 * output is structurally identical (same carve function, another base), and the base-less
 * CPU path stays bit-identical.
 */
describe('gpu base rasterisation path (Phase 11.0d)', () => {
  const PARITY_TOLERANCE_METERS = 0.01;

  /** Simulates the rasteriser's read-back: the CPU base rounded to float32, halo grid. */
  function simulatedGpuBase(
    sampler: ReturnType<typeof createWorldTerrainSampler>,
    chunkX: number,
    chunkZ: number,
    segments: number,
  ): Float32Array {
    const spec = sampler.baseSpec;
    if (spec === undefined) {
      throw new Error('the world sampler must carry baseSpec');
    }
    const size = sampler.config.chunkSizeMeters;
    const step = size / segments;
    const count = segments + 3; // the halo grid (terrain-geometry.ts)
    const base = new Float32Array(count * count); // float32 storage, as the read-back
    for (let j = 0; j < count; j += 1) {
      for (let i = 0; i < count; i += 1) {
        base[j * count + i] = worldBaseHeightAt(
          spec.config,
          spec.plateau,
          spec.cityElevation,
          chunkX * size + (i - 1) * step,
          chunkZ * size + (j - 1) * step,
        );
      }
    }
    return base;
  }

  function maxVertexDistance(
    a: ReturnType<typeof buildChunkGeometryData>,
    b: ReturnType<typeof buildChunkGeometryData>,
  ): number {
    let max = 0;
    for (let v = 0; v < a.positions.length; v += 3) {
      max = Math.max(
        max,
        Math.hypot(
          (a.positions[v] ?? 0) - (b.positions[v] ?? 0),
          (a.positions[v + 1] ?? 0) - (b.positions[v + 1] ?? 0),
          (a.positions[v + 2] ?? 0) - (b.positions[v + 2] ?? 0),
        ),
      );
    }
    return max;
  }

  it('carves the GPU base to within 1 cm of the CPU path, on and off the roads', () => {
    const plateau = { x: 120, z: -80, flatRadiusMeters: 300, blendRadiusMeters: 700 };
    const pits = [{ x: 140, z: -60, radiusMeters: 40, depthMeters: 9 }];
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG, plateau, pits);
    for (const [cx, cz, segments] of [
      [0, -3, 32], // across a road: the carve is active
      [4, -2, 16], // inside the plateau blend radius
      [-6, 6, 8], // natural ground, no roads in range
    ] as const) {
      const cpu = buildChunkGeometryData(sampler, cx, cz, segments);
      const gpu = buildChunkGeometryData(
        sampler,
        cx,
        cz,
        segments,
        simulatedGpuBase(sampler, cx, cz, segments),
      );
      expect(maxVertexDistance(cpu, gpu)).toBeLessThan(PARITY_TOLERANCE_METERS);
      // Same topology: only the heights move, by the float32 rounding of the base.
      expect(gpu.indices).toEqual(cpu.indices);
      expect(gpu.normals.length).toBe(cpu.normals.length);
    }
  });

  it('keeps the CPU path bit-identical and carries nothing across the boundary', () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    expectChunkEqual(
      buildChunkGeometryData(sampler, 0, -3, 32),
      buildChunkGeometryData(sampler, 0, -3, 32),
    );
    expect(
      requestTransferables({ type: 'generate', id: 1, chunkX: 0, chunkZ: 0, segments: 8 }),
    ).toEqual([]);
  });

  it('answers a request carrying the GPU base (the worker protocol)', () => {
    const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
    const base = simulatedGpuBase(sampler, 0, -3, 8);
    const request = {
      type: 'generate' as const,
      id: 7,
      chunkX: 0,
      chunkZ: -3,
      segments: 8,
      base,
    };
    expect(requestTransferables(request)).toEqual([base.buffer as ArrayBuffer]);
    const result = handleGenerationRequest(sampler, request);
    const cpu = buildChunkGeometryData(sampler, 0, -3, 8);
    expect(maxVertexDistance(cpu, result.data)).toBeLessThan(PARITY_TOLERANCE_METERS);
  });
});
