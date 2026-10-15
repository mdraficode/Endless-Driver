/**
 * Touch-controls capture: boots the game in an emulated phone (touch, landscape),
 * proves the on-screen joystick/pedals actually drive the car via CDP touch events,
 * and records screenshots + diagnostics. A second portrait page proves the
 * rotate-to-landscape prompt. Software rendering proves correctness, not frame rate.
 *
 * Usage: node scripts/capture-touch.mjs --url http://localhost:4176/ --outdir /tmp/touch
 */
/* global window, document, getComputedStyle:readonly -- page.evaluate callbacks run in the browser */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const baseUrl = value('url', 'http://localhost:4176/');
const outdir = value('outdir', '/tmp/touch');
await mkdir(outdir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const errors = [];
const watch = (page) => {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
};

async function boot(width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  watch(page);
  await page.goto(`${baseUrl}?tier=C&debug=1&touch=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForFunction(() => window.__ENDLESS_DRIVER__ !== undefined, null, {
    timeout: 240_000,
  });
  await page.waitForFunction(
    () => {
      const d = window.__ENDLESS_DRIVER__?.getDiagnostics();
      return (
        d !== undefined &&
        d.totalFrames > 40 &&
        d.contentStats?.terrainSurfacesLoaded === 1 &&
        d.contentStats?.terrainChunksLoaded >= d.contentStats?.terrainChunksDesired - 4
      );
    },
    null,
    { timeout: 900_000 },
  );
  return { context, page };
}

// --- Landscape: controls visible, multi-touch drive ---
const { context, page } = await boot(844, 390);
const centre = (selector) =>
  page.evaluate((sel) => {
    const rect = document.querySelector(sel)?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  }, selector);
await page.screenshot({ path: join(outdir, 'landscape-idle.png'), timeout: 280_000 });

const cdp = await context.newCDPSession(page);
const gas = await centre('.touch-pedal-gas');
const joy = await centre('.touch-joystick');
if (gas === null || joy === null) {
  throw new Error('touch controls not found in the DOM');
}
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
// Thumb 1 holds GAS; thumb 2 pushes the joystick left (multi-touch).
await touch('touchStart', [{ x: gas.x, y: gas.y, id: 1 }]);
await touch('touchStart', [
  { x: gas.x, y: gas.y, id: 1 },
  { x: joy.x, y: joy.y, id: 2 },
]);
await touch('touchMove', [
  { x: gas.x, y: gas.y, id: 1 },
  { x: joy.x - 45, y: joy.y, id: 2 },
]);
await page.waitForTimeout(9000);
const driving = await page.evaluate(() => window.__ENDLESS_DRIVER__?.getDiagnostics());
await page.screenshot({ path: join(outdir, 'landscape-driving.png'), timeout: 280_000 });
await touch('touchEnd', [
  { x: gas.x, y: gas.y, id: 1 },
  { x: joy.x - 45, y: joy.y, id: 2 },
]);
// Software frames are seconds apart, so poll until the car has actually let go
// (throttle decayed, steering re-centred) instead of sleeping a fixed interval.
await page.waitForFunction(
  () => {
    const d = window.__ENDLESS_DRIVER__?.getDiagnostics();
    return d !== undefined && d.throttle < 0.05 && Math.abs(d.steerAngleDegrees) < 2;
  },
  null,
  { timeout: 300_000 },
);
const released = await page.evaluate(() => window.__ENDLESS_DRIVER__?.getDiagnostics());
await writeFile(
  join(outdir, 'landscape.json'),
  JSON.stringify({ driving, released, errors }, null, 2),
);
console.log(
  JSON.stringify(
    {
      phase: 'landscape',
      throttleDriving: driving.throttle,
      steerDegrees: driving.steerAngleDegrees,
      speedKph: driving.speedKph,
      contacts: driving.contactCount,
      throttleAfterRelease: released.throttle,
      errors: errors.length,
    },
    null,
    2,
  ),
);
await context.close();

// --- Portrait: rotate prompt ---
const portrait = await boot(390, 844);
const rotateVisible = await portrait.page.evaluate(() => {
  const el = document.querySelector('.rotate-overlay');
  return el ? getComputedStyle(el).display : 'missing';
});
await portrait.page.screenshot({
  path: join(outdir, 'portrait-rotate.png'),
  timeout: 280_000,
});
await writeFile(
  join(outdir, 'portrait.json'),
  JSON.stringify({ rotateOverlayDisplay: rotateVisible, errors }, null, 2),
);
console.log(
  JSON.stringify({ phase: 'portrait', rotateOverlayDisplay: rotateVisible, errors: errors.length }),
);
await portrait.context.close();
await browser.close();
if (errors.length > 0) {
  process.exitCode = 1;
}
