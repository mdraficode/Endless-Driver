const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('console', (m) => {
    const t = m.type() === 'error' ? m.text() : m.text().slice(0, 200);
    console.error(`[console:${m.type()}] ` + t);
  });
  page.on('pageerror', (e) => console.error('[pageerror] ' + String(e.message).slice(0, 300)));
  const t0 = Date.now();
  await page.goto('http://localhost:4173/?tier=C&backend=webgl2&tslstack=1', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  console.error(`[probe] domready ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await page.evaluate(() => {
      const el = document.querySelector('#loading-screen');
      return { hidden: el ? el.hidden : 'no-el', text: el ? el.textContent.slice(0, 120) : null };
    });
    console.error(
      `[probe] t=${((Date.now() - t0) / 1000).toFixed(0)}s loading=${JSON.stringify(st)}`,
    );
    if (st.hidden === true) {
      console.error('[probe] READY');
      break;
    }
  }
  await browser.close();
})().catch((e) => {
  console.error('PROBE ERROR', e.message);
  process.exit(2);
});
