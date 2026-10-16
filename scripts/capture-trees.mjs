/**
 * Destructible-vegetation evidence: teleports to the cedar pass, turns off the
 * road into the forest, and holds the throttle. Reports the page's own counters
 * (trees bent/snapped/shattered, debris alive, car speed) before and after, and
 * screenshots the aftermath.
 *
 * Usage: node scripts/capture-trees.mjs --url http://localhost:4176/ --out /tmp/trees.png
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
const out = value('out', '/tmp/trees.png');
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
const veg = async (label) => {
  const d = await diagnostics();
  const stats = d.contentStats;
  const reading = {
    label,
    speedKph: Math.round(d.speedKph),
    contacts: d.contactCount,
    bent: stats.vegetationBent,
    snapped: stats.vegetationSnapped,
    shattered: stats.vegetationShattered,
    stumps: stats.vegetationStumps,
    debris: stats.vegetationDebris,
  };
  console.log(JSON.stringify(reading));
  return reading;
};

// Teleport into the cedars east of the pass road and wait for the streaming
// window to settle (frames, not wall time — the sandbox sim runs slowly), then
// drive east (yaw -1.1 ≈ +X) until the destruction counters move.
const framesOf = async () => (await diagnostics())?.totalFrames ?? 0;
const waitFrames = async (count) => {
  const start = await framesOf();
  await page.waitForFunction(
    (min) => (window.__ENDLESS_DRIVER__?.getDiagnostics()?.totalFrames ?? 0) > min,
    start + count,
    { timeout: 900_000 },
  );
};
await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(-398, -992, -1.1));
await waitFrames(90);
await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(-398, -992, -1.1));
const before = await veg('before');
await page.keyboard.down('ArrowUp');
let after = before;
for (let attempt = 0; attempt < 24; attempt += 1) {
  await page.waitForTimeout(10_000);
  after = await veg(`driving-${attempt}`);
  if (after.bent + after.snapped + after.shattered > 0) break;
}
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(4_000);
after = await veg('after');
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out, timeout: 280_000 });
await writeFile(`${out}.json`, JSON.stringify({ url, before, after, errors }, null, 2));
console.log(JSON.stringify({ errors: errors.length, before, after }));
await browser.close();
if (errors.length > 0) process.exitCode = 1;
