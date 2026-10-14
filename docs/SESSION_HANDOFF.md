# Session Handoff — Endless Driver

**Updated:** 2026-10-14  
**Current stage:** Phases 1–2 implemented, verified, and pushed; the visual-fidelity re-plan and the free-and-open asset strategy are written; region, brand, audio, and sourcing decisions are resolved  
**Authorized development phase:** Phases 1–3 (Phase 3 authorized 2026-10-14)  
**Next development instruction:** Owner authorizes Phase 3 (renderer, lighting, post, asset/material pipeline). The five re-plan questions are answered and recorded in ADR 0005; see section 9. No development is authorized until then.

> **Re-plan (2026-10-14, decisions resolved):** the owner rejected the Phase 2 presentation and set a
> Forza-Horizon-class visual target. Research and specification are complete and committed alongside
> this handoff: `docs/RESEARCH_AAA_FIDELITY.md` (Forza pipeline evidence, Three.js r186 capability
> audit, 20-row gap analysis, legal asset sourcing, six explicit non-promises),
> `docs/VISUAL_TARGET.md` (five pillars, per-system quality bars, C/B/A tier contracts, look-dev
> workflow, rural-Japan region brief), ADR 0004, and rearranged `PROJECT_PLAN.md` §6 and §9–§11.
> The headline change: **Phase 3 is now the renderer, lighting, post-processing, and asset/material
> pipeline; terrain and roads moved to Phase 4.**
>
> **Owner decisions that followed (2026-10-14, ADR 0005):** free-and-open assets only with **no
> purchases**; region = the fictional rural-Japan **“Hinode Prefecture”**; fictional unbadged brand
> (**“Kaminari”** hero car, CC0 concept car as stand-in); audio from free sample libraries plus a
> project-owned engine synth (Sonniss GDC / Freesound CC0 / Kenney CC0, CC0/CC-BY music); photo mode
> in scope for Phase 8. The verified sourcing register — including exactly where free content reaches
> its ceiling — is `docs/ASSET_SOURCES.md`.

## 1. User instructions so far

| Instruction                                                                                          | State                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Plan the whole project in structured Markdown                                                        | Done — `PROJECT_PLAN.md`, `docs/PROJECT_BRIEF.md`                                                                          |
| Create the initial project structure and keep progress in the dedicated GitHub repository            | Done — public [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver)                                  |
| Implement Phase 1 (core engine setup and scene foundation) using Vite, TypeScript, and **Three.js**  | Done — pushed, verified                                                                                                    |
| Implement Phase 2 (vehicle physics, keyboard smoothing, dynamic chase camera)                        | Done — see sections 3–5                                                                                                    |
| Reach “Forza Horizon level” visuals (realistic car, environment aesthetics, seasons, roads, terrain) | Re-plan complete 2026-10-14; implementation gated — see section 9                                                          |
| Use only free/open premium assets, no payments; region = rural Japan                                 | Resolved 2026-10-14 — `docs/ASSET_SOURCES.md` (API-verified sources), ADR 0005, region brief in `docs/VISUAL_TARGET.md` §5 |
| Do **not** start Phase 3 without explicit instruction                                                | Honored — no terrain, roads, streaming, or weather code exists                                                             |

Phase 2 was authorized with these constraints, all honored: Rapier **or** Cannon-es allowed (Rapier
chosen — sole physics authority, never two solvers); the slip-friction/drift behaviour is an explicit
requirement, not polish; keyboard only for now (touch stays in Phase 5); a placeholder/low-poly car
mesh is acceptable; wheels must visibly steer and roll from physics state.

## 2. Canonical repository and verified persistence

- **Repository:** [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) — **public**, default branch `main`.
- **Clone:** `https://github.com/mdraficode/Endless-Driver.git`
- Every session's checkpoint is pushed to `main` and its SHA verified against the GitHub API; CI
  (`.github/workflows/ci.yml`) runs `npm ci` + `npm run check` on Node 22.
- Obtain the current checkpoint from the repository (`git log -1 --oneline`) rather than trusting a
  hash written here.
- **Verified checkpoint (2026-10-14):** the Phase 2 feature commit `b85c8ba` (42 files) was pushed to
  `main`; `git ls-remote origin refs/heads/main` returned the same SHA, and the `Validate project`
  GitHub Actions run for that commit (`npm ci` + `npm run check` on Node 22) completed successfully.
- **Verified checkpoint (2026-10-14, re-plan):** the AAA-fidelity re-plan commit `2375b74`
  (21 files, +1129/−277) was pushed to `main`; `git ls-remote origin refs/heads/main` returned the
  same SHA and the `Validate project` GitHub Actions run for that commit (run #5,
  `38485484364`) completed successfully.
- **Verified checkpoint (2026-10-14, Phase 3 renderer migration):** the WebGPU/TSL renderer migration
  (`f3ec413` → `3e16a09` → `66a2d1d` → `0e7388e`) was pushed to `main`;
  `git ls-remote origin refs/heads/main` returned `0e7388e37d1b6c5f88bbe417dc1950ddc9aa4999`, and
  `Validate project` run #9 (`38495977359`) completed successfully. Local gate before pushing:
  `npm run check` green — 139 tests across 15 files, asset verification (4 assets, 8 337 746 bytes),
  production build 985.58 kB (gzip 274.11 kB) + Rapier 4 335.10 kB.
- **Verified checkpoint (2026-10-14, sourcing decisions):** the free-and-open asset strategy,
  region/brand/audio decisions, the settled credited-asset rule, and the one-time authorization
  change were pushed as `fc3f049` → `5d54df8` → `46bb0b3`; `git ls-remote origin refs/heads/main`
  returned `46bb0b3`, and `Validate project` run #7 (`38493119974`) completed successfully. The push
  was performed by the durable-credential flow with **no re-authorization prompt** — see the
  authorization note below.
- Authentication for pushing uses the owner's official GitHub CLI device flow (the Arena GitHub
  connector is unsupported). Device codes expire after ~15 minutes.
- **Changed 2026-10-14 (owner request): authorization is now one-time.** The access token is kept in
  a durable workspace location outside the repository (not under the snapshot-excluded `.cache/`),
  so sandbox restores no longer force a new approval. `~/.gitconfig` carries the repository identity
  and `core.askpass`, so a plain `git push origin main` works with no environment variables; a
  `push.sh` helper beside the token pushes and prints the local/remote SHA comparison.
  The credential is never committed, printed, or included in evidence, and the owner can revoke it
  from GitHub at any time — after which a single device-flow approval restores it.

## 3. What Phase 2 delivered

| Area          | Implementation                                                                                                                                                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physics world | `src/physics/PhysicsWorld.ts` — Rapier initialization behind `src/physics/RapierModule.ts`, fixed 1/60 s accumulator with a **bounded five-step catch-up** and a 0.25 s delta clamp, static arena colliders built from `WORLD_CONFIG`, interpolation alpha, step statistics (`stepsLastFrame`, stalled frames) |
| Vehicle       | `src/vehicles/Car.ts` — four independent suspension rays (~2878 N per wheel at rest), spring/damper forces, anti-roll per axle, contact-gated tire forces, chassis drag/downforce, out-of-bounds recovery, reset, interpolated pose, telemetry                                                                 |
| Tire model    | `src/vehicles/TireModel.ts` — slip-angle lateral curve with peak grip ≈10.3° (values in section 5), saturating longitudinal curve, handbrake scaling of rear lateral grip, load sensitivity, low-speed slip-angle floor                                                                                        |
| Drivetrain    | `src/vehicles/Drivetrain.ts` — 6-speed + reverse, interpolated torque curve (230→420 N·m), RPM from wheel speed, upshift at 6300 / downshift at 2800, signed drive force, shift cut, brake-from-standstill reverse engagement                                                                                  |
| Input         | `src/input/InputManager.ts` — keyboard → smoothed actions; asymmetric attack/release ramps and response curves for throttle/brake, rate-limited steering (3.2 units/s, 5 units/s return) with light smoothing, digital handbrake, one-shot `reset`/`toggleCamera` commands, DOM-free `InputTarget` for tests   |
| Chase camera  | `src/cameras/ChaseCamera.ts` — damped position (0.18 s), look-at (0.1 s), and heading (0.28 s) channels, speed-driven FOV 62°→78°, lateral-acceleration roll inside the camera quaternion, ground clearance clamp, `snapTo` for reset                                                                          |
| Visuals       | `src/vehicles/CarVisual.ts` — low-poly placeholder car (hull intentionally narrower than the collider so wheels stay visible), front wheels steer from car state, all four wheels roll from wheel velocity, headlights, hub markers, full disposal                                                             |
| Composition   | `src/core/Application.ts` — startup order (Rapier → world → car → scene → camera), per-frame order (input → physics → interpolated pose → visual sync → chase camera → render), `R`/`C` command handling, `physicsElapsedSeconds`/`carHeadingDegrees` diagnostics, disposal of every subsystem                 |
| Configuration | `src/config/physics.ts`, `vehicle.ts`, `input.ts`, `camera.ts`, `world.ts`; `src/config/render.ts` trimmed to renderer concerns                                                                                                                                                                                |
| Diagnostics   | `src/ui/DiagnosticsOverlay.ts` — Phase 1 statistics plus speed, gear, RPM, wheel contacts, drift state and slip angle, distance, physics steps/bodies, and camera mode                                                                                                                                         |

## 4. Verification evidence

**Local gate:** `npm run check` passes — Prettier, ESLint, both TypeScript configs, **129 tests in 14
files**, and the Vite production build (`index` 600.23 kB, `rapier` 4 335.10 kB — see limitations).
Node 20.20.2 / npm 10.8.2 in this session; CI uses Node 22.

Test layers:

| Layer            | Files | What it covers                                                                                                                                                                                                                                            |
| ---------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scaffold         | 1     | Project wiring, entrypoint, asset manifest                                                                                                                                                                                                                |
| Unit             | 11    | Config invariants (`render`, `world`, `vehicle`), tire curve shape and peak, drivetrain shifts/reverse/RPM, input smoothing and command queue, chase-camera damping and FOV, vector math, HUD wiring, module API surfaces                                 |
| Physics (Rapier) | 1     | Straight-line acceleration, gearing, top-speed band, braking, planted cornering, handbrake drift and opposite-lock recovery, reverse engage/return, obstacle collision, spawn-lane clearance, determinism, reset, interpolation, catch-up bound, disposal |
| Integration      | 1     | Keyboard → actions → car → telemetry loop over a full driving cycle in an open world                                                                                                                                                                      |

**Browser verification (out-of-repo harness, not committed):** Playwright + Chromium headless shell
156 with ANGLE/SwiftShader, driven through the real keyboard event path against the dev server at
`?debug`, reading the same diagnostics snapshot the HUD shows. **35/35 checks passed**, including:

| Scenario                            | Result                                                                                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boot and spawn                      | Chase camera active, 4 wheel contacts, 5 physics bodies, car stationary and level                                                                                                                                             |
| Straight-line drive (`W`)           | 62.1 km/h down the spawn lane, heading 0.0°, z −22.3 m, wheels spinning, distance accumulating, camera trailing behind and above, FOV widening                                                                                |
| Gearing                             | Upshift to gear 2 at 5 397 RPM, continues past 100 km/h                                                                                                                                                                       |
| Cornering (`W`+`D`)                 | x +4.5 m, heading −33.9°, front wheels steered (−16.4°/−21.0°), rear wheels 0°, 4 contacts held                                                                                                                               |
| Drift (handbrake mid-corner)        | `drifting` true with slip −61.2°                                                                                                                                                                                              |
| Braking and reverse                 | Brakes to 7.1 km/h, then reverse engages (gear −1, backing up)                                                                                                                                                                |
| Reset (`R`) and camera toggle (`C`) | Car returns to spawn with distance and spin cleared; camera cycles chase → orbit → chase                                                                                                                                      |
| Wheel visuals at a standstill       | Front wheels steer (−27.6°/−35.5°) while the car stays put; parked frames are **pixel-identical**, and the steering change is 97 pixels confined to the wheel band on the ground plane (0.03 % of the frame, zero sky pixels) |
| Rolling wheels                      | Wheel spin accumulates while driving                                                                                                                                                                                          |
| Step budget                         | 1–5 physics steps per frame, never exceeded                                                                                                                                                                                   |
| Mobile viewport (390×844)           | Car drives to 43.7 km/h, DPR capped at 1 on that device, 4 wheel contacts                                                                                                                                                     |
| Console                             | No warnings, errors, or page errors                                                                                                                                                                                           |

**Explicit performance caveat:** the browser runs used a **CPU software rasterizer** at ~15 FPS
(800×450), so the simulation advances at ~0.82× wall time there. These runs prove correctness and the
step-budget contract; they are **not** a hardware 60 FPS measurement and must not be quoted as one. A
real 60 FPS claim needs a named device, resolution, preset, and warm-up.

### Bugs found by verification and fixed

1. **Mid-arena obstacle in the spawn lane.** A 4×5×3 m block at (2, 2.5, −20) sat ~17 m ahead of the
   spawn heading and stopped straight-line runs. Moved to (14, 2.5, −24); `WORLD_CONFIG`'s header
   comment now records that obstacles stay clear of the spawn lane, and a physics test asserts the
   car can cover 45 m of clear road.
2. **Steering sign.** Positive steering initially yawed the car the wrong way; fixed with a single
   sign flip at the point where the action becomes a tire steer angle.
3. **Tire curve too flat to drift.** The initial lateral curvature put peak grip past 50° of slip, so
   the car could not break traction. Re-shaped to peak at ≈10.3° (see section 5).
4. **Input ramp stalling the response curve.** Applying the response exponent inside the ramp meant
   full throttle only reached ~0.095 of the target; the ramp is linear now and shaping happens on
   read, covered by a unit test.
5. **Camera roll corrupting `camera.up`.** Roll is applied inside the camera quaternion instead, so
   the horizon tilts without breaking the up vector.
6. **Obstacle collision test required an approach lane.** The Phase 2 collision test now approaches a
   known block from a clear lane, so it tests collision response rather than spawn-lane clearance.

## 5. Measured handling envelope (headless Rapier, open world)

| Quantity                           | Value                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Acceleration (full throttle)       | 22.8 / 47.0 / 71.1 / 89.2 / 107.8 km/h at 1–5 s                                                        |
| Top speed band                     | 150–260 km/h (asserted range)                                                                          |
| Straight-line stability            | yaw 0.000, lateral drift < 0.2 m over the run                                                          |
| Planted cornering (47 km/h, 1.2 s) | slip angle −0.0145 rad — grip holds, no breakaway                                                      |
| Handbrake mid-corner               | slip −1.13 rad with yaw developing                                                                     |
| Opposite-lock recovery             | slip recovers 0.61 → 0.19 rad                                                                          |
| Suspension at rest                 | 4 contacts, ~2 878 N per wheel, ride height ≈0.63 m                                                    |
| Tire lateral curve (peak 1.0000)   | 0.252 @1°, 0.651 @3°, 0.869 @5°, 0.985 @8°, 0.974 @15°, 0.933 @20°, 0.868 @30°, 0.808 @45°, 0.774 @60° |
| Braking                            | 3 400 N front / 2 200 N rear, handbrake 2 600 N on the rear axle                                       |

These numbers are recorded for reference, not asserted in CI, so retuning the car cannot silently
break the build. The tuning knobs live in `src/config/vehicle.ts` and `src/config/input.ts`.

## 6. Deliberate deviations and limitations

- **Custom wheel-force layer instead of Rapier's `DynamicRayCastVehicleController`** — the phase
  requires slip-dependent lateral grip and a handbrake that scales rear traction only; both are
  project code so they are tunable and testable. Rapier still integrates the chassis and resolves
  collisions; the two force paths are never combined. Recorded in ADR 0003.
- **Module naming:** the phase text named `src/core/Input.ts` and `src/core/Camera.ts`; they are
  implemented as `src/input/InputManager.ts` and `src/cameras/ChaseCamera.ts` to keep the planned
  module boundaries. No duplicate implementations exist.
- **Steering rate limiting lives in the input layer**, not in `Car` — `steering.maxRate`,
  `steering.smoothingSeconds`, and `brakes.responseSeconds` were removed from the vehicle config.
- **Placeholder car art.** `CarVisual` is box geometry, not a GLTF model; the plan allows a
  placeholder in this phase, and the asset inventory in `public/assets` is still empty.
- **Temporary arena.** Ground and obstacle geometry come from `WORLD_CONFIG`; the Phase 1 reference
  grid is retained purely as a motion cue for driving, not as a designed environment.
- **No touch controls yet** — mandatory multi-touch is Phase 8 scope under the rearranged plan, and no touch code exists.
- **Bundle size:** the Rapier chunk is ~4.3 MB (1.67 MB gzip); code splitting and load-time work are
  folded into the Phase 3 asset/engine work in the rearranged plan.
- **No gameplay HUD** beyond diagnostics: speed, gear, and RPM are shown for verification, not as a
  designed dashboard.

## 7. Next authorized step

Nothing is authorized. The owner first reviews the re-plan (section 9) and answers the five open
questions; Phase 3 is then authorized separately.

When Phase 3 — **renderer, lighting, post-processing, and the asset/material pipeline** (ADR 0004) —
is authorized:

1. Read this handoff, `AGENTS.md`, the plan's Phase 3 section, ADR 0004, and `docs/VISUAL_TARGET.md`.
2. Record the authorization in `AGENTS.md` and this file.
3. Do the renderer migration as one self-contained change (WebGPU renderer + WebGL2 backend, TSL
   node materials, GLSL-era code ported or deleted, guard against new `ShaderMaterial`/
   `onBeforeCompile` usage) before any look development.
4. Build the asset pipeline and look-dev scenes, add tests, run `npm run check`, perform browser
   verification on both backends, and record real evidence (no unverified performance claims).
5. Commit, push to `main`, verify the remote SHA and CI result, and stop before Phase 4.

## 8. Session continuity reminders

- Install with `npm ci`; the lockfile is committed and direct versions are pinned (TypeScript 5.9.3,
  Vitest 4.1.11 — do not bump casually).
- `npm run check` is the required gate before every commit; it includes formatting and lint, so run
  `npx prettier --write .` after editing files by hand.
- Do not commit `node_modules`, `dist`, credentials, or unlicensed assets.
- Authentication may need renewing in a fresh session; never request a token in chat and never commit
  credential material.
- If a push is blocked, record it plainly and export a bundle instead of claiming remote success.

## 9. Visual-fidelity re-plan (2026-10-14) — complete; decisions resolved in section 10

**Why:** after reviewing the Phase 2 screenshots the owner rejected the boxy, cartoonish look and
required realistic car models and environmental aesthetics "as close as possible" to Forza Horizon,
authorizing a research step-back and a full re-plan. No visual implementation has been written.

**Deliverables written in this step (committed and pushed as `2375b74`, CI green):**

| Artifact                                                        | Content                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/RESEARCH_AAA_FIDELITY.md`                                 | What Forza actually does (surfel GI, reactive procedural sky, POM terrain + virtual texturing, seasonal "Winteriser" material variants, wetness/temperature-driven traction) with sources; a capability audit of the installed `three@0.186.1` (TSL display nodes, CSM, Sky/Water, KTX2/Draco, `MeshPhysicalMaterial` clearcoat); a 20-row gap table with phase mapping; CC0/paid asset legality; five explicit non-promises |
| `docs/VISUAL_TARGET.md`                                         | The normative look contract: five pillars, per-system quality bars with measurable checks, the C/B/A tier matrix, the look-dev workflow (studio scene + 2 km route with 12 fixed bookmarks + SSIM diffing + performance gates), the rural-Japan region brief, and §7 resolved decisions                                                                                                                                      |
| `PROJECT_PLAN.md` (revised)                                     | §6 rewritten as the rendering/seasons architecture; §8 tiers extended; §9 rearranged to Phases 3–8 with an old→new mapping; §10 execution status; §11 asset policy, new risks, and deferred decisions; §13 traceability remapped                                                                                                                                                                                             |
| `docs/decisions/0004-visual-fidelity-and-rendering-pipeline.md` | ADR (accepted): stay on Three.js but move to `WebGPURenderer` + TSL with the WebGL2 backend as the supported fallback; one TSL `RenderPipeline` post stack; foundations before content; tiers as explicit contracts; asset sourcing as engineering; the feasibility boundary and the five open questions                                                                                                                     |

**Feasibility boundary recorded (must not be overstated to the owner):** the browser target is
quality-tiered PBR + HDRI IBL + GTAO/SSR/TRAA + procedural biomes + CC0 scans with a WebGL2
fallback. Forza's photogrammetry crews, 12K source textures, baked surfel GI, and console hardware
are out of reach; `docs/VISUAL_TARGET.md` §6 lists what "done" does not mean, and no frame-rate or
parity claim is made without measurements on named hardware.

**Open questions for the owner (blocking only at the phase noted):** car asset route and brand
policy (Phase 6), region (Phase 4), audio scope (Phase 7), photo mode (Phase 8).

**Next action:** owner sign-off on the re-plan and those answers; only then is Phase 3 authorized.

## 10. Free-and-open asset strategy and the Japan region (2026-10-14)

**Owner instruction:** use the best-quality _free and open_ resources — no purchases, no licence fees, no
restricted licences — and do not compromise the game to get them. Region: the natural beauty of rural Japan, as
Forza Horizon does for its settings.

**What was done:**

| Artifact                                                            | Content                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ASSET_SOURCES.md` (new)                                       | The verified register. Poly Haven (997 HDRIs / 869 textures / 521 models) and ambientCG APIs were **queried live on 2026-10-14**, so the counts, the Japan-tagged assets, and the download mechanics are checked facts, not recollection. Covers HDRIs, terrain/road materials, vegetation and rocks, Japanese props, the car question, audio, fonts, the open-source toolchain, acquisition rules, and the honest ceiling of free sourcing. |
| `docs/VISUAL_TARGET.md` §5 (rewritten)                              | Region brief: the fictional **“Hinode Prefecture”** — ten districts (coast/harbour, sakura river avenue, rice terraces, bamboo shrine lane, maple gorge with tunnels, cedar touge pass, highland plateau, snow-country onsen village, small town) with per-district road character and seasonal payoff, a seasonal events layer, the roadside-prop kit that actually makes a road read as Japanese, and the palette rules.                   |
| `docs/VISUAL_TARGET.md` §7 (rewritten)                              | The five former open questions, now resolved, including the final sourcing detail: the CC-BY-with-credit exception is kept (and can be closed later at no cost).                                                                                                                                                                                                                                                                             |
| `docs/decisions/0005-free-and-open-asset-strategy.md` (new)         | ADR: CC0-first licence policy with the CC-BY exception and the permanently excluded categories; the region; the fictional brand policy; the two-track car plan (CC0 stand-in, in-house “Kaminari” hero); the audio plan; photo mode in scope.                                                                                                                                                                                                |
| `CREDITS.md` (new)                                                  | Attribution register, written by the same pipeline that writes the manifest so licence entries and credit lines cannot drift.                                                                                                                                                                                                                                                                                                                |
| `PROJECT_PLAN.md`, `README.md`, `AGENTS.md`, `docs/ASSET_POLICY.md` | Updated to the resolved decisions: no-purchase rule, region districts in the Phase 4 deliverables, asset-policy rewrite, and standing constraints in the agent instructions.                                                                                                                                                                                                                                                                 |

**Two things the plan now says out loud, because they are the honest limits of free sourcing:**

1. **There is no free, licence-clean, production-grade hero car.** The CC0 Sketchfab “Unity Fan” concept-car series
   (200k–760k tris, unbranded, public-domain dedication) is the only credible free option and becomes the stand-in;
   the hero is authored in-house under a fictional marque. No marketplace, no brand marks, no ripped assets.
2. **Music is the weakest free category** — good CC0/CC-BY pools exist, but they are not an AAA licensed
   soundtrack. The plan commits to a curated, season-matched CC0/CC-BY playlist and states the limitation.

**Nothing about this changes the visual bar** (`docs/VISUAL_TARGET.md` §2) — free sourcing constrains provenance,
not quality. If free content cannot reach a bar, we author it in-house or document the gap; we never request a
purchase.

**Next action:** owner authorizes Phase 3 (renderer migration, lighting, post stack, asset/material pipeline);
only then does implementation start.

## 11. Phase 3 in progress (2026-10-14)

**Owner instruction:** "Start Phase 3" — renderer migration, lighting, post-processing, and the
asset/material pipeline (terrain moved to Phase 4).

**Landed in this first increment (commits `f3ec413`–`0e7388e`, CI run #9 green):**

| Area                 | What shipped                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer             | `WebGPURenderer` from `three/webgpu` with the automatic WebGL2 backend fallback and a `backendPreference` switch; async `init()` awaited by the composition root; WebGPU device-loss handling |
| Post-processing      | TSL `RenderPipeline` output chain: scene pass → bloom → tone mapping → colour space, with the pass re-pointed when the render camera changes                                                  |
| Sky and atmosphere   | Preetham `SkyMesh` (sun disc, clouds, scattering) replacing the gradient dome; sky follows the render camera; fog tint derived from sun elevation                                             |
| Environment lighting | CC0 HDRIs fetched by `scripts/fetch-assets.mjs`, resolved through `public/assets/manifest.json`, loaded as half-float reflection IBL with a graceful fallback                                 |
| Shadows              | `CSMShadowNode` cascades (count/maxFar/fade in config) following the render camera, rebuilt on camera/FOV/resize changes                                                                      |
| Ground               | TSL node-material grid (analytically anti-aliased, distance-faded) replacing the `onBeforeCompile` GLSL patch                                                                                 |
| Asset pipeline       | Pinned fetch + offline verification (`npm run assets:fetch` / `assets:verify`), licence allowlist, hash checks, `CREDITS.md` regeneration, wired into `npm run check`                         |
| Guards and tests     | `npm run guard:glsl` (comment-aware) forbids `ShaderMaterial`/`RawShaderMaterial`/`onBeforeCompile`; HUD reports backend, post state, cascades, environment asset; 139 tests green (10 new)   |

**Also landed (2026-10-14):** the quality tier system. `src/config/tiers.ts` holds the C/B/A contracts as data
and `src/core/QualityTier.ts` resolves one from device probes (or `?tier=`), overlays it on the baseline render
config, and reports it — with its reason — in the HUD. Tier A is deliberately opt-in: it has never been measured
on named hardware, so auto-selecting it would assert a frame budget the project cannot back up. The
`?backend=webgl|auto` switch satisfies the forced-backend deliverable. Two deviations from the tier table are
recorded in `docs/VISUAL_TARGET.md` §3: tier C keeps the backend on `auto` rather than pinning WebGL2, and the
tiered AA modes are still pending (today the tiers differ by MSAA sample count).

**Post stack landed (2026-10-14):** `src/shaders/post-chain.ts` assembles the whole chain in one documented
order — ambient occlusion (GTAO via the scene pass, per-tier resolution), bloom (linear), SMAA (pre-sRGB), tone
mapping + colour space (once, inside the chain when a display-referred effect follows), then chromatic aberration,
RCAS sharpening, film grain, custom TSL vignette, and FXAA last (post-sRGB). `resolvePostEffects()` is pure, so the
order and the tier gating are unit-tested without a GPU, and the HUD prints the exact chain a frame went through.
MSAA and a post-process AA mode can no longer be paid for simultaneously: `applyTier()` switches MSAA off whenever
the tier selects FXAA/SMAA/none, and a test holds that invariant across all three tiers.

**Remaining Phase 3 work, in planned order:** (1) the remaining post effects — depth of field, motion
blur, LUT grading — plus TAAU/TRAA and dynamic resolution; (3) time-of-day clock with
light colour/intensity curves, LUT grading and exposure-by-sun; (4) `gltf-transform` optimize/KTX2
pipeline for models and the first materials library entries; (5) the studio look-dev scene
(`?scene=studio`) and the 2 km validation route with fixed camera bookmarks, then the 12 baseline
screenshots per tier.

**Environment limitation, recorded honestly:** this sandbox has no browser or GPU, so the migration
is verified by types, unit tests, source guards, and a production build — **not** by rendering a
frame. The visual result, the WebGL2 fallback path, and every frame-rate number are unverified until
a browser session exists. Do not describe the renderer as "done" without that.

## 12. First browser verification via GitHub Pages (2026-10-14)

The sandbox dev preview turned out to be unusable as a hand-off link: it is token-gated
(`403 Missing traffic access token` on a bare URL) and the sandbox sleeps between sessions, so the
owner could not open it. The project now deploys to **https://mdraficode.github.io/Endless-Driver/**
on every push to `main` (`.github/workflows/deploy-pages.yml`, Pages enabled with GitHub Actions as
the build source, deploys serialised per ref).

**That deployment immediately paid for itself: it is the first place this project has ever run with
a real rendering backend, and it found a start-up crash that no sandbox check could reach.**

`SceneManager.setShadowCamera()` assigned `CSMShadowNode.camera` and called `updateFrustums()` from
`Application.start()`, before any frame had rendered. Two distinct bugs, both fatal to the cascades:

1. `updateFrustums()` derives the splits from `mainFrustum`, which is `null` until `_init()` runs —
   so the call threw `Cannot read properties of null (reading 'setFromProjectionMatrix')` and the
   whole scene failed to start ("Unable to start the 3D scene: …" in the page status line).
2. `_init()` is only called from `setup()` **while `camera` is still null**. Pre-assigning a camera
   therefore suppresses initialisation permanently: had the first bug been patched alone, the scene
   would have rendered with no cascades at all, silently.

**Fix:** `setShadowCamera()` is a no-op until `mainFrustum !== null`, at which point the node has
initialised itself from the camera of its first render and switching cameras plus rebuilding splits
is meaningful. `SceneManager.resize()` no longer rebuilds cascades at all; the application already
invalidates its shadow-camera cache on resize and re-syncs on the next frame, so exactly one place
touches the splits. `tests/unit/cascaded-shadows.test.ts` pins the library contract that the guard
depends on.

**Lesson for the remaining phases:** the guard tests, type checks, and builds cannot catch this class
of bug — it only appears when a backend exists. Verified rendering on the deployed site now counts as
real evidence, and it is cheap: push, wait for the deploy, then read the page.

**Verification result (same day, after the fix deployed).** The page now boots and renders. The live
DOM reports `Renderer: webgl2 · post · 3x shadow`, `Sky: procedural · hdri-ninomaru-teien-1k`,
72 draw calls, 1,671 triangles across 40 scene objects, and a rendered frame. Read plainly: the app
initialises, the WebGPU fallback engages cleanly where WebGPU is unavailable, the HDRI resolves
through the manifest on a static host, and the `RenderPipeline` output chain renders. The snapshot
came from a headless renderer, so it proves start-up and the fallback path — **not** frame rate,
sustained behaviour, or final image quality, and not the WebGPU path itself (that environment fell
back to WebGL2). Those still need a GPU-backed browser.

## 13. Browser verification is now possible in the sandbox (2026-10-14)

Earlier handoffs stated that rendering could not be verified in this environment. That is no longer true, and
the change matters for what future phases may claim.

**What was set up:** Playwright plus headless Chromium, installed **outside the repository** (`/tmp/verify`,
browsers in `/tmp/pw-browsers`) so no project dependency or lockfile entry was added. System libraries come from
`apt-get` (`libnspr4`, `libnss3`, and the usual Chromium runtime set). Both are sandbox-local and vanish on a
sandbox rotation; re-provisioning is `npm i playwright && npx playwright install chromium` in `/tmp/verify` plus
the `apt-get` line, roughly 20 seconds.

**What it can establish:** that the app boots, that the shader graph compiles, that the frame is not black, which
tier and backend were used, the reported draw-call/triangle counts, and every console warning or TSL error — with
a screenshot as evidence. **What it still cannot establish:** frame rate (SwiftShader software rendering measured
13 FPS on a scene that will be GPU-bound elsewhere), image quality as a human would judge it, or the WebGPU path
(no adapter in the sandbox; the renderer correctly falls back to WebGL2).

**It paid for itself immediately.** The first run reported a TSL error and a completely black frame:

```
error: THREE.TSL: TypeError: Cannot read properties of null (reading 'build') at generateInput()
Post: bloom → chromaticAberration → sharpen → vignette → fxaa
```

Bisected with a temporary probe page that built each effect in isolation: **`chromaticAberration` with an
undefined `center` argument** fails. The node's own default is `null`, and its documentation says an absent
centre means "screen centre (0.5, 0.5)", but three logs the failure and returns nothing rather than falling back
or throwing — so the pipeline kept rendering a black image while everything looked healthy. Passing an explicit
`vec2(0.5, 0.5)` fixes it, and `post-chain.ts` now documents why the argument is not optional in practice.

Screenshot: `/home/user/phase3-evidence/renders-after-fix.png` (HDRI backdrop resolving, grid ground, the
placeholder car, obstacles, post chain active on the WebGL2 backend).

## 14. Time of day (2026-10-14)

The environment now has a clock, and it drives the lighting rather than sitting beside it.

**What was added.** `src/environment/solar.ts` (sun position from hour, latitude, day of year — pure, testable, no
renderer), `src/environment/EnvironmentClock.ts` (wraps and advances time, then resolves a `DaylightState`),
`src/config/daylight.ts` (the look-development curves), and `tests/unit/environment-clock.test.ts`. Everything the
frame needs — sun direction, colour, intensity, ambient fill, environment intensity, exposure, fog tint, turbidity,
rayleigh, sun-disc visibility — is one pure function of the sun's elevation, so the look at 06:20 is assertable in
Node without a browser.

**Shape of the curves.** Each value is a three-phase blend: a night value, a horizon value, and a day value,
crossfaded by `dayFactor` (0 at night, 1 above 12° elevation) and `horizonFactor` (1 at the horizon, falling away in
both directions). Splitting at the horizon rather than at night is what keeps dawn and dusk a real phase instead of
a dimmed noon. The scene never reads the clock: `Application` resolves one `DaylightState` per frame and hands it
to `SceneManager.applyDaylight()` and `Engine.setExposure()`, so there is one place where time becomes light.
`Engine.setExposure()` is cheap — `toneMappingExposure` is a live `rendererReference` in the TSL graph, so it
takes effect on the next frame with no pipeline rebuild.

**Default is 09:30 and frozen** (`autoAdvance: false`), because a reproducible run is worth more than a moving sun;
`secondsPerHour: 120` is the rate when it is switched on. `?time=18.5` overrides the start hour for debugging, which
is how the three screenshots below were taken.

**A bug the tests caught.** `ambientColorHex` came back as a fractional number — not a colour at all. The
three-phase blend helper interpolated the packed 24-bit integer as a single number, so red's fraction carried into
green and blue, darkening the result and shifting the hue. Packed colours must go through the per-channel
interpolator; `phasedColor()` now does that, and the test that asserts every colour is an integer in range is what
found it. Two test thresholds were also recalibrated rather than the code: the twilight fade was measured by sample
count instead of by duration (it lasts ~70 minutes at this latitude and date), and the smoothness check sampled at
five-minute steps against caps that a genuine smoothstep ramp cannot meet — it now samples a minute at a time with
caps proportional to each quantity's range.

**Verified in-browser** (headless Chromium, WebGL2 fallback, tier C), local dev server, `/home/user/phase3-evidence/`:

| URL          | HUD `Time` row            | Mean scene luminance |
| ------------ | ------------------------- | -------------------- |
| `?time=6.5`  | `06:30 · sun 6°`          | 137 / 255            |
| `?time=12.5` | `12:30 · sun 53°`         | 154 / 255            |
| `?time=18.5` | `18:30 · sun -6° · night` | 50 / 255             |

No page errors, no TSL errors, non-black frame in all three, post chain and tier unchanged. Luminance is measured
over the right-hand two thirds of the frame, so the HUD is excluded.

**Known limitation, and it shows in the 06:30 shot:** tier C's backdrop is a fixed daylight HDRI capture. It dims
with the clock but cannot redden the way the procedural sky does, so dawn reads as a hazy morning rather than a
sunrise, and the exposure lift that keeps night readable flattens the dawn/noon contrast (dawn is 89% of noon's
luminance). A time-of-day grade — or a tinted background node — is the fix, and it belongs with the Phase 3
grading work rather than with the clock.

## 15. Time-of-day grade (2026-10-14)

The clock landed first and immediately showed its own worst limitation in a screenshot: at 06:30 the frame was
89% as bright as noon and no warmer, because tier C's backdrop is a **captured** daylight HDRI. A capture can be
dimmed; unlike the procedural sky it cannot redden as the sun drops, so dawn read as a dimmed noon under a bright
sky.

The fix is a grade stage in the post chain — a per-frame linear-RGB multiplier, applied in the HDR stage before
bloom. It is the mechanism a LUT will later plug into, and it sits before the tone curve on purpose: it warms the
captured sky, the fog, and the shadowed sides of the world together, and it cannot clip highlights, because the
tone curve runs afterwards. `Engine.setGrade()` writes one `Vector3` that the TSL uniform reads at draw time, so
this costs a vector write per frame and never rebuilds the pipeline — the same trick as `toneMappingExposure`.

**The first version of the tint was wrong, and measuring caught it.** It reused the lighting's `dayFactor`/
`horizonFactor` blend, which sounded tidy — one curve family for everything — but a golden hour is a band of sun
_heights_, not a fraction of full daylight. Hung off `dayFactor`, the warmth was gone within half an hour of
sunrise: at 06:30 the resolved tint was (1.001, 0.980, 0.966), effectively neutral. The tint now keys on elevation
directly, with three weights that always sum to one: night below −8°, golden from −2° to +8°, neutral above 30°.
That gives a real golden hour — full warmth from sunrise until roughly 08:40, and again from about 16:50 — and the
tint is nearly luminance-preserving (0.95 of neutral) so the phase changes cannot be mistaken for exposure drift.
Both facts are now asserted in `tests/unit/environment-clock.test.ts`, including that morning and evening grade
identically at the same sun height.

**Strength depends on the sky.** `SceneManager.skyMode` reports whether the backdrop is captured or procedural; a
capture takes the full tint, the procedural sky — which already colours itself from the same clock values — takes
0.35 of it. There is no second source of truth and no new switch to keep in sync.

**Verified in-browser** (headless Chromium, WebGL2, tier C, local dev server; mean over the right two thirds of the
frame, HUD excluded; `/home/user/phase3-evidence/`):

| Time         | HUD row                   | Mean luminance       | Warmth (R/B)  |
| ------------ | ------------------------- | -------------------- | ------------- |
| `?time=6.5`  | `06:30 · sun 6°`          | 137 → 128 (grade on) | 0.938 → 1.032 |
| `?time=12.5` | `12:30 · sun 53°`         | 154 → 146            | 0.976 → 0.978 |
| `?time=18.5` | `18:30 · sun -6° · night` | 50 → 46              | 0.742 → 0.637 |

Dawn warms by ~10% on screen and night cools by ~14%, while noon is untouched — the grade does nothing when the
sun is up, which is the point. The numbers are smaller than the tint values because the measurement is taken after
tone mapping and sRGB encoding: a ×1.36 linear red/blue ratio reaches a display-referred image as roughly ×1.14.
The post chain, tier, and backend are otherwise unchanged (`grade → bloom → chromaticAberration → sharpen →
vignette → fxaa`), with no page errors and no TSL errors.

## 16. The material studio (2026-10-14)

Phase 3's last unbuilt deliverable was the look-dev scene, and it is now in: `?scene=studio` renders a grid of
fourteen spheres — three automotive paints, chrome, brushed aluminium, tire rubber, glass, water, and the six
ground materials of the Hinode Prefecture world — each one a real `MeshPhysicalNodeMaterial` standing on a neutral
floor against a flat backdrop.

**It is a second composition root, not a mode.** `StudioApplication` mounts the same `Engine`, the same
`SceneManager`, the same `DaylightController`, and the same post chain as the driving scene, and supplies only what
makes it a studio: the grid as content, an orbital camera, an environment switcher, and a panel. A studio with its
own bespoke rig would approve materials that do not survive contact with the game, which is the only failure that
matters here.

**A new seam made that possible.** `SceneManager` used to build the ground plane and obstacle blocks itself. It now
takes a `SceneContent` (`src/world/WorldContent.ts`) and the driving world moved behind it (`src/world/DrivingWorld.ts`)
— Phase 4's terrain implements the same interface. The lighting stayed in `SceneManager`: the studio wanted identical
sun, sky, fog, shadows, and HDRI, so it was the _content_ that had to become pluggable, not the environment.

**Four real bugs, all caught by looking at the output rather than by the type checker:**

1. **Nothing rendered.** The studio's frame handler updated the clock, the sky and the shadows, and never called
   `engine.render()`. The panel reported 0 draw calls while the canvas stayed black — the engine owns the loop but
   not the scene, so rendering is the caller's job and the driving root had been doing it all along.
2. **The grid was framed for a square viewport.** The pose was computed in the constructor, before `Engine.init()`
   had measured the canvas, so `viewport.aspect` was a placeholder. The grid ended up two thirds too far away.
   Framing now happens after initialisation, and again on every resize.
3. **The camera was not using the studio's lens.** `SceneManager` builds its camera from the _render_ config's 60°
   field of view, which is authored for a driving view; the studio's framing maths assumed its own configured 32°.
   The studio now sets the camera's `fov` and the pose functions _read the value back off the camera_, so the lens
   and the framing cannot disagree.
4. **The spheres floated.** Grid centre at 1.1 m with 0.5 m radii put every sphere 0.6 m above the floor, which
   throws the contact shadow far from the contact point — the one thing the floor exists to show.

**And one design change after seeing it.** The camera used to sit 0.55 m above the grid on a 5×3 layout. At that
angle each row hid behind the one in front of it, so a third of the materials were invisible. The grid is now 7×2
and the camera looks down from a 20° elevation with a long lens, which is what makes all fourteen spheres
readable at once.

**The framing and the material values are asserted in Node.** `tests/unit/studio-config.test.ts` checks that the
grid fits the frame in both width _and_ depth, that the spheres stand on the floor, that the camera backs off and
slides across to clear the control panel (measured from the DOM, not guessed, because the panel is styled in `rem`),
that the close-up fills a third of the frame, and that the materials are physically plausible — metals fully
metallic, dielectrics not, roughness spanning mirror to matte, glass's refractive index above water's. These are the
failures a screenshot review misses.

**Verified in-browser** (headless Chromium, WebGL2, tier C): 48 draw calls, 113,109 triangles, no page errors, no
TSL errors, across three times of day and two HDRIs, plus a `?focus=chrome` close-up. Evidence in
`/home/user/phase3-evidence/` (`studio-panel8.png`, `studio-focus-chrome3.png`, `studio-sunset.png`,
`studio-dawn.png`, `studio-grid*.png`). The driving scene was re-verified after the content refactor: time, tier,
post chain, draw calls, and triangles unchanged, no page errors.

**Switches:** `?scene=studio`, `?hdri=<manifest id>`, `?rot=<degrees>`, `?time=<hours>`, `?focus=<material id>`,
`?panel=0`. Keyboard: `P` hides the panel, `H` cycles the HDRI, `E` toggles image-based lighting, `,`/`.` rotate it,
`←`/`→` move the hour, `R` reframes.

**What the studio already earns its keep on.** Comparing `?hdri=hdri-ninomaru-teien-1k&time=12.5` with
`?hdri=hdri-cedar-bridge-sunset-1k&time=6.5` shows the same materials under two completely different lights while
the materials themselves stay recognisable — which is the property that has to hold before anything is authored
against them. It also makes the clock's remaining gaps obvious: the backdrop is still a captured photograph, so at
18:30 the world darkens while the sky's own colour does not change, and the exposure lift that keeps night readable
flattens dawn and dusk under a captured sky.
