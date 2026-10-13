# Endless Driver

A planned cross-platform, procedural 3D web driving game using **Babylon.js, Rapier, TypeScript, Vite, and Tailwind CSS**.

> **Current state: documentation and initial scaffold only. Phase 1 has not started.** The app shows a static setup-status page. There is no engine scene, canvas, render loop, physics, world generation, car, or driving control implementation yet.

## Read these first

1. [`PROJECT_PLAN.md`](PROJECT_PLAN.md) — complete requirements, technical decisions, six-phase instructions, acceptance gates, and risks.
2. [`AGENTS.md`](AGENTS.md) — mandatory working rules for future sessions.
3. [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) — actual progress, validation evidence, blockers, and the next authorized action.
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — ownership, coordinates, timing, lifecycle, and module dependencies.
5. [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) — safe remote synchronization and recovery.
6. [`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md) — model/texture/audio licensing and large-file policy.

## Canonical repository

**Public GitHub repository:** [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver)  
**Default branch:** `main`

The public repository is the durable source of truth. Creation and the initial push were explicitly authorized by the owner. No Phase 1 development or deployment was authorized.

## Setup

Use supported Node.js **22.13+ in the 22.x line** (the `.nvmrc` selects 22), or a compatible newer supported release. The toolchain also accepts Node 20.19+, but use a maintained Node release for ongoing development.

```bash
git clone https://github.com/mdraficode/Endless-Driver.git
cd Endless-Driver
npm ci
npm run check

# Optional: view the scaffold-status page, not a playable game:
npm run dev
```

No environment variables, API keys, external runtime CDN scripts, or third-party assets are required for the initial scaffold. Installed packages and generated output are intentionally not committed; recreate them with `npm ci` after moving sessions.

## Commands

| Command                | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | Vite server on port 5173; serves the scaffold-status page |
| `npm run build`        | Generate static production output in `dist/`              |
| `npm run preview`      | Serve generated production output on port 4173            |
| `npm run typecheck`    | Check application and tooling/test TypeScript             |
| `npm run lint`         | ESLint checks                                             |
| `npm run format`       | Format tracked source/configuration/documentation         |
| `npm run format:check` | Verify formatting without modifying files                 |
| `npm test`             | Run the tests actually present                            |
| `npm run test:watch`   | Local test watcher                                        |
| `npm run check`        | Formatting, lint, types, tests, and production build      |

Vite binds to `0.0.0.0` and accepts the Arena `.e2b.app` preview domain. Future browser-facing service calls must use relative URLs and a server proxy, never the sandbox's localhost as though it were the user's browser.

## Repository layout

```text
src/
  app/           composition root and lifecycle
  engine/        rendering, loop, resize, diagnostics
  physics/       Rapier world, contacts, queries, snapshots
  world/         seed, terrain, roads, chunks, LOD, origin
  vehicles/      controllers, drivetrain, telemetry, visual binding
  input/         keyboard/touch -> normalized actions
  cameras/       chase, cockpit, orbit
  ui/            accessible HUD, menus, touch overlay
  environment/   day/night, seasons, weather, surface state
  shaders/       custom WebGL2 effects; optional WebGPU variants
  assets/        loaders, manifest handling, resource ownership
  config/        quality and tuning data
  shared/        engine-independent contracts/utilities
  workers/       bounded CPU generation jobs
public/assets/   empty licensed-asset inventory and future folders
tests/          scaffold checks and future test-layer folders
docs/           architecture, decisions, handoff, asset/Git policies
```

Directories are placeholders with responsibility notes, not implemented systems. Runtime dependencies are pinned but are deliberately not imported by the initial entrypoint.

## Execution status

| Stage                                   | Status                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Planning and project structure          | Saved to the public GitHub repository                                         |
| Scaffold validation                     | Passed locally; five infrastructure tests, lint, types, formatting, and build |
| GitHub push                             | Verified on `main`; initial remote inventory matched all 53 tracked files     |
| GitHub Actions                          | First validation run passed; anchored evidence in the handoff                 |
| Phase 1: engine, loop, camera, lighting | Not started; awaiting explicit user authorization                             |
| Phases 2–6                              | Not started                                                                   |

The initial Vitest suite checks infrastructure only. Green checks do **not** prove real-time rendering, vehicle physics, mobile support, or 60 FPS. Inspect [GitHub Actions](https://github.com/mdraficode/Endless-Driver/actions) for the latest committed checkpoint's result.

## Durable progress across sessions

Use [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) as the canonical source of truth. For each session: read the handoff, verify the branch/remote, install from the lockfile, work only on the authorized phase, validate, update the handoff, commit, push, and verify remote SHA alignment. Never call work remotely saved when its push failed or is unavailable.

The unsupported Arena GitHub connector was bypassed through the owner's official GitHub CLI device authorization. This is runtime Git/API authentication, not an enabled Arena connector. Credentials stay outside source/archives in private temporary runtime storage; reauthorization may be needed after a reset. Source/history already pushed to GitHub does not depend on that runtime surviving.

Portable ZIP/Git bundles remain optional recovery exports. A downloaded archive may be older than the latest GitHub commit. Import/recovery instructions are in [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md); prefer a clean GitHub clone for new sessions.

## Licensing and publication

The GitHub repository is **public** by owner instruction. `package.json` remains `private: true` to prevent accidental **npm publication**; this does not control GitHub visibility.

No open-source distribution license has been selected, so project metadata remains `UNLICENSED`. Public visibility does not itself assign an open-source license. Dependencies retain their own licenses. No third-party car models, textures, environments, or sounds are included yet; follow the asset policy before adding them.

## Next step

**Wait for the user to explicitly authorize Phase 1.** Successful repository creation/push does not itself authorize engine development, deployment, or Phase 2.
