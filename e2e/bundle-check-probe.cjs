// Identifies which JS bundle the page actually loads + captures first errors.
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:4173/?tier=C&backend=webgl2';
(async () => {
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const VW = parseInt(process.env.VIEWPORT_W || '480', 10);
  const VH = parseInt(process.env.VIEWPORT_H || '270', 10);
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const scripts = [];
  page.on('response', (r) => {
    if (r.url().includes('index-')) scripts.push(r.url().split('/').pop());
  });
  let n = 0;
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() !== 'error') return;
    if (/WebGLProgram|TSL:/.test(t) && n < 4) {
      n++;
      console.error('===== ERROR ' + n + ' =====\n' + t.slice(0, 1200));
    }
  });
  page.on('pageerror', (e) => console.error('===== PAGEERROR =====\n' + String(e).slice(0, 300)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 15000));
  const src = await page.evaluate(() =>
    Array.from(document.scripts)
      .map((s) => s.src.split('/').pop())
      .filter(Boolean),
  );
  console.error('scripts in DOM: ' + JSON.stringify(src));
  console.error('fetched index bundles: ' + JSON.stringify(scripts));
  // interact like the smoke test does
  await page.mouse.click(Math.round(VW / 2), Math.round(VH / 2));
  await page.keyboard.press('F2');
  await page.keyboard.down('ArrowUp');
  await new Promise((r) => setTimeout(r, 9000));
  await page.keyboard.up('ArrowUp');
  console.error('total errors so far: ' + n);
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error('PROBE ERROR', e.message);
  process.exit(2);
});
