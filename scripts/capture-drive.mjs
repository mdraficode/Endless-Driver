/**
 * Drive-scene capture: boots the real game scene headlessly, optionally holds the
 * throttle, and records a screenshot plus the diagnostics snapshot (terrain chunk counts,
 * build budget, triangle count) as JSON beside it.
 *
 * Usage: node scripts/capture-drive.mjs --url http://localhost:4175/ --out /tmp/drive.png
 *        [--drive 6] [--params "tier=B&time=9.5"]
 *
 * Software rendering only proves the scene is correct, never that it is fast (AGENTS.md).
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
const baseUrl = value('url', 'http://localhost:4175/');
const out = value('out', '/tmp/drive.png');
const driveSeconds = Number(value('drive', '0'));
const params = value('params', 'tier=B');

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
  startFrames + 90,
  { timeout: 600_000 },
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
await writeFile(`${out}.json`, JSON.stringify({ url, driveSeconds, diagnostics, errors }, null, 2));
console.log(JSON.stringify({ out, errors: errors.length, diagnostics }, null, 2));
await browser.close();
