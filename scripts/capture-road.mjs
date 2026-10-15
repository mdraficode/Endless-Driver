/**
 * Road capture: boots the real game headlessly, teleports the car onto the road network
 * (debug handle), waits for the streamed terrain window to settle around the new spot,
 * optionally rolls forward, and records a screenshot + diagnostics JSON beside it.
 *
 * Software rendering proves correctness, never frame rate (AGENTS.md).
 *
 * Usage: node scripts/capture-road.mjs --url http://localhost:4176/ --out /tmp/road.png
 *        [--at "0,-168"] [--drive 20] [--params "tier=C"]
 */
/* global window:readonly -- the page.evaluate callbacks run in the browser */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const baseUrl = value('url', 'http://localhost:4176/');
const out = value('out', '/tmp/road.png');
const at = value('at', '0,-168').split(',').map(Number);
const driveSeconds = Number(value('drive', '0'));
const params = value('params', 'tier=C');

const url = `${baseUrl}?${params}&debug=1`;
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
const framesOf = async () =>
  page.evaluate(() => window.__ENDLESS_DRIVER__?.getDiagnostics()?.totalFrames ?? 0);
const startFrames = await framesOf();
await page.waitForFunction(
  (min) => (window.__ENDLESS_DRIVER__?.getDiagnostics()?.totalFrames ?? 0) > min,
  startFrames + 60,
  { timeout: 900_000 },
);
await page.evaluate(([x, z]) => window.__ENDLESS_DRIVER__?.teleportCar?.(x, z), at);
// Streaming must rebuild the chunk window around the teleported car before the shot.
await page.waitForFunction(
  ([tx, tz]) => {
    const diagnostics = window.__ENDLESS_DRIVER__?.getDiagnostics();
    const stats = diagnostics?.contentStats;
    const car = diagnostics?.carPosition;
    // Guard against the pre-teleport window satisfying the counts for one frame: the
    // car must be at the target AND the window settled around it.
    return (
      stats !== undefined &&
      car !== undefined &&
      Math.hypot(car.x - tx, car.z - tz) < 2 &&
      stats.terrainChunksLoaded >= stats.terrainChunksDesired - 4 &&
      stats.terrainBuildsPending === 0 &&
      stats.roadSurfacesLoaded === 1
    );
  },
  at,
  { timeout: 900_000 },
);
if (driveSeconds > 0) {
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(driveSeconds * 1000);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(1500);
}
const diagnostics = await page.evaluate(() => window.__ENDLESS_DRIVER__?.getDiagnostics());
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out, timeout: 280_000 });
await writeFile(
  `${out}.json`,
  JSON.stringify({ url, at, driveSeconds, diagnostics, errors }, null, 2),
);
console.log(JSON.stringify({ out, errors: errors.length, diagnostics }, null, 2));
await browser.close();
