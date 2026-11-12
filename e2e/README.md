# e2e — user-level Playwright smoke tests (owner gate, 2026-11-10)

Headless, user-level tests against a running build (local `vite preview` or the
live Pages site). Playwright is intentionally NOT a root devDependency — this
folder is self-contained so the CI gate's `npm ci` stays lean:

    cd e2e && npm install && npx playwright install chromium \
        && npx playwright install-deps chromium

Run (fresh random world = no `?seed=`; `tier=C&backend=webgl2` is the
phone-class path):

    BASE_URL='http://localhost:4173/?tier=C&backend=webgl2' node smoke-test.cjs

- `human-player.mjs` — the **human-perspective bug-hunting player**
  (2026-10-25). Plays like a person (keyboard drive, camera toggle,
  handbrake, reset, pause menu, car-model swap) and does the visual checks
  a person does by looking: black/flat frame, frozen frame, missing-texture
  magenta, HUD `NaN`/`undefined` text, night/rain state, and the no-fog
  invariant — each backed by both the live `window.__ENDLESS_DRIVER__`
  diagnostics (via `?debug=1`) and pngjs pixel analysis of real screenshots.
  Outcomes are classified `PASS` / `FAIL` (real finding) / `ENV-FAIL`
  (sandbox SwiftShader boot-timeout, context loss, or crash — reported
  honestly, never counted as a game defect). One scenario per fresh page
  keeps each run inside the software renderer's survival window.

  ```
  node human-player.mjs --scenarios core,night,rain,carswap \
       [--base-url http://localhost:4173] [--seed 20261013] \
       [--viewport 960x540] [--boot 480] [--settle 90] [--out /tmp/human-bug-report]
  ```

  Scenarios: `core` (full human session: drive, corner, camera toggle,
  handbrake, reset, pause), `day` (`time=12`), `night` (`time=22`),
  `rain` (`weather=rain`), `carswap` (the owner's "applying a car model
  change freezes the view" regression path), `tierB`, `spawn` (fresh
  random world). `--res <scale>` passes the game's own `?res=`
  render-resolution switch through (a weak-device lever; sandboxes use it
  to fit their memory budget). The game's default start time is night
  (23:30), so `day`/`night` pin the time of day explicitly. Exit 0 = no
  FAIL, 1 = FAIL, 2 = ENV-FAIL only (inconclusive). Report: `report.md` +
  `report.json` + one timeline/console/screenshot set per scenario.

  Known environmental behaviour on the software renderer (sandbox): boot
  takes minutes (shader pre-compile), the page can lose its device under
  memory pressure, and the main thread is pinned long enough that in-page
  `evaluate` reads time out — the player reads telemetry from the
  `?debug=1` overlay in screenshots when the handle is unreachable, and
  tags device-loss + its shader-link cascade as environmental rather than
  as a game defect. A full-drive on real hardware/GPU is the authoritative
  visual acceptance (see AGENTS.md).

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
