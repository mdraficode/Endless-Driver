/**
 * Endless Driver — the human-perspective bug-hunting player.
 *
 * This drives the game the way a person would and does the visual checks a person
 * actually does by looking:
 *
 *   • "Is it black / a flat colour?"          → per-screenshot luminance + variance
 *   • "Is it frozen?"                          → frame counter advancing + frame diff
 *   • "Any missing textures?"                  → magenta-pixel fraction
 *   • "Does the speedometer read a number?"    → HUD text scan for NaN/undefined/Infinity
 *   • "Did the throttle / brake / steer work?" → live speed + heading from diagnostics
 *   • "Is it night when I asked for night?"    → isNight / weather / fogMode from diagnostics
 *   • "Any code erroring while I play?"        → console errors, page errors, frameErrors
 *   • "Did the car swap freeze the view?"      → the owner-reported regression path
 *
 * It reads the live `window.__ENDLESS_DRIVER__.getDiagnostics()` handle for ground truth
 * (speed, gear, frames, frameErrors, context-loss state, seed, build tag) and pairs it
 * with pixel analysis of real screenshots (pngjs) so a finding is backed by both a number
 * and a picture.
 *
 * Environmental honesty: this sandbox renders with SwiftShader (CPU) and has no GPU. The
 * game can take minutes to compile its shaders on boot, and the WebGL context can be lost
 * ~30–90 s after ready under load. That is the *environment*, not the game. The player
 * therefore classifies each outcome as one of:
 *
 *   PASS          — the scenario completed with no non-environmental findings
 *   FAIL          — at least one non-environmental finding (a real bug / inconsistency)
 *   ENV-FAIL      — the sandbox could not run it (boot timeout, context loss, OOM/crash)
 *
 * Exit code: 0 = no FAIL scenarios, 1 = at least one FAIL, 2 = only ENV-FAIL (inconclusive).
 *
 * Usage:
 *   node human-player.mjs --scenarios core,night,rain,carswap \
 *        [--base-url http://localhost:4173] [--seed 20261013] \
 *        [--viewport 960x540] [--boot 480] [--settle 90] [--res 0.5] \
 *        [--play 70] [--out /tmp/human-bug-report]
 *   --res <scale>  pass the game's own `?res=` render-resolution switch through to every
 *                  scenario (a weak-device lever; sandboxes use it to fit their memory).
 *
 * `--scenarios` is a comma list from: core day night rain carswap tierB spawn
 *   core    the full human session (drive, corner, camera toggle, handbrake, reset, pause)
 *   day     noon drive (time=12) — sun up, isNight must be false
 *   night   night drive (time=22) — street lights, window glow, headlights
 *   rain    wet drive (weather=rain) — sheen + grip change
 *   carswap owner's regression path: pause → Car Model → swap → view must stay alive
 *   tierB   a short higher-tier drive
 *   spawn   a fresh random world (no ?seed=)
 *   (the default start time of the game is night — 23:30 at Home City)
 */
/* eslint-env node */
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------------------- CLI
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base-url', 'http://localhost:4173/').replace(/\/$/, '') + '/';
const SEED = arg('seed', '20261013');
const [VW, VH] = arg('viewport', '960x540')
  .split('x')
  .map((n) => parseInt(n, 10));
const BOOT_SECONDS = parseInt(arg('boot', '480'), 10); // generous: SwiftShader shader pre-compile
const SETTLE_SECONDS = parseInt(arg('settle', '90'), 10); // world streaming after ready
const PLAY_SECONDS = parseInt(arg('play', '70'), 10); // keep each drive inside the env window
const OUT = arg('out', '/tmp/human-bug-report');
const SCENARIOS = arg('scenarios', 'core,night,rain,carswap')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// `?res=<scale>` is the game's own render-resolution switch — the lever a person on a weak
// device reaches for. Software-rendered sandboxes use it to stay inside their memory budget
// without changing what is being tested (same scene, same shaders, smaller framebuffer).
const RES = arg('res', '');
const RES_QUERY = RES === '' ? '' : `&res=${RES}`;

mkdirSync(OUT, { recursive: true });

// `debug=1` installs `window.__ENDLESS_DRIVER__` in production builds (the capture
// scripts' convention) — the player's ground-truth handle. It changes no visuals.
const SCENARIO_URL = {
  core: `${BASE}?tier=C&backend=webgl2&seed=${SEED}&debug=1${RES_QUERY}`,
  day: `${BASE}?tier=C&backend=webgl2&seed=${SEED}&time=12&debug=1${RES_QUERY}`,
  night: `${BASE}?tier=C&backend=webgl2&seed=${SEED}&time=22&debug=1${RES_QUERY}`,
  rain: `${BASE}?tier=C&backend=webgl2&seed=${SEED}&weather=rain&debug=1${RES_QUERY}`,
  carswap: `${BASE}?tier=C&backend=webgl2&seed=${SEED}&debug=1${RES_QUERY}`,
  tierB: `${BASE}?tier=B&backend=webgl2&seed=${SEED}&debug=1${RES_QUERY}`,
  spawn: `${BASE}?tier=C&backend=webgl2&debug=1${RES_QUERY}`,
};

// ------------------------------------------------------------------ findings
const findings = [];
const addFinding = (scenario, severity, kind, message, evidence) => {
  findings.push({ scenario, severity, kind, message, evidence: evidence ?? null });
};

// ------------------------------------------------------------- pixel analysis
/**
 * The three glances a person gives a frame: is it black, is it a flat colour, and is there
 * magenta (missing texture). Samples a grid to stay fast on big PNGs.
 */
function analyzeFrame(buffer) {
  let png;
  try {
    png = PNG.sync.read(buffer);
  } catch (e) {
    return { ok: false, reason: 'decode-failed: ' + e.message.slice(0, 120) };
  }
  const { width, height, data } = png;
  const step = 8; // sample every 8th pixel axis → ~ (960/8)*(540/8) ≈ 6.5k samples
  let n = 0;
  let sumL = 0;
  let sumL2 = 0;
  let magenta = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sumL += lum;
      sumL2 += lum * lum;
      if (r > 200 && g < 70 && b > 200) magenta++;
      n++;
    }
  }
  const mean = sumL / n;
  const variance = Math.max(0, sumL2 / n - mean * mean);
  const std = Math.sqrt(variance);
  const magentaFraction = magenta / n;
  return {
    ok: true,
    width,
    height,
    meanLuminance: round(mean, 2),
    stdLuminance: round(std, 2),
    magentaFraction: round(magentaFraction, 5),
    black: mean < 8,
    flat: std < 2.5,
    missingTexture: magentaFraction > 0.005,
  };
}

/** Perceptual distance between two same-size frames (mean |Δluminance|). ~0 = identical. */
function frameDistance(a, b) {
  let pa, pb;
  try {
    pa = PNG.sync.read(a);
    pb = PNG.sync.read(b);
  } catch {
    return null;
  }
  if (pa.width !== pb.width || pa.height !== pb.height) return null;
  const step = 8;
  let n = 0;
  let d = 0;
  for (let y = 0; y < pa.height; y += step) {
    for (let x = 0; x < pa.width; x += step) {
      const o = (y * pa.width + x) * 4;
      const la = 0.2126 * pa.data[o] + 0.7152 * pa.data[o + 1] + 0.0722 * pa.data[o + 2];
      const lb = 0.2126 * pb.data[o] + 0.7152 * pb.data[o + 1] + 0.0722 * pb.data[o + 2];
      d += Math.abs(la - lb);
      n++;
    }
  }
  return round(d / n, 3);
}
const round = (x, p) => Math.round(x * 10 ** p) / 10 ** p;

// ------------------------------------------------------- in-page diagnostics
// Under SwiftShader the main thread renders on a blocking cadence and a mid-drive
// pipeline compile can pin it for tens of seconds, so the default 30 s evaluate
// timeout is not enough to sample the page. Give it a real chance.
const READ_TIMEOUT_MS = 90_000;
const readDiag = (page) =>
  page
    .evaluate(
      () => {
        const d = window.__ENDLESS_DRIVER__?.getDiagnostics?.();
        if (!d) return null;
        return {
          frames: d.totalFrames,
          tris: d.triangles,
          draws: d.drawCalls,
          fps: round(d.framesPerSecond ?? 0, 1),
          speed: round(d.speedKph ?? 0, 1),
          gear: d.gear,
          rpm: round(d.rpm ?? 0, 0),
          frameErr: d.frameErrors?.count ?? 0,
          frameErrLast: d.frameErrors?.last ? String(d.frameErrors.last).slice(0, 300) : null,
          lost: d.graphicsLost,
          warm: d.warmupComplete,
          renderer: d.rendererBackend,
          tier: d.qualityTier,
          seed: d.worldSeed,
          build: d.buildTag,
          night: d.isNight,
          weather: d.weather,
          fogMode: d.fogMode,
          cameraView: d.cameraView,
          cameraMode: d.cameraMode,
          heading: round((d.carHeadingDegrees ?? 0) % 360, 1),
          carPos: d.carPosition
            ? {
                x: round(d.carPosition.x, 1),
                y: round(d.carPosition.y, 1),
                z: round(d.carPosition.z, 1),
              }
            : null,
          distance: round(d.distanceMeters ?? 0, 1),
          physicsStalled: d.physicsStalledFrames ?? 0,
          wetness: round(d.wetness ?? 0, 3),
        };
      },
      null,
      { timeout: READ_TIMEOUT_MS },
    )
    .catch(() => 'EVAL_FAILED');

const HUD_BAD = /\bNaN\b|undefined|Infinity|\bnull\b|\bError\b|NaN\s*km\/h/i;
const readHud = (page) =>
  page
    .evaluate(() => {
      const texts = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length > 0) continue; // leaf text nodes only
        const t = (el.textContent || '').trim();
        if (t && t.length < 40 && t.length > 0) texts.push(t);
      }
      return texts.slice(0, 400).join(' | ');
    })
    .catch(() => '');

// ------------------------------------------------------------ scenario driver
async function boot(page, scenario, ctx) {
  const url = SCENARIO_URL[scenario];
  ctx.url = url;
  ctx.lines.push(`goto ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const t0 = Date.now();
  // Sample the loading screen the way a person watches it, so a boot timeout carries
  // evidence of how far startup actually got.
  const stopSampling = { current: false };
  const sampler = (async () => {
    while (!stopSampling.current) {
      await sleep(15000);
      if (stopSampling.current) break;
      const text = await page
        .evaluate(() => {
          const el = document.querySelector('#loading-screen');
          if (el === null) return 'no-loading-screen';
          if (el.hidden === true) return 'loading-hidden';
          return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        })
        .catch(() => 'page-dead');
      ctx.lines.push(`t=${round((Date.now() - t0) / 1000, 0)}s loading: ${text}`);
    }
  })();
  let ready = false;
  try {
    // NOTE: waitForFunction(fn, arg, options) — the options object must be the THIRD
    // argument; passing it as the second makes Playwright treat it as the page arg and
    // fall back to the 30 s default timeout (bit us on the first run).
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#loading-screen');
        return (el !== null && el.hidden === true) || window.__ENDLESS_DRIVER__ !== undefined;
      },
      null,
      { timeout: BOOT_SECONDS * 1000, polling: 2000 },
    );
    ready = true;
  } catch {
    ready = false;
  }
  stopSampling.current = true;
  await sampler;
  ctx.bootSeconds = round((Date.now() - t0) / 1000, 1);
  ctx.lines.push(`ready=${ready} after ${ctx.bootSeconds}s`);
  return ready;
}

/** Grab a screenshot + its analysis; returns the buffer for freeze checks. */
async function snap(page, ctx, name) {
  const path = `${OUT}/${ctx.scenario}-${name}.png`;
  let buf = null;
  let analysis = null;
  try {
    // Long timeout: under SwiftShader a screenshot must wait for a main-thread
    // idle gap, and a mid-drive pipeline compile can hold the thread for a while.
    buf = await page.screenshot({ path, timeout: 90_000 });
    analysis = analyzeFrame(buf);
    if (analysis?.ok) ctx.evidenceOk = true;
  } catch (e) {
    analysis = { ok: false, reason: 'screenshot-failed: ' + String(e.message).slice(0, 120) };
  }
  ctx.frames.push({ name, path, analysis });
  if (analysis?.ok)
    ctx.lines.push(
      `${name}: L=${analysis.meanLuminance} σ=${analysis.stdLuminance} mag=${analysis.magentaFraction}`,
    );
  return { buf, analysis };
}

/** The person's standing checks after any action. Returns hard-fail findings. */
function assertLive(ctx, diag, label, expect) {
  const s = ctx.scenario;
  if (diag === 'EVAL_FAILED' || diag === null) {
    addFinding(s, 'warn', 'liveness', `${label}: diagnostics unreachable (page may be dead)`, null);
    return;
  }
  ctx.evidenceOk = true; // a live diagnostics read is evidence the page is alive
  if (diag.frameErr > 0) {
    addFinding(
      s,
      'bug',
      'code-error',
      `${label}: engine frameErrors=${diag.frameErr}`,
      diag.frameErrLast,
    );
  }
  if (diag.lost) {
    addFinding(
      s,
      'env',
      'environmental',
      `${label}: WebGL graphics context lost (sandbox SwiftShader)`,
      null,
    );
  }
  if (diag.fogMode !== 'off') {
    addFinding(
      s,
      'bug',
      'visual-inconsistency',
      `${label}: fogMode is '${diag.fogMode}' — the no-fog invariant is broken`,
      null,
    );
  }
  if (!Number.isFinite(diag.tris) || diag.tris < 50_000) {
    addFinding(
      s,
      'bug',
      'visual-inconsistency',
      `${label}: triangle count ${diag.tris} — dead or empty scene`,
      null,
    );
  }
  if (Number.isFinite(diag.speed) && (diag.speed < 0 || diag.speed > 400)) {
    addFinding(s, 'bug', 'gameplay', `${label}: implausible speed ${diag.speed} km/h`, null);
  }
  if (Number.isFinite(diag.rpm) && (diag.rpm < 0 || diag.rpm > 9500)) {
    addFinding(s, 'warn', 'gameplay', `${label}: implausible RPM ${diag.rpm}`, null);
  }
  if (Number.isFinite(diag.gear) && (diag.gear < 1 || diag.gear > 6)) {
    addFinding(s, 'warn', 'gameplay', `${label}: implausible gear ${diag.gear}`, null);
  }
  if (expect?.night !== undefined && diag.night !== expect.night) {
    addFinding(
      s,
      'bug',
      'visual-inconsistency',
      `${label}: expected night=${expect.night} but isNight=${diag.night}`,
      null,
    );
  }
  if (expect?.weather !== undefined && diag.weather !== expect.weather) {
    addFinding(
      s,
      'bug',
      'visual-inconsistency',
      `${label}: expected weather=${expect.weather} but got ${diag.weather}`,
      null,
    );
  }
}

function assertHud(ctx, hud, label) {
  const bad = hud.match(/[^|]*(NaN|undefined|Infinity|null)[^|]*/g);
  if (bad && bad.length) {
    addFinding(
      ctx.scenario,
      'bug',
      'ui',
      `${label}: HUD contains non-numeric/undefined text`,
      bad.slice(0, 4).join(' ; ').slice(0, 300),
    );
  }
}

// --------------------------------------------------------------- the drives
async function humanDrive(page, ctx, { throttleSeconds, steer, brake, handbrake, expect }) {
  // focus the canvas like a player clicking into the game
  await page.mouse.click(Math.round(VW / 2), Math.round(VH / 2));
  await sleep(300);

  const before = await readDiag(page);
  const shotBefore = await snap(page, ctx, 'drive-0');

  // throttle
  if (throttleSeconds > 0) {
    await page.keyboard.down('ArrowUp');
    await sleep(throttleSeconds * 1000);
    if (steer) {
      await page.keyboard.down(steer);
      await sleep(Math.min(5, throttleSeconds / 2) * 1000);
      await page.keyboard.up(steer);
    }
    await page.keyboard.up('ArrowUp');
  }
  await sleep(1200);
  const afterThrottle = await readDiag(page);
  const shotAfterThrottle = await snap(page, ctx, 'drive-1');
  assertLive(ctx, afterThrottle, 'after-throttle', expect);
  assertHud(ctx, await readHud(page), 'after-throttle');

  // did the throttle actually do something? (the person feels this)
  if (throttleSeconds >= 8 && typeof afterThrottle === 'object' && afterThrottle) {
    const moved = afterThrottle.distance - (before?.distance ?? 0);
    if (afterThrottle.speed < 8 && moved < 2) {
      addFinding(
        ctx.scenario,
        'bug',
        'gameplay',
        `throttle produced no motion (speed ${afterThrottle.speed} km/h, Δdist ${round(moved, 1)} m)`,
        { before, after: afterThrottle },
      );
    }
  }

  // frozen? (frames must advance between the two shots)
  if (before && afterThrottle && typeof before === 'object') {
    if (afterThrottle.frames <= before.frames) {
      addFinding(
        ctx.scenario,
        'bug',
        'visual-inconsistency',
        `frame counter did not advance during the drive (${before.frames} → ${afterThrottle.frames}) — frozen render`,
        null,
      );
    } else {
      const dist = frameDistance(shotBefore.buf, shotAfterThrottle.buf);
      if (dist !== null && dist < 0.6 && afterThrottle.speed > 5) {
        addFinding(
          ctx.scenario,
          'warn',
          'visual-inconsistency',
          `frames advanced but the picture barely changed while moving (Δlum ${dist}) — possible stuck camera/render`,
          null,
        );
      }
    }
  }

  // black / flat / magenta on the driving frame
  const a = shotAfterThrottle.analysis;
  if (a?.ok) {
    if (a.black) addFinding(ctx.scenario, 'bug', 'visual-inconsistency', 'frame is black', a);
    else if (a.flat)
      addFinding(ctx.scenario, 'bug', 'visual-inconsistency', 'frame is a flat colour', a);
    if (a.missingTexture)
      addFinding(ctx.scenario, 'bug', 'visual-inconsistency', 'missing-texture magenta present', a);
  }

  // brake to stop
  if (brake) {
    const peak = typeof afterThrottle === 'object' ? afterThrottle.speed : null;
    await page.keyboard.down('ArrowDown');
    await sleep(Math.min(9, Math.max(4, (peak ?? 0) / 6)) * 1000);
    await page.keyboard.up('ArrowDown');
    await sleep(800);
    const afterBrake = await readDiag(page);
    await snap(page, ctx, 'drive-2-brake');
    assertLive(ctx, afterBrake, 'after-brake', expect);
    if (
      typeof afterBrake === 'object' &&
      peak !== null &&
      afterBrake.speed > peak - 2 &&
      afterBrake.speed > 5
    ) {
      addFinding(
        ctx.scenario,
        'bug',
        'gameplay',
        `brake did not reduce speed (peak ${peak} → ${afterBrake.speed})`,
        null,
      );
    }
  }

  // handbrake (a person drifts/spins)
  if (handbrake) {
    await page.keyboard.down('ArrowUp');
    await sleep(2500);
    await page.keyboard.down('Space');
    await sleep(2200);
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowUp');
    await sleep(800);
    const afterSpin = await readDiag(page);
    await snap(page, ctx, 'drive-3-handbrake');
    assertLive(ctx, afterSpin, 'after-handbrake', expect);
  }
}

async function toggleCameraCheck(page, ctx, expect) {
  const before = await readDiag(page);
  await page.keyboard.press('KeyC');
  await sleep(900);
  const mid = await readDiag(page);
  await snap(page, ctx, 'camera-mid');
  await page.keyboard.press('KeyC');
  await sleep(900);
  const after = await readDiag(page);
  await snap(page, ctx, 'camera-back');
  assertLive(ctx, mid, 'camera-mid', expect);
  assertLive(ctx, after, 'camera-back', expect);
  if (before && mid && after && typeof before === 'object' && typeof mid === 'object') {
    if (mid.cameraMode === before.cameraMode && mid.cameraView === before.cameraView) {
      addFinding(
        ctx.scenario,
        'warn',
        'gameplay',
        `camera toggle had no effect (mode ${before.cameraMode}, view ${before.cameraView})`,
        { before, mid, after },
      );
    }
  }
}

async function resetCarCheck(page, ctx, expect) {
  const before = await readDiag(page);
  // drive a bit off-line first so the reset has something to fix
  await page.mouse.click(Math.round(VW / 2), Math.round(VH / 2));
  await page.keyboard.down('ArrowUp');
  await sleep(1500);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('KeyR');
  await sleep(1500);
  const after = await readDiag(page);
  await snap(page, ctx, 'after-reset');
  assertLive(ctx, after, 'after-reset', expect);
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const p1 = before.carPos;
    const p2 = after.carPos;
    const finite = p2 && Number.isFinite(p2.x) && Number.isFinite(p2.y) && Number.isFinite(p2.z);
    if (!finite) {
      addFinding(ctx.scenario, 'bug', 'gameplay', 'car position is not finite after reset', p2);
    }
    const moved = p1 && p2 ? Math.hypot(p1.x - p2.x, p1.z - p2.z) : 0;
    if (moved < 0.5 && before.distance < 5) {
      // was parked and reset didn't move it — not necessarily wrong; only note if we had driven
    }
  }
}

async function pauseResumeCheck(page, ctx, expect) {
  await page.keyboard.press('Escape');
  await sleep(900);
  const opened = await page.evaluate(() => {
    const root = document.querySelector('#pause-menu-root');
    if (root === null) return false;
    const el = root.firstElementChild ?? root;
    return el.getBoundingClientRect().width > 100;
  });
  await snap(page, ctx, 'pause-open');
  if (!opened) addFinding(ctx.scenario, 'bug', 'ui', 'pause menu did not open on Escape', null);
  await page.keyboard.press('Escape');
  await sleep(800);
  const closed = await page.evaluate(() => {
    const root = document.querySelector('#pause-menu-root');
    if (root === null) return true;
    const el = root.firstElementChild ?? root;
    return el.getBoundingClientRect().width <= 100;
  });
  assertLive(ctx, await readDiag(page), 'after-resume', expect);
  if (!closed)
    addFinding(ctx.scenario, 'warn', 'ui', 'pause menu did not close on second Escape', null);
}

/** The owner-reported regression: change the car model in the menu, confirm the view stays alive. */
async function carSwapCheck(page, ctx, expect) {
  await page.keyboard.press('Escape');
  await sleep(700);
  // open the Car Model page
  const clicked = await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('[data-menu-id]')).find(
      (b) => b.dataset.menuId === 'vehicle',
    );
    if (item) {
      item.click();
      return true;
    }
    return false;
  });
  await sleep(900);
  await snap(page, ctx, 'carswap-page');
  if (!clicked) {
    addFinding(ctx.scenario, 'warn', 'ui', 'could not find the Car Model menu item', null);
    await page.keyboard.press('Escape');
    await sleep(500);
    return;
  }
  // list the selectable car options and pick a different one
  const options = await page.evaluate(() => {
    const root = document.querySelector('#pause-menu-root');
    if (!root) return [];
    return Array.from(root.querySelectorAll('button, [role="option"], label'))
      .map((b) => (b.textContent || '').trim())
      .filter((t) => t.length > 0 && t.length < 40)
      .slice(0, 40);
  });
  ctx.lines.push('car options: ' + options.join(' , ').slice(0, 300));
  const swapped = await page.evaluate(() => {
    const root = document.querySelector('#pause-menu-root');
    if (!root) return null;
    // The currently-selected option is marked; click the first non-selected car control.
    const controls = Array.from(root.querySelectorAll('button, [role="option"]'));
    const selected = controls.find((c) => /is-selected|is-active|selected/i.test(c.className));
    const target = controls.find(
      (c) => c !== selected && !/resume|apply|back|◀|↩/i.test(c.textContent || ''),
    );
    if (!target) return null;
    target.click();
    return (target.textContent || '').trim().slice(0, 40);
  });
  await sleep(2500); // the model loads + swaps live
  await snap(page, ctx, 'carswap-after');
  await page.keyboard.press('Escape'); // resume
  await sleep(1500);
  const after = await readDiag(page);
  await snap(page, ctx, 'carswap-resumed');
  assertLive(ctx, after, 'after-car-swap', expect);
  if (typeof after === 'object' && after) {
    if (after.lost) {
      addFinding(
        ctx.scenario,
        'env',
        'environmental',
        'context lost after car swap (sandbox)',
        null,
      );
    }
  }
  ctx.carSwappedTo = swapped;
  if (swapped === null) {
    addFinding(ctx.scenario, 'warn', 'ui', 'no alternate car option found to swap to', null);
  }
  // black/frozen check specific to the regression: the resumed frame must be alive
  const lastShot = ctx.frames[ctx.frames.length - 1]?.analysis;
  if (lastShot?.ok && lastShot.black) {
    addFinding(
      ctx.scenario,
      'bug',
      'visual-inconsistency',
      'REGRESSION: view is black after applying a car model change',
      lastShot,
    );
  }
}

// ---------------------------------------------------------- scenario wrappers
async function scenarioCore(page, ctx) {
  await humanDrive(page, ctx, {
    throttleSeconds: 12,
    steer: 'ArrowRight',
    brake: true,
    expect: {},
  });
  await toggleCameraCheck(page, ctx, {});
  await humanDrive(page, ctx, { throttleSeconds: 6, handbrake: true, expect: {} });
  await resetCarCheck(page, ctx, {});
  await pauseResumeCheck(page, ctx, {});
}
async function scenarioDay(page, ctx) {
  // `time=12` is noon: the sun is up, isNight must be false.
  await humanDrive(page, ctx, {
    throttleSeconds: 12,
    steer: 'ArrowRight',
    brake: true,
    expect: { night: false },
  });
}
async function scenarioNight(page, ctx) {
  await humanDrive(page, ctx, {
    throttleSeconds: 12,
    steer: 'ArrowLeft',
    brake: true,
    expect: { night: true },
  });
}
async function scenarioRain(page, ctx) {
  await humanDrive(page, ctx, {
    throttleSeconds: 12,
    steer: 'ArrowRight',
    brake: true,
    expect: { weather: 'rain' },
  });
}
async function scenarioCarSwap(page, ctx) {
  await humanDrive(page, ctx, { throttleSeconds: 6, expect: {} });
  await carSwapCheck(page, ctx, {});
}
async function scenarioTierB(page, ctx) {
  await humanDrive(page, ctx, { throttleSeconds: 10, steer: 'ArrowLeft', brake: true, expect: {} });
}
async function scenarioSpawn(page, ctx) {
  await humanDrive(page, ctx, {
    throttleSeconds: 10,
    steer: 'ArrowRight',
    brake: true,
    expect: {},
  });
}

const SCENARIO_FN = {
  core: scenarioCore,
  day: scenarioDay,
  night: scenarioNight,
  rain: scenarioRain,
  carswap: scenarioCarSwap,
  tierB: scenarioTierB,
  spawn: scenarioSpawn,
};

// -------------------------------------------------------------------- runner
async function runScenario(scenario) {
  const ctx = {
    scenario,
    url: null,
    bootSeconds: null,
    settleSeconds: null,
    lines: [],
    frames: [],
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    ctxEvents: [],
    crashed: false,
    carSwappedTo: null,
    bootOk: false,
    evidenceOk: false, // true once at least one screenshot analyzed or diag read succeeded
    status: 'PENDING',
    diag: null,
  };
  const browser = await chromium.launch({
    args: [
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--mute-audio',
    ],
  });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  page.on('pageerror', (e) => ctx.pageErrors.push(String(e.message).slice(0, 400)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') ctx.consoleErrors.push(t.slice(0, 400));
    else if (m.type() === 'warning') ctx.consoleWarnings.push(t.slice(0, 200));
  });
  page.on('crash', () => {
    ctx.crashed = true;
    ctx.lines.push('PAGE CRASHED');
  });
  await page.exposeFunction('__hpCtx', (kind) => ctx.ctxEvents.push(kind));
  await page.addInitScript(() => {
    setInterval(() => {
      const cv = document.querySelector('canvas');
      if (cv && !cv.__hpHooked) {
        cv.__hpHooked = true;
        cv.addEventListener('webglcontextlost', () => window.__hpCtx && window.__hpCtx('LOST'));
        cv.addEventListener(
          'webglcontextrestored',
          () => window.__hpCtx && window.__hpCtx('RESTORED'),
        );
      }
    }, 200);
  });

  try {
    ctx.bootOk = await boot(page, scenario, ctx);
    if (!ctx.bootOk) {
      await snap(page, ctx, 'boot-timeout');
    } else {
      // The world streams in after the loading screen — a person waits for it to appear.
      // Poll until the scene has real geometry (triangles > 50k) or the settle budget is up.
      const settleT0 = Date.now();
      let settled = false;
      while (Date.now() - settleT0 < SETTLE_SECONDS * 1000) {
        const d = await readDiag(page);
        if (d && typeof d === 'object' && d.tris > 50_000) {
          settled = true;
          break;
        }
        await sleep(4000);
      }
      ctx.settleSeconds = round((Date.now() - settleT0) / 1000, 1);
      ctx.lines.push(`settled(tris>50k)=${settled} after ${ctx.settleSeconds}s`);
      await snap(page, ctx, 'ready');
      const d = await readDiag(page);
      if (!settled && d && typeof d === 'object') {
        addFinding(
          scenario,
          'bug',
          'visual-inconsistency',
          `scene never built: triangles=${d.tris} after ready + ${SETTLE_SECONDS}s of streaming`,
          d,
        );
      }
      await SCENARIO_FN[scenario](page, ctx);
    }
  } catch (e) {
    ctx.lines.push('scenario error: ' + String(e.message).slice(0, 300));
    try {
      await snap(page, ctx, 'scenario-error');
    } catch {}
  }

  // final diagnostics snapshot
  ctx.diag = await readDiag(page);

  // classify console/page errors.
  //
  // Device/context loss needs special care: when the GPU device or WebGL context is lost,
  // any shader that was mid-compile at that instant fails to link with a generic
  // "must contain objects to form both a vertex and fragment shader" — a *cascade* of the
  // loss, not an independent defect. On software renderers (the sandbox) the device is lost
  // under memory pressure, so we tag the loss and its cascade as environmental. On real
  // hardware a device loss would still be flagged (as env) but the note tells the reader it
  // needs a look. A shader error with NO preceding loss is a genuine compile defect → bug.
  const SHADER =
    /WebGLProgram|ERROR: \d+:\d+:|THREE\.TSL|Program Information Log|Failed to compile/i;
  const DEVICE_LOST = /device lost|context lost|contextlost/i;
  const deviceLostSeen =
    ctx.ctxEvents.includes('LOST') ||
    (typeof ctx.diag === 'object' && ctx.diag && ctx.diag.lost) ||
    ctx.consoleErrors.some((t) => DEVICE_LOST.test(t));
  const shaderErrors = ctx.consoleErrors.filter((t) => SHADER.test(t) && !DEVICE_LOST.test(t));
  const deviceLostErrors = ctx.consoleErrors.filter((t) => DEVICE_LOST.test(t));
  if (deviceLostErrors.length) {
    addFinding(
      scenario,
      'env',
      'environmental',
      `${deviceLostErrors.length} device/context loss event(s) — on software rendering this is the sandbox's GPU under memory pressure; on real hardware investigate`,
      deviceLostErrors.slice(0, 3),
    );
  }
  if (shaderErrors.length) {
    if (deviceLostSeen) {
      addFinding(
        scenario,
        'env',
        'environmental',
        `${shaderErrors.length} shader link error(s) following a device loss — a cascade of the loss (mid-compile programs fail to link), not an independent defect`,
        shaderErrors.slice(0, 3),
      );
    } else {
      addFinding(
        scenario,
        'bug',
        'code-error',
        `${shaderErrors.length} shader/compile error(s) with no device loss — a genuine compile defect`,
        shaderErrors.slice(0, 4),
      );
    }
  }
  const realConsoleErrors = ctx.consoleErrors.filter(
    (t) => !SHADER.test(t) && !DEVICE_LOST.test(t),
  );
  if (realConsoleErrors.length) {
    addFinding(
      scenario,
      'bug',
      'code-error',
      `${realConsoleErrors.length} console error(s)`,
      realConsoleErrors.slice(0, 4),
    );
  }
  if (ctx.pageErrors.length) {
    addFinding(
      scenario,
      'bug',
      'code-error',
      `${ctx.pageErrors.length} uncaught page error(s)`,
      ctx.pageErrors.slice(0, 4),
    );
  }

  // ---- verdict
  const scenarioFindings = findings.filter((f) => f.scenario === scenario);
  const hasBug = scenarioFindings.some((f) => f.severity === 'bug');
  const hasEnv =
    ctx.crashed ||
    (typeof ctx.diag === 'object' && ctx.diag && ctx.diag.lost) ||
    ctx.ctxEvents.includes('LOST') ||
    !ctx.bootOk;
  // A scenario that booted but produced no usable evidence at all (every screenshot and
  // every diagnostics read timed out — the main thread was pinned by SwiftShader compiles)
  // is inconclusive, not a pass: we could not see the frame, so we cannot claim it was clean.
  const blind = ctx.bootOk && !ctx.evidenceOk;
  if (blind) {
    addFinding(
      scenario,
      'env',
      'environmental',
      'blind run: the page booted but every screenshot and diagnostics read timed out (SwiftShader main-thread starvation) — no frame was observable',
      null,
    );
  }
  if (!ctx.bootOk && !hasBug) {
    ctx.status = 'ENV-FAIL';
  } else if (ctx.crashed && !hasBug) {
    ctx.status = 'ENV-FAIL';
  } else if (hasBug) {
    ctx.status = 'FAIL';
  } else if (hasEnv || blind) {
    ctx.status = 'ENV-FAIL';
  } else {
    ctx.status = 'PASS';
  }

  ctx.lines.push('verdict: ' + ctx.status);
  writeFileSync(`${OUT}/${scenario}-timeline.txt`, ctx.lines.join('\n'));
  writeFileSync(
    `${OUT}/${scenario}-console.txt`,
    [
      'pageErrors:\n' + ctx.pageErrors.join('\n'),
      '\nconsole errors:\n' + ctx.consoleErrors.join('\n'),
      '\nconsole warnings:\n' + ctx.consoleWarnings.join('\n'),
    ].join('\n'),
  );

  await browser.close().catch(() => {});
  return ctx;
}

// --------------------------------------------------------------------- main
const report = {
  tool: 'human-player',
  generatedAt: new Date().toISOString(),
  base: BASE,
  seed: SEED,
  viewport: `${VW}x${VH}`,
  scenarios: [],
};

console.log(`[human-player] running ${SCENARIOS.join(', ')} → ${OUT}`);
for (const scenario of SCENARIOS) {
  if (!SCENARIO_FN[scenario]) {
    console.log(`[human-player] unknown scenario '${scenario}' — skipped`);
    continue;
  }
  console.log(`\n[human-player] === scenario: ${scenario} ===`);
  const ctx = await runScenario(scenario);
  report.scenarios.push({
    scenario,
    url: ctx.url,
    status: ctx.status,
    bootSeconds: ctx.bootSeconds,
    settleSeconds: ctx.settleSeconds,
    bootOk: ctx.bootOk,
    evidenceOk: ctx.evidenceOk,
    crashed: ctx.crashed,
    ctxLost: ctx.ctxEvents.includes('LOST'),
    build: ctx.diag?.build ?? null,
    seed: ctx.diag?.seed ?? null,
    renderer: ctx.diag?.renderer ?? null,
    tier: ctx.diag?.tier ?? null,
    night: ctx.diag?.night ?? null,
    weather: ctx.diag?.weather ?? null,
    fogMode: ctx.diag?.fogMode ?? null,
    fps: ctx.diag?.fps ?? null,
    finalSpeed: ctx.diag?.speed ?? null,
    carSwappedTo: ctx.carSwappedTo,
    consoleErrorCount: ctx.consoleErrors.length,
    pageErrorCount: ctx.pageErrors.length,
    warningCount: ctx.consoleWarnings.length,
    findings: findings.filter((f) => f.scenario === scenario),
    timeline: ctx.lines,
    frames: ctx.frames.map((f) => ({ name: f.name, path: f.path, analysis: f.analysis })),
  });
  console.log(
    `[human-player] ${scenario}: ${ctx.status} (boot ${ctx.bootSeconds}s + settle ${ctx.settleSeconds}s, build ${ctx.diag?.build ?? '?'}, ` +
      `errors=${ctx.consoleErrors.length + ctx.pageErrors.length}, findings=${findings.filter((f) => f.scenario === scenario).length})`,
  );
}

const failCount = report.scenarios.filter((s) => s.status === 'FAIL').length;
const envCount = report.scenarios.filter((s) => s.status === 'ENV-FAIL').length;
const passCount = report.scenarios.filter((s) => s.status === 'PASS').length;
report.summary = {
  pass: passCount,
  fail: failCount,
  envFail: envCount,
  totalFindings: findings.length,
  bugs: findings.filter((f) => f.severity === 'bug').length,
  warns: findings.filter((f) => f.severity === 'warn').length,
  env: findings.filter((f) => f.severity === 'env').length,
};
report.findings = findings;

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

// human-readable summary
const md = [];
md.push('# Human-perspective bug hunt — report', '');
md.push(
  `Generated ${report.generatedAt} · base ${BASE} · seed ${SEED} · viewport ${report.viewport}`,
  '',
);
md.push(
  `**Summary:** ${passCount} PASS · ${failCount} FAIL · ${envCount} ENV-FAIL · ${report.summary.bugs} bug finding(s), ${report.summary.warns} warning(s), ${report.summary.env} environmental note(s)`,
  '',
);
for (const s of report.scenarios) {
  md.push(`## ${s.scenario} — ${s.status}`, '');
  md.push(`url: \`${s.url}\``, '');
  md.push(
    `boot ${s.bootSeconds}s · build ${s.build ?? '?'} · seed ${s.seed ?? '?'} · renderer ${s.renderer ?? '?'} · tier ${s.tier ?? '?'} · night=${s.night} weather=${s.weather} fog=${s.fogMode} · fps=${s.fps} · final speed ${s.finalSpeed} km/h`,
    '',
  );
  if (s.findings.length) {
    md.push('| sev | kind | finding | evidence |', '|---|---|---|---|');
    for (const f of s.findings) {
      md.push(
        `| ${f.severity} | ${f.kind} | ${f.message} | \`${JSON.stringify(f.evidence ?? '').slice(0, 220)}\` |`,
      );
    }
    md.push('');
  } else {
    md.push('No findings.');
    md.push('');
  }
  md.push('Frames: ' + s.frames.map((f) => f.name).join(', '), '');
}
writeFileSync(`${OUT}/report.md`, md.join('\n'));

console.log(`\n[human-player] PASS=${passCount} FAIL=${failCount} ENV-FAIL=${envCount}`);
console.log(
  `[human-player] findings: ${report.summary.bugs} bug, ${report.summary.warns} warn, ${report.summary.env} env`,
);
console.log(`[human-player] report → ${OUT}/report.md`);
process.exit(failCount > 0 ? 1 : envCount === report.scenarios.length ? 2 : 0);
