#!/usr/bin/env node
/**
 * Captures the validation route's bookmarks and scores them: SSIM against the accepted
 * baseline, and temporal stability from frame bursts.
 *
 * This is the harness `docs/REALISM_PLAN.md` §5 asks for — the regression net that lets every
 * later rendering change answer "did the bookmarks move?" and "does a still surface boil less?"
 * with numbers instead of impressions. It drives the *built* app over HTTP with Playwright,
 * waits for a settled frame count, and screenshots the canvas exactly as a player would see it.
 *
 * Usage:
 *   npm run build && npx vite preview --port 4173        # in one shell
 *   node scripts/capture-route.mjs                       # compare against baseline/route
 *   node scripts/capture-route.mjs --baseline            # (re)write the accepted baseline
 *   node scripts/capture-route.mjs --bookmarks canopy-dawn,start-noon
 *   node scripts/capture-route.mjs --stability           # + TAA on/off stability bursts
 *   node scripts/capture-route.mjs --extra hfog=0        # A/B any render switch, same pattern
 *
 * Playwright is tooling, not a shipped dependency: `npm install --no-save playwright` once,
 * then `npx playwright install chromium`. Set PLAYWRIGHT_MODULE to a module path to override
 * resolution. Exit code is non-zero on page errors, console errors, or any bookmark scoring
 * below --threshold against the baseline.
 */
/* global window:readonly -- the page.evaluate/waitForFunction callbacks run in the browser */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ssim, temporalStability, meanAbsoluteDifference } from './lib/image-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173',
    out: null,
    baseline: false,
    baselineDir: join(ROOT, 'baseline', 'route'),
    bookmarks: null,
    tier: 'B',
    width: 800,
    height: 500,
    threshold: 0.97,
    stability: false,
    extra: '',
    burstFrames: 12,
    settleFrames: 90,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    switch (arg) {
      case '--base-url':
        args.baseUrl = next();
        break;
      case '--out':
        args.out = next();
        break;
      case '--baseline':
        args.baseline = true;
        break;
      case '--baseline-dir':
        args.baselineDir = next();
        break;
      case '--bookmarks':
        args.bookmarks = next().split(',').filter(Boolean);
        break;
      case '--tier':
        args.tier = next();
        break;
      case '--width':
        args.width = Number.parseInt(next(), 10);
        break;
      case '--height':
        args.height = Number.parseInt(next(), 10);
        break;
      case '--threshold':
        args.threshold = Number.parseFloat(next());
        break;
      case '--stability':
        args.stability = true;
        break;
      case '--extra':
        args.extra = next();
        break;
      case '--burst-frames':
        args.burstFrames = Number.parseInt(next(), 10);
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (args.out === null) {
    args.out = args.baseline
      ? args.baselineDir
      : join(ROOT, 'captures', 'route', new Date().toISOString().replaceAll(':', '-'));
  }
  return args;
}

async function loadPlaywright() {
  try {
    return await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
  } catch {
    throw new Error(
      'Playwright is not resolvable. Run: npm install --no-save playwright && ' +
        'npx playwright install chromium (or set PLAYWRIGHT_MODULE to its module path).',
    );
  }
}

async function decodePng(path) {
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

async function decodePngBuffer(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

/** Opens one route URL and waits until the app reports a settled frame count. */
async function openSettled(page, url, settleFrames) {
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  };
  const onPageError = (error) => pageErrors.push(String(error));
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(
    (frames) => {
      const handle = window.__ENDLESS_DRIVER__;
      return handle !== undefined && handle.getDiagnostics().frames > frames;
    },
    settleFrames,
    { timeout: 600_000 },
  );
  // Orbit damping and the temporal history both need real time to come to rest. Where the
  // scene reports a camera position, wait until it stops moving rather than guessing a delay:
  // a still-damping camera is motion, and motion is exactly what a stability burst must not
  // contain.
  await page.waitForTimeout(1000);
  let previous = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const position = await page.evaluate(
      () => window.__ENDLESS_DRIVER__?.getDiagnostics()?.cameraPosition ?? null,
    );
    if (position === null || previous === null) {
      previous = position;
      await page.waitForTimeout(500);
      continue;
    }
    const moved = Math.hypot(
      position.x - previous.x,
      position.y - previous.y,
      position.z - previous.z,
    );
    previous = position;
    if (moved < 0.0005) {
      break;
    }
    await page.waitForTimeout(500);
  }

  const diagnostics = await page.evaluate(() => window.__ENDLESS_DRIVER__?.getDiagnostics());
  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  return { diagnostics, consoleErrors, pageErrors };
}

async function main() {
  const args = parseArgs(process.argv);
  const { chromium } = await loadPlaywright();

  try {
    const response = await fetch(args.baseUrl);
    if (!response.ok) {
      throw new Error(`preview server answered ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `no preview server at ${args.baseUrl}. Run: npm run build && npx vite preview --port 4173`,
      { cause: error },
    );
  }

  await mkdir(args.out, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });
  page.setDefaultTimeout(300_000);

  const failures = [];
  const entries = [];

  // Enumerate bookmarks from the app itself: the table in config/route.ts stays the only copy.
  const suffix = args.extra === '' ? '' : `&${args.extra}`;
  const probe = await openSettled(
    page,
    `${args.baseUrl}/?scene=route&debug&tier=${args.tier}&res=1${suffix}`,
    10,
  );
  const allIds = probe.diagnostics?.bookmarkIds ?? [];
  const bookmarkIds =
    args.bookmarks === null ? allIds : allIds.filter((id) => args.bookmarks.includes(id));
  if (bookmarkIds.length === 0) {
    throw new Error('no bookmarks to capture (probe found none, or the filter matched nothing)');
  }
  console.log(
    `capturing ${bookmarkIds.length} bookmark(s), tier ${args.tier}, ${args.width}x${args.height}`,
  );

  for (const id of bookmarkIds) {
    const url = `${args.baseUrl}/?scene=route&bookmark=${id}&debug&tier=${args.tier}&res=1${suffix}`;
    const { diagnostics, consoleErrors, pageErrors } = await openSettled(
      page,
      url,
      args.settleFrames,
    );
    const file = join(args.out, `${id}.png`);
    // A screenshot on a software renderer waits for a presented frame and reads it back;
    // under SwiftShader with a heavy chain that is tens of seconds, far past the default
    // action timeout. The capture is the product here, so it gets the long leash.
    await page.screenshot({ path: file, timeout: 300_000 });

    const entry = {
      bookmark: id,
      file: `${id}.png`,
      url,
      diagnostics: {
        backend: diagnostics?.rendererBackend,
        tier: diagnostics?.tierId,
        effects: diagnostics?.postEffects,
        fogMode: diagnostics?.fogMode,
        renderScale: diagnostics?.renderScale,
        timeOfDay: diagnostics?.timeOfDay,
        sunElevationDegrees: diagnostics?.sunElevationDegrees,
        drawCalls: diagnostics?.drawCalls,
        triangles: diagnostics?.triangles,
      },
      consoleErrors,
      pageErrors,
    };

    const baselineFile = join(args.baselineDir, `${id}.png`);
    if (!args.baseline && existsSync(baselineFile)) {
      const [shot, base] = [await decodePng(file), await decodePng(baselineFile)];
      if (shot.width === base.width && shot.height === base.height) {
        entry.ssimVsBaseline = ssim(shot.data, base.data, shot.width, shot.height, shot.channels);
        entry.meanAbsDiffVsBaseline = meanAbsoluteDifference(shot.data, base.data, shot.channels);
        if (entry.ssimVsBaseline < args.threshold) {
          failures.push(`${id}: SSIM ${entry.ssimVsBaseline.toFixed(4)} < ${args.threshold}`);
        }
      } else {
        entry.ssimVsBaseline = null;
        failures.push(
          `${id}: size differs from baseline (${shot.width}x${shot.height} vs ${base.width}x${base.height})`,
        );
      }
    }
    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      failures.push(
        `${id}: ${consoleErrors.length} console error(s), ${pageErrors.length} page error(s)`,
      );
    }
    entries.push(entry);
    console.log(
      `  ${id}: ${entry.diagnostics.backend} fog=${entry.diagnostics.fogMode} ` +
        `sun=${entry.diagnostics.sunElevationDegrees?.toFixed(1)}deg ` +
        (entry.ssimVsBaseline === undefined
          ? ''
          : `ssim=${entry.ssimVsBaseline?.toFixed(4) ?? 'n/a'}`),
    );
  }

  const stability = [];
  if (args.stability) {
    // The Rank 1 measurement: a static bookmark, a burst of consecutive presented frames, the
    // temporal resolve on vs off. Everything else about the two arms is the same URL.
    const targets = bookmarkIds.filter((id) => id.endsWith('-noon')).slice(0, 2);
    for (const id of targets.length > 0 ? targets : bookmarkIds.slice(0, 1)) {
      for (const taa of [true, false]) {
        // clouds=0: the cloud layer is wall-clock animated even under a frozen sun, and cloud
        // drift across the sky is not the shimmer this measurement exists to isolate.
        const url =
          `${args.baseUrl}/?scene=route&bookmark=${id}&debug&tier=${args.tier}&res=1&clouds=0${suffix}` +
          (taa ? '&taa=1' : '&taa=0');
        const { consoleErrors, pageErrors } = await openSettled(page, url, args.settleFrames);
        const frames = [];
        for (let i = 0; i < args.burstFrames; i += 1) {
          const buffer = await page.screenshot({ timeout: 300_000 });
          const decoded = await decodePngBuffer(buffer);
          frames.push(decoded);
        }
        const first = frames[0];
        const report = temporalStability(
          frames.map((frame) => frame.data),
          first.width,
          first.height,
          first.channels,
        );
        stability.push({ bookmark: id, taa, ...report, consoleErrors, pageErrors });
        console.log(
          `  stability ${id} taa=${taa ? 'on' : 'off'}: flat σ ${report.flatMeanStd.toFixed(3)} ` +
            `(p95 ${report.flatP95Std.toFixed(3)}, flat ${(report.flatFraction * 100).toFixed(0)}% of frame)`,
        );
        if (consoleErrors.length > 0 || pageErrors.length > 0) {
          failures.push(`stability ${id} taa=${taa}: console/page errors`);
        }
      }
    }
  }

  await browser.close();

  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: args.baseline ? 'baseline' : 'compare',
    baseUrl: args.baseUrl,
    tier: args.tier,
    viewport: { width: args.width, height: args.height },
    threshold: args.threshold,
    bookmarks: entries,
    stability,
  };
  await writeFile(join(args.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (failures.length > 0) {
    console.error(`\nFAILED:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\ndone: ${entries.length} capture(s) in ${args.out}`);
}

await main();
