# Endless Driver

A cross-platform, procedural 3D web driving game built with **Three.js, Rapier, TypeScript, Vite, and Tailwind CSS**.

> **Current state (2026-10-20): Phase 4 built scope is delivered; Phase 5 remains open pending FPS evidence and formal acceptance; Phase 6 stays gated on Phase 5 acceptance; Phase 9 urban systems is separately authorized and active. Phases 7–8 remain gated.** The latest owner report says earlier non-FPS issues are resolved, but FPS remains unstable. No named-device frame-time measurements or stable-FPS claim are available.
>
> The 2026-10-20 environment/building increment adds tier-capped instanced ground cover, TSL wind/backlight, PBR material breakup, and facade/glazing/roof details. The FPS pass adds time-based dynamic-resolution smoothing on B/A TAAU and bounded FXAA scene-pass scaling on C, plus tier-capped foliage streaming work. Its full local check passed on `7f33b23` (55 test files / 486 tests; 17 assets / 39,714,769 bytes verified; production build), and Validate #147 plus Pages Deploy #137 succeeded. The lower-tier spatial path can look softer because it has no temporal reconstruction, and no owner-device FPS measurements exist. A bounded Phase 9 density increment now adds C/B/A infill, signal-aware visual traffic and sidewalk pedestrians; its post-push full check is pending.
>
> The game now has seeded terrain, roads, vegetation and town detail alongside the raycast car, tire model, smoothed keyboard/touch input, and chase camera. The hero car remains a placeholder. The owner's target is “almost life like”; the roadmap was rearranged (ADR 0004):
>
> - [`docs/RESEARCH_AAA_FIDELITY.md`](docs/RESEARCH_AAA_FIDELITY.md) — what Forza actually does, the verified Three.js r186 capability audit, a 20-row gap analysis, legal asset sourcing, and six explicit non-promises.
> - [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) — the visual contract: five pillars, per-system quality bars, tier matrix (C/B/A), look-dev workflow, rural Hinode, and the separately authorized **Aohara Metropolis** addition.
> - [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) — the verified **free-and-open** asset register: Poly Haven and ambientCG (API-checked on 2026-10-14), Sonniss GDC game audio, Freesound CC0, CC0 cars, open-source authoring tools — and exactly where free sourcing reaches its ceiling.
>
> **Owner decisions:** free and open assets only, no purchases; unbadged fictional branding; rural Hinode remains the base setting. On 2026-10-19, [ADR 0006](docs/decisions/0006-urban-systems-and-city-night-lighting.md) records authorization for a fictional Japanese megacity district, night lighting first, and a later narrow Aohara-only visual wet-look request (HDRI/local-light clearcoat, no rain, standing water or traction changes). Phase 9 may proceed alongside Phase 5; this does not authorize Phases 7–8. Audio and photo-mode scope remains as recorded in [ADR 0005](docs/decisions/0005-free-and-open-asset-strategy.md).
>
> Open scope: Phase 5's vegetation readiness/streaming, ground-cover density/LOD and atmosphere, tree-impact feel, and owner-device visual acceptance of foliage wind/backlighting; the 2026-10-20 ground-cover implementation is only an initial increment. Phase 6's hero car follows only after Phase 5 acceptance. Phase 9 Aohara keeps the 5×5 grid, default Central Avenue start, rural Hinode, pinned `?spawn=<id>` choices and explicit `?spawn=random`; the latest night-kit increment adds 240 instanced streetlamps (40 m spacing), 48 banners, 22 varied lower-rise buildings, a stadium, 18 abstract billboards and locally budgeted architectural light pools alongside the existing 32 high-rises. C/B/A point-light caps are 6/8/12 total, split between nearest street (4/6/8) and architectural (2/2/4) sources; whole-frame bloom remains off. The Aohara wet-look clearcoat is static visual PBR—not SSR, rain, standing water, weather or traction. `npm run check` passed locally on code commit `27e65ef` on 2026-10-20: 54 test files / 482 tests, 17 assets / 39,714,769 bytes verified, and production build. A standalone Tier C `?scene=city` WebGL2/SwiftShader preview initialized with no page or console errors (89 draw calls / 386,941 triangles in that isolated block); the facades read dark at this preset. This is not a full-game capture, driveability check, named-device performance result, or owner-device visual acceptance. Ground-cover density/LOD, gameplay ground colour, tree pop-in, foliage readability and mobile cost remain open. Full vehicle/pedestrian AI, pedestrian crossings/right-of-way, further district expansion, expressways, tunnels and flyovers remain future Phase 9 work. Weather/seasons and final polish remain gated in Phases 7–8. Gameplay terrain must remain non-white and snow-free; the owner's white-ground report is not visually resolved until stable, readable owner-device evidence confirms it. The renderer uses HDRI image-based lighting, ACES tone mapping, and screen-space effects—not hardware ray tracing.

## Canonical repository

**Public GitHub repository:** [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver)  
**Default branch:** `main`

The public repository is the durable source of truth. Repository creation and each phase require explicit owner authorization.

## Read these first

1. [`PROJECT_PLAN.md`](PROJECT_PLAN.md) — requirements, technical decisions, phase instructions, acceptance gates, and risks.
2. [`AGENTS.md`](AGENTS.md) — mandatory working rules for future sessions.
3. [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) — actual progress, verification evidence, blockers, and the next authorized action.
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — ownership, coordinates, timing, lifecycle, and module dependencies.
5. [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) — the visual quality contract every later phase is reviewed against, including the region brief.
6. [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) — where every asset comes from, verifiably, for free. Read before sourcing anything.
7. [`docs/decisions/`](docs/decisions/) — ADR 0001 (physics/tooling), ADR 0002 (Three.js renderer decision), ADR 0003 (vehicle physics, tire model, input smoothing, chase camera), ADR 0004 (visual fidelity, rendering pipeline), ADR 0005 (free-and-open asset strategy, region, brand, audio).
8. [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) — safe remote synchronization and recovery.
9. [`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md) — model/texture/audio licensing and large-file policy.
10. [`CREDITS.md`](CREDITS.md) — attribution register (written by the asset pipeline as assets land).

## Setup

Use supported Node.js **22.13+ in the 22.x line** (the `.nvmrc` selects 22), or a compatible newer supported release. The toolchain also accepts Node 20.19+, but use a maintained Node release for ongoing development.

```bash
git clone https://github.com/mdraficode/Endless-Driver.git
cd Endless-Driver
npm ci
npm run dev
```

No environment variables or API keys are required; licensed runtime assets are bundled in the repository. Installed packages and generated output are intentionally not committed; recreate them with `npm ci` after moving sessions.

## Commands

| Command                 | Purpose                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server on port 5173 with the drivable car                                                                                                                  |
| `npm run build`         | Static production output in `dist/`                                                                                                                                 |
| `npm run preview`       | Serve the production build on port 4173                                                                                                                             |
| `npm run typecheck`     | Type-check application and tooling/test TypeScript                                                                                                                  |
| `npm run lint`          | ESLint checks                                                                                                                                                       |
| `npm run format`        | Format tracked source/configuration/documentation                                                                                                                   |
| `npm run format:check`  | Verify formatting without modifying files                                                                                                                           |
| `npm test`              | Run unit/scaffold tests (Node environment)                                                                                                                          |
| `npm run test:watch`    | Local test watcher                                                                                                                                                  |
| `npm run check`         | Formatting, lint, types, tests, and production build                                                                                                                |
| `npm run capture:route` | Re-shoot the 12 route bookmarks and SSIM-diff them against `baseline/route/` (needs a `vite preview` server on port 4173 and Playwright installed with `--no-save`) |

Vite binds to `0.0.0.0` and accepts the Arena `.e2b.app` preview domain. Browser-facing code must use relative URLs so a dev-server proxy can reach services; never call the sandbox's `localhost` from the user's browser.

## Driving controls

**Driving** (keyboard on desktop; multi-touch controls shipped early for touch devices)

| Input                  | Action                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `W` / `↑`, `S` / `↓`   | Progressive throttle and brake; holding the brake once stopped engages reverse                                                 |
| `A` / `←`, `D` / `→`   | Rate-limited steering (no snapping); grip falls away as the car is pushed harder                                               |
| `Space`                | Handbrake — cuts rear lateral grip for handbrake turns and slides                                                              |
| `R`                    | Reset the car to the spawn pose                                                                                                |
| `C`                    | Cycle camera views: Close → Normal → Far chase distances → debug orbit → Close                                                 |
| Free-canvas swipe/drag | Orbit the chase camera through the surroundings; one canvas-width drag is 360°, and throttle/brake smoothly recenters the view |

Touch-capable devices show a virtual steering joystick, gas/brake pedals, handbrake, camera/reset, and fullscreen/landscape controls. Independent touch points support simultaneous steering and acceleration; final real-device checks and polish remain part of the gated Phase 8 scope.

**Debug camera** (when the orbit camera is active)

- **Drag** — orbit
- **Wheel / pinch** — zoom
- **Right-drag or two-finger drag** — pan

## Repository layout

```text
index.html        page shell: canvas, diagnostics host, status region
src/
  main.ts         DOM lookup, application start, dev-only debug handle
  core/           Application, Engine (renderer/loop/resize), SceneManager, PerformanceMonitor
  config/         render.ts, world.ts, physics.ts, vehicle.ts, input.ts, camera.ts — tuning data
  shared/         math.ts, vector.ts — engine-independent numeric helpers
  ui/             Diagnostics, gameplay status and touch UI; final settings polish in Phase 8
  physics/        Rapier world, fixed-step loop, terrain colliders, statistics (Phase 2/4)
  world/          seeded terrain/roads, streamed vegetation, town and collision fields (Phase 4/5)
  vehicles/       raycast car, tire model, drivetrain, telemetry, CarVisual (Phase 2)
  input/          keyboard + multi-touch action inputs; touch shipped early (Phase 2/8)
  cameras/        damped chase camera; orbit debug camera (cockpit in Phase 6) (Phase 2/6)
  environment/    solar model, time-of-day clock, daylight curves; seasons/weather in Phase 7
  shaders/        TSL node materials: atmosphere sky, post chain, vignette
  assets/         pinned fetch pipeline, loaders, manifest, licence register
  lab/            material studio (?scene=studio), prop inspector (?scene=props), validation route (?scene=route), Aohara night block (?scene=city)
  workers/        bounded terrain generation jobs (Phase 4)
public/assets/    licensed CC0-first HDRI, surface, model and look assets
tests/            unit, physics, integration and asset-pipeline checks
docs/             architecture, decisions, handoff, asset/Git policies
```

## Execution status

| Stage                                                          | Status                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Planning and project structure                                 | Complete and pushed to the public repository                                                                           |
| Current verification                                           | FPS check passed locally at `7f33b23` (55 files / 486 tests; 17 assets / 39,714,769 bytes); Validate #147 / Pages #137 green; city-density check pending; visual acceptance open |
| Phase 1: engine, loop, camera, lighting                        | Implemented, verified, and pushed                                                                                      |
| Phase 2: vehicle physics, input, camera                        | Implemented and verified (unit, physics, integration, and browser gates)                                               |
| Visual-fidelity research and re-plan                           | Complete 2026-10-14 (`docs/RESEARCH_AAA_FIDELITY.md`, `docs/VISUAL_TARGET.md`, ADR 0004)                               |
| Sourcing, region, brand, audio decisions                       | Complete 2026-10-14 (`docs/ASSET_SOURCES.md`, ADR 0005): free-and-open only, rural-Japan region, fictional brand       |
| Phase 3: renderer, lighting, post, asset and material pipeline | Code-complete; named-hardware frame-budget validation remains open                                                     |
| Phase 4: terrain, roads, streaming                             | Built scope delivered 2026-10-15; bridges/tunnels deferred                                                             |
| Phase 5: vegetation, props, atmosphere                         | **Authorized 2026-10-18; ground-cover/detail increment checked and deployed; density/LOD and visual acceptance open**  |
| Phase 6: hero car, materials, vehicle fidelity                 | **Authorized 2026-10-18; sequenced after Phase 5 acceptance**                                                          |
| Phase 7: weather, seasons, surface behaviour                   | Gated — requires explicit owner instruction                                                                            |
| Phase 8: final mobile/HUD/camera/polish pass                   | Gated — requires explicit owner instruction                                                                            |
| Phase 9: Aohara Metropolis urban systems                       | **Authorized 2026-10-19; facade detail checked/deployed; bounded infill/traffic/pedestrian increment implemented, check pending; visual acceptance open** |

Verification detail — including how browser checks were performed, the device/tooling used, and what remains unverified — is recorded in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md). Green checks do **not** prove realistic vehicle physics, device support, or a 60 FPS guarantee on a given machine.

## Durable progress across sessions

Use [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) as the canonical source of truth. Each session: read the handoff, verify branch/remote, install with `npm ci`, work only on the authorized phase, validate, update the handoff and status docs, commit, push, and verify remote SHA alignment. Never describe work as remotely saved when its push failed or was unavailable.

The unsupported Arena GitHub connector was bypassed through the owner's official GitHub CLI device authorization. That is runtime Git/API authentication, not an enabled Arena connector; credentials stay outside source and archives, and reauthorization may be needed after a runtime reset. Content already pushed to GitHub does not depend on that runtime surviving.

## Licensing and publication

The GitHub repository is **public** by owner instruction. `package.json` remains `private: true` to prevent accidental npm publication.

No open-source distribution license has been selected, so project metadata remains `UNLICENSED`. Public visibility does not itself assign an open-source license. Dependencies retain their own licenses (Three.js: MIT). Runtime assets use the verified CC0-first register with the documented credited CC-BY exception; see [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md), [`CREDITS.md`](CREDITS.md), and [`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md).

## Next step

The previously reported `src/config/props.ts` build failure was not reproduced: the current TypeScript checks and all 21 `props-config` tests pass. Its original log is unavailable, so the historical cause remains unknown. Next, arrange owner-device review of gameplay ground colour (it must not read white or snowy), tree streaming/pop-in, foliage readability, and whether the tier-bounded sway is visible but restrained; these remain unvalidated. Also review the requested camera behavior in a live browser: a full surroundings swipe should keep the car framed, and a fresh throttle/brake input should ease back to the authored chase view. The camera change is code-tested but has no browser/device acceptance or performance measurement. The 2026-10-19 vehicle effects and forgiving-handling increment is also automated-test-only so far; exhaust/tire smoke, shift sparks and speed marks have not had a browser visual pass or manual drive review. Separately review `?scene=city&time=23.5` and manually drive at `?spawn=aohara-city&time=23.5` for Aohara lane readability and night lighting. The default start remains Aohara Central Avenue; explicit rural Hinode starts and `?spawn=random` remain available. Phase 5 acceptance remains open; Phase 6 stays sequenced after it; Phases 7–8 remain gated. Full traffic AI and collision handling, pedestrian crossings/right-of-way, grade-separated/highway links, and Phase 3 named-hardware frame-budget validation remain open. White-ground, tree-pop, dark-foliage and imperceptible-lighting reports are not visually resolved until owner-device evidence confirms the result. Gameplay terrain has no snow splat or snow texture; this code-level removal is not a verified visual fix. See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) and [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md).

**Try it:** <https://mdraficode.github.io/Endless-Driver/> supports keyboard driving and touch controls on touch-capable devices. The default driving launch starts on Aohara Central Avenue; add `?time=23.5` for night, pin that start with `?spawn=aohara-city&time=23.5`, or opt into district rotation with `?spawn=random`. Manual driving, owner-device visuals and performance remain unvalidated; the new handling/effects have code and automated-test coverage but no visual/browser acceptance yet. Procedural tire smoke is slip-triggered, wind marks begin above 90 km/h, and these effects do not alter grip; the Aohara driving world also has bounded signal-aware visual traffic and sidewalk pedestrians without moving collision or full crossing AI. For previews, use `?scene=studio` for the look-dev grid, `?scene=props` for the derived-model inspector, `?scene=city&time=23.5` for the Aohara night-lighting/wet-look preview, or `?scene=route` for fixed validation bookmarks, `?time=6.5` / `?time=18.5` for dawn and night, `?tier=a|b|c` to force a quality tier, and `?backend=webgl` to force the fallback path. `?lut=none` removes the colour look, `?lutmix=0.5` trims it, and `?dof=1&bokeh=17` forces depth of field at a chosen aperture. The resolution/AA path has its own switches: `?taa=0` turns TAAU off (falling back to SMAA), `?aa=smaa|fxaa|none|taa` names a strategy, `?res=0.7` fixes the scene-pass scale, and `?dynres=0|1` toggles adaptive scaling. B/A use TAAU reconstruction; C keeps FXAA and may linearly upscale a reduced scene pass (so it can look softer). `?mblur=0` removes motion blur and `?mb=0.5` sets its high-speed maximum; default B/A stays sharp through 120 km/h and ramps the shutter by 195 km/h, while C has no motion blur. The route scene takes `?bookmark=start-noon` (3 stations × dawn/noon/dusk/night), and the atmosphere has comparison switches: `?hfog=0` changes height-falloff handling, `?godrays=1` forces light shafts on, and `?grain=0` / `?clouds=0` hold per-frame confounds still for captures. `?contact=0` removes the contact shadows, `?ssgi=1` forces bounced light on anywhere, and `?tonemap=agx` replays the frame through the AgX tone curve instead of ACES. The HUD's `Resolution` row reports the scene-pass scale and active path (`taau @ 84%`, `fxaa @ 100%`).

Phase 2 verification evidence, measured handling numbers, and the exact browser checks that were run are recorded in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md). How the project intends to reach a look
that holds up next to a console racing game — levers ranked by what actually changes how real the image feels, and
the honest limits of a browser — is in [`docs/REALISM_PLAN.md`](docs/REALISM_PLAN.md).
