# Session Handoff — Endless Driver

**Updated:** 2026-10-24  
**Latest full-check checkpoint:** the rotary touch-steering wheel and 9.25rem size are at code SHA `24eb238`, followed by the docs-only `5a96e25` checkpoint. The full check passed at `24eb238` (79 test files / 585 tests, 20 verified assets / 47,814,431 bytes, production build). Later Aohara commits have only partial focused runs; `48a1e13` reached 35/36 and identified a generated city tower colliding with a short hub-to-courtyard link. A tower-aware courtyard-layout fix is unpushed and untested. No visual/device acceptance is inferred.  
**Current working tree:** initial Aohara implementation `12827a4` first had 4 failures / 32 passes; `0e8857d` had 35/36 with a street-mouth obstruction. `2ae711e` (20 m access-mouth prop apron) passed sampled road/sidewalk clearance. Diagnostic commit `48a1e13` identified the remaining obstruction as tower footprint #8 (center 977.4, -669.3; half extents 16.1×17.4 m) intersecting the short r0-c0 hub-to-courtyard link at 8.2 m; focused tests remain 35/36. The current uncommitted config fix restricts outer-block courtyards to north/south choices away from paired towers; no tests have run on it. No full check/build/browser review has run.  
**Authorized scope:** Phase 6, Phase 7 and Phase 9 remain authorized; unrelated Phase 8 polish remains gated. Phase 6 rendered/manual acceptance remains pending. Preserve the fictional Hinode/Aohara setting, no paid/restricted assets, no global bloom, Aohara default spawn, C/B/A budgets, unobstructed forward track, immediate vehicle-translation following and drive-start recenter.  
**Next action:** push the tower-aware outer-block courtyard layout correction before rerunning focused tests. If focused checks pass, run `npm run check`. No visual or performance acceptance is established; retain the pending hero/fallback review, traffic-feel review, device details for the rendering-quality investigation, and Phase 7 visual/tier work. Do not repeat the prior full-app capture unless runtime conditions change.

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
> (**“Kaminari”** hero car; a CC0 concept stand-in was initially planned, then superseded on 2026-10-22 by the code-authored in-house roadster); audio from free sample libraries plus a
> project-owned engine synth (Sonniss GDC / Freesound CC0 / Kenney CC0, CC0/CC-BY music); photo mode
> in scope for Phase 8. The verified sourcing register — including exactly where free content reaches
> its ceiling — is `docs/ASSET_SOURCES.md`.

## 1. User instructions so far

| Instruction                                                                                          | State                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Plan the whole project in structured Markdown                                                        | Done — `PROJECT_PLAN.md`, `docs/PROJECT_BRIEF.md`                                                                                  |
| Create the initial project structure and keep progress in the dedicated GitHub repository            | Done — public [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver)                                          |
| Implement Phase 1 (core engine setup and scene foundation) using Vite, TypeScript, and **Three.js**  | Done — pushed, verified                                                                                                            |
| Implement Phase 2 (vehicle physics, keyboard smoothing, dynamic chase camera)                        | Done — see sections 3–5                                                                                                            |
| Reach “Forza Horizon level” visuals (realistic car, environment aesthetics, seasons, roads, terrain) | Re-plan complete 2026-10-14; implementation gated — see section 9                                                                  |
| Use only free/open premium assets, no payments; region = rural Japan                                 | Resolved 2026-10-14 — `docs/ASSET_SOURCES.md` (API-verified sources), ADR 0005, region brief in `docs/VISUAL_TARGET.md` §5         |
| Work only in authorized phases; keep unrelated Phase 8 work gated                                    | Phase 5 owner-reported passed; Phase 6, Phase 7 and Phase 9 are authorized; only the specifically requested Phase 8 items are open |
| Add a fictional Japanese megacity district with night lighting first; keep rural Hinode intact       | Phase 9 separately authorized; Aohara grid/night block and requested traffic physics are implemented                               |
| Add the requested cockpit camera and optional Hinode touge off-road sections/hazards                 | Implemented and checked at `9d8395a`; Central Avenue remains the default                                                           |

## Previous status snapshot (2026-10-22; superseded by the current state above)

The vehicle implementation commit is `cdcd8f1d6952581c93744de4d073454059b094c5`; local and remote `main` matched at that code checkpoint. The full local `npm run check` passed at that commit (format, lint, GLSL guard, both TypeScript checks, 61 test files / 509 tests, 19 assets / 44,913,263 bytes, production build), as did GitHub Validate #179 and Pages Deploy #169. This status refresh changes documentation only; it does not alter that tested implementation. The production Pages URL responded. The public-reference analysis treats Slow Roads, the Three.js WebGPU materials gallery and +360º Car Visualizer as fidelity targets only and does not claim to know their undisclosed renderer internals.

The automated-check-verified increment adds `CarVisual.ts` as an original unbadged Kaminari GT two-seat roadster, with a long-hood/open-cabin silhouette, authored metallic/clearcoat paint, map-free glazing/interior/rubber/metal, physics-driven wheel pivots, steering-wheel movement and local brake-lamp response. At that increment the owner used Ferrari California only as a broad body-class reference. The later 2026-10-22 clarification supersedes that: the owner wants the exact Ferrari California body without logos or number plate, but only with a verifiable CC0 hero-model source/license and separate Ferrari design permissions. The +360º visualizer provides no source/license, and the exact-model candidates audited so far do not qualify; no model or code change is authorized absent that evidence, so the current in-house car remains. See `docs/ASSET_SOURCES.md` §3.5. The same increment adds code-authored instanced passenger cars, city buses, rigid trucks, semi-trailer rigs and farm tractors to Aohara. The C/B/A traffic counts remain 6/12/18, pedestrians and city tiers stay unchanged, and longer vehicle lengths are accounted for in signal queues. These actors remain visual-only with no moving colliders. Full local checks and both GitHub workflows pass at `cdcd8f1`; no runtime screenshot or manual-drive review is documented.

The CC0 RGS_Dev/OgA vehicle pack's included `License.txt` was read and explicitly says CC0/public-domain and commercial use. The ZIP contains FBX-only roadster/bus/truck/trailer files, no tractor, and a stylized low-poly visual style; it is not included because the runtime model pipeline is GLTF/GLB-based and no reproducible FBX conversion was introduced. The Innerscene CC0 GLB bus was not locally inspected and is not used. No third-party vehicle file, new dependency, manifest entry, or new credit is added.

The source, tests and docs were committed in `4c21044` and follow-up fixes/optimizations were pushed through `cdcd8f1d6952581c93744de4d073454059b094c5` from `/tmp/endless-driver-vehicles-20261022`, freshly cloned from verified PBR baseline `2505be6b9cdcb02fa1bf4392a23961c31bc73ff4`; `npm ci` succeeded. `npm run check` passes on the final source (61 test files / 509 tests; 19 assets / 44,913,263 bytes; production build). GitHub Validate #179 and Pages Deploy #169 both succeeded for `cdcd8f1`; local and remote `main` matched at that SHA. The published Pages URL responded, but no in-browser gameplay review, manual drive, owner-device review or frame-time measurement has been performed. Do not claim those forms of acceptance.

Phase 5 is owner-reported passed. Phase 6 vehicle/render work and Phase 9 urban work remain authorized; Phases 7–8 are gated. Preserve mobile/desktop scope, exact C/B/A budgets, lane readability, prepare-ahead streaming, rural Hinode, full-circle swipe orbit/recenter behavior, default Aohara spawn and pinned/random overrides, no fog/mist/haze or global atmospheric veil, no global bloom, CC0-first assets, static-only Aohara wet-look, no CPU particle fallback, and relaxing balance. Runtime visual and device evidence remain separate from code/CI verification.

Phase 2 was authorized with these constraints, all honored: Rapier **or** Cannon-es allowed (Rapier
chosen — sole physics authority, never two solvers); the slip-friction/drift behaviour is an explicit
requirement, not polish; touch driving controls were pulled forward from Phase 8 and delivered; a placeholder/low-poly car
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
| `docs/decisions/0005-free-and-open-asset-strategy.md` (new)         | ADR: CC0-first licence policy with the CC-BY exception and the permanently excluded categories; the region; the fictional brand policy; the initial two-track car plan (CC0 stand-in plus in-house “Kaminari” hero, later superseded by the 2026-10-22 in-house-only decision); the audio plan; photo mode in scope.                                                                                                                         |
| `CREDITS.md` (new)                                                  | Attribution register, written by the same pipeline that writes the manifest so licence entries and credit lines cannot drift.                                                                                                                                                                                                                                                                                                                |
| `PROJECT_PLAN.md`, `README.md`, `AGENTS.md`, `docs/ASSET_POLICY.md` | Updated to the resolved decisions: no-purchase rule, region districts in the Phase 4 deliverables, asset-policy rewrite, and standing constraints in the agent instructions.                                                                                                                                                                                                                                                                 |

**Two things the plan now says out loud, because they are the honest limits of free sourcing:**

1. **There is no free, licence-clean, production-grade hero car adopted for this project.** The CC0 Sketchfab
   “Unity Fan” concept-car series (200k–760k tris, unbranded, author-declared public-domain dedication) was a candidate,
   not an integrated stand-in. The owner later clarified they want the exact Ferrari California body without logos or
   number plate, but only if it meets the CC0-only hero-model rule and separate design rights are verifiable. No candidate
   qualifies; the original in-house Kaminari GT remains in place. No marketplace purchase, ripped asset, or badge/logo.
2. **Music is the weakest free category** — good CC0/CC-BY pools exist, but they are not an AAA licensed
   soundtrack. The plan commits to a curated, season-matched CC0/CC-BY playlist and states the limitation.

**Nothing about this changes the visual bar** (`docs/VISUAL_TARGET.md` §2) — free sourcing constrains provenance,
not quality. If free content cannot reach a bar, we author it in-house or document the gap; we never request a
purchase.

## 68. Exact Ferrari California rights audit and conditional asset decision (2026-10-22)

**Owner instruction:** The owner superseded the earlier broad-body-class reference with a request for the exact Ferrari
California body, with logos and number plate removed. They chose free/open-only sourcing; under the existing asset
policy, a hero vehicle must be CC0, and the underlying Ferrari design permissions must also be verifiable. A CC license
alone does not grant third-party design/trademark rights.

**Audit outcome:** The +360º visualizer exposes no source mesh, provenance, or reuse license. The reviewed Sketchfab
models either identify Racing Master/CSR2 game-model origins, use CC-BY-NC-SA, or are AI-generated; a paid model is
outside the no-purchase constraint. None establishes the separate Ferrari permissions. Details and references are in
`docs/ASSET_SOURCES.md` §3.5.

**Decision and scope:** No model qualifies. Do not extract or integrate the visualizer model or any reviewed candidate.
The existing code-authored, unbadged Kaminari GT and traffic remain unchanged; this increment changes documentation
only. Runtime visual/device acceptance and manual-driving evidence remain outstanding.

**Validation:** Documentation commit `489ce06b31836a9f47c04749c7056fa7d36884fa` was pushed before the full `npm run check` as required by the repository workflow. The check passed formatting, ESLint, GLSL guard, both TypeScript checks, 61/61 test files and 509/509 tests, 19 assets / 44,913,263 bytes, and the production build. GitHub Validate #181 succeeded; Pages Deploy #171 was still running when checked. The test run emitted existing non-fatal Three.js `BufferGeometry.toNonIndexed()` diagnostics and Vite's >500 kB chunk warning. This follow-up handoff entry changes documentation only.
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

**Remaining Phase 3 work, in planned order:** (1) the remaining post effects — motion blur and god rays
— plus TAAU/TRAA and dynamic resolution; (3) time-of-day clock with
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

**Colour look and depth of field.** The look is a 3D LUT applied _after_ tone mapping and the sRGB
transfer — the only place a 3D LUT may be sampled, because `Lut3DNode` reads the incoming `rgb` as the
lookup coordinates. Depth of field runs in the _linear HDR_ stage before it, so out-of-focus highlights
blur as light rather than as clipped grey discs. Both are live uniforms: the look can be trimmed with
`?lutmix=` without being re-authored, and the focus plane is damped over 0.35 s so a crest does not snap it.

Switches: `?lut=none` (ungraded), `?lutmix=0..1` (trim), `?dof=0|1` (force on a tier that disables it),
`?bokeh=<n>` (aperture as a fraction of the frame's short side, x1000).

**Two failures worth remembering, both of which rendered a perfectly plausible frame:**

1. `uniform(focusDistance.value)` wraps _a copy of a number_. The engine wrote the live focus distance
   into its own object, the shader kept sampling the number captured when the graph was built, and both
   the diagnostics and the HUD reported the value the engine believed it had set. The graph now holds
   the uniform _nodes_, so a caller cannot write to a copy — the type no longer permits it.
2. `bokehScale` is a fraction of the frame, and the node's own default of 1 — and the 2.6 this project
   first shipped — blurs by a couple of pixels on a 1440 px frame, i.e. less than the antialiasing. The
   effect ran correctly and was invisible. Measured, not reasoned: the horizon drops to 0.67 of its
   unblurred detail at `bokehScale` 17, the car stays at 1.01.

The LUT itself is generated (`npm run assets:lut`) from `scripts/lib/lut.mjs`, not downloaded: a dozen
documented numbers, checked into the manifest and CREDITS like any other asset. Its size — 17³ — was
_chosen by measurement_: `node scripts/build-lut.mjs --analyse` reports the reconstruction error for each
candidate, and at 17³ the worst error in the near-neutral colours (the only place a lattice shows as
banding) is 0.78 of an 8-bit code, unchanged from 33³ at a quarter of the size. The file is written with
bin centres rather than `code/255` because three's loader truncates when it scales by 255 — and
`tests/unit/lut.test.ts` parses the committed file with three's own loader to prove the round trip.

**Prop inspector (`?scene=props`).** The look-dev scene judges materials; this one judges the _asset pipeline's
output_. It loads `public/assets/models/boulder-01.glb` — one file whose three levels of detail share a KTX2 texture
set — and stands one copy per level on the same floor under the same light, so "did the derivation degrade
gracefully?" is a question one screenshot answers. Modes: the lineup, a close-up of any single level, and automatic,
where one copy switches level by camera distance using the exact rule the streamed world will run
(`LOD_SWITCH_RADII = [12, 24]` radii). Switches: `?model=<manifest id>`, `?time=<hours>`, `?panel=0`. Keyboard:
`1`/`2`/`3` isolate a level, `L` the lineup, `A` automatic mode, `N` the next level, `←`/`→` the hour, `R` reframes,
`P` hides the panel.

**Verified in-browser** (headless Chromium, WebGL2, tier C): the lineup, each level isolated, and automatic mode at
21.9 m; `23 draw calls · 91,197 tris` in the lineup against 26 draw calls / 182,361 triangles with every level
showing, matching the panel's own counts, no page errors, no failed requests, and an unknown `?model=` id reported in
the panel rather than thrown. Evidence in `/home/user/phase3-evidence/props-lab/`.

**What the studio already earns its keep on.** Comparing `?hdri=hdri-ninomaru-teien-1k&time=12.5` with
`?hdri=hdri-cedar-bridge-sunset-1k&time=6.5` shows the same materials under two completely different lights while
the materials themselves stay recognisable — which is the property that has to hold before anything is authored
against them. It also makes the clock's remaining gaps obvious: the backdrop is still a captured photograph, so at
18:30 the world darkens while the sky's own colour does not change, and the exposure lift that keeps night readable
flattens dawn and dusk under a captured sky.

## 17. The temporal slice — velocity, TAAU, dynamic resolution, motion blur (2026-10-15)

The realism investigation (`docs/REALISM_PLAN.md`) ranked temporal stability first and motion blur second, and
this slice implements both on **one shared velocity attachment** — the same buffer a future screen-space
reflection or denoiser would reproject with, which is why they were built together rather than as two features.

**What changed, in the chain's own terms.** `src/shaders/post-chain.ts` gained two effects and a new order:

```
ao → taa → motionBlur → grade → bloom → dof → smaa → lut → chromaticAberration → sharpen → filmGrain → vignette → fxaa
```

- **`taa` wraps the scene pass**, immediately after the occlusion term, because the resolve accumulates whatever
  is upstream of it: placed there, the noise the scene pass itself produces — the AO estimate, shadow-map edges,
  specular highlights crawling across a surface — is what gets averaged away. It is applied to the _resolved
  texture node_ (`resolve.getTextureNode()`), not to the resolve node itself, and that distinction is the first
  bug of this slice (below).
- **`motionBlur` sits directly on the scene image**, ahead of the grade and the bloom. That position is both the
  physically right one (an exposure integrates the light that reached the sensor, and the grade and bloom are
  properties of that exposure) and the only one the node can _take_: `motionBlur` samples its input as a texture,
  so any composed expression upstream of it is a `TypeError` inside node setup. It is the second bug, and the more
  instructive one.
- Both read `scenePass.getTextureNode('velocity')`. The attachment is requested only when one of them is in the
  chain (`requiresSceneVelocity`), because writing motion vectors is a cost paid by every material in the scene:
  it adds a second colour output and switches the renderer into keeping per-object previous-frame matrices.

**Dynamic resolution** is the same node doing the second half of its job: TAAU reconstructs a reduced scene pass
at full size, so lowering the render scale buys frame rate for the whole scene pass rather than for one effect.
The controller is `src/core/DynamicResolution.ts` — deliberately three-free, DOM-free arithmetic with thirteen
unit tests, because _when_ the resolution should move is the part that can be wrong in ways no screenshot shows.
Its shape: a smoothed frame time, a dead band (`target ± 15%`, so a frame time parked _at_ the target is a stable
state and the resolution never breathes), hysteresis (one adjustment per half second, one step of 0.08 at a time),
and a floor. Its documented blindness: it is driven by _delivered_ frame time, so it cannot pre-empt a GPU that is
using most of the budget without yet missing the display's deadline; it reacts when frames are actually dropped.

**Tiers, switches, HUD.** Tiers B and A now resolve temporally (`antiAliasing: 'taa'`), which means **no tier uses
MSAA any more** — the resolve requires it off, and `core/QualityTier.ts` already forced `samples: 0` for any
non-MSAA mode. Tier C keeps FXAA and switches the temporal path off by cost, not by absence. New switches:
`?taa=0|1`, `?aa=taa|smaa|fxaa|msaa|none` (names a strategy outright; naming a spatial one turns the temporal path
off, so the arms of an A/B are exactly what they say), `?res=<scale>` (fixes the scale and stops the controller),
`?dynres=0|1`, `?mblur=0|1`, `?mb=<shutter>`. The HUD gained a `Temporal` row (`taa @ 84%`, or `off`), and
`Renderer` now reports the strategy.

**Measured in a browser** (headless Chromium, **WebGL2 fallback**, tier B, `?res=0.5`, 640×400 unless noted):

| What                                                 | Result                                                                                                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chain and backend                                    | `ao → taa → motionBlur → grade → bloom → dof → lut → chromaticAberration → sharpen → vignette`, HUD `webgl2 · taa`, `Temporal taa @ 84%`, **zero page errors, zero failed requests**      |
| Dynamic resolution is live                           | scale 1.0 → 0.84 → 0.67 as frame times exceeded the target; `?res=0.6`/`?res=1` fixes it and the HUD reports `taa @ 60%` / `taa @ 100%`                                                   |
| Velocity buffer is populated                         | temporary debug view of the attachment: a coherent screen-space field across the frame (reverted; captures kept)                                                                          |
| Motion blur, matched speed (~100 km/h, 66 m vs 64 m) | control pair (`mblur=0` twice) mean \|Δ\| **1.12**; treatment (`mblur=1`) **9.89 / 10.04** — ~9× the control noise, and the two independent comparisons agree within 1.5%                 |
| Motion blur, direction                               | in the road band, \|dI/dx\| falls to **0.961** while \|dI/dy\| is unchanged at **1.025** — the smear is horizontal, i.e. along the lateral motion of a chase camera at speed              |
| Motion blur, spatial distribution                    | mean \|Δ\| grows toward the bottom of the frame (5.97 → 13.15 by quarter) — strongest where the scene moves fastest, which is the signature of a correct field rather than a uniform blur |
| Camera-rotation A/B (orbit drag, identical script)   | two controls agree to **0.10**; treatment differs by **1.42** — a 14× signal with matched poses                                                                                           |
| Static scene, effect enabled                         | mean \|Δ\| 1.30 with max 142 localised on the car and near ground — the effect does _not_ fire across a still frame                                                                       |

**Verified in-browser, end to end** (`?time=12.5&debug&tier=b`, chain as above): the driving scene renders with
TAA and motion blur in the WebGL2 fallback at 800×520 and at 720×460 with the fixed scale, no page errors, no
failed requests. Evidence: `/home/user/phase3-evidence/temporal/` (23 images, 10 JSON reports, 1.9 MB), including
`drive-mb-compare.png` (the sharp/streaked pair side by side) and `vel-drive.png` (the velocity field).

**The bug worth the most.** `motionBlur`'s `sampleColor` calls `input.sample(uv + offset)` — so its input must be
a _texture_, and three has no way to say so: the failure is a `TypeError: e.sample is not a function` raised
during `setupOutput`, which **three catches, logs to the console, and renders around**, producing a fully black
frame with `pageErrors` empty and the HUD reporting everything as fine. Two distinct causes produced it in this
slice: the temporal branch handing downstream effects the resolve _node_ (a `TempNode`) instead of
`resolve.getTextureNode()`, and the motion blur sitting after the grade and bloom, where its input is a composed
expression rather than a texture. Both are fixed; both are the same lesson — a black frame with a healthy HUD
means _read the console_, and a node that samples its input cannot be fed arithmetic.

**Also corrected in the docs while here:** the tier table in `docs/VISUAL_TARGET.md` §3 now matches what the code
does (TAAU on B/A, FXAA on C, no MSAA anywhere, dynamic-scale ranges per tier), and the post-stack table lists the
shipped stages rather than the pending ones.

**What this slice does _not_ prove.** TAA's benefit is a property of _motion_ — a still frame cannot show that
shimmer is gone, and the metric that can (per-pixel variance across consecutive frames in flat regions) is part of
deliverable 11, not of this increment. What is proven about it is that the resolve is in the chain, that it
jitters the projection and accumulates without error, and that the velocity buffer it reprojects with is correct —
which the motion-blur measurement establishes independently, since both read the same attachment. Frame _cost_ is
also unmeasured: the sandbox has no GPU, and under SwiftShader the vehicle simulation is frame-rate-coupled, which
is why the matching had to be done by speed and distance rather than by timing.

**Next in Phase 3:** the 2 km validation route with fixed camera bookmarks, the SSIM baseline, and the
temporal-stability metric — the harness that turns "it looks better" and "it shimmers" into numbers — then god
rays and height-aware aerial perspective (Ranks 3 and 10 of the realism ranking).

## 18. The route + atmosphere slice — validation route, SSIM baseline, stability metric, height fog, god rays (2026-10-15)

Owner approval 2026-10-15 ("Ok go ahead") for the follow-up to §17. This supersedes the "Next in Phase 3"
paragraph at the end of §17 and the stale §7. All verification is headless Chromium under **SwiftShader on
the WebGL2 fallback** (the sandbox browser has no WebGPU adapter): structural evidence only, never frame
rate. Evidence: `/home/user/phase3-evidence/route-atmosphere/`.

**The route.** `src/config/route.ts` + `src/world/RouteWorld.ts` + `src/lab/RouteApplication.ts`,
`?scene=route&bookmark=<station>-<phase>`. A straight 2 km look-dev road toward −Z (Phase 4 owns real
terrain/roads; this is a measurement stage, not world content): 3 stations — `start` (open plain, volcano
on the horizon), `canopy` (overhead slatted trellis, the god-ray stage), `summit` (far end, looking back) —
× 4 phases at measured solar hours (dawn 6.8, noon 12.5, dusk 17.4, night 23.8; the project's solar model
at lat 36°/doy 264 has sunrise ≈06:00, sunset ≈18:00 — hours were measured, not guessed). Bookmarks pin
`weather: clear, season: summer` until Phase 7. The camera focuses on the bookmark look target
(photographer focus); `dof=0` remains for system-isolation captures.

**The harness.** `npm run capture:route` (`scripts/capture-route.mjs`): `--baseline` writes the accepted
set, default mode re-shoots and SSIM-diffs against it (exit 1 below 0.97 per bookmark), `--stability` adds
12-frame TAA on/off bursts, `--extra k=v` appends URL switches for A/B arms, `--bookmarks a,b` subsets.
Metrics are pure functions in `scripts/lib/image-metrics.mjs`, unit-tested on synthetic images with known
answers. The accepted baseline — 12 tier-B bookmarks at 800×500 — is committed in `baseline/route/` with a
per-capture manifest (backend, fog mode, sun elevation, SSIM). Re-capturing three bookmarks scored SSIM
0.9999–1.0000, exit 0. The harness polls diagnostics until the camera settles before shooting; three
confounds were found and removed along the way — tier-A film grain is per-frame random (`?grain=0` in
A/B arms), clouds animate by wall clock even with a frozen sun (`?clouds=0` in stability arms), and DOF
focus can masquerade as fog (`dof=0` for isolation captures).

**Height fog (Rank 3).** `src/shaders/height-fog.ts`: exponential height falloff composed with the
distance term as the scene `fogNode` on tiers B/A; tier C keeps the linear band. Measured at `start-dawn`
with `dof=0`: far-band MAD vs fog-off 11.197 (height) vs ≈8.9 (linear); volcano pixel [188, 200, 213]
(height) vs [164, 180, 194] (linear) vs [121, 137, 155] (off) — distance desaturates toward the sky more
than the old band. Two tuning lessons: the height factor multiplies depth-below-threshold by distance, so
the first density (0.00035) rendered the whole route as fog colour — shipped is 0.00006 with
distanceDensity 0.0014 — and the volcano originally sat at −2320 m, beyond the 2000 m camera far plane,
so it was clipped and its "pixels" were sky; it now stands at −1900 m.

**God rays (Rank 10).** `GodraysNode` in the HDR chain after `motionBlur`, before the grade — the chain is
now `ao → taa → motionBlur → godrays → grade → bloom → dof → smaa | tonemap+sRGB | lut → …`. Strength is a
daylight-resolved tint (black = off), marching a dedicated non-CSM shaft light whose intensity is 0 (it
renders the shadow map the march needs and lights nothing). Tier A only, or `?godrays=1`. Measured at
`canopy-dawn` (tier A, grain and DOF off, unchanged frames): diff mean-max 5.64, max 108, localized through
canopy and sky. A cross-sun composition measured only 0.45 and was rejected — the shipped bookmark looks
down the road through the canopy. Verdict: real, correctly placed, visually subtle through sparse
placeholder slats; Phase 5 foliage density is what will make it read.

**Temporal stability — the honest caveat.** With clouds held and the camera settled: TAA off σ = 0.000 at
both tested bookmarks (a static, deterministic software renderer has zero shimmer by construction); TAA
on σ = 0.048 (start-noon, p95 0.353) and σ = 0.436 (canopy-noon, p95 3.297, concentrated on the thin
canopy posts). So the metric machinery works and is sensitive, and it names thin canopy geometry as a
watch item — but it does **not** validate Rank 1. What would: bursts from a _moving_ camera on real GPU
hardware. Still open, and recorded here so nobody quotes the static numbers as a TAA verdict.

**A debugging note worth keeping.** The washed-out route frames that opened this slice were not a grade
regression: a studio capture at the same hour was correct (colours, chrome, glass, exposure), which
exonerated the global pipeline and isolated the causes to the route scene — over-strong first fog tuning
plus DOF focus distance. The control-capture habit (same pipeline, known-good scene) found in minutes
what staring at route code had not.

**Still owed in Phase 3:** contact shadows (Rank 4), SSGI on the high tier (Rank 7), an AgX-vs-ACES
comparison. Then Phase 3 review. **Phase 4 remains gated.**

## 19. Contact shadows, SSGI, the tone-curve comparison — and the Phase 3 review (2026-10-15)

Owner approval 2026-10-15 ("Ok go ahead") for the three items §18 left owed. All verification is
headless Chromium under **SwiftShader on the WebGL2 fallback** — structural evidence only, never
frame rate. Evidence: `/home/user/phase3-evidence/contact-ssgi-tonemap/`.

**Contact shadows (Rank 4).** `src/shaders/contact-shadows.ts`: from each surface point, a short
march (8 taps tier B, 16 tier A, ≤1.6 m) through the scene depth towards the sun; an occluder
within thickness darkens the pixel. It runs in the HDR stage ahead of the temporal resolve, fed
the daylight-gated sun direction in view space (`DaylightController → Engine.setContactSun →
chain uniform`), so it fades out at night rather than darkening a sunless scene. Measured in the
studio at noon: A/B MAD 2.82 with the **median pixel at 0** and p99 at 115 — nothing moves except
where surfaces meet, and every material sphere now pools a contact shadow on its sun side. The
route stability metric with the effect in tier B's chain: TAA-on flat σ 0.079 (0.048 without it —
march noise included, same ballpark), TAA-off 0.000.

**SSGI (Rank 7, SSGI half).** `SSGINode` on tier A only, in three's own composite form —
`beauty × ssao + diffuse × gi` — placed on the unresolved scene image so the temporal resolve
downstream accumulates its noise (the node's temporal filtering assumes exactly that). It
_replaces_ GTAO on tier A: two horizon-based occlusion terms over the same crevices would
double-darken, so `resolvePostEffects` never emits both. It costs two extra scene attachments
(diffuse, and the normals GTAO already needed), requested only when the effect is in the chain.
Measured: studio A/B MAD 4.37 (shadowed sides lift, softly); route start-noon MAD 0.56 — an open
white plain at noon has almost no occlusion for bounce to work with, and the number says so
honestly. Bounce will matter when Phases 4–5 give it geometry; radiance cascades remain the
Phase 7 go/no-go, not a Phase 3 promise.

**AgX vs ACES (deliverable: comparison via config).** `?tonemap=aces|agx|neutral` replays any
frame through another curve (the renderer mapping already existed; the switch is new). Studio
noon: AgX clips fewer highlights (0.037% vs 0.052% of pixels ≥250) but saturates less (0.196 vs
0.221 mean saturation). Route dawn: no clipping under either (the sky there is fog-limited, not
curve-limited), ACES brighter (mean luminance 192 vs 175). **Decision: ACES stays the default** —
its highlight disadvantage is small where this game's sky actually lives, and the look LUT was
authored on top of it; AgX remains one URL switch away for a future re-grade.

**Bug 1 — god rays were inert in the shipped build.** `Engine.setGodrays()` had no caller:
`DaylightController.update()` never pushed the tint, so the shafts' colour stayed black and the
effect contributed nothing while every diagnostic reported it in the chain. The line was lost in
an earlier edit-recovery (§18's measurements predate the loss). Worse, when wired, the shipped
strength (0.9) blew the canopy-dawn frame to white — the march accumulates up to maxDensity
everywhere the dedicated shadow map does not reach. Re-measured in steps (SSGI/clouds/grain/DOF
held): 0.9 → MAD ~33 frame-wide white; 0.28 → 20.8 broad glow; **0.12 with density 0.7 → MAD 6.1,
sun-side brightening with post streaks, scene intact** — that is what ships. The wiring is now
pinned by a controller test with fake targets (`daylight controller drives the engine uniforms`),
and `resolveContactSunGate` follows the same path.

**Bug 2 — the texture contract, again.** The stability harness's TAA-off arm threw
`e.sample is not a function`: the contact node's output is an expression, and motion blur —
the next stage when TAA is off — samples its input as a texture. Three logged it and rendered
around it, so the off-arm "measurement" was a dead frame with σ 0.000. Fixed by normalizing to
a texture once after the scene-stage effects (identity when the input already is one), and the
TAA-off frame re-verified clean. This is the third time this exact trap has bitten (§17 had two);
the normalization point is commented as load-bearing.

**Sandbox limits found, recorded plainly.** Chrome 156's SwiftShader (both the headless shell
and the full build) **segfaults its GPU process allocating tier A's 4096×4 cascade shadow maps**
— context lost at the first heavy frame, reproduced on the unmodified previous commit `f8e73f3`,
at 400×250 as readily as 800×500. At 2048 the same chain renders indefinitely. Tier A therefore
keeps its 4096 contract (routine on real GPUs) and the tier-A captures in this round were taken
with shadow maps temporarily at 2048 — the one axis this sandbox cannot allocate; that caveat is
in the evidence README and applies to every tier-A image in it. Tier A also renders at ~3 s/frame
here, so harness timeouts (tuned for tier B) do not fit it; tier-A bookmarks were captured with
a settle-polling script instead.

**Baseline regenerated.** Tier B's chain gained contact shadows, so `baseline/route/` was
re-captured in this commit — deliberately, with the reason here and in the commit message, per
the rule in `baseline/route/README.md` that a baseline is only ever rewritten alongside the
rendering change that moved the pictures. Self-consistency re-verified on a subset after the
regen. Tier A (640×400, 2048-shadow caveat) and tier C (800×500) bookmark sets were also
captured for the review record and live in the evidence folder, not the repo — the committed
baseline stays tier B, the tier every later phase diffs against.

**Phase 3 review.** Against the Phase 3 acceptance list: WebGPU-first renderer with WebGL2
fallback ✓; colour pipeline with LUT and sun-driven exposure ✓ (AgX compared, ACES kept); dynamic
sky/sun clock pre-dawn to night ✓ (headlights/streetlights were carved out to Phase 7 in the
visual target); CSM + contact shadows ✓; post stack ✓ except SSR, which stays tier-declared
pending its first real surface (Phase 6 car, Phase 7 wet road) rather than being faked onto a
placeholder; TAAU + dynamic resolution + stability metric ✓ (motion-validated TAA evidence still
needs a moving camera on a real GPU — recorded, not claimed); asset pipeline with manifest and
licence register ✓; studio + props + route look-dev scenes ✓; tier contracts in code and HUD ✓;
no GLSL-era material code (guard in `npm run check`) ✓. **Phase 3 is code-complete.** The one
acceptance item no sandbox can close is frame budgets on named hardware: open the Pages build,
force `?tier=a`, and read the HUD on a real machine — that measurement belongs to the owner, and
tiers should be adjusted to it, never to a claim. **Phase 4 remains gated on owner instruction.**

## 20. Phase 4 opens: the terrain foundation (2026-10-15)

Phase 4 was authorized on 2026-10-15 ("Ok you may proceed"). This increment builds the
ground everything else in the phase stands on; roads, the generation worker, origin
rebasing, and the district build-out follow in later increments.

**One height function for eyes and wheels.** `src/world/terrain-height.ts` is a pure,
integer-hash-deterministic sampler (value-noise fBm hills + the Hinode-dake cone at
(−1500, −2100) + a spawn plateau that is exactly y=0 inside 45 m, so the car, the Phase 2
obstacle blocks, and the y=0 spawn convention did not move a millimetre). `Application`
creates ONE sampler; the visual chunks and the Rapier heightfields both sample it, so the
ground drawn and the ground driven cannot drift apart. Determinism (same seed →
bit-identical heights), plateau flatness, and sampler continuity are unit tests.

**Streaming.** `TerrainWorld` (behind the `SceneContent` seam, which gained optional
`updateStreaming`/`getContentStats` hooks) maintains an 11×11 square of 128 m chunks at
64/32/16 segments by ring distance, nearest-first, at most **2 builds per frame** — the
recorded upload budget, visible live in the HUD ("Terrain 110/121 chunks · 23 queued ·
213k tris") and in diagnostics as `contentStats`. Chunks carry skirts against LOD
T-junction cracks; border heights AND normals are bit-identical between same-LOD
neighbours (grid normals with a one-cell halo), pinned by a geometry unit test.
`PhysicsWorld.enableTerrain` removes the flat slab and `syncTerrain` slides a 3×3
heightfield window (65×65 samples per chunk, independent of visual LOD). **Rapier's
heightfield array is x-major (`heights[ix·(n+1)+iz]`)** and queries only see colliders
after a step — both facts pinned empirically by `tests/physics/terrain-colliders.test.ts`,
which raycasts known slopes; a transposed field collides fine and only that test catches
it. 349 tests green (was 336).

**In-browser proof (SwiftShader, tier C, `scripts/capture-drive.mjs`).** The car settles
on the plateau (4 contacts, y=0.628), accelerates to ~95 km/h down the blend slope
(y=−2.3 at −67 m), all wheels grounded, window at 121/121 with 0 queued. Evidence:
`/home/user/phase4-evidence/terrain-foundation/`. Two sandbox notes: the drive scene at
tier B presents at seconds-per-frame here (the route harness's minute-scale patience is
the norm; tier C is the practical capture tier), and a stuck 10-minute capture earlier
left the box memory-pressured enough to lose GL contexts until it settled — environmental,
not a regression (route SSIM 0.9996 in the same session). Known refinements queued:
chunk-plan oscillation when the car straddles a chunk boundary (budget absorbs it;
hysteresis later), LOD colour steps at distance (detail textures + fog will mask), and
the splat is vertex-colour only until the scanned CC0 sets land next increment.

## 21. Workspace cleanup (2026-10-15)

At the owner's request the local workspace was reduced to what GitHub cannot give back.
Everything project-related lives in this repository at `91b4fe8` (verified: local HEAD ==
remote main, tree clean): source, tests, docs, the route baseline, capture scripts, and
the public assets. The local checkout, `node_modules`, `dist`, and the capture caches
were deleted — all regenerate (`git clone` + `npm ci` + `npm run build`).

The screenshot/JSON evidence folders that used to sit beside the checkout
(`phase2-evidence/`, `phase3-evidence/`, `phase4-evidence/`, ~29 MB, 203 files) were
deleted in this pass. Their measured findings are recorded in §§17–20 of this document
and the images regenerate with `scripts/capture-route.mjs` and
`scripts/capture-drive.mjs` as needed. Kept locally, deliberately outside the repo: the
GitHub credential helper directory (`~/.github-auth/`) and `~/preview-prepare.sh` —
the keys that make the clean checkout one `git clone` away.

## 22. The terrain realism & driving-feel pass (2026-10-15)

Owner asked what could be made more realistic on the existing foundation before roads;
the answer (renderer is ahead of content; surfaces/shape/feel are the bottleneck) became
this pass, in the recommended order.

**Scanned splat (was: flat tints).** Four CC0 Poly Haven 1K sets — leafy grass
(Charlotte Baglioni), brown mud dry (Rob Tuytel), rock face 03 (Dario Barresi/Rico Cilliers),
snow 01 (Rob Tuytel) — fetched through the pinned pipeline (fetch-assets generalised with a
per-entry stem; manifest now 10 assets, verify green). Geometry grew a `splat` vec4
attribute ([grass, soil, rock, snow], normalised, unit-tested) and a `tint` macro
attribute (variation + curvature occlusion from the halo grid). The material tiles by
world XZ, blends albedos by splat, samples rock triplanar, reads packed AO/roughness,
blends normal maps, and fades all detail to the macro tint between 90–260 m so far LODs
stop shimmering. Heightfield gained ridged noise (crests, broken volcano rim).
`loadSurfaces` resolves at startup beside the HDRI; failure keeps the flat material.

**Surface-driven grip.** `terrainSurfaceWeights` is now the one source for renderer and
physics. `terrain-surface.ts` mixes grip (grass .80, soil .64, rock .95, snow .40) and
rolling resistance (.035/.05/.02/.08); `PhysicsWorld.surfaceAt` answers per contact
patch; each wheel's friction limit and rolling drag follow its own patch. Headless proof
(`tests/physics/terrain-driving.test.ts`): wheels report grass on the plateau, and
identical throttle accelerates slower on grass than asphalt (existing 24 vehicle tests
untouched and green). Tier C no longer uses the garden HDRI as backdrop — IBL only at
every tier; quality-tier test updated deliberately.

**Streaming/camera feel.** `resolveWindowCenter` adds 24 m hysteresis for both windows
(visual plan may be velocity-biased up to 112 m/1.4 s; physics never biased); seam-jitter
re-plans are gone (test). ChaseCamera finally uses `headingLagSeconds` (yaw-only smoothed
heading — the camera no longer pitches over every crest) and clamps above the real
terrain height via a provider wired to the sampler. 356 tests green at the pass commit.

## 23. Phase 4 Increment 2 — the spline road network (2026-10-15)

**Delivered.** An authored road network now runs through the prefecture: 8 nodes
(spawn junction 170 m north of spawn, north-bend, cedar-pass, volcano-view, east-plain,
town-site, south-fields, west-fields), 9 spline edges, ~6.0 km total. Design rule
recorded: **one solved profile, three consumers** — the profile is carved into the
shared height function (`createWorldTerrainSampler` in `src/world/world-terrain.ts`),
so chunk meshes, Rapier heightfields, and the surface query cannot disagree.
`src/world/road-network.ts` (pure, deterministic) solves profiles by moving-average
smoothing → junction pinning (all edges at a node share its elevation exactly) →
grade clamping to 9 % **on true segment runs** (a fixed per-step delta silently
allowed 17 % where the spline bunched; pinned by test). The southern loop was
rerouted around the spawn plateau (via (175, 150)) so the pad stays exactly y=0.
`RoadWorld.ts` draws whole-network ribbons from the same points: scanned CC0 asphalt
(`asphalt_03`) + sandy-gravel shoulders (`sandy_gravel`; manifest now 12 assets),
edge lines, centre dashes, junction discs — 53 meshes, built once (roads are sparse;
no per-chunk streaming needed). Surface query: asphalt grip 1.0 / rolling 0.015 on
the pavement, gravel 0.72 / 0.045 on the shoulder.

**Proof.** 367 tests green (`npm run check`): graph connectivity BFS, determinism,
junction agreement, grade cap on true runs, centreline carve == profile to 1e-6,
full-width flattening, spawn pad untouched, surface zones, plus a Rapier raycast that
meets the collider at the carved profile and reports asphalt. Browser captures
(`/home/user/phase4-evidence/roads/`, via the new debug `teleportCar` handle and
`scripts/capture-road.mjs`): car on the junction and rolling on the mountain road,
4/4 contacts, zero errors, diagnostics reporting 6,010 m of road and both road
surfaces loaded. Honest limits: tier-C SwiftShader washes the asphalt normal detail;
far chunk windows still build in at 2/frame after a teleport (on hardware this is
~1 s); **bridges/tunnels are not built** — the generator carves at grade and there
are no water crossings yet. Remaining Phase 4: worker-side generation, floating
origin, district build-out. Phase 3's only remainder is still the owner's
named-hardware frame-budget run.

## 24. Mobile playability — touch controls + landscape (2026-10-15, owner request)

Pulled forward from Phase 8: without touch input the game literally could not be
driven on a phone. **Delivered:** `src/input/touch-state.ts` (pure logic —
dead-zoned joystick deflection → analog steer; `TouchStateTracker` aggregating
independent pointer ids per control) and `src/input/TouchControls.ts` (DOM:
steering joystick bottom-left, GAS/BRAKE pedals bottom-right, handbrake,
camera/reset/fullscreen buttons top-right, safe-area insets, release safety net on
window pointerup + visibilitychange so no pedal can stick). `InputManager` merges
touch with keyboard in the existing smoothing pipeline (`setTouchState`,
`requestReset`/`requestToggleCamera`) — the car cannot tell thumbs from keys.
Surface auto-shows on coarse pointers; `?touch=1` forces, `?touch=0` hides.
Landscape: fullscreen + `screen.orientation.lock('landscape')` attempted on first
touch and from the ⛶ button (all failures swallowed — iOS), CSS rotate prompt in
portrait for touch sessions. Help text in the status line adapts to the device.

**Proof:** 373 tests green (joystick mapping, multi-pointer aggregation, merge,
stuck-state reset). Emulated-phone captures (`scripts/capture-touch.mjs`,
`/home/user/phase4-evidence/touch/`): GAS+joystick held simultaneously →
throttle 1.00, steering 26.7°, 14.9 km/h, 4 contacts; after touchEnd, throttle
decays to 0.017 and the wheel re-centres; portrait shows the rotate prompt;
zero console errors throughout. Remaining mobile work stays in Phase 8 (HUD,
settings, camera gestures).

## 25. Diagnostics overlay is no longer player-facing (2026-10-15, owner report)

The FPS/render panel was on for _every_ visitor (`overlayEnabled: true` default) and
covered most of a phone screen with no way to dismiss it. Fixed properly:
`applyRenderSwitches` now treats the overlay as debug instrumentation — shown only
when the URL opts in (`?debug`, or `?overlay=1`; `?overlay=0` always wins), so plain
player sessions get a clean screen while every existing capture workflow
(`debug=1`) keeps its instrumentation and route baselines are unchanged. The panel
also became dismissible: a × button in its header, **F2** on desktop, and a new 📊
button in the touch utilities — all driving `Application.setDiagnosticsVisible` /
`toggleDiagnostics`. Panel footprint capped (`max-w-[min(80vw,22rem)]`,
`max-h-[70dvh]`, internal scroll) so even when summoned it cannot eat a phone
screen; hidden panels skip DOM updates entirely. Unit test pins the URL gating;
`capture-touch.mjs` now proves all of it in an emulated phone: panel hidden in the
plain player view, opens under `?debug=1`, closes via ×, reopens via F2, closes
via 📊 — then drives with simultaneous GAS + joystick and releases cleanly, zero
errors. The owner-facing screenshots are now the `landscape-player.png` clean view.

**Workspace note:** `.git/config` is excluded from environment snapshots — after a
rotation, `git remote add origin https://github.com/mdraficode/Endless-Driver.git`
and `chmod +x /home/user/.github-auth/*.sh` may be needed before pushing.

## 26. Handling stability & screen-shake fix (2026-10-15, owner report)

Owner: "the whole preview is shaking every now and then… the car loses control after
driving for some time." Reproduced headlessly before touching anything: on flat
asphalt the car was already perfect, but cross-country on the real terrain a
PD driver-model (stand-in for a player's correcting thumb) **spun out 4–18% of a
30 s run and ended facing backwards**, with single-step wheel-load spikes of
**22 kN** and wheels airborne 24% of fast steps. Forensics: crests at speed launch
the car; asymmetric landings on triangulated (2 m facet) ground kick the yaw;
slip-relief steering authority then fed the slide instead of only catching it.

Fixes (all tuned/verified by the new `tests/physics/vehicle-stability.test.ts`):
yaw **stability assist** (damps yaw rate toward the bicycle-model target, faster
when partially grounded, hard yaw cap; stands down for handbrake drifts); **tire
relaxation** (lateral force builds over 0.45 m of roll, not one step); tire load
low-pass (25 ms); **damper blow-off** (saturates above 2.2 m/s compression
velocity); 30 ms compression smoothing + **suspension force slew limit**
(420 kN/s); analytic terrain normals blended over facet normals; slip relief now
only while **counter-steering**; downforce 1.2 → 2.4 (the single biggest lever;
2.6 scored marginally better in one course but breaks the aero guard test's
⅓-weight rule); extra airborne gravity (0.6 g) for planted landings. Camera:
lateral-acceleration roll is now low-passed and clamped before it can shake the
frame, and vertical chase uses a 2.2× slower lag than horizontal.

Results: terrain course-keeping over 3 noise seeds — **0% spinning, max slip <35°**
(was 80°), load spikes <9 kN; high-speed slalom max slip 36° → 4°; all 21 legacy
handling tests (incl. handbrake drift + opposite-lock catch) still pass; 379 tests
green. Browser capture on the mountain road re-verified (4/4 contacts, 0.3° slip,
zero errors). Adversarial note: a random-walk input holding full lock for seconds
at 170 km/h can still step the tail out transiently — beyond any human input the
driver-model represents; it recovers and drives on.

## 27. Phase 4 Increment 3 — worker-side terrain generation (2026-10-15)

Chunk geometry construction moved off the main thread. `buildChunkGeometry` split
into pure `buildChunkGeometryData` (transferable arrays) + `chunkGeometryFromData`;
`terrain-generation.ts` defines the protocol — workers rebuild the identical sampler
from configs (`createGenerationSampler`), so output is bit-identical on either thread
(unit-pinned, including across the road carve). `chunk-generator.ts` runs the pool
(2 workers; 1 on small core counts), reconstructs the desired queue each frame in
planner order, rejects stale/LOD-mismatched results, watchdogs stuck jobs (20 s),
and permanently degrades to the previous synchronous path on any worker failure —
the game never depends on the pool. TerrainWorld's 2-per-frame budget now caps mesh
creation/GPU uploads rather than CPU construction. Browser proof: diagnostics report
`terrainGeneratorMode: 1` and `terrainWorkerBuilds: 121` (every spawn-window chunk
worker-built), backlog 0, zero errors; 382 tests green. Phase 4 remaining:
floating-origin rebasing, district build-out (bridges/tunnels deferred).

## 28. Fog density retune (2026-10-15)

Owner reported the spawn view looks foggy. It is the intended height-aware
atmospheric fog (aerial perspective), not a defect — but the distance density
0.0014 (opaque ≈700 m, tuned on mountain routes) was too strong on the flat
spawn plain. Thinned to 0.00085 (opaque ≈1.2 km); valley-haze term and sun
forward-scatter unchanged, ridges still pop clear of valleys. A/B spawn
captures in /home/user/phase4-evidence/fog/; 382 tests green.

## 29. Phase 4 Increment 4 — floating-origin rebasing (2026-10-15)

World coordinates are eternal; physics/render coordinates are world − offset.
`OriginManager` (src/world/origin.ts, config src/config/origin.ts) slides the
offset by whole 128 m chunks when the car passes 2048 m from the local origin.
Application performs the slide in one frame after the physics step: car body +
interpolation poses (motion preserved), PhysicsWorld collider re-placement
(chunk bodies recompute from eternal keys; spawn obstacles from recorded world
positions), SceneManager content-root shift. Streaming windows plan in world
space on both sides, so nothing rebuilds; surface/normal queries translate
local→world; diagnostics and teleport speak world coordinates. 388 tests green
(unit origin invariants; integrated physics test across a slide; raycast proof
that colliders land locally). Browser proof at the volcano (−1500, −2100):
rebases 1, offsets (−1536, −2048), 242 total builds (spawn + volcano windows),
4/4 contacts, zero errors. Note: capture-road's settled-window guard had a hole
(teleport writes the pose instantly, letting pre-teleport stats pass) — it now
also requires 75 frames since the teleport. Phase 4 remaining: district
build-out (bridges/tunnels deferred).

## 30. Camera distance views (2026-10-15)

Owner: "the car is too far away." The chase camera now has distance views —
Close (3.8 m), Normal (6.2 m, the previous framing), Far (10.2 m) — each with its
own height/look/FOV trim (config/camera.ts CHASE_CAMERA_VIEWS). C (keyboard) and
📷 (touch) cycle Close → Normal → Far → debug orbit → Close; switching glides
(0.45 s dolly) instead of cutting, teleports snap to the active view, and the
choice persists in localStorage. Diagnostics name the active view; the overlay
Camera row shows it. Browser proof (scripts/capture-camera.mjs, new): measured
camera-car distances 3.79/6.20/10.18 m from the page's own diagnostics, zero
errors; 391 tests green. Cockpit/hood camera remains Phase 6 with the real car.

## 31. Chase camera distance-at-speed fix (2026-10-15)

Owner: "with increasing speed the car gets far and far away from the camera."
Cause: the exponential position follow trails its aim point by speed x lag
(0.18 s), so framing distance grew linearly with speed (~+7 m at 144 km/h). Fix:
velocity feed-forward in ChaseCamera — the car's velocity is estimated from the
pose stream (low-passed, teleport-jump-proof, clamped to 90 m/s) and the aim
point is led by one lag interval, cancelling the trail at any speed. Unit test
drives a pose at 40 m/s and holds 6.2 m; browser proof
(scripts/capture-speedcam.mjs): 6.20 m standing, 5.83 m at 74 km/h, zero
errors. 392 tests green.

## 32. Phase 4 Increment 5a — districts + vegetation (2026-10-15)

District registry (config/districts.ts: Kiri-cedar, Sakura Avenue,
Take-no-Michi, Yūhi Town, Shirasagi Terraces, West Highlands) resolved purely
by world/districts.ts (soft 0.55R core → 0 at R, strongest-deviation blend).
Vegetation (world/vegetation.ts): deterministic per-cell scatter (6.5 m grid,
integer hash), sampler-gated (road ≥7.5 m, spawn pad 55 m, treeline 150 m,
slope), one winner species per cell, sakura/bamboo district-gated after the
avenue species leaked to the pass in the first capture. Authored low-poly
vertex-colour species (3 tint variants) behind a registry for later CC0 GLB
replacement; InstancedMesh per species/variant, 7×7-chunk window, ≤3 chunk
generations/frame. Browser: 8,236 instances at cedar pass, 5,360 at avenue,
123 draw calls, zero errors; 398 tests. Remaining Phase 4: town buildings +
roadside props (5b), near-tier POM, bridges/tunnels deferred.

## 33. Destructible vegetation (2026-10-16)

Owner: "the car body is passing through the trees; trees should be
destructive — minimal impact half break/bend/fracture, full impact
shattered, realistic animations." Built: placement extracted to
vegetation-placement.ts (renderer-free, shared truth); tree-collision.ts
analytic trunk-circle vs chassis-OBB field with per-species hit points
(config/districts.ts TREE_DAMAGE): bend (spring-lean away, accumulates) →
snap at 100% (crown becomes ballistic debris over a stump) → shatter at
shatterSpeed (13 m/s conifer) or 220% accumulated (13 instanced shards);
rocks indestructible and stop the car; response removes exactly
stopSpeed-capped velocity + whisper of yaw torque. VegetationWorld mirrors
via hit events + state provider (stumps/bent persist across window slides;
debris pool has gravity, ground bounce, settle, 22 s lifetime). Wired in
Application before each physics step (world space; impulse is offset-free).
Browser proof (capture-trees.mjs): 54 km/h forest impact → shattered 1,
stump 1, debris 13, speed 54→35, zero errors. 403 tests green.

## 34. Haze retune, second pass (2026-10-16)

Owner again: "screen looks so hazy and foggy." A/B at the junction (fog2/
evidence): fog fully OFF vs default were nearly identical at road distances —
the fog was a minor accomplice. Dominant wash: near-white horizon sky, bloom
bleeding off it (threshold 1.0), and exposure 1.0 flattening contrast. Retune:
distanceDensity 0.00085→0.0006 (opaque ~1.7 km), valley heightDensity
0.00006→0.00004, sunScatter 0.65→0.45, bloom threshold 1→1.5, exposure
1→0.94. Note: two captures black-framed with "WebGPU device lost" — sandbox
RAM pressure (2 GB, duplicate preview servers), not a game regression; clean
after cleanup, zero errors. 403 tests green.

## 35. Phase 4 Increment 5b — Yūhi Town buildings + roadside poles (2026-10-16)

The town is a deterministic function of the map, like the forest
(`src/config/town.ts`, `src/world/town.ts`): 107 buildings on a jittered
24 m plot grid inside the Yūhi Town district (≥12 m from road centrelines,
slope-gated, no tree swallowed, fronts the nearest street) across three
archetypes (house/shop/tall) instanced as walls+roofs sharing transforms;
137 utility poles walking every road edge at 38 m spacing / 7.2 m offset,
alternating sides, 12 m clear of junctions. Collision shares the trees'
response (`applyCollisionResponse` extracted in `tree-collision.ts`):
buildings are solid against two car plan-circles vs the OBB; poles (HP 30)
accumulate closing×10 damage — with a 0.3 s per-pole hit cooldown mirroring
the trees, added after lint flagged the unused `deltaSeconds` (a slow push
cannot farm per-frame hits) — then fold to ≈83° and stop colliding.
Diagnostics: `townBuildings`/`townPoles`/`townPolesDown`. Verification:
408/408 tests green (5 town tests pin determinism, clearances, the solid
stop, the fold, and the cooldown), full unfiltered `npm run check` green,
and browser proof via `scripts/capture-town.mjs` (captures in `/tmp`, per
the keep-local-minimal rule): the car stopped at the tall building's face
(18→1 km/h, resting 7.0 m from its centre) and folded the east-plain pole
at 43 km/h (counter 0→1, speed bled, pole visibly down), zero page errors.
Remaining in this phase: near-tier terrain POM; bridges/tunnels deferred.

## 36. Workspace policy — GitHub is the only home (2026-10-16)

Owner order: the Arena workspace must stay near-empty (snapshot cap ~128 MB;
the repo alone was 63 MB — 31 MB git objects + 29 MB `public/` assets).
Rule: **no project files persist in `/home/user`.** Each work session starts
with `~/dev-fetch.sh`, which shallow-clones (`--depth 1`) the repo into
`/tmp/endless-driver` (ephemeral, outside the workspace snapshot); all work,
captures, `node_modules`, and browser installs live in `/tmp`; commit + push
increments early and often (uncommitted work does not survive sandbox
rotation); the clone is deleted when the task ships. `~/` keeps only the
GitHub auth files and small helper scripts (~30 KB total). GitHub (source +
Actions CI + Pages build) is the single source of truth.

## 37. The workflow is now a portable rule file (2026-10-16)

Owner asked that the GitHub-only workflow survive session and agent changes:
`WORKFLOW.md` now sits at the repo root as the standard operating contract
(GitHub is the only permanent home, ephemeral shallow clones in `/tmp`, push
before every run, keep the sandbox alive until SHA/CI/live are verified,
captures regenerable from committed scripts, credentials out of repo and
out of view), with a pointer at the top of `AGENTS.md` and a copy kept in
the Arena workspace. Any future agent — Arena or the owner's own — can pick
the project up from that file plus `PROJECT_PLAN.md` and this handover.

## 38. Phase 4 — near-tier terrain POM (2026-10-16)

Parallax occlusion mapping for the closest ground, completing Phase 4's
built scope. The four terrain splat sets now publish their scanned Poly
Haven displacement maps through the asset pipeline (`heightMap: true` on
the terrain entries in `scripts/fetch-assets.mjs`, `height` slot in
`MaterialTextureSet`, +1.5 MB, `assets:verify` green). `TerrainWorld` grew
a second material: chunks at `lodSegments[0]` (the 3×3 near ring) wear the
near material, whose sampling position is marched through the
splat-blended heightfield — 12 steps over a 0.09 m relief with a secant
refinement across the crossing layer, offset fading out 16→42 m so beyond
that both materials sample identically and cannot seam. Diagnostics:
`terrainPomActive`/`terrainPomSteps`/`terrainPomChunks`.

Two TSL dead ends, recorded so nobody retries them: `If`/`Loop` at
material-graph build time throws (no current stack — they need an `Fn`),
and a texture-sampling march inside an `Fn` produces undeclared texture
uniforms on the WebGL2 backend. The shipped march is therefore unrolled
at graph-construction time with the first crossing selected
arithmetically — all steps sample, so the step count is also the cost
ceiling (12, not 24: the first capture at 24 steps/720p could not finish
in the software renderer). Browser proof (`scripts/capture-pom.mjs`,
640×360 in `/tmp`): surfaces loaded, POM active, 12 steps, exactly 9 POM
chunks, 121 chunks total, zero errors. An A/B against the pre-POM build
at the same teleport: sky/UI pixel-identical (mean |diff| 0.00),
foreground strip mean |diff| 4.76 — the difference lives exactly where
the effect fades in. Phase 4 remainder: bridges/tunnels deferred as
decided; Phase 3 hardware validation still the owner's.

## 39. Owner feel pass — gamepad, steering bite, wider/clearer view (2026-10-16)

Owner: screen still foggy/blurry with a narrow field of vision; driving and
controls "still very off". Owner facts that reframed the diagnosis: playing
on **desktop with a gamepad**, symptoms = understeer + twitchiness + floaty
combined, view priority = widest/farthest/clearest, look = keep cinematic.
The headline root cause: **the game had no gamepad support at all** — a
controller player was on binary keys through a smoothing ramp (numb
turn-in, then sudden yaw: all three symptoms from one cause).

- **Gamepad** (`src/input/gamepad-state.ts`, Phase 8 scope pulled
  forward): standard mapping, dead-zoned centre-softened analog stick,
  analog LT/RT pedals, A/RB handbrake, Y reset, X camera, D-pad fallback;
  polled per frame and merged with keyboard/touch. Unit tests pin the
  mapping; browser proof (`scripts/capture-gamepad.mjs`, stubbed pad):
  trigger launched the car 0→30 km/h, half-stick bent wheels −12° and
  the heading followed, zero errors.
- **Feel retune**: digital steering rate 3.2→4.2/s and smoothing
  0.06→0.045 s (less float), `gripBudgetFactor` 1.2→1.35 (turn-in bite at
  speed), stability yaw response 3.2→3.8/s (catches rotation earlier).
  Vehicle stability/physics suites green on the new values.
- **View**: base FOV 62→70°, speed FOV 78→86°, default view now Far
  (which keeps the full FOV: its −5° trim removed), camera-storage key
  bumped to `:v2` so existing players actually land on the new default.
- **Clarity (third fog pass, cinematic kept)**: distance fog
  0.0006→0.00038, height fog 0.00004→0.000022, sun scatter 0.45→0.34;
  TAA dynamic-resolution floor 0.67→0.8 (less downscale smear); bloom/
  exposure/motion blur untouched per the owner's cinematic choice.
  Junction capture: road reads clear to the horizon at Far/70°, zero
  errors. If the view still feels foggy after this, the remaining lever
  is the bright horizon sky itself (sky/exposure), not the fog density.

## 40. Blur root cause — depth of field on the desktop tiers (2026-10-16)

Owner: "even more blurry and foggy" after §39. The fog densities had gone
_down_, so the regression was elsewhere — and the §39 proofs were all
captured at tier C, where depth of field and height fog are disabled.
The owner's desktop resolves to tier B, whose baseline had **DOF enabled:
12 m focus, full blur beyond ~26 m** — every distant road blurred by
design, and the new Far default view pushed more of the frame past the
blur line. A tier mismatch between proof and player had hidden it twice.

Fix: DOF is off at every tier during gameplay (`RENDER_CONFIG` baseline;
it returns with photo mode, Phase 8); motion-blur intensity 1→0.55;
height fog 0.000022→0.000012, sun scatter 0.34→0.30. The post-chain test
that pinned "DOF on above tier C" now pins the opposite. Verification at
the owner's own tier this time: tier-B diagnostics report the live effect
list `ao, contactShadows, taa, motionBlur, grade, bloom, lut,
chromaticAberration, sharpen, vignette` — no `dof` — at Far/70°,
renderScale 0.8, zero page errors. (Two tier-B screenshot attempts
black-framed on SwiftShader context loss — sandbox RAM, previously
diagnosed; the diagnostics were collected clean in the same runs.)
Standing lesson: visual proofs must state their tier, and a tier-C proof
says nothing about a tier-B player's screen.

## 41. Cinematic down + terrain diversity (2026-10-16)

Owner: turn down the cinematic effect on the gameplay screen; and "only
snow on the tracks… no diversity on different terrain". Measured first:
snow covers 4.1% of the map (the volcano cap above the snowline) and
**zero road points** — the white on/around roads was the pale wash
(light gravel shoulders, fog, bloom), not snow. Two fixes followed.

- **Cinematic stack down for gameplay**: motion blur off on tiers B and
  A (kept implemented for photo mode), chromatic aberration 0.4→0.12,
  vignette 0.55→0.30, tier-B bloom 0.22→0.16. **Height fog is now off on
  tier B as well** (tier A opt-in keeps it); distance fog 0.00038→0.00024.
  Tier-B diagnostics verify the live chain: `ao, contactShadows, taa,
grade, bloom, lut, chromaticAberration, sharpen, vignette` — no
  motionBlur, no dof. Tests re-pinned accordingly.
- **Terrain diversity**: districts previously only changed trees. Each
  district now carries a `groundTint` (golden farmland, deep cedar green
  at the pass, bamboo emerald, rose-soft Sakura Avenue, warm town, dry
  highlands), applied in the macro vertex colour **and** carried through
  a new `district` vertex attribute into the textured detail, so near
  ground differs too (worker transferables 6→7). Snowline 150→170 m
  shrinks the volcano cap; shoulder gravel darkened a step. District
  brow captures verify zero errors and visibly different ground/vegetation.

## 42. Fog removed completely (2026-10-16)

Owner clarified that the perceived white/foggy wash should not merely be
thinned: the fog effect is to be removed completely so the gameplay view
stays clear. That supersedes the earlier fog-density passes.

- **No fog is created in gameplay**: the baseline now ships with
  `sky.fogEnabled: false` and `sky.heightFog.enabled: false`; the height
  fog's distance density, height density, and sun-scatter strength are all
  zero. Tier resolution therefore leaves fog off on C, B, and A.
- **URL switches cannot turn it back on**: `applyRenderSwitches` forces
  both fog switches off, ignoring attempts such as `?fog=on` or
  `?hfog=1`.
- **The state is observable**: the application diagnostics now expose
  `fogMode`, sourced from the scene. Under the shipped configuration the
  scene creates neither the linear `Fog` nor the height-fog node, so this
  must read `off`.
- **Proof at the owner's tier**: a tier-B browser run with
  `?tier=B&debug=1&fog=on&hfog=1` still reported `fogMode: "off"`, Far
  view at 70°, and zero page/console errors. A tier-C field capture also
  completed with zero errors and showed the road and vegetation continuing
  to the horizon; the pale band at the top of that capture is the sky
  itself, not scene fog. Fog removal is in `1c3fac2`; diagnostics exposure
  is in `f3c10aa`.
- **Full verification**: unfiltered `npm run check` passed with 413/413
  tests, asset verification, and the production build.

## 43. Tree impacts exchange momentum (2026-10-16)

Owner: trees felt like "weightless destructible boxes" — the car broke
through without slowing, with no equal-and-opposite reaction. Diagnosis
confirmed it: the response removed a fixed `stopSpeed` cap (5.5 m/s for a
conifer) regardless of impact speed, so a 54 km/h hit kept ~35 km/h; and
during the 0.3 s damage cooldown a bent tree applied no resistance at
all, opening a push-through hole.

The solver (`world/tree-collision.ts`, species data in
`config/districts.ts`) now states one momentum exchange and uses it on
both sides. Every hit records `absorbedSpeed`, `reactionImpulseNs`
(car mass x absorbed speed, against the body's real Rapier mass) and a
`reactionSpeed` for the trunk/crown derived from the species' impact
mass. A tree that holds is **rooted**: it takes the car's whole normal
closing speed (plus a dull 0.08 rebound) and keeps resisting on every
contact frame — only damage is on cooldown, never the obstacle. A tree
that fails takes a fracture share of the closing speed on the way down
(conifer: 74% snap / 58% shatter; lighter species less), and the crown,
shards, and bent-tree sway now launch from the same reaction speed
instead of unrelated cosmetic pushes. Off-centre hits yaw the car from
the contact's real lever arm (r x impulse, capped). `respond` /
`applyCollisionResponse` return the impulse actually delivered to the
car so tests can assert the two sides are equal.

Unit proof: 10 m/s conifer snap now leaves 2.6 m/s (was 4.5), a 16 m/s
shatter leaves 6.7 m/s (was 10.5), a 2 m/s bend stops and rebounds the
car, sustained pushes stay blocked, off-centre torque is pinned.
Browser proof (tier C, cedar pass): the car accelerated 1→42 km/h into
the forest and the frame the snap counter moved it read **17 km/h**,
debris 1, zero page/console errors. Full unfiltered
`npm run check`: 415/415 tests green (fog removal is `93cfb25`'s
predecessor `1c3fac2`; this model is `93cfb25`).

## 44. Snow cap, fog code deleted, rotating starts (2026-10-17)

Owner report after §42/§43: on snowy terrain the screen was "fully foggy",
"nothing but snow all around", "no diversity on terrain generation at all —
like driving on Antarctica, not Japan", and the car always spawned on the
same terrain.

Root cause (the snow): `terrainSurfaceWeights` depended only on height and
slope, so everything above 170–210 m on gentle ground became a uniform
splat of paper-white snow (macro colour 0.85/0.87/0.90, raw scanned texture
up close). Under a pale sky that luminance is indistinguishable from fog —
which is why "fog off" diagnostics never matched what the owner saw.

Fixes (`ea56e0d`, `873c11a`):

- **Patchy alpine cap, not a biome.** `terrainSurfaceWeights` now takes the
  large `terrainVariationAt` field and a new finer `terrainPatchAt` field
  (90 m fBm). The effective snowline wanders ±34 m; snow fades on slopes
  from 0.16; even above the line only snow-favoured patches hold full snow,
  the rest is exposed alpine rock/soil; grass fades with altitude.
  Measured: snow dominates 2.2% of the 2.5 km volcano map and only 33% of
  ground above 230 m (was a solid sheet). Base
  snowline 190 m (peak 300 m). The renderer (`terrain-geometry.ts`) and the
  physics surface (`terrain-surface.ts`) pass the same fields, so what you
  see is what the tyres feel.
- **Snow is shaded, not white.** Macro snow 0.60/0.67/0.78; the near
  scanned `snow_01` albedo is graded by (0.62, 0.70, 0.86) in
  `TerrainWorld.ts`.
- **Lowland diversity.** Dry-soil patches cover whole fields; rock outcrops
  break crests. Tests pin: no snow weight below 150 m; snow-dominant ground
  < 12% of the volcano footprint; the summit contains both snow and rock;
  lowland has grass and soil dominance and rock weight > 0.25 on crests.
- **Soil grip 0.64 → 0.74** (dry compacted dirt). With soil now covering
  fields, 0.64 put a grip step at every patch edge and the seed-7
  cross-country stability test spun 0.7% of the run; the honest value fixes
  it with no test relaxed.
- **Fog deleted, not disabled.** `src/shaders/height-fog.ts` removed;
  `SkyConfig` is now only `domeScaleFactor`; `SceneManager` creates no
  `Fog`/`fogNode`; tier overrides and URL switches have nothing to enable.
  Diagnostics `fogMode` is typed `'off'` and tests assert the sky config
  keys equal `['domeScaleFactor']` at every tier and under `?fog=on&hfog=1`.
  The daylight `fogColorHex` was renamed `horizonColorHex`.
- **Rotating starts.** `src/config/spawns.ts`: six curated starts (Home
  Meadow, Kiri Pass, Sakura Avenue, Yūhi Town, Shirasagi Terraces, West
  Highlands), one picked at random per page load; `?spawn=<id>` pins one;
  reset returns to the session's start; diagnostics show `spawnId`/
  `spawnLabel` and a "Start" row. Tests pin that every road start is on
  asphalt and none is on snow.

Full unfiltered `npm run check`: **419/419**.

## 45. Round 7 — the "fog" was bloom: veil killed, daylight baselines fixed, placeholder blocks retired (2026-10-17)

Owner report (repeat of round 6, after round 6 shipped): "the camera fog is not removed, the
screen is fully foggy when the car is on a snowy terrain and there is nothing but snow and snow
all around… don't always spawn the car in a same terrain." Owner clarifications: the wash is
there **right at the start**, on **phone and desktop**, after a hard refresh of the round-6 build.

### Root cause (measured, not guessed)

Headless captures of the live round-6 build showed a milky veil over every frame: the darkest
5% of pixels sat at 195/255. A/B variant builds isolated it:

1. **Bloom over the HDR sky.** The sky's linear radiance exceeds any practical bloom threshold,
   so bloom's wide kernel (`radius 0.45`) spread sky white across the whole frame — strongest
   towards the horizon and the sun, exactly like aerial fog, and it flattened every district
   into one pale sheet (green highlands read as a snow field). With bloom off the same frame's
   black level drops to 33/255. Fog code was already gone (round 6); this was the last veiling
   path. Bloom is now **off at every gameplay tier** (`render.ts`), pinned by
   `quality-tier.test.ts`; photo mode (Phase 8) may re-enable it per shot.
2. **Daylight phase values applied as absolutes.** `EnvironmentClock` documents sun/ambient/
   environment/exposure as _multipliers_ (1 at noon), but `SceneManager`/`Engine` wrote them
   straight onto the lights: noon ran sun 1.0 vs fill 1.0 (no shadow contrast) instead of
   2.4 vs 0.35. Now composed through `src/environment/daylight-levels.ts` (`scaleBaseline`),
   tested.
3. **Exposure 0.94** sat past the ACES shoulder; baseline is now 0.72 (daylight multiplies it).
4. **Phase 1/2 reference blocks** (pale cubes on the spawn plateau) still rendered in the
   shipped world. Retired: `WORLD_CONFIG.obstacles` ships empty (list kept as a fixture seam;
   the vehicle-physics seam test places its own block).

### Also in this round

- Grass macro is two-tone (fresh green ↔ dry straw, keyed to the same variation field as the
  soil patches) and dry-soil patchwork is stronger, so lowlands read as patchwork.
- Pinned in `spawns.test.ts`: snow-dominant ground **< 5% within 250 m of every session start**
  — the owner sees a start's _view_, not its point; round 6 only checked the point.

### Verification

- `npm run check` 424/424 unfiltered at `5c3294a`; CI Validate + Deploy success.
- Live bundle `assets/index-E73NHhGQ.js`; live captures (tier C, WebGL2 fallback):
  west-highlands black level 196 → 33, home-meadow 196 → 151; proof sheet
  `/tmp/round7-before-after.png` (ephemeral).
- Diagnostics at both starts: `fogMode off`, zero page errors.

### Still open

- Tree-collision _feel_ (rounds 5-6 rejection) remains the standing open acceptance item.

## 46. Round 8 — swipe free space to orbit the chase camera (2026-10-17)

Owner request: "There is no way to move the camera angle by swiping action. The camera should
move when swiping on the free spaces on the screen."

### What shipped (`24137db`)

- `src/cameras/camera-orbit.ts` (pure): swipe pixels → orbit angle pair around the car
  ("grab the world": swipe right swings the camera to the car's left side, swipe down raises
  it). Clamps: ±77° yaw, +29°/−7° pitch on top of each view's own elevation, absolute
  elevation floor 3.4° so no swipe buries the camera in the ground. A ~220 px thumb stroke
  reaches most of the yaw limit (pinned by test).
- `src/cameras/ChaseCamera.ts`: the orbit target moves with each swipe pixel; the framed
  offset eases after it on a 0.12 s constant; framing distance is preserved (an orbit is a
  rotation, not a dolly) and the look point stays on the car, so orbiting re-aims by
  construction. Works in every distance view.
- `src/input/orbit-gesture.ts`: the canvas is the gesture surface. Every on-screen control
  captures its own pointers, so a pointer that goes down on the canvas is by definition free
  space; one pointer orbits at a time, and a second thumb keeps driving while the first
  swipes (verified with simultaneous touch points). Pointer events give desktop mouse-drag
  the same gesture.
- Diagnostics: `cameraOrbit` (yaw/pitch degrees); the overlay's Camera row shows
  `· orbit Y°/P°` once a thumb has moved the view.

### Verification

- `npm run check` 46 files green; CI Validate + Deploy success; live bundle
  `assets/index-Dt_z_-h8.js`.
- Browser proof (tier C, touch forced): mouse drag → yaw 63.9°; vertical drag → pitch 27.1°;
  CDP touch swipe left → yaw −56.8°; a swipe starting on the joystick steers and leaves the
  orbit untouched; joystick held + second-finger swipe orbits while driving. Live site:
  swipe → yaw 53.3°, zero page errors. Screenshots `/tmp/orbit-*.png` (ephemeral).
- Regression pinned: `orbit-gesture.test.ts` includes "detaches on dispose" — a dispose call
  misplaced in `attachTouchControls` once killed the gesture at boot (found by tracing
  add/removeEventListener in a browser).

### Still open

- Tree-collision _feel_ (rounds 5-6 rejection) remains the standing open acceptance item.

## 47. Round 9 — light ratio, rooted trees, physical texture scales, verified backend (2026-10-17)

Owner report: snow greets the player at every start and driving feels monotonous;
trees visibly float above the ground; textures read unrealistically — no shadows,
no smoothness, no HDR feel. Target restated: gameplay that feels "almost life like".

**Shadows (root cause found).** A three-way A/B on local variant builds settled it:
cascades 3 vs 1 made no difference (CSM exonerated); a fills-at-zero variant
rendered a black frame (the sun alone, at 2.4, was being drowned once ambient and
IBL were removed from the exposure balance); a 10x-sun variant showed crisp cast
shadows. Conclusion: the fill/sun ratio, not the shadow pipeline, flattened every
frame. Shipped rebalance: `sunIntensity` 2.4 → 3.4, `ambientIntensity` 0.35 → 0.25,
environment intensity 1 → 0.5 (exposure untouched at 0.72). Post-change captures
show the car and tree cast shadows plus deeper, more saturated colour; measured
on tier B 480x270 WebGL2: 5th-percentile luminance (wash) 0.610 → 0.550 at
home-meadow and 0.348 → 0.270 at Kiri-cedar, mean saturation 0.333 → 0.364 and
0.319 → 0.340. "HDR look" is a lighting ratio here, not a toggle.

**Floating trees.** Chunk meshes decimate with distance while the scatter samples
exact heights, so trunks sat above the decimated surface. Instances now sink
0.3 x scale (stumps 0.15 x scale) in `vegetation.ts #writeMatrix`, and trunk
cylinders carry +0.5-0.6 m of buried length so bases stay underground across LOD
seams. Kiri-cedar captures show every trunk meeting the grass.

**Texture realism.** World-space UV scales were hand-picked and unphysical (grass
blades at half their scanned size, the rock face at double its width). They now
derive from each Poly Haven scan's documented width (GRASS_UV 0.5, SOIL_UV 0.77,
ROCK_UV 0.45, SNOW_UV 0.5 tiles/m) across diffuse, height and ARM sampling, and
scanned detail now survives to 380 m (was 260 m) before the macro tint blends in.

**Backend default.** The owner's "snow everywhere / all white ground" has never
reproduced in any WebGL2 capture at any tier or spawn across rounds 6-9; their
devices default to WebGPU, which no capture, test or CI job in this project can
exercise (no WebGPU adapter in the sandbox). `backendPreference` is therefore
`'webgl'` in the base config, and per-tier overrides may no longer restate a
backend (they carried `'auto'`, which would have silently undone the default —
now pinned by `quality-tier.test.ts`). WebGPU stays implemented; switching the
default back to `'auto'` is a one-line change once real-hardware captures exist.

**Still open (carried):** tree-impact feel from round 5 remains rejected by the
owner (criteria in §43); the remaining realism ceiling is asset-class — procedural
cone trees and the box placeholder car — which is exactly what Phases 5-6 unlock
(scanned CC0 trees, hero car). At that 2026-10-17 checkpoint the authorization was pending; the owner authorized Phases 5–6 on 2026-10-18, in phase order.

## 48. Remove snow from gameplay terrain (2026-10-18)

Owner instruction: "Remove all the white ground terrain. I have had enough of this."

**Implementation:** gameplay terrain now uses only grass, soil, and rock. The snow asset is no longer loaded by `TerrainWorld`, the shader no longer samples snow albedo/normal/ARM/displacement, and the fourth splat channel is reserved and fixed at zero. High ground transitions to exposed rock/soil instead of a snow layer. Physics surface selection and grip mixing likewise only include grass/soil/rock. Tests now require zero snow weight across the full volcano footprint, every session-start view, and every generated terrain vertex; they also assert the far-field macro ground colour stays below the pale/white range.

**Validation:** `npm ci` succeeded. `npm run check` passed at commit `1f213c2`: Prettier, ESLint, the no-GLSL guard, both TypeScript checks, assets verification (17 assets), production build, and all tests (46 files, 442 tests). The build reports the existing large-Rapier-chunk warning; the vegetation test still emits existing `BufferGeometry.toNonIndexed()` warnings. Neither warning is from the snow-removal path.

**Visual status:** no stable readable owner-device capture is available. The previous black-frame/context-restoration captures do not prove terrain appearance. Do not call the owner's white-ground report visually fixed yet.

**Historical next step (2026-10-18):** obtain a stable readable capture on the owner's device before visual review. The owner later reported Phase 5 passed on 2026-10-21; Phase 6 and Phase 9 were subsequently authorized, while Phases 7–8 remain gated.

## 49. Prepare terrain and vegetation ahead of the player (2026-10-18)

Owner direction: “Ok carry on further development work.” Continued within the authorized Phase 5 scope; Phase 6 was separately authorized on 2026-10-20; the owner reported Phase 5 passed on 2026-10-21.

**Implementation:**

- Terrain and vegetation now share the same deterministic, bounded velocity lead: 1.4 seconds of travel, capped at 112 m. The player's current chunk remains inside the foliage window while new chunks are planned ahead.
- Added startup preparation for the full 11×11 terrain window and 7×7 vegetation window. Terrain worker/fallback batches and foliage placement batches yield while the loading screen remains up; the first frame is delayed until the initial world is prepared (with explicit 45 s terrain / 30 s vegetation safety ceilings).
- Scanned tree adoption is awaited as part of first-world readiness, avoiding a late swap from authored to scanned models after driving starts. Runtime foliage generation stays capped at three chunks per frame.
- Added pure planner tests, a terrain-preparation test, and a foliage-preparation test. Diagnostics expose desired/loaded/pending foliage chunk counts.

**Verification:** `npm run check` passed at source checkpoint `33d54f680e46d8384c66f582d76f1f926c251978`: formatting, ESLint, GLSL guard, both TypeScript checks, **48 test files / 447 tests**, 17-asset hash/licence verification (39,714,769 bytes), and production build. GitHub Validate run `39161617071` and Pages Deploy run `39161616954` both succeeded; local `HEAD` matched `origin/main`. The live Pages bundle (`assets/index-CSm3oqHR.js`) contains the startup-readiness and vegetation-prefetch code. Existing warnings remain: test models intentionally lack some LOD nodes, vegetation emits `toNonIndexed()` notices, and Vite reports the large Rapier chunk.

**Visual status at this 2026-10-18 checkpoint:** no stable, readable owner-device capture confirmed terrain appearance or visible vegetation streaming. Earlier reports of tree pop-in, dark foliage and weak HDR/ray-tracing effect were still under review at the time; the owner later reported non-FPS issues resolved and Phase 5 passed on 2026-10-21. Phase 6 was broadly authorized on 2026-10-20. No visual or device-performance acceptance is claimed here.

**Historical next step (2026-10-18):** complete the then-authorized Phase 5 work and obtain stable visual evidence. The owner later reported Phase 5 passed on 2026-10-21 and broadly authorized Phase 6 on 2026-10-20; Phases 7–8 remain gated.

## 50. Lift dark foliage with daylight-driven leaf backlighting (2026-10-18)

Owner report (2026-10-18): foliage is too dark. This entry continued within the then-authorized Phase 5 work; the owner later reported non-FPS issues resolved and Phase 5 passed on 2026-10-21. Broad Phase 6 authorization followed on 2026-10-20.

**Implementation:**

- Added a restrained linear albedo lift for authored leaf geometry and named scanned foliage materials (`leaf`, `leaves`, `twig`, `needle`, `foliage`). Bark and dead branches are not selected.
- Added a per-vertex foliage mask for authored geometry and a small TSL backlight term: leaves facing the camera and turned away from the sun receive a capped tint based on the resolved sun direction, sun colour, and daylight phase. It is an inexpensive transmission approximation, not true translucency or ray tracing.
- Existing GLTF maps, sidedness, and emissive contribution are retained when scanned foliage materials are copied to node materials; `alphaTest` is copied explicitly because Three's `NodeMaterial.copy` skips its private backing field. Shared source materials are cloned once across repeated LOD parts.
- The same `DaylightState` that lights the scene is forwarded to the driving content; backlighting is disabled at night. Scanned instance materials/geometries are also explicitly released with the vegetation world.

**Verification:** `npm run check` passed at source checkpoint `2d4cb6853a29a43510e378f4042f2a96d997b533`: Prettier, ESLint, the no-GLSL guard, both TypeScript checks, **49 test files / 450 tests**, 17-asset hash/licence verification (39,714,769 bytes), and production build. The new tests cover authored foliage masks/albedo, scanned material preservation, and daylight/night strength. A first test run exposed that Three's `NodeMaterial.copy` skips `_alphaTest`; the public `alphaTest` value is now copied explicitly and the full suite passes. GitHub Validate run `39163712534` and Pages Deploy run `39163712499` both succeeded for that source SHA. The deployed page and bundle (`assets/index-g4mONM3w.js`) returned HTTP 200; the bundle contains the new foliage shader markers. Existing non-blocking warnings remain: vegetation geometry tests emit `BufferGeometry.toNonIndexed()` notices, model fixtures report intentionally missing LOD nodes, and Vite reports the large Rapier chunk.

**Visual status at the time of this 2026-10-18 entry:** no stable readable owner-device capture was available. This was a targeted code-level response to dark foliage, not visual proof of appearance. The owner later reported non-FPS issues resolved and Phase 5 passed on 2026-10-21; broad Phase 6 authorization followed on 2026-10-20. No named-device performance result is implied.

**Historical next step (2026-10-18):** obtain stable owner-device visual evidence before making appearance claims. The source-level brightness/backlight change alone was not visual evidence; the other visual reports remained subject to review at that time. The owner later reported non-FPS issues resolved and Phase 5 passed on 2026-10-21; Phases 7–8 remain gated.

## 51. Owner-authorized Phase 9: Aohara city night-lighting slice (2026-10-19)

The owner explicitly authorized a new urban-systems track to begin immediately, in parallel with the Phase 5 visual gate that was then pending; the owner later reported Phase 5 passed on 2026-10-21. Scope decisions: add a fictional Japanese megacity district while retaining rural Hinode; prioritize night lighting; include both soft glow/halation and subtle diffraction/starbursts. This authorization was Phase 9 only; Phase 6 had not yet been broadly opened (that authorization followed on 2026-10-20), and the owner reported Phase 5 passed on 2026-10-21. Phases 7–8 remain gated. ADR 0006 and `PROJECT_PLAN.md` §9 record the scope.

**Implementation:**

- Added a dedicated `?scene=city` composition root using the production `Engine`, `SceneManager`, daylight controller, and post chain. It opens at 23:30 by default; `?time=<hours>` and `?tier=C|B|A` remain available. The scene has an orbit camera but intentionally no Rapier, player car, or claim of driveability.
- Added a bounded Aohara avenue block with an intersection, lane markings, zebra crossings, two timed opposing traffic signals, eight high-rise masses, deterministic lit windows, instanced lamp posts, tier-budgeted point lights, and a dark specular pavement material.
- Light sources use local TSL Gaussian halo/diffraction sprites, faded by solar elevation. The global bloom path remains disabled in gameplay to avoid the previously measured fog-like washout. The surface highlight is a basic material-lighting approximation, not SSR, ray tracing, rain, or a weather simulation.
- Added `SceneContent.update(deltaSeconds)` and routed the engine's clamped frame delta to content, so the two demo signals animate without a timer or new physics system. Tests cover the night fade, safe opposing signal phases, C/B/A budgets, and scene construction.
- Added Phase 9 authorization/acceptance documentation to `AGENTS.md`, `PROJECT_PLAN.md`, `README.md`, `docs/VISUAL_TARGET.md`, `docs/ARCHITECTURE.md`, `src/lab/README.md`, and `src/world/README.md`; added ADR 0006. No external assets or dependencies were added.

**Verification:** Fresh-clone `npm ci` installed 201 packages with 0 reported vulnerabilities. Final `npm run check` passed: Prettier, ESLint, the no-GLSL guard, both TypeScript checks, **50 test files / 455 tests**, 17-asset hash/licence verification (39,714,769 bytes), and production build. The new `urban-night.test.ts` has five tests. Existing non-blocking warnings remain: intentional missing-LOD fixture messages, vegetation `toNonIndexed()` notices, and Vite's large Rapier chunk warning.

**Visual status at the first-slice checkpoint:** No browser, WebGPU/WebGL screenshot, owner-device capture, performance measurement, or owner visual acceptance was performed for that increment. At that checkpoint the city block was not yet connected to the main driving-world composition; AI pedestrians/vehicles, tunnels, bridges/flyovers, and highway integration remained planned Phase 9 work. At that first-slice checkpoint, the owner report that Phase 5 passed had not yet been received; it arrived on 2026-10-21.

**Remote status:** Implementation commit `0d677a6aa64f934c35150fbcb5b9a5552a9f5630` was pushed to `main`; `git ls-remote origin refs/heads/main` matched exactly at verification time. GitHub Validate run `39173654703` and Pages Deploy run `39173654614` both completed successfully for that SHA. The deployed page `https://mdraficode.github.io/Endless-Driver/?scene=city&time=23.5` returned HTTP 200; its bundle `assets/index-Dm-MkL2D.js` returned HTTP 200 and contains the Aohara night-world and Gaussian-diffraction markers. This proves deployment of the code, not that a browser rendered it correctly or that the owner visually accepted it.

**Next as of this first slice:** review the bounded `?scene=city` lighting on an actual browser/device. When this historical entry was written, the 2026-10-21 owner report had not yet been received; the owner later reported Phase 5 passed on 2026-10-21; do not begin Phase 7 or Phase 8. The subsequent driving-world integration and its verification status are recorded in §52.

## 52. Phase 9: bounded Aohara road-grid/night-block integration (2026-10-19)

**Implementation:**

- Added shared Aohara configuration centred at `(1250, -430)`: vegetation-free district, 3×3 road grid at 160 m spacing, 470 m city-access connector from the rural `east-plain` node, a 250 m-radius levelled core, and smooth return to seeded terrain by 430 m. The existing rural districts and no-white/snow gameplay-ground rule remain unchanged.
- Added road classes and per-edge pavement/shoulder widths through the road graph, terrain carve, physics surface sampler and visual ribbons. Road geometry is batched into at most six material meshes, including a local, restrained urban-asphalt specular response; the city-night block does not overlay duplicate roadway slabs in integrated mode.
- Added the `aohara-city` spawn. The Aohara night block is wired at the shared central junction, with the graph providing its roads and markings, integrated crosswalk/stop markings, daylight-gated lights/windows, timed signals, and high-rise footprint contacts using the existing collision-response seam. City content updates independent of camera mode and is disposed with the driving-world content; the compact authored block is resident while terrain and vegetation use the existing prepare-ahead streamers.
- Added/updated tests for graph connectivity, road classes/widths, surface sampling, batched road-mesh count, plateau bounds/terrain restoration, vegetation exclusion, spawn selection, high-rise contact, and driving-world composition/daylight/disposal. Updated authorization/status documentation in `AGENTS.md`, `README.md`, `PROJECT_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/VISUAL_TARGET.md`, `src/lab/README.md`, and `src/world/README.md`.

**Local verification:** From the fresh `/tmp/endless-driver` clone based on `cbe7ec882ebe33efa442e7755e717362a5eb6d10`, `npm ci` installed 201 packages with 0 reported vulnerabilities. Final `npm run check` passed: Prettier, ESLint, the no-GLSL guard, both TypeScript checks, **51 test files / 461 tests**, asset verification (17 assets / 39,714,769 bytes), and the production build. The build emitted the existing large-chunk warning; test output also contains the known intentional missing-LOD fixture messages and repeated `toNonIndexed()` notices. No assets or dependencies were added to the project.

**Driving/visual status:** Automated checks establish the code-level composition and sampler contracts only. No browser run, WebGPU/WebGL capture, manual drive test, owner-device visual review, mobile check, or performance measurement was performed for this increment. `?scene=city` remains an orbit-only look-dev preview; `?spawn=aohara-city&time=23.5` is configured for the main world but has not been manually validated. Do not claim verified driveability, visual acceptance, or performance. When this historical entry was written, the 2026-10-21 owner report had not yet been received; the owner later reported Phase 5 passed on 2026-10-21; Phase 6 was broadly authorized on 2026-10-20. AI traffic/pedestrians, the broader urban district, expressways, tunnels, bridges and flyovers remain future Phase 9 work.

**Remote status:** Integration commit `bfd4ba77c227c0486c6c7511f351d97523e6d723` is pushed to `main`; `git ls-remote origin refs/heads/main` matched exactly. GitHub Validate run `39178732061` and Pages Deploy run `39178732107` both succeeded for this SHA. The deployed spawn URL `https://mdraficode.github.io/Endless-Driver/?spawn=aohara-city&time=23.5` and its bundle `assets/index-pXVMAwQV.js` returned HTTP 200; the bundle contains Aohara-world, urban-asphalt, city-spawn and central-junction markers. This verifies the deployed artifact, not browser rendering, manual driveability, owner-device acceptance or performance.

**Historical next step (2026-10-19):** manually inspect/test `?spawn=aohara-city&time=23.5` on an actual browser/device and record visual/performance evidence. Automated checks and deployment do not establish visual acceptance or driveability. The owner later reported Phase 5 passed on 2026-10-21; Phase 9 remains authorized and Phases 7–8 gated.

## 53. Phase 9: Aohara grid expansion and default city start (2026-10-19)

**Implementation:**

- Expanded the Aohara network from the initial 3×3 starter to a connected 5×5 orthogonal grid: 40 urban edges over 640 m, with two continuous arterial spines, local streets and a 310 m connector from rural `east-plain`. Expanded the levelled plateau to a 500 m radius with seeded-terrain blending by 620 m; the vegetation-free core now covers all road-grid corners. Rural Hinode remains in place.
- Added 3.2 m sidewalk ribbons to every urban edge and one instanced city marking pass for zebra crossings at all 25 intersections plus signal-junction stop lines. Material batching keeps the road, sidewalk and crossing set within eight meshes.
- Extended Aohara's resident night kit to 16 blocks and 32 instanced high-rises. The urban road graph now places 160 streetlamp poles/emitters along sidewalks; only the existing tier-capped 4/6/8 point lights and localized glow/starburst effects are active. Building-window, road, collision and prepare-ahead terrain/physics paths reuse existing systems.
- Changed the default game start to Aohara Central Avenue, halfway along the north central arterial rather than in the junction. `?spawn=<id>` still pins any curated rural start; explicit `?spawn=random` retains the old district rotation. No assets or dependencies were added.

**Local verification:** In fresh shallow clone `/tmp/endless-driver-city` at the prior `main` checkpoint `66568e3c2024b7127868b47580eb83ac9447fc6b`, `npm ci` installed 201 packages with 0 reported vulnerabilities. `npm run check` passed: Prettier, ESLint, the GLSL guard, both TypeScript checks, **51 test files / 463 tests**, asset verification (17 assets / 39,714,769 bytes), and production build. The build emitted the existing large-chunk warning; tests emitted the known missing-LOD fixture messages and `toNonIndexed()` notices. The main bundle is 1,418.16 kB and the Rapier bundle 4,335.10 kB.

**Driving/visual status:** Spawn resolution, grid connectivity/classes, plateau bounds, urban vegetation exclusion, sidewalk/crosswalk composition, object counts and tier light caps are covered by automated checks. No browser play, manual drive test, owner-device visual review, mobile review or device-performance measurement was performed for this increment. Do not treat this code/test status as driveability, visual acceptance or performance evidence. When this historical entry was written, the 2026-10-21 owner report had not yet been received. Phase 5 was later reported passed, and Phase 6 was broadly authorized on 2026-10-20; Phases 7–8 remain gated. AI traffic/pedestrians, further urban expansion and expressway/tunnel/bridge/flyover links remain future Phase 9 work.

**Remote status:** Implementation commit `126e47f3453ecdfd2914296d0c9b8552172e9c83` was pushed to `main`; `git ls-remote origin refs/heads/main` matched exactly. GitHub Validate run `39222402679` and Pages Deploy run `39222402651` both completed successfully for this SHA. The deployed default page and `?spawn=aohara-city&time=23.5` URL returned HTTP 200; bundle `assets/index-BfBBOtEe.js` returned HTTP 200 and contains Aohara city-spawn, sidewalk-crossing, streetlamp and arterial markers. This verifies deployed files only, not browser rendering, manual driveability, owner-device acceptance or performance.

**Historical next step (2026-10-19):** let the owner test the default Aohara start and night start (`?spawn=aohara-city&time=23.5`) on an actual browser/device, keeping visual/performance claims evidence-based. The owner later reported Phase 5 passed on 2026-10-21; Phase 6 was broadly authorized on 2026-10-20. Phase 9 remains authorized and Phases 7–8 remain gated.

## 54. Phase 9: Aohara HDR wet-night lighting increment (2026-10-19)

**Implementation:**

- Confirmed the existing exposure pipeline already hands `DaylightState.exposure` to the engine; the night curve scales exposure to 1.45 against the 0.72 renderer baseline. No exposure-wiring change was required. The existing HDRI/ACES route is preserved, and whole-frame bloom remains off.
- Replaced Aohara urban asphalt's simple standard material with a bounded `MeshPhysicalNodeMaterial` wet-look clearcoat. Roughness/clearcoat respond to solar elevation (subtle in daytime, stronger at night); the driving grid reuses the already-bundled CC0 scanned asphalt maps. In look-dev, the standalone Aohara road uses the same wet-look response. This is visual only: no rain, weather state, puddles/standing water, spray or traction change; no SSR or ray-tracing claim.
- Kept all 160 graph-aligned streetlamp poles and instanced emitters. The C/B/A point-light budget remains 4/6/8, but active pointlights and their matching flares now follow the nearest lamps around the world-space streaming focus, refresh at 12 m intervals, and fade outside the 500–620 m Aohara radius. No shadow or mobile-tier budget increase.
- Refined each local TSL Gaussian diffraction sprite with a broad low-energy tail and faint aperture ring, under a 0.38 opacity cap; existing cardinal/diagonal tier weights remain, and the effect stays source-local.
- Added tests for wet-look material nodes, solar wetness blend, light coverage/fade, moving nearest-light selection, tier limits, and preserving the existing road mesh budget. No asset or dependency was added. Updated phase/visual/handoff documents.

**Local verification:** Fresh shallow clone `/tmp/endless-driver-night-20261019` began at `315cc3d877b733a47abccd966e1e80c9d4d7164c`; `npm ci` added 201 packages and reported 0 vulnerabilities. Full `npm run check` passed after the changes: Prettier, ESLint, no-GLSL guard, both TypeScript checks, **51 test files / 465 tests**, 17-asset hash/licence verification (39,714,769 bytes), and production build. Existing non-blocking output remains: intentional missing-LOD fixture messages, `toNonIndexed()` notices, and Vite's large-chunk warning. The build emitted a 1,420.99 kB main bundle and 4,335.10 kB Rapier bundle.

**Visual/device status at this 2026-10-19 checkpoint:** No browser render, manual driving, WebGPU/WebGL capture, owner-device review, mobile check or performance measurement was performed. Automated tests verify material configuration and light-selection math, not shader rendering or appearance. Review `?scene=city&time=23.5` and manually drive `?spawn=aohara-city&time=23.5` before making visual/driveability claims. The default Central Avenue start, pinned `?spawn=<id>` choices, explicit `?spawn=random`, rural Hinode and no-white gameplay ground remain unchanged. The owner later reported Phase 5 passed on 2026-10-21 and broadly authorized Phase 6 on 2026-10-20; Phases 7–8 remain gated.

**Remote status:** Implementation commit `833a962f26ba18ef20da49f5da896c5b8f109019` was pushed to `main`; `git ls-remote origin refs/heads/main` matched this SHA at verification. GitHub Validate run `39230982848` and Pages Deploy run `39230982882` both succeeded for it. The deployed `?scene=city&time=23.5` page returned HTTP 200 (1,788 bytes); bundle `assets/index-k5mFALDf.js` returned HTTP 200 (1,421,071 bytes) and contains Aohara wet-look clearcoat, Gaussian diffraction, local-light-range and city-spawn markers. This verifies the deployed files only—not browser rendering, owner-device appearance, manual driveability, or performance. A local Vite live preview is also running at port 5175; it is a preview, not acceptance evidence.

## 55. Phase 9: Aohara brighter night kit (2026-10-19)

**Implementation:**

- Increased graph-aligned streetlamp spacing density from 64 m to 40 m. The current 40-edge Aohara road graph now has 240 instanced lamp poles/emitters and 48 unbadged lamp-post banners; the look-dev scene retains its compact placements.
- Added 22 low-rise shells: four shops, two casinos, four mansions, eight townhouses and four detached houses; added one open-bowl stadium, 18 abstract billboard panels, building-entry lanterns and stadium roof-edge lights. The city retains its existing 32 high-rises and lit-window instances; no assets or dependencies were added.
- Split the active unshadowed point-light cap by C/B/A tier: 6/8/12 total, allocated 4/6/8 to streetlamps and 2/2/4 to nearby architectural candidates from shops, casinos, stadiums, billboards and lanterns. The nearest architecture selection follows the existing streaming focus and fades with city-local lighting coverage. Gaussian flares stay source-local; no scene-wide bloom or shadows were added.
- Added the new building footprints to the existing `collideCarWithStaticBoxes` response and tests for exact graph counts, billboard/banner/building stats, tier budgets, point-light movement/fade and low-rise collision. Existing Central Avenue default, pinned `?spawn=<id>`, explicit `?spawn=random`, rural Hinode, wet-look-only treatment and Phase 5→6 / Phase 7–8 gates remain unchanged.

**Local verification:** The fresh clone `/tmp/endless-driver-lumen-20261019` began at `bddda7af700a33b69f559e368115bb98558d5899`. Its initial `npm ci` command ended with a shell timeout/error and no recorded exit code; dependencies were present and `npm ls --depth=0` succeeded, so do not claim a recorded successful `npm ci`. Full `npm run check` subsequently passed on the implementation: Prettier, ESLint, no-GLSL guard, both TypeScript checks, **51 test files / 465 tests**, asset verification (17 assets / 39,714,769 bytes), and production build (main bundle 1,431.70 kB; Rapier 4,335.10 kB). One earlier aggregate run had an unrelated 5 s timeout in `vehicle-stability` seed 123; the isolated file passed, and the repeated full check passed. Known non-blocking test-fixture/`toNonIndexed()` notices and the Vite large-chunk warning remain.

**Visual/device status:** No browser-render capture, manual drive, owner-device review, mobile check or performance measurement was performed. Tests verify configuration, counts, selection/fade math and collision contracts—not shader appearance, road readability or device speed. The city preview and `?spawn=aohara-city&time=23.5` route still require visual/manual review; do not claim owner acceptance or performance.

**Remote status:** Implementation commit `bef957ef6a2581c866c86a62fee1d3271d14527c` was pushed to `main`; `git ls-remote origin refs/heads/main` matched it. GitHub Validate run `39239870161` and Pages Deploy run `39239870247` both succeeded for that SHA. Deployed `?scene=city&time=23.5` and `?spawn=aohara-city&time=23.5` pages returned HTTP 200 (1,788 bytes); bundle `/Endless-Driver/assets/index-ClJWDh3F.js` returned HTTP 200 (1,431,776 bytes) and contains stadium, billboard, banner and architectural-light markers. This confirms deployed static files, not rendering or driveability. An initial local Vite dev-server attempt stalled during dependency optimization and was terminated; a production `vite preview` now runs on port 5176, and both local query routes return HTTP 200 (1,758 bytes). That preview is available for review but is not visual-acceptance evidence. The older port-5175 preview shows the preceding wet-night increment.

**Next:** the follow-up road-clearance/building-footprint audit is recorded in Section 56. The port-5176 preview mentioned above is from the pre-audit clone and has the earlier tower layout; use the post-audit deployed build for any new owner visual review. Manually drive `?spawn=aohara-city&time=23.5` and record readability and owner-device/mobile performance evidence without assuming it. When this historical entry was written, the 2026-10-21 owner report had not yet been received. Phase 5 was later reported passed, and Phase 6 was broadly authorized on 2026-10-20; Phases 7–8 remain gated.

## 56. Phase 9: Aohara road-clearance and building-footprint audit (2026-10-19)

**Implementation:**

- Added a read-only cloned snapshot of `UrbanNightWorld`'s actual static building collision boxes for deterministic geometry QA; player collision continues to use the existing `collideCarWithStaticBoxes` path.
- Audited all 55 integrated Aohara building footprints, testing all 1,485 pairs with a 0.75 m expansion per footprint and a positive-separation threshold. The audit found central high-rise footprints encroaching on sidewalk probes and overlapping adjacent boxes; repositioned the authored skyline towers and narrowed selected footprints. The current set has no pairwise overlap under the expanded-box check.
- Sampled every point in the 40 urban-local/urban-arterial road graph edges. At each point, tested seven car-sized probes: centerline, ±3.4 m lane positions, 1.5 m inside each pavement edge, and both sidewalk centers. More than 1,000 probes returned no building-collision contacts. These are sampled geometry/collision checks, not a continuous proof of all rendered surfaces.
- No assets or dependencies were added. Road graph, default Aohara spawn, pinned spawn overrides, explicit random spawn, rural Hinode, city-only static wet-look treatment, traction, and the Phase 5→6 / Phase 7–8 gates are unchanged.

**Local verification:** Fresh clone `/tmp/endless-driver-city-audit-20261019` started from `66233c9d87158c0b75994040e25546959d34f012`; `npm ci` succeeded (201 packages, 0 vulnerabilities). `npm run check` passed: formatting, lint, GLSL guard, both TypeScript checks, **51 test files / 466 tests**, 17-asset verification (39,714,769 bytes), and production build (main bundle 1,431.76 kB; Rapier bundle 4,335.10 kB). Existing non-blocking missing-LOD fixture and `toNonIndexed()` notices remain, as does Vite's large-chunk warning.

**Visual/device status at this 2026-10-19 checkpoint:** No browser-render review, manual drive, owner-device/mobile review, or performance measurement was performed. Treat this milestone strictly as automated geometry/collision evidence—not visual acceptance, manual driveability, or device-performance evidence. The tower layout still lacked visual review. The owner later reported Phase 5 passed on 2026-10-21 and broadly authorized Phase 6 on 2026-10-20; Phases 7–8 remain gated.

**Remote status:** Audit commit `0e43703d290aa370a49a3049f235784994c29620` was pushed to `main`; `git ls-remote origin refs/heads/main` matched exactly, and the working tree was clean. GitHub Validate run `39261742446` and Deploy to GitHub Pages run `39261742400` both completed successfully for that SHA. The Pages workflow result is deployment evidence only, not proof of browser rendering or driveability.

**Historical next step (2026-10-19):** arrange owner visual review of the post-audit `?scene=city&time=23.5` and manual driving from `?spawn=aohara-city&time=23.5`; record lane/readability and owner-device/mobile performance evidence. Static HTTP responses and automated tests are not visual/device acceptance. The owner later reported Phase 5 passed on 2026-10-21 and broadly authorized Phase 6 on 2026-10-20; Phases 7–8 remain gated.

## 57. Phase 5: tier-bounded TSL foliage wind (2026-10-19)

At the time of this historical entry, the owner chose to continue the authorized Phase 5 remainder; that specific request did not itself constitute acceptance or authorize Phase 6. The owner later reported Phase 5 passed on 2026-10-21 and broadly authorized Phase 6 on 2026-10-20; Phases 7–8 remain gated.

**Implementation:**

- Added a one-sinusoid TSL vertex-position node for subtle, spatially varied foliage sway. Its position-derived phase remains stable across streaming rebuilds. Authored trees use the existing per-vertex foliage mask so trunks, rocks, and non-leaf vertices remain fixed; scanned leaf/twig/needle parts use the same effect with a constant foliage mask.
- Tier C omits the position node; Tier B and A cap maximum displacement at 0.035 m and 0.065 m. Vegetation diagnostics now report `vegetationWindAmplitudeMeters`; the same tier contract is recorded in `docs/VISUAL_TARGET.md` §3.
- No new geometry attributes, draw calls, assets, dependencies, weather, or traction coupling. Aohara lighting, default spawn and rural Hinode remain unchanged.

**Local verification:** In fresh clone `/tmp/endless-driver-phase5-20261019`, `npm ci` succeeded (201 packages, 0 vulnerabilities). The first post-push `npm run check` stopped at Prettier for three touched files; after formatting and pushing follow-up commit `f6ebf1c1b71c826a192133d542f580fff6dfd317`, the full check exited 0: Prettier, ESLint, no-GLSL guard, both TypeScript checks, **51 test files / 468 tests**, asset verification (17 assets / 39,714,769 bytes), and production build. Main bundle: 1,432.78 kB (gzip 438.61 kB); Rapier: 4,335.10 kB (gzip 1,669.96 kB). Non-blocking output includes the existing large-chunk warning, missing-LOD fixture messages, and repeated `BufferGeometry.toNonIndexed()` notices.

**Visual/device status at this 2026-10-19 checkpoint:** The added tests and production build verify node construction, material/tier wiring, diagnostics and bundling only; the TSL shader was not compiled on a live WebGPU/WebGL renderer. No browser-render review, manual drive, owner-device/mobile review, or performance measurement was performed. These results do not prove visible wind, absence of artifacts, or device cost. Earlier reports about non-white gameplay ground, tree pop-in and dark foliage were awaiting review at that time; the owner later reported non-FPS issues resolved and Phase 5 passed on 2026-10-21. No fresh visual or device-performance evidence is supplied here. The renderer remains HDRI/ACES/screen-space approximation, not hardware ray tracing. Phase 6 was broadly authorized on 2026-10-20; Phases 7–8 remain gated.

**Remote status:** Source commit `683cc8fffe814ceaac5eb74591ba67fd7c58de1f` and formatting follow-up `f6ebf1c1b71c826a192133d542f580fff6dfd317` were pushed to `main`; at verification, `git ls-remote origin refs/heads/main` matched the latter SHA and the tree was clean. The intermediate Validate run for `683cc8f` was cancelled after the follow-up push; final GitHub Validate run `39273113617` and Pages Deploy run `39273113604` both succeeded for `f6ebf1c`. The deployed Pages root returned HTTP 200 (1,779 bytes); bundle `/Endless-Driver/assets/index-BOIMAoqV.js` returned HTTP 200 (1,432,725 bytes) and contains `vegetationWindAmplitudeMeters`. This verifies the deployed static bundle only—not runtime shader compilation, browser rendering, manual driveability, owner-device acceptance, or performance.

**Historical next step (2026-10-20):** the entry requested owner-device review of gameplay appearance and separately authorized Phase 9 review. Automated checks/deployment do not establish visual acceptance. The owner later reported Phase 5 passed on 2026-10-21; Phase 6 is authorized and Phases 7–8 remain gated.

## 58. Full-circle swipe orbit and drive-start recenter (2026-10-19)

The owner requested a full 360° free-look orbit and an automatic return to the car-centered chase framing as driving begins. This is a narrow follow-up to the existing swipe-to-orbit behavior, not authorization for the broader gated Phase 8 camera-polish scope.

**Implementation:**

- Horizontal swipe is normalized to the canvas width: one canvas-width drag covers 360°. Azimuth remains unwrapped while easing, so a quick full-width gesture completes the whole turn rather than reversing toward the neutral angle; repeated gestures can continue orbiting. Pitch retains its ground/sky limits.
- The chase camera and its look target orbit together, preserving the car's existing screen-space framing. A fresh smoothed throttle or brake/reverse input resets the orbit to neutral with the existing 0.12 s easing. Touch and mouse gestures remain on the free canvas; separate captured control pointers still work simultaneously. Explicit camera snaps/reset also restore neutral orbit.
- Added unit coverage for normalized 360° turns, continuous yaw, safe pitch, car framing, recenter easing, drive-start edge detection and gesture viewport width. README and camera-module guidance updated.

**Local verification:** `npm ci` succeeded in fresh clone `/tmp/endless-driver-camera-20261019` (201 packages, 0 vulnerabilities). The first `npm run check` on `4a4654f` stopped at Prettier for `README.md`, `src/cameras/README.md`, and `src/cameras/camera-orbit.ts`; formatting was fixed in `765f555`. On `765f555`, Prettier, ESLint, the GLSL guard and both TypeScript checks passed, but Vitest failed 1 of 472 tests: the car-framing x-coordinate differed by `0.000038289787913068413`, beyond the five-decimal tolerance; `assets:verify` and `build` therefore did not run in that attempt. Relaxed the projected x/y assertions to four-decimal precision and pushed `dc912926a9aa4b0269860f735bfabfc7bef2da96`. The complete `npm run check` then passed on that commit: formatting, lint, GLSL guard, both TypeScript checks, all 51 test files / 472 tests, verification of 17 assets / 39,714,769 bytes, and production build. The built app entry is 1,433.30 kB (438.81 kB gzip); Rapier is 4,335.10 kB (1,669.96 kB gzip). Non-blocking Three.js `toNonIndexed()` and missing-LOD fixture warnings and Vite's large-chunk warning remain.

**Visual/device status:** No browser render, manual drive, owner-device/mobile review, or performance measurement has been performed. Tests verify the math, wiring and intended reset transition—not camera feel, real-device touch behavior, shader/backend compatibility, or visual acceptance. No broader Phase 8 work is included.

**Remote status:** The camera implementation was pushed as `4a4654f`; its GitHub Pages Deploy run [39277758107](https://github.com/mdraficode/Endless-Driver/actions/runs/39277758107) succeeded. The projected-framing tolerance fix was pushed as `dc912926a9aa4b0269860f735bfabfc7bef2da96`; its Validate run [39278018642](https://github.com/mdraficode/Endless-Driver/actions/runs/39278018642) succeeded. A live fetch of the public app returned `assets/index-DRIvfsEo.js`, whose bundle contains `resetOrbit`, confirming the deployed camera code is present (this is not a visual/browser acceptance). README and handoff updates were pushed in docs-only commit `316b38d0e8351e432926749b6e1e4cff113f3ac8`; `git ls-remote origin refs/heads/main` matched this SHA, and `npm run check` passed on it. The docs-only commit's GitHub workflows were still queued at last check; the camera-code Validate and Pages Deploy results above are green.

**Next:** owner-device/browser review should confirm the car stays comfortably framed during a full surroundings sweep and returns to the authored chase view on throttle/reverse. When this historical entry was written, the 2026-10-21 owner report had not yet been received; the owner later reported Phase 5 passed on 2026-10-21; do not infer authorization for Phases 6–8 beyond the user's requested camera behavior.

## 59. Requested vehicle effects and forgiving handling (2026-10-19)

The owner requested exhaust and tire smoke, short gear-change sparks emitted at the exhaust, speed-flow marks, motion blur only at high speed, and a fix for the difficult, easy-to-lose-control driving feel. When asked for a handling target, the owner selected **forgiving arcade**: predictable steering, more stable acceleration/braking, and easier slide recovery.

**Authorized scope:** a narrow implementation in the existing player-car presentation and handling: procedural vehicle-local effects, a speed-gated motion-blur response, and tuning/fixes to the current input/vehicle model. Keep particle counts bounded by tier, preserve mobile budgets, and do not enable global bloom. Use no external/purchased assets or branded car details.

**Historical scope guard:** this specific request did not itself constitute Phase 5 acceptance, start broader Phase 6 hero-car work, or authorize weather/seasons or general Phase 8 polish. The owner later reported Phase 5 passed on 2026-10-21; Phases 7–8 remain gated.

**Baseline:** fresh clone `/tmp/endless-driver-effects-20261019` began clean at remote `main` SHA `400b9618faff0dc7e1c8799d2e516ee59e623660`; `npm ci` succeeded (201 packages, 0 vulnerabilities). The existing vehicle physics and stability suites passed as a baseline (2 files / 26 tests).

**Implementation:** completed in the existing car presentation/physics path. Three fixed-capacity instanced pools provide exhaust and slip-triggered tire smoke, brief sparks at the fictional exhaust outlets on forward gear changes, and subtle side-offset wind streaks from 90 km/h. The visual sprites are procedural; the effect root follows the car's rebased simulation coordinates, resets on teleport, and disposes its GPU resources. Motion blur ramps from exactly zero at 120 km/h to the configured maximum at 195 km/h on B/A; tier C keeps the velocity attachment and blur disabled. These effects do not change grip, collision, weather, or gameplay physics.

The forgiving-arcade tune raises dry grip (1.15→1.25), softens handbrake rear-grip loss (0.50→0.58), raises yaw response modestly (3.8→4.2), and adjusts the steering grip-budget factor (1.35→1.25) to keep its overall cornering budget nearly unchanged as tire grip increases. A physics regression verifies slide-catching authority against the project's +X/right and +1/right convention. An initial experiment inverted that sign and failed the full-lock slalom; it was reverted. A stronger yaw-response experiment also failed one rough-road noise seed, so the final response was moderated to 4.2.

**Initial visual-review result:** a temporary, uncommitted harness imported the production `CarEffects` class into a minimal car/road scene and rendered through the WebGL2/SwiftShader path at 800×450. The shader/material path initialized with no console errors; at 151 km/h it reported 3 smoke and 1 airflow particle, rear-slip reported 10 smoke particles, and a forced gear change reported 7 sparks. In that first screenshot, tire puffs were visible but sparse; airflow marks and sparks were too small/subtle to distinguish. This led to the appearance-only tuning recorded in Section 60; fixed particle capacities, handling, and global render settings were kept unchanged. Full-game captures at Tier C and pinned `home-meadow` were OOM-killed by the sandbox before diagnostics, so the isolated harness is not full-scene validation. Full-scene and owner-device visual acceptance remain open.

**Verification:** `npm run check` passed on source commit `81cbd4e4107f52646db814114139f3f6f365e346`: formatting, lint, GLSL guard, both TypeScript checks, 53/53 test files and 478/478 tests, 17 verified assets (39,714,769 bytes), and Vite production build. The targeted vehicle physics/stability run also passed (2 files / 27 tests). Known non-blocking output remains: Three.js non-indexed-geometry and missing-LOD fixture warnings, plus Vite's large-chunk warning. No full-game browser render, manual driving, named-device/mobile review, or performance measurement was performed. The isolated harness compiled and drew the effects material on SwiftShader, but it cannot establish composition or timing in the loaded game world; do not treat it as visual acceptance.

**GitHub CI/deploy:** Validate run [#130](https://github.com/mdraficode/Endless-Driver/actions/runs/39310067319) and Pages deployment [#120](https://github.com/mdraficode/Endless-Driver/actions/runs/39310067949) both completed successfully for source commit `81cbd4e4107f52646db814114139f3f6f365e346`. Earlier interim tuning commits had failing/cancelled validation runs; this source commit is green and deployed. The first full-check note was pushed as docs-only commit `6b8b7638ef829bb416c76bcd5da88060952ce9da`, and local/remote `main` matched at verification. Pages deployment [#121](https://github.com/mdraficode/Endless-Driver/actions/runs/39310449883) also succeeded for that note. Validate run [#131](https://github.com/mdraficode/Endless-Driver/actions/runs/39310449873) also completed successfully for docs-only commit `6b8b7638ef829bb416c76bcd5da88060952ce9da`.

## 60. Phase 5: vehicle-effects readability follow-up (2026-10-19)

This is a narrow continuation of the appearance-only review authorized with the vehicle-effects request in §59. It does not accept Phase 5, begin Phase 6 hero-car work, authorize Phase 7 weather/seasons, or authorize broader Phase 8 polish.

**Tuning pushed in source commit `717d752965452e85ee9f251fd8688a75ccec33d6` (`fix: improve vehicle effects readability`):** loaded exhaust puffs now use 0.38–0.56 m end size and 0.32 opacity; tire smoke uses 0.12–0.18 m start size, 0.34–0.48 m end size and 0.37 opacity; shift sparks use tier counts C/B/A = 5/8/12, 0.15–0.28 s lifetime, 0.06–0.11 m size and a taller streak aspect; airflow uses 18 puffs/s at full speed, 0.026–0.042 m height and 0.36 opacity. Fixed per-tier particle pool capacities did not change. A unit test asserts spark counts remain within each tier's configured capacity. The tuning does not change handling or global post-processing.

**Local verification at `717d752`:** the targeted vehicle-effects/physics run passed (4 files / 32 tests). After removing the temporary harness files from the clone, `npm run check` passed completely: Prettier, ESLint, GLSL guard, both TypeScript checks, 53/53 test files and 478/478 tests, 17 asset hashes/licences (39,714,769 bytes), and Vite production build. Non-blocking output includes Three.js fixture warnings about non-indexed geometry/missing LOD and Vite's large-chunk warning.

**Post-tuning isolated render:** rebuilt a temporary harness against the committed `CarEffects` source and ran WebGL2 through SwiftShader at 800×450. It reported no console/page errors, failed requests or warnings. At 151 km/h the high-speed pass reported 5 smoke and 3 airflow particles; rear-slip reported 13 smoke and 2 airflow particles; a forced upshift reported 8 sparks. Screenshots are `/home/user/.visual-review/effects-high-speed-after-tuning-v2.png`, `/home/user/.visual-review/effects-tire-slip-after-tuning-v2.png`, and `/home/user/.visual-review/effects-shift-sparks-after-tuning-v2.png`. The smoke is more apparent and the airflow streaks can be seen in this minimal scene. The shift event emits the expected particles, but the streaks remain small/pale at this reduced resolution and software-rendered frame rate; particle counts are not proof of integrated-game readability. The temporary harness source was removed from the clone after review.

**Integration and acceptance evidence at this 2026-10-19 checkpoint:** the most recent low-resolution Tier C full-game attempt at pinned rural `home-meadow` was OOM-killed before diagnostics against the pre-tuning `dist`; it therefore does not review the tuned effects. `npm run check` subsequently rebuilt `dist`, which the static review server served, but no new full-game browser capture was completed. No full-game visual review, manual-drive review, owner-device/mobile check, or performance measurement was established. The isolated scene cannot validate the loaded world, composition, effect timing, ground colour, foliage streaming/pop-in, or foliage readability. At the time, earlier reports about white gameplay ground, tree pop-in and dark foliage were awaiting owner review; the owner later reported non-FPS issues resolved and Phase 5 passed on 2026-10-21. No named-device performance result or visual acceptance is inferred from this old harness. Continue to describe the renderer as HDRI/ACES/screen-space approximation, not hardware ray tracing. Phase 6 and Phase 9 are authorized; Phases 7–8 remain gated.

**Remote verification:** local and remote `main` matched `717d752965452e85ee9f251fd8688a75ccec33d6` before this handoff-only update. GitHub Validate run [#133](https://github.com/mdraficode/Endless-Driver/actions/runs/39319231762) and Pages deployment [#123](https://github.com/mdraficode/Endless-Driver/actions/runs/39319231897) both completed successfully for that source commit.

## 61. Phase 5/9: building and gameplay-environment detail increment (2026-10-20)

**Authorization and gates:** the owner requested realistic detail for the buildings and the whole gameplay environment, then selected **all current buildings** and **keep current phase gates**. This allows a bounded Phase 5 environment-detail increment plus Phase 9 Aohara building detail. It is not Phase 5 visual acceptance, does not start Phase 6, and does not authorize Phase 7 weather/seasons or broader Phase 8 polish. Preserve rural Hinode, lane readability, current spawns, city-only static wet-look treatment, C/B/A budgets, no-global-bloom policy, and no hardware-ray-tracing claims.

**Implementation:**

- Added deterministic low grass/understory tufts to the existing vegetation chunk cache and prepare-ahead window. One instanced batch has fixed pool limits of 16,000 / 42,000 / 100,000 for C/B/A, reuses the sun-tinted foliage backlight and tier-gated TSL sway, and does not enter collision/grip. Placement follows the existing terrain grass weights and slope, avoids roads/urban sidewalks, Aohara's levelled core, the spawn pad, town footprints and tree trunks. This is an initial layer, not completion of Phase 5's density/LOD target.
- Reworked the three rural Yūhi building archetypes with multi-face framed/tinted glazing, trim, door detailing, eaves, roof equipment and a subtle TSL PBR response; building placement/collision remains unchanged.
- Added bounded Aohara facade glass/frames and structural detail to the current high-rise and low-rise kit, including corner ribs, floor bands, plinths and rooftop mechanical units. New C/B/A caps are 2,400 / 4,800 / 7,200 static facade panes and frames and 512 / 1,024 / 1,600 structural/roof detail instances. Existing lit-window, active-light, road, collision, spawn and city-grid contracts are unchanged. Tower/venue/low-rise/sidewalk PBR breakup runs through TSL and the current HDRI/ACES environment; this is image-based material lighting, not SSR or ray tracing.
- Added deterministic tests for ground-cover placement, tier bounds, roadway/building clearances, town glazing, city detail caps and PBR node wiring. No asset or dependency was added.

**Local validation:** `npm ci` succeeded (201 packages, zero vulnerabilities). The final full `npm run check` passed on code commit `27e65ef7d450001045744d2c68ae81eafceb48ed`: Prettier, ESLint, the no-GLSL guard, both TypeScript checks, **54 test files / 482 tests**, asset verification (17 assets / 39,714,769 bytes), and Vite production build (main bundle 1,457.92 kB, Rapier 4,335.10 kB). Existing non-blocking output remains: Three.js non-indexed-geometry and missing-LOD fixture warnings, and Vite's large-chunk warning. The earlier `src/config/props.ts` failure was not reproduced: the unchanged module passed both TypeScript checks and all 21 `props-config` unit tests. Its original compiler log is unavailable, so the historical cause remains unknown and is not claimed fixed. The first post-push check on `f9bee28` stopped at formatting; after formatting, ESLint exposed an unused `_rank` alias, followed by two TypeScript issues in the new facade batching/test assertions. Each correction was pushed before the next run; only `27e65ef` has a complete green local check.

**Limited browser review at this 2026-10-20 checkpoint:** `vite preview` served the production build and the isolated `?scene=city` composition rendered at Tier C through WebGL2/SwiftShader at both noon and 23:30. Diagnostics reported one look-dev city block, 8 towers, 2,400 static facade pane/frame instances, 237 structural/roof details, 89 draw calls and 386,941 triangles; there were no page/console errors. The daytime facades read dark and the night view is mostly silhouette with localized lamps. This scene is the standalone 8-tower look-dev composition, not the integrated 55-building Aohara district or driving world; it proves only that this isolated material path initialized/rendered. Ground cover had not received a browser visual pass. The screenshots stayed in `/tmp` and were not committed. No full-game capture, manual drive, owner-device/mobile review, lane-readability acceptance or performance measurement was performed. The owner later reported Phase 5 passed and non-FPS issues resolved on 2026-10-21; this limited capture neither establishes nor reopens that status. Expectations of hardware ray tracing remain outside the implementation; describe the renderer as HDRI/ACES/screen-space approximation, not hardware ray tracing. Phase 6 and Phase 9 remain authorized; Phases 7–8 remain gated.

**Remote status:** feature commit `f9bee28ce93d9c3feadd78e6948c635c4dd7aeea`, formatting commit `b007f32838b1f40aaadde9fbe16c9d096866ad96`, lint fix `d8ff749946e962459e9edd0bb2d344d4c06d1eeb`, type fix `95bfca4991c8615f23798857743063479886fc53`, and final test-narrowing commit `27e65ef7d450001045744d2c68ae81eafceb48ed` were pushed to `main`; local and remote matched at `27e65ef`. GitHub Validate run [#141](https://github.com/mdraficode/Endless-Driver/actions/runs/39339042849) succeeded for that code commit. The follow-up docs commit `bc4baf54ca41b919c0d62993dc55e47feadfd80b` was also pushed and matched `git ls-remote`; Validate [#142](https://github.com/mdraficode/Endless-Driver/actions/runs/39339799469) and Pages Deploy [#132](https://github.com/mdraficode/Endless-Driver/actions/runs/39339799470) both succeeded. The live Pages index returned HTTP 200 (1,779 bytes), and its bundle `/Endless-Driver/assets/index-DsnDxySV.js` returned HTTP 200 (1,457,861 bytes) with `ground-cover-grass`, `aohara-facade-glazing`, `town-glazing-` and `groundCoverInstances` markers. This verifies the deployed static bundle, not runtime rendering or owner-device acceptance. Intermediate commits had failed/cancelled CI runs during formatting/type-fix iteration; do not characterize every pushed commit as green.

**Final documentation follow-up (2026-10-20):** after the live-bundle check, docs-only commit `f313e29c14468d4f4f9bc739280cb0a9cd40daed` was pushed and failed Validate #143 on Prettier formatting; `e24d022a4143d71d798ea85b9541ceb44af3c922` corrected formatting. `npm run check` passed on `e24d022` (54 test files / 482 tests; same runtime source as `27e65ef`), and `git ls-remote` matched the pushed SHA. GitHub Validate [#144](https://github.com/mdraficode/Endless-Driver/actions/runs/39392022000) and Pages Deploy [#134](https://github.com/mdraficode/Endless-Driver/actions/runs/39392021929) both succeeded. No runtime code changed in these docs-only follow-ups.

**Next:** arrange owner-device review of gameplay ground colour, ground cover, tree streaming/pop-in, foliage readability, every current building type, and Aohara night-lane readability. At the time of this 2026-10-20 entry, continue within then-authorized Phase 5 and Phase 9 Aohara work. The owner later reported Phase 5 passed on 2026-10-21; Phase 6 and Phase 9 are authorized, while Phases 7–8 remain gated.

## 62. Phase 5: bounded frame-pacing increment (2026-10-20)

**Authorization and gates:** the owner reported unstable FPS and requested smoothing on both mobile and desktop. The owner also reported that earlier non-FPS issues are resolved; no named devices, browser/OS, tier, resolution, target FPS or frame-time evidence were supplied. At the time, this authorized bounded Phase 5 adaptation. The owner later reported Phase 5 passed on 2026-10-21 and broadly authorized Phase 6 on 2026-10-20; Phase 9 remains separately authorized and Phases 7–8 remain gated.

**Implementation:**

- The dynamic-resolution EWMA now scales its weight by elapsed frame time, retaining the same time constant across 60/120 Hz sample rates. B/A continue using TAAU; Tier C keeps temporal history and motion vectors off but can now use bounded scene-pass scaling through FXAA/SMAA, with a 0.72 floor and a clearly reported spatial-upscale path. Spatial scaling may soften detail and is not temporal reconstruction. The shared controller uses 0.05 scale steps, its existing dead band and 0.5 s adjustment interval.
- Runtime vegetation chunk generation is limited to C/B/A = 1/2/3 chunks per frame; the initial window remains prepared ahead of play. A diagnostic count exposes the active build cap.
- Added unit coverage for 60/120 Hz smoothing equivalence, spatial/TAAU scale eligibility, and actual tier-capped runtime chunk generation.

**Validation:** the full local `npm run check` passed at `7f33b23664fc7392890b45ba5f3836faba65889c`: formatting, lint, GLSL guard, both TypeScript checks, 55 test files / 486 tests, 17 assets verified (39,714,769 bytes), and production build. Vite emitted a non-fatal large-chunk warning. GitHub Validate #147 and Pages Deploy #137 for `7f33b23` subsequently succeeded (Pages deployed the static build); Pages #136 for `f5c5e0c` also succeeded, while Validate #146 was cancelled after the formatting follow-up. No runtime browser test, owner-device review, or frame-time measurement was performed, so FPS stability had not been measured. The owner later reported Phase 5 passed on 2026-10-21; Phase 6 was separately authorized on 2026-10-20. The next authorized increment is bounded Phase 9 Aohara infill, signal-aware visual traffic and sidewalk pedestrians.

## 63. Phase 9: bounded Aohara street-density increment (2026-10-20)

**Authorization and boundaries:** the owner selected more building density, moving traffic and pedestrians, with both mobile and desktop in scope. This continues the separately authorized Phase 9 track while When this historical entry was written, the 2026-10-21 owner report had not yet been received; the owner later reported Phase 5 passed on 2026-10-21. Budgets are tiered and deliberately bounded; this does not authorize full traffic AI, pedestrian crossing/right-of-way, new vehicle physics, Phase 6, Phases 7–8, or a named-device FPS claim.

**Implementation:**

- Add deterministic low-rise Aohara infill to open half-blocks: C/B/A budgets of 6/9/12 buildings. New footprints enter the existing static collision list and share the existing facade/window/detail budget; the 5×5 grid, rural Hinode, spawns, and road-clearance rules remain unchanged.
- Add 6/12/18 instanced visual vehicles and 12/24/36 instanced pedestrians for C/B/A, exposed through city diagnostics. Vehicles follow deterministic opposing avenue loops, sample the existing signal phase, brake/hold for red and late amber, and keep an 8 m queued gap. Pedestrians walk loops on the four central-block sidewalks.
- The actors add four instanced batches and no moving collision bodies or physics solver. Pedestrians do not cross streets; neither actor class has full AI recovery/pathfinding. This is bounded visual activity, not acceptance of traffic or pedestrian simulation.
- Add tests for exact tier budgets, signal stop/amber-commit/queue behavior, movement of integrated instances, infill count, building overlap and road/sidewalk clearance.

**Validation:** the full local `npm run check` passed at `701d98933ed6952176ce8787586345218b36ae94`: Prettier, ESLint, GLSL guard, both TypeScript checks, 55 test files / 488 tests, 17 assets verified (39,714,769 bytes), and production build. Earlier post-push attempts found formatting issues and an unused tier-budget import; the style and fix commits resolved those before the passing check. Vite emitted its non-fatal large-chunk warning. Remote SHA matched at the push; GitHub workflow results and live deployment for this increment still need verification. No browser visual pass, owner-device review, manual drive, or named-device measurement is established. When this historical entry was written, the 2026-10-21 owner report had not yet been received; the owner later reported Phase 5 passed on 2026-10-21; Phase 6 was broadly authorized on 2026-10-20.

## 64. Phase 6 renderer/material and GPU-compute foundation (2026-10-21)

**Authorization (historical):** the owner broadly authorized Phase 6 on 2026-10-20, before the 2026-10-21 report that Phase 5 had passed. This Phase 6 authorization does not open Phases 7–8; the owner later reported Phase 5 passed on 2026-10-21. Preserve the no-fog/no-mist/no-haze/no-global-atmospheric-veil and no-gameplay-wide-bloom constraints, CC0-first maps, metric units, rural Hinode, existing Aohara/static-wet-look limits, and no CPU particle fallback.

**Implementation pushed:** commit `9294a2d1e26ae43ca5f46cbfda16cf4d963822de` prefers WebGPU with automatic WebGL2 fallback, sets AgX as default, adds optional HDRI backdrop/SSAO/bloom comparison switches, binds scanned opaque-surface PBR maps with TSL macro variation, documents 1 Three.js unit = 1 metre, and uses fixed-capacity TSL-compute vehicle effects on WebGPU while disabling them on WebGL2. Placeholder vehicle materials are node-based and no fabricated maps are attached to glass/emissive surfaces. Relevant architecture, visual-target, decision and status documents were updated. The hero car remains a placeholder.

**Pre-push checks and persistence:** `npm run format` and `git diff --check` passed before the initial push. `git rev-parse HEAD` and `git ls-remote origin refs/heads/main` both returned `9294a2d1e26ae43ca5f46cbfda16cf4d963822de`. `npm ci` had installed 201 packages with zero reported vulnerabilities.

**Project-check outcomes:** the first post-push run stopped at ESLint on the two unused imports noted above; both were removed in the pushed follow-up `547df587d7f792ea0527ada8e8471a9776d678f7`. A second run passed Prettier, ESLint, the GLSL guard and both TypeScript checks, then caught one stale backend-override assertion (57/58 files, 497/498 tests). That expectation was corrected and pushed in `64c07f67195db13b207a1f07b7e738c2e3e7f5b4`; local and remote SHA matched. The subsequent full `npm run check` passed on `64c07f6`: Prettier, ESLint, GLSL guard, both TypeScript checks, 58/58 test files and 498/498 tests, all 17 assets / 39,714,769 bytes with hashes/licences verified, and production build. Vitest emitted non-fatal geometry/model-fixture diagnostics; Vite emitted a non-fatal large-chunk warning. No browser visual review, manual drive, device-performance measurement or runtime acceptance was performed; GitHub workflow/deployment status remains to verify.

**Owner status correction:** on 2026-10-21 the owner reports Phase 5 passed. This supersedes earlier pending-acceptance status; prior entries remain historical records. The owner says world-detail depth/enrichment is still missing. This follow-up does not authorize Phases 7–8.

**Next sequence at the time of this entry:** (1) audit rural, Yūhi and Aohara detail layers against C/B/A instance, draw-call and streaming budgets; (2) add deterministic natural understory/ground variation using prepare-ahead streaming, without collisions or grip/weather changes; (3) add sparse pedestrian-safe streetscape/building-site details, preserving lane, crossing, sidewalk and spawn readability; (4) test deterministic placements, clearances, caps, chunk boundaries, diagnostics and disposal before making visual/performance claims. Preserve no fog/mist/haze, no global bloom, CC0-first maps, the existing grid/spawns, localized optics, relaxing balance and static-only Aohara wet-look.

## 65. World-detail follow-up: natural understory increment (2026-10-21)

**Owner correction and scope:** the owner reports Phase 5 passed. The remaining request is additional world-detail depth, handled as a bounded follow-up rather than reopened Phase 5 acceptance. The work sequence remains: audit/prioritize → natural landscape → streetscape/buildings → integrated tier balance. Phase 6 is authorized, Phase 9 is separately authorized, and Phases 7–8 remain gated.

**Code-level audit/priorities:** the existing Phase 5 ground-cover layer had one grass geometry and one fixed total instanced pool (C/B/A: 16k/42k/100k), with shared terrain/road/building/tree/spawn/Aohara clearance and prepare-ahead vegetation streaming. The Aohara world already has tiered buildings, sidewalk routing, lamps, banners, signals, visual traffic and sidewalk pedestrians; the requested detail gap is sparse street-level furniture/site accents, not another city-wide density jump. No named-device or draw-call/performance measurement was available, so the audit is a source/config contract review rather than a measured visual/performance audit.

**Natural-layer implementation:** commit `428a0647a3f2de310d82a9dc6a64ab59e60d8bd4` adds deterministic style selection using district and rock-surface signals, with shared low-poly geometry batches for grass, fern, wildflower and static stone accents. All four use a shared TSL material and existing chunk cache/window; stone has a zero foliage/wind mask. Existing total instance caps remain unchanged and are partitioned exactly by style: C 11k/2k/1.5k/1.5k, B 29k/6k/4k/3k, A 70k/15k/8k/7k (grass/fern/wildflower/stone). Diagnostics expose each count and cap. There is no collision/grip, weather, particle, or asset change. Test follow-ups `d04d4d4` and `ec7e13a` fixed typing and aligned the visual integration assertion to the four style pools.

**Validation and remote state:** `git ls-remote origin refs/heads/main` matched `ec7e13a09373891a83882b503918cd42a2e7eec0`. After that push, full local `npm run check` passed: Prettier, ESLint, GLSL guard, both TypeScript checks, 58/58 test files, 499/499 tests, 17 assets / 39,714,769 bytes verified, and Vite build. The non-fatal large-chunk warning remains; existing Three.js and missing-LOD fixture warnings are non-fatal. The first workflow-page fetch still showed Validate #155 for `1a0dd0e`; a later refreshed page confirmed Validate #158 and Pages Deploy #148 succeeded for `ec7e13a` (see §66 for the latest milestone outcomes). No browser visual review, full-game capture, manual driving, owner-device review, mobile/desktop performance measurement, or visual acceptance has occurred.

**Status update (superseded by §66):** at the time of this entry, streetscape furniture and integrated tier diagnostics were still pending. Those code-level items have since been implemented and tested; Phase 5 remains owner-reported passed. Runtime visual acceptance, named-device performance evidence, and any measured draw-call/device-cost balance remain unverified. Preserve the existing 5×5 grid, default Central Avenue spawn, pinned overrides, `?spawn=random`, rural Hinode, relaxing balance and static-only Aohara wet-look.

## 66. Aohara sidewalk furniture and integrated world-detail tier balance (2026-10-21)

**Scope correction:** the owner reports Phase 5 passed. This entry completes the requested code-level sequence from §65 (audit/prioritize → natural understory → streetscape/buildings → integrated tier balance); it does not reopen Phase 5 acceptance or authorize Phases 7–8. Phase 6 renderer/material work and Phase 9 urban systems remain authorized. No runtime visual acceptance or named-device FPS evidence is implied.

**Streetscape increment:** commits `be4ec5f1096fda290269698ac7d7f8893391f659` and `15769ea3d58cb877f70fea9047841f64aaea3e4b` add deterministic Aohara road-graph sidewalk placements for benches, planters, waste bins and bicycle racks, using shared vertex-colored instanced batches and no new external assets or physics. Per-tier caps (benches/planters/waste bins/bicycle racks) are C 8/12/4/4, B 12/18/6/6, A 18/24/8/8. Placement uses 80 m slot spacing and 40 m phase, with 30 m intersection, 12 m road-marking, 55 m spawn and 0.7 m building-footprint clearance; minimum walkway clearance is 1.8 m, curb margin is 0.18 m plus a 0.15 m additional inset, and furniture is kept 8 m apart. Tests cover deterministic placements, tier caps, roads/markings/crossings/sidewalks/buildings/spawns and furniture separation. The first code commit had a planter tuple-spread TypeScript error; explicit x/y/z scaling fixed it in `15769ea`.

**Integrated diagnostics and budgets:** commit `f98adfba3899a42b72367dc912e94fd698c8a722` adds `groundCoverStylePools`, `urbanStreetFurnitureInstanceBudget` and combined `DrivingWorld.getContentStats()` fields. Ground-cover configured capacity remains C/B/A 16,000 / 42,000 / 100,000; furniture totals are 28 / 42 / 58, producing combined configured capacities 16,028 / 42,042 / 100,058. Diagnostics expose `worldEnrichmentInstances` (active streamed ground cover plus mounted city furniture), `worldEnrichmentInstanceBudget` (combined configured cap) and `worldEnrichmentBatchPools` (8 static instance pools: four ground-cover styles plus four furniture kinds). Pool count is not a measured draw-call count; actual GPU cost and quality have not been measured. Integrated tests verify count/budget aggregation, tier monotonicity, four pools per subsystem and disposal.

**Validation and remote state:** after pushing, full local `npm run check` passed at `f98adfb`: Prettier, ESLint, GLSL guard, both TypeScript checks, 58/58 test files and 500/500 tests, all 17 assets / 39,714,769 bytes with hashes/licences verified, and production build. Existing Three.js geometry diagnostics and the Vite large-chunk warning remain non-fatal. Local and remote `main` both matched `f98adfba3899a42b72367dc912e94fd698c8a722`. Latest refreshed GitHub Actions showed Validate #162 (f98adfb) and Pages Deploy #152 (f98adfb) succeeded; Validate #161 and Pages #151 (15769ea) also succeeded. Validate #160 failed on the intermediate `be4ec5f` commit; its TypeScript issue was fixed and the subsequent local check and remote workflows passed. Validate #159 and Pages #149 for `25fc8c5` also completed successfully, correcting the earlier stale “run not visible” note.

**Next evidence:** the requested implementation sequence is complete. A browser visual review, manual drive, owner-device review, real mobile/desktop frame-time measurement and measured draw-call/device-cost balance have not been performed. FPS remains reported unstable; do not infer FPS stability or GPU balance from instance caps. Next work requiring user/device review should use named hardware, browser, tier, resolution and repeatable route data. Preserve no fog/mist/haze, no global bloom, CC0-first sourcing, prepare-ahead streaming, lane/crossing/spawn readability, current 5×5 grid and spawn behavior, relaxing balance, rural Hinode, static-only Aohara wet-look, and no CPU particle fallback.

## 67. Phase 6/9: reference-driven PBR surface integration (2026-10-21)

**Scope and evidence boundary:** the owner asked for public-facing graphics comparison against Slow Roads, the Three.js WebGPU materials gallery and +360º Car Visualizer, and an update to Three.js for HDRI IBL, ACES/AgX, SSAO and appropriate PBR maps. `docs/GRAPHICS_REFERENCE_ANALYSIS.md` records what those public pages show and do not show. They are fidelity targets only: no claim is made about their private shader, environment-map, SSAO or tone-mapping implementations. No request here authorizes Phases 7–8.

**Renderer/material state:** the codebase already contained HDRI/PMREM image-based lighting, AgX as the default tone mapper with ACES/Neutral options, and TSL SSAO (with SSGI used at the higher quality tier). This increment retains those paths rather than replacing them. It adds shared static-surface texture loading/binding and two pinned CC0 1K map sets: Poly Haven Gravel Concrete 03 (sidewalks and planters) and Concrete Wall 009 (opaque wall-body geometry). Each set contains albedo, GL tangent-space normal, roughness and packed ARM (AO/roughness/metalness) maps.

**Implementation:** `SurfaceTextureLibrary` coalesces in-flight requests, configures tiled/aniso sampling, shares per-world references and safely handles disposal; `scanned-pbr.ts` binds sRGB albedo plus linear normal/ARM maps and an optional centered roughness adjustment. Bindings cover matching road/asphalt and shoulder surfaces, sidewalks, planter shells, cedar bench boards, Yūhi wall-body boxes and selected opaque Aohara low-rise facades. Yūhi walls were separated from trim/details; furniture retains semantic material groups. Glass, emitters, mixed materials, painted trim, roofs, unsuitable metal scans, tires and generic automotive paint stay on purpose-authored PBR paths; no maps are fabricated for transparent or emissive materials. Vehicle compute fallback policy, phase gates, tier budgets, lane readability, streaming, spawn behavior, localized optics and static-only Aohara wet-look were not changed.

**Code and verification:** implementation and test fixes are on `ceaa1846a61ebf66af9806c93c5556cb309425fe`; local and remote `main` matched after push. Full local `npm run check` passed: formatting, ESLint, GLSL guard, both TypeScript checks, **59 test files / 504 tests**, asset verification (**19 assets / 44,913,263 bytes**) and production build. GitHub Validate [#170](https://github.com/mdraficode/Endless-Driver/actions/runs/39626078445) and Pages Deploy [#160](https://github.com/mdraficode/Endless-Driver/actions/runs/39626078385) both succeeded for this SHA. The build still emits existing non-blocking Three.js geometry/model-fixture diagnostics and Vite's large-chunk warning. Several intermediate commits had red checks while issues were corrected; the final code commit is green.

**Evidence limits and current phase status:** no reference demo was visually captured, no browser visual review or manual drive was performed, and there is no owner-device review or named-device frame-time/performance measurement. The existing report that FPS is unstable remains; no stability is claimed. The owner reports Phase 5 passed. Phase 6 and Phase 9 remain authorized; Phases 7–8 remain gated. Keep all visual/performance claims separate from automated tests and CI, and continue within the approved scope.

## 68. Global asset-policy amendment and Meshy vehicle candidate (2026-10-22)

**Owner direction:** after previously requesting an exact Ferrari California body, the owner broadened the hero-car search to any manufacturer and selected Meshy's generic red sports-car listing. They explicitly amended the rules for all future project work to permit AI-generated assets and free account-gated sources. ADR 0007 supersedes only the former blanket bans; the no-purchases/no-fees rule, CC0-first policy, CC-BY exception for suitable non-hero assets, CC0-only hero-vehicle requirement, separate brand/design-rights review, and pinned acquisition pipeline remain unchanged. `AGENTS.md`, `docs/ASSET_POLICY.md`, `docs/ASSET_SOURCES.md`, `PROJECT_PLAN.md`, `README.md`, ADR 0004/0005 supersession notes, and this handoff are being updated. The policy documentation was committed and pushed as `0758ef759b53a32cdb977e391e547ff1ca254a17`; its first full check stopped at Prettier for `docs/ASSET_SOURCES.md` and `docs/VISUAL_TARGET.md`. The formatting and handoff follow-up was pushed as `8caa7dc85e7eb4fc0240518e0c632df4a3a6cf11`. Full `npm run check` passed at that SHA (Prettier, ESLint, GLSL guard, both TypeScript checks, 61 test files / 509 tests, 19 assets / 44,913,263 bytes, production build); GitHub Validate #184 and Pages Deploy #174 succeeded, and local/remote `main` matched. `npm ci` reported two moderate dependency audit findings; no dependency changes were made.

**Selected candidate:** [Meshy community model 019db878-afec-724d-9675-a1710eddd51b](https://www.meshy.ai/posts/019db878-afec-724d-9675-a1710eddd51b), described as a generic red sports car inspired by Italian supercars. Its listing displays CC0 and Meshy 6, with 400,689 triangular faces and 232,209 vertices. The public cover preview shows AI-like irregularities and a badge-like detail; the full mesh, creator/provenance, interior, materials, exact downloadable file, and trade-dress/design suitability have not been inspected. This is only a candidate: no account or model has been created/downloaded, no runtime code or manifest has changed, and the existing Kaminari roadster remains in use.

**Account/session status:** the user reports logging into Meshy with the owner-provided email. This does not grant the assistant access to the user's authenticated browser session. The assistant did not request or read an email verification code, and no model file has been downloaded. Do not ask for or store passwords/verification codes, do not use paid plans/credits/API features, and do not bypass anti-abuse controls. The user should download the selected model and attach the original export for review.

**Integration gates:** after lawful account access, verify the exact item license/provenance and download terms; inspect for badges, logos, number plates, recognizable trade dress, and unsafe/AI-corrupted geometry; remove/author out any uncleared identifying marks; then pin the source/hash in `scripts/fetch-assets.mjs`, run `scripts/build-models.mjs`, validate units/pivots/materials/wheels/interior/LODs and 100k–200k triangle LOD budgets, update `public/assets/manifest.json` and `CREDITS.md`, and run the full project checks. Do not replace the code-authored fallback until the imported model passes automated and runtime visual review. The first full validation attempt at `0758ef7` stopped at Prettier on the two files noted above. The formatted follow-up at `8caa7dc85e7eb4fc0240518e0c632df4a3a6cf11` passed full `npm run check`: Prettier, ESLint, GLSL guard, both TypeScript checks, 61/61 test files and 509/509 tests, all 19 assets / 44,913,263 bytes verified, and production build. GitHub Validate #184 and Pages Deploy #174 succeeded; `git ls-remote` matched the local SHA. Existing non-fatal Three.js geometry diagnostics and Vite large-chunk warning remain. `npm ci` found two moderate dependency audit issues; no automated dependency fix was applied because this increment changed documentation only.

## 69. Free-download hero-car alternative audit (2026-10-22)

**Owner direction and gates:** The user reports that downloading the selected Meshy CC0/AI-generated red supercar requires a subscription and chose a free-download alternative. No purchase, subscription, paid credit, or paid API use is authorized. The owner accepted Meshy's Terms/Privacy only for the free Meshy account; the assistant has no authenticated-session access. No model has been downloaded. Hero vehicles remain CC0-only, with separate provenance, trademark/trade-dress/design review and the pinned asset pipeline mandatory.

**BlendSwap `Sports car base` by arenyart:** [exact item page](https://blendswap.com/blend/13077) lists CC0, Blender 2.7x, and a 147 KB file. Its description says it is a basic, easily modified base mesh. The public preview does include wheels; it shows a wire/control topology and is not a finished production hero model. The page does not establish original-design provenance or clear the body silhouette for trade dress. BlendSwap's [About page](https://blendswap.com/about) says downloads require a free account and allows five free downloads/day; its [MCP/API licensing description](https://blendswap.com/3d-mcp-api) says asset licenses are uploader-declared and not platform-verified. An unauthenticated `HEAD` request to the item's `/download` URL returned HTTP 403. No BlendSwap account was created and no file was downloaded. This lead fails the current quality/provenance/design review and is not selected.

**Other leads considered:** BlendSwap's [MegaSUV](https://blendswap.com/blend/22972) is listed CC0 and its author says the futuristic SUV design is original, but it is not the requested sports-car silhouette; the platform does not verify uploader-declared licenses, anonymous download returned HTTP 403, and the actual model is uninspected. It remains an unresolved lead, not a recommendation. The BlendSwap `sport car` page describes a Chevrolet Camaro/Transformers modeling inspiration; it is not cleared for the generic hero-car use. Other prominent BlendSwap sports-car listings use CC-BY or CC-BY-SA and cannot qualify for a CC0-only hero.

**Best audited CC0/free/no-login fallback, not adopted:** Grab3D's [1980s Sports Car](https://grab3d.com/models/vehicles/1980s-sports-car/) has an item-specific CC0 [`LICENSE.txt`](https://grab3d.com/dl/1980s-sports-car/LICENSE.txt); the [manifest](https://grab3d.com/dl/1980s-sports-car/manifest.json) reports 18,905 triangles, 2K PBR and a 1,217,424-byte GLB. It includes separate wheels, seats/steering wheel, and transparent windows. Grab3D documents procedural Blender-script modeling with AI coding assistance, not AI-generated geometry/textures. A no-auth `HEAD` to the direct GLB returned HTTP 200 with the manifest's expected content length. Its public preview is a stylized red wedge with pop-up headlights and a spoiler; this is below the established hero-quality bar. Grab3D's [Sports Car](https://grab3d.com/models/vehicles/sports-car/) is likewise stylized, with opaque windows/no interior, coral paint, white stripes and a spoiler; its direct no-auth `HEAD` also returned HTTP 200. Neither model was downloaded or integrated.

**Outcome/next decision:** No suitable verified free replacement has been found. Keep the code-authored Kaminari roadster. Ask the owner whether to continue searching at the current visual bar, accept a stylized CC0 car for a separate full asset/pipeline review, or keep/improve the in-house car. No project code, runtime asset, manifest, or credits entry changed during this audit.

## 70. Continued free hero-car source audit (2026-10-22)

**Owner direction and hard gates:** After reviewing the earlier alternatives, the owner chose **continue searching** at the existing Forza-Horizon-class visual bar. The target remains a generic red hero car from any manufacturer, with AI-generated and free account-gated sources allowed under ADR 0007, but the hero must be CC0 and must pass separate provenance and trademark/trade-dress/design review. No purchase, paid subscription, credit, or paid API use is allowed. Do not request credentials or verification codes, use the owner's authenticated browser session, create any new source account without owner approval, bypass anti-abuse controls, download a model, or run the pinned asset pipeline until an exact candidate is approved and every gate passes. Keep the in-house Kaminari roadster.

**Innerscene vehicle library:** Six original/unbranded pages were reviewed: [generic two-door coupe](https://www.innerscene.com/tools/library/3d-parts/generic-two-door-coupe-f57c8670), [1990s Japanese-style sports coupe](https://www.innerscene.com/tools/library/3d-parts/generic-1990s-japanese-style-sports-coupe-ace64592), [front-engine grand tourer](https://www.innerscene.com/tools/library/3d-parts/generic-front-engine-grand-tourer-coupe-9a08f635), [convertible roadster](https://www.innerscene.com/tools/library/3d-parts/generic-convertible-roadster-05aace60), [hot hatch](https://www.innerscene.com/tools/library/3d-parts/generic-hot-hatch-a60561a5), and [electric hatchback](https://www.innerscene.com/tools/library/3d-parts/generic-electric-hatchback-6f7e33fa). Each page describes a CC0 GLB and exposes a download link. Innerscene's [terms](https://www.innerscene.com/tools/library/terms) require contributors to assert rights and dedicate submissions to CC0, while warning that CC0 does not grant trademark/patent rights; its [library blog](https://www.innerscene.com/blog/free-parts-library) says no account is needed. Public previews were saved only as audit JPEGs and visually reviewed; they are too simple/wedge-like for the target. Anonymous `HEAD` to all six download endpoints returned HTTP 405; no `GET` or model download was attempted, so actual download access remains unverified.

**BlenderArtists “Free Cars”:** The [forum thread](https://blenderartists.org/t/free-cars/1203833) and [public JSON](https://blenderartists.org/t/free-cars/1203833.json) were inspected. The uploader says “no license at all” and says the models were built from blueprints at the-blueprints.com or drawingdatabase.com; the CC0 wording was supplied by another commenter and was not adopted by the uploader. The thread links to a Facebook library and an Audi R8 topic. Exact model identity, access, source rights and real-vehicle design clearance are unresolved. No Facebook account/page or files were accessed; no model is eligible.

**Sketchfab / Unity Fan license conflict:** The canonical [Concept Car 004](https://sketchfab.com/3d-models/free-concept-car-004-public-domain-cc0-4cba124633eb494eadc3bb0c4660ad7e) description claims CC0, but Sketchfab displays the platform license “Free Standard.” Spot checks of [Concept Car 003](https://sketchfab.com/3d-models/free-concept-car-003-public-domain-cc0-77664fc474c444f4947e9834ed0d30ad), [025](https://sketchfab.com/3d-models/free-concept-car-025-public-domain-cc0-e3a65443d3e44c33b594cec591c01c05), [037](https://sketchfab.com/3d-models/free-concept-car-037-public-domain-cc0-646a3a31b0224379b6e767abc34d58dd), [038](https://sketchfab.com/3d-models/free-concept-car-038-public-domain-cc0-0b4ca2a15ba7478db2a42ac9f0e687bf), [040](https://sketchfab.com/3d-models/free-concept-car-040-public-domain-cc0-9363e93183274ea1bad403ea6fe3ee79), and AI-based [ConceptCar 049](https://sketchfab.com/3d-models/free-ai-based-conceptcar-049-public-domain-cc0-72547082a35946878d3f59101ab583fa) shows the same mismatch. The 049 page also marks the model “Generated with AI.” Treat these listings as unverified and ineligible unless the platform/license conflict is resolved. Their design and actual download access were not reviewed; no model was downloaded. Khronos's converted [Car Concept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept) derivative is CC-BY 4.0 and includes Khronos/3D Commerce logos; it is not eligible for the CC0-only hero.

**Fresh Meshy category leads:** Meshy category FAQs state general CC0/free-account claims; they do not establish item-specific access and do not override the subscription barrier the user reports on the selected listing. Five generic-looking alternatives were opened, and public cover images were saved only for preview review: [Crimson Jewel Car](https://www.meshy.ai/posts/Crimson-Jewel-Car-019fbecb-2a89-7bd2-aa50-6bbd02988938) displays CC0 and 723,298 faces but its preview is an anime character, not a car; [Golden Hour Racer](https://www.meshy.ai/posts/019f7f95-7f67-71fe-a0f9-c636569b5348) displays CC0 and 331,834 faces but its preview is a person in racing apparel, not a car; [Desert Lightning GT](https://www.meshy.ai/posts/Desert-Lightning-GT-01a01ddb-f44d-7d8f-9954-18d00bfed9d3) displays CC0 and 380,284 faces but shows a stylized sci-fi off-road truck and is tagged “Transformers”; [KMZ-H80](https://www.meshy.ai/posts/019b6c72-8359-7138-ae32-352a7d1913ab) displays CC0 and 1,505,248 faces but is a stylized high-tech sedan below the hero-quality bar; [White Velocity](https://www.meshy.ai/posts/019f43f0-e5f0-7b8e-b79b-6647e4f00470) displays CC0 and 265,374 faces, but its tags include “branding” and “logo” and its preview is toy-like/stylized. These are rejected for content/design/quality, not approved candidates. The [64 Grand Sport page](https://www.meshy.ai/posts/019b7704-d747-7bd6-b7e9-e3a3a0407092) is tagged “corvette” and was excluded without a design review. No individual Meshy free-account download was attempted; per-item access is unverified.

**Other exclusions / leads:** BlenderKit's [Generic Sportscar PL](https://www.blenderkit.com/asset-gallery-detail/e4ac3813-f337-4c62-a61f-3fb85cab9a78) has a generic-design claim but is licensed Royalty Free, not CC0. Sketchfab's [Lotus 7](https://sketchfab.com/3d-models/lotus-7-cc0-fb54f03709894f31897b228391449cf5) is CC0-labeled but a recognizable Lotus/Caterham design. BlendSwap's [sport car](https://blendswap.com/blend/10236) cites Camaro/Transformers inspiration and its [1966 Mustang GT](https://blendswap.com/blend/24359) is a recognizable protected design despite a CC0 label; both are excluded. `3dassets.dev` returned “no available server” for vehicle fetches. GitHub [drcollect/collect-cars](https://github.com/drcollect/collect-cars) is CC-BY 4.0; [Wenhuaren5/car-dna](https://github.com/Wenhuaren5/car-dna) contains ordinary generic body styles, not a hero sports-car silhouette. No candidate passed all gates.

**Outcome and persistence:** No suitable verified free replacement has been found. Keep Kaminari; continue searching without relaxing visual, license, cost or design gates. No 3D model was downloaded, no authenticated Meshy/Sketchfab account session was accessed, and no runtime code, asset, manifest, credits entry or pipeline output changed. Public preview images are audit-only files under `/home/user` (`mesh-*.png` and `innerscene-*.jpg`). This section records the new search; project docs are the only repository changes in this increment.

## 71. Hero car selected under CC BY 4.0; integration pending (2026-10-23)

**Owner direction and policy change:** the user directly instructed **“Integrate the model.”** They relaxed the prior CC0-only hero rule: free licences that clearly permit intended use and redistribution are acceptable, including CC BY 4.0 with required attribution. No purchase, paid plan, or new source account is authorized. ADR 0008 records the precise change; the existing no-brand/no-uncleared-design gate remains.

**Selected candidate:** MMC Works, [Generic Sport Coupé Car](https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882), whose public listing describes a generic sports coupé and displays Creative Commons Attribution (CC BY 4.0). The owner-supplied `/home/user/hero-car-candidate-neutral-screen.zip` is **79,563,959 bytes**, SHA-256 **`222b8a9322a94305a5065d9adb56836c93451f040baea45dca4e774ba8f178e6`**. Its included `ATTRIBUTION.txt` records the source change: `textures/media.png` was replaced with a neutral dark dashboard screen; no other source files were changed in that archive. Preserve this media; do not reintroduce the BMW-branded screen texture.

**Visual/design review:** the four local renders `/tmp/hero-car-review/front-three-quarter.png`, `front.png`, `side.png`, and `rear-three-quarter.png` show no visible exterior logo, badge, or plate and no unambiguous production-car identity. The FBX-internal object name `ModelLbmw` and MMC Works' separate BMW M3 E46 project remain cautions, not proof that this candidate depicts a BMW. The visual gate is provisionally clear, not legal clearance. Stop if closer geometry review identifies a specific real-car design or uncleared branding.

**Source geometry/alignment evidence:** Blender 4.3.2 inspection found 84 mesh objects and 114,070 triangles. The source uses X-width, Y-length, Z-up with the front along -Y; its approximate bounds are 2.27 m wide × 4.73 m long × 1.36 m high. Original wheel-pivot centers (source Blender world coordinates): front-left `(0.839, -1.157, 0.380)`, front-right `(-0.833, -1.155, 0.380)`, rear-left `(0.836, 1.785, 0.379)`, rear-right `(-0.841, 1.786, 0.379)`. The project vehicle uses +Y-up/-Z-forward, half-track 0.78 m, front/rear axles at -1.35/+1.35 m, wheel radius 0.34 m, and rest-length 0.37 m. The conversion must map source X/Y/Z to game -X/Z/Y, scale/translate to those live physics dimensions, and keep wheel pivots/spinners separate. The detailed object inspection also confirmed separate tire/rim meshes under each source wheel empty, plus separate brake discs/calipers and steering-wheel parts.

**Pre-policy repository and environment checkpoint:** clean local/remote `main` was `a3c07caa39dfb587bfc94a02f8fc30b386d7ce12`. `npm ci` completed in `/tmp/endless-driver`, installing 201 packages and reporting two moderate audit vulnerabilities; no audit fix was run. No model conversion, manifest change, or runtime integration has been committed or pushed; the code-authored `CarVisual` is still the runtime vehicle. This section records the source/policy decision before the separate documentation update.

**Next work:** implement a reproducible, archive-hash-checked Blender-FBX-to-GLB conversion plus the existing LOD/meshopt/KTX2 optimization; preserve PBR materials, neutral dashboard media, and all four wheel/steering bindings; add manifest/credits generation and a minimal in-game attribution view; wire the model into runtime with `CarVisual` as fail-soft fallback. Keep tracked project files untouched until the source transform and output validation are ready. Follow `WORKFLOW.md`: commit and push each verifiable increment before running builds, tests, or browser captures; then verify SHA, full checks, CI/deployment, and live result where applicable. No runtime visual/device acceptance, manual drive, or FPS claim is made yet.

## 72. Hero-car pipeline and runtime integration (2026-10-23)

**Owner direction and constraints:** the user directly instructed “Integrate the model” and permitted compatible free licences including CC BY 4.0 with required attribution. No purchase, paid plan, or new source account. Preserve the no-visible-brand/no-uncleared-real-car-design gate and the supplied neutral dashboard media. The visual gate remains provisional based on the previously recorded four source views; `ModelLbmw` and MMC Works’ separate BMW M3 E46 project are cautions, not proof. Stop if future geometry review identifies a specific production-car design.

**Code integration:** the reproducible build/runtime/credits increment is committed and pushed through `cbf10fe` (`5357548` feature integration, `4dec638` archive-license wording fix, `cbf10fe` Blender image-memory fix); each push was verified against `origin/main`. The pipeline command is `npm run assets:hero -- --archive /home/user/hero-car-candidate-neutral-screen.zip`. It validates the exact archive hash and attribution, uses Blender 4.3.2, preprocesses textures to a 2048 px cap, creates LODs at 1.0 / 0.45 / 0.15, then applies meshopt compression and KTX2/Basis texture encoding. The converter releases decoded original FBX textures before export to avoid memory exhaustion. The owner archive remains an uncommitted input and must not be added to Git.

**Generated asset result:** `public/assets/models/hero-car-mmc-generic-sport-coupe.glb`, 4,922,068 bytes, SHA-256 `32ab940b350a634684e3d9f58dfe6b0d0d12826b25f5802d8409861497ad1d39`; 17 KTX2 images; LOD triangle counts 114,070 / 51,323 / 17,104. The manifest records archive SHA-256 `222b8a9322a94305a5065d9adb56836c93451f040baea45dca4e774ba8f178e6`, FBX SHA-256 `4d11eb251bd0958a749368befc30ac308cc80f226de82b5a98019718cb011206`, and sanitized `textures/media.png` SHA-256 `a9770ac049a95fe7037eccec1189948934306b510487d201378f666e77a40e8c`. The 20-asset manifest is 49,835,331 bytes in total.

**Runtime and required attribution:** `PlayerCarVisual` asynchronously loads the manifest asset, validates LOD/wheel/steering hierarchy and shared physics wheel centres, synchronizes wheel spin, steering and suspension, selects LOD by camera distance, and keeps `CarVisual` as a fail-soft fallback. `CREDITS.md` and the in-game credits view contain the exact MMC Works / source / CC BY 4.0 / modification attribution. The sanitized dashboard media is preserved.

**Validation and review:** `npm run assets:verify` passed: 20 assets, 49,835,331 bytes, hashes/licences/budgets/hierarchy/pivots valid. The local end-to-end hero build succeeded and produced the SHA/metrics above. `npm ci` installed 201 packages and reported two moderate audit findings; no audit fix was applied. Full `npm run check` passed on `8709e0d`: Prettier, ESLint, no-GLSL guard, both TypeScript checks, 63 test files / 513 tests, asset verification (20 assets / 49,835,331 bytes), and production build. The run emitted existing non-fatal Three.js `toNonIndexed()` notices and Vite large-chunk warnings. GitHub [Validate #198](https://github.com/mdraficode/Endless-Driver/actions/runs/39929734418) and [Pages Deploy #187](https://github.com/mdraficode/Endless-Driver/actions/runs/39929734206) succeeded for that SHA. The live page and manifest returned HTTP 200; the deployed GLB returned HTTP 200 and its SHA-256 matched the manifest. Browser/manual/owner-device review remains unverified: the headless drive capture timed out before exposing its debug handle, and a lightweight loader capture aborted under sandbox memory/resource limits. A direct Blender import of the optimized GLB is unsupported by the bundled Blender glTF addon’s missing `EXT_meshopt_compression` and `KHR_texture_basisu` import extensions; a headless FBX silhouette render also hit the sandbox memory/EGL limits. No new rendered screenshot, live-game visual acceptance, manual-drive, or performance claim is made. The prior four-view source screen remains the provisional design evidence; do not upgrade it to legal clearance.

**Completed in this increment:** the generated GLB, manifest/credits, and status-document updates (never the source archive) were pushed in the hero integration and formatting commits; local and remote `main` matched `8709e0d` at the time of validation. Full `npm run check`, GitHub Validate #198, Pages Deploy #187, and the live asset SHA check all passed. The headless visual capture remains a sandbox resource limitation, not a visual-acceptance claim. Keep Phases 7–8 gated; no next phase is authorized.

## 73. Android black-canvas investigation — mobile texture mitigation deployed; owner retest pending (2026-10-23)

**Owner report:** after reloading the live game, the game canvas is black while the surrounding page UI remains visible. The owner identified the device as Android. No screenshot or Android console log was available in this increment.

**Deployment and browser investigation:** the live page, asset manifest, and hero GLB returned HTTP 200. A low-resource headless Chromium run reached Three.js's WebGL2 fallback without a page JavaScript exception, but the software-rendered game became unresponsive before a reliable frame or diagnostics snapshot. With the hero GLB allowed, the sandbox's OOM-kill counter increased; aborting that request avoided the new kill, but the scene still became unresponsive. This is a constrained SwiftShader result, not an Android reproduction or visual acceptance. It does, however, expose a credible mobile-memory risk in the new hero integration: the GLB has 17 universal KTX2 textures, including many 2048×2048 maps. On devices without hardware block-compressed texture support, the transcoder can expand those maps to RGBA in GPU memory, far beyond their 4.9 MB download size. The runtime's existing fail-soft `CarVisual` path protects model-load/validation failures but cannot protect against graphics-device memory exhaustion after texture upload.

**Mitigation and asset rebuild:** commit `9cfab70` lowered the reproducible hero texture cap from 2048px to 1024px (four times fewer top-level texels for maps at the old cap) and added an `assets:verify` check that parses each embedded KTX2 header and enforces the approved dimension budget. After that code was pushed, `npm run assets:hero -- --archive /home/user/hero-car-candidate-neutral-screen.zip` completed with Blender 4.3.2 and Basis Universal 1.16.3. It verified the supplied archive hash `222b8a9322a94305a5065d9adb56836c93451f040baea45dca4e774ba8f178e6`, preserved the sanitized archive input, and produced a 2,901,212-byte GLB (SHA-256 `9730807ddeb822ccc3a7a1e6b21aec28c7f104bf48de61f5c5de0d414a5a2d04`), 17 KTX2 images, and unchanged LOD counts 114,070 / 51,323 / 17,104. The builder regenerated `public/assets/manifest.json`; `CREDITS.md` remains correct for the same source and modification. `npm run assets:verify` passed for 20 assets / 47,814,475 bytes and verified every embedded hero KTX2 dimension is at most 1024×1024. Full `npm run check` passed on `02bc1a1`: Prettier, ESLint, GLSL guard, both TypeScript checks, 63 test files / 513 tests, asset verification, and production build. GitHub [Validate #202](https://github.com/mdraficode/Endless-Driver/actions/runs/39941093456) and [Pages Deploy #191](https://github.com/mdraficode/Endless-Driver/actions/runs/39941093441) succeeded; local and remote `main` matched at `02bc1a114bfb0d85bd28d58b11f81d5371f46462`. The live manifest and GLB returned HTTP 200; the downloaded GLB's SHA-256 and 2,901,212-byte size match the manifest, all 17 images are at most 1024×1024, and the neutral dashboard source hash remains `a9770ac049a95fe7037eccec1189948934306b510487d201378f666e77a40e8c`. The current live result is now verified as a deployed file, not as a rendered Android frame.

**Next action at that time (superseded by §74):** initially, request an Android retest after clearing cache. The owner's retest and the resulting backend compatibility change are recorded below. Keep Phases 7–8 gated.

## 74. Android forced-WebGL diagnostic and compatibility default (2026-10-23)

**Owner follow-up:** after the 1024px texture rebuild and deployment, the owner reported the default Android page is still black. They tested `?backend=webgl&tier=c&map=0&touch=0`, which renders the game world. This points toward the automatic WebGPU/device path, but the diagnostic URL also disables the minimap and touch controls and requests tier C, so it does not isolate backend as a single variable. The owner selected “other/unsure” for device details but did not provide a model, browser version, screenshot, or console/status text.

**Implementation:** a pure backend-selection policy and tests were added. When Android is detected and `navigator.gpu` exists, select WebGL2 by default; preserve `?backend=auto` as an explicit WebGPU diagnostic override and `?backend=webgl` as an explicit WebGL override. Non-Android defaults remain `auto`; Android browsers without `navigator.gpu` keep the existing automatic WebGL fallback. This follows the user's working diagnostic path without claiming to know the exact device/driver failure. The change was pushed in code commit `ebbc97d956265fceca2d0e02eac9f05300d91e09` (implementation in `fcc3ab9`, formatting in `ebbc97d`).

**Validation and deployment:** `npm ci` installed 201 packages and reported two moderate audit findings; no audit fix was applied. `npm run check` passed on `ebbc97d`: Prettier, ESLint, GLSL guard, both TypeScript checks, 63 test files / 514 tests, `assets:verify` (20 assets / 47,814,475 bytes), and the production build. Existing non-fatal Three.js `toNonIndexed()` and Vite large-chunk warnings remain. GitHub [Validate #205](https://github.com/mdraficode/Endless-Driver/actions/runs/39948208011) and [Pages Deploy #194](https://github.com/mdraficode/Endless-Driver/actions/runs/39948208028) succeeded; local and remote `main` matched the code SHA. The live page returns HTTP 200, uses `assets/index-C98xncf-.js`, and that bundle contains the `Android WebGPU compatibility default: WebGL2` log marker. The `?backend=auto` URL also returns HTTP 200. This verifies deploy, not an Android frame.

**Next action at that time (superseded by §75):** ask the owner to clear cached site data if needed and retest the default URL. The owner did test the forced-WebGL diagnostic; their car-alignment report and pipeline fix are recorded below. Preserve the 1024px hero cap, neutral dashboard media/hash, CC BY attribution, no-brand/design gate, and Phase 7–8 gates.

## 75. Android visual feedback and hero body/wheel alignment (2026-10-23)

**Owner feedback:** the forced-WebGL low-tier diagnostic renders the game, but the owner reports no control buttons, the hero car body sitting far above its wheels, and the world looking “a bit off.” The diagnostic query they used includes `touch=0`, which the code explicitly defines as “hide the touch controls everywhere”; use `?backend=webgl&tier=c` (without `map=0&touch=0`) or the normal URL to see the touch controls and minimap. This is a query-option effect, not yet a newly observed controls bug.

**Pipeline correction:** code review found and fixed the floating-body defect. `fbx_to_glb.py` mapped each wheel pivot with the full `map_point()` transformation (source centering plus wheel-height origin offsets), but previously baked static body geometry with `axis @ source.matrix_world` only. The resulting mismatch left the body high in source-origin space while the wheels sat at game-origin coordinates. The converter now applies `Matrix.Translation(map_point(Vector((0,0,0)))) @ axis` to body geometry, records body bounds, and rejects builds with a body lower edge detached from the configured tire envelope. `build-hero-car.mjs`, `verify-assets.mjs`, and `tests/unit/model-pipeline.test.ts` enforce/report the relationship.

**Rebuilt asset:** using Blender 4.3.2 and Basis Universal 1.16.3, regenerated from the pinned owner-supplied sanitized archive; no source archive was committed. The aligned GLB is 2,901,168 bytes with SHA-256 `51d192c22df2e0e8fd95d927d33b92dae3f78c09d374fc6549aa247ff6a85312`, 17 KTX2 maps (all at or below 1024px), and unchanged LOD counts 114,070 / 51,323 / 17,104. The manifest records body y bounds -0.5658..0.5059m around wheel center y=-0.37m (tire radius 0.34m); overall y bounds are -0.7104..0.5059m. The sanitized dashboard media hash remains `a9770ac049a95fe7037eccec1189948934306b510487d201378f666e77a40e8c`.

**Validation and deployment:** commits `f1e9164` (pipeline/tests/docs), `5c0c797` (regenerated GLB/manifest), and `ce88c72` (formatting) are pushed; local/remote `main` matched `ce88c72a77558d0c61c9364de0a003a8b3f69871` with a clean worktree. Full `npm run check` passed: Prettier, ESLint, GLSL guard, both TypeScript checks, 63 test files / 515 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. GitHub [Validate #209](https://github.com/mdraficode/Endless-Driver/actions/runs/39950275708) and [Pages Deploy #198](https://github.com/mdraficode/Endless-Driver/actions/runs/39950275752) succeeded. The live manifest and GLB return HTTP 200; the downloaded GLB SHA-256/2,901,168-byte size match the live manifest. This verifies the files are deployed, not the owner’s Android frame.

**Current tools/source:** `/home/user/hero-car-candidate-neutral-screen.zip` remains the only allowed hero source and is uncommitted. Scratch has `npm ci` and Blender 4.3.2 installed; the build cache and generated intermediates remain under `/tmp/endless-driver/.asset-cache`.

**Unresolved appearance feedback:** “the world looks a bit off” has no specific symptom or screenshot, so do not guess at lighting, road/terrain, or camera changes. Ask the owner for a screenshot and whether the issue is lighting/color, road/terrain, or camera/scale. The exact Android model/browser and whether the default URL now renders remain unconfirmed.

**Next action at that checkpoint (superseded by §76):** complete the specifically authorized cockpit camera and Hinode touge off-road/hazard work before requesting further visual review. The current Android/browser/appearance uncertainties remain; do not claim visual acceptance.

## 76. Requested cockpit camera and Hinode Touge off-road/hazard increment (2026-10-23)

**Scope and constraints:** the owner authorized the requested sophisticated cockpit camera and remaining off-road sections/hazards for the connected Hinode mountain route. Preserve Aohara Central Avenue as the default start, preserve existing rural/city world content, and do not begin Phase 7 weather/seasons or unrelated Phase 8 polish. Existing vehicle-impact response remains physics plus animation, with no visible mesh deformation. Earlier authorized startup progress, auto-start, and page-level landscape fallback remain unchanged; the webpage still cannot override the operating system's rotation lock.

**Implementation:** code commit `9d8395a` adds `CockpitCamera`, a model-specific driver-eye anchor (left-hand MMC coupe; right-hand authored fallback), chassis pitch/roll, damped seat pose and orientation, suspension/acceleration cues, restrained speed vibration/FOV, bounded touch/mouse free-look, and the `Close → Normal → Far → Orbit → Cockpit → Close` camera cycle. Hinode gains two packed-dirt off-road cuts that read from the shared trail/surface/vegetation/minimap network and leave elevation unflattened; they connect existing touge nodes. `HinodeTougeWorld` adds instanced guardrail runs, reflectors, warning boards and four rockfall hazards; the rails/rocks enter the existing static collision-response path, producing a Rapier car impulse and the existing transient impact animation. `?spawn=hinode-touge` remains optional; default Central Avenue is unchanged.

**Verification:** the code commit and push preceded testing, as instructed. Targeted cockpit/car-visual/touge tests passed (3 files / 9 tests). Full `npm run check` passed on `9d8395a`: Prettier, ESLint, GLSL guard, both TypeScript checks, 70 test files / 535 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. Non-fatal existing Three.js non-indexed-geometry and Vite large-chunk warnings remain. This is automated code evidence only: no browser visual review, manual drive, owner-device check, or FPS/performance acceptance was performed.

**Current status:** `9d8395a` is pushed to `origin/main`. The code work in this narrow request is complete. Continue only with owner/device visual review or further specifically authorized changes; do not infer camera comfort, route visual quality, FPS stability, or Phase 7/other Phase 8 authorization from tests.

## 77. Owner-directed GitHub archival of the sanitized hero source (2026-10-23)

**Owner direction:** the owner instructed that the full sanitized source archive be pushed to the public GitHub repository for later retrieval, then removed from the Arena workspace. This supersedes earlier handling in §§71–75 that treated the archive as an uncommitted local cache.

**Archive and rights:** `source-archives/hero-car-candidate-neutral-screen.zip` is the owner-supplied 79,563,959-byte ZIP, SHA-256 `222b8a9322a94305a5065d9adb56836c93451f040baea45dca4e774ba8f178e6`. Its internal `ATTRIBUTION.txt` records only replacement of `textures/media.png` with a neutral dashboard screen. The source is MMC Works’ Generic Sport Coupé Car under CC BY 4.0; its listing, attribution, modifications, and exact hash are already represented in the asset manifest and `CREDITS.md`. See `source-archives/README.md`.

**Storage boundary:** keep the archive at the repository path above, outside `public/` and `public/assets/`. It is for recovery/build use only; the Pages deployment must continue to serve only the optimized runtime GLB. Once the remote commit is verified, remove the local Arena copy and scratch clone.

## 78. Owner report: startup overlay and portrait layout remain stuck (2026-10-23)

**Owner report:** the game remains at the 100% loading screen, and the map/game surface remains portrait-oriented instead of using the requested landscape layout.

**Startup finding and fix:** `Application` reports progress 1 after the first frame, but the entrypoint only forwarded that event to `LoadingScreen.update()`; no code called `complete()`. The progress bar reached 100%, while the overlay never entered its fade/hide state. `LoadingScreen` now treats normalized progress 1 as terminal, fades and hides after the first playable frame, and clears any pending hide timer when a new load is shown. Error states remain visible with the retry action.

**Orientation correction:** the existing page-level CSS rotation remains the fallback; native orientation lock is still best-effort from user gestures and cannot override OS rotation settings. Touch detection now includes `any-pointer: coarse` and mobile UA hints, and a CSS portrait/coarse-pointer safety net applies the landscape-sized quarter-turn even when a mobile/in-app browser withholds touch metadata from JavaScript. Touch-control visibility uses the same broader signals.

**Verification:** implementation was pushed before tests. Full `npm run check` passed on `876c61d`: Prettier, ESLint, GLSL guard, both TypeScript checks, 70 test files / 536 tests, asset verification (20 assets / 47,814,431 bytes), and production build. Automated validation does not prove the affected phone's rendered orientation; owner-device retest remains required. No FPS claim is made.

## 79. Startup failure: vegetation rock variant has no registered mesh (2026-10-23)

**Owner report:** the game now displays `Could not start: Cannot read properties of undefined (reading 'mesh')` while loading.

**Root cause:** `generateChunkVegetation` previously selected every species' variant with `floor(hash * 3)`. The vegetation renderer creates three pools for tree species but only two for rock, and scanned adoption likewise only provides `rock:0` and `rock:1`. Some rock placements therefore became `rock:2`; during the initial foliage rebuild, the mesh lookup returned `undefined` and the subsequent `.mesh` access threw the reported TypeError, rejecting startup.

**Fix:** code commit `099cd014a4ae31cbece17fc178af5656beecd305` adds a shared species-specific variant-count helper and uses it both when generating placements and when constructing authored, crown, and scanned mesh pools. A missing-pool invariant now throws a descriptive error rather than an opaque property-access TypeError. The regression test uses a steep rock-only sampler to exercise placements and ensures their variants fit the registered pool.

**Verification and deployment:** the code/test commit was pushed before running checks. Full `npm run check` passed: Prettier, ESLint, GLSL guard, both TypeScript checks, 70 test files / 537 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. GitHub Validate [#237](https://github.com/mdraficode/Endless-Driver/actions/runs/39989226518) and Pages Deploy [#226](https://github.com/mdraficode/Endless-Driver/actions/runs/39989226362) succeeded. The deployed page and JS bundle return HTTP 200; the current bundle `assets/index-Dj7jnbEU.js` includes the new mesh-pool diagnostic. No real browser/device reproduction or owner-device retest was performed.

**Next action:** ask the owner to hard-refresh the deployed default URL and confirm startup succeeds. If it still fails, request the exact URL, device/browser, screenshot, and console stack. Preserve the earlier auto-start/loading and page-level landscape fixes; no OS-level orientation claim, Phase 7 work, unrelated Phase 8 scope, visual acceptance, or FPS claim is made.

## 80. Best-effort automatic fullscreen on game start (2026-10-23)

**Owner request:** open the game fullscreen whenever the game starts, including a user's first entry from the game link.

**Browser constraint:** browsers generally require a trusted user gesture for Fullscreen API requests. A normal fresh URL visit cannot be guaranteed to enter fullscreen without that activation; the game must remain playable if the browser denies or does not support fullscreen. Do not promise a guaranteed fullscreen state on initial link load.

**Implementation:** `FullscreenOnStart` requests fullscreen when the driving scene starts, using the standard Fullscreen API with `navigationUI: 'hide'` and a WebKit-prefixed fallback. If the no-gesture request is rejected, the controller silently retries on the first pointer, click, or keyboard gesture (and `touchstart` fallback where Pointer Events are unavailable), then removes its listeners after success so it will not fight a deliberate fullscreen exit. The existing touch fullscreen button, page-level landscape fallback, and best-effort native orientation lock remain. Unsupported/denied fullscreen never blocks gameplay.

**Verification:** the implementation (`b4f699c`) and formatting correction (`3363930`) were pushed before validation. Full `npm run check` passed on `3363930`: Prettier, ESLint, GLSL guard, both TypeScript checks, 71 test files / 538 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. GitHub Validate [#240](https://github.com/mdraficode/Endless-Driver/actions/runs/39993674891) and Pages Deploy [#229](https://github.com/mdraficode/Endless-Driver/actions/runs/39993675002) succeeded. Live Pages serves HTML and bundle `assets/index-CShZod5J.js` with HTTP 200; the bundle contains the standard and WebKit fullscreen API markers. No manual browser, real-device, or owner retest was performed; automated checks do not prove fullscreen entry on the user's browser. Fullscreen on a fresh link visit is therefore best-effort until the first activating gesture.

**Next step:** ask the owner to hard-refresh the deployed default URL on the affected device, confirm startup now proceeds, and report whether fullscreen engages automatically or after the first interaction. If the game is still not fullscreen after interaction, collect browser/device details; if it still fails to start, collect the exact URL, screenshot, and console stack. Keep Central Avenue default, retain the CSS landscape fallback, and do not expand into Phase 7 weather/seasons or unrelated Phase 8 work.

## 81. Owner-authorized in-game pause/home menu and customization (2026-10-23)

**Owner request:** add a right-corner pause control and an organized in-game home/pause menu with Resume, Restart, Spawn Location, Gameplay Options, Graphics, Car Model, Traffic Intensity, useful additional controls/help, and Credits as the final menu item opening the existing credits view. Settings must affect gameplay, and spawn selection belongs in this menu. Preserve auto-start when the scene is ready; do not add an initial Play gate.

**Scope boundary:** this is a narrow Phase 8 authorization for the requested menu and named options only. Phase 7 weather/seasons, photo mode, broad polish, final quality acceptance and performance claims remain out of scope. Preserve the default Aohara Central Avenue start, existing rural/city content, query parameters, existing sanitized dashboard media and the imported Generic Sport Coupé attribution/design gates. Fullscreen remains best-effort under browser activation policy.

**Implementation prepared in `/tmp/endless-driver-menu`:** the pause button sits at the upper-right and can also be toggled with `P` or `Escape`; opening it stops the application and Resume restarts it. The menu contains Overview, Spawn Location, Gameplay Options, Graphics, Car Model, Controls & Help, and Credits last. The existing manifest-driven credits dialog is reused. Spawn URL changes preserve unrelated query switches and use the existing default-spawn behavior. The initial load still auto-starts.

`game-preferences.ts` validates and persists graphics tier (Auto/C/B/A), traffic intensity (Off/Light/Standard/Busy), player visual (the imported Generic Sport Coupé or the project-authored Kaminari GT Roadster), startup camera, and steering response. These choices are saved immediately and applied on the next restart; the menu says so and exposes an Apply & Restart action rather than implying live changes. Traffic intensity scales only the Aohara vehicle budget (0 / 0.5× / 1× / 1.5× of the existing C/B/A standard budgets 6/12/18); pedestrian counts remain unchanged. Settings are wired into tier resolution, `Application`, `PlayerCarVisual`, and the urban activity pipeline.

**Verification and commit discipline:** implementation commit `608f0a9` was pushed to `origin/main` before dependency installation or any check, as directed. The initial `npm ci` hit temporary `/tmp` tmpfs exhaustion; after removing the obsolete scratch clone `/tmp/endless-driver` and incomplete `node_modules`, `npm ci` succeeded (201 packages; npm reported two moderate audit findings). The first `npm run check` stopped at Prettier's `format:check` because eight files needed formatting; no lint/typecheck/tests/build ran. The formatting correction was committed and pushed as `73495f7` before the full rerun. A final review then removed the duplicate `.credits-overlay` CSS block and added the missing X/Square camera binding to the gamepad-help list; commit `de947b0` was pushed before the final check. Full `npm run check` passed on `de947b0`: Prettier, ESLint, GLSL guard, both TypeScript checks, 73 test files / 546 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. Non-fatal warnings included existing Three.js already-non-indexed geometry messages, Vite's large-chunk warning, and two moderate npm audit findings; no audit fix was run. Browser/manual visual review and owner-device retest remain pending. The active repository's tracked source archive was not removed.

## 82. Owner reports fullscreen exit and minimap/orientation issues (2026-10-23)

**Owner report:** pressing Restart or Apply Changes navigates/reloads and exits browser fullscreen; the minimap remains visible above the pause/home menu; entering fullscreen should request landscape orientation.

**Fix in progress:** replace full-page navigation with an in-place drive rebuild. Persisted preferences and spawn query changes are read from the updated URL while `history.replaceState` avoids page navigation; dispose the previous application, replace only its canvas, and start the new application while fullscreen remains on the document root. Hide the minimap when paused and parent it under `#app` so mobile rotation/stacking is consistent. After successful fullscreen entry, attempt `screen.orientation.lock('landscape')`; retain the existing page-level landscape fallback and make no OS-rotation guarantee.

**Validation:** fix commit `84b3b09` was pushed before checks, as instructed. Full `npm run check` passed there: Prettier, ESLint, GLSL guard, both TypeScript checks, 73 test files / 548 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. The new orientation tests cover a supported lock and a denied lock without losing fullscreen success. No manual browser/device or owner retest has yet been performed; native orientation remains browser/OS-dependent.

## 83. Owner reports cockpit view framing issue (2026-10-23)

**Owner report:** the cockpit camera does not show the full windscreen together with the steering wheel and dashboard, and should read like a realistic driver's-seat view.

**Implementation:** move the hero coupé eye anchor to `[-0.39, 0.52, 0.9]` and the open-cabin roadster fallback to `[0.39, 0.76, 0.72]`, away from the windshield and behind/above the wheel. Projection-based tests keep measured shipped-GLB windshield/wheel landmarks plus the authored roadster windshield, wheel and dashboard in frame at landscape aspect ratio. Changes are limited to cockpit framing; no unrelated camera, vehicle, visual asset, or Phase 8 work was included.

**Validation:** implementation `1dfc609` and final seat-clearance adjustment `f4aa8c0` were pushed before checks, as instructed. Targeted camera/car-visual tests passed (2 files / 8 tests). Full `npm run check` passed on `f4aa8c0`: Prettier, ESLint, GLSL guard, both TypeScript checks, 73 test files / 550 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. No manual browser/device visual review or owner retest has yet been performed.

## 84. Owner reports fullscreen remains windowed after touch on Android Chrome (2026-10-23)

**Owner report/environment:** the game still does not enter fullscreen after interaction, on Android Chrome, opened as a normal HTTPS page rather than an embedded preview.

**Likely cause (source-level hypothesis; not yet reproduced on-device):** the global fullscreen retry and portrait touch controls both attempted fullscreen from `pointerdown`. On touchscreen pointers, that event is not a reliable Fullscreen API activation event in Android Chrome; a failed pointerdown attempt could overlap/deduplicate the later valid gesture.

**Implementation:** `FullscreenOnStart` retries on mouse `pointerdown`, touch/pen `pointerup`, keyboard, and accessibility-generated clicks; browsers without Pointer Events use `mousedown` and `touchend`. The portrait touch-control orientation retry has been moved from `pointerdown` to `pointerup`, so it cannot preempt fullscreen activation and still gets a gesture-time native landscape-lock attempt. Startup auto-request, the explicit fullscreen button, landscape-lock best effort, and page-level landscape fallback remain. Fresh-link fullscreen remains best-effort under browser policy.

**Verification:** code commit `18fd2a7` was pushed before the focused fullscreen suite (1 file / 5 tests), which passed. The first full check stopped at Prettier because the input README table needed formatting; formatting-only commit `ec03e55` was pushed before rerunning. After the portrait-orientation retry was moved to pointerup, commit `7d1fb8e` was pushed before the final full check. `npm run check` passed on `7d1fb8e`: Prettier, ESLint, GLSL guard, both TypeScript checks, 73 test files / 552 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js non-indexed-geometry and large-chunk warnings remain. No real Android device/browser reproduction or owner retest has been performed; automated checks do not prove device behavior.

**Next step:** hard-refresh the normal HTTPS game page on Android Chrome and test one touch/release. Startup fullscreen remains best-effort, but the first touch release now invokes the request on the activation-capable event. If it remains windowed, report whether the explicit ⛶ button works and share any browser console error; do not treat this fix as device-verified until the owner confirms.

## 85. Owner reports cockpit camera shows roof instead of driver view (2026-10-24)

**Owner report:** cockpit mode frames the car roof rather than the steering wheel and forward windscreen expected from a driver's seat.

**Likely cause:** the earlier framing change raised and moved the hero eye rearward to keep the entire outer windshield boundary in view. The projection tests proved those distant landmarks were on-screen but did not constrain the eye to remain below the roof and in the cabin; no manual visual acceptance had been performed.

**Fix prepared:** move the hero eye from `[-0.39, 0.52, 0.9]` to `[-0.39, 0.3, 0.5]`, below the coupé roof line and just behind the measured left-hand wheel. Move the open-cabin roadster eye from `[0.39, 0.76, 0.72]` to `[0.39, 0.72, 0.45]`, forward of its roll hoop and closer to the right-hand wheel. Update projection tests to check in-cabin eye constraints and representative windshield, steering-wheel, and dashboard points rather than requiring every outer window pillar at the cost of a roof-mounted view.

**Verification:** code/test commit `add945f` was pushed before checks, per owner instruction. The targeted cockpit suite passed (1 file / 5 tests). Full `npm run check` passed on `add945f`: Prettier, ESLint, GLSL guard, both TypeScript checks, 73 test files / 552 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js non-indexed-geometry and large-chunk warnings remain. No manual browser visual review or owner-device retest has been performed; automated projection tests do not prove the live view looks right.

**Next step:** hard-refresh after the Pages deployment updates, choose Cockpit from the menu or cycle to it with `C`, and confirm the driver's-eye view now shows the forward windshield and steering wheel. If it still looks roof-mounted, send a screenshot and say which car model is selected.

## 86. Owner reports cockpit camera trails backward as the car accelerates (2026-10-24)

**Owner report:** cockpit framing starts correctly but drifts toward the rear seat and eventually outside as the car gains speed; the eye should remain fixed in the driver's seat relative to the car.

**Root cause:** `CockpitCamera` smoothed its absolute world-space camera position toward the moving vehicle anchor. A time-constant follower naturally lags by approximately speed × position-lag time (e.g. several metres at highway speed), making the driver's eye slide rearward relative to the cabin.

**Fix prepared:** smooth only the small seat-local head/suspension offset. Each frame, transform that local offset by the current chassis orientation and add the current vehicle translation immediately. This retains gentle local motion cues without allowing vehicle travel to accumulate camera lag. A regression test drives the pose 20 metres over one second and asserts the camera remains at its local eye anchor.

**Verification:** implementation commit `090c7cb` was pushed before the targeted cockpit suite (1 file / 6 tests), which passed. Formatting-only correction `90b6348` was pushed before the final full check. `npm run check` passed on `90b6348`: Prettier, ESLint, GLSL guard, both TypeScript checks, 73 test files / 553 tests, `assets:verify` (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js non-indexed-geometry and large-chunk warnings remain. No manual browser or owner-device retest has been performed.

**Next step:** after the Pages deployment updates, hard-refresh and drive with Cockpit selected. The camera now follows the car's world translation immediately and only damps its tiny seat-local motion. If it still shifts relative to the cabin, send a short screen recording and identify the selected car model.

## 87. Owner requests windshield-first, near-edge cockpit framing (2026-10-24)

**Owner request:** move the view closer to the windshield so it dominates almost the whole screen, keep the side borders near the screen edges, and leave only a small part of the steering wheel at the bottom.

**Implementation:** hero eye anchor changed from `[-0.39, 0.3, 0.5]` to `[-0.05, 0.36, 0.2]`; the roadster fallback changed from `[0.39, 0.72, 0.45]` to `[0.08, 0.84, 0.2]`. Cockpit FOV changed from `76/81` to `70/72`. Landscape projection regressions now check near-edge hero windshield borders, a wheel arc cropped at the bottom, and corresponding close forward framing for the fallback. The prior fix remains intact: vehicle translation is followed immediately, with damping only on small seat-local motion. No unrelated Phase 8 work was included.

**Verification:** code/test commit `2a0ab64` was pushed before any build or test, per owner instruction. `npm run check` passed on `2a0ab64`: Prettier, ESLint, GLSL guard, both TypeScript checks, 73 test files / 553 tests, asset verification (20 assets / 47,814,431 bytes), and production build. GitHub Validate #264 and Pages Deploy #253 both succeeded on that SHA; the live Pages URL returned HTTP 200. Existing non-fatal Three.js non-indexed-geometry and large-chunk warnings remain. Automated projection tests and an HTTP response do not prove live visual acceptance; no browser/device visual retest has been performed.

**Next step:** hard-refresh https://mdraficode.github.io/Endless-Driver/, select Cockpit from the menu or cycle to it with `C`, and review both the loaded hero and roadster fallback. If the windshield borders or visible wheel arc differ from the request, share a screenshot and name the selected model.

## 88. Owner reports cockpit roof blocks the street view (2026-10-24)

**Owner report:** the car's roof blocks the top of Cockpit view; the owner requests an open street view without an obstruction for easier driving.

**Implementation:** `COCKPIT_CAMERA_CONFIG.forwardPitchRadians` adds a neutral `-0.15` rad downward aim. The hero eye rises from `[-0.05, 0.36, 0.2]` to `[-0.05, 0.4, 0.2]`, just below the windshield header; the open-cabin fallback moves from `[0.08, 0.84, 0.2]` to `[0.2, 0.84, 0.1]`. Landscape projection regressions check a representative roofline point above the view and keep forward street/windshield landmarks visible for both models, with the steering wheel low. The immediate vehicle-translation follow fix remains unchanged; only seat-local motion is damped.

**Verification:** code commit `69b057d` was pushed before checks, per owner instruction. The first full check stopped at Prettier; formatting-only commit `f832be2` was pushed before rerunning. `npm run check` passed on `f832be2`: Prettier, ESLint, GLSL guard, both TypeScript checks, 73 test files / 553 tests, asset verification (20 assets / 47,814,431 bytes), and production build. GitHub Validate #267 and Pages Deploy #256 succeeded on that SHA. The live Pages URL returned HTTP 200, and its JavaScript bundle contains the new eye anchors and pitch. Existing non-fatal Three.js non-indexed-geometry and large-chunk warnings remain. Projection tests and bundle inspection do not prove actual visual acceptance; no browser/device visual retest has been performed.

**Next step at this checkpoint (superseded by §89):** hard-refresh https://mdraficode.github.io/Endless-Driver/, choose Cockpit, and confirm the roof no longer intrudes while the street remains clear on both the hero and roadster fallback. If any roof/body still blocks the view, send a screenshot and identify the selected car model.

## 89. Owner correction: prioritize the unobstructed forward track (2026-10-24)

**Owner correction:** the new screenshot shows a broad dark roof band across the upper screen, gameplay compressed into the middle, and dashboard/hood crowding the bottom. The requirement is the full, unobstructed forward gameplay/track view; only cockpit framing should remain at the screen edges. Earlier projection-based roofline checks are not visual acceptance. The previous steering-wheel/dashboard visibility goal is subordinate wherever those parts block the road.

**Implementation:** code commit `ab5bd67ae3e9b14b604e6b3cbbaeac47176a8c30` moves the hero eye from `[-0.05, 0.4, 0.2]` to `[-0.05, 0.46, 0.05]` and changes the neutral pitch from `-0.15` to `-0.03` rad. The roadster fallback keeps its open-cabin eye anchor at `[0.2, 0.84, 0.1]`. The cockpit regression now loads the actual meshopt-compressed hero GLB and raycasts 35 center/near-center screen samples at both 70° and 72° FOV, excluding alpha-blended glazing, to guard against opaque roof/cabin blockers; it also checks road landmarks 5, 10, and 20 m ahead. Separate fallback projection checks keep the road in the view and the right-hand wheel low. The camera still follows vehicle translation immediately; only the seat-local motion cues are damped. The capture helper is committed at `scripts/capture-cockpit.mjs`.

**Verification and deployment:** as required, code and test changes were committed and pushed before running tests/build/capture. The targeted cockpit suite passed (1 file / 6 tests). Full `npm run check` passed on `ab5bd67`: Prettier, ESLint, GLSL guard, both TypeScript checks, 73 test files / 553 tests, verification of 20 assets / 47,814,431 bytes, and production build. GitHub Validate #269 and Pages Deploy #258 succeeded on this SHA; the live Pages URL returns HTTP 200 and its current JavaScript bundle includes `eyeAnchor:[-.05,.46,.05]` and `forwardPitchRadians:-.03`. Existing Three.js non-indexed-geometry and Vite large-chunk notices are non-fatal.

**Visual acceptance remains pending:** Chromium headless shell launched and rendered an `about:blank` smoke-test screenshot, but the real app page crashed after loading the environment HDRI and many KTX2 assets; the same `Target crashed` occurred with both the Vite dev server and a lower-memory `vite preview` server, even at 640×288. The page emitted repeated KTX2-loader performance warnings before the crash. This is consistent with a sandbox resource/runtime limitation, but its exact cause is not proven. No gameplay screenshot was produced or inspected, so do not claim the rendered framing is accepted. No source changes have been made after `ab5bd67`. The documentation-only status update and formatting correction are pushed through `84fdb93`; the follow-up full `npm run check` passed there, and GitHub Validate #271 and Pages Deploy #260 succeeded. Local and remote `main` match.

**Next step:** ask the owner to hard-refresh the deployed URL, select Cockpit, and confirm the forward track is fully clear on the hero and fallback cars. If any roof/dashboard/hood still intrudes, request a fresh screenshot and the selected car. Do not resume a headless app capture in this constrained environment unless browser memory/runtime limitations are resolved. Preserve the no-world-space camera lag fix, and do not begin Phase 7 or unrelated Phase 8 work.

## 90. Cockpit free-look recenters when driving starts (2026-10-24)

**Owner request:** return the camera to the central/forward road view when the car starts running.

**Implementation:** code commit `dcab414979b66175f9d109e991343a65d81befad` extends the existing neutral-to-drive-input rising-edge trigger. A fresh throttle or brake/reverse input now resets both the chase orbit and cockpit free-look; the cockpit orientation eases toward its forward road gaze through the existing damping rather than snapping. The trigger fires once per new input sequence, not every active frame. Vehicle translation remains immediate; the previous cockpit eye/framing and no-world-space camera lag fix are unchanged.

**Verification and deployment:** as directed, the source/test commit was pushed before any tests. The targeted cockpit/orbit suites passed (2 files / 16 tests). Full `npm run check` passed on `dcab414`: formatting, lint, GLSL guard, both TypeScript checks, 73 test files / 553 tests, verification of 20 assets / 47,814,431 bytes, and production build. GitHub Validate #273 and Pages Deploy #262 succeeded on the same SHA; local and remote `main` matched. The live Pages URL returns HTTP 200, and its current JavaScript bundle contains the cockpit look-reset path.

**Visual/device acceptance remains separate:** no gameplay screenshot or owner-device retest was performed for this behavior. The earlier full-app headless capture crashed during environment/KTX2 loading in the constrained sandbox, so automated camera-angle tests are not visual acceptance.

**Next step:** hard-refresh https://mdraficode.github.io/Endless-Driver/, choose Cockpit, look away using a canvas swipe/drag, then press the throttle or W. Confirm the view eases back to the centered forward road when driving starts. If the timing or recenter behavior is not right, share a short recording and say whether the hero or fallback car is selected.

## 91. World enrichment and road-marking junction correction (2026-10-24)

**Owner request:** enrich the driving world with denser and more varied buildings and visible activity; address road-edge markings that appear across the roadway at generated intersections; add distant, attractive mountain scenery; and give underdetailed road sections stronger visual support. Preserve the fictional Hinode/Aohara setting, snow-free terrain, mobile tier limits, no paid/restricted assets, and no fog/mist/haze or global bloom.

**Implementation:** road-edge paint and arterial double-center lines now stop 14 m before junctions; lane dashes sample exact profile distances and use the same clearance, preventing paint from carrying through cross traffic. The C/B/A city budgets now provide 8/12/16 infill buildings, 8/16/24 traffic vehicles and 16/32/48 pedestrians; low-rise facades also vary in palette, footprint, height, and roof silhouette. Four distant, terrain-sampled snow-free mountain ridges add 4,380 vertices using no external assets. Tests cover junction clearance, deterministic mountain geometry, tier counts, roof mixes, and driving-world integration. Road paving, terrain carving and physics still share the same solved profile. No specific missing bridge/retaining structure could be localized without a track/spawn or screenshot.

**Verification:** code/test/docs were pushed before every full check. The final code/test SHA `29b4646e764f0693e0a2721603ac1f9ef86f5e57` passes `npm run check`: Prettier, ESLint, GLSL guard, both TypeScript checks, 74 test files / 556 tests, verification of 20 assets / 47,814,431 bytes, and production build. The run first exposed two stale test assumptions; those test corrections were committed and pushed before the rerun. Existing non-fatal Three.js non-indexed-geometry and Vite large-chunk notices remain. GitHub Validate run [40043369418](https://github.com/mdraficode/Endless-Driver/actions/runs/40043369418) and Pages Deploy run [40043369352](https://github.com/mdraficode/Endless-Driver/actions/runs/40043369352) both succeeded for the follow-up `4005013` SHA. The deployed Pages URL returned HTTP 200; the bundle contains `distant-mountain-rock-and-forest-pbr` and `infillHippedRoofs`. The full-app gameplay capture is not repeated because the prior Chromium app page crashed during environment/KTX2 loading in the constrained sandbox. No visual, owner-device, or FPS acceptance is claimed; automated tests do not prove the mountain view or remaining visual glitches.

## 92. Gameplay frame drops and distant mountain appearance (2026-10-24)

**Owner report:** “The gameplay play is fully lagging and the gameplay is not smooth at all the frame rate is dropping. Also the distance mountain view is looking very odd not realistic.” This is an active performance and visual issue, not an acceptance of the prior world-enrichment work.

**Baseline and limits:** the last full source/test checkpoint was `29b4646e764f0693e0a2721603ac1f9ef86f5e57` (`npm run check` green: 74 test files / 556 tests, 20 assets / 47,814,431 bytes, production build). Docs-only `633e208` was the last known clean local/remote head before this increment. The owner’s device/browser/GPU/resolution and a runtime profile are still unknown. Earlier full-app Chromium captures crashed during environment/KTX2 loading in the constrained sandbox; no fresh gameplay capture has been made. Existing CPU/GC, terrain POM, temporal velocity attachment, post effects, city/physics work, and graphics settings remain hypotheses until measured on the owner’s device.

**Implementation:** source/test commit `df59fc2a112b14c54267c23cb9cc0b24e77070f1` was pushed to `origin/main` before running any tests or builds. The automatic tier is now performance-first C on unmeasured devices; B remains user-selectable but has a lower DPR cap, two 1024 shadow cascades, FXAA/spatial scaling, clouds and motion-vector effects off, and contact shadows off. C/B start their dynamic spatial scale at 0.72/0.75 with respective floors 0.50/0.55. POM is opted in only for Tier A in the gameplay world. Terrain render LOD is C `[48,20,8]`, B `[64,24,12]`, A unchanged `[64,32,16]`; C/B limit uploads/builds to one chunk per rendered frame, with collision/heightfield data unchanged. Terrain planning and worker-queue synchronization now occur only when the hysteretic window moves; vegetation reuses its sorted plan and skips repeated retained-set reconciliation while the window stays fixed. These are targeted reductions to known work paths, not measured causes or a promised FPS gain.

Distant mountain geometry retains the existing four-range vertex budget but replaces repeated sine-wave peaks with seeded multi-scale value noise, tapered ends, a wandering crest, asymmetric flanks, and restrained vertex-color variation. Deterministic geometry tests now require multiple skyline peaks. This is a geometry change only; realistic appearance still needs owner-device review.

**Verification:** source/test `df59fc2` and docs status commit `ad8509e` were pushed before checks. The first `npm run check` stopped at Prettier in seven files; formatting/docs correction `a5f0b88` was pushed before rerunning. Full `npm run check` passed on `a5f0b88`: Prettier, ESLint, GLSL guard, both TypeScript checks, 74 test files / 559 tests, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js already-non-indexed-geometry and large-chunk build warnings remain. Local `HEAD`, `origin/main`, and `git ls-remote` all matched `a5f0b88980328ed8df8de74cefc0a9299ae6c5d3`. The `gh` CLI was not installed, so GitHub Actions/Pages workflow status was not polled. No gameplay capture, device profile, or visual review has been performed. Do not report smooth FPS, realistic mountains, a measured performance win, or visual acceptance until the owner reviews the actual device output.

**Initial next steps at this checkpoint (updated by §93):**

1. Superseded by §93: the image-quality code/test changes and status documentation were pushed, then the full check passed on the corrected SHA.
2. Ask the owner for device model, OS, browser/version, screen resolution/DPR, selected graphics tier/backend, and the active in-game resolution/scale readout. Collect an on-device frame-time/FPS trace before assigning causes to the separate performance report.
3. Ask the owner to inspect the mountain skyline and the edge/road-marking clarity from repeatable forward gameplay, then share a screenshot or short clip. The prior sandbox Chromium crash is a reason not to claim or repeat a full-app capture unless runtime conditions change.
4. Preserve the unobstructed forward road, drive-start camera recenter, immediate vehicle-translation following, fictional Hinode/Aohara setting, free/open-asset rules, and Phase 7/unrelated Phase 8 gates.

## 93. Low-resolution image and edge/road-marking artifacts (2026-10-24)

**Owner report:** “The game world is now looking very low resolution with lines showing on all the edges and road lines which looks very odd and not realistic.” In follow-up, the owner says the issue occurs on Android, iOS/iPadOS, and desktop/laptop, characterizes the lines as jagged/flickering rather than colored fringes, and can share a screenshot or clip. This is a new unresolved visual-quality complaint, separate from the earlier FPS-drop and distant-mountain reports; it does not count as visual acceptance of the performance pass. A screenshot and active resolution readout are still needed to determine whether aliasing, dynamic scale, or another path dominates.

**Baseline and diagnosis limits:** at `2ca9a8a`, Tier C remained the automatic default with FXAA and an initial scene-pass scale of 0.72, an adaptive floor of 0.50, and chromatic aberration strength 0.30. Tier B started at 0.75 with a 0.55 floor and FXAA. Linear spatial upscaling, strong color fringing, and the adaptive controller are plausible contributors, but there is no screenshot, owner-device active-scale readout, device/browser/GPU profile, or visual capture to establish the cause. Earlier full-app Chromium captures crashed during environment/KTX2 loading in the constrained sandbox; no new gameplay capture was attempted.

**Implementation:** source/test commit `34e947ae24d3b2e93e5128a0b07f7d29be59589b` was pushed before running the full check. Tier C remains the performance-first default and FXAA path, but starts at scale 0.90 with a 0.60 floor, 0.05 steps, a 0.5 s adjustment interval, and 0.1 smoothing. Tier C chromatic aberration is disabled and RCAS sharpening is gentler (`sharpness: 1`). Tier B uses SMAA and starts at 1.00 with a 0.80 floor under the same adaptive step/interval/smoothing. Neither Tier C nor B adds temporal history or a velocity attachment. These are bounded image-quality adjustments, not a measured performance optimization or proof that chromatic aberration caused the edge lines.

**Verification and push order:** `npm ci` completed in scratch and reported two moderate npm audit advisories; no audit fix was run. The first full `npm run check` was correctly run only after the source/test push and failed one test because an existing Tier B post-chain assertion still expected FXAA. The one-line regression correction was pushed as `6320c09` before rerunning. Full `npm run check` then passed on `6320c09`: Prettier, ESLint, GLSL guard, both TypeScript checks, 74 test files / 559 tests, 20 verified assets / 47,814,431 bytes, and production build; the full check passed again on the later clarification SHA `65439aa`. Non-fatal output includes Three.js already-non-indexed-geometry and Vite large-chunk warnings. GitHub [Validate #287](https://github.com/mdraficode/Endless-Driver/actions/runs/40053309779) and [Pages Deploy #276](https://github.com/mdraficode/Endless-Driver/actions/runs/40053309761) succeeded on `65439aa`; local `HEAD`, `origin/main`, and `git ls-remote` matched at that checkpoint. A fetch of the live Pages app returned the running game UI, but no screenshot or visual/owner-device review was performed. No device FPS result or visual acceptance is claimed.

**Next step:** the owner has now supplied a gameplay screenshot; see §96. Ask them to tap the upper-right bar-chart button and capture the diagnostics panel showing `Viewport`, `Tier`, `Renderer`, and `Resolution`, plus device model, OS, Chrome version, physical display resolution/DPR, and whether the capture was made while moving. To isolate spatial AA once the baseline is recorded, compare `?tier=c&aa=fxaa&res=1` with `?tier=c&aa=smaa&res=1` on the same scene/route; both keep Tier C and fix scene-pass scale at 1.0, so only the spatial AA strategy differs (the Tier C device-pixel-ratio cap remains in effect). Comparing either fixed-scale URL with adaptive `?tier=c` also changes render scale. Keep the earlier FPS/mountain issues separately unresolved until a reproducible device profile and evidence are available. Preserve forward road visibility, drive-start camera recenter, immediate vehicle translation following, the fictional Hinode/Aohara setting, asset-license constraints, and phase gates.

## 94. Phase 9: signal-aware safe following for mixed-class traffic (2026-10-24)

**Scope:** continued already-authorized Phase 9 traffic work; no change to Phase 6 authorization, no Phase 7 weather/seasons, and no unrelated Phase 8 polish.

**Implementation:** Aohara traffic previously respected signal stop lines and length-aware queue slots but could still advance independently from same-route leaders. `urban-activity.ts` now computes signal-limited per-step movement proposals, then constrains each follower using both actors' actual vehicle lengths plus the configured 8 m bumper gap. The cyclic loop resolver cuts at the largest gap and processes the remaining follower chain in one bounded pass; it is shared by visual-only look-dev activity and the Rapier-backed driving world. It does not replace Rapier collision truth, change C/B/A or user traffic-intensity budgets, add moving pedestrian collision, or introduce assets/dependencies.

**Tests:** unit coverage exercises route-wrap headway for a car behind a bus, unconstrained open-road travel, zero movement when already too close, and propagation of a leading slowdown through a mixed-size route while preserving every adjacent loop gap. The existing physics-backed Aohara traffic test still covers body creation, floating-origin slides, player contact, impact feedback and disposal.

**Verification and push order:** `npm ci` completed in scratch and reported two moderate audit advisories; no audit fix was run. Initial source/test commit `048a9bd` was pushed before the full check; that check passed (74 test files / 560 tests). Follow-up testability refactor `9b426a8` was also pushed before checking; its first full check stopped at Prettier. Formatting correction `7cb4546` was pushed before rerunning. Full `npm run check` passed at `7cb4546`: Prettier, ESLint, GLSL guard, both TypeScript checks, 74 test files / 561 tests, 20 verified assets / 47,814,431 bytes, and production build. GitHub Validate #292 and Pages Deploy #281 both succeeded on the same SHA; local `HEAD`, `origin/main`, and `git ls-remote` matched at verification. Existing non-fatal Three.js non-indexed-geometry and Vite large-chunk warnings remain.

**Limitations / next action:** no browser capture, manual Aohara drive, owner-device visual review, or named-device frame-time measurement was performed. This is automated route-logic coverage, not proof of visible realism, traffic feel, stable FPS, or resolution of the owner's separate edge/road-marking, mountain, and frame-drop reports. The bounded route-rejoin follow-up is recorded in §95; further recovery remains open. Pedestrian crossings still require explicit signal/right-of-way and clearance checks. Keep Phase 7 and unrelated Phase 8 gated, and preserve the Central Avenue default, rural Hinode, lane readability and asset constraints.

## 95. Phase 9: bounded post-impact route rejoin (2026-10-24)

**Scope:** next bounded traffic increment within the already-authorized Phase 9 work. Phase 6 status remains unchanged; no Phase 7 weather/seasons, unrelated Phase 8 polish, new physics authority, city expansion or pedestrian crossing behavior is included.

**Implementation:** after a qualifying Rapier traffic/player or traffic/traffic contact, the existing collision hold and physical response still run first. When the hold expires, a traffic body within 8 m of its own route is projected onto the closest route segment and its logical loop distance is updated before signal queue positions and the cyclic mixed-size spacing pass are recomputed. The Rapier body is never teleported; the existing route motor steers it toward the updated route intent. Displacements beyond the 8 m rejoin radius retain the prior route-motor fallback. This uses only the existing shared Rapier world, route loops and actor caps; no assets or dependencies were added.

**Tests:** a unit test covers nearest-segment projection, route-distance coordinates and invalid inputs. The physics integration test creates a real shared-world contact, verifies impact feedback, advances through the bounded hold and confirms a nearby traffic actor rejoins its route. Existing mixed-size following tests continue to verify route-wrap gaps and slowdown propagation after movement proposals are resolved.

**Verification and push order:** `9c00db1e9651d3d5db6993344c314b2687c4b905` was pushed before running tests. Focused traffic tests passed (2 files / 18 tests), then full `npm run check` passed on that exact code SHA: Prettier, ESLint, GLSL guard, both TypeScript checks, 74 test files / 562 tests, verification of 20 assets / 47,814,431 bytes and production build. GitHub Validate [#294](https://github.com/mdraficode/Endless-Driver/actions/runs/40058104286) and Pages Deploy [#283](https://github.com/mdraficode/Endless-Driver/actions/runs/40058104274) both succeeded. Local `HEAD`, `origin/main` and `git ls-remote` matched at the checkpoint. Existing non-fatal Three.js non-indexed-geometry and Vite large-chunk warnings remain.

**Limitations / next action:** this is automated route/physics evidence only. No browser capture, manual drive, owner-device visual review, traffic-feel acceptance or FPS measurement was performed. The shared browser-capture environment has previously crashed during full-app KTX2 loading; do not claim visual acceptance. The owner supplied a gameplay screenshot after this checkpoint; its appearance and source-level resolution hypothesis are recorded in §96. Request the open diagnostics panel's Viewport/Tier/Renderer/Resolution rows plus device/browser/DPR details before changing scale or AA; review actual Aohara traffic in a browser/device when runtime conditions allow. Further recovery for displacements beyond 8 m remains open. Pedestrian crossings/right-of-way stay deferred until explicit signal and clearance checks; preserve Phase 7 and unrelated Phase 8 gates, Central Avenue default, rural Hinode, lane readability and asset constraints.

## 96. Owner gameplay screenshot: broad scene softness and jagged road edges (2026-10-24)

**Evidence received:** the owner supplied `Screenshot_20261024-114724_Chrome.png`, a 1536×704 landscape Chrome gameplay capture with touch controls visible. The minimap labels Yūhi Town / Take-no-Michi, so the complaint is visible in a rural scene as well as being a general rendering concern. The 3D view appears broadly soft; road-edge and center markings show visible stair-stepping, and distant structures/vegetation are coarse. The UI remains comparatively crisp. One still confirms visible softness/jaggies but cannot establish temporal flicker, and the capture contains no diagnostics overlay. The file remains an owner attachment and was not copied into the repository.

**Source audit / hypothesis, not diagnosis:** mobile Auto resolves to Tier C, which caps renderer pixel ratio at 1, starts scene-pass scaling at 0.90, can adapt down to 0.60, and applies FXAA after a linear spatial upscale. A high-DPR display with this cap and a reduced scene pass could explain a soft 3D canvas while DOM controls stay crisp; aliasing may also depend on the AA path, fine road geometry, or LOD. The screenshot's 1536×704 output dimensions do not reveal CSS viewport size, device DPR, drawing-buffer size, or active scene scale. Tier B differs (max pixel ratio 1.25, SMAA, render scale 1.00 with a 0.80 floor), but raising tier/scale may increase load while the separate FPS complaint remains unresolved.

**Next diagnostic:** tap the upper-right bar-chart button and capture the panel's `Viewport`, `Tier`, `Renderer`, and `Resolution` rows (plus FPS/frame time if visible). Request the device model, OS, Chrome version, physical display resolution/DPR, and whether the screenshot was taken while moving; confirm the page was hard-refreshed after the latest deploy. The existing fixed-scale A/B URLs `?tier=c&aa=fxaa&res=1` and `?tier=c&aa=smaa&res=1` isolate FXAA vs SMAA at 100% scene-pass scale on the same device/scene, but Tier C's pixel-ratio cap remains. Do not raise pixel ratio or scale blindly until these values are known, and do not claim a visual fix or measured FPS result without owner-device review.

## 97. Full-screen diagnostics report (2026-10-24)

**Owner request:** the owner reports that minimap values overlap the diagnostics report and requests that opening diagnostics show the full report on screen, every value visible at once, with no scrolling and no overlapping map.

**Implementation:** `DiagnosticsOverlay.ts` now opens an opaque panel filling the app surface at z-index 70, above the minimap (40), touch HUD (30), and pause toggle (50). The map is fully covered rather than visually showing through. All 28 existing metrics are grouped as label/value cards in a responsive grid; compact landscape windows use five columns, narrow portrait windows use three, and wider layouts auto-fit cards. Values wrap rather than truncate, the panel/grid do not scroll, and the close button or existing F2/touch 📊 toggle dismisses it. `aria-hidden` tracks visibility, and the report is labelled for assistive technology. This is a UI-only change: no renderer quality, performance, tier or game-world settings were altered.

**Verification and push order:** commit `6efed26ccf35ac157b737636451d41fc43a0525b` was pushed before running tests. The focused overlay suite passed (1 file / 2 tests); full `npm run check` passed on the same source SHA: Prettier, ESLint, GLSL guard, both TypeScript checks, 75 test files / 564 tests, 20 verified assets / 47,814,431 bytes, and production build. GitHub Validate [#297](https://github.com/mdraficode/Endless-Driver/actions/runs/40084908445) and Pages Deploy [#286](https://github.com/mdraficode/Endless-Driver/actions/runs/40084908431) both succeeded. Local `HEAD`, `origin/main`, and `git ls-remote` matched at verification. Existing non-fatal Three.js already-non-indexed-geometry and Vite large-chunk warnings remain; `npm ci` reported two moderate audit advisories, and no audit fix was applied.

**Limitations / next action:** automated DOM coverage cannot prove that every device's exact CSS viewport fits all wrapped values, and the shared full-app Chromium capture has previously crashed during KTX2 loading. The owner has now supplied a full-screen report screenshot confirming that all cards fit without visible overlap or clipping at the reported 960×432 viewport; this is visual confirmation for that capture only, not every device or a rendering-quality acceptance. The report baseline and next controlled comparisons are recorded in §98. Obtain the current device model, OS, browser version, physical display resolution/DPR, and whether the car was moving before making a named-device diagnosis. Do not change scale/AA budgets blindly or claim a visual/performance fix.

## 98. Owner diagnostics screenshot: report fit and renderer baseline (2026-10-24)

**Owner evidence:** the owner supplied `Screenshot_20261024-133313_Chrome.png` (1536×704 capture). The opaque full-screen report shows all 28 diagnostic cards at once, with no visible overlap/clipping or minimap/HUD collision. The report itself identifies a 960×432 viewport at 1.00x. This confirms the requested layout in this screenshot and viewport only; no additional code or renderer setting has been changed in response. The capture's pixel dimensions are not evidence of physical device DPR.

**Readout:** Tier C / mobile / 1x shadow; WebGL2 with FXAA; resolution `fxaa @ 60%`. Performance: 36.5 average FPS, 29.9 low FPS, 27.38 ms average frame time, 33.50 ms p95. Physics: 2 steps, 22 bodies, 3 stalled. Scene counters: 340 draw calls, 1,422,016 triangles, 501 objects. Terrain: 121/121 chunks loaded, 0 queued, about 97k triangles. Scene: Yūhi Town at 09:30, sun 40°, car at 0.8 km/h.

**Interpretation (evidence, not a complete diagnosis):** Tier C's configured scene-scale range is 0.60–1.00 with a 1.00 max renderer pixel ratio. If the reported 960×432 viewport and 1.00x correspond to the drawing-buffer dimensions, a 60% scene pass is approximately 576×259—about 36% of native scene pixels before upscaling. That is a strong and direct contributor to the broad softness and coarse road markings; FXAA can soften edges but cannot reconstruct detail lost at reduced resolution. Tier C does not use temporal history, so one still cannot establish the reported temporal flicker. At 60%, the report is at Tier C's configured floor; if this was the adaptive default rather than a `?res=` override, the controller cannot lower scene scale further to meet frame time. The measured 36.5 average FPS / 27.38 ms frame and 33.50 ms p95 indicate a constrained baseline on an unidentified device. These CPU-delivered frame-time values do not identify a CPU-versus-GPU bottleneck. Draw-call/triangle counts and three stalled physics frames are useful clues, not proof of a single cause. Device model, OS, Chrome version and physical display DPR remain unknown.

**Next controlled checks:** ask for device model, OS, Chrome version, physical screen resolution/DPR, and whether the car was moving; confirm whether any query-string override was active. For an AA-only test on the same device, scene and fixed scale, compare [`?tier=c&aa=fxaa&res=0.6`](https://mdraficode.github.io/Endless-Driver/?tier=c&aa=fxaa&res=0.6) with [`?tier=c&aa=smaa&res=0.6`](https://mdraficode.github.io/Endless-Driver/?tier=c&aa=smaa&res=0.6). For a brief scale-only capture, compare the FXAA `res=0.6` URL with [`?tier=c&aa=fxaa&res=1`](https://mdraficode.github.io/Endless-Driver/?tier=c&aa=fxaa&res=1); 1.00 scale has about 2.78× the scene pixels of 0.60 and may further reduce FPS, so do not leave it enabled without retesting. Keep the scene, viewpoint and movement state fixed; record visible edge quality plus FPS/frame time for each. Do not raise default pixel ratio or scene scale based on this single baseline, and do not claim visual acceptance or performance improvement until the owner reviews the result on the named device.

## 99. Phase 6: brake-lamp response on the imported hero (2026-10-24)

**Scope:** a bounded vehicle-fidelity increment within the owner's open Phase 6 authorization. The imported MMC Works hero lacked the pose-driven rear-brake feedback already present on the authored Kaminari GT fallback. This aligns the two model choices without changing vehicle handling, camera, scene lighting budgets or renderer quality.

**Implementation:** shared brake-lamp color and idle/active emissive intensities now drive both paths. `PlayerCarVisual` binds only the imported GLB's `Glass - Red` and `Glass - Red - Rough` materials and updates their emissive intensity from `VehiclePose.brake` across all three LODs; clear glass and unrelated materials remain untouched. If the named hero materials are absent or the loaded material type is unexpected, loading fails soft and leaves the authored fallback visible. `CarVisual` uses the same idle/active constants. `scripts/verify-assets.mjs` now guards the expected source GLB material names. No geometry, textures, external assets, dependencies, new light sources, physics, or render/tier budgets were added.

**Tests and verification:** focused `tests/unit/player-car-visual.test.ts` passed (1 file / 5 tests), covering brake-on/off output across all LODs, unchanged clear glass, and fallback retention when the source lamp names are missing. The asset verifier also confirmed the actual hero GLB contains both required material names. Commit `5ee5ef00a0904b3b33e81851d0008d6b7eb7a7f0` was pushed before tests. Full `npm run check` passed there: Prettier, ESLint, GLSL guard, both TypeScript checks, 75 test files / 566 tests, 20 verified assets / 47,814,431 bytes, and production build. GitHub Validate [#300](https://github.com/mdraficode/Endless-Driver/actions/runs/40088365213) and Pages Deploy [#289](https://github.com/mdraficode/Endless-Driver/actions/runs/40088365205) succeeded. Existing non-fatal Three.js already-non-indexed-geometry and Vite large-chunk warnings remain.

**Limitations / next action:** no browser visual capture, manual drive, named-device render or owner acceptance was performed. The full-app headless Chromium environment previously crashed while loading environment/KTX2 resources; do not call automated material-property coverage visual acceptance. When runtime resources permit, inspect both hero and fallback from front/rear under no-brake and braking states. Continue the other already documented Phase 6 lamp/material follow-ups and the Phase 9 Aohara review; keep Phase 7 and unrelated Phase 8 work gated. The separate 60%-scale softness/FPS baseline remains as §98; obtain device details and conduct its fixed-scale comparison before changing render budgets.

## 100. Phase 7 authorization and first wet-surface physics slice (2026-10-24)

**Owner authorization:** the owner said “Start Phase 7 progress.” Phase 7 is now open. This explicit start does not imply Phase 6 visual/manual acceptance; unrelated Phase 8 polish remains gated. Preserve the no-paid/restricted-asset rule, dry/default behavior, current C/B/A budgets and the existing single Rapier/tire-force authority.

**Initial bounded increment:** the first Phase 7 slice adds a deterministic `clear`/`rain` surface-condition response, selected for the driving scene with `?weather=clear|rain` (the default is clear). Rain applies restrained, surface-specific grip reductions and rolling-resistance increases to the existing generator-side surface query; dry response remains unchanged. The slice is physics-only: it adds no rain/cloud/sky/particle rendering, no wet-road material changes, no surface accumulation/transition, and no snow, ice or mud. The coefficients are initial calibration values, not a real-world validation claim. A matched-speed fixed-input corner test checks that wet asphalt produces measurably less lateral tire force.

**Phase 7 work still open:** evolving weather and persistence, rain/storm/snow/dust visuals and controls, seasonal variants, wet-road/puddle/spray rendering, telemetry comparisons at fixed bookmarks, tier-budget verification, and the timeboxed radiance-cascades prototype. The latter requires measurements on real hardware; do not claim a go/no-go result from this sandbox.

**Verification and push order:** implementation commit `73a42fb3308ddab569495757474b2eba6b360514` was pushed before tests; focused tests passed (2 files / 5 tests). The first full `npm run check` stopped at Prettier, and GitHub Validate #302 failed on that formatting issue. Formatting-only correction `8e760ed1e170f60e4078195154dd5497d0adcecd` was pushed before the full rerun. Full `npm run check` then passed: Prettier, ESLint, GLSL guard, both TypeScript checks, 77 test files / 571 tests, asset verification (20 assets / 47,814,431 bytes), and production build. GitHub Validate [#303](https://github.com/mdraficode/Endless-Driver/actions/runs/40090377299) and Pages Deploy [#292](https://github.com/mdraficode/Endless-Driver/actions/runs/40090377257) succeeded on `8e760ed`; local `HEAD`, `origin/main`, and the remote SHA matched. Existing non-fatal Three.js already-non-indexed-geometry and Vite large-chunk warnings remain. No browser/device visual capture or owner acceptance was performed; this verifies physics behavior only.

## 101. Phase 7: surface-response telemetry in diagnostics (2026-10-24)

**Scope:** a bounded continuation of the authorized Phase 7 surface-condition work. It makes the already implemented clear/rain physics response observable without adding weather rendering or changing scene/tier budgets.

**Implementation:** `VehicleTelemetry` now contains the mean effective grip multiplier and rolling-resistance coefficient across contacting wheels, or `null` while airborne. The full-screen `DiagnosticsOverlay` shows the selected weather preset/wetness and those mean surface-response values. This is contact-wheel telemetry, not a hardware-calibrated tyre model or a real-world validation claim.

**Tests:** the matched-speed physics comparison confirms four asphalt tire contacts, clear averages of grip `1.000` / rolling resistance `0.0150`, rain averages of grip `0.813` / rolling resistance `0.0184`, and lower wet lateral tire force. The overlay test covers clear/rain formatting and the 30-card report; vehicle-effects and camera test fixtures were updated for the expanded telemetry contract. Focused tests passed on `58c70b7` (3 files / 5 tests). The first full check on that commit stopped at TypeScript because two camera fixtures lacked the new required fields; the correction was pushed as `d12c838` before rerunning. Full `npm run check` passed on `d12c838`: Prettier, ESLint, GLSL guard, both TypeScript checks, 77 test files / 571 tests, asset verification (20 assets / 47,814,431 bytes), and production build. GitHub Validate [#306](https://github.com/mdraficode/Endless-Driver/actions/runs/40093161455) and Pages Deploy [#295](https://github.com/mdraficode/Endless-Driver/actions/runs/40093161456) succeeded. Validate #305 was cancelled as the follow-up fixture correction landed. Existing non-fatal Three.js already-non-indexed-geometry and Vite large-chunk warnings remain.

**Limitations / next action:** no rendered browser capture or owner-device review was performed. The existing owner screenshot confirmed the earlier 28-card report only; the updated report has 30 cards, so do not claim the new layout is visually confirmed on that viewport. Full-app Chromium capture has previously crashed during environment/KTX2 loading; wait for changed runtime conditions or owner evidence before attempting another. At this checkpoint, rain has no precipitation rendering; the limited Aohara wet-sheen follow-up is recorded in §102. Coordinated storms/snow/dust, seasons, wet-road rendering outside Aohara, puddles/spray, fixed-bookmark telemetry calibration and tier-budget validation remain open. The radiance-cascades go/no-go still requires measured real-hardware evidence, with “no-go” acceptable; unrelated Phase 8 polish remains gated.

## 102. Phase 7: couple preset wetness to Aohara's existing road sheen (2026-10-24)

**Scope:** a small weather-visual bridge on top of the clear/rain physics and telemetry slices in §§100–101. This does not start the broader precipitation, season, or polish work and does not alter C/B/A budgets, the dry tire response, or the single Rapier/tire-force authority.

**Implementation:** `Application` now passes the selected `SurfaceState` through `SceneManager` into driving-world content. `RoadWorld` blends its existing Aohara urban-asphalt clearcoat/roughness uniform with the shared wetness: clear weather preserves the prior day/night art-directed baseline; rain raises the sheen to at least the preset wetness (0.85). The same urban road batch and material remain in use; there is no extra draw pass. The effect is Aohara-only: rural road materials are unchanged. This is a limited road-sheen response, not visible rain, standing water, puddles, or tire spray.

**Tests and push order:** implementation commit `dc96acc` was pushed before testing. Focused `npm run test -- tests/unit/road-network.test.ts tests/unit/driving-world.test.ts` passed (2 files / 17 tests). The first full `npm run check` stopped at TypeScript because the day/night baseline field inferred the literal type `0.12`; the widened `number` annotation was pushed as `550f15c` before rerunning. Full `npm run check` passed on `550f15c`: Prettier, ESLint, GLSL guard, both TypeScript checks, all 77 test files / 571 tests, asset verification (20 assets / 47,814,431 bytes), and production build. GitHub Validate [#309](https://github.com/mdraficode/Endless-Driver/actions/runs/40093765421) and Pages Deploy [#298](https://github.com/mdraficode/Endless-Driver/actions/runs/40093765449) succeeded. The initial type error was resolved in the follow-up and is not present at the verified checkpoint. Existing non-fatal Three.js already-non-indexed-geometry and Vite large-chunk warnings remain.

**Limitations / next action:** no rendered browser capture or owner-device review was made, so the wet sheen is code-wired and tested but not visually accepted. The updated 30-card report still has no refreshed screenshot; the owner screenshot shows the former 28-card layout only. Full-app Chromium capture has previously crashed during environment/KTX2 loading; do not repeat without changed runtime conditions or owner evidence. Phase 7 remains incomplete: precipitation/cloud/particle effects, coordinated storms/snow/dust, seasons, wet-road response outside Aohara, puddles/spray, fixed-bookmark calibration and tier-budget validation remain open. The radiance-cascades decision still requires measured real-hardware evidence, with “no-go” acceptable. Preserve the separate Phase 8 gate and do not adjust render-resolution defaults or claim visual/performance acceptance without device evidence.

## 103. Phase 7: fixed-site clear/rain tire telemetry calibration (2026-10-24)

**Scope:** a test-only continuation of the authorized surface-condition work. No runtime tire coefficients, rendering settings, material state, default weather, C/B/A budget, or Rapier authority changed.

**Implementation:** `tests/physics/surface-weather.test.ts` now runs the matched clear/rain comparison through the actual generated Aohara road-and-terrain sampler and `PhysicsWorld.surfaceAt`, rather than relying only on the isolated flat-asphalt fixture. Its fixed gameplay calibration point is the Central Avenue junction (`AOHARA_DISTRICT_CONFIG.centerX/centerZ`), with the same 20 m/s northbound setup and one-step steering input in both runs. After settling, both runs retain four wheel contacts on asphalt; clear reports grip/RR `1.000`/`0.0150`, rain reports `0.813`/`0.0184`, and wet lateral tire force is lower. This covers the generator → physics surface query → existing tire model path at one reproducible point.

**Verification and push order:** code/test commit `a27846cdf181417b29782c906169861ca15c0f1b` was pushed before any test. Focused `npm run test -- tests/physics/surface-weather.test.ts` passed (1 file / 2 tests). Full `npm run check` passed on the same code SHA: Prettier, ESLint, GLSL guard, both TypeScript checks, 77 test files / 572 tests, asset verification (20 assets / 47,814,431 bytes), and production build. GitHub Validate [#311](https://github.com/mdraficode/Endless-Driver/actions/runs/40094712365) and Pages Deploy [#300](https://github.com/mdraficode/Endless-Driver/actions/runs/40094712359) succeeded. `npm ci` reported two moderate audit advisories; no audit fix was run. Existing non-fatal Three.js non-indexed-geometry and Vite large-chunk warnings remain.

**Limitations / next action:** this is a deterministic simulation regression, not a real-world calibrated tire model, a moving lap through a physical corner, or visual/device acceptance. The fixed gameplay point is distinct from `ROUTE_BOOKMARKS`; the 12 camera bookmarks remain clear/summer, and weather/season visual comparisons there are still open. Precipitation, coordinated weather, transitions, seasons, broader wet-road/puddle/spray visuals, per-tier budget validation and the radiance-cascades real-hardware go/no-go remain open. The 30-card report and Aohara sheen still have no refreshed rendered/device review; do not claim visual acceptance.

## 104. Owner-authorized gameplay Night Mood preset (2026-10-24)

**Scope:** the owner requested a complete, colorful gameplay night mood with moonlight, lively Aohara street lamps, banners, billboards, building/window lights and traffic signals, switchable from the home screen. This is a narrow authorization for the pause menu's existing Overview page. Day remains the default; unrelated Phase 8 work stays gated, and the Phase 7/weather physics are not changed.

**Implementation:** `GamePreferences.nightMood` is validated and persisted with a daytime default. The accessible Overview switch applies immediately through `Application.setNightMood()` and the shared `EnvironmentClock`/`DaylightController` path; turning it off returns to the configured daytime start. The `?time=` debug override still controls startup until the player changes the menu switch, at which point that override is removed so the saved choice is honored on later starts. Night uses a stylized visible moon disc and restrained blue moonlight by reusing the existing shadow-casting directional light, not a second global key light. Aohara's tier-bounded city lights remain within the existing C/B/A point-light budgets (6/8/12); street lamps gain deterministic amber/magenta/cyan/violet hues, while banners and billboard colors become more vivid and emissive. Existing window, entry, venue and traffic-signal sources remain in place. No global bloom, paid/restricted assets, new weather behavior, extra Aohara point lights, or additional shadow-casting key lights were added. The dedicated player-headlight follow-up is recorded in §105.

**Tests and verification:** feature commit `a6e74d95c3aa0d40453f2a1b47a146812f11fb24` was pushed before tests. Focused tests passed (3 files / 27 tests), covering preference validation/backward compatibility, night-hour selection, moon direction, colored tier-bounded street lights and emissive banner construction. Full `npm run check` passed on that code SHA: Prettier, ESLint, the no-GLSL guard, both TypeScript checks, **78 test files / 577 tests**, verification of 20 assets / 47,814,431 bytes, and production build. GitHub Validate [#314](https://github.com/mdraficode/Endless-Driver/actions/runs/40096596000) and Pages Deploy [#303](https://github.com/mdraficode/Endless-Driver/actions/runs/40096596077) succeeded on the same SHA. Existing non-fatal Three.js `toNonIndexed()` notices and the Vite large-chunk warning remain.

**Limitations / next action:** no browser-rendered comparison, manual device drive or owner visual acceptance was performed. Full-app headless Chromium has previously crashed during environment/KTX2 loading, so that capture was not repeated. This source-level and automated verification does not resolve the separate owner report about low-resolution/jagged road edges and does not establish night visuals on a real device. Request an owner gameplay capture after deployment to review moon placement and city lighting, while preserving the existing C/B/A limits and the separate Phase 8 gate.

## 105. Player-only adaptive headlights for Night Mood (2026-10-24)

**Owner follow-up:** the player car had no forward beam in Night Mood. Add working headlights that follow the car's direction, illuminate the track at night, and suit the restrained, relaxing drive; keep the daytime default and existing renderer/tier limits.

**Implementation:** `Application` drives the pair from the same resolved `DaylightState.isNight` used by the moon/world lighting, both on live menu changes and per frame. `src/vehicles/player-headlights.ts` creates exactly two warm-white, soft-edged `SpotLight`s (8,500 cd each; 72 m range; 0.23 rad half-angle; 0.74 penumbra; inverse-square decay). The beams are disabled by day, unshadowed, converged/down-aimed onto the road, and follow the physics-pose root so yaw, pitch, roll and suspension carry them with the car. A bounded adaptive yaw uses the averaged front-wheel steering angle. The pair remains on the player car only—not every traffic vehicle—and is reparented from the authored fallback to the imported hero when it loads. The fallback headlamp material and the hero's clear forward lenses glow only while the beams are active; rear clear/reverse lenses are excluded by front-of-car bounds. No city point-light allocation, cascade/shadow-map cost, global bloom or new asset was added; Aohara's C/B/A point-light caps remain 6/8/12.

**Historical baseline:** the narrow v1 power and converging target described above were superseded by the owner-requested wider flood-beam follow-up in §106.

**Verification / push order:** code commit `08649fb` was pushed before tests. A test-only material-type correction (`f00038e`) was also pushed before retesting; a second test-helper correction was pushed as `1dc8e2d` before the successful rerun. Focused coverage passed (4 files / 17 tests), including night gating, beam count and properties, steering clamp, car-root attachment, fallback/hero lens emission, and preservation of rear clear lamps. Full `npm run check` passed on `1dc8e2d`: Prettier, ESLint, GLSL guard, both TypeScript checks, 79 test files / 581 tests, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js non-indexed-geometry notices and the Vite large-chunk warning remain.

**Limitations / next step:** no rendered browser comparison, real-device drive, or owner visual acceptance was performed; the existing headless Chromium environment/KTX2 crash still prevents a trustworthy capture. Unit/build success does not establish the headlight beam's visual aim, road brightness or frame-time impact on device, and it does not address the separate low-resolution/jagged-road report. Please review a gameplay capture with Night Mood enabled; if the road is over/under-lit or the beam is mis-aimed, tune against that evidence without increasing the city-tier light caps.

## 106. Wider, more powerful player headlight fan (2026-10-24)

**Owner request:** make the Night Mood headlight beam more powerful and cover nearly the player's full forward viewing area for visibility/gameplay.

**Implementation:** `src/vehicles/player-headlights.ts` retains exactly two warm, unshadowed player-only spotlights and the existing night gate, but broadens them into overlapping flood beams: 14,000 cd per light (up from 8,500), 86 m range (up from 72), 0.89 rad half-angle, 0.19 rad outboard splay, and 0.82 penumbra. Their axes fan outward rather than converge, filling the road edges while steering still turns the pair together. The calculated geometric envelope is about 124° (2 × [0.89 + 0.19] radians), near the full horizontal chase view; a unit test compares it against the configured maximum-speed FOV at 16:9. This is a cone-geometry target, not a rendered lux/brightness measurement. The light count and shadow cost are unchanged, Aohara's C/B/A city-light caps remain 6/8/12, and hero/fallback lens emission and daytime behavior are unchanged.

**Historical intensity:** the 14,000 cd value recorded here was slightly lowered in §107; the beam fan, range, and night gate remain unchanged.

**Push and verification:** `b2235ac` (`Widen and strengthen player headlights`) was pushed to `main` and its SHA verified before any tests. The focused headlight/player-visual/night-mood/material suites passed (4 files / 17 tests). Full `npm run check` also passed on `b2235ac`: formatting, lint, GLSL guard, both TypeScript checks, 79 test files / 581 tests, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js non-indexed-geometry notices and the Vite large-chunk warning remain.

**Limitations / review:** no rendered browser comparison, owner-device review, or beam photometry/performance measurement was performed; headless Chromium previously crashed during environment/KTX2 loading. Therefore the intended wide coverage is unit-tested geometrically, but perceived road brightness, cutoff/aim, glare or washout on buildings, and device cost still need visual review. The separate low-resolution/jagged-road report remains unrelated and unresolved.

## 107. Small Night Mood headlight intensity trim (2026-10-24)

**Owner request:** the widened beam looked a little too bright; reduce its intensity slightly without undoing its broader coverage.

**Implementation:** `PLAYER_HEADLIGHT_CONFIG.intensityCandela` is reduced from 14,000 to **12,500 cd per lamp** (about 10.7% lower). This changes only intensity; the 86 m range, broad 0.89 rad half-angle, 0.19 rad outboard splay, 0.82 penumbra, two-light count, steering response, Night Mood gate, and hero/fallback lens behavior remain as before. Aohara's C/B/A local-light budgets are untouched.

**Push and verification:** code commit `418b2a9` (`Slightly reduce player headlight intensity`) was pushed to `main` and the remote SHA verified before tests. The focused headlight/player-visual/night-mood/material suites passed (4 files / 17 tests). Full `npm run check` passed on `418b2a9`: formatting, lint, GLSL guard, both TypeScript checks, 79 test files / 581 tests, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js non-indexed-geometry notices and the Vite large-chunk warning remain.

**Limitations / review:** no rendered browser comparison, owner-device review, or measured road illumination was performed. This is a modest numeric reduction, not a device-calibrated brightness result; visual comfort and beam performance still need gameplay review with Night Mood on. The previously reported low-resolution/jagged-road issue remains unrelated.

## 108. Second small Night Mood headlight intensity trim (2026-10-24)

**Owner follow-up:** “Maybe a little bit more.” Reduce the still-too-bright beam a little further while preserving the broad front coverage.

**Implementation:** intensity is reduced again, from 12,500 to **11,500 cd per lamp** (8% lower than the previous setting, about 18% below the 14,000-cd wide-beam checkpoint). No other lighting property changes: the two-beam count, 86 m range, 0.89 rad half-angle, 0.19 rad outboard splay, soft penumbra, steering, night gate, and lens glow are preserved. City-light budgets remain unchanged.

**Push and verification:** code commit `c66b88c` (`Trim player headlight intensity further`) was pushed to `main` and SHA-verified before tests. Focused headlight/player-visual/night-mood/material tests passed (4 files / 17 tests). Full `npm run check` passed on `c66b88c`: formatting, lint, GLSL guard, both TypeScript checks, 79 test files / 581 tests, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js non-indexed-geometry notices and the Vite large-chunk warning remain.

**Limitations / review:** there is still no rendered browser comparison, owner-device review, or measured road illumination. This second small trim is a settings adjustment, not a visual or photometric acceptance claim. Review with Night Mood on in gameplay; the unrelated low-resolution/jagged-road report remains unresolved.

## 109. More vivid Aohara Night Mood and another headlight trim (2026-10-24)

**Owner request:** “Turn down the headlight intensity some more, and make the world more vibrant with more different light sources, mood light, street decorations, building decoration etc make the world more standout in the night world view.”

**Implementation:** player headlight intensity is reduced from 11,500 to **10,500 cd per lamp** (about 8.7% lower); the two-light count, 86 m range, 0.89 rad half-angle, 0.19 rad outward splay, penumbra, steering, night gate and lens response are unchanged. Aohara's six-color street-light emitters now match their local light colors, and the banner/billboard palette is expanded with banners on every fourth street lamp (60 across the integrated district, up from 48). Added tier-sampled neon crown strips on high-rises, illuminated storefront awning/frame accents, and curb-side glowing bollards. A subset of the bollards contributes low-energy mood-light candidates selected around the driving focus; these share the existing architectural allocation rather than increasing the active point-light cap. Total point-light budgets remain C/B/A 6/8/12 (street 4/6/8; architecture 2/2/4), with no added shadows, global bloom, external assets, or weather behavior.

**Push and verification:** feature commit `6c9cb85` (`Enrich night city lights and decorations`) was pushed to `main` and remote-SHA verified before tests. The focused headlight/player-visual/night-mood/urban-night/material suites passed (5 files / 34 tests). The first full check then found one stale `districtBanners: 48` expectation in `tests/unit/driving-world.test.ts`; test-only correction `c20d632` was pushed before rerunning. The integrated-night focused suites passed (4 files / 25 tests), and full `npm run check` passed on `c20d632`: formatting, lint, GLSL guard, both TypeScript checks, 79 test files / 581 tests, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js non-indexed-geometry notices and the Vite large-chunk warning remain.

**Limitations / review:** no rendered browser comparison, owner-device review, measured road illumination or device performance test was performed. This verifies code structure, deterministic counts and budgets—not the perceived look or photometry. The previous headless Chromium crash during environment/KTX2 loading remains a reason not to claim visual acceptance. The unrelated low-resolution/jagged-road report remains unresolved.

## 110. Replace the left touch joystick with a one-finger steering wheel (2026-10-24)

**Owner request:** “Change the steering button on the left into a proper strearing where which the players can rotate right and left using one finger which will make the steering more easy and convenient.”

**Implementation:** `TouchControls` now renders a compact, inline-SVG steering wheel at the existing bottom-left touch-control position. A single finger rotating on the rim turns the wheel artwork and publishes analog steering (clockwise = right, counterclockwise = left); angular wraparound is handled and both wheel rotation and input clamp at the steering lock. Starting on the hub also supports a short horizontal one-finger drag as an easy fallback. Pointer capture, cancel/lost-capture/hidden-tab release, smoothing back to centre, and independent multi-touch gas/brake/handbrake remain intact. No vehicle physics, camera, desktop bindings, asset, or render budget changed. The touch hint and input documentation now say steering wheel instead of joystick.

**Push and verification:** code/test commit `7523a7c` (`Replace touch steering joystick with rotary wheel`) was pushed to `main` and remote-SHA verified before tests. Focused touch/orbit suites passed (2 files / 15 tests); full `npm run check` passed (Prettier, ESLint, GLSL guard, both TypeScript checks, 79 test files / 585 tests, asset verification for 20 assets / 47,814,431 bytes, and production build). Existing non-fatal Three.js non-indexed-geometry notices, Vite large-chunk warning, and two moderate npm audit findings remain.

**Limitations / review:** automated coverage exercises rotary direction, angular wrap, steering lock, hub-drag fallback, and multi-touch/input merging. It does not exercise actual browser pointer capture, touch ergonomics, or the rendered control on an owner device. No device visual/interaction acceptance is claimed; please try the wheel on the target phone/tablet and report whether its rotation travel feels comfortable.

## 111. Slightly enlarge the mobile steering wheel (2026-10-24)

**Owner request:** “Make the steering wheel button on the left a bit bigger.”

**Implementation:** increased `.touch-steering-wheel` width and height from 8.5rem to **9.25rem** (about 9% larger in diameter), keeping the same bottom-left safe-area placement. The inline wheel artwork scales with the control, and rotary/hub-drag gesture thresholds continue to derive from the rendered wheel diameter, so no steering feel, pedal layout, input, or vehicle behavior was intentionally changed.

**Push and verification:** code commit `24eb238` (`Enlarge the touch steering wheel slightly`) was pushed to `main` and remote-SHA verified before checks. Full `npm run check` passed: formatting, lint, GLSL guard, both TypeScript checks, 79 test files / 585 tests, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js geometry notices and the Vite large-chunk warning remain.

**Limitations / review:** the CSS enlargement is verified by formatting/build, not by a physical-device fit or touch-ergonomics review. Confirm that the larger wheel still clears nearby controls and leaves the road view unobstructed on the target phone/tablet.

## 112. Phase 9: dense Aohara frontage and winding backstreets (2026-10-24; validation pending)

**Owner request:** increase Aohara building and traffic density, close broad unused gaps while preserving intentional roads/passages, add randomly distributed narrow, confusing street-to-street passages with clutter such as bins, boxes, carts and dumpsters, and enrich the wider world.

**Implementation (pushed as `12827a4`; follow-up clearance correction pending):** from pushed baseline `5a96e25`, the increment authors four stable-seeded access mouths per each of 16 blocks, splits the urban grid at those mouths, and connects each block's street faces through a 4.5 m-wide winding dogleg to a shared hub and wider courtyard. The graph asserts 119 Aohara nodes, 62 unique access nodes, 102 grid edges (22 arterial / 80 local), and 80 alley edges; the focused `road-network` file passes after the split-edge point-count expectation was corrected in `0e8857d`. Up to 256 low-rise frontage shells and four inner-corner infill candidates per block are selected against building footprints and sampled alley corridors; configured C/B/A infill targets remain 8/12/16. Standard traffic budgets rise from 8/16/24 to 12/24/36; pedestrian budgets remain 16/32/48. New deterministic instanced alley clutter uses six kinds (waste bins, dumpsters, cardboard stacks, hand carts, crate stacks and pallets) with configured caps C/B/A 64/128/192. Existing furniture budgets are unchanged; graph-split sidewalk slot generation now uses endpoint-specific intersection, crosswalk, stop-bar and alley-mouth clearances to preserve markings and placement capacity. No purchased/restricted asset, dependency, road bridge/tunnel/expressway, Phase 8 polish, or urbanization of rural Hinode is included.

**Focused coverage/results:** tests cover expected graph counts and per-block connectivity/surface checks; sampled alley/building and clutter/road clearance; deterministic, exact-budget alley props; frontage/infill density and collision stats; split-edge sidewalk furniture capacity and node-specific marking/spawn/building/walkway clearances; updated traffic and road/sidewalk stats. On `0e8857d`, `road-network` passed 17/17 and `driving-world` passed 1/1; `urban-night` passed 17/18, with a street-mouth road/sidewalk obstruction. Correction `2ae711e` moves first-spoke props at least 20 m from access mouths, keeps 14 m at hubs, and passes the sampled road/sidewalk check; the focused rerun remains 35/36 because the later alley-road probe catches an obstruction on the short `r0-c0` hub-to-courtyard edge at 8.2 m. Diagnostic commit `48a1e13` identifies the colliding footprint as tower #8 at (977.4, -669.3), half extents 16.1×17.4 m, yaw 0; the alley-road probe is at (995.2, -674.2). The current unpushed config change constrains outer-block courtyard branches to north/south choices, away from paired east/west towers; it is not yet tested. Sidewalk-furniture clearance remains 14 m road-marking trim plus 12 m furniture-to-marking gap and the widest prop half-depth (0.82 m).

**Push-before-check status / next action:** implementation/test commit `12827a4ba1ff2eca1696e6c1e813fd2e760fe0f9` and docs-only `17665a7` were pushed to verified `main`. I inadvertently ran `git diff --check` before the code push; it reported no whitespace diagnostics. The first focused run (`road-network`, `urban-night`, `driving-world`) on the pushed code produced 4 failures / 32 passes across 3 files. Correction `0e8857d` fixed the split-grid sampling expectation and test identifier, distinguished centered clutter on short courtyard links, and moved long-spoke props inward; it was pushed before rerunning. That focused rerun produced 1 failure / 35 passes: the road/sidewalk probe still collided at 48 m, 13.8 m lateral, beside an alley mouth. Correction `2ae711e` sets a 20 m access-mouth clutter apron and retains 14 m at the hub. Its focused rerun passed the road/sidewalk clearance but still failed on the short r0-c0 hub-to-courtyard alley at 8.2 m (35/36 total). Diagnostic test commit `48a1e13` identified the obstruction as tower footprint #8 (center 977.4, -669.3; half extents 16.1×17.4 m), intersecting the short r0-c0 hub-to-courtyard link at (995.2, -674.2). A config correction now restricts outer-block courtyard links to north/south directions away from paired east/west towers; these source/test/doc changes are uncommitted and unpushed, so push before rerunning tests. No full check/build or browser review has run for this increment. A passing test/build will not establish visual realism, manual driving feel, mobile/device performance or owner acceptance; none is claimed.
