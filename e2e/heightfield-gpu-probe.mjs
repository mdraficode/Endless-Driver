/**
 * Endless Driver — Phase 11.0d in-game wiring probe (WebGPU only).
 *
 * Boots the game on the WebGPU backend and reads the terrain stats the driver installs:
 *   terrainGpuHeightfield      1 = the GPU base rasteriser is live
 *   terrainGpuHeightfieldJobs  chunk base grids rasterised by the GPU so far
 *   terrainGpuHeightfieldMs    cumulative dispatch→read-back time (ms)
 *   terrainGpuHeightfieldPending chunks awaiting their read-back
 * plus the CPU fallback bookkeeping (generator mode, worker backlog, builds).
 *
 * This is the in-game half of the 11.0d tier-C acceptance: on a real WebGPU device the
 * `terrainGpuHeightfieldJobs` counter should climb and the per-chunk base cost should sit
 * well under the CPU sampler's (the standalone `e2e/heightfield-parity.mjs` harness
 * measures the two against each other on the same device).
 *
 * Usage:  node e2e/heightfield-gpu-probe.mjs [baseUrl]
 *         (baseUrl default: the live Pages build, tier C, WebGPU, debug handle)
 * Needs:  Chromium with WebGPU (playwright's is fine) — the sandbox's SwiftShader
 *         software device works but is far below tier-C class, so its timings say
 *         nothing about the acceptance criterion.
 */
import { chromium } from 'playwright';

const BASE_URL =
  process.argv[2] || 'https://mdraficode.github.io/Endless-Driver/?tier=C&backend=webgpu&debug';
const SETTLE_MS = Number(process.env.SETTLE_MS || 60_000);
const MIN_CHUNKS = Number(process.env.MIN_CHUNKS || 5);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

const t0 = Date.now();
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });

// The debug handle (installed with ?debug) exposes the live diagnostics snapshot.
const readStats = () =>
  page.evaluate(() => {
    const d = window.__ENDLESS_DRIVER__?.getDiagnostics?.();
    const s = d?.contentStats ?? {};
    return {
      ready:
        document.querySelector('#loading-screen')?.hidden === true ||
        window.__ENDLESS_DRIVER__ !== undefined,
      chunksLoaded: s.terrainChunksLoaded ?? 0,
      chunksDesired: s.terrainChunksDesired ?? 0,
      buildsPending: s.terrainBuildsPending ?? 0,
      buildsTotal: s.terrainBuildsTotal ?? 0,
      generatorMode: s.terrainGeneratorMode ?? 0,
      workerBacklog: s.terrainWorkerBacklog ?? 0,
      gpuHeightfield: s.terrainGpuHeightfield ?? 0,
      gpuHeightfieldJobs: s.terrainGpuHeightfieldJobs ?? 0,
      gpuHeightfieldMs: s.terrainGpuHeightfieldMs ?? 0,
      gpuHeightfieldPending: s.terrainGpuHeightfieldPending ?? 0,
    };
  });

// Wait until the initial ring is streamed (a handful of chunks built) or the budget ends.
let last = null;
const deadline = Date.now() + SETTLE_MS;
for (;;) {
  last = await readStats();
  if (last.chunksLoaded >= MIN_CHUNKS) break;
  if (Date.now() > deadline) break;
  await sleep(500);
}
// Let the frame loop settle so the stat counters stop moving.
await sleep(3000);
last = await readStats();

const shaderErrors = consoleErrors.filter((t) =>
  /WebGLProgram|WebGPU|THREE\.TSL|Program Information Log/i.test(t),
);
const result = {
  url: BASE_URL,
  readySeconds: ((Date.now() - t0) / 1000).toFixed(1),
  ...last,
  secondsPerGpuJob:
    last.gpuHeightfieldJobs > 0 && last.gpuHeightfieldMs > 0
      ? (last.gpuHeightfieldMs / last.gpuHeightfieldJobs / 1000).toFixed(3)
      : null,
  pageErrors: pageErrors.slice(0, 5),
  shaderErrorCount: shaderErrors.length,
  shaderErrors: shaderErrors.slice(0, 3),
  verdict:
    last.ready &&
    last.gpuHeightfield === 1 &&
    last.chunksLoaded >= MIN_CHUNKS &&
    pageErrors.length === 0
      ? 'PASS'
      : 'FAIL',
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.verdict === 'PASS' ? 0 : 1);
