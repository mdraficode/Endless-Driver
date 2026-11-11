// Captures FULL text of the first WebGLProgram/GLSL error, then exits.
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:4173/?tier=C&backend=webgl2';
(async () => {
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  let found = 0;
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() !== 'error') return;
    if (/WebGLProgram|TSL:/.test(t) && found < 3) {
      found++;
      console.error('===== FULL ERROR ' + found + ' =====');
      console.error(t);
      if (found >= 3) void finish();
    }
  });
  page.on('pageerror', (e) => {
    found++;
    console.error('===== PAGE ERROR =====\n' + String(e));
  });
  let done = false;
  async function finish() {
    if (done) return;
    done = true;
    await new Promise((r) => setTimeout(r, 1500));
    await browser.close();
    process.exit(0);
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // wait up to 240s for errors; if none by then, report CLEAN
  await new Promise((r) => setTimeout(r, 240000));
  console.error(
    found === 0
      ? '===== NO SHADER/TSL ERRORS IN 240s — CLEAN ====='
      : '===== ' + found + ' errors captured =====',
  );
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error('PROBE ERROR', e.message);
  process.exit(2);
});
