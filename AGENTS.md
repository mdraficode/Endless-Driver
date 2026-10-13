# Working Instructions for Endless Driver

This file is the first checkpoint for any assistant or contributor resuming the project.

## Current authorization

- Only planning, documentation, initial scaffolding, validation, and initial repository transfer are authorized.
- On 2026-10-13, the user explicitly authorized creating the **public** `mdraficode/Endless-Driver` repository and pushing the initial setup. That setup is saved on `main`; it does not authorize Phase 1.
- **Phase 1 has not been authorized and must not be implemented yet.**
- Do not initialize a Babylon engine/scene/canvas, render loop, camera, lights, physics, or gameplay until the user explicitly starts Phase 1.
- The current `src/main.ts` imports styles only. Its scaffold guard is intentionally temporary; replace it with runtime lifecycle tests after Phase 1 authorization.
- Do not begin the next phase automatically after completing an authorized phase.

Update this authorization section and the handoff when a later user instruction changes the permitted phase. Preserve the six-phase order in `PROJECT_PLAN.md` unless the user approves a change.

## Read before editing

1. `README.md`
2. `PROJECT_PLAN.md`
3. `docs/SESSION_HANDOFF.md`
4. `docs/ARCHITECTURE.md`
5. Relevant `docs/decisions/` records and module responsibility notes.
6. `docs/GIT_WORKFLOW.md` before touching remotes or merging histories.
7. `docs/ASSET_POLICY.md` before adding any externally sourced asset.

Check the repository root, current branch, local changes, remote URL, and latest commit. Never discard pre-existing work or assume a repository is empty. Never invent a GitHub owner, repository, URL, or credential.

## Architecture invariants

- Babylon.js handles rendering; **Rapier is the only physics authority**.
- Physics uses meters/kilograms/seconds, +Y up, +X right, vehicle -Z forward, and right-handed conversion.
- Maintain one fixed-step simulation and render interpolation; do not bind physics to frame rate.
- Keep DOM and Babylon runtime types out of engine-independent physics/world-generation logic.
- Normalize keyboard/touch into actions; input never directly moves the car.
- Seed world generation; use global sampling and shared chunk-boundary decisions.
- Keep active chunks, collider coverage, job queues, particles, and asset memory bounded.
- Floating-origin rebasing must move simulation, rendering, cameras, interpolation snapshots, and temporal state consistently.
- Every owned resource/listener/worker/WASM allocation needs explicit cleanup.
- Use WebGL2 as the baseline. WebGPU and high-cost effects are optional quality paths, not universal assumptions.

## Coding and validation

- Implement a coherent, small increment within the authorized phase, not the entire game in one response/file.
- Prefer typed interfaces, data-driven tuning, narrow ES imports, and explicit lifecycle ownership.
- Do not add speculative dependencies, a second framework, or another physics engine without a documented reason.
- Install with `npm ci`; preserve the lockfile and exact direct versions. Tool/dependency upgrades require validation and a recorded rationale.
- Run `npm run check` before committing. Add relevant tests as features appear.
- State which interactive/device tests were performed and which remain unverified.
- Scaffold tests and successful builds are not evidence of vehicle realism, browser compatibility, or 60 FPS.
- Record actual named-device measurements before making performance claims.
- No unlicensed assets, tokens, private keys, `.env` files, `node_modules`, or `dist` in Git.

## Repository continuity — mandatory

The user requested that progress be retained in the dedicated **Endless Driver** GitHub repository across sessions.

At each coherent milestone and session end:

1. Update `docs/SESSION_HANDOFF.md` with completed work, validation, decisions, blockers, phase authorization, and exact next actions.
2. Update the plan/README execution status so future sessions do not rely on chat memory.
3. Review staged changes, then create a descriptive commit.
4. Push only to the verified, user-authorized repository/branch.
5. Confirm the remote branch SHA matches the local committed SHA; report the result honestly.
6. Stop at the phase gate and wait for the next instruction.

If remote access fails or is unsupported, **do not claim a push happened**. Record the blocker and export a Git bundle plus working-file archive as fallback. Do not assume local workspace persistence is equivalent to GitHub synchronization. Never force-push, destructively reset, overwrite unrelated history, or create/change a repository or its visibility without explicit user authorization.

## Verified repository and authentication route

The canonical repository is [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver), **public**, with default branch `main`. The original 53-file scaffold was pushed and its local/Git/API SHA verified on 2026-10-13. The first GitHub Actions validation run passed; see `docs/SESSION_HANDOFF.md` for anchored evidence.

The Arena GitHub connector remains unsupported. The owner authorized the official GitHub CLI device flow; direct CLI/API/Git access works in the current runtime. Credentials are private temporary runtime data outside source and persisted snapshots, not an enabled Arena connector. Do not print/store tokens or assume authentication survives a new session.

On resume, verify the actual branch and remote. If `.git/config` did not persist and `origin` is absent, restore only the confirmed `https://github.com/mdraficode/Endless-Driver.git` URL after checking the project root. If write authentication is unavailable, reauthorize safely without asking for a token in chat. Public source can still be cloned/read without write credentials.

## Final status report for a phase

Report: work completed, tests/results, manual checks still needed, commit and verified push status, known limitations, and the next gated phase. If anything is blocked, say so plainly. Do not autonomously deploy or proceed to the next phase.
