# Endless Driver

A cross-platform, procedural 3D web driving game built with **Three.js, Rapier, TypeScript, Vite, and Tailwind CSS**.

> **Current state: Phase 3 in progress (renderer, lighting, post-processing, and the asset/material pipeline). Phases 1–2 are implemented, verified, and pushed; Phases 4–8 are not authorized.**
>
> The Phase 2 car drives on a flat reference arena with raycast suspension, a six-speed drivetrain, a slip-based tire model, smoothed keyboard input, and a damped chase camera — but the presentation is still placeholder. The owner's target is Forza-Horizon-class visuals, so the roadmap was rearranged (ADR 0004):
>
> - [`docs/RESEARCH_AAA_FIDELITY.md`](docs/RESEARCH_AAA_FIDELITY.md) — what Forza actually does, the verified Three.js r186 capability audit, a 20-row gap analysis, legal asset sourcing, and six explicit non-promises.
> - [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) — the visual contract: five pillars, per-system quality bars, tier matrix (C/B/A), look-dev workflow, and the **rural-Japan region brief** ("Hinode Prefecture").
> - [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) — the verified **free-and-open** asset register: Poly Haven and ambientCG (API-checked on 2026-10-14), Sonniss GDC game audio, Freesound CC0, CC0 cars, open-source authoring tools — and exactly where free sourcing reaches its ceiling.
>
> **Owner decisions (2026-10-14, [ADR 0005](docs/decisions/0005-free-and-open-asset-strategy.md)):** free and open assets only, no purchases; unbadged fictional brand; the fictional rural-Japan region; audio from free sample libraries plus a project-owned engine synth; photo mode in scope for Phase 8.
>
> Terrain, roads, streaming, vegetation, the hero car, weather/seasons, touch controls, and the post-processing stack are all still future work.

## Canonical repository

**Public GitHub repository:** [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver)  
**Default branch:** `main`

The public repository is the durable source of truth. Repository creation and each phase require explicit owner authorization.

## Read these first

1. [`PROJECT_PLAN.md`](PROJECT_PLAN.md) — requirements, technical decisions, six-phase instructions, acceptance gates, and risks.
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

No environment variables, API keys, or third-party assets are required. Installed packages and generated output are intentionally not committed; recreate them with `npm ci` after moving sessions.

## Commands

| Command                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Vite dev server on port 5173 with the drivable car   |
| `npm run build`        | Static production output in `dist/`                  |
| `npm run preview`      | Serve the production build on port 4173              |
| `npm run typecheck`    | Type-check application and tooling/test TypeScript   |
| `npm run lint`         | ESLint checks                                        |
| `npm run format`       | Format tracked source/configuration/documentation    |
| `npm run format:check` | Verify formatting without modifying files            |
| `npm test`             | Run unit/scaffold tests (Node environment)           |
| `npm run test:watch`   | Local test watcher                                   |
| `npm run check`        | Formatting, lint, types, tests, and production build |

Vite binds to `0.0.0.0` and accepts the Arena `.e2b.app` preview domain. Browser-facing code must use relative URLs so a dev-server proxy can reach services; never call the sandbox's `localhost` from the user's browser.

## Phase 2 controls

**Driving** (keyboard only for now; touch arrives in Phase 8)

| Input                | Action                                                                           |
| -------------------- | -------------------------------------------------------------------------------- |
| `W` / `↑`, `S` / `↓` | Progressive throttle and brake; holding the brake once stopped engages reverse   |
| `A` / `←`, `D` / `→` | Rate-limited steering (no snapping); grip falls away as the car is pushed harder |
| `Space`              | Handbrake — cuts rear lateral grip for handbrake turns and slides                |
| `R`                  | Reset the car to the spawn pose                                                  |
| `C`                  | Toggle between the chase camera and the Phase 1 debug orbit camera               |

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
  ui/             DiagnosticsOverlay (HUD); gameplay HUD and touch overlay are future work
  physics/        Rapier world, fixed-step loop, arena colliders, statistics   (Phase 2)
  world/          seeded terrain, roads, chunks, origin rebasing    (Phase 4, not implemented)
  vehicles/       raycast car, tire model, drivetrain, telemetry, CarVisual     (Phase 2)
  input/          keyboard → smoothed actions, command queue (touch in Phase 8) (Phase 2/8)
  cameras/        damped chase camera; orbit debug camera (cockpit in Phase 6)  (Phase 2/6)
  environment/    day/night, seasons, weather, surface state       (Phase 7, not implemented)
  shaders/        TSL node materials                               (Phase 3, not implemented)
  assets/         pipeline, loaders, manifest, licence register    (Phase 3, not implemented)
  workers/        bounded CPU generation jobs                      (Phase 4, not implemented)
public/assets/    empty licensed-asset inventory and future folders
tests/            scaffold checks, unit tests, future test layers
docs/             architecture, decisions, handoff, asset/Git policies
```

## Execution status

| Stage                                                          | Status                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Planning and project structure                                 | Complete and pushed to the public repository                                                                     |
| Tooling and scaffold validation                                | Complete; lint, types, formatting, tests, and build pass locally and in CI                                       |
| Phase 1: engine, loop, camera, lighting                        | Implemented, verified, and pushed                                                                                |
| Phase 2: vehicle physics, input, camera                        | Implemented and verified (unit, physics, integration, and browser gates)                                         |
| Visual-fidelity research and re-plan                           | Complete 2026-10-14 (`docs/RESEARCH_AAA_FIDELITY.md`, `docs/VISUAL_TARGET.md`, ADR 0004)                         |
| Sourcing, region, brand, audio decisions                       | Complete 2026-10-14 (`docs/ASSET_SOURCES.md`, ADR 0005): free-and-open only, rural-Japan region, fictional brand |
| Phase 3: renderer, lighting, post, asset and material pipeline | **In progress** (authorized 2026-10-14)                                                                          |
| Phase 4: terrain, roads, streaming                             | Gated                                                                                                            |
| Phase 5: vegetation, props, atmosphere                         | Gated                                                                                                            |
| Phase 6: hero car, materials, vehicle fidelity                 | Gated; needs the car-asset decision                                                                              |
| Phase 7: weather, seasons, surface behaviour                   | Gated                                                                                                            |

Verification detail — including how browser checks were performed, the device/tooling used, and what remains unverified — is recorded in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md). Green checks do **not** prove realistic vehicle physics, device support, or a 60 FPS guarantee on a given machine.

## Durable progress across sessions

Use [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) as the canonical source of truth. Each session: read the handoff, verify branch/remote, install with `npm ci`, work only on the authorized phase, validate, update the handoff and status docs, commit, push, and verify remote SHA alignment. Never describe work as remotely saved when its push failed or was unavailable.

The unsupported Arena GitHub connector was bypassed through the owner's official GitHub CLI device authorization. That is runtime Git/API authentication, not an enabled Arena connector; credentials stay outside source and archives, and reauthorization may be needed after a runtime reset. Content already pushed to GitHub does not depend on that runtime surviving.

## Licensing and publication

The GitHub repository is **public** by owner instruction. `package.json` remains `private: true` to prevent accidental npm publication.

No open-source distribution license has been selected, so project metadata remains `UNLICENSED`. Public visibility does not itself assign an open-source license. Dependencies retain their own licenses (Three.js: MIT). No third-party car models, textures, environments, or sounds are included yet; follow [`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md) before adding any.

## Next step

**Phase 3 is authorized and in progress.** The renderer migration has landed: `WebGPURenderer` with the WebGL2 fallback, a TSL-lit scene (Preetham sky, HDRI environment lighting, cascaded shadows), a `RenderPipeline` post chain, and the pinned/verified asset pipeline. Still to come in the phase: the C/B/A tier system, the remaining post effects and anti-aliasing, the time-of-day clock, and the studio/route look-dev scenes. Phase 4 (terrain, roads, streaming) is **not** authorized — see [`PROJECT_PLAN.md`](PROJECT_PLAN.md) §9 for the deliverable list and the stop condition.

Phase 2 verification evidence, measured handling numbers, and the exact browser checks that were run are recorded in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md).
