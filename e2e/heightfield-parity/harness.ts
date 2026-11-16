/**
 * Phase 11.0d — GPU-vs-CPU heightfield parity harness (browser, WebGPU).
 *
 * Runs the TSL compute rasteriser (`HeightfieldRasterizer`) over several 512² grids that
 * deliberately cross every branch of the base heightfield — the city-plateau blend ring,
 * the volcano cone, the spawn pad + gameplay floor, and the open far field — then compares
 * each read-back height to the CPU's `worldBaseHeightAt` at the identical (x, z).
 *
 * Acceptance: max |Δ| ≤ 1 cm (0.01 m) on the 512² grid(s). Also reports the rasterisation
 * speedup (CPU main-thread time vs GPU dispatch→read-back time) on this device.
 *
 * This page is a self-contained probe; it is not part of the shipped app and is built +
 * served by its own Vite root (vite.config.mjs) on 127.0.0.1:4199.
 */
import { WebGPURenderer } from 'three/webgpu';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { createWorldTerrainSampler, worldBaseHeightAt } from '../../src/world/world-terrain';
import { baseSpecOf, HeightfieldRasterizer } from '../../src/world/terrain-heightfield-gpu';

// Grid size: 512 by default (the 11.0d acceptance); ?count=N for smaller runs (the
// sandbox's SwiftShader can only rasterise 512² under severe memory pressure, so the
// in-sandbox correctness run uses a coarser grid over the same regions).
const COUNT = Math.min(
  512,
  Math.max(16, Number(new URLSearchParams(location.search).get('count')) || 512),
);
const TOLERANCE_M = 0.01; // the 11.0d acceptance: ≤ 1 cm

/**
 * Grids chosen so the 512×512 samples cross each distinct branch of `worldBaseAt`:
 *  - plateau: Aohara's flat core (≤500 m) + the 500→620 m blend ring (the smoothstep path).
 *  - volcano: Hinode-dake's cone (radius 1150 m) and its ridge-broken rim.
 *  - spawn:   the spawn pad (flat ≤45 m, blend to 110 m) meeting the gameplay floor.
 *  - far:     open hills high enough to engage the floor clamp and the country fade-out.
 * Each spans `COUNT * pitch` metres from its origin.
 */
// Each grid spans `span` metres centred on its focus, at COUNT×COUNT samples.
const GRIDS: Array<{ name: string; originX: number; originZ: number; pitch: number }> = [
  { name: 'plateau', originX: 1250 - 800, originZ: -430 - 800, pitch: (2 * 800) / COUNT },
  { name: 'volcano', originX: -1500 - 1200, originZ: -2100 - 1200, pitch: (2 * 1200) / COUNT },
  { name: 'spawn', originX: -400, originZ: -400, pitch: (2 * 400) / COUNT },
  { name: 'far', originX: 2000, originZ: 2000, pitch: (2 * 3000) / COUNT },
];

const out = document.getElementById('out') as HTMLPreElement;

function report(obj: unknown): void {
  out.textContent = JSON.stringify(obj, null, 2);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx]!;
}

const raf = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

async function main(): Promise<void> {
  const spec = baseSpecOf(createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG));
  if (spec === null) {
    report({ error: 'sampler did not expose a baseSpec' });
    return;
  }

  // DEBUG: capture every WGSL source the renderer tries to compile (dev-time aid).
  const gpu = (
    navigator as unknown as {
      gpu: { requestAdapter: () => Promise<unknown> };
    }
  ).gpu;
  const originalRequestAdapter = gpu.requestAdapter.bind(gpu);
  gpu.requestAdapter = async () => {
    const adapter = (await originalRequestAdapter()) as {
      requestDevice: (
        o?: unknown,
      ) => Promise<{ createShaderModule: (d: { code: string }) => unknown }>;
    };
    const originalRequestDevice = adapter.requestDevice.bind(adapter);
    adapter.requestDevice = (o?: unknown) =>
      originalRequestDevice(o).then((device) => {
        const originalCreate = device.createShaderModule.bind(device);
        device.createShaderModule = (d: { code: string }) => {
          (window as unknown as { __SHADERS?: string[] }).__SHADERS ??= [];
          (window as unknown as { __SHADERS: string[] }).__SHADERS.push(d.code);
          return originalCreate(d);
        };
        return device;
      });
    return adapter;
  };

  const canvas = document.createElement('canvas');
  const renderer = new WebGPURenderer({ canvas, antialias: false });
  await renderer.init();

  const isWebGPU =
    (renderer as unknown as { backend?: { isWebGPU?: boolean; isWebGPUBackend?: boolean } }).backend
      ?.isWebGPU === true ||
    (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend
      ?.isWebGPUBackend === true;

  // Adapter identity, for the record (SwiftShader vs a real GPU).
  let adapter = 'unknown';
  try {
    const a = await gpu.requestAdapter();
    adapter = JSON.stringify(
      (a as { info?: unknown } | null)?.info ?? (a as { name?: string })?.name ?? a,
    );
  } catch {
    adapter = 'unavailable';
  }

  if (!isWebGPU) {
    report({ error: 'WebGPU backend not active (fell back to WebGL)', adapter });
    return;
  }

  const rasterizer = new HeightfieldRasterizer();
  rasterizer.configure(renderer, spec);

  const results: Array<Record<string, number | string>> = [];
  let globalMax = 0;
  let globalMaxAt: Record<string, number> = {};

  for (const grid of GRIDS) {
    // GPU rasterisation: request this frame, poll next, await the read-back.
    const gpuStart = performance.now();
    const gpuPromise = rasterizer.request(grid.originX, grid.originZ, grid.pitch, COUNT);
    await raf();
    rasterizer.poll();
    const gpu = await gpuPromise.catch((err) => null);
    const gpuMs = performance.now() - gpuStart;

    if (gpu === null || gpu.length !== COUNT * COUNT) {
      results.push({ grid: grid.name, error: 'GPU rasterisation failed', gpuMs });
      continue;
    }

    // CPU reference at the identical (x, z), timed on this same main thread.
    const cpuStart = performance.now();
    const diffs = new Float64Array(COUNT * COUNT);
    let max = 0;
    let maxI = -1;
    for (let row = 0; row < COUNT; row += 1) {
      const z = grid.originZ + row * grid.pitch;
      for (let col = 0; col < COUNT; col += 1) {
        const x = grid.originX + col * grid.pitch;
        const i = row * COUNT + col;
        const d = Math.abs(
          gpu[i]! - worldBaseHeightAt(spec.config, spec.plateau, spec.cityElevation, x, z),
        );
        diffs[i] = d;
        if (d > max) {
          max = d;
          maxI = i;
        }
      }
    }
    const cpuMs = performance.now() - cpuStart;

    const sorted = Array.from(diffs).sort((a, b) => a - b);
    const over = sorted.filter((d) => d > TOLERANCE_M).length;
    const p99 = percentile(sorted, 0.99);
    const p999 = percentile(sorted, 0.999);

    if (max > globalMax) {
      globalMax = max;
      globalMaxAt = {
        grid: grid.name,
        x: grid.originX + (maxI % COUNT) * grid.pitch,
        z: grid.originZ + Math.floor(maxI / COUNT) * grid.pitch,
      };
    }

    results.push({
      grid: grid.name,
      samples: COUNT * COUNT,
      maxDiffM: +max.toFixed(6),
      p99M: +p99.toFixed(6),
      p999M: +p999.toFixed(6),
      overTolerance: over,
      gpuMs: +gpuMs.toFixed(2),
      cpuMs: +cpuMs.toFixed(2),
      speedup: +(cpuMs / gpuMs).toFixed(2),
    });
  }

  report({
    adapter,
    count: COUNT,
    toleranceM: TOLERANCE_M,
    pass: globalMax <= TOLERANCE_M && results.every((r) => r.error === undefined),
    globalMaxDiffM: +globalMax.toFixed(6),
    globalMaxAt,
    rasterizedJobs: rasterizer.rasterizedJobs,
    grids: results,
  });
  (window as unknown as { __PARITY_DONE?: boolean }).__PARITY_DONE = true;
}

main().catch((err) => {
  report({ error: String(err), stack: err instanceof Error ? err.stack : undefined });
  (window as unknown as { __PARITY_DONE?: boolean }).__PARITY_DONE = true;
});
