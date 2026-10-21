# Working Instructions for Endless Driver

This file is the first checkpoint for any assistant or contributor resuming the project.

**Before anything else, read [`WORKFLOW.md`](WORKFLOW.md)** — the standard dev-environment workflow (GitHub is the only permanent home; local environments are disposable scratch; push before every run). It governs _where and how_ work happens; this file governs the engineering itself.

## Current authorization

- On 2026-10-13 the user authorized **Phase 1 only**: engine, render loop, camera, and lighting. Phase 1 is implemented, validated, and pushed.
- On 2026-10-14 the user authorized **Phase 2**: Rapier vehicle physics (raycast suspension, tire slip model, drivetrain), smooth keyboard input, and a dynamic chase camera. Phase 2 is implemented and verified; see `docs/SESSION_HANDOFF.md` for the measured evidence and `docs/decisions/0003-vehicle-physics-and-camera.md` for the decisions.
- On 2026-10-14 the user rejected the Phase 2 look and set a Forza-Horizon-class visual target, authorizing a research step-back and a full re-plan. That work is complete: `docs/RESEARCH_AAA_FIDELITY.md`, `docs/VISUAL_TARGET.md`, ADR 0004, ADR 0005, `docs/ASSET_SOURCES.md`, and the rearranged `PROJECT_PLAN.md` §6 and §9–§11.
- **Standing owner decisions (2026-10-14, ADR 0005) — treat as constraints, not suggestions:**
  - **Free and open assets only.** No purchases, no licensing fees, no restricted licences. CC0-first (Poly Haven, ambientCG, Sonniss GDC audio, Freesound CC0, Kenney, CC0 Sketchfab, open fonts); CC-BY only as an attributed exception; never paid/account-gated, NC/ND, marketplace-freebie, AI-generated, or brand-trademarked content. The verified register is `docs/ASSET_SOURCES.md`; credits live in `CREDITS.md`. **Never ask the owner to buy an asset** — if free content cannot reach the bar, author it in-house or document the gap.
  - **Region: rural Japan** — the fictional "Hinode Prefecture" (coast/harbour, sakura river road, rice terraces, bamboo shrine lane, maple gorge, cedar touge pass, highland plateau, snow-country onsen village, small town). Composite and fictional: never present it as a replica of a real place.
  - **Brand policy:** unbadged and fictional ("Kaminari" marque). No manufacturer names, badges, or trade dress anywhere, signage included.
  - **Audio:** free sample libraries (Sonniss GDC, Freesound CC0, Kenney CC0) plus a project-owned Web Audio engine synth; music from CC0 pools with CC-BY as an attributed fallback. **Photo mode** is in scope for Phase 8.
  - **Credited-asset rule (settled 2026-10-14):** the CC-BY-with-automatic-credit exception is kept, but CC0 is preferred whenever a comparable asset exists. Credits are written automatically into `CREDITS.md` and the in-game credits screen. Do not raise this as an open question again; it is a small, reversible implementation detail.
- On 2026-10-14 the user authorized **Phase 3**: renderer migration (WebGPU with the WebGL2 backend), colour pipeline and lighting, the post-processing stack, the asset pipeline, the tier system, and the look-dev scenes. Deliverables and acceptance criteria are in `PROJECT_PLAN.md` §9 (Phase 3).
- **Phase 3 working rules:** TSL node materials only — never add `ShaderMaterial`, `RawShaderMaterial`, or `onBeforeCompile` (a check enforces this); post-processing goes through the TSL `RenderPipeline`; render-quality overlays live in `src/config/tiers.ts` and are reported in diagnostics; rendering changes are validated on both backends where the sandbox permits, and the sandbox may only assert correctness, never frame rate.
- Phase 4 (terrain, roads, streaming) was authorized on 2026-10-15; its built scope is delivered, with bridges/tunnels deferred to a separately authorized urban track.
- **Historical phase gate (2026-10-18; superseded 2026-10-20):** Phase 6 originally depended on Phase 5 acceptance. The owner later broadly opened Phase 6; Phases 7–8 remain gated.
- **Historical owner authorization (2026-10-19; Phase 5 status later updated):** a new **Phase 9 — Urban Systems** was authorized to proceed in parallel with the then-unresolved Phase 5 visual-acceptance gate. The owner reported Phase 5 passed on 2026-10-21; the historical gate wording is not current. Add a fictional Japanese megacity district while preserving rural Hinode. The Aohara night-lighting slice is integrated into a connected 5×5 classed road grid with citywide sidewalks/crossings and instanced high-rises; the default game start now begins on Aohara Central Avenue, while explicit Hinode starts and `?spawn=random` remain available. A follow-up requests the HDR night view, streetlights, reflections, Gaussian diffraction, and a static wet look as Aohara-only visual material/lighting, with no weather state, rain, standing water, or traction changes. The latest owner request also authorizes denser streetlights, building/billboard/decorative light sources that illuminate the road, fictional banners, and varied architecture including stadiums, casinos, mansions and house types. Keep illumination source-local, lane-readable and tier-budgeted; no global bloom. Later Phase 9 work covers further city expansion, AI pedestrians/vehicles, grade-separated roads, and highway links. These authorizations change only Phase 9 and do not authorize Phases 7–8. The earlier Phase 6 dependency was later superseded by the owner's broad Phase 6 authorization on 2026-10-20.
- **Owner clarification (2026-10-20):** for “make the building more realistic and detailed” and “make whole gameplay environment more detailed and realistic with HDR and shader effects,” the owner selected **all current buildings** and **keep current phase gates**. This authorized a bounded detail pass for every existing Aohara building type under Phase 9, plus Phase 5 environment material/ground-cover detail. The initial instruction to keep current gates was superseded later that day by broad Phase 6 authorization; neither direction, at the time, constituted Phase 5 acceptance or authorized Phase 7 weather/seasons or Phase 8 polish. Continue using HDRI and TSL; AgX is now the default tone curve. Keep C/B/A caps, lane readability, rural Hinode and the no-global-bloom/no-hardware-ray-tracing constraints.
- **Current owner status (2026-10-21):** the owner reports Phase 5 passed. Do not keep describing its acceptance as open. The requested world-detail sequence—audit/prioritize, natural understory, pedestrian-safe streetscape/buildings, and integrated tier balance—is code-complete. Reference-driven PBR map coverage is implemented and fully checked at `ceaa184` (59 test files / 504 tests; 19 assets / 44,913,263 bytes; production build; GitHub Validate #170 and Pages Deploy #160); see `docs/GRAPHICS_REFERENCE_ANALYSIS.md`. Runtime visual review and named-device performance evidence remain separate. Phase 6 renderer/material work and Phase 9 urban systems are active; Phases 7–8 remain gated.
- **Gameplay-ground/foliage status:** earlier owner reports included white ground, tree pop-in, dark foliage and imperceptible lighting; the latest non-FPS issue report says those problems are resolved, while FPS remains unstable. Preserve a non-white, snow-free gameplay surface. Phase 5 is owner-reported passed, but no named-device frame-time measurement or runtime capture is supplied by that report. The renderer uses HDRI image-based lighting, AgX tone mapping by default, and screen-space effects—not hardware ray tracing.
- Still open: runtime visual/device review of the owner-reported Phase 5 content (without reopening its passed status); remaining Phase 6 integration/review, hero vehicle asset/interior and vehicle-fidelity review; Phase 9 AI pedestrians/vehicles, further urban expansion, expressways, tunnels, bridges/flyovers, and owner-device city validation; Phase 7 weather/seasons and Phase 8 final polish, both gated. The current Aohara district remains a bounded prototype, not owner-device visual acceptance or a finished city.
- Asset acquisition is scripted: `npm run assets:fetch` (pinned, hashed) and `npm run assets:verify` (CI; never touches the network). Never add an asset by hand or commit a file the manifest does not describe.
- `src/main.ts` is the browser entrypoint and `src/core/Application.ts` is the composition root. Runtime tests live in `tests/unit/`, `tests/physics/`, and `tests/integration/`; the old scaffold-entrypoint guard has been removed.
- Do not begin the next phase automatically after completing an authorized phase.

Update this authorization section and the handoff when a later user instruction changes the permitted phase. Preserve the phase order in `PROJECT_PLAN.md` §9 (rearranged 2026-10-14 by ADR 0004) unless the user approves another change.

## Read before editing

1. `README.md`
2. `PROJECT_PLAN.md`
3. `docs/SESSION_HANDOFF.md`
4. `docs/ARCHITECTURE.md`
5. Relevant `docs/decisions/` records — notably `0002-renderer-three-js.md`, which supersedes the renderer half of `0001` — and module responsibility notes.
6. `docs/GIT_WORKFLOW.md` before touching remotes or merging histories.
7. `docs/ASSET_POLICY.md` before adding any externally sourced asset.

Check the repository root, current branch, local changes, remote URL, and latest commit. Never discard pre-existing work or assume a repository is empty. Never invent a GitHub owner, repository, URL, or credential.

## Architecture invariants

- Three.js handles rendering; **Rapier is the only physics authority**. Do not add a second solver or a renderer-side collision resolver.
- Physics uses meters/kilograms/seconds, +Y up, +X right, vehicle -Z forward, and right-handed conversion; 1 Three.js world unit = 1 metre.
- Maintain one fixed-step simulation and render interpolation; do not bind physics to frame rate.
- Keep DOM and Three.js runtime types out of engine-independent physics/world-generation logic.
- Normalize keyboard/touch into actions; input never directly moves the car.
- Seed world generation; use global sampling and shared chunk-boundary decisions.
- Keep active chunks, collider coverage, job queues, particles, and asset memory bounded. Vehicle smoke/sparks/airflow use GPU compute on WebGPU; disable those effects on WebGL2 rather than falling back to CPU particle simulation.
- Floating-origin rebasing must move simulation, rendering, cameras, interpolation snapshots, and temporal state consistently.
- Every owned resource/listener/worker/WASM allocation needs explicit cleanup.
- Rendering path per ADR 0004: `WebGPURenderer` (`three/webgpu`) with the automatic WebGL2 backend. One rendering layer, two backends — both must be validated for any rendering change, and the WebGL2 path is the low tier rather than a second-class port.
- Shading is TSL only. Never add `ShaderMaterial`, `RawShaderMaterial`, or `onBeforeCompile` usage; port existing GLSL-era code instead. Post-processing goes through the TSL `RenderPipeline` (`EffectComposer`/pmndrs are not used).
- Everything expensive is tier-gated and measured. Render configuration lives in `src/config/tiers.ts` and `src/core/QualityTier.ts` (there is no `src/config/quality.ts`). Every visual system declares its C/B/A state in `docs/VISUAL_TARGET.md` §3 and its measured cost; the dev sandbox (SwiftShader) may only assert correctness, never frame rate.
- Urban night optics must stay localized to authored light sources: the prior global-bloom A/B test washed out the scene. Preserve readable road visibility, mobile tier limits, and honest disclosure that the city prototype is not an SSR/ray-traced reflection system.
- Visual work follows the look-dev workflow: reference board → implementation → studio scene → 2 km route bookmarks → tier tuning → recorded performance → docs. Never present a stylized or placeholder result as the intended quality.
- Assets enter the repository only through the pipeline (optimize → LODs → quantize/meshopt → KTX2 → budget check) with a licence record and manifest entry; no ripped game assets and no unlicensed brand marks.
- Asset acquisition is scripted and pinned (`scripts/fetch-assets.mjs` from Phase 3): no hand downloads, no unpinned versions, manifest and `CREDITS.md` written in the same commit as the asset.
- Phase 1 rules: renderer configuration, sizing, pixel-ratio capping, and the loop live only in `src/core/Engine.ts`; scene composition lives in `src/core/SceneManager.ts`; tuning values live in `src/config/render.ts`, not inline in systems.
- Phase 2 rules: **Rapier (via `src/physics/PhysicsWorld.ts`) is the only solver**; never stack a second solver or Rapier's built-in vehicle controller on the same body. Simulation state is read through `Car.getInterpolatedPose(alpha)` for rendering and `Car.telemetry` for HUD/diagnostics. All vehicle, world, physics, input, and camera tuning lives in `src/config/*`, never inline. Input smoothing and steering rate limiting belong to `src/input/InputManager.ts`; the car consumes shaped actions only. Every frame delta is clamped and the fixed-step accumulator may never run unbounded catch-up (currently five steps max).
- Clamp every frame delta before it reaches simulation state, and never bind future physics to the display refresh rate.
- The HUD updates on an interval, never per frame; per-frame paths must not allocate DOM or retain listeners.
- Any new listener, observer, timer, worker, or WebGL object needs a disposal path in the owning class `dispose()`.

## Coding and validation

- Implement a coherent, small increment within the authorized phase, not the entire game in one response/file.
- Prefer typed interfaces, data-driven tuning, narrow ES imports, and explicit lifecycle ownership.
- Do not add speculative dependencies, a second framework, or another physics engine without a documented reason.
- Install with `npm ci`; preserve the lockfile and exact direct versions. Tool/dependency upgrades require validation and a recorded rationale.
- Run `npm run check` (format check, lint, types, tests, production build) before committing. Add relevant tests as features appear.
- Keep `tests/` honest: unit tests are Node-environment logic tests and cannot prove rendering, shadows, touch input, or frame rate. Record browser/device verification separately with the tool and conditions used.
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

**One-time authorization (owner request, 2026-10-14).** The owner asked not to be re-prompted for GitHub authorization on every push. Therefore push credentials are kept in a **durable location outside the repository** in the workspace (not under the snapshot-excluded `.cache/`), together with the device-flow helper, and `~/.gitconfig` is set with the repository identity and `core.askpass` so plain `git push` works without environment variables. Rules that still apply, unchanged: **never commit, print, or paste the credential**; the durable store is credential material and must stay outside the repository and out of any published material; the owner can revoke the authorization at any time (GitHub → Settings → Applications) and then a single device-flow approval re-establishes it. If the credential is missing or revoked, run the device flow in the workspace helper directory rather than improvising another auth path.

## Final status report for a phase

Report: work completed, tests/results, manual checks still needed, commit and verified push status, known limitations, and the next gated phase. If anything is blocked, say so plainly. Do not autonomously deploy or proceed to the next phase.
