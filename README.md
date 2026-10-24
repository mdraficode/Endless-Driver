# Endless Driver

A cross-platform, procedural 3D web driving game built with **Three.js, Rapier, TypeScript, Vite, and Tailwind CSS**.

> **Current state (2026-10-24):** the owner still reports severe gameplay frame drops/stutter and an unnatural distant-mountain view, and now reports a very low-resolution world with visible edge/road-marking lines. The image-quality follow-up is pushed in `34e947a` with a regression-test correction in `6320c09`; the correction was pushed before the successful rerun. Tier C remains the automatic performance-first tier but now starts at scene scale 0.90 (floor 0.60), disables chromatic aberration, and uses gentler sharpening; Tier B uses SMAA and starts at 1.00 (floor 0.80). Both keep adaptive scaling. Full `npm run check` passed on `6320c09` and again on clarification SHA `65439aa` (74 test files / 559 tests, 20 assets / 47,814,431 bytes verified, production build). GitHub Validate #287 and Pages Deploy #276 succeeded on `65439aa`. The owner says the jagged/flickering edge issue appears on Android, iOS/iPadOS, and desktop/laptop, and can share a screenshot/clip. The low-resolution/edge-artifact cause is not proven, and the image plus active-scale readout, browser/GPU profile, visual acceptance, FPS measurement, and mountain review are still pending. Do not claim that the patch is visually accepted or improves measured performance. Preserve the unobstructed forward road and camera recenter behavior, the fictional Hinode/Aohara setting, asset/license constraints, and the Phase 7/unrelated Phase 8 gates.

> The natural layer adds deterministic district/surface-aware grass, ferns, wildflowers and static stones as four shared-material instanced styles, preserving the C/B/A 16k/42k/100k ground-cover totals and prepare-ahead streaming. Tiered Aohara sidewalk furniture adds benches, planters, waste bins and bicycle racks with deterministic placement and clearance checks. Their combined configured capacities are C 16,028, B 42,042 and A 100,058 instances; `getContentStats` reports active combined instances, configured capacity and eight static instance pools (four ground-cover styles plus four furniture kinds—not a measured draw-call count). Full local `npm run check` passed on `f98adfb` (58 test files / 500 tests; 17 assets / 39,714,769 bytes verified; production build), and GitHub Validate #162 plus Pages Deploy #152 succeeded. No browser visual, device-performance, or owner acceptance is claimed. Earlier work adds TSL wind/backlight, facade/glazing/roof details, FPS adaptation and tiered Aohara infill/traffic/pedestrians; C-tier spatial upscaling can look softer because it has no temporal reconstruction.

> **Phase 6 renderer/PBR foundation (2026-10-21):** WebGPU is preferred with automatic WebGL2 fallback; AgX is the default tone curve, the Radiance HDRI can be displayed as a background for comparison, and the TSL render chain uses MRT normals/depth and SSAO alongside SMAA/TAAU. Scanned opaque surfaces bind sRGB albedo, tangent-space normals, linear AO/roughness/metalness maps, and large-surface macro variation. The in-house roadster uses project-authored node-based physical materials; glazing and emissives have no fabricated maps. One Three.js unit equals one metre. Vehicle effects use fixed-capacity GPU compute on WebGPU and are disabled on WebGL2 rather than simulated on the CPU. Gameplay-wide bloom remains off to preserve the approved localized-lighting look. The full local `npm run check` passed on code commit `64c07f6` (58 test files / 498 tests; 17 assets / 39,714,769 bytes verified; production build). This is implementation and automated-validation evidence only—not runtime visual acceptance or device-performance evidence.

> **Archived vehicle-search note (2026-10-22; superseded by the current status above):** the earlier in-house roadster and rejected Meshy/BlendSwap/Grab3D leads remain documented as historical research. The current selected hero is the MMC Works Generic Sport Coupé Car, now integrated through the pinned conversion/runtime pipeline. The target remains realistic, unbadged, and brand/design screened.
>
> - [`docs/RESEARCH_AAA_FIDELITY.md`](docs/RESEARCH_AAA_FIDELITY.md) — what Forza actually does, the verified Three.js r186 capability audit, a 20-row gap analysis, legal asset sourcing, and six explicit non-promises.
> - [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) — the visual contract: five pillars, per-system quality bars, tier matrix (C/B/A), look-dev workflow, rural Hinode, and the separately authorized **Aohara Metropolis** addition.
> - [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) — the verified free/open asset register: CC0 environment assets and compatible CC-BY content, including the integrated hero car and its required CC BY 4.0 attribution.
>
> **Owner decisions:** no purchases, paid plans, subscriptions, or credits; CC0 is preferred, but compatible free licences including CC BY 4.0 are accepted for the selected hero with required attribution; no new source accounts without approval; default branding stays fictional/unbadged; no uncleared recognizable real-car design; preserve the neutral dashboard media. ADR 0008 records the hero-car exception. Phase 9 and the specifically requested startup/orientation/cockpit items are authorized; Phase 7 and unrelated Phase 8 work remain gated. Audio and photo-mode scope remains as recorded in ADR 0005.
>
> **World-detail follow-up (2026-10-21):** the owner reports Phase 5 passed; deterministic natural understory, Aohara sidewalks/furniture, building detail and integrated tier budgets are code-complete. The connected 5×5 Aohara grid and default Central Avenue start are preserved alongside rural Hinode and explicit spawn overrides. Configured natural/urban enrichment capacities total C/B/A = 16,028 / 42,042 / 100,058; these are code budgets, not GPU frame-time or draw-call measurements. Aohara's night kit includes 240 instanced streetlamps, 48 banners, 22 lower-rise buildings, a stadium, 18 abstract billboards and bounded architectural lights; its wet-look clearcoat is static visual PBR, not weather, standing water, SSR or traction. Traffic now uses bounded bodies in the shared Rapier world, with collision response and transient impact animation; the optional Hinode Touge adds ungraded packed-dirt cuts and collision-enabled hazards. Gameplay terrain remains non-white and snow-free. Runtime visual/device acceptance and named-device FPS evidence remain unverified; Phase 7 and unrelated Phase 8 polish remain gated. The renderer uses HDRI image-based lighting, AgX tone mapping by default, and screen-space effects—not hardware ray tracing.

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

| Input                  | Action                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `W` / `↑`, `S` / `↓`   | Progressive throttle and brake; holding the brake once stopped engages reverse                                |
| `A` / `←`, `D` / `→`   | Rate-limited steering (no snapping); grip falls away as the car is pushed harder                              |
| `Space`                | Handbrake — cuts rear lateral grip for handbrake turns and slides                                             |
| `R`                    | Reset the car to the spawn pose                                                                               |
| `C`                    | Cycle Close → Normal → Far chase → debug orbit → cockpit → Close                                              |
| Free-canvas swipe/drag | Orbit chase views through the surroundings or look around from the cockpit; chase recenters as driving begins |

Touch-capable devices show a virtual steering joystick, gas/brake pedals, handbrake, camera/reset, and fullscreen/landscape controls. Independent touch points support simultaneous steering and acceleration; camera swipes look around from the cockpit or orbit chase views. Real-device acceptance, settings, and broad final polish remain outside the specifically authorized cockpit-camera increment.

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
  cameras/        damped chase and cockpit gameplay views; orbit debug camera
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

| Stage                                                          | Status                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning and project structure                                 | Complete and pushed to the public repository                                                                                                                                                            |
| Current verification                                           | Full `npm run check` passed on `a5f0b88` (74 test files / 559 tests, 20 assets / 47,814,431 bytes, production build); remote `main` matches. Device/visual review remains open                          |
| Phase 1: engine, loop, camera, lighting                        | Implemented, verified, and pushed                                                                                                                                                                       |
| Phase 2: vehicle physics, input, camera                        | Implemented and verified (unit, physics, integration, and browser gates)                                                                                                                                |
| Visual-fidelity research and re-plan                           | Complete 2026-10-14 (`docs/RESEARCH_AAA_FIDELITY.md`, `docs/VISUAL_TARGET.md`, ADR 0004)                                                                                                                |
| Sourcing, region, brand, audio decisions                       | Current: CC0 preferred; compatible CC BY 4.0 hero permitted with attribution under ADR 0008; rural-Japan region and fictional brand; see asset register                                                 |
| Phase 3: renderer, lighting, post, asset and material pipeline | Code-complete; named-hardware frame-budget validation remains open                                                                                                                                      |
| Phase 4: terrain, roads, streaming                             | Built scope delivered 2026-10-15; bridges/tunnels deferred                                                                                                                                              |
| Phase 5: vegetation, props, atmosphere                         | **Owner-reported passed 2026-10-21; requested code-level world-detail follow-up is implemented; runtime visual/device evidence remains separate**                                                       |
| Phase 6: renderer/material foundation and hero-car fidelity    | **Authorized; MMC Works CC BY 4.0 hero integrated; current full local check passed on `a5f0b88`; browser/manual visual review remains open**                                                            |
| Phase 7: weather, seasons, surface behaviour                   | Gated — not authorized                                                                                                                                                                                  |
| Phase 8: final mobile/HUD/camera/polish pass                   | Requested startup/orientation/cockpit items implemented; unrelated HUD/settings/final polish remain gated                                                                                               |
| Phase 9: Aohara Metropolis urban systems                       | **Authorized; traffic physics/collisions and optional Hinode touge dirt cuts/hazards pass automated checks; full project check passed at `a5f0b88`; broader city and visual/device review remain open** |

Verification detail — including how browser checks were performed, the device/tooling used, and what remains unverified — is recorded in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md). Green checks do **not** prove realistic vehicle physics, device support, or a 60 FPS guarantee on a given machine.

## Durable progress across sessions

Use [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) as the canonical source of truth. Each session: read the handoff, verify branch/remote, install with `npm ci`, work only on the authorized phase, validate, update the handoff and status docs, commit, push, and verify remote SHA alignment. Never describe work as remotely saved when its push failed or was unavailable.

The unsupported Arena GitHub connector was bypassed through the owner's official GitHub CLI device authorization. That is runtime Git/API authentication, not an enabled Arena connector; credentials stay outside source and archives, and reauthorization may be needed after a runtime reset. Content already pushed to GitHub does not depend on that runtime surviving.

## Licensing and publication

The GitHub repository is **public** by owner instruction. `package.json` remains `private: true` to prevent accidental npm publication.

No open-source distribution license has been selected, so project metadata remains `UNLICENSED`. Public visibility does not itself assign an open-source license. Dependencies retain their own licenses (Three.js: MIT). Runtime assets use the verified CC0-first register with the documented credited CC-BY exception; see [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md), [`CREDITS.md`](CREDITS.md), and [`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md).

## Next step

The owner-selected MMC Works Generic Sport Coupé Car (CC BY 4.0) remains integrated through the pinned Blender pipeline, manifest, attribution UI and fail-soft runtime loader. Preserve its sanitized dashboard media and stop if a specific real-car design is identified. Performance/mountain source and test changes are pushed at `df59fc2`; the prior full check passed on `a5f0b88`. The image-quality follow-up is pushed in `34e947a` with a regression correction in `6320c09`; full `npm run check` passes on `6320c09`. The latest edge/road-line complaint still needs an owner-device screenshot, active resolution/tier readout, device/browser details and visual retest; no FPS gain or visual acceptance is claimed. The earlier mountain and frame-drop reports remain separately unresolved. Preserve the prior default Aohara start/grid, unobstructed forward road, drive-start camera recenter, immediate vehicle-translation follow, no-global-bloom/no-fog rules, and no CPU particle fallback. Phase 7 and unrelated Phase 8 polish remain gated. See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) and [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md).

**Try it:** <https://mdraficode.github.io/Endless-Driver/> supports keyboard driving and touch controls on touch-capable devices. The default driving launch starts on Aohara Central Avenue; add `?spawn=hinode-touge` to start at the optional mountain loop, `?time=23.5` for night, `?spawn=aohara-city&time=23.5` for the city start, or `?spawn=random` for district rotation. Latest full `npm run check` passed on `65439aa`: 74 test files / 559 tests; 20 verified assets / 47,814,431 bytes; production build. GitHub Validate #287 and Pages Deploy #276 succeeded on this SHA. This automated check is not device-performance or visual acceptance. Manual driving, owner-device visual acceptance, and performance remain unvalidated. Procedural tire smoke is slip-triggered and wind marks begin above 90 km/h; neither effect changes grip. Aohara traffic has shared-world collision response and impact animation; pedestrians remain sidewalk actors without crossing right-of-way AI.
For previews, use `?scene=studio` for the look-dev grid, `?scene=props` for the derived-model inspector, `?scene=city&time=23.5` for the Aohara night-lighting/wet-look preview, or `?scene=route` for fixed validation bookmarks; `?time=6.5` / `?time=18.5` show dawn/night, `?tier=a|b|c` explicitly selects a quality tier, and `?backend=webgl` forces the fallback. Automatic selection still defaults to performance-first tier C on unmeasured devices; tier A remains opt-in. `?lut=none` removes the colour look, `?lutmix=0.5` trims it, and `?dof=1&bokeh=17` forces depth of field for comparison. The resolution/AA path has its own switches: C uses FXAA and adaptive scene scaling; B uses SMAA and adaptive scaling; A uses TAAU. C starts at 90% scene scale with a 60% floor; B starts at 100% with an 80% floor. C disables chromatic aberration and uses gentler sharpening. `?aa=smaa|fxaa|none|taa` names a strategy, `?aa=taa&taa=1` enables the temporal comparison, `?res=0.7` fixes scene-pass scale, and `?dynres=0|1` toggles adaptive scaling. Spatial upscaling can soften detail when the dynamic controller lowers scale. Compare `?tier=c&aa=smaa&res=1` to isolate SMAA at native scene scale on the C tier. `?mblur=0` removes motion blur and `?mb=0.5` sets its high-speed maximum; global shutter is off by default outside tier A. The route scene takes `?bookmark=start-noon` (3 stations × dawn/noon/dusk/night); `?godrays=1` forces shafts, and `?grain=0` / `?clouds=0` hold capture conditions still. `?contact=0` removes contact shadows, `?ssgi=1` forces bounced light, `?ao=0|1` toggles SSAO, `?envbg=1` shows the HDRI backdrop, and `?bloom=1` enables the look-dev comparison. AgX is the default tone curve; `?tonemap=aces` compares ACES. The HUD's `Resolution` row reports the active path and scene-pass scale.

Phase 2 verification evidence, measured handling numbers, and the exact browser checks that were run are recorded in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md). How the project intends to reach a look
that holds up next to a console racing game — levers ranked by what actually changes how real the image feels, and
the honest limits of a browser — is in [`docs/REALISM_PLAN.md`](docs/REALISM_PLAN.md).
