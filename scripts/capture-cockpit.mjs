#!/usr/bin/env node
/**
 * Captures the real mobile-width cockpit view after loading the driving scene and settling the car
 * at a fixed road location. The same capture can be repeated after every camera-anchor change.
 *
 * Usage: node scripts/capture-cockpit.mjs --url http://localhost:4176/ --out /tmp/cockpit.png
 *        Optional: --params "backend=webgl&tier=C&touch=1&time=12" --width 1568 --height 704
 */
/* global window:readonly -- the page.evaluate/waitForFunction callbacks run in the browser */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const baseUrl = value('url', 'http://localhost:4176/');
const out = value('out', '/tmp/cockpit.png');
const width = Number(value('width', '1568'));
const height = Number(value('height', '704'));
const params = new URLSearchParams(value('params', 'backend=webgl&tier=C&debug=1&touch=1&time=12'));
const url = new URL(baseUrl);
url.search = params.toString();

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__ENDLESS_DRIVER__ !== undefined, null, {
    timeout: 240_000,
  });
  const diagnostics = async () => page.evaluate(() => window.__ENDLESS_DRIVER__?.getDiagnostics());
  const framesOf = async () => (await diagnostics())?.totalFrames ?? 0;
  const waitFrames = async (count) => {
    const start = await framesOf();
    await page.waitForFunction(
      (minimum) => (window.__ENDLESS_DRIVER__?.getDiagnostics()?.totalFrames ?? 0) > minimum,
      start + count,
      { timeout: 900_000 },
    );
  };

  await waitFrames(90);
  await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(-30, -352, 0.5));
  await waitFrames(75);
  await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(-30, -352, 0.5));

  for (let press = 0; press < 8; press += 1) {
    if ((await diagnostics())?.cameraMode === 'cockpit') break;
    await page.keyboard.press('KeyC');
    await waitFrames(30);
  }
  const settled = await diagnostics();
  if (settled?.cameraMode !== 'cockpit') {
    throw new Error(
      `capture did not reach Cockpit mode: ${settled?.cameraMode ?? 'no diagnostics'}`,
    );
  }
  await waitFrames(60);
  const finalDiagnostics = await diagnostics();
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out, timeout: 280_000 });
  await writeFile(
    `${out}.json`,
    JSON.stringify(
      { url: url.toString(), width, height, diagnostics: finalDiagnostics, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ out, cameraMode: finalDiagnostics?.cameraMode, errors }, null, 2));
} finally {
  await browser.close();
}
if (errors.length > 0) process.exitCode = 1;
