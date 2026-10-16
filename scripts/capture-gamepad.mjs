/**
 * Gamepad evidence: injects a fake standard-mapping controller before the page
 * boots (left stick + RT), then drives with it. Proof is the page's own
 * telemetry: throttle follows the trigger, speed builds, and a stick steer
 * bends the car's heading — no keyboard is touched.
 *
 * Usage: node scripts/capture-gamepad.mjs --url http://localhost:4176/ --out /tmp/gamepad.png
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
const out = value('out', '/tmp/gamepad.png');
const url = `${baseUrl}?tier=C&debug=1`;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
// A standard-mapping pad whose state the test drives via window.__pad.
await page.addInitScript(() => {
  window.__pad = { steer: 0, throttle: 0 };
  const makePad = () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[7] = { pressed: window.__pad.throttle > 0, value: window.__pad.throttle };
    return {
      connected: true,
      mapping: 'standard',
      axes: [window.__pad.steer, 0, 0, 0],
      buttons,
    };
  };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [makePad()] });
});
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForFunction(() => window.__ENDLESS_DRIVER__ !== undefined, null, {
  timeout: 240_000,
});
const diagnostics = async () => page.evaluate(() => window.__ENDLESS_DRIVER__?.getDiagnostics());
const reading = async (label) => {
  const d = await diagnostics();
  const result = {
    label,
    throttle: Math.round(d.throttle * 100) / 100,
    speedKph: Math.round(d.speedKph),
    headingDeg: Math.round(d.carHeadingDegrees),
    steerDeg: Math.round(d.steerAngleDegrees * 10) / 10,
    cameraView: d.cameraView,
    cameraFov: Math.round(d.cameraFov),
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

await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(0, 30, 0));
await waitFrames(75);
await page.evaluate(() => window.__ENDLESS_DRIVER__?.teleportCar?.(0, 30, 0));
const idle = await reading('idle');

// Full RT, straight stick: the car must launch on the trigger alone.
await page.evaluate(() => {
  window.__pad.throttle = 1;
});
let launched = idle;
for (let attempt = 0; attempt < 20 && launched.speedKph < 25; attempt += 1) {
  await page.waitForTimeout(6_000);
  launched = await reading(`launch-${attempt}`);
}
// Half stick right: the front wheels and the heading must answer.
const headingBefore = launched.headingDeg;
await page.evaluate(() => {
  window.__pad.steer = 0.55;
});
let turned = launched;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await page.waitForTimeout(6_000);
  turned = await reading(`turn-${attempt}`);
  if (Math.abs(turned.steerDeg) > 2 && Math.abs(turned.headingDeg - headingBefore) > 3) break;
}
await page.evaluate(() => {
  window.__pad.throttle = 0;
  window.__pad.steer = 0;
});
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out, timeout: 280_000 });
await writeFile(`${out}.json`, JSON.stringify({ url, idle, launched, turned, errors }, null, 2));
console.log(JSON.stringify({ errors: errors.length, idle, launched, turned }));
await browser.close();
if (errors.length > 0) process.exitCode = 1;
