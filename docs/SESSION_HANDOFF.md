# Session Handoff — Endless Driver

**Updated:** 2026-10-27  
**Latest full-check checkpoint:** code commit `6cc83b7` pushed before checks. Full `npm run check` passed at `6cc83b7`: Prettier, ESLint, GLSL guard, both TypeScript checks, **87 test files / 664 tests**, 20 verified assets / 47,814,431 bytes, and production build (large-chunk warning non-fatal). The checkpoint is **Phase 8.3e set-back massing** (see §148), the fourth pass after the repeated "still looks like boxes with some little square boxes on it" verdict: with the wall-surface levers (detail, rhythm, height runs, windows, street life) all spent, 8.3e changes the silhouette itself — every eligible street shell becomes a full-footprint podium (top mid-spandrel of the 2.6 m rhythm) plus an upper volume set back 1.2–2.5 m from the street face, with terrace slabs, roofs on the set-back volumes only, and the windows/bands/cladding/masts following both volumes; cladding goes flush so the top window row glows in front of the parapet band. Colliders keep the full bounding box (no physics change); shells stay in the same instanced colour batches (no new draw calls). Before it: **8.3d window-wall treatment** `041e5d5` (§147) — shopfront glow rows, 1.9 × 1.7 m ribbon windows with per-building occupancy, masts replacing the penthouses; **8.3c massing break** `0d92581` (§146); **8.3b facade bolding** `2eca343` (§145); **8.3 facade densification** `64bdf70` (§144). Further back: the **auto-fullscreen re-arm** `8588589` (§143), the **street-light round** `c3aa0c2` (§142) and the **three-bug re-fix** `33102c9` (§141). Phase 8.2b street life (`dcc630b`, §140) is in place and folds into the next owner device pass. The §139 three-symptom approach (`44b1ddd`) was **rejected on the owner's device** and has been superseded by §141; §138, §137, §136, §135, §134, §133 and §132 remain in place. No rendered/device visual acceptance is established; the owner's drive on Android Chrome (with the build tag from the loading footnote) is the next gate.
**Current loading change:** after the owner reported that 12–16 percentage points/second reached 100% too early and then waited, revision `e7c0217` slowed the estimate to 6–8 points/second, held visible progress at 99% until the true first-playable-frame signal, then filled the last 1% at 12 points/second. The owner then reported a freeze near 64%. Source review found that startup foliage generation was being done in synchronous batches of eight chunks on the main thread; revision `7e6f384` now yields before preparation and between individual chunks, reports each completed chunk, and preserves the existing progress cap/readiness gate. This is a likely-stall mitigation, not proven device acceptance. The source/test commit was pushed before tests; local and remote `main` matched at `7e6f384`. No live-browser or affected-device review has been performed.  
**Current wet-road/handbrake task (2026-10-25):** The owner first requested localized Aohara wet patches with scene reflections and a larger handbrake; implementation `e5af1a7` provides the deterministic feathered mask, mask-driven PBR, patch-gated tiered SSR, and a 3.8 rem face. The owner has now asked to make the brake larger again and widen its touch activation zone above the face. The current worktree enlarges it to 4.5 rem and adds a transparent hit extension 1.25 rem upward and 0.9 rem to each side, with a CSS contract regression; button position and pointer tracking are unchanged. The follow-up source/test/docs edits were pushed at `8f9d654` before checks; local/remote `main` matched and the tree was clean. Full `npm run check` subsequently passed at `a5f330a`. The initial check on `68ce920` stopped at TypeScript because `post-chain.ts` omitted the TSL `mix` import; correction `413d029` was pushed before the successful full run. The first implementation push required restoring execute permission on the workspace `askpass.sh`; `npm ci` previously succeeded with two moderate audit findings, no audit fix. SSR is screen-space only and cannot reflect off-screen content; do not claim device visual/performance acceptance.

**Current car-model report (2026-10-25):** the owner says Android Chrome starts with the Roadster, and changing the model leaves a black/frozen view. Follow-up answers confirmed the Car Model page marked Roadster selected after a hard refresh. The clean-storage default remains Generic; persisted preferences intentionally override it. Source review found model changes went through full renderer teardown/rebuild. The in-place model swap and menu regression were pushed at `3530b24`; full checks passed at `0b8487c` (83 test files / 614 tests, 20 verified assets / 47,814,431 bytes, production build). Android reproduction and acceptance remain pending.
**Latest loading/fullscreen report (2026-10-25):** the owner reports Android Chrome in a normal top-level tab; the explicit fullscreen control works, but automatic page-interaction retries do not. The loading pulse is visible but still too subtle; reduced-motion status is unknown. Commit `76cc806` raises pulse contrast in normal and reduced-motion modes, confirms actual standard/WebKit fullscreen state before declaring success, keeps retries armed after a no-op resolution, and re-arms after fullscreen exit for the next page interaction. Full `npm run check` passed at `28c526b` (84 files / 618 tests, 20 verified assets / 47,814,431 bytes, production build); Validate #431 / Pages Deploy #420 succeeded and the deployed assets contain the revision. Progress arithmetic and first-playable-frame reveal gating are unchanged. No cause or device acceptance has been confirmed on-device.

**Authorized scope:** Phase 6, Phase 7 and Phase 9 remain authorized. On 2026-10-25 the owner additionally opened Phase 8 for the living-city / real-architecture / endless-wilderness tracks (the approved plan is `docs/proposals/urban-vitality-endless-world-20261025.md`): facade kit (done at `2228034`), street life (cyclists/vendors/maniacs done at `53b1188`; alley sitters, home enter/exit and easter eggs done at `dcc630b`), wilderness track generation and fauna charges (not started). Hard constraints on all of it: tier budgets C/B/A, no frame drops or gameplay sacrifice, fast loading (tier C ring-0 startup preserved), fictional Hinode/Aohara, no paid/restricted assets, no global bloom, single Rapier physics authority. Other unrelated Phase 8 polish remains gated. Phase 6 rendered/manual acceptance remains pending. Preserve the Aohara default spawn, unobstructed forward track, immediate vehicle-translation following and drive-start recenter.
**Verification history:** after `e5af1a7` and `68ce920` were pushed, the first `npm run check` passed Prettier, ESLint, and the GLSL guard but stopped at TypeScript (`post-chain.ts(502,24)`) because the TSL `mix` helper was not imported; tests, assets, and build did not run. The import correction was pushed as `413d029`. After the 4.5 rem HB/upper hit-zone follow-up was pushed as `8f9d654` and docs were updated, full `npm run check` passed at code checkpoint `a5f330a`: formatting, lint, GLSL guard, both TypeScript checks, 83 test files / 613 tests, 20 verified assets / 47,814,431 bytes, and production build. Existing non-fatal Three.js geometry notices and Vite large-chunk warning remain. The car-model in-place-swap code was pushed before testing and full `npm run check` passed at `0b8487c` (83 test files / 614 tests, 20 verified assets / 47,814,431 bytes, production build); Android device acceptance remains open.

**Next action:** the pending device verification covers §141 (three-bug re-fix, `33102c9`), the street-light round (§142, `c3aa0c2`), the auto-fullscreen re-arm (§143, `8588589`) and the facade rounds — 8.3 (§144, `64bdf70`), the 8.3b bolding pass (§145, `2eca343`), the 8.3c massing break (§146, `0d92581`), the 8.3d window-wall treatment (§147, `041e5d5`) and the 8.3e set-back massing (§148, `6cc83b7`, the latest). On Android Chrome, open https://mdraficode.github.io/Endless-Driver/ in a **private/incognito window** (bypasses any stale cache) and watch the whole sequence: (1) the loading bar now **creeps forward for as long as the graphics pre-compile takes** (a minute or more on this device is expected on a first run — the bar keeps moving the whole time, so it reads as work, not a stall); (2) when the loading screen fades, the **Generic Sports Car** is there from the very first frame — no moment of the roadster; (3) the game is **drivable immediately** — no 1–3 minute frozen world; (4) **any** touch/tap — including one on the loading screen itself — should enter fullscreen while the page is not fullscreen yet (the retries are armed from page load now, §143); if it does not, the console now logs _why_ the browser refused the request — include that line in the report; (5) F2/📊 → "Graphics" `ok`, "Frame errors" `none`; no frame drops, loading still ends; (6) at night in Aohara: the halogen street lights with their diffraction spikes read as city lighting (not neon, not too bright, not too weak), driving into a lamp pole folds it and tumbles the head, and street life reacts to being hit; (7) **the Aohara facades read as a street of buildings, not a grid of bare boxes** — from the road you should now see: **stepped building silhouettes** (a wider base with the upper floors set back from the street, dark terrace slabs at the step — no more flat wall of identical prisms), at street level a **line of glowing shopfronts** (warm and cool, with some dark closed shops), above it a **dense grid of lit windows** where some blocks glow and others sit dark, varied heights per block side, slab lines, a lighter parapet crown, corner strips, awnings and slim rooftop masts (the verdict to report: "still boxes" or "reads as a city"; if the verdict is again *verbatim identical* to an earlier one, check the build tag first — the old bundle may still be cached, and this round's stepped silhouettes are impossible to confuse with any previous build; if it is genuinely still boxes, the next step is a full district re-plan). The loading footnote shows the deployed **build tag** — screenshot any failure with it visible. Phase 8.2b (alley sitters, home enter/exit doors, easter eggs, `dcc630b` §140) and the street-light round (§142, `c3aa0c2`) fold into the same device pass. Then: 9.1 before 7.2 and 7.3.

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

**Latest owner correction (2026-10-25):** after the `4ac1b6c` fix was deployed, the owner again reports that the loading bar is not visibly breathing and fullscreen is not working on page interaction. The live Pages stylesheet and JavaScript bundle were checked and do include the previous 3.2-second pulse and click listener, so this is not simply a missing deployment of that change; affected-device behavior remains unverified. New source/test commit `46ca66e` makes the full bar track pulse its border, background and glow as well as strengthening fill opacity/brightness; reduced-motion users get a slower, gentler track/fill pulse. Mouse fullscreen requests now use `click` rather than pre-click `pointerdown` so the request is made on the completed activation; touch/pen `pointerup`, click fallback, keyboard and legacy `touchend` remain. The source/tests were pushed before validation. Full `npm run check` passed at `e4cb27c` (84 test files / 616 tests, 20 verified assets / 47,814,431 bytes, production build); GitHub Validate / Pages Deploy succeeded. The live bundle spot-check confirms deployment, not actual device rendering or fullscreen success. Browser gesture and OS policy can still refuse fullscreen.

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

**Implementation (pushed as `12827a4` with clearance corrections through `1d1731c`; automated checks passed):** from pushed baseline `5a96e25`, the increment authors four stable-seeded access mouths per each of 16 blocks, splits the urban grid at those mouths, and connects each block's street faces through a 4.5 m-wide winding dogleg to a shared hub and wider courtyard. The graph asserts 119 Aohara nodes, 62 unique access nodes, 102 grid edges (22 arterial / 80 local), and 80 alley edges; the focused `road-network` file passes after the split-edge point-count expectation was corrected in `0e8857d`. Up to 256 low-rise frontage shells and four inner-corner infill candidates per block are selected against building footprints and sampled alley corridors; configured C/B/A infill targets remain 8/12/16. Standard traffic budgets rise from 8/16/24 to 12/24/36; pedestrian budgets remain 16/32/48. New deterministic instanced alley clutter uses six kinds (waste bins, dumpsters, cardboard stacks, hand carts, crate stacks and pallets) with configured caps C/B/A 64/128/192. Existing furniture budgets are unchanged; graph-split sidewalk slot generation now uses endpoint-specific intersection, crosswalk, stop-bar and alley-mouth clearances to preserve markings and placement capacity. No purchased/restricted asset, dependency, road bridge/tunnel/expressway, Phase 8 polish, or urbanization of rural Hinode is included.

**Focused coverage/results:** tests cover expected graph counts and per-block connectivity/surface checks; sampled alley/building and clutter/road clearance; deterministic, exact-budget alley props; frontage/infill density and collision stats; split-edge sidewalk furniture capacity and node-specific marking/spawn/building/walkway clearances; updated traffic and road/sidewalk stats. On `0e8857d`, `road-network` passed 17/17 and `driving-world` passed 1/1; `urban-night` passed 17/18, with a street-mouth road/sidewalk obstruction. Correction `2ae711e` moves first-spoke props at least 20 m from access mouths, keeps 14 m at hubs, and passes the sampled road/sidewalk check; the focused rerun remains 35/36 because the later alley-road probe catches an obstruction on the short `r0-c0` hub-to-courtyard edge at 8.2 m. Diagnostic commit `48a1e13` identified tower #8 at (977.4, -669.3), half extents 16.1×17.4 m, yaw 0, intersecting the r0-c0 courtyard probe at (995.2, -674.2). Config correction `a2cfe45` restricts outer-block courtyards to north/south, away from paired east/west towers, and clears that overlap. The focused run after `a2cfe45` found a separate alley-prop collision on the r2-c3 spoke at 46.5 m, lateral −1.2 m (building hits: none). Fix `1d1731c` raises prop-to-pavement vehicle clearance to 1.4 m and passed the focused rerun: `road-network` 17/17, `urban-night` 18/18 and `driving-world` 1/1 (36/36 total). Repeated non-fatal Three.js `BufferGeometry.toNonIndexed()` notices occurred in the driving-world test. Sidewalk-furniture clearance remains 14 m road-marking trim plus 12 m furniture-to-marking gap and the widest prop half-depth (0.82 m). `npm run check` passed on `19184c3` after formatting and test-type fixes: format, lint, GLSL guard, both TypeScript checks, 79 test files / 587 tests, asset verification (20 assets / 47,814,431 bytes), and production build. Non-fatal Three.js `BufferGeometry.toNonIndexed()` notices and the Vite large-chunk warning remain. No rendered/manual-drive or device/performance review has been performed for this increment.

**Push-before-check status / next action:** implementation/test commit `12827a4ba1ff2eca1696e6c1e813fd2e760fe0f9` and docs-only `17665a7` were pushed to verified `main`. I inadvertently ran `git diff --check` before the code push; it reported no whitespace diagnostics. The first focused run (`road-network`, `urban-night`, `driving-world`) on the pushed code produced 4 failures / 32 passes across 3 files. Correction `0e8857d` fixed the split-grid sampling expectation and test identifier, distinguished centered clutter on short courtyard links, and moved long-spoke props inward; it was pushed before rerunning. That focused rerun produced 1 failure / 35 passes: the road/sidewalk probe still collided at 48 m, 13.8 m lateral, beside an alley mouth. Correction `2ae711e` sets a 20 m access-mouth clutter apron and retains 14 m at the hub. Its focused rerun passed the road/sidewalk clearance but still failed on the short r0-c0 hub-to-courtyard alley at 8.2 m (35/36 total). Diagnostic test commit `48a1e13` identified tower #8 (center 977.4, -669.3; half extents 16.1×17.4 m) at the r0-c0 courtyard. Config correction `a2cfe45` restricted outer-block courtyard links to north/south and cleared that collision. The later prop collision on the r2-c3 spoke was resolved by `1d1731c`, which increases vehicle clearance from alley props to 1.4 m. This source change was pushed before its focused rerun, which passed 36/36 across 3 files. Formatting corrections `43bf8a2` / `6f1e41f` and test-type fix `e249a0f` were each pushed before retrying. `npm run check` ultimately passed on `19184c3`: format, lint, GLSL guard, TypeScript, 79 files / 587 tests, 20 assets / 47,814,431 bytes and production build. The Vite large-chunk warning and non-fatal Three.js geometry notices remain. Rendered/manual-drive, visual/device/performance and owner acceptance are still pending. A passing test/build will not establish visual realism, manual driving feel, mobile/device performance or owner acceptance; none is claimed.

## 113. Slightly enlarge left steering arrows and widen their touch targets (2026-10-25)

**Owner request:** “Make the left side steering arrow button a bit bigger and make the button activation area more wide so that they register touch even if the touch is outside of the button border.”

**Implementation:** `.touch-steering-arrow` in `src/style.css` now has a 6.2 × 6.8 rem tappable button box; its visible border/face is inset 0.4 rem on every side, giving a 5.4 × 6.0 rem visible control while leaving the transparent area around it active. This is a modest increase from 4.4 × 5.1 rem and makes the hit area extend about 6.4 px beyond the face at the default control scale. The arrow-pair gap is removed so the larger targets meet without a dead strip. Existing pointer tracking, capture/release, touch state, and live Gameplay Options scale are unchanged. `src/input/README.md` documents the larger face and transparent hit area.

**Push-before-check / validation:** implementation commit `68e7a663234d86da8455bb5c37ea89494385d420` (`Enlarge touch steering arrow controls`) was pushed to `main`; local and remote SHAs matched before checks. The first `npm run check` stopped at `prettier --check .`, which reported only `src/input/README.md` formatting; later stages did not run. Formatting/docs commit `646f6c94eee80c611cc90ec822961c1c8341f4a1` was then pushed and remote-SHA verified before retrying. Full `npm run check` passed on `646f6c9`: Prettier, ESLint, GLSL guard, both TypeScript checks, **80 test files / 596 tests**, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js `BufferGeometry.toNonIndexed()` notices and the Vite large-chunk warning remain. `npm ci` reported two moderate audit findings; no audit fix was run.

**Limitations / next action:** no browser or physical-device touch review has been performed. This verifies formatting/build and preserves the pointer-handling code; it does not establish touch ergonomics or rendered acceptance on an owner device. Please try the wider target on a phone/tablet when convenient.

## 114. Fade gameplay touch buttons until pressed (2026-10-25)

**Owner request:** “Make all the buttons transparent and only become normally visible when touched.” Scope was clarified to gameplay touch controls only, with a faint idle appearance; menus and settings remain normally visible.

**Implementation:** all button descendants of `.touch-controls` now use 18% opacity at rest and return to full opacity while pressed or active; keyboard focus also reveals them fully for accessibility. This includes the steering wheel/arrows, brake/gas/N₂O/handbrake and the gameplay utility buttons. Opacity does not alter their active hit boxes, pointer handling, or the menu/settings buttons. `src/input/README.md` records the behavior.

**Push-before-check / validation:** code/docs commit `18f66c0957f2df8d2d4d6c97f60bd6b7f9ced49d` (`Dim gameplay touch controls until pressed`) was pushed to `main`, and the local/remote SHAs matched before checks. Full `npm run check` passed on that SHA: Prettier, ESLint, GLSL guard, both TypeScript checks, **80 test files / 596 tests**, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js `BufferGeometry.toNonIndexed()` notices and the Vite large-chunk warning remain. `npm ci` reported two moderate audit findings; no audit fix was run.

**Limitations / next action:** no browser or physical-device review has been performed. This confirms automated checks and preserves input behavior, but not the perceived idle visibility or touch response on an owner device. Please review it during gameplay on a phone/tablet.

## 115. Smooth the final startup-progress phase (2026-10-25)

**Owner report:** the loading screen appears stuck at 94% for a long time and feels uneven. The owner asks that progress fill gradually and smoothly rather than remain parked at a percentage.

**Implementation:** the actual startup fraction remains monotonic and 100% still waits for the first playable frame. At the final `0.94` checkpoint, the display changes from a frozen number to “Almost ready…” / “Finishing the first playable frame…”, and the bar eases toward 99% over 10 seconds with a moving sheen. The progressbar keeps its last reported numeric value and an accessible finalizing description, so the visual estimate does not claim completion. The last step to 100% remains tied to the rendered first frame. The regular progress transition is lengthened to 480 ms; reduced-motion preferences disable the long crawl/shimmer. `tests/unit/loading-screen.test.ts` covers the 94% finalizing state and completion transition.

**Push-before-check / validation:** code/docs/test commit `7a1939a7adc29f0d29a09be0167785dff3641bca` (`Smooth the final loading progress phase`) was pushed to `main`, and local/remote SHAs matched before checks. Full `npm run check` passed on that SHA: Prettier, ESLint, GLSL guard, both TypeScript checks, **80 test files / 596 tests**, asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js `BufferGeometry.toNonIndexed()` notices and the Vite large-chunk warning remain. `npm ci` reported two moderate audit findings; no audit fix was run.

**Limitations / next action:** no browser/runtime timing review on an owner device has been performed. The last phase is a presentation estimate, not a claim that the final GPU/render work has a fixed duration; the shimmer indicates that the first frame is still pending. Please verify the perceived loading behavior on the device where 94% felt stuck.

## 116. Keep startup progress visibly moving during stalled stages (2026-10-25)

**Owner correction:** The prior CSS-only crawl still looked stuck at 94%. The bar must continue moving smoothly toward 100% during a long wait at any reported stage, while actual readiness remains tied to the first playable frame.

**Implementation:** `LoadingScreen` now separates truthful startup progress from the visual estimate. The accessible `aria-valuenow` remains tied to monotonic progress reports; the visible percentage is marked as an estimate, follows reported progress smoothly, and creeps at 1.2 percentage points per second while reports are stalled. At visual 100%, the display changes to “Still working…” and keeps an animated sheen; the first-playable-frame report alone sets actual 100% and completes the overlay. The screen continues to label the ≥94% phase as finishing the first playable frame. CSS phase styling avoids a competing width transition, and reduced-motion preferences keep the display static without the sheen. Failure cancels the animation and restores the actual reported fraction. Tests now drive requestAnimationFrame timestamps to cover a stall at 20%, the former 94% stall, the pre-readiness full-bar state, and first-frame completion. The UI README has been updated.

**Push-before-check / validation:** implementation commit `465966a9151aef5bc4c5febb28c9db8267b29d1a` (source, CSS, tests and UI README) was pushed before checks. Handoff follow-up `32058f8af03658d41b7f8ff25d8fc6c46ce4436f` is also pushed; local and remote `main` match at that SHA. Full `npm run check` passed on `32058f8`: Prettier, ESLint, GLSL guard, both TypeScript checks, **80 test files / 597 tests** (loading-screen unit tests: 6), verification of 20 assets / 47,814,431 bytes, and production build. Existing non-fatal Three.js `BufferGeometry.toNonIndexed()` and model-LOD notices, plus the Vite large-chunk warning, remain. No visual/runtime/device verification is claimed.

**Limitations / next action:** no live-browser timing review or owner-device retest has been performed; the RAF-based unit tests establish movement during simulated stalls, not perceived behavior on the affected phone. After deployment, hard-refresh the game on that device and confirm that progress no longer appears stuck. Do not claim device acceptance until then.

## 117. Smooth the visual loading estimate and clarify the percent label (2026-10-25)

**Owner report:** After the last update, the bar still appears to race through earlier progress and linger around 88%; the user also reports seeing a minus before the percentage.

**Finding:** source code prefixes the estimated visible percentage with `~`, intended to mean “approximately,” not a negative sign. Reported progress is normalized/clamped to `[0, 1]`, and the visual estimate is likewise non-negative. The prefix was ambiguous and should not be used.

**Implementation:** replace the exponential 240 ms catch-up (which could make the bar rush ahead) plus 1.2-point/s idle creep with a rate-limited estimate: 4 percentage points/s minimum, rising smoothly up to 8.5 points/s while it trails reported progress. This keeps progress moving without snapping to a reported 88–94% value. Show `Est. NN%` instead of `~NN%`; keep `aria-valuenow` tied to actual reported startup, retain “Still working…” and the animated sheen if the visual bar reaches full early, and keep actual 100%/completion tied to the first playable frame. Reduced-motion settings suppress the decorative sheen but do not bypass the rate-limited functional estimate (which was another path to a snap-and-pause). Updated fake-RAF unit tests cover gradual movement, the 88% stall under reduced motion, no negative-looking prefix, and readiness.

**Push-before-check / validation:** final implementation commit `113a16e327104a14b4908d041d10b6782f206bdb` was pushed before validation; local and remote `main` matched. `npm run check` passed on `113a16e`: Prettier, ESLint, GLSL guard, both TypeScript checks, **80 test files / 598 tests** (loading-screen tests: 7), asset verification (20 assets / 47,814,431 bytes), and production build. Existing non-fatal Three.js `BufferGeometry.toNonIndexed()` notices, model-LOD notices, and the Vite large-chunk warning remain.

**Limitations / next action:** no browser capture or owner-device review has been performed. Tests verify gradual movement during simulated 88% stalls, including with reduced motion enabled, and preserve the first-frame readiness gate; they do not confirm perceived pacing on the affected phone. After deployment, hard-refresh and confirm whether the bar now moves evenly through the 88% stage. No visual/device acceptance is claimed.

## 118. Hold the loading overlay until the visible bar reaches 100% (2026-10-25)

**Owner report:** The game began while the visible estimate was still at 56%, without the bar visibly completing to 100%.

**Finding:** the first-playable-frame handler immediately forced the displayed fraction to 100% and started the overlay fade in the same update. When the time-based estimate lagged, the complete state could be too brief or be obscured by the fade (especially with reduced-motion timing), so the player saw the scene before a clear full-bar state.

**Implementation:** keep the real first-frame readiness signal authoritative, but separate it from the visual finish. When that frame is reported, label the frame as ready and animate the remaining visible fill at 45 percentage points per second. Keep the overlay and the sheen over the scene until the bar visibly reaches 100%; only then show the 100% label and begin the fade. If the estimate is already full, complete immediately. Updated fake-RAF coverage starts from a partial bar, verifies the screen stays visible after the frame arrives, and checks that the bar reaches full before the fade timer starts.

**Validation:** committed and pushed as `7d27ffb7b2c4f78b92e08aed20e0a4a74aa55fa2` before tests; local and remote branch SHAs match. `npm run check` passed: formatting, lint, GLSL guard, both TypeScript checks, 80 test files / 599 tests, 20-asset hash/licence verification (47,814,431 bytes), and production build. Non-fatal Three.js geometry and model-LOD notices plus the large-chunk warning remain. No live-browser or device verification has been performed.

## 119. Preserve progress through throttled frames and remove the “Est.” prefix (2026-10-25)

**Owner report:** The loading counter again appeared stuck at 52%; the owner asks to remove “Est.” from the percentage.

**Code-level finding:** the RAF loop clamped every frame's elapsed time to 100 ms. If a constrained phone delivers frames less often than 10 Hz, progress credits only 100 ms per callback rather than the time that actually passed. At one callback per second, for example, that reduces the intended 4–8.5 percentage-points/second to 0.4–0.85 points/second. This can plausibly explain a number that appears frozen while the page is under startup/render load. No device FPS trace is available, so this is a source-level diagnosis, not a claim that the affected phone's frame cadence was measured.

**Implementation:** retain the 4–8.5 percentage-points/second rate curve, but integrate the full RAF timestamp delta in internal steps of at most 100 ms rather than discarding elapsed time. Catch-up work is bounded to 60 seconds per callback. The first-frame completion fill likewise uses elapsed time. Remove the visible “Est.” prefix so the counter is plain `NN%`; keep actual readiness tied to the first playable frame and keep the overlay through the visible 100% fill.

**Push-before-check / validation:** source, tests and documentation were committed as `8d2f0ab13c2e420cd5341a91140b40c3267083a4` and pushed before checks; local and remote `main` matched at that SHA. The targeted loading-screen tests passed (9/9). Full `npm run check` passed: Prettier, ESLint, GLSL guard, both TypeScript checks, 80 test files / 600 tests, 20-asset hash/licence verification (47,814,431 bytes), and production build. Existing non-fatal Three.js geometry/model-LOD notices and the large-chunk warning remain. No live-browser or owner-device verification has been performed.

## 120. Raise the continuous progress floor and keep the final fill deliberate (2026-10-25)

**Owner correction:** The frame-delta fix still felt too slow around 62%. The bar should keep advancing to 100% during loading; when the first playable frame arrives, it should continue filling smoothly if needed, and gameplay must not be revealed before the bar reaches 100%.

**Implementation:** raise the pre-readiness visual rate to a minimum of 8 percentage points per second, with bounded catch-up up to 12 points per second. This takes roughly 4.75 seconds to move from 62% to 100% once actual readiness is known, instead of about 9.5 seconds at the prior 4-point floor. Use the same deliberate 8-point-per-second rate for the post-readiness final fill. Keep the first-playable-frame signal authoritative; if the bar reaches 100% first, show “Still working…” and retain the sheen. Start revealing gameplay only after both readiness and visible 100% are reached. The visible counter remains plain `NN%`.

**Push-before-check / validation:** code, tests and docs were committed and pushed as `d52b3da7c38991edb94159e69f2bd14eae18c898` before tests; local and remote `main` matched at that SHA. The loading-screen tests passed (10/10). Full `npm run check` passed: formatting, lint, GLSL guard, both TypeScript checks, 80 test files / 601 tests, 20-asset hash/licence verification (47,814,431 bytes), and production build. Existing non-fatal Three.js geometry/model-LOD notices and the large-chunk warning remain. No live-browser or owner-device verification has been performed.

## 121. Decouple loading progress from render-frame cadence (2026-10-25)

**Owner report:** Even after the 62% pacing change, the bar now appears to dwell at 80%. The owner wants it to keep moving to 100% while the game renders in the background, then reveal gameplay when ready and full.

**Finding:** the visual ticker still used `requestAnimationFrame`, tying UI progress updates to the same render-frame cadence that can slow during renderer load. The previous 12-point/second post-readiness fill could also leave the final 20% visible for about 1.7 seconds from 80%.

**Implementation:** replace the loading screen's RAF loop with a dedicated 50 ms interval; integrate full elapsed time so delayed ticks do not discard progress. Increase the pre-readiness rate to a minimum of 12 points/second, up to 16 while catching up, and use 12 points/second for the final fill. From 80%, that final portion takes about 1.7 seconds while remaining visibly gradual. Keep first-playable-frame readiness authoritative, retain “Still working…”/sheen if the bar fills first, keep the plain `NN%` counter, and reveal the game only once the bar is 100% and the first frame is ready. A completely blocked JavaScript main thread cannot update DOM; the timer is decoupled from RAF cadence and catches up once the event loop runs again.

**Push-before-check / validation:** implementation commit `a89e77d14c266838690c304cae3e024cb5c6fbbe` was pushed before the targeted test. One 62% checkpoint expectation was too low; the test-only correction `e2359a5ac6a8771eafeacff947a62922426501ed` was pushed before rerunning checks. The loading-screen tests then passed (10/10), and `npm run check` passed: formatting, lint, GLSL guard, both TypeScript checks, 80 test files / 601 tests, 20-asset hash/licence verification (47,814,431 bytes), and production build. Existing non-fatal Three.js geometry/model-LOD notices and the large-chunk warning remain. No live-browser or owner-device verification has been performed.

## 122. Replace Aohara-wide wet gloss with localized puddle patches; enlarge touch handbrake (2026-10-25)

**Owner request:** “Make the hand break button a bit bigger” and replace street-wide wet reflection with irregular rainwater deposits, leaving dry asphalt between patches and reflecting nearby surroundings.

**Implementation:** a seeded, deterministic, repeating mask creates feathered irregular puddle shapes. Aohara asphalt alone uses the mask to darken albedo, lower roughness, and raise clearcoat within wet patches; dry asphalt stays rough. The road material authors a wet-mask MRT output, and the post chain assembles tier-bounded SSR only when a scene advertises that wet-road mask. Tier C/B/A use progressively higher configured SSR resolution/quality budgets. The standalone city preview uses the same patch material. The touch HB face grows from 3.4 rem to 3.8 rem; pointer tracking and other controls are unchanged. No new asset, dependency, physical water depth, traction change, spray, or global bloom is introduced.

**Push-before-check:** implementation commit `e5af1a7b093c81ccf6bd1a9f7c83025e6a4ddee3` (source, tests, docs) was pushed to `main` before checks; documentation commit `68ce9207a2d738af606e18f291244483ae9892ba` records that push. The local/remote SHAs matched at both checkpoints. The first push attempt failed because `/home/user/.github-auth/askpass.sh` lacked execute permission; restoring that bit fixed the push. The first full-check attempt stopped at TypeScript with one missing TSL `mix` import; Prettier, ESLint, and the GLSL guard had passed, while tests/assets/build did not run. Correction `413d029` added the import and was pushed; the full check subsequently passed at `a5f330a` (83 test files / 613 tests, 20 verified assets / 47,814,431 bytes, production build). The newer HB hit-zone follow-up was also pushed at `8f9d654` before checks. The user's requested order supersedes the repository's generic check-before-commit sequence for this task.

**Limitations:** SSR is screen-space and can reflect only content represented in the current frame; it cannot reflect off-screen surroundings or guarantee complete real-world reflections. PBR/HDRI still handles environmental reflection. Neither realistic appearance nor performance has been verified on the affected device. Do not claim visual/device acceptance or measured frame-time impact.

**Status:** the initial wet-patch/SSR and 3.8 rem handbrake increment is recorded here; the later 4.5 rem / upper-hit-zone request is implemented and pushed at `8f9d654`, with its validation status in §123. Separately, the user's loading-progress device review remains pending.

## 123. Enlarge the HB face and extend its upper touch target (2026-10-25)

**Owner follow-up:** “Make the hand break button bigger and widen the touch activation zone on the upper part of the screen for the button.” Interpreted as enlarging the existing HB face and extending its transparent hit target upward and sideways, without relocating it or changing pointer tracking.

**Implementation:** grow the face from 3.8 rem to 4.5 rem. A transparent pseudo-element adds hit area 1.25 rem above the button and 0.9 rem on either side; the visible circle and its lower edge remain aligned to the existing layout so the adjacent pedals are not displaced. Add a CSS-contract unit test for the face size and hit-area declaration. Other controls are unchanged.

**Push-before-check / validation:** the follow-up source and regression test were committed and pushed as `8f9d654` before checks; status documentation was pushed in `93b6a7b`, then Prettier-aligned Markdown in `a5f330a`. `413d029` contains the earlier missing TSL `mix` import correction. Full `npm run check` passed at `a5f330a`: formatting, lint, GLSL guard, both TypeScript checks, 83 test files / 613 tests, 20 verified assets / 47,814,431 bytes, and production build. Existing non-fatal Three.js already-non-indexed-geometry notices and the Vite large-chunk warning remain. If a code fix is needed, push it before rerunning.

**Next action:** review the face and activation zone in a real browser and on touch devices. The added CSS-contract test verifies source declarations only; no rendered/browser touch hit test, device acceptance, or performance measurement is claimed.

## 124. Apply car-model changes without restarting the renderer (2026-10-25)

**Owner report and confirmation:** the game starts with the Kaminari GT Roadster, and changing the car model from the menu leaves a black/frozen view. Follow-up answers: Android Chrome; after a hard refresh the Roadster card was marked selected; after applying a car change the screen goes black. The persisted Roadster selection explains why it starts that way: the clean-storage default is Generic Sport Coupé, but saved preferences take precedence.

**Source-level cause:** car-model changes were saved and then handled by the same full drive teardown/rebuild path as settings that genuinely require a renderer restart. That path destroys and recreates the WebGL/WebGPU renderer/canvas and is a plausible source of the Android black screen. No Android reproduction has been performed in this sandbox.

**Implementation pushed:** commit `3530b24` adds `Application.setPlayerCarModel()` to replace only the player visual while keeping the renderer, physics world, cameras, scene, and drive running. It serializes pending Generic model loads across quick choices and preserves the authored roadster as the fail-soft display while the imported model loads. Car-model selection is excluded from the menu's restart-required preference list; the change is still persisted and other graphics/camera/traffic/steering settings retain Apply & Restart. The commit adds a menu contract regression and updates menu copy and UI docs. Local and remote `main` matched at `3530b24` before formatting.

**Push-before-check:** the code and regression were pushed as `3530b24`, followed by formatting and status documentation before validation. Full `npm run check` passed at `0b8487c`: Prettier, ESLint, GLSL guard, both TypeScript checks, 83 test files / 614 tests, 20 verified assets / 47,814,431 bytes, and production build. The newly reported Android failure still requires a real-device check.

**Next action:** have the owner verify on Android Chrome that Generic can be selected without a black screen and remains selected after refresh. If a correction is needed, push it before rerunning checks; until then, do not claim Android acceptance.

## 125. Add a breathing pulse to the loading bar (2026-10-25)

**Owner request:** “Make the loading bar slowly blink like breathing, so that players know that it is not stuck at any point.”

**Implementation pushed:** code/test commit `c367375` adds a subtle 3.8-second ease-in/ease-out pulse to the visible progress fill in every active phase: animating, finalizing, and waiting at 99%. Opacity and soft glow rise and fall without changing the reported percentage, monotonic estimate, stage pacing, or first-playable-frame readiness/reveal gate. The pulse and sheen are disabled for `prefers-reduced-motion`; the reduced-motion path leaves the fill fully visible. A CSS-contract test checks the active-phase pulse and reduced-motion override.

**Push-before-check:** code/test commit `c367375` and status documentation were pushed before validation; local and remote `main` matched at `cbcf2d3` before the full check. No source changes were made after validation.

**Next action:** have the owner confirm the bar visibly breathes without feeling distracting, particularly during a 99% waiting state. Device/browser visual acceptance remains pending; if any code correction is needed, push it before rerunning checks.

## 126. Strengthen the loading pulse and retry fullscreen on any page click (2026-10-25)

**Owner correction:** the owner says the loading progress bar still does not visibly breathe, and automatic fullscreen is not working properly on page interaction. They clarified that fullscreen should respond to any interaction on the page, not only a narrow subset.

**Source-level findings:** the shipped progress fill used a modest `0.78`–`1` opacity change over 3.8 seconds. More importantly, the reduced-motion media rule disabled the fill animation entirely, which could make it look static. The fullscreen controller captured mouse `pointerdown`, touch/pen `pointerup`, keyboard `keydown`, and accessibility/screen-reader clicks only (`detail === 0`); ordinary mouse/touch-generated clicks were excluded. Its pending request was keyed only by `Document`, so a new click could share an unresolved request from an earlier gesture. These findings explain missing fallback paths in source; no real-device reproduction has been performed.

**Implementation pushed:** commit `4ac1b6c` shortens the normal fill pulse to 3.2 seconds and raises its opacity/glow contrast (`0.36`–`1`). Under `prefers-reduced-motion`, it keeps a gentler 5.4-second pulse (`0.62`–`0.92`) instead of disabling the cue. The fullscreen controller now retries on all document-captured `click` events, including regular pointer clicks, and stores in-flight requests by event so one activation does not suppress a later one. Existing mouse pointerdown, touch/pen pointerup, keyboard and legacy touchend paths remain; the first-playable-frame reveal gate and all percentage arithmetic remain unchanged. CSS-contract and fullscreen regression tests were updated/added.

**Push-before-check / validation:** source and tests were committed/pushed as `4ac1b6c52c419308d205199d364c1a08dbbabb10` before checks. Status documentation was pushed at `b34c28017c2f581ae3be91b54fcb24ddfd7bac47`, where local and remote `main` matched. Full `npm run check` passed at `b34c280` (84 test files / 616 tests, 20 verified assets / 47,814,431 bytes, production build); GitHub Validate #40208832670 and Pages Deploy #40208832729 succeeded.

**Limitations / next action:** the full check and GitHub workflows are green, but CSS and DOM tests cannot establish perceived brightness or browser-specific fullscreen policy. Ask the owner to verify both behaviors in a real browser/device after a hard refresh. Fullscreen remains best-effort and may be denied by browser/OS restrictions. Do not claim device acceptance.

## 127. Make the loading pulse unmistakable and prefer completed mouse clicks for fullscreen (2026-10-25)

**Owner report:** the owner says the loading bar is still not blinking/breathing as described, and automatic fullscreen still does not work properly on page interaction, after the prior correction was deployed.

**Deployed/source check:** the public Pages HTML referenced the current CSS/JS bundles. The CSS bundle contained the prior 3.2-second fill animation and the JavaScript bundle contained the document-capture click handler. This confirms those assets were present in the live release, but does not establish computed style or user-visible behavior on the owner's device.

**Implementation pushed:** source/test commit `46ca66e` adds a high-contrast breathing animation to the entire track (border, background, and outer glow) as well as the moving fill, so a tiny or paused fill still has a full-width cue. The normal 3.2-second fill now has a stronger `0.22`–`1` opacity range and brightness/filter/glow change; reduced-motion mode uses a gentler 5.4-second track/fill pulse. Progress arithmetic and first-playable-frame gating are unchanged. For fullscreen, mouse input now relies on the captured `click` rather than requesting at `pointerdown`, which can happen before click activation and may consume/lose the useful gesture. Touch/pen continue to try `pointerup`, with click fallback; keyboard and legacy `touchend` remain. Regression tests assert the full-track/fill animation and that mouse pointerdown does not pre-empt the click request.

**Push-before-check / validation:** the source and tests were committed/pushed as `46ca66e886994da8be9b34f1fefe2cfb9bb5d059` before tests/builds/browser captures. Status documentation was pushed at `e4cb27c41898c3d448b341ad9bd1f56152467ae6` before the check; local and remote `main` matched. Full `npm run check` passed at `e4cb27c` (84 test files / 616 tests, 20 verified assets / 47,814,431 bytes, production build). GitHub Validate #40209876043 and Pages Deploy #40209876042 succeeded.

**Limitations / next action:** full validation and GitHub workflows are green, but browser/device behavior has not been captured here. Fullscreen remains best-effort and cannot override user-activation, iframe/permissions-policy, browser, or OS restrictions. If the owner still sees no pulse or fullscreen after hard refresh, collect device/browser details, whether reduced motion is enabled, whether the site is embedded/PWA, and which exact interaction fails. Do not claim device acceptance.

## 128. Intensify the loading pulse and keep automatic fullscreen retries alive (2026-10-25)

**Owner's follow-up:** the owner reports Android Chrome in a normal top-level tab. The explicit fullscreen control enters fullscreen, but automatic retries on page interaction do not. The loading pulse is visible but still too subtle; reduced-motion status is unknown. This narrows the reported fullscreen issue to the automatic retry path, but no device instrumentation or direct Android reproduction is available, so no root cause or device acceptance is claimed.

**Implementation pushed:** source/test commit `76cc8064dedac475013f09704b2a1b20c76eeb81` strengthens normal loading-track/fill/glow contrast and also makes the slower reduced-motion pulse more legible without changing progress arithmetic or the first-playable-frame reveal gate. The fullscreen helper now verifies that the standard or WebKit fullscreen element is actually active before returning success; a fulfilled no-op leaves automatic retry listeners armed. `FullscreenOnStart` stays dormant while fullscreen is active, then re-arms on `fullscreenchange` / `webkitfullscreenchange` exit so the exit gesture is not intercepted but the next page action can retry. Regression tests cover no-op promise resolution and retry after exit. The explicit fullscreen control, landscape fallback and best-effort orientation-lock policy remain unchanged.

**Push-before-check / validation:** code and regression tests were pushed as `76cc806` before tests or builds, as explicitly required by the owner. Status documentation was pushed at `a8aca97`. The first full-check attempt stopped at Prettier in `PROJECT_PLAN.md`, `src/input/README.md`, and `tests/unit/loading-screen-style.test.ts`; formatting-only commit `b199769` was pushed before rerunning, and full `npm run check` passed there (84 files / 618 tests, 20 verified assets / 47,814,431 bytes, production build). A later status update exposed another `PROJECT_PLAN.md` formatting issue; correction `28c526b` was pushed before rerunning. Full `npm run check` passed at `28c526b`: formatting, lint, GLSL guard, both TypeScript checks, 84 test files / 618 tests, 20-asset hash/licence verification (47,814,431 bytes), and production build. Existing non-fatal Three.js non-indexed-geometry notices and the Vite large-chunk warning remain. `npm ci` reported two moderate audit findings; no audit fix was run. GitHub Validate #431 and Pages Deploy #420 both succeeded at `a7f1700`. The live page returned HTTP 200; CSS includes the stronger normal/reduced-motion pulse and JavaScript includes the standard/WebKit fullscreen-change listeners.

**Next action:** hard-refresh https://mdraficode.github.io/Endless-Driver/ on Android Chrome and test (1) loading no longer lags or freezes and reaches play quickly, (2) Generic Sport Coupé is the default on clean storage and appears after a brief fallback, (3) switching car models applies instantly without a black/frozen view. The pulse and fullscreen retry work from `76cc806` remain; browser/OS policy can still deny fullscreen.

## 129. Make loading genuinely fast and keep car switching from freezing (2026-10-25)

**Owner's new report:** loading screen lags even on the new build, the game starts with the Kaminari GT Roadster instead of the main Generic Sport Coupé, and changing the car model gets stuck. The owner also asks to make loading more efficient/quick without harming performance and to make the overall coding more stable with enhanced rendering.

**Root-cause analysis (no device repro, based on code review):**

_Loading lag — the dominant cost was initial terrain, not the bar:_ `TerrainWorld.prepareInitial()` required ring 1 (the centre plus eight neighbours = nine chunks) on every tier before the first frame. On tier C (the default for unmeasured/Android devices) each chunk builds a 48-segment mesh; nine of them plus one foliage chunk plus Rapier+WebGPURenderer init could keep the main thread busy for seconds. The bar's estimated 6–8 points/second crawl kept moving, but the browser's timer/paint callbacks were starved while the chunks built synchronously on the fallback path, producing the perceived lag/stall near 60–70% and the later "still lagging" report. `DrivingWorld.prepareInitial()` blended terrain/vegetation progress 50/50, so vegetation (ring 0, one chunk, already yielded) finished quickly while terrain dominated.

_Car default confusion — fallback shown while hero loads:_ the clean-storage default is Generic Sport Coupé, but the runtime shows the authored Roadster fallback until the imported 2.9 MB hero GLB finishes downloading/decoding. On a slow link the fallback lingers, so it looks like the game "starts with Roadster." A saved preference of Roadster also intentionally overrides the default, which matches the reported "after hard refresh the Roadster card was selected."

_Switching gets stuck — stale load chaining:_ `Application.#loadCarModel()` chained any new Generic request behind an in-flight task for a previous visual instance (`pending.then(() => load(newVisual))`). Rapid switches (Roadster → Generic → Roadster → Generic) queued work for a disposed visual, delayed the current one, and its `clearTask` could clear the wrong tracking. A thrown load also left no warning.

_Graphics stability — tier contracts were intact but SSR/bloom had headroom:_ tiers C/B/A already bound pixel ratio, cascades, and build budgets; the scene was stable but C's SSR/bloom were slightly muted and the code had an unused field that tripped lint.

**Changes in `fa2d512`:**

_Loading mechanics — less work, earlier parallelism:_ tier C now prepares only ring 0 (one chunk) before the first frame; B/A keep ring 1 (nine). `TerrainWorld` exposes `resolveInitialTerrainReadyRing()` and an `initialReadyRing` option so the test's 81-chunk expectation (ring 1) still holds. Hero-model fetch now starts in parallel with `prepareInitialContent()` after `Engine.init()` instead of after the loading overlay hides, cutting the Roadster flash without blocking the first frame. `Application.start()` no longer awaits the hero preload; `startDeferredAssetLoading()` remains the post-play idle волны.

_Car model stability — per-visual task tracking:_ `#carModelLoadTask` is now paired with `#carModelLoadVisual`; `setPlayerCarModel()` clears stale tracking when swapping visuals, and `#loadCarModel()` returns the same promise for the same visual instead of chaining on a disposed one. Load start/failure is caught and warned, and `setPlayerCarModel()` logs without freezing the menu. The fallback remains fail-soft.

_Rendering — bounded polish within budgets:_ tier C SSR `resolutionScale 0.33→0.35`, `quality 0.14→0.16`, `intensity 0.58→0.60`, bloom `0.18/0.4→0.19/0.42`; tier B bloom `0.16→0.18`. No tier contract (lodSegments, maxBuildsPerFrame, cascades, pixelRatio) was changed, and physics/rendering budgets are unchanged. Engine keeps its context-loss handlers; the unused stability field was removed to keep lint green.

**Push-before-check / validation:** commits `7829431`, `9aaacb6`, `8d374ae` were pushed before `npm run check`; Prettier flagged `TerrainWorld.ts`, fixed at `9aaacb6`, and `Engine.ts` lint fixed at `8d374ae`. Full `npm run check` passed at `fa2d512` (Prettier, ESLint, GLSL guard, both TypeScript checks, 84 files / 618 tests, 20 verified assets / 47,814,431 bytes, production build at 1,671 kB). Tier lodSegments/maxBuildsPerFrame assertions still pass; the terrain 81-chunk streaming test still passes.

**What this does not claim:** no named-device FPS, no visual acceptance, no guarantee the hero finishes before the first drive (still background), and no claim that browser/OS will allow fullscreen. Real-device timing of the new ring-0 startup and the hero-parallel fetch still needs owner verification.

**Next action:** hard-refresh the deployed build after Pages Deploy succeeds for `fa2d512`, then confirm on Android Chrome that loading reaches play quickly, Generic is default (or reappears quickly) and car switches do not freeze.

## 130. Phase 8.1 — Aohara facade kit: turn the boxes into real architecture (2026-10-25)

**Owner's report / authorization:** the buildings look like big boxes, not real city buildings; they should have balconies, glass windows, modern design, aesthetic mansions, vintage houses — a full transformation into a real-life city. In the same message the owner authorized the three-track living-world program (real architecture, living city with people/cyclists/motorbikes/vendors/enter-exit/easter eggs, and an endless sophisticated procedural wilderness with random animal charging attacks on off-road/jungle roads), opened Phase 8 for it, chose the realistic-rigged direction for actors, and required all tracks to stay perfectly integrated: no frame drops, no performance or gameplay sacrifice, and quick loading preserved. The approved plan is `docs/proposals/urban-vitality-endless-world-20261025.md`.

**Where the boxy look came from:** the city is deliberately one instanced unit-box per building (shells in `#buildCityTypologies`, sparse budgeted cornices/plinths in `#buildFacadeDetails`, instanced window panes/frames/lights in `createWindowInstances`). That is fast and collision-safe but carries no balconies, no ground-floor commerce, no roof character, and no curtain-wall language on the towers — hence "big boxes". Pedestrians already exist (16/32/48 per tier in `UrbanStreetActivity`), so Track B will extend that system rather than add a new one.

**Implementation (commits `f2cf0aa` → `5f57418` → `7e237fe` → `2228034`):**

- `src/world/building-facades.ts` (new): deterministic placement generator + `FacadeKitWorld`. Seven kit elements, each one merged low-poly geometry in a single `InstancedMesh`: balcony (slab, railing, posts, AC unit), mansion veranda/engawa (slab, four posts, handrail, step), brick chimney (shaft, cap, flue), vintage eave kit (door hood, posts, louver shutters), curtain-wall fin (one box, six face slots per tower: four corners + two centrelines), crown glass band, shopfront awning + sign band. Placement is a stable hash of the building/tower indices, same style as vegetation and alley props; elements sit on the street-facing (local +Z) face, balconies at 2.85 m (2nd floor) or 5.7 m (3rd), verandas/awnings at ground level, chimneys on the roof shoulder slope.
- `src/config/urban-city.ts`: `URBAN_FACADE_KIT_TIER_BUDGET` — C: 14 balconies / 5 verandas / 10 chimneys / 6 eaves / 24 fins / 6 bands / 10 awnings; B: 24 / 8 / 14 / 10 / 40 / 10 / 18; A: 34 / 12 / 18 / 14 / 56 / 14 / 26. Ordered C ≤ B ≤ A.
- `src/world/urban-night.ts`: builds the kit right after the shells from the same `additionalBuildings` + towers list (so alley clearance and collider decisions are unchanged), adds `facadeKit*` keys to `getContentStats()`, disposes with the world.
- Collision safety: nothing new is added to the collider set. Overhangs stay ≤ ~1.3 m off the wall (sidewalks are 3.2 m wide and the building shells already bound the car), and elevated elements sit above the car body. Rapier remains the single physics authority; no new lights, textures, assets or dependencies.
- `tests/unit/building-facades.test.ts` (new, 9 tests): determinism, per-tier budget caps and C→A ordering, street-face + height placement, tower fin/band geometry, per-building uniqueness (six fin slots per tower by design), instanced batch + stats consistency, overhang envelope, idempotent dispose, and night-world wiring inside the tier budget.

**Push-before-check / validation:** `f2cf0aa` (feature) pushed before any run; first local gate stopped at Prettier on the proposal doc → `5f57418`; gate then stopped at TypeScript (`Object3D` imported type-only in the test) → `7e237fe`; first full `npm run check` after the type fix passed format/lint/GLSL/typecheck but failed 2 of the new tests (centre fins offset 0.1 m off-face; fin uniqueness test counted six-by-design fins as duplicates) → `2228034` (fins seated on the face normal, test asserts the six-slot design). Full `npm run check` passed at `2228034`: formatting, lint, GLSL guard, both TypeScript checks, 85 test files / 627 tests, 20 verified assets / 47,814,431 bytes, production build 1,678.88 kB (+~7 kB app chunk for the whole kit). GitHub Validate #440 failed only at `7e237fe` (the same type error); Validate #441 and Pages Deploy #430 both succeeded for `2228034`. No browser/device rendered capture was taken (no Playwright/Chromium in this sandbox); no FPS or visual acceptance is claimed.

**What this does not claim:** no device FPS, no visual acceptance of the new facades, and no claim the owner will read every element at every distance. The element set is the first pass of Track A; balcony/awning face selection is currently the street-facing +Z face only, and the shopfront sign bands are neutral (no branded text).

**Next action:** owner hard-refresh on Android Chrome and drives the Aohara avenue + backstreets: confirm the buildings read as real architecture (balconies, verandas, chimneys, eaves, tower fins/bands, awnings) without frame drops or gameplay change, and re-confirm the `fa2d512` loading/car fixes still hold. With owner sign-off, start Phase 8.2 (street life) per the approved plan.

## 131. Phase 8.2 street life — cyclists, cart vendors and motorbike maniacs (2026-10-25)

**Owner's report / authorization (same message as §130):** make the world feel alive — more people on the roads, cyclists on the sidewalks, fast maniac motorbikes, homeless people sitting in narrow alleys, cart vendors on the sidewalk, people entering and exiting their homes, plus easter eggs; keep everything perfectly integrated (no frame drops, no performance/gameplay sacrifice, quick loading). Phase 8 opened for the three tracks; realistic-rigged direction chosen for actors. This section covers the first street-life increment (8.2a); alley sitters, home enter/exit and easter eggs (8.2b) follow after owner sign-off on this one.

**What already existed:** `UrbanStreetActivity` runs 16/32/48 instanced pedestrians on four sidewalk loop routes (no right-of-way, per the budget comment) plus the five traffic-vehicle classes on two signal-aware one-way loops with Rapier bodies, queueing, following gaps, impact feedback and bounded route rejoin. The street-life increment reuses that route/signal/physics machinery and the pedestrian body/head geometries and materials.

**Implementation (commits `2e08540` → `53b1188`):**

- `src/config/urban-city.ts`: `URBAN_STREET_LIFE_TIER_BUDGET` — C: 2 cyclists / 1 vendor / 0 maniacs / 1 sitter / 4 doors / 2 eggs; B: 4 / 2 / 1 / 2 / 8 / 3; A: 6 / 3 / 2 / 3 / 12 / 4. (Sitter/door/egg fields are the declared contract for 8.2b.)
- `src/world/urban-activity.ts`:
  - **Cyclists** — sidewalk route followers at 3.1–3.8 m/s (same no-right-of-way contract as pedestrians), merged bike geometry (wheels, frame, saddle, handlebar), rider reuses the pedestrian body/head geometry + shared materials, per-instance clothing/skin colors, 0.03 m bob.
  - **Cart vendors** — static, deterministic mid-block inset on the sidewalk loops (never on a crossing corner), merged cart geometry (deck, shelf, legs, four wheels, handlebar, goods), warm lantern box whose `MeshBasicNodeMaterial` color is driven by the city `nightGain` uniform (faint by day, glowing at night; a static fallback when the composition has no uniform), vendor stands beside the handlebar, 0.05 rad sway.
  - **Motorbike maniacs** — 11–14 m/s on the two traffic loops with a bounded ±1.5 m lateral weave (sine of weave time, per-maniac frequency/phase). Signal-aware: they ride their own queue slot (half-length offset) through the existing `advanceTrafficWithSignal`, so they brake and park before the stop line on red/amber and **never cross it** (margin contract tested). Weave is gated by a smoothed moving flag (`weaveGain`, 6/s decay) so a stopped maniac eases back to the lane centre. With physics they get Rapier bodies (cuboid 0.28×0.5×1.05, density 178), are driven by the same pre-step steering as traffic, and join the collision handler: impact shudder + bounded hold + route rejoin (≤8 m) like traffic. Tier C keeps them at **zero**, so the C-tier physics contract (`urbanTrafficPhysicsBodies == trafficVehicles`, post-dispose body counts) is untouched.
- `src/world/urban-night.ts`: passes `this.#nightGain` to the activity for the lanterns.
- Stats: `urbanCyclists`, `urbanCartVendors`, `urbanMotorbikes`, `urbanMotorbikePhysicsBodies`; `getMotorbikeStopLineMargins()` read-only accessor for diagnostics/tests.
- Tests: new `tests/unit/street-life.test.ts` (6 tests: per-tier budgets + baseline-untouched stats, draw-call batch counts 14/17/17, two-instance matrix determinism, 3000-frame matrix stability + vendor stationarity, per-frame stop-line margin contract over 150 s of red, green-advance/red-settle reproducibility). `tests/unit/urban-night.test.ts` batch expectations updated (7 → 14/17/17 with the new kinds).

**Push-before-check / validation:** `2e08540` pushed before the gate; the gate stopped at the tools-typecheck (test `getObjectByName` typing) → `53b1188` (typed `streetLifeMesh` helper). Full `npm run check` passed at `53b1188`: formatting, lint, GLSL guard, both TypeScript checks, 86 test files / 633 tests, 20 verified assets / 47,814,431 bytes, production build 1,688.88 kB. The physics contract test (`traffic-vehicle-physics`) still passes unchanged. No rendered/device capture (no Playwright/Chromium in this sandbox); no FPS or visual acceptance is claimed.

**What this does not claim:** no device FPS, no visual acceptance of the new actors, and no claim that every element reads well at driving speed — the rider is an upright stylization (reused pedestrian body) rather than a seated rig; that is the "realistic rigged" upgrade candidate if the owner wants it after seeing the first pass. Home enter/exit, alley sitters and easter eggs are not in this increment.

**Next action:** owner hard-refresh on Android Chrome and drive the Aohara loops: confirm cyclists/vendors read as street life (and the maniac on B/A stops at the signal and can be bumped), with no frame drops or gameplay change; re-confirm the §129/§130 items still hold. With sign-off, start 8.2b (alley sitters, home enter/exit doors, easter eggs).

## 132. Loading-screen fail-safe: stop the black freeze and the 99% hang (2026-10-25)

**Owner's report:** "The game loading screen is glitching and turning black also getting stuck randomly." The acceptance bar is unchanged: loading must be reliable and quick; no device-acceptance claim is made from code alone.

**Root cause (three silent, unrecoverable failure modes):** source review of `src/core/Engine.ts`, `src/core/Application.ts` and `src/ui/LoadingScreen.ts` found:

1. **A dead frame loop.** `Engine.#tick` ran every registered frame handler with no error boundary. A throw in any handler escaped the `requestAnimationFrame` callback and stopped the loop forever. Before the first render that left the loading bar parked at ~99% (the pre-ready cap) over a black canvas, with no error surfaced anywhere — the "getting stuck randomly" symptom, made more likely as more frame work (street life, motorbike physics) landed.
2. **A first frame that never drew but counted as drawn.** `Engine.render()` silently no-ops while the context is lost or the renderer is uninitialised, yet `Application` set `#firstFrameRendered = true` unconditionally after calling it. The loading screen could therefore complete and fade to a **black canvas** — the "turning black" symptom.
3. **A lost context with no recovery.** A WebGL context loss or WebGPU device loss during startup cancels the frame loop; the WebGPU path has no restore event at all. The application only set a status line (hidden behind the loading overlay), so the player sat at the loading screen forever.

**Fix (commits `2f1ed57` → `c731258`, pushed before checks):**

- `Engine`: frame handlers now run inside a `try/catch` (`#runFrameHandler`). The loop records `frameErrorCount` / `lastFrameError`, reports through a new `onFrameError` event, logs, and **keeps ticking**. `render()` returns a boolean — `true` only when the frame was actually submitted to the renderer.
- `Application`: the `#firstFrameRendered` flag is now gated on the real `rendered` result, so the loading screen can never complete over a no-op frame. A new 30 s first-frame watchdog (`#armFirstFrameWatchdog`, disarmed on first render, error, or dispose) fails the loading screen if the first frame never arrives. A context loss **or** a frame error **before the first frame** now fails the loading screen immediately (the post-first-frame context-loss behaviour is unchanged: status line, wait for restore). Scene materials are pre-compiled with `renderer.compile(scene, camera)` during the loading phase (async in the WebGPU renderer, so it yields to the loading UI) so the first frame does not pay a long mobile shader compile that could trip the GPU watchdog. A new `onLoadingError` option carries these failures to the entrypoint.
- `main.ts`: `onLoadingError` routes through the existing `reportStartupFailure` path, so the player sees "Could not start: …" with the working retry (reload) button.
- `LoadingScreen.fail()`: now forces the overlay visible (and `state=error`) even if it had already been hidden, so a late-reported failure can never be invisible.
- Diagnostics: new **"Frame errors"** row (`count · last message`, `none` when clean) in `DiagnosticsSnapshot`, `getDiagnostics()` and the full-screen overlay, so a returning device report shows exactly what failed.

**What this does and does not claim:** this makes every previously-silent loading failure _visible and recoverable_ (retry reloads) and removes the two concrete mechanisms that produced a black or frozen loading screen; it does not prove the affected Android device is now glitch-free — that needs the owner's hard-refresh. The pre-compile shifts first-frame GPU work into the loading window; the loading bar's breathing cues, progress arithmetic and readiness gate are otherwise unchanged. No Playwright/Chromium in this sandbox, so no rendered capture and no FPS claim.

**Push-before-check / validation:** `2f1ed57` (code) pushed before the gate; the first gate stopped at the diagnostics test because the new row changed the grid row count 30 → 31. `c731258` (test fix + row coverage) pushed; full `npm run check` then passed at `c731258`: formatting, lint, GLSL guard, both TypeScript checks, 86 test files / 633 tests, 20 verified assets / 47,814,431 bytes, production build 1,690.93 kB. Existing non-fatal Three.js geometry notices and the Vite large-chunk warning remain.

**Next action:** owner hard-refresh on Android Chrome: confirm the loading screen no longer stalls at 99% or fades to black; if it ever fails, it should say "Could not start: …" with a retry; F2 → "Frame errors" row should read `none` in a healthy run. Then re-confirm the §130/§131 street-life sign-off, which gates 8.2b.

## 133. Loading bar loses its glow after the auto-fullscreen transition (2026-10-25)

**Owner's report:** "The solid loading bar loses its glow right after auto Fullscreen is triggered." This is a visual regression on the breathing bar that §127/§128 made unmistakable; the acceptance bar is that the bar stays visibly solid and glowing through the fullscreen transition.

**Root cause:** the glow was _animation output_, not paint. `loading-progress-breathe` animated the fill's `box-shadow` (2px → 32px), `filter: brightness()` and `opacity` together. Entering fullscreen re-rasterises the compositor for the immersive viewport, and on Android Chrome animated `box-shadow`/`filter` layers can be dropped at that moment. At the animation trough the fill's shadow is only 2px, so when the layer drops the bar reads as flat/unglowed — exactly the "loses its glow right after fullscreen" symptom. (The auto-fullscreen itself is the `FullscreenOnStart.request()` that `startDrivingScene()` fires at scene start; on this device the site has been granted automatic-fullscreen, so the transition lands mid-load.)

**Fix (commits `3e17d00` → `a330b67`, pushed before checks):** the glow is now **static paint, never animation output** — so there is nothing for a layer re-rasterisation to drop:

- `src/style.css`:
  - The fill keeps a **static** `box-shadow: 0 0 24px rgb(84 224 199 / 70%)` (always painted, follows the fill width exactly, clipped/dropped by nothing).
  - A new glow layer — the track's `::after` — carries the strong `34px` shadow as static paint. Its width mirrors the fill via a `--loading-fill-width` custom property, so the glow follows the progress.
  - Every loading-bar animation now modulates **opacity only** (compositor-only): the fill breathe is opacity `0.55 ↔ 1` (floor raised from 0.16 so a restart from the trough still reads solid and glowing), and the glow layer is opacity `0.12 ↔ 1` (reduced-motion: `0.3 ↔ 0.85`). `filter` and animated `box-shadow` are gone from the bar entirely.
  - The track outline keeps its approved border/background/glow pulse unchanged; reduced motion keeps the same static-paint + opacity contract with gentler ranges; the error state gets the same static-paint glow in red.
- `src/ui/LoadingScreen.ts`: every place that set the fill width now goes through `#setBarWidth()`, which also writes `--loading-fill-width` on the root, so the glow layer and the fill always move together.
- `tests/unit/loading-screen-style.test.ts`: re-pinned to the new contract (static shadows on the fill and the glow layer, opacity-only keyframes, the width-mirrored `--loading-fill-width` layer, reduced-motion and error-state variants).
- `tests/unit/loading-screen.test.ts`: new test locks the fill-width → `--loading-fill-width` mirroring across `show`/`update`/`fail` (the fake root now exposes a `style` map).

**What this does and does not claim:** it makes the glow structurally unable to be dropped mid-frame (static paint + opacity), which is the permanent form of the fix for this class of mobile compositor drop; it does not prove the owner's specific Android device now shows it correctly — that needs the owner's hard-refresh. The pulse is still present (opacity breathe + sheen + track pulse) and the bar is never unglowed. No Playwright/Chromium in this sandbox, so no rendered capture and no visual acceptance is claimed.

**Push-before-check / validation:** `3e17d00` (code) pushed before the gate; the first gate stopped at one new test (`window is not defined` — the width-mirror test needed the `window` stub). `a330b67` (test fix) pushed; full `npm run check` then passed at `a330b67`: formatting, lint, GLSL guard, both TypeScript checks, 86 test files / 634 tests, 20 verified assets / 47,814,431 bytes, production build. Existing non-fatal Three.js geometry notices and the Vite large-chunk warning remain.

**Next action:** owner hard-refresh on Android Chrome: confirm the loading bar stays solid and glowing **through the auto-fullscreen transition** (the specific reported symptom), and re-confirm the §132 fail-safe + §130/§131 street-life items. With sign-off, start 8.2b.

## 134. Loading screen stuck at 99% forever — stale-cache diagnosis + backstop (2026-10-25)

**Owner's report:** "The loading screen is stuck at 99% forever."

**Diagnosis:** the live deployment was verified first. `https://mdraficode.github.io/Endless-Driver/` serves `index.html` with `Cache-Control: max-age=600`, and its current bundle (`assets/index-RKJo_4KA.js`, grep-verified) already contains the §132 fail-safe (the 30 s first-frame watchdog, the pre-first-frame context-loss failure, the frame-error failure) plus the §133 glow fix. On any _fresh_ load, a start that cannot render its first frame now ends within 30 s in a visible "Could not start: …" + retry — it cannot sit at 99% forever. The stuck-forever behaviour therefore matches a page **cached from before the fail-safe shipped** (the 8.2a bundle `index-Bd0uSRwX.js` was live for ~3 hours that day; a back/forward-cached or stale-cached Android tab replays that frozen page with no network request at all). No source bug reproduces "99% forever" on the current bundle in review.

**Permanent guards (commits `31a2d43` → `9e3661a`, pushed before checks):**

- **Lifetime backstop in `LoadingScreen`:** the screen now owns a `setTimeout` backstop (default **90 s**, configurable via the new `LoadingScreenOptions.maxLoadingMs`, re-armed on every `show()`, disarmed on completion/failure/hide). If the deadline passes without completion, it fails itself: "The game has not finished loading in the expected time. Retry reloads the game." No future code path — a hung startup stage, a lost watchdog, an unhandled rejection — can ever park the player at 99% again, on any build.
- **Build tag on the loading screen:** `main.ts` reads the deployed module script name and renders `build <hash>` (e.g. `build RKJo_4KA`) in the loading footnote (`.loading-build-tag`), visible in the error state too. A device report now identifies the exact running build in one screenshot — which is how the stale-cache diagnosis above is confirmed or refuted in one round-trip.
- Tests: the backstop fires when the deadline passes; the backstop is inert once the first playable frame completes loading; the two completion tests' fade-timer assertions account for the backstop being the first pending timer.

**What this does and does not claim:** it makes "stuck forever" structurally impossible (worst case: a retry screen at 90 s) and makes future device reports self-identifying; it does not clear the owner's cached page — the private-window test + cache clear in the Next action above is the remedy for the current report. No Playwright/Chromium in this sandbox; no rendered capture or device acceptance is claimed.

**Push-before-check / validation:** `31a2d43` (code) pushed before the gate; the gate stopped at TypeScript (`buildTagMatch` possibly `undefined`), fixed in `b7ea61e`, then at two completion tests whose `hideTimers` length assertions did not account for the backstop timer, fixed in `9e3661a`. Full `npm run check` passed at `9e3661a`: formatting, lint, GLSL guard, both TypeScript checks, 86 test files / 636 tests, 20 verified assets / 47,814,431 bytes, production build. Existing non-fatal Three.js geometry notices and the Vite large-chunk warning remain.

**Next action:** owner opens the game in a **private/incognito window** on Android Chrome; if it loads there, the normal tab was running a stale build — clear cached files (or close all tabs and reopen). If it still stalls, screenshot the loading screen: the build tag in the footnote tells us exactly which bundle is running.

## 135. Game totally frozen immediately after the loading finishes (2026-10-25)

**Owner's report:** "The game is totally frozen immediately after the game starts after the loading is finished." Key detail: the loading _completes_ (the first frame really renders and the overlay fades), then the game is frozen. That is a different failure from §132/§134 (loading never finishes): the frame loop is now running, then stops over a frozen last frame with no actionable signal.

**Root cause (two mechanisms, same symptom):**

1. **Post-start shader-compile cost.** The material warm-up added in §132 was fire-and-forget (`void renderer.compile(...)`), so the first frames after start still paid live shader-compile cost for every material. On a weak mobile GPU that long in-frame GPU work trips the driver watchdog and the graphics context is lost — typically within the first seconds of play.
2. **A lost context after the first frame is a silent permanent freeze.** `Engine` stops the loop on context/device loss and has no restore for a WebGPU device loss; the application only set a small status pill ("waiting for the browser to restore it") — the last rendered frame simply sits frozen. Nothing visible, nothing actionable, no diagnostics proof.

**Fix (commit `a97d129`, pushed before checks):**

- `Application.start()` now **awaits** `#warmupGraphics()` during the loading phase, bounded by 20 s (`GRAPHICS_WARMUP_TIMEOUT_MS`): the wait stops, the compile keeps finishing in the background, and the frame loop only starts once the materials are compiled (or the bound passed). The post-start frames no longer pay live shader-compile cost, which is the main trigger for the watchdog kill.
- **Post-first-frame context loss is now actionable** via a new `onGraphicsLost` option: a WebGPU device loss (no restore event) surfaces immediately; a WebGL2 context loss waits for the browser's restore and, if it never comes (10 s grace, `GRAPHICS_LOST_GRACE_MS`), also surfaces. Both re-show the loading overlay in its error state — "Graphics lost: The game stopped because the graphics context was lost. Retry reloads the page." — over the frozen frame, with the working retry (reload). `LoadingScreen.fail()` gained an optional `heading` (default "Could not start") for mid-play failures; the restore path still resumes the loop as before and the grace timer is cleared on restore/dispose.
- **Diagnostics:** new **"Graphics"** row (`ok` / `LOST — reload`, from `engine.isContextLost`) so a returning device report proves the freeze cause, alongside the existing "Frame errors" row.
- Tests: custom `fail()` heading; the "Graphics" row (ok + LOST) in the diagnostics report; the SNAPSHOT gains `graphicsLost`.

**What this does and does not claim:** it removes the most likely trigger (in-frame shader compiles right after start) and makes every remaining context-loss path visible and recoverable instead of a silent freeze; it does not prove the owner's specific GPU no longer trips its watchdog — that needs the owner's drive. If the device's GPU is simply too weak for the scene at that tier, the honest next step is the owner choosing a lower tier (the menu's tier switch) — but with this fix, even that case ends in a "Graphics lost" retry screen, not a dead frozen page. No Playwright/Chromium in this sandbox; no rendered capture or device acceptance is claimed.

**Push-before-check / validation:** `a97d129` pushed before the gate; full `npm run check` passed at `a97d129`: formatting, lint, GLSL guard, both TypeScript checks, 86 test files / 637 tests, 20 verified assets / 47,814,431 bytes, production build. Existing non-fatal Three.js geometry notices and the Vite large-chunk warning remain.

**Next action:** owner drives the game in a private/incognito window on Android Chrome for a minute: confirm it no longer freezes after the loading screen fades; F2/📊 → "Graphics" reads `ok` and "Frame errors" `none`. If it ever freezes or the context is lost, the overlay now shows "Graphics lost: …" + retry — screenshot it (the build tag is in the footnote).

## 136. Loading stalls then jumps to 100% + car changes from Roadster to Generic Sports Car after start (2026-10-25)

**Owner's report (two bugs in one message):**

1. "The loading screen gets stuck during loading and after a long time suddenly appears as 100% completed."
2. "When the game starts, it first shows the Roadster car for a very short time, then it automatically changes to the Generic Sports Car model."

**Root cause (a) — the awaited warm-up absorbed the whole tail of loading.** §135 made `start()` await the material pre-compile with `GRAPHICS_WARMUP_TIMEOUT_MS = 20_000`. On the owner's slow GPU the compile does not finish in seconds, so the loading bar crept to its 99% cap ("Finishing the first playable frame…") and sat there for up to 20 s — then `#reportLoadingProgress(1)` fired, the screen filled to 100% and faded: exactly "stuck, then suddenly 100%". The await itself is still the right shape (it is what prevents the post-start freeze), but the 20 s budget was the wrong number: fast GPUs finish in 1–3 s, and on weak GPUs a partial warm-up plus the §135 lost-context recovery is the better trade than a still bar.

**Fix (a):** `GRAPHICS_WARMUP_TIMEOUT_MS` cut to **8 s** (`b7ccb5c`). The compile still runs to completion in the background; the frame loop just no longer waits past 8 s.

**Root cause (b) — the first frame showed the fallback, not the selected model.** For the default model `generic-sport-coupe`, `PlayerCarVisual`'s constructor always renders the authored **roadster** fallback (`kaminari-gt-roadster` mesh); the real 2.9 MB "Generic Sport Coupé" GLB was intentionally fired as a background fetch during loading ("do not await here"). On the owner's device the download finished _after_ the first frame, so the visible car was the roadster for the first seconds and then the model visibly swapped to the coupé. Nothing was misconfigured — the preference was honoured; the load was just allowed to land mid-drive.

**Fix (b):** `start()` now **gates the first frame on the hero model, bounded**: after terrain preparation it waits on the preloaded model with `waitForWithinBudget(heroPreload, HERO_CAR_READY_TIMEOUT_MS = 8_000)` (new `src/shared/budget.ts` helper: resolves with the value if settled in time, else `null`; the source promise keeps running; never rejects; 4 new unit tests in `tests/unit/shared-budget.test.ts`). The download already overlaps terrain preparation (it is kicked before `prepareInitialContent`), so in the common case it finished earlier and the gate adds **no time**. Only on a very slow connection does the budget expire — then the drive starts with the fallback and the classic fail-soft swap happens when the download lands (console.info logged), instead of blocking the bar unboundedly. A load _failure_ still keeps the roadster for the session (unchanged fail-soft). Progress mapping re-planned so the bar is monotonic and honest: terrain 0.55→0.85, "Loading your car model…" 0.85, "Warming up the graphics pipeline…" 0.88, "Starting the simulation…" 0.94, ready 1.0 (the old 0.55→0.94-then-0.9 report was clamped by `normalizeLoadingProgress` but is now strictly increasing).

**What this does and does not claim:** (a) caps the worst-case loading-tail wait at ~8 s (plus terrain time) on any device; it does not claim the owner's GPU compiles within it — if it doesn't, the §135 recovery covers the aftermath and the bar never sits still for 20 s. (b) makes the first frame show the selected car whenever the 2.9 MB GLB can download during the normal loading window; it does not remove the download — a very slow connection still swaps in late, by design, rather than blocking forever. No Playwright/Chromium in this sandbox; no rendered capture or device acceptance is claimed.

**Push-before-check / validation:** `b7ccb5c` pushed before the gate; full `npm run check` passed at `b7ccb5c`: formatting, lint, GLSL guard, both TypeScript checks, 87 test files / 641 tests, 20 verified assets / 47,814,431 bytes, production build. Existing non-fatal Three.js geometry notices and the Vite large-chunk warning remain.

**Next action:** owner, in a private/incognito Android Chrome tab: (1) watch the loading bar — it should not sit still for more than a few seconds at any stage before reaching 100%; (2) confirm the **first visible frame already shows the Generic Sports Coupé** (no Roadster→Coupé change a few seconds in); (3) F2/📊 → "Graphics" `ok`, "Frame errors" `none`. If the car still swaps late, it means the GLB genuinely could not download during the loading window (network) — the console.info line "hero car was still downloading when the drive started" confirms that path.

## 137. Frozen on the gameplay screen after start, then slowly running again with lag (2026-10-25)

**Owner's report:** "After the game starts, it stays frozen for a long time on the gameplay screen. Nothing works and stays completely frozen, then after some time slowly it starts working and running again after some lagging during the start."

**Root cause — §136's 8 s warm-up cut moved the shader-compile into gameplay.** The scene's shaders can only be compiled in one of two places: before the first frame (loading screen up) or during gameplay (in-frame GPU stalls). §136 cut the pre-first-frame budget 20 s → 8 s to fix the _perceived_ stall; on the owner's GPU the full scene needs roughly twenty seconds to compile (evidence: at the 20 s bound the bar stalled near the top for a long time, then 100% and clean gameplay — the compile finished inside the bound; at the 8 s bound the bar finished early and the game froze). So the 8 s cut started the frame loop over an unready pipeline: the unfinished remainder compiled inside the first frames — a long total freeze, then a slow recovery as the remaining programs landed one by one ("starts working and running again after some lagging"). The bar-perception problem was real, but shortening the wait was the wrong lever: it only relocated the same work into the place the owner experiences most painfully.

**Fix (commit `2aac00c`, pushed before checks):** the pre-first-frame gate comes back, with the wait made honest instead of shorter.

- **Main compile pass** (`WORLD_WARMUP_TIMEOUT_MS = 25 s`) starts immediately after terrain prep. Fast GPUs finish in a few seconds and the wait ends the moment the compile does; on weak GPUs the loading bar now **reports steady visible progress every 250 ms** (0.87 → 0.97 across the window, `warmupProgressFraction` in `src/shared/budget.ts`) under the label "Warming up the graphics pipeline (first run is slower)…" — a moving bar that reads as work, not a stall.
- **Hero car in parallel:** the 2.9 MB hero download (kicked before terrain prep) now overlaps the main pass, and a **short second pass** (`HERO_WARMUP_TIMEOUT_MS = 10 s`, 0.97 → 0.99) picks up the hero's materials afterwards — the §136 car-swap gate is preserved (first frame still shows the selected car).
- **Telemetry for the next device report:** diagnostics gains a **"Warmup"** row (`done` / `partial — may jank`, from `#warmupComplete`), and every cut-off path logs a `console.info` ("graphics warm-up was still running when the first frame started" / "hero car was still downloading…"). A returning report can now prove exactly which wait expired.
- Tests: 4 new for `warmupProgressFraction` (bounds, midpoint, clamping, zero window); the diagnostics test gains the Warmup row (33 rows total, done + partial assertions).

**What this does and does not claim:** it guarantees the first frame waits for the compile again (the mechanism that gave clean gameplay at §135) while removing the "still bar" perception that triggered §136; it does not remove the work — on this device the one-time warm-up still takes as long as the GPU needs (the bar just shows it moving). That cost is one-time per device: browsers cache compiled WebGPU pipelines, so later loads are much faster. If the one-time wait still feels too long on a device, the honest lever is a **lower graphics tier in the menu** (fewer effects to pre-compile) — not another budget cut. The 25 s / 10 s budgets are caps for pathological GPUs (the §135 lost-context recovery and the 90 s loading backstop remain the final safety nets); a first frame started over an unready pipeline on a truly weak GPU would show up as "Warmup: partial — may jank" in the diagnostics. No Playwright/Chromium in this sandbox; no rendered capture or device acceptance is claimed.

**Push-before-check / validation:** `2aac00c` pushed before the gate; full `npm run check` passed at `2aac00c`: formatting, lint, GLSL guard, both TypeScript checks, 87 test files / 645 tests, 20 verified assets / 47,814,431 bytes, production build. Existing non-fatal Three.js geometry notices and the Vite large-chunk warning remain.

**Next action:** owner, private/incognito Android Chrome tab (first load on this build is the slow one by design — the "first run is slower" label should be visible while the bar crawls through the warm-up stage): (1) the loading bar should keep moving through the whole warm-up, never sit still; (2) once the game starts, it must not freeze — it should drive immediately and smoothly; (3) F2/📊 → "Warmup" should read `done` (if it reads `partial — may jank`, send that screenshot — it means this device needs more than 25 s and we discuss the tier lever); "Graphics" `ok`, "Frame errors" `none`.

## 138. Black screen after automatic fullscreen on the loading screen (2026-10-25)

**Owner's report:** "Same roadster showing glitch, start game freeze and black screen after going to automatic full screen on the loading screen."

**Root cause (black screen — the new, build-independent part):** the passive fullscreen retry is armed on every page interaction after the browser rejects the silent startup request — so the owner's first tap, landing on the _loading screen_, entered fullscreen at exactly the moment the mobile GPU was in its startup shader pre-compile at peak load. Entering fullscreen swaps the display surface; on this device that swap mid-compile can kill the page's rendering (full black screen). This is independent of which bundle ran: every build so far allowed a passive fullscreen request over the loading screen.

**Fix (commit `97349bc`, pushed before checks):** `FullscreenOnStart` keeps passive gesture retries **dormant until `armPassiveRetries()`** is called; `Application` gains an `onFirstFrame` callback (fired once a frame has actually been submitted — after the §137 warm-up) and `main.ts` uses it to arm the retries. Explicit requests are unaffected: the silent startup attempt (harmless — either rejected or granted before any GPU work) and the pause-menu / touch fullscreen buttons (deliberate actions during play). The fullscreen feature is preserved — it just can no longer land mid-compile over the loading screen; on the owner's flow it now fires on the first drive input after the first frame.

**The other two symptoms — likely the previous bundle, now verifiable:** "same roadster glitch" + "start game freeze" are the _known behaviors of the pre-`b7ccb5c`/pre-`2aac00c` builds_ (the car-swap gate landed in `b7ccb5c`; the 8 s warm-up cut that froze the first frames was reverted in `2aac00c`). There is no service worker, so a normal tab's HTTP cache is the only way to run an old build — which is exactly what the loading footnote's **build tag** (e.g. `build DwjdygcU`) was added to settle. The owner was asked for the build tag from the failing session and whether it was a private/incognito window; until that answers, no new root cause is assumed for those two symptoms — they should be re-tested on the current build in an incognito window first.

**What this does and does not claim:** the deferral removes the one concrete in-code trigger for the black screen (a surface swap during peak GPU load) on all devices; it does not prove the owner's GPU survives the warm-up itself — if the black screen returns _without_ a fullscreen transition, the next suspects are the device's driver killing the GPU under compile load (the "Warmup" diagnostics row and a lower tier are then the levers). No Playwright/Chromium in this sandbox; no rendered capture or device acceptance is claimed.

**Push-before-check / validation:** `97349bc` pushed before the gate; full `npm run check` passed at `97349bc`: formatting, lint, GLSL guard, both TypeScript checks, 87 test files / 646 tests, 20 verified assets / 47,814,431 bytes, production build (the fullscreen suite gained the dormancy test; existing non-fatal notices unchanged).

**Next action:** owner, **private/incognito** Android Chrome tab on the current build: (1) note the build tag in the loading footnote and report it; (2) during the loading screen, tap the screen — nothing fullscreen-related should happen yet; (3) once driving starts, the first steering touch enters fullscreen (no black screen); (4) car should be the Generic Sports Coupé from the first frame; (5) F2/📊 → "Warmup" `done`, "Graphics" `ok`. If the old build tag appears, the cache story is confirmed and this round was measured on stale code.

## 139. Re-test on the current build: all three symptoms persist (2026-10-25)

**Owner's answers (decisive):** the failing session ran the **current build** (footnote tag `build S_1_Y6cw`, i.e. `97349bc`) in a **normal tab**. So the §138 stale-cache hypothesis is out — all three symptoms are real on the latest build: the Roadster→Coupé swap, the start freeze, and the black screen after fullscreen entered over the loading screen.

**Root causes (revised, per symptom):**

1. **Roadster swap — the 8 s download gate expired on this device.** The hero-car gate (§136) waits at most 8 s (after terrain prep) for the 2.9 MB coupé; on the owner's connection the download was still in flight, so the first frame showed the authored roadster fallback and the coupé swapped in mid-drive — the classic symptom, via the designed fail-soft path.
2. **Black screen — the silent startup fullscreen request was the last in-page trigger during loading.** §138 deferral covered the passive gesture retries but not the silent `request()` made at the top of `startDrivingScene` (page load). A browser that honours it (or a driver-level transition) swaps the display surface while the GPU is in its shader pre-compile — the owner's exact black-screen trigger.
3. **Start freeze — most plausibly the aftermath of (2)** (a GPU event that corrupts the first frames) or a warm-up that exceeded its 25 s cap on a bad day; every remaining path is already bounded (cap → console.info, first-frame watchdog, 90 s backstop, lost-context retry) and the "Warmup" diagnostics row will tell which one fired.

**Fix (commit `44b1ddd`, pushed before checks):**

- `HERO_CAR_READY_TIMEOUT_MS` 8 s → **20 s**: the download overlaps terrain prep and the main compile pass (bar keeps moving, stages 0.85→0.88 "Loading your car model…" then 0.88→0.97), so a normal connection adds no time and a slow one is covered; only a pathological network still gets the fail-soft late swap.
- **No in-page fullscreen activity while the loading screen is up, period**: the silent startup request now fires in `onFirstFrame` together with `armPassiveRetries()`. Fullscreen during the loading screen can now only come from the browser UI; a `fullscreenchange` listener records that (`fullscreenEnteredDuringLoading`, reset per scene start so a restart that begins already-fullscreen does not false-positive) and logs it on the first frame, so the next device report can name the source.
- No behaviour change for the explicit fullscreen buttons (pause menu / touch) — deliberate actions during play.

**What this does and does not claim:** it removes the two in-code mechanisms that could still produce the car swap and the black screen on the current build, and it names the remaining black-screen suspect (browser-initiated fullscreen over the loading screen) instead of guessing at it; it does not prove the owner's GPU survives the pre-compile itself — if the freeze/black screen returns with _no_ fullscreen involvement, the next levers are the Warmup row (did the compile finish?) and a lower graphics tier (fewer, cheaper programs). No Playwright/Chromium in this sandbox; no rendered capture or device acceptance is claimed.

**Push-before-check / validation:** `44b1ddd` pushed before the gate; full `npm run check` passed at `44b1ddd`: formatting, lint, GLSL guard, both TypeScript checks, 87 test files / 646 tests, 20 verified assets / 47,814,431 bytes, production build (existing non-fatal notices unchanged).

**Next action:** owner, normal tab is fine now that the cause of the old symptoms is identified (the build tag must read the new bundle hash, not `S_1_Y6cw`): (1) car is the Generic Sports Coupé from the first frame, even on a slow connection; (2) during the loading screen, tapping the screen and the address-bar fullscreen button are the only fullscreen sources — if the black screen returns, it is browser-initiated over the loading screen (the new console.info confirms) and the honest lever is the graphics tier; (3) no start freeze; F2/📊 → "Warmup" `done`.

## 140. Phase 8.2b: alley sitters, home enter/exit, and easter eggs (2026-10-26)

**Scope (the last street-life increment of the program brief):** homeless sitters in the narrow alleys, people going in and out of homes, and the easter-egg street moments. Budgets were already declared in `URBAN_STREET_LIFE_TIER_BUDGET` (sitters 1/2/3, home doors 4/8/12, eggs 2/3/4); this section implements them.

**Design — time-based and deterministic, no player plumbing:** everything runs off a single render-time clock (`#clockTime += delta`) in `UrbanStreetActivity`, so no new arguments crossed `Application` → `DrivingWorld` → `UrbanNightWorld`. Proximity reactivity (a sitter noticing the car pass) is a documented future extension, not this phase.

- **Alley sitters** (`createSitterGeometry`, merged boxes; bodies/heads/cardboard = 3 instanced meshes): `urban-night.ts` samples 2 candidates per alley edge (t = 0.32/0.68 of the polyline), offset ≤ 0.45 m from the wall, facing along the alley, and rejects candidates within 1.0 + half-prop of any `UrbanBackstreetProps.placements` (world coords); survivors are converted to city-local and handed in as `alleySitterSlots`. Round-robin across edges spreads them over different backstreets. Animation: breathing y-sway ±8 mm, slow look-around (±0.35 rad), a cardboard box beside every second sitter (others get a hidden zero-scale instance).
- **Home door residents** (2 meshes, reusing the pedestrian geometry): the night world derives `homeDoorSlots` one-to-one from the facade kit's `eave-trim` placements (the vintage door hoods, already city-local and street-facing; door count = min(tier budget, eave count — eaves exist only on small pitched houses, so a composition with 4 houses yields 4 residents). Each resident has a deterministic wait (8–25 s) → walk in (0.85 m/s, smoothstep) → inside (zero-scale hidden matrix, dwell 12–30 s) → walk out → wait, with per-door staggered phases so the doors never synchronize.
- **Easter eggs** (first N kinds per tier: 0 juggler, 1 dog, 2 balloon cart, 3 spinner): deterministic sidewalk spots kept ≥ 4 m from the static vendors. Juggler: 3 cones orbit above hand height (r 0.28 m, 4.4 rad/s). Dog: 27 s cycle, 5 s awake (bounce + head scan) then dozing. Balloon cart: vendor + cart, 5 per-instance-coloured balloons, one released per 18 s and rising 4.5 m before hiding until its next turn. Spinner: 14 s cycle with a 1 s eased 360° spin + 0.18 m hop.
- **Standalone compositions** (look-dev/tests without a road graph) fall back to analytic sidewalk-route spots for all three systems, so `new UrbanStreetActivity(tier)` alone still shows the full cast.

**Stats:** `urbanAlleySitters`, `urbanHomeDoors`, `urbanEasterEggs`; `urbanActivityBatches` formulas updated everywhere (B 17→30, C 14→23, A 17→32). Draw-call cost: +3 (sitters) +2 (doors) +4–10 (eggs) instanced batches — all static geometry, no physics bodies, no lights.

**Push-before-check / validation:** implementation `2a5157e`, formatting `c274901`, lint fix `ee71dec`, stats-test fix `bc43344`, assertion corrections `dcc630b` — all pushed before their checks. First check stopped at Prettier (fixed), second at ESLint (unused `eggCount`, useless `spinYaw` init — fixed), third at TypeScript (shadowed `cityStats`, strict-undefined in the batch formula — fixed), fourth failed two new tests that had assumed explicit slots override the tier budget (they don't: `min(budget, slots)`) and a fixed eave count of 10 (the count follows the composition's pitched houses — now asserted against the actual `aohara-facade-kit-eave-trim` instance count). Full `npm run check` then passed at `dcc630b`: formatting, lint, GLSL guard, both TypeScript checks, **87 test files / 649 tests**, 20 verified assets / 47,814,431 bytes, production build (large-chunk warning non-fatal).

**What this does and does not claim:** the cast is verified in headless tests (deterministic matrices, door state machine through full cycles, egg motion windows, budget caps, batch counts) — no rendered capture or device acceptance; the alley sampler's real-world spread depends on the shared road graph and prop clearance, and the owner's eyes are the final check for "does the backstreet feel inhabited." The §139 three-symptom fixes remain the pending device verification (`build CCsJlEk7`).

**Next action:** owner device pass — (1) verify the §139 fixes on the fresh deploy (build tag ≠ `CCsJlEk7`), (2) in the backstreets: sitters against the walls (look for the cardboard), (3) at the vintage houses: a resident stepping out / walking back in over a couple of minutes, (4) the four street moments on the main sidewalks (juggler, dog, balloon cart with a drifting balloon, spinner). Then the program continues to 8.3 (facade densification, gated on the owner's "big boxes" verdict) and 9.1 before 7.2 (wilderness tracks) and 7.3 (fauna charges).

## 141. Re-test: freeze and roadster flash persist — the budgets were the bug (2026-10-26)

**Device report (owner, Android Chrome, current build `BOppTZoa` = `3c247cd`):** the §139 fixes are **not fixed**. Two of the three symptoms reproduce exactly: (1) after the loading screen fades, the game world is visible and looks normal but **nothing moves, no error shown**, and it recovers on its own after **1–3+ minutes**; (2) right after the loading screen ends, the **roadster is visible for a moment, then swaps to the Generic Sports Car**; (3) auto-fullscreen on first interaction still fails, while the explicit control works.

**Re-diagnosis (the owner's answers settled it):** the freeze is not a watchdog loss, not a black screen, not a loading-bar stall — it is the **first frame starting over an unready shader pipeline**. The §137/§139 warm-up is bounded by `WORLD_WARMUP_TIMEOUT_MS = 25 s`; on this device the full scene takes 1–3 minutes to compile, so the budget expired, the first frame ran, and the remaining programs compiled in-frame for the next minutes. A bounded budget can never win: "long enough" on this GPU is "too long" everywhere else, so §141 removes the bound entirely. The roadster flash is the same disease on the network side: `HERO_CAR_READY_TIMEOUT_MS = 20 s` expired mid-download of the 2.9 MB coupé, the first frame showed the authored fallback (roadster), and the late GLB swapped in a moment later.

**The fix (`33102c9`), three parts:**

- **Unbounded pre-compile wait** (`Application.start`): the main `renderer.compile` pass is awaited _in full_ before the first frame via the new `#awaitWarmupIndefinite` (direct await + a 250 ms progress ticker; `setTimeout(fn, Infinity)` is never used — it fires immediately per the HTML spec). Progress is `warmupProgressAsymptotic` (new, `shared/budget.ts`): `from + (to−from)·(1−e^(−t/τ))`, τ = 45 s, so the bar keeps visibly creeping for a one-to-three-minute compile (63% of the band after τ, 95% after 3τ). The car-and-effects second compile pass is waited on the same way (0.97→0.985). Fast GPUs finish in seconds — the wait ends as soon as the compile does, so there is no cost there.
- **Stall-based loading backstop** (`LoadingScreen`): the old "fail after 90 s of lifetime" would now have killed a legitimate two-minute compile, so the backstop fires only on **90 s without a progress tick** — `update()` re-arms it on every tick (disarmed once completion is pending), and the timer closure carries a timer-identity guard so a superseded deadline is inert. A slow-but-alive startup can run as long as it keeps reporting; a truly dead pipeline stops ticking and is still reported. The new message is "The game has not made loading progress in the expected time."
- **Hidden fallback while the hero model downloads** (`PlayerCarVisual`): the constructor takes `{ revealFallback?: boolean }`; for the selected coupé the roadster starts **hidden**, so the first frame can never show the wrong car. On a failed or timed-out fetch, `revealFallback()` restores it (fail-soft: the drive starts on the roadster, and a late GLB still swaps in mid-drive). `HERO_CAR_READY_TIMEOUT_MS` is raised 20 s → **60 s** to cover a slow mobile connection. Mid-drive car _switches_ pass `{ revealFallback: true }` so a deliberate player swap never makes the car vanish.
- **Fullscreen (no new code, one diagnostic):** the freeze fix _is_ the fullscreen fix — the passive gesture retries (`pointerup` non-mouse / `click` / `keydown`, deliberately **not** touch `pointerdown`, which is not a reliable activation event on Android Chrome) are armed on the first rendered frame, which now arrives over a fully live game instead of a frozen one. Fullscreen rejection reasons are now logged (`FullscreenOnStart`) so the next device report can say what the browser actually wanted.

**Validation:** typecheck, lint, Prettier clean; `npm run check` passed at `33102c9`: **87 test files / 655 tests** (+6: 2 car-visual hidden-fallback/reveal, 1 loading-screen stall backstop, 3 `warmupProgressAsymptotic`), 20 verified assets / 47,814,431 bytes, production build. CI: Validate #473 + Deploy #462 succeeded; the live bundle is `index-B3hXH0ll.js` (verified: "Warming up the car and effects…", "not made loading progress", "hero car was not ready in time", "fullscreen request was not honoured" all present). The test stub for the loading screen was made browser-faithful (`clearTimeout` now removes the pending entry) and existing backstop assertions updated to the live-timer semantics.

**What this does and does not claim:** the waits are verified by unit tests (asymptotic progress monotone and within band, stall re-arm and superseded-deadline inertness, fallback hidden→revealed→removed across the load states) — no device acceptance. The loading bar on this device will now legitimately show 88%→99% for one to three minutes on a first run; that is the designed behaviour (the alternative is the freeze), and the pipeline is cached by the browser, so later loads are much shorter. If the owner reports the bar "stuck at 99%" with the new stall backstop in place, the console line from the fullscreen log and the build tag will pinpoint the stage.

**Next action:** owner device pass (incognito, build tag ≠ `BOppTZoa`) — bar creeps for as long as it takes, first frame shows the Generic Sports Car, game drives immediately, first touch enters fullscreen (or the console says why not). Then 8.3 / 9.1 / 7.2 / 7.3 in program order. (The street-light round that followed the lost `e022560` was re-landed and re-verified — see §142.)

## 142. Street-light round re-landed: halogen lamps with visible diffraction, destroyable poles, collision for every road/alley element (2026-10-26)

**Context:** the street-light round was authored on 2026-10-26 (halogen city lights with visible Gaussian diffraction, car-destroyable lamps, collision for every element on roads and alleys) and **lost twice to sandbox rotations** (`e022560`, then the whole uncommitted re-apply). This section records the re-landed and re-verified version. The owner's direction (explicit): street lights must look like **real halogen city lights** with **visible diffraction**, balanced so the surroundings stay easy to see while the night vibe holds ("not too bright, not too weak"); lamps must be **destroyable by realistic collision + animation**; **everything on the roads and narrow alleys must have collision**. The earlier neon low-intensity look is explicitly rejected.

**Recovery discipline:** the round was replayed from the recorded edit list onto a fresh clone at `8e56f7c`, committed and pushed **per file group as soon as typecheck was clean** (the standing "commit push before test" rule, applied incrementally after the two losses): `0c5f55e` (collision core + halogen lamp system), `098f653` (street-actor collisions), `e62fc5d` (new tests), `c3aa0c2` (Prettier + one tightened assertion). CI: Validate #478 **succeeded** at `c3aa0c2`; #476/#477 failed only on `format:check` for the not-yet-formatted intermediate commits (superseded); Deploys #464/#465/#466 succeeded.

**What shipped (all in `src/config/urban-city.ts`, `src/world/{town,static-building-collision,urban-night,urban-activity}.ts`):**

- **Halogen look** (`urban-city.ts` + `urban-night.ts`): warm halogen palette (`0xffe7c0/0xffdda8/0xfff1d2/0xffd9a0`), 550 cd point lights with 34 m range and a 3.1 m halo, each lamp carrying the **Gaussian diffraction spike + soft core** glows (optics 0.22/0.03/0.009/0.18, max opacity 0.38) — visible star spikes at night without a global bloom pass.
- **Destroyable lamps** (`urban-night.ts`): every lamp is split into a **pole** (static collidable: radius 0.24 m, 30 hit points, 0.3 s cooldown, 2.2 m/s stop speed, 0.7 s flicker-out) and a **head**. The car's contact circles (shared solver, §below) accumulate closing-speed damage; at 30 the lamp breaks: the mast folds away from the car to a 1.45 rad lean clamp (no spring-back), the head is launched toward the car (`carVel·0.3 + 0.45·closing·normal`, lift `0.8 + 0.3·closing`, spin `4 + 1.5·closing`) and tumbles under gravity with a floor at `WORLD_BASE_Y + 0.14` and −0.28 restitution until it rests; the light and bulb emitter flicker out over 0.7 s and stay dark. Broken lamps leave the streaming selection (`#streetLightActivePlacementIndex`) and the intensity sweep becomes the **sole intensity authority** (`index < activeCount ? intensity : 0`). A folded mast is driven over (town precedent: repeated non-solid hits are harmless push-outs). New stat: `streetLightPolesDown`.
- **Shared contact solver** (`static-building-collision.ts`): `testCarCirclesVsCircle` — the car's two axle circles (r 1.18 m, ±1.05 m) vs a world circle, returning the deepest contact with element→car normal, `closing = −(vel·n)`, and the right-positive `lateralOffset` the impact roll needs. This is the broadphase for lamps, street actors and carts alike (not a second physics solver — Rapier remains the single authority; these are analytic contacts whose impulses feed the existing response path).
- **Collision for every road/alley element** (`urban-activity.ts`): `UrbanStreetActivity.collideActors(car)` tags hits `'street-actor'`. Standing actors (sitters, window-moment residents, walkers, cyclists, dog, juggler, spinner, balloon cart) absorb up to their cap (2.2 m/s default, **4.0 m/s carts**) so the car is pushed back instead of passing through; closing > 2.6 m/s triggers a reaction, > 3.4 m/s a strong one, with a 0.35 s per-actor cooldown. **Carts are solid** (never react). Pedestrians/cyclists/sitters/residents/juggler/spinner **knock down**: 0.55 s fall → 3.5–4.5 s lie (deterministic per actor) → 0.45 s get-up, with a car-velocity drift (`min(1.6, speed·0.28)`) and the head riding the body's rotated transform. The **dog flees** 7 m over 4 s (ease-out) and never knocks down; after four strong strikes it is exhausted and flees only 1.2 s. The **juggler's cones scatter** to deterministic spots for the knockdown duration and gather back over 1.2 s after the get-up. The **balloon release** gained an eased 1.5 s ascent to 4.5 m plus the 6 s drift. `UrbanNightWorld.collide` now appends `activity.collideActors(localCar)`.
- **Clearance probes** (`tests/unit/urban-night.test.ts`): road/sidewalk and alley clearance now assert only **untagged** hits (buildings, frontages, props) stay clear — a standing pole or seated actor on the sidewalk centreline is passable by design (the car absorbs, then it folds/knocks down), so the probes no longer fail on the new street furniture.

**New tests (5, in `tests/unit/street-life.test.ts` and `tests/unit/urban-night.test.ts`):** (1) dog flee — 8 m/s car hit, dog covers ≥ 7 m, back by ~4 s; the fourth strong strike shortens subsequent flees to ≤ 1.2 s; (2) knockdown determinism — the same strike in two instances reproduces the fall/lie/get-up matrices channel-for-channel, with the head sweeping to ground level and back over the body; (3) solid carts — street-actor hit at the 4 m/s cap, cart matrix unchanged over 3 s; (4) cone scatter — all three cones rest at their deterministic spots 0.3 s after the hit, orbiting again by 7.2 s; (5) lamp destruction — 8 m/s pole hit: `streetLightPolesDown` = 1, exactly one pole folds to the lean clamp, exactly one head tumbles to the floor and rests (two still frames move nothing), the bulb emitter darks out, and a second pass over the folded mast produces no re-hit.

**Validation:** typecheck clean; ESLint/Prettier clean; `npm run check` passed at `c3aa0c2`: **87 test files / 660 tests** (+5), 20 verified assets, production build. No device visual acceptance: the halogen/diffraction balance and the destruction animation read on the owner's device (the same pass as §141), where the build tag must now post-date `B3hXH0ll`.

## 143. Auto-fullscreen retries armed from construction: any interaction, any screen (2026-10-26)

**Device report (owner):** "Auto Fullscreen on first interaction during the loading screen doesn't work." Follow-up direction: the auto-fullscreen should fire on **any interaction, on any screen while on the game**, as long as the page is not fullscreen yet.

**Diagnosis:** the §138 defence was still in place — the passive gesture retries were _dormant until `armPassiveRetries()`_, which the entrypoint only called at `onFirstFrame` (after the startup shader pre-compile). On the owner's device the loading screen now legitimately stays up for a minute or more (§141 unbounded pre-compile), so every tap on the loading screen hit the dormant gate and did nothing. The listeners were attached, but the gate swallowed the gestures.

**The fix (`8588589`):**

- `FullscreenOnStart` drops the `#passiveRetriesArmed` gate and `armPassiveRetries()` entirely: the capture-phase listeners attached in the constructor (non-mouse `pointerup`, `click`, `keydown`, legacy `touchend` fallback) are live from page load, so a tap **on the loading screen** enters fullscreen. The owner's explicit direction supersedes the §138 surface-swap caution for gesture-driven entries.
- Unchanged contracts: mouse still uses `click` (not `pointerdown`) so the request is made on the completed activation; touch/pen prefer `pointerup`; a successful entry detaches the gesture listeners (the exit gesture is not intercepted) and `fullscreenchange` re-arms them after an exit, so **every later interaction on any screen retries** while not fullscreen; the explicit pause-menu button path (`onFullscreen`) and the silent startup `request()` at the first frame are untouched; landscape-lock best-effort on entry is untouched.
- `main.ts`: the first-frame `armPassiveRetries()` call is removed, and the "fullscreen entered during the loading screen = outside in-page control" telemetry goes with it — an in-page gesture entry during the loading screen is now intentional, so the warning would be a false alarm on every device that uses the new behaviour.

**Validation:** typecheck, ESLint, Prettier clean; `npm run check` passed at `8588589`: **87 test files / 661 tests** (+1: the "dormant until armed" test became "retries from the loading screen", plus a new tap → click → keydown → tap test asserting every interaction kind retries while not fullscreen), 20 verified assets, production build. No device acceptance: the owner's next Android Chrome pass is the gate — a tap on the loading screen (or any later interaction while out of fullscreen) should enter fullscreen; if the browser still refuses, the console line "the fullscreen request was not honoured by the browser" now names the reason.

## 144. Phase 8.3: facade densification — the "still big boxes" fix (2026-10-27)

**Owner verdict:** when asked for the pending Phase 8.3 go/no-go, the owner selected **"Still looks like big boxes"** — Aohara after the 8.1 facade kit + street life + halogen lights still reads as bare blocks from driving distance. 8.3 is explicitly authorized to make the city read as real architecture from the road.

**Diagnosis (measured, not guessed):** the 8.1 kit placed every building-side element (balcony, veranda, eave trim, awning) at the local **+Z** face (`frontOffset = (sin yaw·d, cos yaw·d)`), but the street-facing side and all window instances are the local **+X** face (normal `(cos yaw, −sin yaw)` — see `createWindowCandidates`). The 240 block-perimeter shells (`frontage`/`shop`) are 20 m long along the street and 8.5 m deep, authored so their yaw rotates local +X radially outward from the block — for **all four block sides** the road-facing facade is local +X. The 8.1 detail therefore landed on the alley-adjacent side: Tier A measured 26 awnings / 26 balconies / 6 verandas across ~295 shells, and every road-facing 20 m wall was bare. That is the boxy look.

**The fix (`64bdf70`):**

- **Face-convention fix:** new `streetFrontSigns()` / `streetFacePlacement()` — perimeter shells (`frontage`/`shop`) target local +X (the street face, spanning `building.depth`); standalone kinds (house, mansion, townhouse, infill) keep the 8.1 local +Z front with byte-identical placements. Balcony, veranda, eave-trim and awning candidates all route through the helper, so home-door slots (derived from eave placements) are unaffected.
- **Three dense rhythm elements** (kit 7 → 10 instanced batches, still one InstancedMesh per element): per-floor **slab reveals** across the street facade (2–3 lines, full face length), dark **corner reveals** at both street corners (full wall height), and rooftop **penthouses** on flat roofs (set back from the street face); towers gain a **mid-spandrel glass band** beside the crown so high-rises read as floor stacks.
- **Budgets recalibrated to full district coverage** (measured Tier A candidates: 690 bands / 556 corners / 219 penthouses / 64 glass bands): floorBands 700/710/720, cornerReveals 540/548/580, penthouses 220/224/230 for C/B/A; balconies 14/24/34 → 20/40/72 (stacked 2nd–4th-floor slabs), glassBands 6/10/14 → 36/48/64 (both bands on every tower at A), awnings 10/18/26 → 20/26/40 with shops as **priority** candidates so all 19 shops keep a canopy at any tier.
- **Tests (9 → 11):** the street-face attachment test now asserts the +X convention with per-element protrusions; new "targets every block side of a perimeter shell on its true street face" regression (all four yaws: east/west/north/south shells put bands and corners on the road side, at the face line, within the 20 m span); new "dresses nearly every street-facing shell and scales C < B < A across the district" (real `UrbanNightWorld` at all three tiers: ≥2 bands per shell, corner pairs on ≥97% of shells, ≥85% penthouse coverage, awnings ≥ shop count, both tower bands, strict C<B<A density ordering); stacking test allows the design caps (≤3 balcony slabs, ≤3 bands, ≤2 corners, ≤2 tower bands); batch caps 7 → 10.

**Validation:** full `npm run check` passed at `64bdf70`: Prettier, ESLint, GLSL guard, both TypeScript checks, **87 test files / 663 tests**, 20 verified assets / 47,814,431 bytes, production build. CI for `64bdf70`: Validate #482 ✓ (1m 22s), Pages Deploy #471 ✓ (54s). Live bundle `assets/index-D5kdUwXd.js` spot-checked: all 7 Phase 8.3 markers present (floor-slab / corner-pilaster / penthouse material names, `facadeKitPenthouses` stat, `floor-band`/`corner-reveal`/`penthouse` element keys). No device visual acceptance — the owner's drive (build tag from the loading footnote) is the gate: Aohara facades should now read as a street of buildings, not a grid of boxes.

## 145. Phase 8.3b: bold rhythm + two-tone massing (the second "still boxes" verdict) (2026-10-27)

**Owner verdict:** the 8.3 densification (`64bdf70`) deployed and verified in the live bundle, but the owner's next check-in still came back **"still looks like big boxes."**

**Why 8.3 failed to land (diagnosis):** the 8.3 rhythm was architecturally correct but optically weak — 16 cm slab lines and 14 cm corner strips do not carry a 10–13 m wall seen at night from 20–40 m, and the wall material stayed one flat tone per building. A box with faint hairlines is still a box. The fix is to make the rhythm **bold** and split the mass into **base / body / crown** tones.

**The change (`2eca343`):**

- **Floor bands on the true floor rhythm:** slab lines move to the 2.6 m window-floor pitch (just above each window head, 2.97 + 2.6·f) and thicken 0.16 → 0.34 m, so window tops tuck under the slab lip; up to five lines per shell (calibrated caps 860/866/880 against measured candidates 853/862/872).
- **Corner pilasters** widen 0.14 → 0.3 m, standing 3 cm proud of the wall, clear of the window margin.
- **Two new full-face cladding bands** (kit 10 → 12 instanced batches): a dark stone **ground-floor base** (3 m tall, kept behind the glazing plane at 0.09 m vs window rear 0.1125 m so storefront glazing reads proud of it) and a lighter **parapet crown** (top 1.8 m) — every street facade now reads as base/body/crown, which is the tonal contrast that carries at night.
- **Penthouses** grow ×1.25 footprint and 1.8–2.7 m tall; **balcony budgets triple** (20/40/72 → 50/90/150) so stacked slab rows cover ~half the shells at A.
- **Window grid density doubles** at B/A: the candidate pool measured at 24,617, tier A now keeps 14,400 (~58% fill, 20% before); **lit-window emission triples** (160/320/512 → 240/480/900) — bounded instanced emission, no new lights.

**Tests:** the street-face test now asserts the 2.6 m floor rhythm, the 0.12 m corner inset, cladding placement/scale, and the bolder penthouse envelope; stacking allows up to five floor bands; batch caps 10 → 12; the real-district density test adds cladding coverage (≥ all shells, strict C < B < A) and balcony ordering.

**Validation:** full `npm run check` passed at `2eca343`: Prettier, ESLint, GLSL guard, both TypeScript checks, **87 test files / 663 tests**, 20 verified assets / 47,814,431 bytes, production build. No device visual acceptance — the owner's drive is the gate. If the verdict is still "boxes" after this round, the next lever is not more kit detail but **shell massing** (varied heights/setbacks/rooftop lines in the block generator) and **per-building wall material variation** — both are larger, collider-affecting changes and get their own scoped phase.

## 146. Phase 8.3c: break the box massing (the third "still boxes" verdict) (2026-10-27)

**Owner verdict:** after 8.3 (§144) and 8.3b (§145) deployed and verified in the live bundle, the owner's check-in came back "still looks like boxes" a third time — with no specific part named.

**Diagnosis (why two detail passes failed):** the box cue is the **massing**, not the walls. All 240 perimeter shells shared one uniform height band (8.2–13.3 m), one uniform footprint (8.5 × 20 m), and flat roofs on 82% — a grid of identical volumes reads as boxes at any level of wall detail. The remaining lever is varied block heights, varied spans, roofline variety, and dressing every wall (the side walls seen across alleys were still bare).

**The change (`0d92581`):**

- **Street character per block side:** each side of each block takes a contiguous run of low (5.5–8.5 m), mid (10–16 m) or high (18–26 m) buildings; edge blocks on the avenues may carry high-rise (20% of their sides), inner blocks stay low/mid. Hipped roofs follow the class (45% of low, 15% of mid, none of high) and render steeper (up to 3.4 m) so low/mid-rise blocks shed their box tops.
- **Street spans vary 16–24 m** along each side; the existing clearance selector opens the rows exactly where the alley mouths cross them — 211 of the 240 candidates survive at the real district origin (the 29 openings are the passageway mouths, matching the "rows open only where clearance requires" design).
- **The rhythm kit dresses all four walls:** floor bands, corner pilasters, ground-base and crown cladding now wrap every shell, not just the street face (instance counts roughly quadruple — tier A: 3908 bands / 996 corner pairs / 996 base+crown pairs — still 12 instanced batches). Commerce elements (balconies, awnings, verandas, eave kits) remain street-facing.
- **Budgets recalibrated** against measured candidate counts at the real origin (floorBands 4280/4316/4360, cornerReveals 1088/1104/1120, penthouses 216/218/222, cladding 1088/1104/1120 for C/B/A). Colliders track the new shell sizes; all 27+ clearance assertions still pass.

**Tests:** the street-face attachment test gains `locateOnFaces` (a placement must sit on exactly one face line for bands/cladding, two for corners); the all-block-sides regression now asserts the street face _and_ the alley face are dressed with equal band counts and exactly two street-side corners; stacking caps reflect the four-wall design (≤20 bands, 4 corners, 4 cladding per building); the frontage-count contracts move from `>= 240` to `200..240` with the alley-mouth rationale.

**Validation:** full `npm run check` passed at `0d92581`: Prettier, ESLint, GLSL guard, both TypeScript checks, **87 test files / 663 tests**, 20 verified assets / 47,814,431 bytes, production build. No device visual acceptance — the owner's drive is the gate. If the verdict is still "boxes" after this round, the facade/massing levers within the fixed grid are exhausted; the next step would be a structural district re-plan (irregular block layout, through-streets) — that is a new phase, not an 8.3 follow-up.

## 147. Phase 8.3d: make the walls read as buildings (the "little square boxes" verdict) (2026-10-27)

**Owner verdict:** after 8.3c (§146) the drive came back "still looks like boxes with some little square boxes on it." Two pieces of signal in one sentence: (1) the base volumes still read as boxes, and (2) the details I keep adding read as _boxes glued on_ — the penthouses (1.8–2.7 m volumes on flat roofs) are literally small boxes on big boxes.

**Diagnosis (why three passes failed):** at night a building reads by its **window grid and its street-level life**, not by its wall texture. Aohara's walls were mostly blank dark stone: the window panes were small (1.3 × 1.35 m at 3.1 m pitch ≈ 40% glass), only ~4% were lit in a flat-random scatter, the ground-floor 3 m band was solid dark cladding on every shell (the closest, most prominent zone), and the roofs carried the penthouse boxes. Blank wall + band lines + roof boxes = "boxes with little boxes."

**The change (`041e5d5`):**

- **Shopfronts on the street face:** every frontage/shop shell's ground level now carries a row of shopfront glazing units (4.2 m pitch, 3.4 m wide, 2.6 m tall) — dark glass in the facade kit (855 units at the real origin), with ~64% lit as warm/cool emissive bands (544) in the night accents. The street line glows like a night city; closed shops stay dark. Lit tone matches the building's window tone (same salt).
- **Occupied windows:** panes grow to 1.9 × 1.7 m (ribbon proportion), rows start at 4.3 m above the shopfronts (the ground row was buried in the 3 m cladding before), and lit selection now follows **per-building occupancy** (litness 0.08–0.88, 12% of floors dark, per-building warm/cool tone, street-face priority) instead of a flat random scatter — bright blocks glow, dark blocks sit dark. Lit budgets 800/1800/3000 (C/B/A); these are emissive instances, no new lights, Night Mood untouched. Street-facing windows also keep their static panes first when the tier facade budget cuts (A: 14,400 of ~20k candidates).
- **Masts instead of penthouses:** the penthouse element is deleted; slim antenna poles (0.1 m, 2.5–6 m, one crossbar) stand on 45% of flat roofs and every tower (126 at the real origin). Verticals without adding another box.

**Tests:** kit element contract reworked (mast + storefront-glazing placement/scale/face assertions, stacking caps, 13 batches); district density test swaps the penthouse assertions for mast (≥ 20% of shells) and storefront assertions (tier-independent, ≥ 1 per shell); the real-district test asserts the lit storefront bands exist.

**Validation:** full `npm run check` passed at `041e5d5`: Prettier, ESLint, GLSL guard, both TypeScript checks, **87 test files / 663 tests**, 20 verified assets / 47,814,431 bytes, production build. District numbers (real origin, C/B/A): frontage 240, lit windows 800/1800/3000, facade panes 4800/9600/14400, shopfront glazing 855, lit shopfront bands 544, masts 126, kit batches 13. No device visual acceptance — the owner's drive is the gate. If the verdict is still "boxes," the remaining lever is structural (setback/podium massing or a district re-plan) — the wall-surface levers (detail, rhythm, massing height, windows, street life, roofs) will then be exhausted.

## 148. Phase 8.3e: break the wall — set-back massing (the fourth "still boxes" verdict) (2026-10-27)

**Owner verdict:** "still looks like boxes with some little square boxes on it" — verbatim identical to the §147 verdict, after the 8.3d window-wall treatment deployed (verified in the live bundle: shopfront bands + masts present, penthouse markers gone). Four rounds now: detail (8.3), rhythm (8.3b), height runs (8.3c), windows + street life (8.3d). The wall-surface levers are exhausted; the one thing none of them touched was the **silhouette** — abutting rectangular prisms sitting on one coplanar street line. (The identical wording also leaves open a stale-cache drive; 8.3e is bold enough that no cached build could reproduce it, which will also disambiguate that on the next pass.)

**The change (`6cc83b7`):**

- **Two-volume shells:** every eligible frontage/shop shell becomes a full-footprint **podium** (top at mid-spandrel of the 2.6 m window rhythm — 5.6 / 8.2 / 10.8 m for low/mid/high, so no window row straddles the step) plus an **upper volume set back 1.2–2.5 m from the street face**, 1–2 m from the alley on half the buildings, and 0.8–2 m on one end for 35%. The street row reads as composed volumes with terrace steps instead of one coplanar wall of prisms.
- **Terraces and roofs:** the podium top carries a dark terrace slab; the roof (flat eave slab or hipped pyramid) sits on the set-back volume only.
- **The kit follows the volumes:** window rows split at the step (podium rows on the podium faces, upper rows on the inset faces), floor bands continue onto the inset faces with the last podium band doubling as a terrace cornice, the crown cladding moves to the upper faces, corner pilasters follow the podium (full height +0.1 m on single volumes), masts stand on the upper volume's roof, shopfronts/awnings stay on the podium street face.
- **Cladding goes flush:** the base/crown cladding bands now sit 0.02 m from the wall (front at 0.02 m, behind the glazing plane at 0.0325 m) — the 8.3b 0.05 m protrusion was in front of the panes and was silently hiding the top window row behind the crown band; now the top row glows in front of the parapet band with no z-fighting.
- **No physics change, no new draw calls:** the Rapier collider keeps the full bounding box (the set-back is inside it; the car never reaches podium height), and the shells stay in the existing instanced colour batches (two box instances per massed shell).

**Tests:** new regression test "masses set-back frontage shells" asserts the band split at the step on the inset faces, the street crown on the inset line vs the alley crown on the box line, podium-height pilasters, masts within the upper footprint, and the shopfront row on the podium face; the per-element contract updates (corner height +0.1 m, band top bound at the step, cladding beyond 0.0); stacking cap for floor bands rises 20 → 40 (podium + upper bands per face).

**Validation:** full `npm run check` passed at `6cc83b7`: Prettier, ESLint, GLSL guard, both TypeScript checks, **87 test files / 664 tests**, 20 verified assets / 47,814,431 bytes, production build. District numbers (real origin, C/B/A): frontage 240, lit windows 800/1800/3000, facade panes 4800/9600/14400, shopfront glazing 855, lit shopfront bands 544, masts 126, floor bands 4280/4316/4360 (raw now trims at the existing caps), kit batches 13. No device visual acceptance — the owner's drive is the gate. After this round, if the verdict is still "boxes," the next step is a structural district re-plan (irregular block layout, through-streets, per-block wall material variation) — a new phase, larger in scope.
