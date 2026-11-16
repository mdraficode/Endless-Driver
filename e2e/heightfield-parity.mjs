// Phase 11.0d — GPU heightfield parity driver (sandbox-only; e2e is not in CI).
//
// Builds the parity page (its own Vite root), serves it statically, opens it in Chromium
// with WebGPU enabled, waits for the in-page harness to finish the 4×512² GPU-vs-CPU
// comparison, and prints the result JSON (also written to heightfield-parity/result.json).
//
// Usage: node e2e/heightfield-parity.mjs
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

// Build the parity page once (static), then serve it with a plain HTTP server — the Vite
// dev server's transform pipeline is too heavy for the 2 GB sandbox alongside SwiftShader.
const build = spawn(
  process.execPath,
  [
    join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--config',
    'e2e/heightfield-parity/vite.config.mjs',
    'build',
  ],
  { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
);
let buildLog = '';
build.stdout.on('data', (d) => {
  buildLog += d;
});
build.stderr.on('data', (d) => {
  buildLog += d;
});
const buildExit = await new Promise((resolve) => {
  build.on('exit', (code) => resolve(code ?? -1));
});
if (buildExit !== 0) {
  throw new Error(`parity page build failed:\n${buildLog}`);
}

const server = spawn(
  'python3',
  [
    '-m',
    'http.server',
    '4199',
    '--bind',
    '127.0.0.1',
    '--directory',
    join(here, 'heightfield-parity', 'dist'),
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverLog = '';
server.stdout.on('data', (d) => {
  serverLog += d;
});
server.stderr.on('data', (d) => {
  serverLog += d;
});

const COUNT = process.argv[2] ?? '';
const url = `http://127.0.0.1:4199/${COUNT ? `?count=${COUNT}` : ''}`;
async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`static server did not come up:\n${serverLog}`);
}

try {
  await waitForServer();

  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--mute-audio'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') {
        console.error(`[page:${m.type()}] ${m.text()}`);
      }
    });
    page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'log') console.log(`[page] ${m.text()}`);
    });

    console.log(`opening ${url} …`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => window.__PARITY_DONE === true, null, {
      timeout: 600_000,
      polling: 250,
    });
    const text = await page.$eval('#out', (el) => el.textContent ?? '');
    const result = JSON.parse(text);
    console.log(text);
    writeFileSync(join(here, 'heightfield-parity', 'result.json'), text + '\n');

    const shaders = await page.evaluate(() => window.__SHADERS ?? []);
    if (shaders.length > 0) {
      writeFileSync(
        join(here, 'heightfield-parity', 'shaders.wgsl'),
        shaders.map((s, i) => `// ===== shader ${i} =====\n${s}`).join('\n\n'),
      );
      console.log(`captured ${shaders.length} shader(s) -> heightfield-parity/shaders.wgsl`);
    }

    process.exitCode = result.pass === true ? 0 : 1;
  } finally {
    await browser.close();
  }
} finally {
  server.kill('SIGTERM');
}
