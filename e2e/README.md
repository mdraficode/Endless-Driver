# e2e — user-level Playwright smoke tests (owner gate, 2026-11-10)

Headless, user-level tests against a running build (local `vite preview` or the
live Pages site). Playwright is intentionally NOT a root devDependency — this
folder is self-contained so the CI gate's `npm ci` stays lean:

    cd e2e && npm install && npx playwright install chromium \
        && npx playwright install-deps chromium

Run (fresh random world = no `?seed=`; `tier=C&backend=webgl2` is the
phone-class path):

    BASE_URL='http://localhost:4173/?tier=C&backend=webgl2' node smoke-test.cjs

- `smoke-test.cjs` — the user-level drive: ready → throttle → corner → pause
  menu (tuning section) → resume → brake; verdict on page errors, console
  errors (any shader/TSL error included), motion, pause menu, and a live
  triangle count (dead-canvas guard). `VIEWPORT_W/H` and `BASE_URL` env.
- `full-error-probe.cjs` — waits up to 240 s and fails on the first
  WebGLProgram/TSL console error; the fast shader-level regression check.
- `debug-probe.cjs` — boots and polls the loading screen, logging console
  traffic; `tslstack=1` in the URL enables TSL construction stack traces.
- `bundle-check-probe.cjs` — reports which index bundle the page actually
  loaded (guards against serving a stale build during verification).

Known environment caveat (Arena sandbox): the software renderer (SwiftShader)
loses the WebGL context ~30–90 s after ready under load; that failure affects
any build identically and is environmental, not a game defect. Retry runs and
treat "reached ready + zero shader/TSL errors" as the shader-level verdict.
