/* Endless Driver — user-level smoke test on a fully fresh seed.
 *
 * Loads a production build with a random world (no ?seed=), waits for ready,
 * then drives like a player: throttle, corner, pause menu, resume,
 * brake-to-stop — reading live speed from the F2 diagnostics overlay.
 *
 * Base URL: set BASE_URL env to test a local dev server; default = live Pages.
 * Fails on: page errors, console errors (incl. any shader compile error),
 * no motion, pause menu not opening, or a dead canvas (no triangles).
 */
const { chromium } = require('playwright');

const URL =
  process.env.BASE_URL || 'https://mdraficode.github.io/Endless-Driver/?tier=C&backend=webgl2';
const SHOTS = process.env.SHOTS_DIR || '/tmp/e2e-shots';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHADER_ERROR = /WebGLProgram|ERROR: \d+:\d+:|THREE\.TSL|Program Information Log/;

(async () => {
  const fs = require('fs');
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const VW = parseInt(process.env.VIEWPORT_W || '960', 10);
  const VH = parseInt(process.env.VIEWPORT_H || '540', 10);
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });

  const pageErrors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      consoleErrors.push(text);
      console.error('[console:error] ' + text.slice(0, 4000));
    } else if (msg.type() === 'warning') consoleWarnings.push(text);
  });
  page.on('crash', () => console.error('[page] CRASHED'));

  const result = {
    url: URL,
    seedSource: 'fresh (no ?seed= parameter — random world per launch)',
    worldSeed: null,
    buildTag: null,
    renderer: null,
    triangles: null,
    drawCalls: null,
    readySeconds: null,
    speedAfterThrottleKph: null,
    speedAfterCornerKph: null,
    speedAfterBrakeKph: null,
    pauseMenuOpened: false,
    pauseMenuHasTuning: false,
    shaderErrors: [],
    pageErrors,
    consoleErrors,
    consoleWarningCount: 0,
  };

  const shot = async (name) => {
    try {
      await page.screenshot({ path: `${SHOTS}/${name}`, timeout: 15000 });
      result.shots = result.shots || [];
      result.shots.push(name);
    } catch (e) {
      result.shotFailures = result.shotFailures || [];
      result.shotFailures.push(name + ': ' + e.message.split('\n')[0]);
    }
  };

  const readRow = async (label) =>
    page.evaluate((l) => {
      const dt = Array.from(document.querySelectorAll('dt')).find(
        (d) => d.textContent.trim() === l,
      );
      if (!dt || !dt.nextElementSibling) return null;
      return dt.nextElementSibling.textContent.trim();
    }, label);

  const parseSpeed = (text) => {
    if (text === null) return null;
    const m = text.match(/^(-?[\d.]+)\s*km\/h$/);
    return m ? parseFloat(m[1]) : null;
  };

  // Poll a diagnostics row until it shows a real (non '—') value.
  const pollRow = async (label, ms) => {
    const t0 = Date.now();
    for (;;) {
      const v = await readRow(label);
      if (v !== null && v !== '—') return v;
      if (Date.now() - t0 > ms) return v;
      await sleep(400);
    }
  };

  const openDiagnostics = async () => {
    // The canvas must have focus for key events to route to the game input.
    await page.mouse.click(Math.round(VW / 2), Math.round(VH / 2));
    await sleep(200);
    await page.keyboard.press('F2');
  };

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#loading-screen');
        return el !== null && el.hidden === true;
      },
      { timeout: 300000 },
    );
  } catch {
    const failMsg = await page.evaluate(() => {
      const el = document.querySelector('#loading-screen');
      return el ? el.textContent.slice(0, 300) : 'no loading screen element';
    });
    result.failure = `game never reached ready state; loading text: ${failMsg}`;
    await shot('00-failure.png');
  }
  result.readySeconds = ((Date.now() - t0) / 1000).toFixed(1);

  console.error('[smoke] ready, settling...');
  await sleep(3000);
  await shot('01-ready.png');

  // Diagnostics overlay: build tag, seed, render stats, live speed.
  await openDiagnostics();
  const buildTag = await pollRow('Build', 10000);
  if (buildTag === null || buildTag === '—' || buildTag === 'unknown') {
    await openDiagnostics();
    await openDiagnostics(); // toggle off/on if the first press was eaten
    result.buildTag = await pollRow('Build', 10000);
  } else {
    result.buildTag = buildTag;
  }
  result.renderer = (await readRow('Renderer')) ?? null;
  result.worldSeed = (await pollRow('World seed', 5000)) ?? null;
  const triText = await pollRow('Triangles', 5000);
  result.triangles = triText ? parseInt(triText.replace(/[^0-9]/g, ''), 10) : null;
  result.drawCalls = (await readRow('Draw calls')) ?? null;
  console.error(
    '[smoke] buildTag=' +
      result.buildTag +
      ' renderer=' +
      result.renderer +
      ' seed=' +
      result.worldSeed +
      ' tris=' +
      result.triangles,
  );

  // Throttle for 10 s (0 → speed).
  const s0 = parseSpeed(await readRow('Speed'));
  await page.keyboard.down('ArrowUp');
  await sleep(10000);
  result.speedAfterThrottleKph = parseSpeed(await pollRow('Speed', 6000));
  console.error('[smoke] speed start=' + s0 + ' after throttle: ' + result.speedAfterThrottleKph);
  // Corner right for 6 s while holding throttle.
  await page.keyboard.down('ArrowRight');
  await sleep(6000);
  await shot('02-corner.png');
  await page.keyboard.up('ArrowRight');
  await sleep(3000);
  result.speedAfterCornerKph = parseSpeed(await pollRow('Speed', 6000));

  // Pause menu (Escape) — must open and carry the 12.1 tuning section.
  await page.keyboard.up('ArrowUp');
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(1000);
  result.pauseMenuOpened = await page.evaluate(() => {
    const root = document.querySelector('#pause-menu-root');
    if (root === null) return false;
    const el = root.firstElementChild ?? root;
    return el.getBoundingClientRect().width > 100;
  });
  const pauseText = await page.evaluate(() =>
    (document.querySelector('#pause-menu-root')?.textContent ?? '').slice(0, 4000),
  );
  result.pauseMenuHasTuning = /handling|tuning/i.test(pauseText) && /arcade|sport/i.test(pauseText);
  await shot('03-pause.png');

  // Resume, then brake to a stop.
  await page.keyboard.press('Escape');
  await sleep(800);
  await page.keyboard.down('ArrowDown');
  await sleep(8000);
  result.speedAfterBrakeKph = parseSpeed(await pollRow('Speed', 6000));
  await page.keyboard.up('ArrowDown');
  await shot('04-after-brake.png');

  result.shaderErrors = consoleErrors.filter((t) => SHADER_ERROR.test(t));
  result.consoleWarningCount = consoleWarnings.length;
  result.consoleWarningsSample = consoleWarnings.slice(0, 5);

  // Verdict.
  const motion =
    typeof result.speedAfterThrottleKph === 'number' && result.speedAfterThrottleKph > 15;
  const rendered = typeof result.triangles === 'number' && result.triangles > 50000;
  result.verdict =
    pageErrors.length === 0 &&
    consoleErrors.length === 0 &&
    motion &&
    rendered &&
    result.pauseMenuOpened &&
    result.readySeconds !== null
      ? 'PASS'
      : 'FAIL';
  if (result.readySeconds === null) result.verdict = 'FAIL';

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  process.exit(result.verdict === 'PASS' ? 0 : 1);
})().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(2);
});
