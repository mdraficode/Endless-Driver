# Session Handoff — Endless Driver

**Updated:** 2026-10-13  
**Current stage:** Phase 1 implemented and verified (core engine, loop, scene foundation, diagnostics)  
**Authorized development phase:** Phase 1 only  
**Next development instruction:** Wait for the user to explicitly authorize Phase 2

## 1. User instructions so far

| Instruction                                                                                         | State                                                                                     |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Plan the whole project in structured Markdown                                                       | Done — `PROJECT_PLAN.md`, `docs/PROJECT_BRIEF.md`                                         |
| Create the initial project structure and keep progress in the dedicated GitHub repository           | Done — public [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) |
| Implement Phase 1 (core engine setup and scene foundation) using Vite, TypeScript, and **Three.js** | Done — see sections 3–6                                                                   |
| Do **not** start Phase 2 without explicit instruction                                               | Honored — no physics, vehicle, terrain, or gameplay code exists                           |

The Phase 1 request named Three.js APIs explicitly (`WebGLRenderer`, `PCFSoftShadowMap`,
`ACESFilmicToneMapping`, `clock.getDelta()`, `OrbitControls`), which supersedes the Babylon.js baseline
chosen during planning. The change is recorded in [`docs/decisions/0002-renderer-three-js.md`](decisions/0002-renderer-three-js.md).
**Rapier is still the intended and sole physics authority** once Phase 2 begins.

## 2. Canonical repository and verified persistence

- **Repository:** [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) — **public**, default branch `main`.
- **Clone:** `https://github.com/mdraficode/Endless-Driver.git`
- Every session's checkpoint is pushed to `main` and its SHA verified against the GitHub API; CI
  (`.github/workflows/ci.yml`) runs `npm ci` + `npm run check` on Node 22.
- Obtain the current checkpoint from the repository (`git log -1 --oneline`) rather than trusting a
  hash written here. Phase 1 push verification and CI links are recorded in the delivery message and
  in the repository's Actions history.

## 3. What Phase 1 delivered

| Area             | Implementation                                                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition root | `src/core/Application.ts` — owns engine, scene, statistics and HUD; startup, loading, context-loss and error states                                                                                                                                                                |
| Renderer/loop    | `src/core/Engine.ts` — one `WebGLRenderer` (antialias, shadows, ACES filmic tone mapping), resize handling, DPR cap of 2, clamped delta-time loop, pause/resume, context-loss recovery, renderer statistics, full disposal                                                         |
| Scene/lighting   | `src/core/SceneManager.ts` — gradient sky dome, `AmbientLight`, shadow-casting `DirectionalLight` sun with 2048² shadow map and tuned bias, 800 m neutral ground plane with an in-shader reference grid, three temporary shadow props, debug `PerspectiveCamera` + `OrbitControls` |
| Diagnostics      | `src/core/PerformanceMonitor.ts` (FPS/frame-time window) and `src/ui/DiagnosticsOverlay.ts` (interval-updated HUD: FPS avg/worst, frame time + p95, viewport/DPR, draw calls, triangles, scene objects, camera position, frames)                                                   |
| Configuration    | `src/config/render.ts` — all Phase 1 tuning values (DPR cap, delta clamp, camera, shadows, sky, lighting, ground/grid, diagnostics cadence)                                                                                                                                        |
| Shared utilities | `src/shared/math.ts` — `clamp`, `resolvePixelRatio`, `clampFrameDelta`, `secondsToMilliseconds`                                                                                                                                                                                    |
| Entrypoint/page  | `src/main.ts`, `index.html`, `src/style.css` — canvas mount, status region, startup-failure message, dev-only `window.__ENDLESS_DRIVER__` debug handle                                                                                                                             |

## 4. Verification evidence

**Local checks (Node 20.20.2, npm 10.8.2):** `npm run check` passes — Prettier, ESLint, both
TypeScript configs, **29 tests in 5 files**, and the Vite production build. Test coverage is logic
and wiring only: math guards (including the DPR cap and delta clamp), render-config invariants,
performance-monitor statistics, module API surfaces, page wiring, and the asset manifest.

**Browser verification (out-of-repo, not committed):** Playwright + Chromium headless shell 156 with
ANGLE/SwiftShader against the dev server and the production preview.

| Scenario                                          | Result                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop 800×600 at `deviceScaleFactor: 3`         | Renders lit scene; drawing buffer 1600×1200 and reported pixel ratio **2.00** (cap enforced); 8 draw calls, 1,034 triangles, 9 scene objects |
| Mobile viewport 390×844 at `deviceScaleFactor: 3` | Correct 780×1688 buffer, ratio 2.00, no console warnings or page errors                                                                      |
| Window resize 900×600 → 1280×720                  | Viewport, camera aspect and 2560×1440 buffer all followed the window                                                                         |
| Pause/resume via debug handle                     | Frame counter froze while paused and resumed afterwards                                                                                      |
| Console output                                    | No errors and no warnings (Two earlier warnings — deprecated `Clock` and the removed `PCFSoftShadowMap` — were fixed rather than ignored)    |
| Screenshots                                       | Neutral plane with visible sun shadows on the props, blue gradient sky, horizon fog, legible grid                                            |

**Explicit performance caveat:** these runs use a **CPU software rasterizer**, which reported roughly
25–45 FPS at 1600×1200. That is _not_ a hardware 60 FPS measurement and must not be quoted as one.
The 60 FPS reference target still requires a real device measurement with named hardware, recorded
resolution, preset, and warm-up. Browser smoke checks here prove correctness, not frame rate.

### Bugs found by verification and fixed

1. **Sky dome occluded the scene below the horizon.** The dome is opaque geometry drawn after the
   translucent depth-less grid, so it painted over every grid line under the horizon line. Fixed by
   treating the dome as a backdrop: `renderOrder = -1` with `depthTest = false`.
2. **Debug grid z-fought with the ground plane.** A `GridHelper` 2 cm above an 800 m plane cannot
   resolve in the depth buffer at that scale. Replaced with an anti-aliased procedural grid drawn
   inside the ground material (`onBeforeCompile`), which also fades with distance and lays the
   groundwork for Phase 3 terrain material blending.
3. **Deprecated timing API.** `THREE.Clock` is deprecated in r186; the loop now uses `THREE.Timer`
   with Page Visibility integration (`update(timestamp)` / `getDelta()` / `reset()`).
4. **Removed shadow type.** `PCFSoftShadowMap` is removed at runtime in r186 (the renderer warns and
   falls back). `config/render.ts` now selects a supported mode — `pcf` by default, `vsm` available
   as an opt-in soft mode — so no warning is emitted.

## 5. Deliberate deviations and limitations

- **Renderer:** Three.js, per explicit user instruction, replacing the Babylon.js planning baseline.
- **Quality selector:** deferred to Phase 6 rather than shipped as a stub; the DPR cap and effect
  settings are configuration-driven but there is no in-game quality menu yet.
- **`PCFSoftShadowMap` literal:** not used, because the pinned release removed it; documented instead
  of silently downgrading. Pinning an older `three` release would restore the literal constant.
- **No gameplay:** no physics, input, camera modes, weather, HUD gameplay elements, or vehicles.
- **Bundle size:** the production JS bundle is ~570 kB (~143 kB gzip) because Three.js is a single
  dependency; no code splitting yet. Revisit when feature modules grow.
- **New file `docs/decisions/0002-renderer-three-js.md`** supersedes the renderer half of ADR 0001.

## 6. Next authorized step

Phase 2 is **not** authorized: Rapier initialization, fixed 60 Hz stepping with a bounded catch-up
accumulator, transform snapshots, render interpolation, placeholder colliders, and a keyboard-driven
placeholder vehicle for the author of the next instruction to approve.

When Phase 2 is authorized:

1. Read this handoff, `AGENTS.md`, the plan's Phase 2 section, `docs/ARCHITECTURE.md` §4/§6.
2. Record the authorization in `AGENTS.md` and this file.
3. Implement only Phase 2 scope; keep Rapier as the sole physics authority and Three.js as a pure
   renderer of interpolated poses.
4. Add deterministic physics tests, run `npm run check`, perform browser verification, and record
   real evidence (no unverified performance claims).
5. Commit, push to `main`, verify the remote SHA and CI result, and stop before Phase 3.

## 7. Session continuity reminders

- Install with `npm ci`; the lockfile is committed and direct versions are pinned.
- `npm run check` is the required gate before every commit.
- Do not commit `node_modules`, `dist`, credentials, or unlicensed assets.
- Authentication may need renewing in a fresh session; never request a token in chat and never commit
  credential material.
- If a push is blocked, record it plainly and export a bundle instead of claiming remote success.
