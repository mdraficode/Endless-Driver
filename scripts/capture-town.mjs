/**
 * Yūhi Town build-out evidence (Phase 4 Increment 5b): screenshots the town
 * junction, then proves the collision contract in the live build — the car
 * stops at a building face, and a hard hit folds a utility pole (the page's
 * own `townPolesDown` counter flips, speed bleeds).
 *
 * Usage: node scripts/capture-town.mjs --url http://localhost:4176/ --out /tmp/town.png
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
const out = value('out', '/tmp/town.png');
const url = `${baseUrl}?tier=C&debug=1`;

// Deterministic placements (src/world/town.ts over the seeded map): the tall
// building just NE of the town junction, and a pole on the east-plain road.
const BUILDING = { x: 551.0812395352871, z: 311.03900572988204 };
const POLE = { x: 545.503071145747, z: 261.13044290686383 };

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
    speedKph: Math.round(d.speedKph),
    carX: Math.round(d.carPosition.x * 10) / 10,
    carZ: Math.round(d.carPosition.z * 10) / 10,
    buildings: stats.townBuildings,
    poles: stats.townPoles,
    polesDown: stats.townPolesDown,
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
const teleport = async (x, z, yaw) => {
  await page.evaluate(
    ([tx, tz, ty]) => window.__ENDLESS_DRIVER__?.teleportCar?.(tx, tz, ty),
    [x, z, yaw],
  );
  await waitFrames(75);
  await page.evaluate(
    ([tx, tz, ty]) => window.__ENDLESS_DRIVER__?.teleportCar?.(tx, tz, ty),
    [x, z, yaw],
  );
};
const driveUntil = async (predicate, label) => {
  await page.keyboard.down('ArrowUp');
  let last = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.waitForTimeout(8_000);
    last = await reading(`${label}-${attempt}`);
    if (predicate(last)) break;
  }
  await page.keyboard.up('ArrowUp');
  return last;
};

await mkdir(dirname(out), { recursive: true });

// 1) The town from its junction.
await teleport(540, 300, -0.7);
const townView = await reading('town');
await page.screenshot({ path: out, timeout: 280_000 });

// 2) Buildings are solid: drive north into the tall building's face and stop.
await teleport(BUILDING.x, BUILDING.z + 14, 0);
const beforeBuilding = await reading('building-before');
const buildingHit = await driveUntil(
  (r) =>
    r.speedKph <= 1 &&
    Math.hypot(r.carX - BUILDING.x, r.carZ - BUILDING.z) < 8 &&
    Math.hypot(r.carX - BUILDING.x, r.carZ - BUILDING.z) > 3,
  'building',
);
await page.waitForTimeout(3_000);
const buildingRest = await reading('building-rest');
await page.screenshot({ path: out.replace('.png', '-building.png'), timeout: 280_000 });

// 3) Poles fold: drive north into the roadside pole and knock it down.
await teleport(POLE.x, POLE.z + 12, 0);
const beforePole = await reading('pole-before');
const poleHit = await driveUntil((r) => r.polesDown > beforePole.polesDown, 'pole');
await page.waitForTimeout(3_000);
const poleRest = await reading('pole-rest');
await page.screenshot({ path: out.replace('.png', '-pole.png'), timeout: 280_000 });

const summary = {
  townView,
  beforeBuilding,
  buildingHit,
  buildingRest,
  beforePole,
  poleHit,
  poleRest,
  errors,
};
await writeFile(`${out}.json`, JSON.stringify({ url, ...summary }, null, 2));
console.log(JSON.stringify({ errors: errors.length, summary }));
await browser.close();
if (errors.length > 0) process.exitCode = 1;
