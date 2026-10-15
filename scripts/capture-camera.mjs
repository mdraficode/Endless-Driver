/**
 * Camera-view evidence: loads the game, teleports to the mountain junction, then
 * presses C (the player's camera control) until each chase distance view is active,
 * screenshotting every one. The view name in each shot comes from the diagnostics
 * the page itself reports — not from counting presses.
 *
 * Usage: node scripts/capture-camera.mjs --url http://localhost:4176/ --out /tmp/camera
 *        (writes <out>-close.png, <out>-normal.png, <out>-far.png + sidecars)
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
const outPrefix = value('out', '/tmp/camera');
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
const framesOf = async () => (await diagnostics())?.totalFrames ?? 0;
const waitFrames = async (count) => {
  const start = await framesOf();
  await page.waitForFunction(
    (min) => (window.__ENDLESS_DRIVER__?.getDiagnostics()?.totalFrames ?? 0) > min,
    start + count,
    { timeout: 900_000 },
  );
};

// Settle at the junction (a frame-rich spot: road ahead, valley behind).
await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(-30, -352, 0.5));
await waitFrames(75);
await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(-30, -352, 0.5));

const results = {};
for (const target of ['Normal', 'Close', 'Far']) {
  // Press C until diagnostics report the target view (cycle: views, orbit, views…).
  for (let press = 0; press < 6; press += 1) {
    const current = (await diagnostics())?.cameraView;
    if (current === target) break;
    await page.keyboard.press('KeyC');
    await waitFrames(30); // let the glide land before judging the framing
  }
  const settled = await diagnostics();
  const out = `${outPrefix}-${target.toLowerCase()}.png`;
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out, timeout: 280_000 });
  await writeFile(
    `${out}.json`,
    JSON.stringify({ url, view: target, diagnostics: settled, errors }, null, 2),
  );
  results[target] = {
    out,
    view: settled?.cameraView,
    cameraDistanceMeters: settled
      ? Math.hypot(
          settled.cameraPosition.x - settled.carPosition.x,
          settled.cameraPosition.z - settled.carPosition.z,
        )
      : null,
  };
  console.log(JSON.stringify(results[target]));
}
console.log(JSON.stringify({ errors: errors.length, results }, null, 2));
await browser.close();
if (errors.length > 0) process.exitCode = 1;
