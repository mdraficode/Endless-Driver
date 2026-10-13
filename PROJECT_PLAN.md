# Endless Driver — Project Plan and Implementation Instructions

**Planning baseline:** 2026-10-13  
**Project stage:** Phase 1 (core engine, loop, camera, lighting) implemented; Phases 2–6 not started  
**Development authorization:** Phase 1 only, per explicit user instruction; Phase 2 requires a new instruction  
**GitHub destination:** Public [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver), branch `main`  
**Remote synchronization:** Initial scaffold, repository documentation, and Phase 1 pushed and verified; CI runs on each push

The original requested technical scope is retained in [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md).

> This is the implementation specification, not a claim that the game is complete. Phase 1 ships the runtime foundation only: renderer, loop, scene, reference lighting, diagnostics, and disposal. There is still no physics, terrain, vehicle, input, weather, or gameplay implementation. The planned stack is Three.js + Rapier (see `docs/decisions/0002-renderer-three-js.md`), not Babylon.js.

## Contents

1. [Vision, scope, and delivery rules](#1-vision-scope-and-delivery-rules)
2. [Selected technology and decisions](#2-selected-technology-and-decisions)
3. [Architecture and module boundaries](#3-architecture-and-module-boundaries)
4. [Simulation and vehicle specifications](#4-simulation-and-vehicle-specifications)
5. [Procedural world and streaming specifications](#5-procedural-world-and-streaming-specifications)
6. [Rendering, seasons, and weather specifications](#6-rendering-seasons-and-weather-specifications)
7. [Controls, cameras, and HUD](#7-controls-cameras-and-hud)
8. [Quality tiers and performance budgets](#8-quality-tiers-and-performance-budgets)
9. [Step-by-step phased execution](#9-step-by-step-phased-execution)
10. [Testing and phase acceptance](#10-testing-and-phase-acceptance)
11. [Assets, risks, and decisions to revisit](#11-assets-risks-and-decisions-to-revisit)
12. [GitHub continuity and session handoff](#12-github-continuity-and-session-handoff)
13. [Requirements traceability](#13-requirements-traceability)
14. [Technical references](#14-technical-references)

## 1. Vision, scope, and delivery rules

Build a browser-based, single-player 3D driving experience with convincing vehicle dynamics, a continuously streamed procedural landscape, realistic PBR presentation, day/night changes, seasons and weather, and keyboard plus multi-touch controls.

### Required delivery

- Modular Vite + TypeScript foundation; responsive, high-DPI-aware rendering and FPS monitoring.
- Rigid-body collisions and a four-wheel raycast vehicle with suspension, torque, steering, brakes, transmission, tire traction, weight transfer, and controlled drifting/skidding.
- A licensed GLB/GLTF car with wheel rotation, front-wheel steering, interior steering-wheel movement, brake lights, and shadows.
- Seeded terrain, connected roads, trees, rocks, and buildings; bounded chunk streaming and LOD.
- Spring, summer, autumn, and winter; weather and surface conditions influence appearance and traction.
- PBR, sun/sky lighting, day/night, shadows, tone mapping, and a scalable post-processing stack.
- Keyboard and simultaneous touch driving; chase, cockpit, and orbital cameras.
- Reproducible builds, meaningful tests, recorded performance measurements, and Git-based session continuity.

### Scope boundaries

- “Infinite” means procedurally addressable world space with finite active memory, not infinitely allocated terrain.
- “AAA look” is an art-direction goal; it is not a guarantee of AAA production quality or desktop effects on every phone.
- Target 60 FPS on agreed reference hardware. Slower devices may use lower quality or a stable 30 FPS fallback. No universal 60+ FPS guarantee is possible before profiling.
- Multiplayer, accounts, traffic AI, races, monetization, multiplayer determinism, and server persistence are not part of these six phases.
- Do not implement the complete game in one file. Keep feature modules small, typed, independently testable, and explicitly disposable.
- Do not start any development phase until the user authorizes it. Completing one phase does not automatically authorize the next.

## 2. Selected technology and decisions

| Area               | Selection                                               | Reason and constraint                                                                                                                    |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering          | Three.js (`three`) with ES-module addons                | Selected by explicit owner instruction (ADR 0002); renderer, scene, sky, and lighting are project-owned code instead of engine defaults. |
| Language/build     | TypeScript + Vite                                       | Strict typing, fast development, static production distribution.                                                                         |
| Physics            | Rapier 3D compatibility package                         | WASM rigid-body physics and a dynamic raycast vehicle controller; initialization is asynchronous.                                        |
| UI                 | Semantic DOM + Tailwind CSS Vite plugin                 | Lightweight HUD and touch overlays; no React layer is necessary for this architecture.                                                   |
| Terrain noise      | simplex-noise + a seeded random source                  | Deterministic sampling; never use unseeded randomness for world generation.                                                              |
| Renderer baseline  | WebGL2                                                  | Broad desktop/mobile baseline; show a clear unsupported-browser message if unavailable.                                                  |
| Optional renderer  | WebGPU, after baseline validation                       | Experimental quality path, not a Phase 1 dependency; custom effects need compatible shader variants.                                     |
| Tests              | Vitest; browser automation added with relevant phases   | Pure logic and headless physics tests first; browser input and rendering checks later.                                                   |
| Package management | npm with exact direct versions and a committed lockfile | `npm ci` reproduces installs; upgrade packages deliberately, not implicitly between sessions.                                            |

### Architectural decisions

1. **Rapier is the only physics authority.** Do not add a second solver (Havok, Cannon, ammo) or a competing movement resolver for the same vehicle. Three.js renders; Rapier resolves contacts and motion.
2. **Use a direct integration adapter.** Physics modules expose engine-independent transforms and telemetry. Rendering adapters apply interpolated transforms to Three.js objects.
3. **Start with the compatibility WASM package.** It simplifies bundling, but its embedded WASM increases JavaScript payload. Profile startup and consider a separately served WASM build later, without changing physics ownership.
4. **Use a fixed physics tick and independent rendering.** Physics must not depend on display refresh rate.
5. **Use quality presets from the beginning.** High-DPI and expensive effects cannot be enabled without pixel and GPU budgets.
6. **Do not force WebGPU.** GLSL effects are not assumed to work unchanged on a WGSL/WebGPU path.
7. **Respect repository visibility and distribution licensing separately.** The owner explicitly authorized a public GitHub repository. Keep npm publication disabled (`private: true`) and `UNLICENSED` metadata until the owner selects a distribution license; public visibility does not itself assign an open-source license.

Dependency versions are recorded in `package.json` and `package-lock.json`, not duplicated throughout this plan. TypeScript and test-tool versions may intentionally lag the latest major release for verified compatibility.

## 3. Architecture and module boundaries

### Initial tracked structure

```text
endless-driver/
├── AGENTS.md                     # Rules for future development sessions
├── PROJECT_PLAN.md               # This implementation specification
├── README.md                     # Setup, commands, current state
├── package.json / package-lock.json
├── index.html                    # Static scaffold-status page only
├── vite.config.ts
├── tsconfig.json / tsconfig.tools.json
├── eslint.config.js
├── .github/workflows/ci.yml       # Validation, not deployment
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SESSION_HANDOFF.md
│   ├── GIT_WORKFLOW.md
│   ├── ASSET_POLICY.md
│   └── decisions/0001-engine-and-physics.md, 0002-renderer-three-js.md
├── public/assets/
│   ├── models/ textures/ audio/ environments/
│   └── manifest.json             # Empty; no third-party assets acquired
├── src/
│   ├── main.ts                   # DOM lookup, application start, debug handle
│   ├── style.css
│   ├── core/                     # Application, Engine, SceneManager, PerformanceMonitor
│   ├── physics/                  # Rapier world, colliders, queries, snapshots
│   ├── world/                    # Seeded terrain, roads, chunks, origin rebasing
│   ├── vehicles/                 # Vehicle config, controllers, visual adapter
│   ├── input/                    # Keyboard/touch -> normalized actions
│   ├── cameras/                  # Chase, cockpit, orbit
│   ├── ui/                       # HUD, settings, touch layout, loading/errors
│   ├── environment/              # Day/night, seasons, weather, surface state
│   ├── shaders/                  # Terrain and effect shader variants
│   ├── assets/                   # Asset loading, manifests, ownership
│   ├── config/                   # Tuning and quality profiles
│   ├── shared/                   # Engine-independent types and utilities
│   └── workers/                  # Future CPU world-generation workers
└── tests/
    ├── scaffold.test.ts          # Infrastructure checks, not game tests
    ├── unit/                     # Implemented: math, config, statistics, module APIs
    ├── physics/ integration/ browser/ performance/
    └── README.md
```

Module directories own their stated responsibilities. Phase 1 code exists in `core/`, `config/`, `shared/`, and `ui/`; everything described below for later phases is planned, not implemented.

### Ownership and dependency rules

- `core` owns composition/startup/pause/shutdown (`Application`), the renderer and loop (`Engine`), the Phase 1 scene (`SceneManager`), frame statistics (`PerformanceMonitor`), and diagnostics.
- `physics` owns the Rapier world and all bodies/colliders. It must not depend on DOM or Three.js runtime classes.
- `vehicles` owns drivetrain/control logic and vehicle definitions; isolate Three.js model binding in its visual adapter.
- `world` owns chunk identity, deterministic data, streaming queues, terrain/road topology, and global-to-local positions.
- `input` publishes normalized actions; it never changes vehicle transforms directly.
- `cameras` consumes interpolated vehicle poses and obstacle queries; it never advances physics.
- `environment` supplies visual parameters and a surface-state map consumed by vehicle traction.
- `ui` displays snapshots and issues commands; it does not run a second simulation loop.
- `shared` is dependency-light. Avoid making it an unstructured dumping ground.
- CPU workers generate serializable terrain/placement buffers only. GPU and physics object creation stay on their owning thread initially.

### Lifecycle contract

Every system that allocates meshes, WASM objects, workers, event listeners, observers, timers, or render targets must have an explicit disposal path. Shutdown must release vehicle controllers before their supporting physics world, dispose chunk-owned resources without disposing shared assets, cancel outstanding jobs, and remove input handlers.

## 4. Simulation and vehicle specifications

### Time, coordinates, and integration

- Units: meters, kilograms, seconds; speed stored in m/s and displayed in km/h.
- Axes: +Y up, +X right, vehicle local -Z forward. Normalize imported models into this convention rather than changing it per asset.
- Three.js is right-handed by default, which matches Rapier. Keep conversions explicit and tested for axis, quaternion, wheel, and heightfield data.
- Gravity baseline: `(0, -9.81, 0)`.
- Physics tick: 1/60 second initially; render interpolation uses the previous and current completed physics snapshots.
- Clamp unusually large frame deltas; allow at most five physics catch-up steps per rendered frame. If exhausted, discard excess backlog and record the event rather than spiraling indefinitely. Lower visual quality under sustained overload; do not silently alter vehicle tuning or tick rate.
- Pause or reset the accumulator when the page is hidden. Clear held controls on blur, pause, and input cancellation.
- Fixed-step order: sample actions, apply controller/drivetrain updates, update the raycast vehicle when present, step Rapier, then capture authoritative state.

### Raycast vehicle design — Phase 4

1. Use one dynamic chassis with a simple convex/compound collision shape and configurable center of mass.
2. Add four wheel contact rays with radius, rest length, travel, spring stiffness, compression/rebound damping, axle, and steering configuration.
3. Configure front steering, rear/selected drive wheels, service brakes, and rear-wheel handbrake.
4. Convert torque through gear and final-drive ratios to driven-wheel force; implement RPM, shift thresholds, reverse, neutral, and a default automatic transmission.
5. Reduce steering at speed and apply frame-rate-independent input smoothing. Keep tuning data outside controller code.
6. Derive traction from road/terrain material and wetness, mud, ice, and snow states. Blend transitions rather than instantly switching friction at chunk seams.
7. Use suspension loading and chassis center of mass for weight transfer; test acceleration dive/squat, braking, cornering, slopes, and rollovers.
8. Animate visual wheels from contact/suspension state, steering, and rotation; avoid deriving simulation motion from the GLB hierarchy.
9. Drive steering-wheel angle, brake-light emission, skid marks, and bounded particles from telemetry.

### Tire-model feasibility gate

Rapier's built-in controller exposes suspension and friction controls; it is not a complete Pacejka tire, engine, or transmission simulation. In Phase 4, validate available force/contact data against the required tire-friction curves and handling behavior before selecting either:

- **Baseline:** built-in raycast suspension/contact handling plus drivetrain, explicitly defined traction-response curves mapped to supported controller parameters, steering, and telemetry; or
- **Advanced:** a custom raycast tire-force layer with slip-ratio/slip-angle curves and a friction-circle budget.

The baseline is acceptable only if the required curve-driven traction and handling tests are met. If the API cannot meet them, use the advanced path rather than silently dropping tire-friction curves. Do not apply both built-in and custom tire forces to the same wheel. Document the choice and keep Rapier responsible for rigid-body contacts. Physics credibility must come from repeatable handling tests, not the presence of a tire-curve function alone.

## 5. Procedural world and streaming specifications

### Deterministic world model

- World key = seed + generator version. Chunk key = integer `(x, z)`.
- Start with 128 m chunks and a 33×33 near-terrain sample grid; treat these as tunable initial values.
- Sample terrain noise in global coordinates. Adjacent chunks must produce exactly matching boundary heights.
- Use separate deterministic random streams for terrain, roads, vegetation, rocks, and buildings. Loading order cannot change placements.
- Roads are a connected graph with shared boundary decisions, not unrelated lines generated inside each tile. Guarantee a traversable spawn and a continuing road backbone.
- Carve/flatten terrain under road profiles, limit slope and curvature, resolve intersections consistently, and generate road collision surfaces from the same data as road visuals.
- Keep buildings and vegetation out of road corridors and the spawn safety zone.

### Streaming pipeline

1. Convert the vehicle's global location and velocity into prioritized required chunks, including forward look-ahead.
2. Queue generation jobs in nearest/forward-first order with a bounded number of active jobs.
3. Generate CPU height/placement buffers in workers; include seed, generator version, chunk key, and cancellation/version identifiers.
4. Reject stale results after a reset, seed change, or unload.
5. Create meshes and colliders within a per-frame main-thread budget; a worker does not eliminate upload or collider-construction costs.
6. Keep near collision coverage ready before the vehicle reaches it. On a streaming miss, use an explicit safe slowdown/stop or retained fallback collision surface, never allow silent fall-through.
7. Load/unload with hysteresis so boundary motion does not repeatedly create and destroy the same chunk.
8. Pool reusable buffers and instances where helpful; release chunk-owned GPU and Rapier resources on eviction.

### LOD and floating origin

- Start with render radius 3 chunks on desktop and 2 on mobile; near physics coverage is a separate radius with speed-aware look-ahead. Tune using measured costs.
- Use terrain stitch skirts or tested edge stitching between different LODs; matching equal-LOD edges alone is insufficient.
- Use instancing/thin instances for repeated vegetation, distance-based building/prop LOD, shadow-caster limits, and fog for far boundaries.
- Store persistent positions as chunk coordinates plus local offsets. Render and simulate near the current origin.
- Rebase around a provisional 1,024 m displacement threshold at a safe physics boundary. Shift physics, meshes, cameras, previous/current interpolation snapshots, particles, and other local state together. In Phase 6, reset or shift temporal-effect histories too.
- Repeated long-distance travel must plateau in active chunks, colliders, CPU buffers, and GPU resources.

## 6. Rendering, seasons, and weather specifications

### Visual foundation

- Use PBR car, road, and terrain materials; preserve glTF color-space conventions. Base color/emissive are color data; normal/roughness/metalness are linear data.
- Pair the sky with consistent image-based lighting, exposure, sun direction, and tone mapping.
- Begin with one sun directional light and limited fill/ambient lighting. Use distance-capped local lights only where needed.
- Add standard shadows first; use cascaded shadows on supported quality tiers after profiling.
- Implement a controllable day/night clock, sunset/sunrise transitions, darker night exposure, and bounded vehicle lighting.
- Provide an ACES-style tone-mapping path and carefully calibrated exposure; stronger bloom is not a substitute for lighting or good assets.

### Post-processing stack

Introduce and measure one effect at a time: tone mapping/color grading, bloom, SSAO, vignette, then optional motion blur and atmospheric/volumetric effects. Establish color-space and effect ordering against the engine's pipeline; avoid duplicate tone mapping or gamma conversion.

- Bloom: restrained highlights; low-resolution buffers where appropriate.
- SSAO: desktop quality tier; disabled by default on low/mobile tiers.
- Motion blur: opt-in high-tier effect; maintain correct previous transforms, reset on cuts/rebases, and respect reduced-motion preferences.
- Vignette/color grading: subtle, optional, with no loss of HUD readability.
- Volumetric lighting: high-tier experiment; use cheaper fog/atmosphere approximations on lower tiers and label the distinction honestly.
- All custom effects require WebGL2-compatible shader paths; WebGPU equivalents remain optional and separately tested.

### Seasons, weather, and surface behavior

Keep separate but coordinated state for season, weather, time of day, and gameplay surface conditions.

| Season | Presentation                                                       | Driving influence                                  |
| ------ | ------------------------------------------------------------------ | -------------------------------------------------- |
| Spring | Green vegetation, occasional rain, damp surfaces                   | Wet traction and puddle/wetness response           |
| Summer | Warm sunlight, dry foliage/roads                                   | Baseline grip and dry surfaces                     |
| Autumn | Warm foliage, pooled falling-leaf particles, mud                   | Mud rolling resistance and lower off-road traction |
| Winter | Snow masks/accumulation appearance, colder light, bounded snowfall | Snow/ice traction reduction and controlled sliding |

Season changes blend palettes, material parameters, vegetation variants, and surface state. Weather can vary independently within a season. Initial snow accumulation is a visual surface mask, not a full physical snow-volume simulation. Traction remains controlled by explicit surface data, not by texture color. Expose debug season/weather/time toggles in Phase 6.

## 7. Controls, cameras, and HUD

### Action model

A single action state drives all platforms: throttle `[0,1]`, brake `[0,1]`, steering `[-1,1]`, handbrake, camera cycle, gear up/down, pause, and optional boost. Input devices write actions; vehicle controllers consume them at fixed ticks.

| Desktop binding  | Default action                                            |
| ---------------- | --------------------------------------------------------- |
| W / Up           | Throttle                                                  |
| S / Down         | Brake; reverse only through a tested low-speed transition |
| A,D / Left,Right | Steering                                                  |
| Space            | Handbrake                                                 |
| Shift            | Gear-up request in manual mode                            |
| Q / E            | Gear down / gear up in manual mode                        |
| C                | Cycle camera                                              |
| Escape           | Pause/settings                                            |

Automatic transmission is the default. The brief allows Shift for nitro or shifting: choose gear-up for the initial binding. A later optional boost mode may remap Shift, but one press must not trigger both. Do not add a mandatory nitro system without an explicit product decision.

### Mobile and browser behavior

- Virtual analog joystick or steering buttons plus throttle, brake, handbrake, and camera buttons.
- Pointer Events with independent pointer IDs and capture; a user must be able to steer, accelerate, and handbrake simultaneously.
- Correctly release actions on `pointerup`, `pointercancel`, lost capture, blur, menu opening, and orientation changes.
- Prevent scroll/gesture interference only on the active game/control surface; do not disable page accessibility globally.
- Respect safe-area insets, landscape/portrait layouts, left/right-handed preference, and minimum 48 px touch targets.
- Ignore driving shortcuts while a text field/settings control has focus. Prevent arrow/space scrolling only during active driving.
- No requirement for hover, keyboard access, or desktop-sized buttons on mobile.

### Cameras and HUD

- Phase 1: simple inspection camera only.
- Phase 2: provisional chase camera.
- Phase 4: collision-aware chase behavior and normalized cockpit anchor with model-dependent interior visibility.
- Phase 5: consistent chase/cockpit/orbit mode switching on desktop and touch.
- Follow smoothing must be frame-rate independent; use physics queries to avoid camera clipping.
- HUD: speed, gear, pause/settings, loading/errors, optional FPS/debug data, and touch controls. Update numeric HUD values at a controlled frequency rather than unnecessarily rebuilding DOM every render frame.

## 8. Quality tiers and performance budgets

These are **initial budgets to validate**, not measured results. Freeze reference device models, browser versions, display resolution, and measurement procedure in Phase 1.

| Budget                                    | Low/mobile                      | Balanced         | High/desktop                           |
| ----------------------------------------- | ------------------------------- | ---------------- | -------------------------------------- |
| Frame target                              | 60 FPS goal; 30 fallback        | 60 FPS           | 60+ where hardware permits             |
| Device-pixel-ratio cap                    | 1.0 initially                   | 1.5 initially    | 2.0 maximum, subject to resolution cap |
| Render radius                             | 2 chunks                        | 3 chunks         | 3–4 after profiling                    |
| Draw calls, indicative ceiling            | 200                             | 350              | 500                                    |
| Visible triangles, indicative ceiling     | 250k                            | 600k             | 1M                                     |
| Texture GPU allocation, estimated ceiling | 128 MB                          | 192 MB           | 256 MB                                 |
| Shadows                                   | Small map/single cascade or off | Limited cascades | Profiled CSM                           |
| Bloom                                     | Off or lightweight              | Lightweight      | On, bounded buffers                    |
| SSAO / motion blur                        | Off / off                       | Optional / off   | Optional / opt-in                      |
| Weather/foliage particles                 | Strongly capped                 | Moderate         | Higher but bounded                     |

- A 60 FPS frame is approximately 16.7 ms total. CPU and GPU overlap; do not add overlapping timings as if they were independent serial costs.
- Begin with a 2 ms per-frame streaming/upload work budget and measure its impact. The budget may need subdivision or idle scheduling.
- Record rolling FPS, frame-time percentiles, physics timing, chunk timings, draw calls, triangles, and resource counts. GPU timers are optional where supported.
- Use dynamic resolution/quality with hysteresis rather than frequent visual toggling. Never turn on every expensive effect by default because a device is labeled desktop.
- Monitor sustained performance and thermal throttling on real phones, not only desktop mobile emulation.
- Test WebGL context loss and restoration, resizing, tab suspension, asset-load errors, and renderer-initialization failure.

## 9. Step-by-step phased execution

### Before development — initial setup requested now

1. Record this specification, architecture choices, phase gates, and session-continuity instructions.
2. Create the modular project tree and Vite/TypeScript/Tailwind tooling.
3. Pin dependencies and generate the npm lockfile.
4. Configure formatting, linting, type checking, scaffold-only tests, and CI.
5. Add asset-license policy, an empty asset manifest, and future test directories.
6. Validate the scaffold; create an initial Git commit and portable repository bundle.
7. Push to the user's dedicated repository when its actual URL and an authorized Git route are available. Do not invent a destination or claim an unverified push.
8. Wait for explicit Phase 1 authorization.

### Phase 1 — Core engine, loop, camera, and lighting

**Depends on:** Initial scaffold and user authorization.

**Status (2026-10-13): implemented, validated, and pushed.** Delivered as:

1. `src/core/Application.ts` composition root with startup, loading, and error states (`Preparing the scene…`, startup-failure, context-lost, and context-restored messages).
2. `src/core/Engine.ts` initializes one `WebGLRenderer` with antialiasing, filtered shadow maps, and ACES filmic tone mapping. Three.js r186 removed `PCFSoftShadowMap` at runtime (it warns and downgrades), so the configurable shadow mode defaults to `PCFShadowMap` with `VSMShadowMap` available as an opt-in soft alternative; pinning an older three release would restore the literal constant. A failed context initialization surfaces an error state instead of a blank page.
3. Responsive canvas: window resize/orientation listeners plus a `ResizeObserver`, coalesced into a single sizing pass per frame; devicePixelRatio is capped at 2 and the camera aspect ratio follows the viewport.
4. `requestAnimationFrame` loop using `Clock.getDelta()`, per-frame delta clamped to 100 ms, pause/resume on tab visibility, and context-loss recovery. The fixed-step physics scheduler is contracted but intentionally not implemented (no gameplay physics in Phase 1).
5. Phase 1 scene: three-stop gradient sky dome, `AmbientLight`, shadow-casting `DirectionalLight` sun with a 2048² shadow map, 800 m ground plane, debug grid, and three temporary shadow props.
6. `src/ui/DiagnosticsOverlay.ts` reports FPS average/worst, frame time and p95, viewport/DPR, draw calls, triangles, scene object count, camera position, and frame count. A full quality selector is deferred to Phase 6.
7. Deterministic disposal covers renderer, orbit controls, geometries/materials, listeners, and the resize observer. Context loss stops the loop; restoration resumes it.
8. Verification: unit tests for math/config/statistics/module API, production build, and a headless-Chromium smoke test confirming a rendered frame, correct sizing, and DPR capping at `deviceScaleFactor: 3`. The headless check uses a software rasterizer, so it is **not** a hardware FPS measurement.
9. Handoff, README, plan, and ADRs updated; committed and pushed to the canonical repository with CI verification.

**Acceptance:** met — a correctly sized, lit reference scene with a debug orbit camera and diagnostics; one render loop; no leaked listeners/resources on dispose; working production build; no driving implementation.

**Deviations:** renderer is Three.js, not Babylon.js, per explicit owner instruction (ADR 0002); the quality selector is deferred rather than shipped as a stub.

**Stop:** Request authorization before Phase 2.

### Phase 2 — Physics and keyboard-driven placeholder vehicle

**Depends on:** Accepted Phase 1 and user authorization.

1. Initialize Rapier asynchronously and implement world creation/disposal plus optional debug geometry.
2. Add fixed 60 Hz physics stepping, bounded accumulator, transform snapshots, and render interpolation.
3. Create flat-ground and obstacle colliders plus a dynamic placeholder chassis with simple collision geometry.
4. Implement the action interface and keyboard bindings, focus/blur/pause cleanup, and input smoothing.
5. Add deliberately simple force/torque-based driving and braking. Do not present this temporary controller as the advanced raycast vehicle.
6. Add provisional chase camera and speed HUD; implement a safe reset/spawn path.
7. Test stable rest, collisions, basic steering/braking, input release, and comparable simulation at different rendering frame rates.
8. Update handoff, run validation, commit, and push.

**Acceptance:** A collision-aware placeholder car/cube is drivable by keyboard without falling through the floor or changing handling with display refresh rate. No realistic GLB or advanced suspension is required yet.

**Stop:** Request authorization before Phase 3.

### Phase 3 — Procedural terrain, roads, and chunk streaming

**Depends on:** Accepted Phase 2 and user authorization.

1. Define seeded random streams, chunk keys, global coordinates, generator version, and fixture seeds.
2. Implement terrain heights with shared edge sampling and reference chunk seams.
3. Create a connected road graph, safe starting segment, road grading, and matching drivable collision data.
4. Add a bounded, prioritized streaming manager and CPU-generation worker protocol.
5. Create nearby terrain/road meshes and colliders within work budgets; preload forward collision coverage.
6. Add initial terrain LOD with edge stitching/skirts and hysteretic eviction.
7. Add floating-origin rebasing and preserve authoritative/interpolated poses and camera continuity.
8. Add simple deterministic placement markers for later trees/rocks/buildings, excluding roads.
9. Test seeds, loading-order independence, seams, slopes, negative chunk coordinates, eviction, stale jobs, and repeated rebases; perform a long-distance memory/resource soak.
10. Update handoff, validate, commit, and push.

**Acceptance:** The placeholder vehicle can drive across many generated chunks on connected roads without seam collisions, missing ground, rebasing jumps, or unbounded resource growth.

**Stop:** Request authorization before Phase 4.

### Phase 4 — Advanced raycast vehicle and realistic model

**Depends on:** Accepted Phase 3 and user authorization; licensed asset or approved model source.

1. Run a focused Rapier raycast-controller feasibility test; document baseline versus custom tire-force selection.
2. Create data-driven chassis, mass/center-of-mass, wheel, suspension, steering, brake, and drivetrain configuration.
3. Replace the temporary controller with four-wheel raycast behavior; keep only one wheel-force authority.
4. Implement torque/RPM, automatic/manual transmission, reverse/brake transition, speed-sensitive steering, and surface-aware traction.
5. Calibrate acceleration, stopping distance, suspension sag, skid onset, recovery, drift, and rollover response using recorded scenarios.
6. Import a licensed GLB, normalize axes/scale, resolve named nodes, and create camera/lighting anchors. Provide a fallback if model loading or required nodes fail.
7. Animate suspension/wheel rotation/front steering/interior steering wheel; drive brake lights and shadows from state.
8. Refine collision-aware chase camera and cockpit camera. Keep chassis collision geometry simple and independent of render mesh detail.
9. Add bounded skid/particle hooks and telemetry needed by later weather effects.
10. Verify multiple render frame rates, surface changes, curb/slope contacts, upside-down reset, collision stability, and model animation.
11. Update asset manifest and credits, handoff, validation evidence, commit, and push.

**Acceptance:** A convincingly drivable, licensed car with stable raycast suspension, configurable transmission and traction, correctly animated wheels/lights, and documented handling-test results.

**Stop:** Request authorization before Phase 5.

### Phase 5 — Mobile touch controls and complete camera interactions

**Depends on:** Accepted Phase 4 and user authorization.

1. Implement responsive joystick or steering-button component with configurable placement.
2. Add throttle/brake pedals, handbrake, camera, pause, and relevant transmission controls.
3. Track and capture independent pointer IDs; merge device actions deterministically and release them on all cancellation paths.
4. Add safe-area and orientation handling, touch-target sizing, handedness settings, and active-surface gesture suppression.
5. Finalize chase/cockpit/orbit switching, touch orbit gestures, camera obstacle handling, and cockpit HUD readability.
6. Make settings/loading/error states keyboard accessible; avoid input conflicts while menus are open.
7. Test simultaneous steering + throttle + handbrake, cancelling one pointer without cancelling others, browser interruptions, rotation, and rapid camera changes on real iOS/Android devices.
8. Re-profile mobile rendering and select sustainable presets rather than assuming desktop settings will work.
9. Update handoff, validation evidence, commit, and push.

**Acceptance:** The car is fully controllable without a keyboard, simultaneous touch actions work, interruptions never leave pedals stuck, and the HUD/cameras remain usable across supported screen sizes.

**Stop:** Request authorization before Phase 6.

### Phase 6 — Environmental detail, seasons, weather, and final graphics

**Depends on:** Accepted Phase 5 and user authorization; asset licenses and performance headroom.

1. Replace placement markers with licensed/owned trees, rocks, and buildings; use instancing, LOD, pooling, and collider simplification.
2. Add PBR terrain/road/car refinement, environment lighting, sun positioning, and the day/night clock.
3. Add standard or cascaded shadows by capability/quality tier; limit casters and shadow distance.
4. Introduce the post-processing stack incrementally with measurable per-effect costs and accessible toggles.
5. Add season blending, vegetation/material changes, rain/snow/leaf particles, wetness, snow masks, and debug season/weather/time controls.
6. Integrate damp/muddy/snowy/icy surface states with vehicle traction and rolling resistance; verify transitions do not destabilize physics.
7. Add appropriate effect fallbacks, reduced-motion behavior, streaming/loading feedback, and optional versioned local settings/checkpoint persistence.
8. Complete browser/device regression, long-distance resource soak, effect comparison, and sustained mobile thermal testing.
9. Optimize measured bottlenecks; defer high-tier volumetrics/motion blur when they exceed budget rather than sacrificing baseline driving.
10. Produce final quality-preset tables, known limitations, license/credit records, and a reproducible release-build checklist.
11. Update handoff, validate, commit, and push. Deployment requires separate user authorization.

**Acceptance:** The required environment and season/weather systems work, their driving effects are tested, quality tiers retain usable performance, and all required effects either operate on supported tiers or have clearly documented lower-tier fallbacks.

## 10. Testing and phase acceptance

### Automated layers to add as phases begin

- **Infrastructure now:** project metadata, required documentation/directories, reserved entrypoint, and empty asset-manifest checks.
- **Unit:** seeded generation, chunk keys/edges, road connectivity, input mapping, smoothing, gearing, quality selection, and surface transitions.
- **Headless physics:** fixed-step stability, steering/braking scenarios, raycast contacts, reset/disposal, surface grip, and reproducible results within tolerances. Do not assume bitwise determinism across all browsers/platforms.
- **Integration:** stale worker jobs, chunk collider ownership, model-node binding, origin rebasing, camera lifecycle, and resource cleanup.
- **Browser:** start/pause/reset, resize, keyboard focus, simultaneous pointers, orientation, error fallbacks, and context restoration.
- **Performance/manual:** named hardware, browser/version, seed, preset, resolution, warm-up time, route duration, frame-time percentiles, and active-resource counts.

CI verifies the checks actually present. A green scaffold CI does not certify vehicle realism, visual correctness, cross-platform support, or 60 FPS. GPU performance claims require real-device measurements.

### Definition of done for every phase

1. Only the authorized phase's scope is implemented; deviations are documented.
2. Automated checks pass, with any exceptions explicitly approved and recorded.
3. The phase-specific interactive acceptance scenarios are completed and evidence recorded.
4. No secrets, unlicensed assets, generated dependencies, or build output are committed.
5. `README.md`, this plan's execution status, and `docs/SESSION_HANDOFF.md` reflect the actual result and remaining issues.
6. A coherent Git commit is created and pushed to the verified dedicated repository.
7. Remote branch/commit alignment is verified. If push is blocked, record that state and deliver a portable Git bundle instead; do not label the milestone remotely saved.
8. Stop and wait for the user's next authorization.

### Execution status

| Milestone                 | State                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| Initial planning/scaffold | Complete and saved to the canonical public repository                 |
| Initial GitHub push       | Verified on `main`; all 53 tracked files present; first CI run passed |
| Phase 1                   | Implemented, validated, and pushed; awaiting Phase 2 authorization    |
| Phase 2                   | Not started                                                           |
| Phase 3                   | Not started                                                           |
| Phase 4                   | Not started                                                           |
| Phase 5                   | Not started                                                           |
| Phase 6                   | Not started                                                           |

See `docs/SESSION_HANDOFF.md` for the verified original commit, remote CI evidence, authentication limitations, and the next-session procedure.

## 11. Assets, risks, and decisions to revisit

### Asset policy

Do not download or commit “realistic” car/building/texture assets without a verified license. Record source, creator, license, redistribution permission, modifications, scale/axes, and required credits. Real-world brands and audio have separate rights concerns. Prefer self-hosted, optimized assets; record decoder dependencies for Draco/KTX2/Basis where used. Plan Git LFS for large authorized assets only after checking repository support, quotas, and installation. See `docs/ASSET_POLICY.md`.

### Main risks and mitigations

| Risk                                                    | Mitigation / decision point                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Unsupported GitHub connector or unavailable credentials | Keep truthful push status; package a Git bundle; obtain an actual repository URL and authorized Git route before remote writes. |
| Rapier controller is less realistic than expected       | Phase 4 feasibility gate; custom tire-force layer only if required; benchmark handling rather than naming features.             |
| Renderer/physics axis or timing mismatch                | One handedness/units convention, adapters, headless tests, fixed-step contract.                                                 |
| Mobile GPU/thermal limits                               | DPR caps, dynamic quality, instancing, inexpensive default effects, sustained real-device testing.                              |
| Streaming stalls or missing collision ground            | Bounded generation/upload work, velocity-aware prefetch, retained fallback coverage/safe slowdown.                              |
| Terrain and road seams                                  | Shared global samples, shared edge road decisions, explicit LOD edge tests.                                                     |
| Large-distance precision errors                         | Chunk-relative global coordinates and synchronized floating-origin rebasing.                                                    |
| Asset payload and licensing                             | Small optimized GLBs/textures, lazy loading, verified redistribution rights, manifest/credits.                                  |
| Memory leaks across long drives                         | Ownership tracking, disposal tests, repeated unload/reload and travel soaks.                                                    |
| WebGPU/custom shader incompatibility                    | WebGL2 baseline; optional, separately tested WGSL/WebGPU variants.                                                              |
| Heavy weather/post effects obscure driving              | Quality budgets, reduced-motion settings, optional effects, readable HUD.                                                       |

### Decisions intentionally deferred

- Named reference devices and minimum browser versions; provisional baseline is recent Chromium/Firefox/Safari with WebGL2, including real iOS and Android testing.
- Vehicle asset source/budget, interior detail, final art style, and sound sources.
- Final tire-force implementation, manual/automatic UI, and whether optional boost is desired.
- Whether high-tier volumetrics and motion blur meet the measured budget.
- Deployment provider, public release licensing, Git LFS limits, and any release policy.

## 12. GitHub continuity and session handoff

Use the verified public repository [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver) as the long-term source of truth; the default branch is `main`. The owner explicitly authorized public creation and the initial push. Never push to another guessed account or silently create a different repository. The Arena GitHub connector is unsupported, but owner-approved GitHub CLI/API/Git authentication supplied a working route; temporary credentials may need renewal after a session reset.

### Start of every session

1. Verify repository root, origin URL, current branch, working-tree status, and latest commit.
2. Read `AGENTS.md`, this plan, and `docs/SESSION_HANDOFF.md`.
3. Fetch remote refs only when authenticated access is available; reconcile clean branches without overwriting local or remote work.
4. Confirm the last saved commit and the user's current phase authorization.
5. Install with `npm ci`; do not assume dependencies or dev processes survived a previous session.

### End of every session / coherent milestone

1. Run available checks; record actual results and unverified manual tests.
2. Update the handoff with completed work, changed decisions, blockers, exact next action, and phase authorization.
3. Inspect staged diffs for secrets, unexpected generated files, and unrelated work.
4. Commit source, documentation, configuration, and lockfile together.
5. Push to the verified repository and confirm the remote branch SHA matches the local committed SHA.
6. If push is unavailable, say so explicitly and export a Git bundle. Local files are a fallback, not a substitute for verified GitHub persistence.
7. Stop at the current phase gate.

See `docs/GIT_WORKFLOW.md` for safe initial-push, existing-repository, recovery, and bundle-transfer commands. Never use force push, destructive reset, or automatic history replacement to resolve a mismatch.

## 13. Requirements traceability

| Requirement from the brief                                   | Primary phase                   | Verification                                         |
| ------------------------------------------------------------ | ------------------------------- | ---------------------------------------------------- |
| Modular Vite/TypeScript architecture                         | Initial scaffold, 1             | Build/type/lint checks; ownership review             |
| Responsive viewport, Retina, FPS                             | 1                               | Resize/DPR/device tests and metrics                  |
| Basic keyboard driving and rigid-body collision              | 2                               | Fixed-step and collision scenarios                   |
| Infinite terrain, roads, and streaming                       | 3                               | Seed/edge/road tests and travel soak                 |
| Trees, rocks, buildings and final LOD                        | 3 foundations, 6 assets         | Deterministic placement and resource budgets         |
| Suspension, tire traction, steering, torque, brakes, gearing | 4                               | Handling scenarios and controller feasibility report |
| Weight transfer, drifting, skidding, environment impacts     | 4                               | Calibrated maneuver/contact tests                    |
| GLB car, wheels, steering wheel, brake lights, shadows       | 4                               | Asset/node/scale tests and visual checks             |
| Desktop bindings and camera cycle                            | 2 foundations, 5 completion     | Keyboard/focus and camera tests                      |
| Mobile joystick/pedals and multi-touch                       | 5                               | Simultaneous-pointer real-device checks              |
| Chase, cockpit, orbital cameras                              | 1/2 foundations, 4/5 completion | Camera clipping/mode interaction checks              |
| PBR, day/night, sun, sky, cascaded shadows                   | 1 baseline, 6 final             | Lighting/quality-tier comparisons                    |
| Bloom, SSAO, motion blur, vignette, ACES-style mapping       | 6                               | Per-effect GPU costs and fallback tests              |
| Spring/summer/autumn/winter and weather                      | 6                               | Transition, visual, and surface-behavior tests       |
| Cross-platform performance                                   | All phases                      | Recorded device/route/preset measurements            |
| GitHub progress retention between sessions                   | Every milestone                 | Verified remote SHA and handoff                      |

## 14. Technical references

References guide implementation; pinned package APIs must still be checked at the phase that uses them.

- [Three.js installation and module imports](https://threejs.org/docs/#manual/en/introduction/Installation)
- [Three.js OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls)
- [Rapier JavaScript initialization and compatibility package](https://rapier.rs/docs/user_guides/javascript/getting_started_js/)
- [Rapier dynamic raycast vehicle API](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Vite guide](https://vite.dev/guide/)

---

**Next permitted development action:** None until the user explicitly says to start Phase 1. Resolving repository access and transferring the initial scaffold are setup actions, not authorization to begin engine development.
