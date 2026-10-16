/**
 * Near-tier terrain POM evidence (Phase 4): teleports onto the spawn grass,
 * waits for the near LOD ring to stream in, and reports the page's own POM
 * counters (active flag, raymarch steps, POM-material chunks) plus a close
 * screenshot of the ground the chase camera actually looks at.
 *
 * Usage: node scripts/capture-pom.mjs --url http://localhost:4176/ --out /tmp/pom.png
 */
/* global window -- the page.evaluate callbacks run in the browser */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const baseUrl = value('url', 'http://localhost:4176/');
const out = value('out', '/tmp/pom.png');
const url = `${baseUrl}?tier=C&debug=1`;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForFunction(() => window.__ENDLESS_DRIVER__ !== undefined, null, {
  timeout: 240_000,
});
const diagnostics = async () => page.evaluate(() => window.__ENDLESS_DRIVER__?.getDiagnostics());
const reading = async (label) => {
  const d = await diagnostics();
  const stats = d.contentStats;
  const result = {
    label,
    surfacesLoaded: stats.terrainSurfacesLoaded,
    pomActive: stats.terrainPomActive,
    pomSteps: stats.terrainPomSteps,
    pomChunks: stats.terrainPomChunks,
    chunksLoaded: stats.terrainChunksLoaded,
    drawCalls: d.drawCalls,
  };
  console.log(JSON.stringify(result));
  return result;
};
const framesOf = async () => (await diagnostics())?.totalFrames ?? 0;
const waitFrames = async (count) => {
  const start = await framesOf();
  await page.waitForFunction(
    (min) => (window.__ENDLESS_DRIVER__?.getDiagnostics()?.totalFrames ?? 0) > min,
    start + count,
    { timeout: 900_000 },
  );
};

// Just off the spawn pad's flat heart, on grass, facing north: the chase
// camera sits ~2 m up, so the foreground is all near-tier ground at grazing
// angles — exactly where POM earns its cost.
await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(30, 34, 0));
await waitFrames(120);
await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(30, 34, 0));
await waitFrames(60);
const settled = await reading('settled');
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out, timeout: 280_000 });
await writeFile(`${out}.json`, JSON.stringify({ url, settled, errors }, null, 2));
console.log(JSON.stringify({ errors: errors.length, settled }));
await browser.close();
if (errors.length > 0) process.exitCode = 1;
