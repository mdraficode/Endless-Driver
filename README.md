# Endless Driver

A cross-platform, procedural 3D web driving game built with **Three.js, Rapier, TypeScript, Vite, and Tailwind CSS**.

> **Current state (2026-10-23):** Phase 4 built scope is delivered, the owner reports Phase 5 passed, and Phase 6 vehicle/render work plus Phase 9 urban systems are authorized; Phases 7–8 remain gated. The owner directed integration of MMC Works' Generic Sport Coupé Car (CC BY 4.0), allowing free licences that clearly permit intended use and redistribution with required attribution. The supplied neutral-screen archive is hash-identified; four local views show no visible exterior branding or unambiguous real-car identity. `ModelLbmw` in the FBX and the creator's separate BMW M3 project remain cautions, not proof. Keep the sanitized dashboard media and stop if closer review identifies a specific real-car design. The reproducible FBX-to-GLB pipeline, manifest/CC BY 4.0 attribution, in-game credits, and async runtime loading are implemented; the generated 4.92 MB GLB passes `npm run assets:verify` (20 assets / 49.84 MB). The full project check, CI/deploy, and browser/manual visual review are still pending; `CarVisual` remains the fail-soft fallback. Four source views are a provisional no-brand/design pass, not legal clearance. No owner-device review, manual drive, or FPS claim is made.


> The natural layer adds deterministic district/surface-aware grass, ferns, wildflowers and static stones as four shared-material instanced styles, preserving the C/B/A 16k/42k/100k ground-cover totals and prepare-ahead streaming. Tiered Aohara sidewalk furniture adds benches, planters, waste bins and bicycle racks with deterministic placement and clearance checks. Their combined configured capacities are C 16,028, B 42,042 and A 100,058 instances; `getContentStats` reports active combined instances, configured capacity and eight static instance pools (four ground-cover styles plus four furniture kinds—not a measured draw-call count). Full local `npm run check` passed on `f98adfb` (58 test files / 500 tests; 17 assets / 39,714,769 bytes verified; production build), and GitHub Validate #162 plus Pages Deploy #152 succeeded. No browser visual, device-performance, or owner acceptance is claimed. Earlier work adds TSL wind/backlight, facade/glazing/roof details, FPS adaptation and tiered Aohara infill/traffic/pedestrians; C-tier spatial upscaling can look softer because it has no temporal reconstruction.

> **Phase 6 renderer/PBR foundation (2026-10-21):** WebGPU is preferred with automatic WebGL2 fallback; AgX is the default tone curve, the Radiance HDRI can be displayed as a background for comparison, and the TSL render chain uses MRT normals/depth and SSAO alongside SMAA/TAAU. Scanned opaque surfaces bind sRGB albedo, tangent-space normals, linear AO/roughness/metalness maps, and large-surface macro variation. The in-house roadster uses project-authored node-based physical materials; glazing and emissives have no fabricated maps. One Three.js unit equals one metre. Vehicle effects use fixed-capacity GPU compute on WebGPU and are disabled on WebGL2 rather than simulated on the CPU. Gameplay-wide bloom remains off to preserve the approved localized-lighting look. The full local `npm run check` passed on code commit `64c07f6` (58 test files / 498 tests; 17 assets / 39,714,769 bytes verified; production build). This is implementation and automated-validation evidence only—not runtime visual acceptance or device-performance evidence.

> **Archived vehicle-search note (2026-10-22; superseded by the current status above):** the earlier in-house roadster and rejected Meshy/BlendSwap/Grab3D leads remain documented as historical research. The current selected hero is the MMC Works Generic Sport Coupé Car, now integrated through the pinned conversion/runtime pipeline. The target remains realistic, unbadged, and brand/design screened.
>
> - [`docs/RESEARCH_AAA_FIDELITY.md`](docs/RESEARCH_AAA_FIDELITY.md) — what Forza actually does, the verified Three.js r186 capability audit, a 20-row gap analysis, legal asset sourcing, and six explicit non-promises.
> - [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) — the visual contract: five pillars, per-system quality bars, tier matrix (C/B/A), look-dev workflow, rural Hinode, and the separately authorized **Aohara Metropolis** addition.
> - [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) — the verified free/open asset register: CC0 environment assets and compatible CC-BY content, including the integrated hero car and its required CC BY 4.0 attribution.
>
> **Owner decisions:** no purchases, paid plans, subscriptions, or credits; CC0 is preferred, but compatible free licences including CC BY 4.0 are accepted for the selected hero with required attribution; no new source accounts without approval; default branding stays fictional/unbadged; no uncleared recognizable real-car design; preserve the neutral dashboard media. ADR 0008 records the hero-car exception. Phase 9 remains authorized; Phases 7–8 remain gated. Audio and photo-mode scope remains as recorded in ADR 0005.
>
> **World-detail follow-up (2026-10-21):** the owner reports Phase 5 passed; the requested audit → natural understory → streetscape/buildings → integrated tier-balance sequence is now code-complete. The Aohara increment adds deterministic, clearance-checked sidewalk furniture while preserving the 5×5 grid, default Central Avenue start, rural Hinode, pinned `?spawn=<id>` choices and explicit `?spawn=random`. Natural and urban-detail configured capacities total C/B/A = 16,028 / 42,042 / 100,058; these are code budgets, not measured GPU frame-time or draw-call limits. Phase 6 and Phase 9 remain authorized; the new unbadged roadster and visible open cabin are code-authored, while runtime visual review and the cockpit-camera contract remain unfinished. Aohara's night kit includes 240 instanced streetlamps (40 m spacing), 48 banners, 22 varied lower-rise buildings, a stadium, 18 abstract billboards and locally budgeted architectural lights alongside the existing 32 high-rises; total point-light caps are C/B/A 6/8/12 (street 4/6/8; architecture 2/2/4), and whole-frame bloom remains off. The wet-look clearcoat is static visual PBR—not SSR, rain, standing water, weather or traction. The current visual traffic includes passenger cars, city buses, rigid trucks, semi-trailer rigs and farm tractors within the original C/B/A vehicle caps; collision-resolved AI, pedestrian crossings/right-of-way, further district expansion, expressways, tunnels and flyovers remain future Phase 9 work. Gameplay terrain must remain non-white and snow-free. No runtime visual acceptance or named-device FPS evidence is claimed; weather/seasons and final polish remain gated in Phases 7–8. The renderer uses HDRI image-based lighting, AgX tone mapping by default, and screen-space effects—not hardware ray tracing.

## Canonical repository

**Public GitHub repository:** [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver)  
**Default branch:** `main`

The public repository is the durable source of truth. Repository creation and each phase require explicit owner authorization.

## Read these first

1. [`PROJECT_PLAN.md`](PROJECT_PLAN.md) — requirements, technical decisions, phase instructions, acceptance gates, and risks.
2. [`AGENTS.md`](AGENTS.md) — mandatory working rules for future sessions.
3. [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) — actual progress, verification evidence, blockers, and the next authorized action.
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — ownership, coordinates, timing, lifecycle, and module dependencies.
5. [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) — the visual quality contract every later phase is reviewed against, including the region brief. [`docs/GRAPHICS_REFERENCE_ANALYSIS.md`](docs/GRAPHICS_REFERENCE_ANALYSIS.md) records the public reference evidence and map assignments.
6. [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) — where every asset comes from, verifiably, for free. Read before sourcing anything.
7. [`docs/decisions/`](docs/decisions/) — ADR 0001 (physics/tooling), ADR 0002 (Three.js renderer decision), ADR 0003 (vehicle physics, tire model, input smoothing, chase camera), ADR 0004 (visual fidelity, rendering pipeline), ADR 0005 (free-and-open asset strategy, region, brand, audio), ADR 0008 (CC-BY hero vehicle).
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
  config/         render/world/physics/vehicle/traffic-vehicles/input/camera tuning and tier budgets
  shared/         math.ts, vector.ts — engine-independent numeric helpers
  ui/             Diagnostics, gameplay status and touch UI; final settings polish in Phase 8
  physics/        Rapier world, fixed-step loop, terrain colliders, statistics (Phase 2/4)
  world/          seeded terrain/roads, streamed vegetation, town, Aohara and tiered traffic (Phase 4/5/9)
  vehicles/       raycast car, tire model, drivetrain, telemetry, original roadster CarVisual (Phase 2/6)
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

| Stage                                                          | Status                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning and project structure                                 | Complete and pushed to the public repository                                                                                                                                                                                             |
| Current verification                                           | Last full `npm run check` passed on `cdcd8f1d6952581c93744de4d073454059b094c5`: 61 test files / 509 tests, 19 assets / 44,913,263 bytes, production build. Validate #179 and Pages Deploy #169 passed. Not rerun for this documentation-only increment; runtime visual/device review remains separate |
| Phase 1: engine, loop, camera, lighting                        | Implemented, verified, and pushed                                                                                                                                                                                                        |
| Phase 2: vehicle physics, input, camera                        | Implemented and verified (unit, physics, integration, and browser gates)                                                                                                                                                                 |
| Visual-fidelity research and re-plan                           | Complete 2026-10-14 (`docs/RESEARCH_AAA_FIDELITY.md`, `docs/VISUAL_TARGET.md`, ADR 0004)                                                                                                                                                 |
| Sourcing, region, brand, audio decisions                       | Current: CC0 preferred; compatible CC BY 4.0 hero permitted with attribution under ADR 0008; rural-Japan region and fictional brand; see asset register                                |
| Phase 3: renderer, lighting, post, asset and material pipeline | Code-complete; named-hardware frame-budget validation remains open                                                                                                                                                                       |
| Phase 4: terrain, roads, streaming                             | Built scope delivered 2026-10-15; bridges/tunnels deferred                                                                                                                                                                               |
| Phase 5: vegetation, props, atmosphere                         | **Owner-reported passed 2026-10-21; requested code-level world-detail follow-up is implemented; runtime visual/device evidence remains separate**                                                                                        |
| Phase 6: renderer/material foundation and hero-car fidelity    | **Authorized; renderer/PBR verified through `cdcd8f1`; MMC Works CC BY 4.0 hero integrated and asset-verified; full project check/live review pending** |
| Phase 7: weather, seasons, surface behaviour                   | Gated — requires explicit owner instruction                                                                                                                                                                                              |
| Phase 8: final mobile/HUD/camera/polish pass                   | Gated — requires explicit owner instruction                                                                                                                                                                                              |
| Phase 9: Aohara Metropolis urban systems                       | **Authorized 2026-10-19; bounded city/detail budgets verified at `f98adfb`; five-class traffic and length-aware queues pass automated checks at `cdcd8f1`; runtime visual/device review remains open**                                   |

Verification detail — including how browser checks were performed, the device/tooling used, and what remains unverified — is recorded in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md). Green checks do **not** prove realistic vehicle physics, device support, or a 60 FPS guarantee on a given machine.

## Durable progress across sessions

Use [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) as the canonical source of truth. Each session: read the handoff, verify branch/remote, install with `npm ci`, work only on the authorized phase, validate, update the handoff and status docs, commit, push, and verify remote SHA alignment. Never describe work as remotely saved when its push failed or was unavailable.

The unsupported Arena GitHub connector was bypassed through the owner's official GitHub CLI device authorization. That is runtime Git/API authentication, not an enabled Arena connector; credentials stay outside source and archives, and reauthorization may be needed after a runtime reset. Content already pushed to GitHub does not depend on that runtime surviving.

## Licensing and publication

The GitHub repository is **public** by owner instruction. `package.json` remains `private: true` to prevent accidental npm publication.

No open-source distribution license has been selected, so project metadata remains `UNLICENSED`. Public visibility does not itself assign an open-source license. Dependencies retain their own licenses (Three.js: MIT). Runtime assets use the verified CC0-first register with the documented credited CC-BY exception; see [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md), [`CREDITS.md`](CREDITS.md), and [`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md).

## Next step

The Phase 6 renderer/PBR/compute foundation and Phase 9 world-detail sequence remain the verified base (`ceaa184` and `f98adfb`). The owner-selected MMC Works Generic Sport Coupé Car (CC BY 4.0) is integrated through the pinned Blender 4.3.2 conversion, manifest, attribution UI, and fail-soft runtime loader. The 4.92 MB, three-LOD GLB passes `npm run assets:verify`; the full project check and CI/deploy are pending. Keep the in-house Kaminari GT as the loader fallback, preserve the sanitized dashboard media, and stop if a specific real-car design is identified. The public listing and four local source renders are recorded in ADR 0008 and `docs/ASSET_SOURCES.md` §3.5. No runtime visual review, owner-device acceptance, manual drive, or named-device FPS measurement is claimed; FPS remains unstable by owner report. Preserve no-global-bloom, no-fog/mist/haze, CC0-first maps, prepare-ahead streaming, current spawns/grid/relaxing balance, Aohara's static-only wet-look and no CPU particle fallback. Do not enter Phases 7–8. See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) and [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md).

**Try it:** <https://mdraficode.github.io/Endless-Driver/> supports keyboard driving and touch controls on touch-capable devices. The default driving launch starts on Aohara Central Avenue; add `?time=23.5` for night, pin that start with `?spawn=aohara-city&time=23.5`, or opt into district rotation with `?spawn=random`. The automated checks and unit tests for the in-house roadster and classed traffic pass at `cdcd8f1`; manual driving, owner-device visuals and performance remain unvalidated, and no visual/browser acceptance is claimed. Procedural tire smoke is slip-triggered, wind marks begin above 90 km/h, and these effects do not alter grip; the Aohara driving world also has bounded signal-aware visual traffic and sidewalk pedestrians without moving collision or full crossing AI. For previews, use `?scene=studio` for the look-dev grid, `?scene=props` for the derived-model inspector, `?scene=city&time=23.5` for the Aohara night-lighting/wet-look preview, or `?scene=route` for fixed validation bookmarks, `?time=6.5` / `?time=18.5` for dawn and night, `?tier=a|b|c` to force a quality tier, and `?backend=webgl` to force the fallback path. `?lut=none` removes the colour look, `?lutmix=0.5` trims it, and `?dof=1&bokeh=17` forces depth of field at a chosen aperture. The resolution/AA path has its own switches: `?taa=0` turns TAAU off (falling back to SMAA), `?aa=smaa|fxaa|none|taa` names a strategy, `?res=0.7` fixes the scene-pass scale, and `?dynres=0|1` toggles adaptive scaling. B/A use TAAU reconstruction; C keeps FXAA and may linearly upscale a reduced scene pass (so it can look softer). `?mblur=0` removes motion blur and `?mb=0.5` sets its high-speed maximum; default B/A stays sharp through 120 km/h and ramps the shutter by 195 km/h, while C has no motion blur. The route scene takes `?bookmark=start-noon` (3 stations × dawn/noon/dusk/night), and the atmosphere has comparison switches: `?godrays=1` forces light shafts on, and `?grain=0` / `?clouds=0` hold per-frame confounds still for captures. `?contact=0` removes contact shadows, `?ssgi=1` forces bounced light, `?ao=0|1` toggles SSAO, `?envbg=1` shows the loaded HDRI as background, and `?bloom=1` enables the restrained high-threshold look-dev comparison. AgX is the default tone curve; `?tonemap=aces` compares ACES. The HUD's `Resolution` row reports the scene-pass scale and active path (`taau @ 84%`, `fxaa @ 100%`).

Phase 2 verification evidence, measured handling numbers, and the exact browser checks that were run are recorded in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md). How the project intends to reach a look
that holds up next to a console racing game — levers ranked by what actually changes how real the image feels, and
the honest limits of a browser — is in [`docs/REALISM_PLAN.md`](docs/REALISM_PLAN.md).
