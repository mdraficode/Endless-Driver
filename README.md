# Endless Driver

A cross-platform, procedural 3D web driving game built with **Three.js, Rapier, TypeScript, Vite, and Tailwind CSS**.

> **Current state: Phase 1 implemented (renderer, loop, scene foundation, diagnostics). Phase 2 is not authorized.** There is still no physics world, terrain, vehicle, input handling, weather, or gameplay. The scene shows a lit reference environment with a debug orbit camera.

## Canonical repository

**Public GitHub repository:** [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver)  
**Default branch:** `main`

The public repository is the durable source of truth. Repository creation and each phase require explicit owner authorization.

## Read these first

1. [`PROJECT_PLAN.md`](PROJECT_PLAN.md) — requirements, technical decisions, six-phase instructions, acceptance gates, and risks.
2. [`AGENTS.md`](AGENTS.md) — mandatory working rules for future sessions.
3. [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) — actual progress, verification evidence, blockers, and the next authorized action.
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — ownership, coordinates, timing, lifecycle, and module dependencies.
5. [`docs/decisions/`](docs/decisions/) — ADR 0001 (physics/tooling) and ADR 0002 (Three.js renderer decision).
6. [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) — safe remote synchronization and recovery.
7. [`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md) — model/texture/audio licensing and large-file policy.

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
| `npm run dev`          | Vite dev server on port 5173 with the Phase 1 scene  |
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

## Phase 1 controls

- **Drag** — orbit the debug camera
- **Wheel / pinch** — zoom
- **Right-drag or two-finger drag** — pan

These are debug camera controls only; there is no driving input yet.

## Repository layout

```text
index.html        page shell: canvas, diagnostics host, status region
src/
  main.ts         DOM lookup, application start, dev-only debug handle
  core/           Application, Engine (renderer/loop/resize), SceneManager, PerformanceMonitor
  config/         render.ts — Phase 1 tuning data (pixel-ratio cap, shadows, sky, lighting)
  shared/         math.ts — engine-independent numeric helpers
  ui/             DiagnosticsOverlay (HUD); gameplay HUD and touch overlay are future work
  physics/        Rapier world, colliders, snapshots            (Phase 2, not implemented)
  world/          seeded terrain, roads, chunks, origin rebasing (Phase 3, not implemented)
  vehicles/       controllers, drivetrain, telemetry, visuals    (Phases 2/4, not implemented)
  input/          keyboard/touch → normalized actions            (Phases 2/5, not implemented)
  cameras/        chase, cockpit, orbit                          (Phase 4, not implemented)
  environment/    day/night, seasons, weather, surface state      (Phase 6, not implemented)
  shaders/        custom WebGL2 effects                          (Phase 6, not implemented)
  assets/         loaders, manifest handling, ownership          (later phases)
  workers/        bounded CPU generation jobs                    (Phase 3, not implemented)
public/assets/    empty licensed-asset inventory and future folders
tests/            scaffold checks, unit tests, future test layers
docs/             architecture, decisions, handoff, asset/Git policies
```

## Execution status

| Stage                                   | Status                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Planning and project structure          | Complete and pushed to the public repository                               |
| Tooling and scaffold validation         | Complete; lint, types, formatting, tests, and build pass locally and in CI |
| Phase 1: engine, loop, camera, lighting | Implemented, verified, and pushed; awaiting Phase 2 authorization          |
| Phases 2–6                              | Not started                                                                |

Verification detail — including how browser checks were performed, the device/tooling used, and what remains unverified — is recorded in [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md). Green checks do **not** prove realistic vehicle physics, device support, or a 60 FPS guarantee on a given machine.

## Durable progress across sessions

Use [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) as the canonical source of truth. Each session: read the handoff, verify branch/remote, install with `npm ci`, work only on the authorized phase, validate, update the handoff and status docs, commit, push, and verify remote SHA alignment. Never describe work as remotely saved when its push failed or was unavailable.

The unsupported Arena GitHub connector was bypassed through the owner's official GitHub CLI device authorization. That is runtime Git/API authentication, not an enabled Arena connector; credentials stay outside source and archives, and reauthorization may be needed after a runtime reset. Content already pushed to GitHub does not depend on that runtime surviving.

## Licensing and publication

The GitHub repository is **public** by owner instruction. `package.json` remains `private: true` to prevent accidental npm publication.

No open-source distribution license has been selected, so project metadata remains `UNLICENSED`. Public visibility does not itself assign an open-source license. Dependencies retain their own licenses (Three.js: MIT). No third-party car models, textures, environments, or sounds are included yet; follow [`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md) before adding any.

## Next step

**Wait for the user to explicitly authorize Phase 2** (Rapier initialization, fixed-step physics, and a keyboard-driven placeholder vehicle). Completing Phase 1 does not authorize it.
