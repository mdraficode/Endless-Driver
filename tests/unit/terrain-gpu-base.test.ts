import { describe, expect, it } from 'vitest';

import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { TerrainWorld } from '../../src/world/TerrainWorld';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';

/**
 * Phase 11.0d: the in-game GPU base flow, driven headlessly. The REAL
 * `HeightfieldRasterizer` runs against a fake WebGPU renderer whose read-back returns a
 * synthetic ramp — so the test pins the whole pipeline: request (with the chunk's halo-grid
 * origin/pitch/count) → next-frame read-back → the identical CPU carve on top → the built
 * geometry — plus the stats and the failure circuit breaker that re-arms the CPU path.
 */

const TEST_CONFIG = {
  ...TERRAIN_CONFIG,
  viewRadiusChunks: 1,
  lodSegments: [8, 4, 2] as const,
  lodRingStarts: [0, 1, 2] as const,
  maxBuildsPerFrame: 2,
};

/** The synthetic read-back: base[j*count+i] = (j*count+i) * 0.001, float32. */
function rampBuffer(count: number): ArrayBuffer {
  const out = new Float32Array(count * count);
  for (let k = 0; k < out.length; k += 1) out[k] = k * 0.001;
  return out.buffer;
}

interface FakeGpuOptions {
  readonly fail?: boolean;
}

function fakeWebGpuRenderer(options: FakeGpuOptions = {}) {
  const state: { computeCalls: number; readBacks: number[] } = {
    computeCalls: 0,
    readBacks: [],
  };
  const renderer = {
    compute: (nodes: unknown[]) => {
      state.computeCalls += nodes.length;
    },
    getArrayBufferAsync: async (
      _attr: unknown,
      _target: null,
      _offset: number,
      count: number,
    ): Promise<ArrayBuffer> => {
      state.readBacks.push(count);
      if (options.fail) {
        throw new Error('fake device lost');
      }
      return rampBuffer(count / 4);
    },
  };
  return { renderer, state };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** Advance the streaming loop `frames` frames, letting the async read-backs land. */
async function runFrames(world: TerrainWorld, frames: number, focus = { x: 0, y: 0, z: 0 }) {
  for (let f = 0; f < frames; f += 1) {
    world.updateStreaming(focus);
    await flush();
  }
}

/** The world sampler (carve + base spec), at the chunk (0,0) corner the test asserts on. */
function makeSampler() {
  return createWorldTerrainSampler(TEST_CONFIG, ROAD_NETWORK_CONFIG);
}

function firstChunkHeight(world: TerrainWorld): number {
  const mesh = world.root.children[0] as
    { geometry?: { attributes?: Record<string, { array: Float32Array }> } } | undefined;
  const position = mesh?.geometry?.attributes?.['position'];
  return position?.array?.[1] ?? NaN;
}

describe('terrain world gpu base flow (Phase 11.0d)', () => {
  it('rasterises the base on the GPU, carves it on the CPU, and builds the chunk', async () => {
    const sampler = makeSampler();
    const { renderer, state } = fakeWebGpuRenderer();
    const world = new TerrainWorld(sampler, { enableParallaxOcclusion: false });
    world.configureRenderer('webgpu', renderer);
    expect(world.getContentStats().terrainGpuHeightfield).toBe(1);

    // Frame 1: requests go out (one compute per queued chunk). Frame 2: the read-backs
    // are issued. Frame 3: the bases are in hand and the sync path carves + builds.
    await runFrames(world, 3);

    const stats = world.getContentStats();
    expect(state.computeCalls).toBe(9); // the 3x3 window, one request each
    expect(state.readBacks).toHaveLength(9);
    expect(stats.terrainGpuHeightfieldJobs).toBe(9);
    expect(stats.terrainGpuHeightfieldPending).toBe(0);
    expect(stats.terrainChunksLoaded).toBe(2); // the per-frame build budget

    // The center chunk's first vertex is at (0, 0): its height is the CPU carve applied
    // to the ramp base at the corresponding halo-grid slot (segments 8 → halo 11, slot 12).
    const carve = sampler.carveFromBase;
    expect(carve).toBeTypeOf('function');
    const rampSlot = new Float32Array(1);
    rampSlot[0] = 12 * 0.001; // float32, exactly as the read-back stores it
    const expected = new Float32Array(1);
    expected[0] = carve!(0, 0, rampSlot[0]!);
    expect(firstChunkHeight(world)).toBeCloseTo(expected[0]!, 9);

    world.dispose();
  });

  it('engages nothing on a non-WebGPU backend (the CPU path is untouched)', () => {
    const sampler = makeSampler();
    const { renderer } = fakeWebGpuRenderer();
    const world = new TerrainWorld(sampler, { enableParallaxOcclusion: false });
    world.configureRenderer('webgl2', renderer);
    expect(world.getContentStats().terrainGpuHeightfield).toBe(0);
    world.updateStreaming({ x: 0, y: 0, z: 0 });
    expect(world.getContentStats().terrainChunksLoaded).toBe(2); // CPU build, same budget
    world.dispose();
  });

  it('retires the rasteriser after repeated failures and re-arms the CPU path', async () => {
    const sampler = makeSampler();
    const { renderer } = fakeWebGpuRenderer({ fail: true });
    const world = new TerrainWorld(sampler, { enableParallaxOcclusion: false });
    world.configureRenderer('webgpu', renderer);
    expect(world.getContentStats().terrainGpuHeightfield).toBe(1);

    // Each frame: request → read-back rejects → failure count grows. After the breaker
    // (8 consecutive failures) the rasteriser is disposed and the next frame builds on
    // the CPU path.
    await runFrames(world, 12);

    const stats = world.getContentStats();
    expect(stats.terrainGpuHeightfield).toBe(0);
    expect(stats.terrainChunksLoaded).toBeGreaterThan(0);

    // The built chunk is the plain CPU path: the sampler's own height at (0, 0).
    const expected = new Float32Array(1);
    expected[0] = sampler.heightAt(0, 0);
    expect(firstChunkHeight(world)).toBeCloseTo(expected[0]!, 9);

    world.dispose();
  });
});
