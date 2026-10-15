/**
 * Chase-camera distance-at-speed evidence: teleports onto the straight road north
 * of the junction, holds the throttle, and records what the page itself reports —
 * speed and the actual camera↔car distance, standing still and at pace. The
 * distance must be the same in both (velocity feed-forward, ChaseCamera).
 *
 * Usage: node scripts/capture-speedcam.mjs --url http://localhost:4176/ --out /tmp/speedcam.png
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
const out = value('out', '/tmp/speedcam.png');
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
const measure = async (label) => {
  const d = await diagnostics();
  const distance = Math.hypot(
    d.cameraPosition.x - d.carPosition.x,
    d.cameraPosition.z - d.carPosition.z,
  );
  const reading = {
    label,
    view: d.cameraView,
    speedKph: Math.round(d.speedKph),
    cameraDistanceMeters: Number(distance.toFixed(2)),
    contacts: d.contactCount,
  };
  console.log(JSON.stringify(reading));
  return reading;
};

// On the straight, facing north (yaw PI faces -Z in this game's convention via 0.5 turn).
await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(-30, -352, 3.14159));
await page.waitForTimeout(12_000);
const still = await measure('standing');

await page.keyboard.down('ArrowUp');
// SwiftShader simulation runs far slower than wall clock; poll until genuinely fast.
let fast = still;
for (let attempt = 0; attempt < 24; attempt += 1) {
  await page.waitForTimeout(5_000);
  fast = await measure(`driving-${attempt}`);
  if (fast.speedKph >= 80) break;
}
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out, timeout: 280_000 });
await page.keyboard.up('ArrowUp');
await writeFile(`${out}.json`, JSON.stringify({ url, still, fast, errors }, null, 2));
console.log(JSON.stringify({ errors: errors.length, still, fast }));
await browser.close();
if (errors.length > 0) process.exitCode = 1;
