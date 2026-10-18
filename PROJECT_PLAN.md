# Endless Driver — Project Plan and Implementation Instructions

**Planning baseline:** 2026-10-13 · **Visual-fidelity revision:** 2026-10-14 · **Status updated:** 2026-10-18  
**Project stage:** Phase 4 built scope delivered; Phase 5 in progress; Phase 6 authorized after Phase 5 acceptance; Phases 7–8 gated  
**Development authorization:** Phases 1–6 authorized in phase order; Phase 3 code complete with named-hardware frame-budget validation open  
**Visual target:** [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) — the owner requires Forza-Horizon-class presentation; the evidence, feasibility boundaries, and rearranged roadmap are in [`docs/RESEARCH_AAA_FIDELITY.md`](docs/RESEARCH_AAA_FIDELITY.md)  
**GitHub destination:** Public [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver), branch `main`  
**Remote synchronization:** Scaffold, documentation, Phase 1, and Phase 2 pushed and verified on `main`; CI runs on each push

The original requested technical scope is retained in [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md).

> This is the implementation specification, not a claim that the game is complete. Phases 1–4 provide the runtime, vehicle foundation, renderer/asset pipeline, terrain/roads, and initial world systems. Phase 5 remains in progress; Phase 6 is authorized but sequenced after Phase 5 acceptance. White ground, tree pop-in, dark foliage, and imperceptible screen-space/HDR lighting remain owner-reported and unverified; do not describe them as fixed without a stable readable owner-device capture. Gameplay terrain must not contain white/snow ground. Rendering is Three.js + Rapier with HDRI image-based lighting, ACES tone mapping, and screen-space approximations—not hardware ray tracing.

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
- “AAA look” is an engineering target, not a marketing claim: [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) defines per-system quality bars, tier contracts, and measurable checks. It never promises parity with a AAA production's asset depth, licensed vehicles, or console-hardware effects.
- **Content is free and open** ([`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md), ADR 0005): CC0-first — Poly Haven, ambientCG, Sonniss GDC audio, Freesound CC0, Kenney, Quaternius, CC0 Sketchfab, open fonts — with CC-BY as an attributed exception. **No purchases are ever requested or required**, nothing account-gated or redistribution-restricted is used, and every asset is fetched by a pinned, reproducible script with a licence record.
- **The region is a fictional composite of rural Japan** (the “Hinode Prefecture” brief, `docs/VISUAL_TARGET.md` §5): authored from CC0 materials and in-house props, never presented as a replica of a real location, and free of manufacturer names, badges, or trade dress.
- Target 60 FPS on agreed reference hardware. Slower devices may use lower quality or a stable 30 FPS fallback. No universal 60+ FPS guarantee is possible before profiling.
- Multiplayer, accounts, traffic AI, races, monetization, multiplayer determinism, and server persistence are not part of these eight phases.
- Do not implement the complete game in one file. Keep feature modules small, typed, independently testable, and explicitly disposable.
- Do not start any development phase until the user authorizes it. Completing one phase does not automatically authorize the next.

## 2. Selected technology and decisions

| Area               | Selection                                                           | Reason and constraint                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rendering          | Three.js (`three`) with ES-module addons                            | Selected by explicit owner instruction (ADR 0002); renderer, scene, sky, and lighting are project-owned code instead of engine defaults.                                                               |
| Language/build     | TypeScript + Vite                                                   | Strict typing, fast development, static production distribution.                                                                                                                                       |
| Physics            | Rapier 3D compatibility package                                     | WASM rigid-body physics and a dynamic raycast vehicle controller; initialization is asynchronous.                                                                                                      |
| UI                 | Semantic DOM + Tailwind CSS Vite plugin                             | Lightweight HUD and touch overlays; no React layer is necessary for this architecture.                                                                                                                 |
| Terrain noise      | simplex-noise + a seeded random source                              | Deterministic sampling; never use unseeded randomness for world generation.                                                                                                                            |
| Renderer path      | `WebGPURenderer` (`three/webgpu`) with the automatic WebGL2 backend | One rendering layer, two backends. WebGPU gives compute, storage textures and the TSL post-processing stack; the WebGL2 backend keeps the ~18% of browsers without WebGPU running the same code paths. |
| Shading language   | TSL (Three.js Shading Language) node materials                      | `ShaderMaterial`/`onBeforeCompile` do not run on the WebGPU backend, so custom shading is written once in TSL and compiled to WGSL or GLSL.                                                            |
| Post-processing    | `RenderPipeline` + TSL display nodes                                | Built-in GTAO, SSR, SSGI, TAAU/TRAA, bloom, DOF, motion blur, god rays, grain, LUT grading; `EffectComposer`/pmndrs are WebGL-only and are not used.                                                   |
| Asset pipeline     | `gltf-transform` + meshopt/Draco + KTX2/Basis                       | Textures stay GPU-compressed (4–8× less VRAM), geometry stays small, every asset carries a licence record.                                                                                             |
| Tests              | Vitest; browser automation added with relevant phases               | Pure logic and headless physics tests first; browser input and rendering checks later.                                                                                                                 |
| Package management | npm with exact direct versions and a committed lockfile             | `npm ci` reproduces installs; upgrade packages deliberately, not implicitly between sessions.                                                                                                          |

### Architectural decisions

1. **Rapier is the only physics authority.** Do not add a second solver (Havok, Cannon, ammo) or a competing movement resolver for the same vehicle. Three.js renders; Rapier resolves contacts and motion.
2. **Use a direct integration adapter.** Physics modules expose engine-independent transforms and telemetry. Rendering adapters apply interpolated transforms to Three.js objects.
3. **Start with the compatibility WASM package.** It simplifies bundling, but its embedded WASM increases JavaScript payload. Profile startup and consider a separately served WASM build later, without changing physics ownership.
4. **Use a fixed physics tick and independent rendering.** Physics must not depend on display refresh rate.
5. **Use quality presets from the beginning.** High-DPI and expensive effects cannot be enabled without pixel and GPU budgets.
6. **One rendering layer, TSL everywhere.** Renderer, post-processing, and custom shading are written once against TSL/`RenderPipeline`; the WebGL2 backend is a supported fallback that must be validated in the same test runs, not a second code path. No `ShaderMaterial`, `RawShaderMaterial`, or `onBeforeCompile` may be added.
7. **Everything expensive is tier-gated and measured.** Effects are declared in the tier matrix with an on/off state per tier and a measured cost; a system that cannot hold its tier budget is cut or downgraded, never left on "because it looks better".
8. **Every asset has a licence record before it enters the repository.** The asset pipeline (optimize → LOD → budget check → manifest) is part of the build, and the register records source, creator, licence, modifications, and required credits. See `docs/ASSET_POLICY.md`.
9. **Respect repository visibility and distribution licensing separately.** The owner explicitly authorized a public GitHub repository. Keep npm publication disabled (`private: true`) and `UNLICENSED` metadata until the owner selects a distribution license; public visibility does not itself assign an open-source license.

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

### Raycast vehicle design — Phase 6

1. Use one dynamic chassis with a simple convex/compound collision shape and configurable center of mass.
2. Add four wheel contact rays with radius, rest length, travel, spring stiffness, compression/rebound damping, axle, and steering configuration.
3. Configure front steering, rear/selected drive wheels, service brakes, and rear-wheel handbrake.
4. Convert torque through gear and final-drive ratios to driven-wheel force; implement RPM, shift thresholds, reverse, neutral, and a default automatic transmission.
5. Reduce steering at speed and apply frame-rate-independent input smoothing. Keep tuning data outside controller code.
6. Derive traction from road/terrain material and wetness, mud, ice, and snow states. Blend transitions rather than instantly switching friction at chunk seams.
7. Use suspension loading and chassis center of mass for weight transfer; test acceleration dive/squat, braking, cornering, slopes, and rollovers.
8. Animate visual wheels from contact/suspension state, steering, and rotation; avoid deriving simulation motion from the GLB hierarchy.
9. Drive steering-wheel angle, brake-light emission, skid marks, and bounded particles from telemetry.

### Tire-model feasibility gate (resolved in Phase 2)

Resolved 2026-10-14: the custom raycast force layer was chosen over Rapier's `DynamicRayCastVehicleController`, because slip-dependent lateral grip, a handbrake that scales rear traction only, and a project-owned torque curve are all required for the sim-cade drift feel. Only one force model exists per body. Phase 6 extends the model toward multiple contact sample points per wheel (Forza Motorsport uses eight) now that the authoring pipeline is in place.

Rapier's built-in controller exposes suspension and friction controls; it is not a complete Pacejka tire, engine, or transmission simulation. Phase 2 chose the custom force layer; Phase 6 refines it (more contact samples per wheel, temperature/wear as presentation-only state) rather than re-opening the choice:

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
- Rebase around a provisional 1,024 m displacement threshold at a safe physics boundary. Shift physics, meshes, cameras, previous/current interpolation snapshots, particles, and other local state together. Phase 4 adds streaming/origin tests, and any temporal-effect history introduced in Phase 3 (TAAU, SSR, motion blur) is reset or shifted at the same boundary.
- Repeated long-distance travel must plateau in active chunks, colliders, CPU buffers, and GPU resources.

## 6. Rendering, seasons, and weather specifications

**Fidelity target:** [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) is the authoritative specification for what each
system must look like and how it is verified; [`docs/RESEARCH_AAA_FIDELITY.md`](docs/RESEARCH_AAA_FIDELITY.md) records
the evidence and the feasibility boundaries. This section defines the architecture.

### The five pillars

1. **Light is the product.** HDR environment lighting, a dynamic sun/sky, correct exposure, and indirect bounce
   dominate perceived realism.
2. **Material truth.** Physically-based values, packed ORM maps, detail layers that survive close inspection, and
   automotive paint with base coat, flake, and clearcoat.
3. **Depth and atmosphere.** Aerial perspective, fog tied to the sky, light shafts at low sun, dust and mist.
4. **Density where you look.** High-frequency detail near the camera (parallax occlusion mapping, splat layers,
   vegetation), impostors and simplified LODs far away — never uniform detail.
5. **The world changes.** Time of day, weather, and season transform the same road visually _and_ physically.

### Rendering path

- **`WebGPURenderer` with the automatic WebGL2 backend.** One render layer; capability detection decides the
  backend, and both backends run the same scene graph, materials, and post chain. A forced-WebGL2 mode exists for
  testing and for browsers without WebGPU.
- **TSL for all custom shading.** Node materials replace custom GLSL. The Phase 1 procedural ground grid and sky
  are ported when the renderer migration happens; a source guard prevents new `ShaderMaterial`/`onBeforeCompile`
  usage.
- **Post-processing is one ordered `RenderPipeline`**: scene render → optional SSGI/SSR/AO (screen-space, tiered) →
  volumetric/atmospheric passes → bloom → DOF → motion blur → tone mapping → grading LUT → grain/chromatic
  aberration/vignette → anti-aliasing/upscale (TAAU/TRAA, FXAA/SMAA on the low tier). Tone mapping and colour-space
  conversion happen exactly once, at the pipeline end.
- **Colour pipeline:** linear-sRGB working space, PMREM environment lighting, ACES/AgX tone mapping, LUT-based
  grading per time-of-day preset, and no double conversion anywhere in the chain.
- **Image quality:** temporal anti-aliasing with dynamic resolution scaling and hysteresis; minimum scale 0.6–0.7
  depending on tier; sharpening on the upscale path.

### Sky, light, and shadows

- HDRI image-based lighting (CC0 HDRIs) via PMREM, blended with an atmospheric sky shader; the sun drives
  direction, colour, and intensity from a **time-of-day clock**, and the sky responds to weather state.
- Exposure control that survives full 24 h transitions without clipping or crushed shadows.
- **Cascaded shadow maps** (`CSM.js`/`CSMShadowNode`) with per-tier cascade counts, stable near-field resolution,
  and no visible seams; **contact/screen-space shadows** ground small props and foliage.
- Optional god rays / volumetric light shafts on the high tier; cheaper depth-fog approximations below that.

### Materials

A project-owned material library, validated in the studio look-dev scene before use:

- Terrain: aggregate, gravel, soil, rock, grass, sand, snow, ice — each with albedo/ORM/normal/detail layers and
  seasonal and wetness variants.
- Road: asphalt (with wet film and puddle masks), markings, kerbs, shoulders, tunnels, bridges.
- Vegetation: opaque foliage, translucent foliage (leaf backlight), grass blades, bark, impostor atlases.
- Water: surface shader with depth-based colour, reflection source per tier, and shoreline blending.
- Vehicle: paint (base + flake + clearcoat, pearl and matte variants), glass, chrome, rubber, plastics, lights,
  and dirt/water/snow masks.

### Terrain and detail rendering

- Multi-layer splat materials with height/AO blending and triplanar projection on cliffs; parallax occlusion
  mapping on the near tier; detail maps that fade with distance to control tiling.
- Chunked LOD with skirts/stitching; GPU instancing for vegetation and props with impostor fallbacks.
- Screen-space contact shadows and decals for roadside detail.

### Seasons, weather, and surface behaviour

Keep separate but coordinated state for **season, weather, time of day, and surface condition**, and make each one
visible and physical. Seasonal presentation is anchored to the regions in `docs/VISUAL_TARGET.md` §5 (coast and
harbour, sakura river road, rice terraces, maple gorge, cedar pass, highland plateau, snow-country onsen village,
small town), so the same district reads as a different place in each season:

| Season | Presentation                                                        | Driving influence                                  |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------- |
| Spring | Green vegetation, occasional rain, damp surfaces, wildflowers       | Wet traction, puddle drag                          |
| Summer | Warm sunlight, dry foliage and roads, dust and heat haze            | Baseline grip, dust plumes                         |
| Autumn | Warm foliage, leaf litter, falling leaves, mud                      | Reduced off-road traction, mud rolling resistance  |
| Winter | Snow accumulation masks, colder light, bounded snowfall, bare trees | Snow/ice grip reduction, controlled sliding, churn |

- Seasonal variants are generated from one master material set (an in-house equivalent of the "winteriser"
  workflow: frost/snow masks driven by slope, height, and curvature), not authored twice.
- Weather is independent of season and includes rain, storms, dust, fog, and snow, with the sky, clouds, light
  colour, wind, and exposure driven from one weather state.
- Traction is driven by explicit surface state (dry/wet/snow/ice/mud/gravel), never by texture colour. Phase 7
  verifies that the same corner taken at the same speed produces measurably different telemetry per season.
- Snow accumulation is a visual + grip surface layer, not a physical snow-volume simulation.
- Debug controls for season/weather/time are part of the developer HUD, not of the player UI.

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

- Phase 2 (delivered): damped chase camera with speed-driven FOV, plus the Phase 1 orbit camera retained as a debug view.
- Phase 6: collision-aware chase behaviour, cockpit camera with a normalized anchor and model-dependent interior visibility, and mirror/wiper hooks for weather.
- Phase 8: consistent chase/cockpit/orbit switching on desktop and touch, finalized HUD, and settings.
- Follow smoothing must be frame-rate independent; use physics queries to avoid camera clipping.
- HUD: speed, gear, pause/settings, loading/errors, optional FPS/debug data, and touch controls. Update numeric HUD values at a controlled frequency rather than unnecessarily rebuilding DOM every render frame.

## 8. Quality tiers and performance budgets

These are **initial budgets to validate**, not measured results. The tier definitions and per-system gates are normative in [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) §3; this table adds the geometric and memory budgets. Reference device models, browser versions, display resolution, and the measurement procedure are frozen in Phase 3, when the renderer and effect stack actually exist.

| Budget                                    | Low/mobile                      | Balanced                        | High/desktop                           |
| ----------------------------------------- | ------------------------------- | ------------------------------- | -------------------------------------- |
| Frame target                              | 60 FPS goal; 30 fallback        | 60 FPS                          | 60+ where hardware permits             |
| Device-pixel-ratio cap                    | 1.0 initially                   | 1.5 initially                   | 2.0 maximum, subject to resolution cap |
| Render radius                             | 2 chunks                        | 3 chunks                        | 3–4 after profiling                    |
| Draw calls, indicative ceiling            | 200                             | 350                             | 500                                    |
| Visible triangles, indicative ceiling     | 250k                            | 600k                            | 1M                                     |
| Texture GPU allocation, estimated ceiling | 128 MB                          | 192 MB                          | 256 MB                                 |
| Shadows                                   | Small map/single cascade or off | Limited cascades                | Profiled CSM                           |
| Bloom                                     | Off or lightweight              | Lightweight                     | On, bounded buffers                    |
| SSAO / motion blur                        | Off / off                       | Optional / off                  | Optional / opt-in                      |
| Weather/foliage particles                 | Strongly capped                 | Moderate                        | Higher but bounded                     |
| Anti-aliasing                             | FXAA/SMAA                       | TAAU                            | TAAU/TRAA                              |
| Reflections                               | Cubemap probes                  | SSR half-res + probes           | SSR + wet-road layer                   |
| Volumetrics                               | Fog only                        | Height/depth fog + light shafts | Volumetric fog/dust, god rays          |

- A 60 FPS frame is approximately 16.7 ms total. CPU and GPU overlap; do not add overlapping timings as if they were independent serial costs.
- Begin with a 2 ms per-frame streaming/upload work budget and measure its impact. The budget may need subdivision or idle scheduling.
- Record rolling FPS, frame-time percentiles, physics timing, chunk timings, draw calls, triangles, and resource counts. GPU timers are optional where supported.
- Use dynamic resolution/quality with hysteresis rather than frequent visual toggling. Never turn on every expensive effect by default because a device is labeled desktop.
- Monitor sustained performance and thermal throttling on real phones, not only desktop mobile emulation.
- Test WebGL context loss and restoration, resizing, tab suspension, asset-load errors, and renderer-initialization failure.

## 9. Step-by-step phased execution

### Why the phases changed (2026-10-14)

The owner rejected the Phase 2 look and set a Forza-Horizon-class presentation target. The research in
[`docs/RESEARCH_AAA_FIDELITY.md`](docs/RESEARCH_AAA_FIDELITY.md) showed that the original order would have built the
world with placeholder technology and rebuilt it later. The roadmap below therefore front-loads the **rendering,
asset, and material foundations**, so terrain, roads, vegetation, weather, and the car are all authored once against
the final pipeline.

| Original phase | Original content                                    | Where it went now                                                                                 |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 3              | Procedural terrain, roads, chunk streaming          | **Phase 4** (unchanged content, now built on the Phase 3 renderer and material library)           |
| 4              | Advanced vehicle + realistic model                  | **Phase 6** (split: vehicle systems refined, hero car authored)                                   |
| 5              | Mobile touch, camera interactions, HUD              | **Phase 8** (plus final settings and polish)                                                      |
| 6              | Seasons, weather, "final graphics", post-processing | **Split**: graphics foundation → **Phase 3**, seasons/weather → **Phase 7**, polish → **Phase 8** |
| —              | (new)                                               | **Phase 3** renderer + asset pipeline + material library; **Phase 5** environment detail          |

Delivered work is not re-opened: Phase 2's physics contract, input smoothing, chase camera, and ADR 0003 remain
valid and are extended, not replaced.

### Delivered

| Phase | Content                                                                                                                                                          | Evidence                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Setup | Specification, modular Vite/TypeScript/Tailwind scaffold, pinned dependencies, CI, asset policy                                                                  | `c831a44`, `a80dc03`                                           |
| 1     | Engine, loop, resize/DPR handling, orbit debug camera, reference lighting, diagnostics, disposal (ADR 0002)                                                      | `fbb48a4`, CI green                                            |
| 2     | Rapier world + custom raycast force layer, slip-friction drift, smoothed keyboard input, damped chase camera, placeholder car meshes bound to physics (ADR 0003) | `b85c8ba`, `307efaa`, CI green; evidence in `/phase2-evidence` |

**Phases 1–4 are implemented; Phase 5 is in progress; Phase 6 is authorized after Phase 5 acceptance. Phases 7–8 remain gated. Phase 3 code is complete; named-hardware frame-budget validation is still open.**

### Phase 3 — Renderer migration, lighting, post-processing, asset and material pipeline

**Depends on:** Accepted Phase 2 and explicit user authorization. This is the highest-leverage phase in the project:
everything visual afterwards is authored on top of it.

**Deliverables**

1. `WebGPURenderer` (`three/webgpu`) with automatic WebGL2-backend fallback, a forced-backend debug switch, and a
   capability probe reported in diagnostics; the Phase 1/2 GLSL-era material code is either ported to TSL or removed.
2. Colour pipeline: linear-sRGB working space, PMREM environment IBL from CC0 HDRIs, ACES/AgX tone mapping applied
   exactly once, LUT grading per time-of-day preset, exposure driven by the sun.
3. Dynamic sky and sun: atmospheric scattering sky blended with HDRI environment lighting, a time-of-day clock, and
   light colour/intensity/direction curves that hold up from pre-dawn to night (headlights and streetlight pools are
   part of the phase, not a later surprise).
4. Cascaded shadow maps (`CSM.js`/`CSMShadowNode`) with per-tier cascade counts, plus screen-space contact shadows.
5. `RenderPipeline` post stack: GTAO, SSR (tier-gated), bloom, DOF, motion blur, grain, chromatic aberration,
   vignette, sharpening — each individually toggleable and measurable.
6. Anti-aliasing/upscaling: TAAU/TRAA with dynamic resolution scaling and hysteresis, FXAA/SMAA on the low tier.
7. Asset pipeline: `gltf-transform`-based optimize/LOD/quantize/meshopt/KTX2 chain wired into the build, with an
   asset manifest, per-asset budgets, and a licence register (`docs/ASSET_POLICY.md`).
8. Material library with the studio look-dev scene (`?scene=studio`) and the 2 km validation route with fixed
   camera bookmarks, per [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) §4.
9. Tier system (C/B/A) as explicit, HUD-visible contracts with the effect matrix in the same doc.

**Acceptance**

- The studio scene renders the full material sphere grid under multiple HDRIs and times of day with no double
  tone mapping or colour-space errors.
- The 12 fixed route screenshots are captured per tier and archived as the baseline for all later phases.
- Shadows, AO, reflections, volumetrics, post effects, and AA each have a recorded on/off state per tier and are
  validated on named hardware; the sandbox may only assert correctness, never frame rate.
- No `ShaderMaterial`, `RawShaderMaterial`, or `onBeforeCompile` remains in `src/`.
- At least one real optimized asset (HDRI + one scanned PBR surface) flows through the pipeline end-to-end and its
  licence record is committed.
- CI green; docs, handoff, README, and ADR 0004 updated.

**Progress (2026-10-14, first increment — CI run #9 green):**

| #   | Deliverable                                | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `WebGPURenderer` + fallback + debug switch | **Done** — backend resolved after `init()` and reported in the HUD; `?backend=webgl\|auto` forces the path for comparison; all Phase 1/2 GLSL-era material code ported to TSL and source-guarded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2   | Colour pipeline (IBL, tone map once, LUT)  | **Partial** — linear-sRGB working space, HDRI environment IBL, tone mapping applied exactly once in the `RenderPipeline`, exposure driven by the sun every frame, a linear-light time-of-day grade stage, and a real display-referred look LUT (`lut-hinode-film-17`, project-generated, 17³) with a live trim; per-preset grading curves are pending                                                                                                                                                                                                                                                                                                                                                                                  |
| 3   | Dynamic sky and sun                        | **Partial** — Preetham sky with clouds, sun disc, and fog tint from sun elevation; a time-of-day clock (`?time=`) driving sun direction/colour/intensity, ambient fill, environment intensity, exposure, fog, scattering, and the grade, verified from pre-dawn to night; headlights and streetlights pending                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | Cascaded shadow maps                       | **Done** — `CSMShadowNode` with configurable cascades/maxFar/fade following the render camera and per-tier cascade counts; screen-space contact shadows shipped (a depth march towards the sun, tiers B/A, daylight-gated), measured to darken only where surfaces meet                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 5   | `RenderPipeline` post stack                | **Partial** — shipped: ambient occlusion (GTAO, per-tier resolution), TAAU with dynamic resolution, motion blur (per-object and camera, driven by a shared velocity attachment), depth of field with a smoothed focus plane, the time-of-day grade, bloom, the look LUT, chromatic aberration, RCAS sharpening, film grain, and a custom TSL vignette; all individually toggleable and reported in the HUD. God rays shipped (tier A, daylight-driven tint, HDR stage after motion blur), contact shadows shipped (scene-stage depth march, tiers B/A), SSGI shipped (high tier, replacing GTAO in its composite). Pending: SSR — tier-declared, awaiting its first real surface (Phase 6 car, Phase 7 wet road)                       |
| 6   | Anti-aliasing and upscaling                | **Partial** — TAAU with dynamic resolution scaling is the strategy on tiers B/A (frame-time controller with a dead band, hysteresis, and a smoothed input; HUD-visible render scale), FXAA on tier C, SMAA as the fallback whenever the temporal path is off; MSAA implemented but now unused, because temporal accumulation requires it off. The temporal-stability metric shipped with the route harness (12-frame flat-region σ, TAA on/off arms) — with the recorded caveat that a static burst under a deterministic software renderer measures jitter convergence, not in-motion shimmer, so validating TAA's benefit still needs moving-camera captures on real GPU hardware. Pending: a like-for-like TRAA comparison          |
| 7   | Asset pipeline                             | **Partial** — pinned fetch, manifest, licence register, hash verification, and `CREDITS.md` generation are in and enforced by `npm run check`; the model side (optimize → LOD → quantize → meshopt → KTX2) starts with the first model assets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 8   | Material library + look-dev scenes         | **Partial** — `?scene=studio` renders a 14-material sphere grid (3 paints, chrome, aluminium, rubber, glass, water, and 6 ground materials) under any archived HDRI, at any hour, with environment rotation, an IBL on/off comparison, a close-up view per material, and the scanned PBR set applied to the material that asks for it. Sharing the world's lighting is the point: it is a second composition root over the same engine, scene manager, and post chain. The 2 km validation route shipped (`?scene=route`): 3 stations × 4 times of day = 12 fixed bookmarks, captured by `npm run capture:route`, SSIM-diffed against the accepted baseline committed in `baseline/route/`. Pending: the car turntable (needs Phase 6) |
| 9   | Tier system C/B/A                          | **Done** — the matrix is data (`config/tiers.ts`), resolved and applied at start-up (`core/QualityTier.ts`), HUD-visible with the reason for the choice, plus a `?tier=` override; per-tier effect contracts declare unimplemented entries as pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Progress (2026-10-15, third increment — realism ranking and the temporal slice):** the levers that actually
change how real the image feels are ranked in [`docs/REALISM_PLAN.md`](docs/REALISM_PLAN.md) §3 and mapped onto the
phases in §4; the top two of that ranking — a shared velocity buffer feeding temporal anti-aliasing and motion blur
— are implemented, verified in the WebGL2 fallback, and their measured evidence is recorded in
`docs/SESSION_HANDOFF.md`. Still owed for this phase: god rays, the 2 km validation route with fixed camera
bookmarks, the SSIM baseline, and the temporal-stability metric.

**Progress (2026-10-15, fourth increment — the image-quality harness and atmosphere):** the owed items above are
landed. The 2 km validation route (`src/config/route.ts`, `src/world/RouteWorld.ts`, `?scene=route`) carries 12
fixed bookmarks; `scripts/capture-route.mjs` captures them headlessly, diffs them against the committed
`baseline/route/` set with SSIM (0.97 gate; self-consistency measured 0.9999–1.0000), and measures temporal
stability as flat-region σ over 12-frame bursts with TAA on/off arms. Height-aware aerial perspective
(`src/shaders/height-fog.ts`) replaces the distance band on tiers B/A — measured at dawn, it pushes distant
terrain further toward the sky colour than the linear band it replaced — and god rays (`GodraysNode`, tier A)
sit in the HDR chain after motion blur, measured as a real, localized, but subtle effect through the
placeholder canopy. Still owed for this phase: contact shadows, SSGI on the high tier, and an AgX-vs-ACES
comparison. At this 2026-10-15 checkpoint, Phase 3 remained in progress and Phase 4 was still gated.

**Progress (2026-10-15, fifth increment — contact shadows, SSGI, tone-curve comparison; Phase 3 review):**
the last three owed items are landed and measured (`docs/SESSION_HANDOFF.md` §19). Contact shadows ground
surfaces against the sun (studio A/B: median pixel untouched, p99 115 at contacts). SSGI adds bounced
diffuse light on the high tier in place of GTAO (studio MAD 4.4; the open route at noon barely moves —
bounce needs occluders, which arrive with Phases 4–5 geometry). The AgX-vs-ACES comparison ran through
`?tonemap=`: AgX clips slightly less (0.037% vs 0.052% of pixels at noon) but desaturates ~11% against a
look LUT authored on ACES, so **ACES stays the default** and AgX stays a switch. Two real bugs were found
and fixed on the way: the god-ray tint had no caller (the effect was inert while diagnostics reported it),
and the contact node handed motion blur an expression instead of a texture on the TAA-off path. The route
baseline was regenerated in this commit because tier B's chain gained contact shadows — deliberately, per
`baseline/route/README.md`. **Phase 3 is code-complete.** What remains before it can be called _accepted_:
frame-budget validation on named hardware, which only the owner can run (the sandbox has no GPU); the
route bookmarks were captured on tiers A and C as well as B for the record. At that checkpoint, Phase 4 was still gated; it was authorized later on 2026-10-15 and its built scope is recorded below.

**Historical gate:** Phase 4 was authorized on 2026-10-15 and its built scope is delivered below. Phase 3's named-hardware frame-budget validation remains open.

### Phase 4 — Procedural terrain, roads, and chunk streaming on the final renderer

**Depends on:** Accepted Phase 3 and user authorization.

**Deliverables**

1. Seeded, deterministic terrain generation with chunked LOD, skirts/stitching, and worker-side generation.
2. Multi-layer splat terrain material with height/AO blending, triplanar projection on cliffs, detail maps that
   fade with distance, and POM on the near tier.
3. Connected spline-based road network: road mesh generation, junctions, shoulders, kerbs, markings, bridges and
   tunnels where the generator allows, with edge/connectivity tests.
4. Chunk streaming with a bounded per-frame upload budget, velocity-aware prefetch, collider ownership, and
   floating-origin rebasing that resets temporal-effect histories.
5. Surface-state plumbing (dry/wet/snow/ice/gravel/mud) flowing from the road/terrain generator into the physics
   surface-query interface defined in Phase 2, without visual-texture-driven traction.
6. Scanned CC0 surface textures (asphalt, gravel, soil, rock, grass) through the Phase 3 pipeline, and the
   district layout from `docs/VISUAL_TARGET.md` §5 — coast and harbour, sakura river road, rice terraces, maple
   gorge with tunnels, cedar pass, highland plateau, snow-country village, and the small town — with the biome,
   road-class, and prop rules each district needs.

**Acceptance**

- Deterministic regeneration from a seed; chunk edge and road connectivity tests pass.
- Driving the validation route produces no seams, popping, or collision holes; streaming stays inside the recorded
  upload budget; origin rebasing is invisible.
- Tier C/B/A terrains hold their draw-call and triangle budgets with the terrain in view.

**Progress (2026-10-15, increment 1 — terrain foundation; phase in progress):** Authorized
2026-10-15. Landed: the single seeded height function (`src/world/terrain-height.ts`,
integer-hash value-noise fBm + Hinode-dake cone + exactly-flat spawn plateau) shared by the
visual chunks and the physics heightfields; chunked LOD streaming (`TerrainWorld`,
11×11 chunks of 128 m at 64/32/16 segments by ring, skirts, ≤2 builds/frame budget,
nearest-first) behind the unchanged `SceneContent` seam; Rapier heightfield colliders in a
3×3 window slid by `PhysicsWorld.syncTerrain`, with the heightfield axis convention pinned
by raycast tests; procedural vertex-colour splat (grass/soil/rock/snow by height/slope)
with shader grain. Determinism, seam-exactness (bit-identical shared borders), planner,
and collider-window properties are unit/integration tested (349 tests green); the car
drives the terrain in-browser at ~95 km/h with all wheels grounded. Remaining in this
phase: worker-side generation, POM, the spline road network with
junctions/bridges/tunnels, floating-origin rebasing, and the §5 district build-out.

**Progress (2026-10-15, realism pass — owner-requested before roads):** the splat is now
scanned, not tinted: four CC0 Poly Haven sets (leafy grass, dry mud, rock face, snow;
10 assets verified) blend by the per-vertex weights with world-space tiling, triplanar
rock, packed AO/roughness, normal detail, and a 90–260 m fade to the macro tint; ridged
noise and curvature occlusion sharpen the landform. Those same weights now drive the car
— `terrain-surface.ts` mixes grip/rolling resistance, `PhysicsWorld.surfaceAt` answers
the Phase 2 surface query per contact patch, and identical throttle measurably accelerates
slower on grass than on asphalt. Streaming gained hysteresis (no seam-jitter re-plans)
and velocity-aware visual prefetch (physics stays centred on the car); Tier C dropped
the HDRI backdrop (IBL only at all tiers); the chase camera wired its heading-lag
constant and clamps above real terrain height instead of y=0.

**Progress (2026-10-15, increment 2 — the spline road network):** an authored 8-node /
9-edge network (~6.0 km: spawn junction, mountain road to a volcano viewpoint, eastern
road to the town site, southern loop) is solved once into smoothed, grade-capped
(≤9 %) profiles with junction elevations pinned across every meeting edge
(`src/config/roads.ts`, `src/world/road-network.ts`). The solved profile is carved into
the shared height function itself (`createWorldTerrainSampler`), so chunk meshes,
Rapier heightfields, and the surface query all see the same flattened corridor —
centreline agreement is unit-tested to 1e-6, and a raycast physics test meets the
collider at the carved profile. Ribbon meshes (scanned CC0 asphalt + sandy-gravel
shoulders, edge lines, centre dashes, junction discs; 12 verified assets) are built
from the same profiles in `RoadWorld.ts`; the surface query answers `asphalt`
(grip 1.0) on the pavement and `gravel` (0.72) on the shoulder. Browser proof
(teleport-assisted captures, `scripts/capture-road.mjs`): the car sits and rolls on
the mountain road with 4/4 contacts, zero console errors, roads reporting 6,010 m /
53 meshes in diagnostics. Still remaining in this phase: worker-side generation,
floating-origin rebasing, the §5 district build-out, and bridges/tunnels (the current
generator carves at grade; no water crossings exist yet to bridge).

**Progress (2026-10-15, increment 3 — worker-side generation):** chunk geometry
construction now runs in a two-worker pool (`src/world/chunk-generator.ts`,
`terrain-generation.ts`, `terrain-worker.ts`). The pure builder was split into
transferable array data (`buildChunkGeometryData`) + a main-thread wrap; workers
rebuild the identical sampler from configs, so chunks are bit-identical on either
thread (pinned by test), messages carry raw buffers zero-copy, stale/LOD-mismatched
results are dropped, and any worker failure permanently degrades to the previous
synchronous path. TerrainWorld's per-frame budget now caps mesh creation/GPU
uploads. Browser proof: `terrainGeneratorMode: 1`, all 121 spawn-window chunks
worker-built, backlog 0, zero errors.

**Progress (2026-10-15, increment 4 — floating-origin rebasing):** world
coordinates are now eternal (sampler, chunk keys, bookmarks, diagnostics), while
physics and rendering live in a local space slid underneath by whole chunks
whenever the car passes 2048 m from the local origin (`src/world/origin.ts`,
`src/config/origin.ts`). The slide moves the car body (motion preserved),
heightfield/obstacle colliders, and the content root in one frame; streamer
windows keep planning in world space, so nothing rebuilds and the shift is
exact in float32 by construction (grid steps of 128 m). Integrated physics test
drives the real frame sequence across a slide (car stays grounded, world
position continuous); browser proof at the volcano (world −1500, −2100):
`worldOriginRebases: 1`, offsets (−1536, −2048), 121 chunks re-streamed around
the new origin, 4/4 contacts, zero errors. Remaining in this phase: the §5
district build-out (bridges/tunnels still deferred).

**Progress (2026-10-15, increment 5a — districts + vegetation):** the §5 district
registry exists (`src/config/districts.ts`, resolved purely by
`src/world/districts.ts`) keyed to the road geography: Kiri-cedar forest,
Sakura Avenue, Take-no-Michi bamboo lane, Yūhi Town, Shirasagi Terraces,
West Highlands. On top of it, deterministic instanced vegetation
(`src/world/vegetation.ts`): one candidate per 6.5 m cell decided by integer
hash, gated by the shared sampler (road corridor ≥7.5 m clear, spawn pad,
treeline, slope — only rock clings), species competing per cell, sakura/bamboo
as district-signature species. Species are authored low-poly vertex-coloured
forms in three tint variants behind a registry meant to take scanned CC0
models later; streaming mirrors the terrain window (7×7 chunks, budgeted
generation, one InstancedMesh per species/variant). Browser proof: 8,236
instances at the pass, 5,360 at the avenue, districts visually distinct, zero
errors. Vegetation is also destructive (owner request 2026-10-16): an analytic
trunk-vs-chassis collision field (`src/world/tree-collision.ts`) spends
per-species hit points — brushes bend trees on a spring, solid hits snap them
(falling crown debris + stump), fast hits shatter them into fragments, rocks
stay solid — with the car losing exactly the absorbed velocity. Browser proof:
forest drive at 54 km/h shattered a cedar (13 shards, stump, speed bled to
35 km/h, zero errors). The town build-out (5b) followed: deterministic
buildings on road-fronting plots inside the Yūhi Town district and utility
poles along every road edge — buildings solid, poles folding under
accumulated hits — browser-proven (car stopped at a building face; pole
counter flipped on impact, zero errors). Finally the near terrain tier got
its parallax occlusion mapping: the four terrain splat sets publish their
scanned displacement maps through the asset pipeline, and the closest LOD
ring's material raymarches the blended heightfield (12 steps plus a secant
refinement, fading out by 42 m so the far material cannot seam). Browser
proof: POM active on the 9 near-ring chunks with zero errors, and an A/B
capture against the pre-POM build differs only in the near foreground
(sky/UI pixel-identical). With that, Phase 4's built scope is delivered;
bridges/tunnels remain deferred as decided, and Phase 3 still awaits the
owner's hardware frame-budget validation.

**Owner correction (2026-10-18):** gameplay terrain has no snow layer: the reserved fourth splat channel is zero, snow is not loaded by the terrain material, and high ground uses exposed rock/soil. This is a code-level safeguard, not a claim that the owner's white-ground report is visually resolved; acceptance requires a stable, readable owner-device capture.

**Current gate:** Phase 5 was authorized on 2026-10-18 and remains in progress. Phase 6 is authorized but must follow Phase 5 acceptance.

### Phase 5 — Environment detail: vegetation, props, atmosphere

**Depends on:** Accepted Phase 4 and user authorization.

**Deliverables**

1. GPU-instanced vegetation with LOD levels and impostor atlases; wind animation in the vertex stage; translucent
   foliage with baked shadow masks and backlighting.
2. Grass and ground-cover layers with density falloff, scatter rules (slope/height/road proximity), and biome
   selection driven by the same parameters as the terrain.
3. Props and roadside detail: rocks, barriers, signs, buildings, poles — instanced, LOD'd, with parallax-correct
   facades where the budget allows.
4. Atmosphere: height/depth fog tied to the sky, light shafts at low sun, dust and mist volumes, lit particles, and
   screen-space contact shadows grounding props and foliage.
5. Placement/debug tooling: seed preview, density scalers, and a diagnostics readout of instance counts per system.

**Acceptance**

- Vegetation and prop instance counts, triangle counts, and draw calls stay inside the per-tier budgets in
  `docs/VISUAL_TARGET.md` §3.
- No visible instancing artifacts (identical clusters, popping, shadow acne) at the fixed camera bookmarks.
- Foliage lighting reads correctly at dawn/dusk, not only at noon.

**Stop:** Finish Phase 5 and receive acceptance before beginning the already-authorized Phase 6.

### Phase 6 — The car: hero model, materials, and vehicle fidelity

Combined with [`docs/REALISM_PLAN.md`](docs/REALISM_PLAN.md) §3 Ranks 7 and 8: reflection probes for car-body and
wet-surface reflections, and deliberate imperfection — wear, dirt accumulation, brake dust, rubber laid on kerbs —
which is the difference between a clean render and a photographed one.

**Depends on:** Accepted Phase 5 and user authorization; this phase needs the owner's car-asset decision (§7 of
`docs/VISUAL_TARGET.md`, and §5 of `docs/RESEARCH_AAA_FIDELITY.md`).

**Deliverables**

1. Hero car asset through a legal route (royalty-free purchase with a recorded licence, commissioned/in-house build,
   or the in-house generic coupe as the interim), optimized to 100k–200k triangles with LOD halving.
2. Model binding contract: named nodes/anchors for wheels, steering wheel, brake/reverse lights, doors where
   present, a cockpit anchor, and an `asset.json` descriptor validated by tests.
3. Automotive paint: base coat + flake + clearcoat `MeshPhysicalMaterial` (with per-paint variants: metallic,
   pearl, matte, satin), glass, chrome, rubber, plastics, light lenses, and dirt/water/snow masks.
4. Vehicle systems refined: more contact samples per wheel, torque/gearing/braking curves tuned against handling
   scenarios, wet/snow traction, and a telemetry channel that the HUD and tests read.
5. Cockpit camera with a normalized anchor, interior visibility driven by the model, and mirror/wiper hooks that
   Phase 7 can drive with weather.
6. Brake lights, indicators, headlights, and shadows; screenshots at the fixed bookmarks for review.

**Acceptance**

- The car is never shown as untextured geometry in any tier; close-up inspection of paint, glass, and rubber at the
  studio scene passes review against the reference board.
- Handling scenarios (acceleration runs, braking distance, steady-state cornering, drift entry/exit, handbrake)
  remain within the Phase 2 tolerances or better, with recorded telemetry.
- Model/scale/axis/anchor tests pass; wheel steer and roll are visually verified against physics.

**Stop:** Request authorization before Phase 7.

### Phase 7 — Weather, seasons, and surface behaviour

This phase carries the project's highest-ambition realism item: the **go/no-go outcome of the radiance-cascades GI
prototype** (see [`docs/REALISM_PLAN.md`](docs/REALISM_PLAN.md) §3 Rank 7) — noise-free multi-bounce global
illumination that almost no shipped game uses, and nothing in a browser does. It is gated on a measured prototype
on real hardware, and "no" is an acceptable outcome that leaves SSGI and probes in place. The wet-surface response
(Rank 9) belongs here too: the most photogenic state in the genre, and the one that flatters everything else.

**Depends on:** Accepted Phase 6 and user authorization.

**Deliverables**

1. Weather system: rain, storms, snow, fog, and dust as coordinated states driving sky, clouds, light colour,
   wind, exposure, particles, and spray.
2. Seasonal world variants generated from one master material set (slope/height/curvature-driven snow and frost
   masks, leaf litter, foliage variants), with the dev HUD switching season/weather/time of day.
3. Surface-condition coupling: wetness, standing water, snow depth, ice, mud, and gravel drive traction through
   the Phase 2 surface-state interface and produce measurable telemetry differences at the same corner and speed.
4. Wet-road rendering: roughness/puddle masks, SSR behaviour, and spray from tires; night driving through rain
   with correct light pooling.
5. Audio hooks for weather (wind, rain-on-body, tire spray) if the owner approved audio scope in the open
   questions; otherwise the hooks exist without final sources.

**Acceptance**

- All four seasons and the weather matrix are visually distinct at the fixed bookmarks and physically distinct in
  the telemetry comparison.
- Transition and persistence tests: weather changes do not pop, reset the car, or leak resources; returning to a
  previous state reproduces it.
- Tier budgets still hold with weather at its heaviest on each tier.

**Stop:** Request authorization before Phase 8.

### Phase 8 — Mobile, HUD, cameras, settings, final quality pass

**Pulled forward (2026-10-15, owner request):** the touch driving controls and
landscape handling originally scheduled here shipped early, because the game was
unplayable on phones without them: an analog steering joystick + GAS/BRAKE pedals +
handbrake (true multi-touch — steer and accelerate simultaneously), camera/reset/
fullscreen buttons, `screen.orientation` lock attempted on first touch with a
rotate-to-landscape prompt as the portable fallback, all feeding the Phase 2 input
seam (`InputManager.setTouchState`). What remains in Phase 8: HUD finalization,
settings, camera gestures/polish, and the final quality pass.

**Depends on:** Accepted Phase 7 and user authorization.

**Deliverables**

1. Mandatory multi-touch: analog steering, throttle/brake pedals, handbrake, camera cycle, and simultaneous-pointer
   handling verified on real devices; keyboard remains the desktop path.
2. Camera suite: chase, cockpit, orbital/bonnet modes with consistent switching on both input paths, plus
   collision-aware chase behaviour.
3. HUD and settings: speed/gear/RPM, minimap or route aid, quality tier selection and effect toggles, reduced
   motion/accessibility options, and a photo mode if approved.
4. Final quality pass across tiers: lighting, materials, post, and LOD tuning; performance and thermals measured on
   named reference devices; a described 30 FPS fallback path for weak hardware.
5. Release-readiness: startup/loading experience, error states, cross-browser validation, and a final measured
   performance report.

**Acceptance**

- All acceptance criteria from `docs/VISUAL_TARGET.md` are met at the chosen tiers, with the 12 bookmarks re-shot
  and diffed against the Phase 3 baseline.
- Multi-touch verified on real Android and iOS hardware; no stuck controls when pointers are cancelled.
- Recorded frame-time percentiles on named devices meet or miss the stated target explicitly — never silently.

**Stop:** Project complete; further work needs new authorization.

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

| Milestone                                                   | State                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Initial planning/scaffold                                   | Complete and saved to the canonical public repository                                                       |
| Initial GitHub push                                         | Verified on `main`; first CI run passed                                                                     |
| Phase 1                                                     | Complete (ADR 0002), pushed as `fbb48a4`, CI green                                                          |
| Phase 2                                                     | Complete (ADR 0003), pushed as `b85c8ba` + `307efaa`, CI green, evidence bundle archived                    |
| Visual-fidelity research and re-plan                        | Complete 2026-10-14: `docs/RESEARCH_AAA_FIDELITY.md`, `docs/VISUAL_TARGET.md`, ADR 0004, this plan revision |
| Free-and-open sourcing, region, brand, audio, photo mode    | Resolved 2026-10-14: `docs/ASSET_SOURCES.md`, `CREDITS.md`, ADR 0005, region brief (§6/§9 references)       |
| Phase 3 — renderer, lighting, post, asset/material pipeline | Code complete; named-hardware frame-budget validation remains open                                           |
| Phase 4 — terrain, roads, streaming                         | Built scope delivered 2026-10-15; bridges/tunnels deferred                                                  |
| Phase 5 — vegetation, props, atmosphere                     | **Authorized 2026-10-18; in progress**                                                                      |
| Phase 6 — hero car, materials, vehicle fidelity             | **Authorized 2026-10-18; after Phase 5 acceptance**                                                         |
| Phase 7 — weather, seasons, surface behaviour               | Gated — requires explicit owner instruction                                                               |
| Phase 8 — mobile, HUD, cameras, settings, polish            | Gated — requires explicit owner instruction                                                               |

See `docs/SESSION_HANDOFF.md` for the verified original commit, remote CI evidence, authentication limitations, and the next-session procedure.

## 11. Assets, risks, and decisions to revisit

### Asset policy

Do not download or commit “realistic” car/building/texture assets without a verified license. Record source, creator, license, redistribution permission, modifications, scale/axes, and required credits. Real-world brands and audio have separate rights concerns. Prefer self-hosted, optimized assets; record decoder dependencies for Draco/KTX2/Basis where used. Plan Git LFS for large authorized assets only after checking repository support, quotas, and installation. See `docs/ASSET_POLICY.md`.

The AAA-fidelity target makes asset sourcing a first-class engineering concern (see `docs/RESEARCH_AAA_FIDELITY.md` §5):

- **Default: CC0 / public domain** — Poly Haven (997 HDRIs, 869 textures, 521 models as of 2026-10-14), ambientCG,
  Sonniss GDC audio bundles, Freesound CC0, Kenney, Quaternius, KayKit, CC0 Sketchfab models, Smithsonian/NASA, and
  SIL OFL fonts. The verified register, per-asset-class plan, and quality verdicts are in
  [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md).
- **Exception: CC-BY with an automatic credit line** in `CREDITS.md` and the in-game credits — only where no CC0
  asset of comparable quality exists (a few Japanese landmark props, some music), never for hero content. The owner
  can close this exception by asking for zero-attribution-only sourcing.
- **Never:** paid or account-gated assets, NC/ND or marketplace “freebie” licences, AI-generated asset galleries
  (unauditable provenance), ripped or converted game assets, or manufacturer names, badges, and trade dress.
  Fab/Megascans is _not_ used: the free-for-everyone era ended 2024-12-31 and the starter collection carries its own
  non-CC0 terms, which free CC0 scans make unnecessary.
- **Cars:** in-house fictional marque (“Kaminari”), with a **CC0** Unity Fan concept car as the stand-in while the
  hero is authored (ADR 0005, `docs/ASSET_SOURCES.md` §3.5). No purchases, no brand marks, no ripped assets.
- **Every asset passes the pipeline** (optimize → LOD → quantize/meshopt → KTX2 → budget check) before it is
  committed, is fetched by a pinned reproducible script, and is recorded in the manifest with source, creator,
  licence, and hash — never downloaded by hand.
- **Budgets per asset class** (hero car 100k–200k tris; props ≤ 5k; foliage via atlases and impostors; textures
  ≤ 2048) are enforced in review and recorded in the manifest.

### Main risks and mitigations

| Risk                                                    | Mitigation / decision point                                                                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsupported GitHub connector or unavailable credentials | Keep truthful push status; package a Git bundle; obtain an actual repository URL and authorized Git route before remote writes.                                               |
| Rapier controller is less realistic than expected       | Phase 4 feasibility gate; custom tire-force layer only if required; benchmark handling rather than naming features.                                                           |
| Renderer/physics axis or timing mismatch                | One handedness/units convention, adapters, headless tests, fixed-step contract.                                                                                               |
| Mobile GPU/thermal limits                               | DPR caps, dynamic quality, instancing, inexpensive default effects, sustained real-device testing.                                                                            |
| Streaming stalls or missing collision ground            | Bounded generation/upload work, velocity-aware prefetch, retained fallback coverage/safe slowdown.                                                                            |
| Terrain and road seams                                  | Shared global samples, shared edge road decisions, explicit LOD edge tests.                                                                                                   |
| Large-distance precision errors                         | Chunk-relative global coordinates and synchronized floating-origin rebasing.                                                                                                  |
| Asset payload and licensing                             | Small optimized GLBs/textures, lazy loading, verified redistribution rights, manifest/credits.                                                                                |
| Memory leaks across long drives                         | Ownership tracking, disposal tests, repeated unload/reload and travel soaks.                                                                                                  |
| WebGPU/custom shader incompatibility                    | WebGL2 baseline; optional, separately tested WGSL/WebGPU variants.                                                                                                            |
| Heavy weather/post effects obscure driving              | Quality budgets, reduced-motion settings, optional effects, readable HUD.                                                                                                     |
| TSL/WebGPU migration invalidates Phase 1–2 shaders      | The Phase 3 migration ports or deletes the remaining GLSL-era code in one commit and adds a guard that fails on new `onBeforeCompile`/`ShaderMaterial` usage.                 |
| WebGPU absent on a meaningful share of browsers         | One render layer with the WebGL2 backend; both backends are exercised in the same test runs; the tier matrix states what each backend loses.                                  |
| AAA-fidelity scope creep without a horizon              | `docs/VISUAL_TARGET.md` quality bars are the definition of done; anything not in the bars is explicitly out of scope; each phase still stops for authorization.               |
| Hero car asset unavailable or unlicensed                | The in-house generic coupe is the contractual fallback; the model-binding contract is asset-agnostic, so a purchased or commissioned car drops in later without code changes. |
| Asset budget explosion (VRAM/streaming)                 | Per-asset budgets, KTX2 for GPU textures, meshopt geometry, a manifest-driven pipeline, and a texture-memory readout in diagnostics.                                          |

### Decisions intentionally deferred

- **Named reference devices** and the exact browser-version floor; provisional baseline is recent Chromium/Firefox/Safari with WebGL2, including real iOS and Android testing. The WebGPU/WebGL2 split is tracked but not a blocker (Phase 3 ships both backends).
- ~~Car asset route, brand policy, region, audio scope, and photo mode~~ — **resolved 2026-10-14** (ADR 0005,
  `docs/VISUAL_TARGET.md` §7): free-and-open sourcing only with no purchases; unbadged fictional brand; rural-Japan
  “Hinode Prefecture”; free sample libraries plus a project-owned engine synth and a CC0/CC-BY music pool; photo
  mode in scope for Phase 8. **The CC-BY-with-credit exception is kept** (2026-10-14): it is a credit line naming the
  artist, not a payment or restriction, and it applies only to a few Japanese landmark props and some music. CC0 is
  still preferred whenever a comparable asset exists, and the exception can be closed later by authoring those props
  in-house.
- Whether high-tier volumetrics and motion blur meet the measured budget — decided by measurement in Phase 3.
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

| Requirement from the brief                                      | Primary phase                         | Verification                                     |
| --------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| Modular Vite/TypeScript architecture                            | Initial scaffold, 1                   | Build/type/lint checks; ownership review         |
| Responsive viewport, Retina, FPS                                | 1                                     | Resize/DPR/device tests and metrics              |
| Basic keyboard driving and rigid-body collision                 | 2                                     | Fixed-step and collision scenarios               |
| WebGPU + WebGL2 renderer path, TSL shading                      | 3                                     | Backend matrix runs; guard against custom GLSL   |
| PBR, HDRI IBL, dynamic sun/sky, day/night, cascaded shadows     | 3 (framework), 7 (weather-driven)     | Studio-scene validation, 12-bookmark screenshots |
| Post-processing stack (AO, SSR, bloom, DOF, motion blur, grade) | 3, tuned per tier every phase         | Per-effect cost table; tier on/off matrix        |
| Temporal AA, dynamic resolution scaling                         | 3                                     | Measured scale/quality on named hardware         |
| Optimized asset pipeline, KTX2/meshopt, licence register        | 3 (pipeline), every later phase       | Manifest checks; per-asset budget review         |
| Infinite terrain, roads, and streaming                          | 4                                     | Seed/edge/road tests and travel soak             |
| Surface conditions driving traction                             | 4 (plumbing), 7 (weather coupling)    | Telemetry comparisons at matched corner/speed    |
| Trees, rocks, buildings, final LOD, vegetation density          | 5                                     | Deterministic placement and resource budgets     |
| Suspension, tire traction, steering, torque, brakes, gearing    | 2 (v1), 6 (refined)                   | Handling scenarios and telemetry tolerances      |
| Weight transfer, drifting, skidding, environment impacts        | 2 (v1), 6 (refined)                   | Calibrated maneuver/contact tests                |
| GLB hero car, wheels, steering wheel, brake lights, shadows     | 6                                     | Asset/node/scale tests and visual review         |
| Chase, cockpit, orbital cameras                                 | 2 (chase), 6 (cockpit), 8 (all modes) | Camera clipping/mode interaction checks          |
| Desktop bindings and camera cycle                               | 2 foundations, 8 completion           | Keyboard/focus and camera tests                  |
| Mobile joystick/pedals and multi-touch                          | 8                                     | Simultaneous-pointer real-device checks          |
| Spring/summer/autumn/winter and weather                         | 7                                     | Transition, visual, and surface-behaviour tests  |
| Cross-platform performance and 30 FPS fallback                  | All phases                            | Recorded device/route/preset measurements        |
| GitHub progress retention between sessions                      | Every milestone                       | Verified remote SHA and handoff                  |

---

## 14. Technical references

References guide implementation; pinned package APIs must still be checked at the phase that uses them.

- [Three.js installation and module imports](https://threejs.org/docs/#manual/en/introduction/Installation)
- [Three.js OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls)
- [Rapier JavaScript initialization and compatibility package](https://rapier.rs/docs/user_guides/javascript/getting_started_js/)
- [Rapier dynamic raycast vehicle API](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Vite guide](https://vite.dev/guide/)

---

**Next permitted development action:** Continue the authorized Phase 5 remainder; begin Phase 6 only after Phase 5 acceptance. Phases 7–8 remain gated.
