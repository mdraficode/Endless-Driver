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

## Setup

Use supported Node.js **22.13+ in the 22.x line** (the `.nvmrc` selects 22), or a compatible newer supported release. The toolchain also accepts Node 20.19+, but use a maintained Node release for ongoing development.

```bash
# In a clean checkout of the dedicated repository:
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

| Stage                                   | Status                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Planning and project structure          | Prepared locally                                                           |
| Scaffold validation                     | See the recorded results in `docs/SESSION_HANDOFF.md`                      |
| GitHub push                             | **Not performed:** connector unsupported; repository URL/access unresolved |
| Phase 1: engine, loop, camera, lighting | Not started; awaiting explicit user authorization                          |
| Phases 2–6                              | Not started                                                                |

The initial Vitest suite checks infrastructure only. Green checks do **not** prove real-time rendering, vehicle physics, mobile support, or 60 FPS. CI is configured but has not run on GitHub until the repository receives these files.

## Durable progress across sessions

The user's dedicated GitHub repository is the intended source of truth. Verify its real URL before writing to it. The display name is **Endless Driver**; GitHub uses a URL-safe slug, usually `Endless-Driver` or `endless-driver`. No owner, remote, or repository has been guessed or created.

For each session: read the handoff, verify the branch/remote, install from the lockfile, work only on the authorized phase, validate, update the handoff, commit, push, and verify remote SHA alignment. Never call work remotely saved when the push failed or was unavailable.

After GitHub connector access proved unavailable, the user selected **ready-to-push portable delivery** for this setup. `Endless-Driver-initial.zip` includes the tracked working files and a copy of `Endless-Driver-initial.bundle`; the bundle is also supplied separately and preserves committed history. Bundle import/push instructions are in [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md). This is a fallback, not an already completed GitHub push.

## Licensing

This project is private and `UNLICENSED` until the owner selects a distribution license. Dependencies retain their own licenses. No third-party car models, textures, environments, or sounds are included yet. Do not add large or externally sourced assets without following the asset policy.

## Next step

Resolve the initial repository transfer, then **wait for the user to explicitly authorize Phase 1**. Repository setup or successful transfer does not itself authorize engine development.
