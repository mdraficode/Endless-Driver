# Endless Driver — Project Plan and Implementation Instructions

**Planning baseline:** 2026-10-13 · **Visual-fidelity revision:** 2026-10-14 · **Status updated:** 2026-10-23  
**Project stage:** Phase 4 built scope delivered; owner reports Phase 5 passed; Phase 6 hero-car work and Phase 9 city/traffic/route work remain within their specific authorizations. The requested cockpit-camera and Hinode touge off-road/hazard increment is implemented. Startup/orientation includes best-effort fullscreen (`3363930`). On 2026-10-23, the owner additionally authorized the in-game pause/home menu and the named customization options; implementation `608f0a9` and final review polish `de947b0` are pushed and preserve automatic startup; full `npm run check` passes at `de947b0` (73 test files / 546 tests, 20 verified assets, production build). The owner-reported restart/fullscreen/map/orientation fix is pushed at `84b3b09`; full `npm run check` passes there (73 test files / 548 tests, 20 verified assets, production build). Manual visual/device and FPS acceptance remain unverified. The owner-requested cockpit-framing fix is pushed at `1dfc609`; full `npm run check` passes there (73 test files / 550 tests, 20 verified assets, production build). Target-device visual retest remains pending.  
**Development authorization:** The owner opened broad Phase 6 on 2026-10-20 and reports Phase 5 passed on 2026-10-21. Phase 9 is separately authorized. The requested audit → natural detail → streetscape → integrated tier-budget sequence is implemented through `f98adfb`; public-reference PBR coverage is fully checked at `ceaa184`. On 2026-10-23, the owner broadened hero-car eligibility from CC0-only to free licences that clearly permit intended use and redistribution, with CC BY 4.0 attribution accepted. The selected MMC Works Generic Sport Coupé Car is converted through the reproducible FBX→GLB pipeline, credited in-game, and loaded with a fail-soft fallback; preserve the neutral dashboard media and stop if geometry review identifies a real-car design. The owner also selected city buses, rigid trucks, semi-trailer rigs, and farm tractors. A later narrow request authorized cockpit-camera work, the remaining Hinode touge off-road/hazard work, and startup/orientation items. The owner's 2026-10-23 request now also authorizes only the pause/home menu and named gameplay, graphics, car-model, traffic, and related controls options; it preserves auto-start and does not authorize Phase 7 weather/seasons or unrelated Phase 8 polish. `9d8395a` contains the camera/route implementation; startup fullscreen handling is in `3363930`. Full `npm run check` passes at `3363930` (71 test files / 538 tests, 20 assets / 47,814,431 bytes, production build). The Fullscreen API request is best-effort: browsers may refuse fullscreen on a fresh link load until a user gesture. No browser/manual visual acceptance, owner-device review, or FPS measurement is established.  
**Visual target:** [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) — rural Hinode remains; a fictional megacity district is an authorized addition. Forza-Horizon-class presentation remains an engineering target, with evidence and feasibility boundaries in [`docs/RESEARCH_AAA_FIDELITY.md`](docs/RESEARCH_AAA_FIDELITY.md)  
**GitHub destination:** Public [`mdraficode/Endless-Driver`](https://github.com/mdraficode/Endless-Driver), branch `main`  
**Remote synchronization:** Scaffold, documentation, Phase 1, and Phase 2 pushed and verified on `main`; CI runs on each push

The original requested technical scope is retained in [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md).

> This is the implementation specification, not a claim that the game is complete. Phases 1–4 provide the runtime, vehicle foundation, renderer/asset pipeline, terrain/roads, and initial world systems. The owner reports Phase 5 passed on 2026-10-21; the subsequent world-detail request is implemented at code level through `f98adfb` and does not reopen Phase 5 acceptance. Phase 6 and Phase 9 remain separately authorized. The requested startup/orientation/cockpit items, specific traffic/touge-route work, and the pause/home menu with named customization options are additionally authorized; unrelated Phase 8 polish and Phase 7 weather/seasons remain gated. Startup fullscreen handling (`3363930`) requests fullscreen at driving-scene start and retries on first user interaction if the browser denied the initial request; fresh-link fullscreen cannot be guaranteed without activation. Full checks pass at `3363930` (71 test files / 538 tests, 20 assets / 47,814,431 bytes, production build). FPS remains unstable by owner report, and no named-device measurements or visual acceptance are available. Keep gameplay terrain non-white and snow-free. Rendering is Three.js + Rapier with automatic WebGPU/WebGL2 selection, HDRI image-based lighting, AgX tone mapping by default, and screen-space approximations—not hardware ray tracing.

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
- A fictional, unbadged player car built in-house or from a source/license-verified free/open asset, with wheel rotation, front-wheel steering, interior steering-wheel movement, brake lights, and shadows.
- Seeded terrain, connected roads, trees, rocks, and buildings; bounded chunk streaming and LOD.
- Spring, summer, autumn, and winter; weather and surface conditions influence appearance and traction.
- PBR, sun/sky lighting, day/night, shadows, tone mapping, and a scalable post-processing stack.
- Keyboard and simultaneous touch driving; chase, cockpit, and orbital cameras.
- Reproducible builds, meaningful tests, recorded performance measurements, and Git-based session continuity.

### Scope boundaries

- “Infinite” means procedurally addressable world space with finite active memory, not infinitely allocated terrain.
- “AAA look” is an engineering target, not a marketing claim: [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) defines per-system quality bars, tier contracts, and measurable checks. It never promises parity with a AAA production's asset depth, licensed vehicles, or console-hardware effects.
- **Content is free/open-only** ([`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md), ADR 0005 as amended by ADRs 0007–0008): CC0 is preferred; a free licence that clearly permits the intended use, modification, self-hosting, and redistribution—including CC BY 4.0 with required attribution—is eligible. No purchases, fees, paid plans, subscriptions, or credits; NC/ND, marketplace-freebie, and incompatible terms remain excluded. AI-generated/free account-gated sources still require exact-item verification and owner-approved accounts. Brand/trade-dress/design rights remain separate; the selected generic hero is subject to the no-recognizable-real-car-design gate. Every asset has a pinned/hash-checked source record and reproducible pipeline.
- **The region is a fictional composite of rural Japan** (the “Hinode Prefecture” brief, `docs/VISUAL_TARGET.md` §5). The owner explicitly authorized an additional fictional Japanese megacity district on 2026-10-19; it must extend, not replace or urbanize, the existing rural districts. Neither is presented as a replica of a real location, and both remain free of manufacturer names, badges, or trade dress.
- Target 60 FPS on agreed reference hardware. Slower devices may use lower quality or a stable 30 FPS fallback. No universal 60+ FPS guarantee is possible before profiling.
- **Single-player traffic and pedestrian AI are authorized only within Phase 9.** Multiplayer, accounts, races, monetization, network determinism, and server persistence remain outside scope.
- Weather/seasons (Phase 7) and broad final polish (Phase 8) remain gated. The owner additionally authorized the specific in-game pause/home menu and named settings options; do not expand into unrelated Phase 8 work.
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
| Post-processing    | `RenderPipeline` + TSL display nodes                                | Built-in SSAO, SSR, SSGI, TAAU/TRAA, bloom, DOF, motion blur, god rays, grain, LUT grading; `EffectComposer`/pmndrs are WebGL-only and are not used.                                                   |
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
- Use instancing/thin instances for repeated vegetation, distance-based building/prop LOD, shadow-caster limits, and clear far-boundary visibility; keep fog and atmospheric veils disabled per owner direction.
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
3. **Depth without a veil.** Preserve readable distance through layered geometry, scale cues, shadows and horizon composition. Keep fog/mist/global atmospheric veils disabled per owner direction; low-sun shafts remain tier-gated.
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
- **Post-processing is one ordered `RenderPipeline`**: scene render/MRT normals+depth → SSAO or tier-gated SSGI (replacement) / SSR → optional low-sun shafts (no fog/atmospheric veil) → restrained optional bloom → DOF → motion blur → tone mapping → grading LUT → grain/chromatic aberration/vignette → TAAU/TRAA or SMAA/FXAA. Tone mapping and colour-space conversion happen exactly once at the pipeline end; gameplay-wide bloom remains off.
- **Colour pipeline:** linear-sRGB working space, PMREM environment lighting from CC0 HDRIs, AgX tone mapping by default (ACES/neutral remain selectable), LUT-based grading per time-of-day preset, and no double conversion anywhere in the chain.
- **Image quality:** temporal anti-aliasing with dynamic resolution scaling and hysteresis; minimum scale 0.6–0.7
  depending on tier; sharpening on the upscale path.

### Sky, light, and shadows

- HDRI image-based lighting (CC0 HDRIs) via PMREM, blended with an atmospheric sky shader; the sun drives
  direction, colour, and intensity from a **time-of-day clock**, and the sky responds to weather state.
- Exposure control that survives full 24 h transitions without clipping or crushed shadows.
- **Cascaded shadow maps** (`CSM.js`/`CSMShadowNode`) with per-tier cascade counts, stable near-field resolution,
  and no visible seams; **contact/screen-space shadows** ground small props and foliage.
- Optional god rays / volumetric light shafts on the high tier; fog remains disabled across tiers per owner direction.

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

| Season | Presentation                                                          | Driving influence                                  |
| ------ | --------------------------------------------------------------------- | -------------------------------------------------- |
| Spring | Green vegetation, occasional rain, damp surfaces, wildflowers         | Wet traction, puddle drag                          |
| Summer | Warm sunlight, dry foliage and roads, physically meaningful dust only | Baseline grip, dust plumes                         |
| Autumn | Warm foliage, leaf litter, falling leaves, mud                        | Reduced off-road traction, mud rolling resistance  |
| Winter | Snow accumulation masks, colder light, bounded snowfall, bare trees   | Snow/ice grip reduction, controlled sliding, churn |

- Seasonal variants are generated from one master material set (an in-house equivalent of the "winteriser"
  workflow: frost/snow masks driven by slope, height, and curvature), not authored twice.
- Weather is independent of season and includes rain, storms, dust, and snow, with the sky, clouds, light
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

- Phase 2 (delivered): damped chase camera with speed-driven FOV, plus the separate orbit inspection camera.
- Requested cockpit increment (implemented): body-relative, model-specific driver-eye anchors; chassis pitch/roll; restrained suspension/acceleration sway; damped speed FOV; bounded mouse/touch look-around. `C` cycles Close → Normal → Far → Orbit → Cockpit → Close. Mirror/wiper hooks remain out of scope.
- The owner-authorized pause/home menu includes Resume, Restart, Spawn Location, Gameplay Options, Graphics, Car Model, Traffic Intensity, Controls & Help, and Credits last; saved settings feed runtime behavior on restart, with no new startup Play gate. Unrelated Phase 8 HUD/final-quality work remains gated.
- Follow smoothing must be frame-rate independent; use physics queries to avoid camera clipping.
- HUD: speed, gear, pause/settings, loading/errors, optional FPS/debug data, and touch controls. Update numeric HUD values at a controlled frequency rather than unnecessarily rebuilding DOM every render frame.

## 8. Quality tiers and performance budgets

These are **initial budgets to validate**, not measured results. The tier definitions and per-system gates are normative in [`docs/VISUAL_TARGET.md`](docs/VISUAL_TARGET.md) §3; this table adds the geometric and memory budgets. Reference device models, browser versions, display resolution, and the measurement procedure are frozen in Phase 3, when the renderer and effect stack actually exist.

| Budget                                    | Low/mobile                         | Balanced                         | High/desktop                                         |
| ----------------------------------------- | ---------------------------------- | -------------------------------- | ---------------------------------------------------- |
| Frame target                              | 60 FPS goal; 30 fallback           | 60 FPS                           | 60+ where hardware permits                           |
| Device-pixel-ratio cap                    | 1.0 initially                      | 1.5 initially                    | 2.0 maximum, subject to resolution cap               |
| Render radius                             | 2 chunks                           | 3 chunks                         | 3–4 after profiling                                  |
| Draw calls, indicative ceiling            | 200                                | 350                              | 500                                                  |
| Visible triangles, indicative ceiling     | 250k                               | 600k                             | 1M                                                   |
| Texture GPU allocation, estimated ceiling | 128 MB                             | 192 MB                           | 256 MB                                               |
| Shadows                                   | Small map/single cascade or off    | Limited cascades                 | Profiled CSM                                         |
| Gameplay-wide bloom                       | Off                                | Off                              | Off; source-local optics only                        |
| SSAO / motion blur                        | Off / off                          | Optional / off                   | Optional / opt-in                                    |
| Weather/foliage particles                 | Strongly capped                    | Moderate                         | Higher but bounded                                   |
| Anti-aliasing                             | FXAA/SMAA                          | TAAU                             | TAAU/TRAA                                            |
| Reflections                               | Environment IBL + Aohara clearcoat | SSR half-res + probes (pending)  | SSR + probes (pending); Aohara wet-look is local PBR |
| Atmosphere                                | Fog disabled; sky only             | Fog disabled; sky + light shafts | Fog disabled; sky + light shafts/god rays            |

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

**Phases 1–4 are implemented; the owner reports Phase 5 passed; Phase 6 renderer/material work is authorized; Phase 9 is separately authorized. The requested world-detail, traffic-collision, cockpit-camera, and touge off-road/hazard code is implemented and fully checked at `9d8395a`. The owner-authorized startup/orientation/cockpit items and requested pause/home menu with named settings are narrow exceptions; unrelated Phase 8 polish and Phase 7 weather/seasons remain gated. Runtime visual/device review and named-hardware frame-budget validation remain separate.

### Phase 3 — Renderer migration, lighting, post-processing, asset and material pipeline

**Depends on:** Accepted Phase 2 and explicit user authorization. This is the highest-leverage phase in the project:
everything visual afterwards is authored on top of it.

**Deliverables**

1. `WebGPURenderer` (`three/webgpu`) with automatic WebGL2-backend fallback, a forced-backend debug switch, and a
   capability probe reported in diagnostics; the Phase 1/2 GLSL-era material code is either ported to TSL or removed.
2. Colour pipeline: linear-sRGB working space, PMREM environment IBL from CC0 HDRIs, AgX tone mapping by default
   (ACES/neutral selectable) exactly once, LUT grading per time-of-day preset, exposure driven by the sun.
3. Dynamic sky and sun: procedural sky with HDRI environment lighting, a time-of-day clock, and light colour/intensity/direction curves that hold up from pre-dawn to night (headlights and streetlight pools are part of the phase, not a later surprise). Keep fog, haze and global atmospheric veils disabled.
4. Cascaded shadow maps (`CSM.js`/`CSMShadowNode`) with per-tier cascade counts, plus screen-space contact shadows.
5. `RenderPipeline` post stack: SSAO (SSGI replaces it at high tier), SSR (tier-gated), optional thresholded bloom comparison, DOF, motion blur, grain, chromatic aberration, vignette, sharpening — each individually configurable and measurable. Gameplay-wide bloom stays off.
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

| #   | Deliverable                                | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `WebGPURenderer` + fallback + debug switch | **Done** — backend resolved after `init()` and reported in the HUD; `?backend=webgl\|auto` forces the path for comparison; all Phase 1/2 GLSL-era material code ported to TSL and source-guarded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | Colour pipeline (IBL, tone map once, LUT)  | **Partial** — linear-sRGB working space, HDRI environment IBL, tone mapping applied exactly once in the `RenderPipeline`, exposure driven by the sun every frame, a linear-light time-of-day grade stage, and a real display-referred look LUT (`lut-hinode-film-17`, project-generated, 17³) with a live trim; per-preset grading curves are pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | Dynamic sky and sun                        | **Partial** — Preetham sky with clouds and sun disc; a time-of-day clock (`?time=`) drives sun direction/colour/intensity, ambient fill, environment intensity, exposure, scattering, and grade; fog remains disabled. Headlights/streetlights are independently tracked by their world systems                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 4   | Cascaded shadow maps                       | **Done** — `CSMShadowNode` with configurable cascades/maxFar/fade following the render camera and per-tier cascade counts; screen-space contact shadows shipped (a depth march towards the sun, tiers B/A, daylight-gated), measured to darken only where surfaces meet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5   | `RenderPipeline` post stack                | **Partial** — shipped: SSAO (per-tier settings), TAAU with dynamic resolution, motion blur (per-object and camera, driven by a shared velocity attachment), depth of field with a smoothed focus plane, time-of-day grade, optional thresholded bloom, look LUT, chromatic aberration, RCAS sharpening, film grain, and custom TSL vignette; effects are individually configurable and reported in the HUD. God rays are tier-gated (no fog), contact shadows use a scene-stage depth march on B/A, and SSGI replaces SSAO in its composite on the high tier. Gameplay-wide bloom and atmospheric veils stay off. Pending: SSR — tier-declared, awaiting its first real surface (Phase 6 car, Phase 7 wet road)                                                                                                                                |
| 6   | Anti-aliasing and upscaling                | **Partial** — TAAU with time-based dynamic resolution is the strategy on tiers B/A; tier C keeps FXAA and permits bounded scene-pass scaling with a higher floor (linear upscale; no temporal reconstruction). The controller has a dead band, a 0.5 s adjustment interval and smaller steps, and the HUD reports the active reconstruction/AA path and scale. SMAA remains the fallback whenever the temporal path is off; MSAA is unused by default. The temporal-stability metric shipped with the route harness (12-frame flat-region σ, TAA on/off arms) — a static burst under deterministic software rendering measures jitter convergence, not in-motion shimmer, so validating TAA still needs moving-camera captures on real GPU hardware. No named-device frame-rate stability is claimed. Pending: a like-for-like TRAA comparison |
| 7   | Asset pipeline                             | **Partial** — pinned fetch, manifest, licence register, hash verification, and `CREDITS.md` generation are in and enforced by `npm run check`; the model side (optimize → LOD → quantize → meshopt → KTX2) starts with the first model assets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8   | Material library + look-dev scenes         | **Partial** — `?scene=studio` renders a 14-material sphere grid (3 paints, chrome, aluminium, rubber, glass, water, and 6 ground materials) under any archived HDRI, at any hour, with environment rotation, an IBL on/off comparison, a close-up view per material, and the scanned PBR set applied to the material that asks for it. Sharing the world's lighting is the point: it is a second composition root over the same engine, scene manager, and post chain. The 2 km validation route shipped (`?scene=route`): 3 stations × 4 times of day = 12 fixed bookmarks, captured by `npm run capture:route`, SSIM-diffed against the accepted baseline committed in `baseline/route/`. Pending: the car turntable (needs Phase 6)                                                                                                         |
| 9   | Tier system C/B/A                          | **Done** — the matrix is data (`config/tiers.ts`), resolved and applied at start-up (`core/QualityTier.ts`), HUD-visible with the reason for the choice, plus a `?tier=` override; per-tier effect contracts declare unimplemented entries as pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

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

**Superseding direction (2026-10-21):** The above measurements record the historical height-fog/ACES experiment, not current settings. Owner direction now disables all gameplay fog/mist/haze/global atmospheric veils, and AgX is the default tone curve; ACES remains selectable for comparison. See the current renderer status and `docs/VISUAL_TARGET.md`.

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

**Current status (2026-10-23):** the selected MMC Works Generic Sport Coupé Car (CC BY 4.0) is integrated through the pinned, attribution-preserving pipeline; keep the sanitized dashboard media and fail-soft in-house fallback, and stop if closer review identifies a real-car design. The specifically requested cockpit view is implemented with a measured left-hand hero-car seat anchor and separate right-hand fallback anchor, damped body/suspension cues, speed FOV, and touch/mouse look-around. The optional Hinode Touge off-road/hazard increment is also implemented. Code commit `9d8395a` passes `npm run check` (70 test files / 535 tests; 20 verified assets / 47,814,431 bytes; production build). No browser/manual visual acceptance, owner-device review, or FPS-stability claim is available. Phase 7 and unrelated Phase 8 work remain gated.

### Phase 5 — Environment detail: vegetation, props, atmosphere

**Depends on:** Accepted Phase 4 and user authorization.

**Deliverables**

1. GPU-instanced vegetation with LOD levels and impostor atlases; wind animation in the vertex stage; translucent
   foliage with baked shadow masks and backlighting.
2. Grass and ground-cover layers with density falloff, scatter rules (slope/height/road proximity), and biome
   selection driven by the same parameters as the terrain.
3. Props and roadside detail: rocks, barriers, signs, buildings, poles — instanced, LOD'd, with parallax-correct
   facades where the budget allows.
4. Atmosphere: retain the procedural sky and tier-gated low-sun light shafts; keep height/distance fog,
   dust/mist volumes and atmospheric veils disabled per owner direction. Use screen-space contact shadows to
   ground props and foliage.
5. Placement/debug tooling: seed preview, density scalers, and a diagnostics readout of instance counts per system.

**Implemented Phase 5 increment (2026-10-18):** terrain and vegetation now share a bounded velocity lead (1.4 s,
up to 112 m). The initial 11×11 terrain window and 7×7 foliage window are prepared before the first rendered frame;
scanned tree adoption is included in readiness, and runtime foliage generation is capped by tier at C/B/A = 1/2/3
chunks per frame. This reduces last-second work ahead of the car while limiting per-frame CPU bursts on mobile; it is
not visual acceptance of the no-pop-in criterion, which still needs a stable readable capture.

**Implemented Phase 5 increment (2026-10-18):** authored and scanned leaf materials now receive a small linear
albedo lift and a restrained, sun-coloured backlight approximation driven by the same `DaylightState` as the scene
sun. The shader preserves existing GLTF emissive values, only targets named leaf/twig/needle materials, and leaves
bark/dead branches untouched; authored geometry carries a per-vertex foliage mask. This is not a claim of true
translucency, ray tracing, or visual acceptance: owner-device foliage readability remains unverified.

**Implemented Phase 5 increment (2026-10-19):** authored and scanned leaf parts now use a subtle TSL vertex-stage
sway with a position-derived phase that remains stable across stream rebuilds, plus spatial variation through the crown. The foliage mask keeps authored trunks,
rocks, and non-leaf parts fixed. Tier C omits the wind position node; Tier B and A cap displacement at 0.035 m and
0.065 m respectively, and the diagnostics readout reports the active amplitude. No extra geometry attributes,
draw calls, assets, or dependencies were added. Automated tests cover node construction and tier gating only; they
do not establish that the wind is visible, artifact-free, or within a device frame budget.

**Implementation and verification (2026-10-20):** the gameplay world now has a deterministic, instanced ground-cover layer sharing the existing terrain sampler and prepare-ahead vegetation window. C/B/A fixed pools are capped at 16,000 / 42,000 / 100,000 clumps; its TSL material reuses sun-tinted foliage backlight and tier-gated wind, while placement respects grass weights, slopes, roads/sidewalks, the spawn pad, town footprints, tree trunks and Aohara's core. It adds no collision/grip or weather state. Rural building kits now carry framed/tinted multi-face glazing, door/eave/roof details and TSL PBR surface variation; Aohara city building materials and sidewalk aggregate use the same existing HDRI/ACES lighting pipeline with low-amplitude TSL material breakup. `npm run check` passed locally on code commit `27e65ef`: 54 test files / 482 tests, 17 verified assets (39,714,769 bytes), and production build. A Tier C `?scene=city` WebGL2/SwiftShader preview compiled and rendered without runtime errors, but the facades read dark in this isolated block; no gameplay-ground capture, manual drive, named-device measurement or owner-device visual acceptance was performed. Those visual and device-specific aspects were not verified at that milestone. The owner subsequently reported Phase 5 passed on 2026-10-21; runtime visual and named-device performance evidence remain separate follow-up evidence.

**Phase 5 FPS follow-up (2026-10-20; local full check passed):** following the owner's report that FPS remains unstable on both mobile and desktop, Tier C now has bounded scene-pass scaling through FXAA (0.72–1.0; spatial upscaling is softer and is not TAAU), while B/A retain TAAU. The controller uses an elapsed-time-scaled EWMA, smaller 0.05 scale steps and the existing dead band/0.5 s interval. Runtime vegetation generation is capped at 1/2/3 chunks per frame on C/B/A; initial preparation remains prepare-ahead. Tests cover refresh-rate smoothing, spatial/TAAU scale eligibility and per-tier generation caps. The full local `npm run check` passed at `7f33b23` (55 test files / 486 tests; 17 assets / 39,714,769 bytes; production build), and GitHub Validate #147 plus Pages Deploy #137 succeeded for that commit. No named-device frame-time measurement or FPS-stability claim is established. The owner later reported Phase 5 passed on 2026-10-21; that acceptance is separate from device-performance evidence.

**Acceptance**

- Vegetation and prop instance counts, triangle counts, and draw calls stay inside the per-tier budgets in
  `docs/VISUAL_TARGET.md` §3.
- No visible instancing artifacts (identical clusters, popping, shadow acne) at the fixed camera bookmarks.
- Foliage lighting reads correctly at dawn/dusk, not only at noon.
- For the requested mobile and desktop coverage, record frame-time median/p95 and FPS on named representative devices at stated tiers/resolutions; code-level adaptation alone is not FPS acceptance.

**Phase gate:** the owner reported Phase 5 passed on 2026-10-21. The requested world-detail follow-up is implemented through `f98adfb`; runtime review remains separate. Phase 6 remains authorized and Phases 7–8 remain gated.

### Owner follow-up — World-detail depth and enrichment (2026-10-21)

The owner reports Phase 5 passed but says world-detail depth/enrichment is still missing. Treat this as a new bounded follow-up, not a reversal of Phase 5 acceptance. Proceed in this order:

1. Audit current natural, town and Aohara detail layers against the C/B/A instance, draw-call and streaming budgets.
2. Enrich rural ground/understory with deterministic, district-aware visual variation that reuses the prepare-ahead vegetation window and adds no collision, grip, weather or particle-system work.
3. Add sparse pedestrian-safe streetscape and building-site details to the existing town/city kits, keeping road lanes, crossings, sidewalk routes and spawn sightlines clear.
4. Integrate and test determinism, clearance, per-tier caps, chunk-boundary consistency, streaming/disposal and diagnostics before any visual/device-performance claims.

Preserve CC0-first sourcing and fictional unbadged identity. No fog, mist, haze, global atmospheric veil, rain, standing water, traction changes or global bloom; Phases 7–8 remain gated.

**Progress (2026-10-21):** the code/config audit is complete at the contract level (not a device-performance or draw-call measurement). The natural-layer increment is pushed through `ec7e13a09373891a83882b503918cd42a2e7eec0`: deterministic district/surface-aware grass, fern, wildflower and static stone accents reuse the existing terrain sampler, preparation window and shared TSL material. The original total ground-cover pools remain C/B/A = 16k/42k/100k and are partitioned by style (C 11k/2k/1.5k/1.5k; B 29k/6k/4k/3k; A 70k/15k/8k/7k). Per-style counts/caps are exposed in diagnostics; no collision/grip, weather, particle, or new asset work is introduced. Deterministic style, geometry height, partition, and instanced-world integration tests were added. After push, the full local `npm run check` passed (58 files / 499 tests; 17 assets / 39,714,769 bytes; production build); remote `main` matched. The initial workflow-page fetch did not show a run for this SHA; a later refreshed page confirmed Validate #158 and Pages Deploy #148 succeeded for `ec7e13a`. No runtime visual/device/performance acceptance is claimed.

**Streetscape and integrated tier-balance outcome (2026-10-21):** deterministic Aohara sidewalk furniture and placement-clearance tests are pushed in `be4ec5f`/`15769ea`; combined diagnostics and tier-budget integration are in `f98adfba3899a42b72367dc912e94fd698c8a722`. Natural ground-cover capacities remain C/B/A 16,000 / 42,000 / 100,000. Furniture caps (benches/planters/waste bins/bicycle racks) are C 8/12/4/4, B 12/18/6/6, A 18/24/8/8, giving combined configured instance capacities 16,028 / 42,042 / 100,058. `DrivingWorld.getContentStats()` reports active combined instances, combined configured budget and eight static instance pools (four ground-cover styles plus four furniture kinds); pool count is not a measured draw-call count. Clearance checks cover roads/markings, crossings, sidewalks, buildings, spawns and furniture spacing; integration tests verify budgets, counts and disposal. Full local `npm run check` passed at `f98adfb` (58/58 test files; 500/500 tests; 17 verified assets / 39,714,769 bytes; production build). GitHub Validate #162 and Pages Deploy #152 succeeded. No browser visual review, measured draw-call/device cost, or mobile/desktop frame-time test was performed.

**Next verification:** the requested code sequence is complete. Do not claim visual acceptance, GPU-cost balance or FPS stability from the configured budgets; those require runtime review and named-device measurements. Phase 6 and Phase 9 remain separately authorized; Phases 7–8 remain gated. Preserve current spawns/grid, prepare-ahead streaming, lane readability, no fog/mist/haze, no global bloom, CC0-first maps, relaxing balance and Aohara's static-only wet-look.

### Phase 6 — The car: hero model, materials, and vehicle fidelity

Combined with [`docs/REALISM_PLAN.md`](docs/REALISM_PLAN.md) §3 Ranks 7 and 8: reflection probes for car-body and
wet-surface reflections, and deliberate imperfection — wear, dirt accumulation, brake dust, rubber laid on kerbs —
which is the difference between a clean render and a photographed one.

**Authorization and vehicle decision:** Broad Phase 6 work was opened on 2026-10-20; the owner reports Phase 5 passed on 2026-10-21. On 2026-10-23 the owner directed integration of MMC Works' [Generic Sport Coupé Car](https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882), displayed as CC BY 4.0, and explicitly permitted compatible free licences including CC BY 4.0 with attribution. The owner supplied the sanitized 79,563,959-byte source archive, SHA-256 `222b8a9322a94305a5065d9adb56836c93451f040baea45dca4e774ba8f178e6`; no purchase or new source account is involved. Four local views show no visible exterior branding or unambiguous production-car identity; `ModelLbmw` and the creator's separate BMW M3 project are cautions, not proof. Keep the neutral dashboard media and stop if closer geometry review identifies a specific real-car design; `CarVisual` remains the async loader's fail-soft fallback. The reproducible pipeline, manifest entry, attribution UI, and runtime integration are now implemented in code commit `cbf10fe`. The generated GLB is 4,922,068 bytes with three LODs (114,070 / 51,323 / 17,104 triangles); `npm run check` passed on `8709e0d` (63 test files / 513 tests, asset verifier and production build), GitHub Validate #198 / Pages Deploy #187 passed, and the deployed GLB SHA matches the manifest. Browser/manual visual review remains unverified under sandbox resource limits. The owner also selected all four traffic classes: city bus, rigid truck, semi-trailer rig, and farm tractor. Phase 7 weather/seasons and Phase 8 polish are not included.

**Reference-driven surface-material increment (2026-10-21):** the public comparison in [`docs/GRAPHICS_REFERENCE_ANALYSIS.md`](docs/GRAPHICS_REFERENCE_ANALYSIS.md) treats Slow Roads, the Three.js WebGPU materials gallery, and +360º Car Visualizer as visual targets, not disclosures of their renderer internals. The existing Three.js setup already supplies HDRI PMREM image-based lighting, AgX by default with ACES/Neutral alternatives, and TSL SSAO (SSGI substitutes at the higher tier); this increment retains that pipeline. It adds two pinned CC0 1K concrete sets and a per-world coalescing/disposal library. Scanned albedo, tangent-space normal and packed AO/roughness/metalness maps are bound selectively to asphalt/shoulders, sidewalks, planter shells, cedar bench boards, Yūhi wall-body boxes, and selected opaque Aohara low-rise facades. Painted trim, roofs, glazing, emitters, unsupported metal scans, tires and automotive paint remain on purpose-authored PBR materials. Commit `ceaa1846a61ebf66af9806c93c5556cb309425fe` passed the full local `npm run check` (59 test files / 504 tests; 19 assets / 44,913,263 bytes; production build) and GitHub Validate #170 / Pages Deploy #160. No browser visual review or named-device performance measurement is claimed.

**Deliverables**

1. **Current player visual:** `PlayerCarVisual` now loads MMC Works’ Generic Sport Coupé Car (CC BY 4.0) asynchronously from the manifest and retains the in-house, unbadged Kaminari GT `CarVisual` as a fail-soft fallback. The pinned conversion preserves PBR maps and sanitized dashboard media, creates three LODs, maintains all four physics-aligned wheel pivots and the steering-wheel pivot, and uses simple independent collision shapes. The model/credits path passes `npm run check` and the deployed GLB SHA matches its manifest; browser/manual visual review remains unverified under sandbox resource limits. Any visible logo/badge/plate or identifiable uncleared production-car design blocks public distribution.
2. **Presentation contract:** the visual has four named wheel pivots, physics-driven steering/spin/suspension, an interior steering-wheel pivot, authored brake lamps and map-free glass/interior materials. The requested model-specific cockpit eye anchor and camera are implemented; reverse lights/indicators and broader interior-visibility review remain separate follow-up work.
3. Automotive paint: base coat + flake + clearcoat node material (with per-paint variants: metallic, pearl, matte,
   satin), glass, chrome, rubber, plastics and light lenses. Use CC0-first maps only where they represent real opaque
   surfaces; transparent glass and emissives get no fabricated maps. Dirt/water/snow accumulation masks remain Phase 7.
4. Vehicle systems refined: more contact samples per wheel, dry-road torque/gearing/braking curves tuned against handling
   scenarios, and a telemetry channel that the HUD and tests read. Wet/snow traction belongs to separately gated Phase 7.
5. Requested cockpit camera is implemented with model-specific interior anchors and bounded free-look; mirror/wiper hooks that Phase 7 could drive with weather remain out of scope.
6. Brake lights, indicators, headlights, and shadows; screenshots at the fixed bookmarks for review.

**Implemented renderer/material foundation (2026-10-21):** the renderer prefers WebGPU with automatic WebGL2 fallback (`?backend=webgl` forces WebGL2), defaults to AgX, and can display the loaded Radiance HDRI as a background via `?envbg=1`. The existing look LUT was authored under ACES; the AgX/LUT interaction remains for visual review. The TSL `RenderPipeline` carries MRT normals/depth into SSAO, retains SMAA/TAAU, and exposes restrained thresholded bloom only as an explicit comparison switch to preserve the no-global-bloom gameplay decision. CC0-first opaque scanned surfaces bind sRGB albedo, tangent-space normals, and linear AO/roughness/metalness through a shared helper with large-surface macro variation; glass/emissives have no fabricated maps. At the 2026-10-21 renderer checkpoint the player body was still a placeholder; the subsequent 2026-10-22 vehicle increment replaces that placeholder with the original code-authored Kaminari GT roadster described above. World scale is converted at scene boundaries as 1 Three.js unit = 1 m. Vehicle particles use fixed-capacity TSL storage/compute on WebGPU and are disabled on WebGL2 rather than CPU-simulated. That 2026-10-21 validation result predates the new vehicle increment; its full automated verification later passed at `cdcd8f1` (61/61 test files, 509/509 tests, assets and build), while visual acceptance and device-performance evidence remain separate. Foundation push `9294a2d`, lint-fix push `547df58`, and backend-override test correction `64c07f6` are SHA-verified. The full local `npm run check` passed on `64c07f6`: formatting, lint, GLSL guard, both TypeScript checks, 58/58 test files and 498/498 tests, 17 assets / 39,714,769 bytes with hashes/licences verified, and production build. GitHub Validate #179 and Pages Deploy #169 passed for `cdcd8f1`; runtime visual acceptance and owner-device performance evidence remain unestablished.

**Vehicle and traffic implementation (2026-10-22; automated validation passed at `cdcd8f1`):** the new player body is an original two-seat open-top GT roadster with project-authored TSL paint, map-free tinted glazing, a visible cabin, per-wheel suspension/steering/spin, steering-wheel movement and local brake-lamp response. The +360º page remains a public fidelity target only; it supplies no mesh/license provenance, and its geometry is not copied. A RGS_Dev/OgA vehicle pack is CC0 but stylized and FBX-only; it is not integrated because the reproducible project pipeline is GLTF/GLB-based. Aohara traffic now includes instanced passenger cars, city buses, rigid trucks, semi-trailer rigs and farm tractors. Counts remain 6/12/18 by C/B/A; actor/collider/pedestrian budgets are unchanged. Traffic batches use one merged multi-material geometry per class, and signal queues account for vehicle length. No third-party vehicle file, new dependency, manifest entry, logo, global bloom, fog, weather or traction behavior is added. Full `npm run check` passes (61 test files / 509 tests, assets verified and production build); GitHub Validate #179 and Pages Deploy #169 passed. Visual/device review, manual driving and named-device performance remain open.

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

1. Weather system: rain, storms, snow, and dust as coordinated states driving sky, clouds, light colour,
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
landscape handling originally scheduled here shipped early: an analog steering
joystick + GAS/BRAKE pedals + handbrake (true multi-touch), camera/reset/fullscreen
buttons, and `InputManager.setTouchState`.

**Narrow owner authorization (2026-10-23):** the requested startup/orientation/cockpit
items are implemented. Startup progress follows actual preparation stages and the
simulation auto-starts when ready. The rotate-device prompt is removed; the page
uses a landscape-sized in-page fallback and attempts `screen.orientation.lock()` only
where permitted. A page cannot override the operating system's rotation lock.
Fullscreen is requested when the driving scene starts, then silently retried on the
first pointer, click, or key gesture if the browser denied the startup request. This is
best-effort: browser policy prevents guaranteeing fullscreen on a fresh link visit
without user activation; the game remains playable and the existing touch fullscreen
button remains available. The cockpit camera now has model-specific seat anchors,
damped chassis/motion cues, and bounded free-look gestures. The owner's later 2026-10-23 request supersedes only the settings exclusion for an in-game home/pause menu with Resume, Restart, Spawn Location, Gameplay Options, Graphics, Car Model, Traffic Intensity, useful controls/help, and Credits last. It retains auto-start and authorizes only these requested options; HUD finalization, broad camera polish, photo mode, and the quality pass remain out of scope.

**Depends on:** broad Phase 8 remains gated on accepted Phase 7 and user authorization; the explicitly authorized startup/orientation/cockpit items and requested in-game pause/home menu with named options are narrow exceptions only.

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

**Stop:** Stop Phase 8 when it is authorized and complete; the separate Phase 9 authorization below remains its own track.

### Phase 9 — Urban Systems: Aohara Metropolis

**Historical authorization record (2026-10-19, with follow-up 2026-10-20; status corrected 2026-10-21):** Phase 9 was authorized at that time while Phase 5 visual acceptance was pending; the owner reported Phase 5 passed on 2026-10-21. Broad Phase 6 work was separately authorized on 2026-10-20. These authorizations do **not** authorize Phase 7 weather/seasons or broad Phase 8 final polish.

**Narrow route scope (owner request, 2026-10-23):** add an optional challenging Hinode mountain/touge route connected to rural Hinode, preserving existing content and the Central Avenue default. The eight-edge paved switchback graph and `?spawn=hinode-touge` selector were already implemented. The authorized completion adds two natural-grade packed-dirt trail cuts, guardrail runs, warning signs and four collidable rockfall hazards. These do not open unrelated Phase 9 expansion or Phase 7/8 work.

**District decision:** add a fictional Japanese megacity district to the existing fictional Hinode region. Preserve every rural Hinode district and its no-white-ground requirement; do not replace or urbanize the rural world. Aohara Metropolis is a bounded, vertically dense addition, connected to the existing rural road graph by a city-access connector; a separate highway/expressway link remains future work. The dimensions and streaming footprint must be measured before expanding the world bounds.

**Deliverables, staged:**

1. **First slice — night-lighting block.** An inspectable `?scene=city` preview with a short multi-lane avenue, signalized intersection and marked crossing, high-rise massing/windows, streetlights, and restrained pavement sheen. Night-only localized Gaussian halos and subtle radial starbursts provide soft glow plus diffraction without scene-wide bloom; protect road/crosswalk readability. This block is reused at a junction in the bounded driving-world grid; `?scene=city` itself remains a look-dev preview, not a full district.
2. **Bounded street-grid expansion.** Extend the seeded graph from the original 3×3 block to a 5×5, 640 m city grid inside a measured 500 m levelled radius / 620 m terrain blend; add classed arterial/local streets, sidewalks, crossings and a dense but instanced 16-block skyline. Preserve prepare-ahead terrain/physics streaming and keep Hinode rural untouched. Further district expansion and highway access remain future work.
3. Add modular, fictional/unbadged high-rise, low-rise and special-use buildings (including stadiums, casinos, mansions, shops, townhouses and houses), along with storefront/billboard illumination, entry lanterns, banners, utilities and street furniture. Keep citywide meshes instanced and active local point lights split into explicit C/B/A street/architecture caps; light the road surface while protecting lane readability and mobile tiers.
4. Add underground routes/tunnel portals, bridges, overpasses/flyovers, and highway sections only with tested grade, clearance, support, and collision envelopes; no decorative road may be non-drivable or misaligned with its collision path.
5. Add deterministic, seeded, single-player vehicle and pedestrian agents: lane/path following, signal compliance, crossing right-of-way, safe spacing, bounded recovery, and density controls. Use the existing physics authority for collision truth; do not introduce a second physics solver or multiplayer/network layer.
6. Scale urban detail, lights, windows, traffic and pedestrians by C/B/A tier; cap active agents, draw calls, shadows, lights and streaming work. Keep touch controls and driving visibility intact on mobile.

**Rendering constraints:** TSL node materials only, both WebGPU and WebGL2 backends checked where the sandbox permits, no manufacturer/trademark branding, and no purchased/closed assets. Keep glare source-local: prior global-bloom testing washed out gameplay. The later narrow owner request permits Aohara-only static wet-look clearcoat driven by existing HDRI/local-light PBR; it is not SSR, ray tracing, puddles, rain, weather, or a traction change. Keep full weather/wet-surface behaviour in the still-gated Phase 7 scope.

**Acceptance:**

- The city is a genuinely additional district and the rural Hinode world remains present and recognizably rural.
- City road geometry, markings, intersections, signal timing, crossing paths, and collision/clearance envelopes agree; deterministic tests cover the road graph, signal phases and seeded agents.
- Night lighting includes localized road pools from the street network and capped architectural pools from buildings, venues, billboards and decorations; banners and varied building silhouettes are present, with readable driving lanes and no global washed-out haze. Daylight gates and C/B/A budgets are covered by tests.
- Streaming and object/agent budgets remain bounded; named-device performance and real-device mobile checks are recorded before claims of acceptance.
- The `?scene=city` orbit preview can judge the lighting slice only. Driveability must be checked in the main driving world; neither the preview nor automated checks establish owner-device visual acceptance, performance, or completion of Phase 9.

**Progress (2026-10-19, grid expansion and default city start):** Aohara now has a 310 m rural access connector, a 5×5 640 m classed grid (40 urban edges), 16 city blocks, 32 instanced high-rises, graph-aligned sidewalks and crossings at all 25 intersections, and 160 instanced streetlamp poles with C/B/A-capped point lights/windows. The 500 m-radius levelled core blends back to seeded terrain by 620 m; all roads, sidewalks and heightfield collision share the existing prepare-ahead sampler. Aohara Central Avenue is the default start; explicit rural starts and `?spawn=random` remain available. `npm run check` passed locally: 51 test files / 463 tests, asset verification (17 assets / 39,714,769 bytes) and production build, plus formatting, lint, GLSL and TypeScript checks. Remote `main` matches the pushed commit; GitHub Validate and Pages Deploy succeeded. The default page, night-start URL and main bundle returned HTTP 200 with expected Aohara markers. No manual drive, owner-device visual review or performance measurement was performed; automated checks do not establish any of those. Further urban districts, AI agents, expressway access, tunnels, bridges/flyovers and device evidence remain incomplete.

**Progress (2026-10-19, Aohara wet-night optics):** Aohara urban asphalt now uses a city-only physical clearcoat/roughness blend that grows glossier toward night and reuses the existing CC0 asphalt maps; reflections come from current HDRI/direct local lamp lighting, not SSR or ray tracing. The 4/6/8 tier-budgeted point lights and their Gaussian flares follow the driver's nearest streetlamp within the city and fade outside the 500–620 m district radius; all static bulb emitters remain instanced. The Gaussian source profile adds a wide low-energy tail and faint aperture ring under a 0.38 opacity cap. No rain, standing water, weather state, grip/traction changes, asset, or dependency was added. `npm run check` passed locally: 51 test files / 465 tests, 17 assets verified, and production build; formatting, lint, GLSL guard and both TypeScript checks also passed. No browser/device visual review, owner-device acceptance or performance measurement was performed; commit, remote SHA and CI/deploy status are recorded in the session handoff.

**Progress (2026-10-19, Aohara brighter night kit):** Streetlamp spacing is now 40 m, yielding 240 instanced lamp poles and 48 unbadged banners on the current 40-edge graph. Added 22 low-rise shop/casino/mansion/townhouse/house shells, an open-bowl stadium, 18 abstract billboards and entry lanterns alongside the existing 32 high-rises and lit-window instances. Tier-local unshadowed point lights are explicitly split C/B/A into 4/6/8 street and 2/2/4 architecture sources (6/8/12 total); the nearest architecture candidates refresh with the same player-focus streaming hook and fade outside Aohara. Building footprints use the existing collision response path; the default Central Avenue, pinned `?spawn=<id>`, explicit `?spawn=random` and rural Hinode are unchanged. `npm run check` passed (51 test files / 465 tests, 17 assets / 39,714,769 bytes verified, production build). Implementation commit `bef957ef6a2581c866c86a62fee1d3271d14527c` was pushed; Validate `39239870161` and Pages Deploy `39239870247` succeeded, and the remote SHA matched. Deployed city-preview and Aohara-night-start routes and the local production preview returned HTTP 200. No browser capture, manual drive, owner-device review or performance measurement has been performed; this remains an implementation milestone, not visual/device acceptance.

**Implementation and verification (2026-10-20, all-current-building detail):** the owner authorized detailing every existing building while keeping the current gates. Aohara gains tier-capped static tinted glazing/frames and instanced facade ribs, floor bands, plinths and rooftop plant without changing its 55 existing building collision footprints, active point-light/window-emission caps, default spawn, or street grid. PBR tower, venue, low-rise and tinted-glazing materials use low-amplitude TSL variation under the existing HDRI/ACES pipeline. The current rural Yūhi building kit is detailed in the parallel Phase 5 increment. No global bloom, SSR, hardware ray tracing, wet-weather state or external asset is introduced. The local full check passed at code commit `27e65ef` (54 test files / 482 tests; asset verification and production build). A low-resolution Tier C city look-dev preview reported 2,400 facade panes, 237 structural/roof detail instances, 89 draw calls and 386,941 triangles in the isolated block, with no runtime errors; its facades read dark. This is limited browser evidence, not full-game visual acceptance or a performance measurement. Manual driving, named-device and owner-device review remain open.

**Progress (2026-10-20, bounded density increment; validation pending):** deterministic open-half-block infill adds 6/9/12 low-rise shells on C/B/A and enters the existing static building collision/clearance checks. The integrated city adds 6/12/18 instanced vehicle actors on signal-aware avenue loops and 12/24/36 instanced pedestrians on sidewalks; red/late-amber stop behavior and an 8 m queue gap are code-tested, and the four dynamic batches add no moving collision bodies. Pedestrians do not cross streets; full AI, recovery and right-of-way are outside this increment. Tier budgets, movement, building counts, overlap and road clearance have tests; the full local `npm run check` passed at `701d989` (55 test files / 488 tests, 17 assets / 39,714,769 bytes, production build). Remote workflow/deployment status remains to be verified. No browser/manual-drive, owner-device visual, or device-performance evidence is established.

**Progress (2026-10-22, vehicle-class silhouettes; automated validation passed at `cdcd8f1`):** the bounded Aohara traffic pool now includes passenger cars, city buses, rigid trucks, semi-trailer rigs and farm tractors, authored as procedural Three.js geometry. Five instanced class batches share body/trim/accent material groups; the total remains C/B/A = 6/12/18 actors and the pedestrian budget is unchanged. Signal queue offsets now account for each actor's length, preventing a bus or semi cab from entering the stop line. Traffic remains visual-only with no moving colliders or new physics solver; pedestrian crossing/right-of-way and full recovery AI remain out of scope. No third-party model files are shipped. The full `npm run check` passes (61 test files / 509 tests, assets and production build); GitHub Validate #179 and Pages Deploy #169 passed. Runtime visual/device review remains open.

**Progress (2026-10-23, traffic physics integration; verified at `67b3cdc`):** `PhysicsWorld` is created before the driving scene and passed through scene-content context into Aohara. Each tier-bounded city traffic actor has a mass/dimensioned Rapier cuboid, floating-origin registration, fixed-step signal-aware route control and collision-enabled collider in the shared world; physical contacts resolve against the player and other traffic, while brief damped bounce/pitch/roll animates impacts without visible mesh damage. Player collision identification uses Rapier body handles; city diagnostics expose body and impact counts. The integration test covers composition wiring, origin slides, player-to-traffic contact, visible feedback and disposal. The full `npm run check` passed after the implementation and fix were committed/pushed first: 69 test files / 530 tests, 20 verified assets / 47,814,431 bytes, and production build. Pedestrian crossing/right-of-way, extended recovery behavior, cockpit camera and Hinode off-road sections/hazards remain incomplete. No manual drive, owner-device visual review or performance measurement is claimed.

**Stop:** Do not start work outside this authorized Phase 9 scope; after Phase 9 completion, wait for new owner authorization.

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

| Milestone                                                    | State                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial planning/scaffold                                    | Complete and saved to the canonical public repository                                                                                                                                                   |
| Initial GitHub push                                          | Verified on `main`; first CI run passed                                                                                                                                                                 |
| Phase 1                                                      | Complete (ADR 0002), pushed as `fbb48a4`, CI green                                                                                                                                                      |
| Phase 2                                                      | Complete (ADR 0003), pushed as `b85c8ba` + `307efaa`, CI green, evidence bundle archived                                                                                                                |
| Visual-fidelity research and re-plan                         | Complete 2026-10-14: `docs/RESEARCH_AAA_FIDELITY.md`, `docs/VISUAL_TARGET.md`, ADR 0004, this plan revision                                                                                             |
| Free-and-open sourcing, region, brand, audio, photo mode     | Resolved 2026-10-14: `docs/ASSET_SOURCES.md`, `CREDITS.md`, ADR 0005, region brief (§6/§9 references)                                                                                                   |
| Phase 3 — renderer, lighting, post, asset/material pipeline  | Code complete; named-hardware frame-budget validation remains open                                                                                                                                      |
| Phase 4 — terrain, roads, streaming                          | Built scope delivered 2026-10-15; bridges/tunnels deferred                                                                                                                                              |
| Phase 5 — vegetation, props, atmosphere                      | **Owner-reported passed 2026-10-21; requested code-level world-detail follow-up is implemented; runtime visual/device evidence remains separate**                                                       |
| Phase 6 — renderer/material foundation and hero car fidelity | **Authorized; PBR/compute foundation and original unbadged roadster pass full automated checks at `cdcd8f1`; GitHub Validate #179 / Pages Deploy #169 pass; runtime visual/device review remains open** |
| Phase 7 — weather, seasons, surface behaviour                | Gated — not authorized                                                                                                                                                                                  |
| Phase 8 — mobile, HUD, cameras, settings, polish             | Startup/orientation/cockpit/fullscreen items implemented; the explicitly requested in-game pause/home menu and named settings are authorized and in progress; unrelated HUD/polish remains gated        |
| Phase 9 — urban systems / Aohara Metropolis                  | Authorized; traffic physics/collisions and optional Hinode touge off-road/hazards pass automated checks at `9d8395a`; broader city work and visual/device review remain separate                        |

See `docs/SESSION_HANDOFF.md` for the verified original commit, remote CI evidence, authentication limitations, and the next-session procedure.

## 11. Assets, risks, and decisions to revisit

### Asset policy

Do not download or commit “realistic” car/building/texture assets without a verified license. Record source, creator, license, redistribution permission, modifications, scale/axes, and required credits. Real-world brands and audio have separate rights concerns. Prefer self-hosted, optimized assets; record decoder dependencies for Draco/KTX2/Basis where used. Plan Git LFS for large authorized assets only after checking repository support, quotas, and installation. See `docs/ASSET_POLICY.md`.

The AAA-fidelity target makes asset sourcing a first-class engineering concern (see `docs/RESEARCH_AAA_FIDELITY.md` §5):

- **Default: CC0 / public domain** — Poly Haven (997 HDRIs, 869 textures, 521 models as of 2026-10-14), ambientCG,
  Sonniss GDC audio bundles, Freesound CC0, Kenney, Quaternius, KayKit, CC0 Sketchfab models, Smithsonian/NASA, and
  SIL OFL fonts. The verified register, per-asset-class plan, and quality verdicts are in
  [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md).
- **CC-BY:** CC0 remains preferred. A compatible free licence, including CC BY 4.0 with required credit in `CREDITS.md` and the in-game credits view, is explicitly allowed for the selected hero car under ADR 0008; it is not limited to non-hero content. The exact licence must permit modification, self-hosting, and redistribution.

- **Excluded:** paid assets, paid plans/credits, NC/ND or marketplace “freebie” licences, ripped or converted game assets, and uncleared badges/logos. AI-generated assets and free account-gated sources require exact-item licence/provenance and redistribution checks under ADRs 0007–0008; no purchase or unapproved account. CC0 does not clear recognizable real-car design/trade-dress rights. Fab/Megascans is _not_ used where its current terms fail these requirements.
- **Cars:** the owner selected MMC Works' Generic Sport Coupé Car (CC BY 4.0) on 2026-10-23. The sanitized archive is hash-identified and integrated through the pinned conversion/runtime pipeline, manifest, and required credit paths. Preserve no visible branding, neutral dashboard media, and the no-recognizable-real-car-design gate; `CarVisual` remains a fail-soft loader fallback. Full `npm run check` passed on `8709e0d`; Validate #198 / Pages Deploy #187 passed and the live asset hash matches. Browser/manual review remains pending under sandbox resource limits. See ADR 0008 and `docs/ASSET_SOURCES.md` §3.5.
- **Every external asset passes the pipeline** (format conversion → optimize → LOD → meshopt/KTX2 → budget check) before it is committed, and is recorded in the manifest with source, creator, licence, and hashes. Sources are fetched from pinned URLs or supplied by the owner as hash-verified local inputs; the hero archive is the latter. Project-authored code geometry is not a third-party manifest asset.

- **Budgets per asset class:** the selected hero GLB is budgeted at 100k–200k triangles across measured LODs, with textures ≤2048; its build must prove the actual output. Props ≤5k; foliage via atlases/impostors. The code-authored fallback remains <20k triangles and ≤12 rendered Mesh objects.

### Main risks and mitigations

| Risk                                                    | Mitigation / decision point                                                                                                                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsupported GitHub connector or unavailable credentials | Keep truthful push status; package a Git bundle; obtain an actual repository URL and authorized Git route before remote writes.                                                                                   |
| Rapier controller is less realistic than expected       | Phase 4 feasibility gate; custom tire-force layer only if required; benchmark handling rather than naming features.                                                                                               |
| Renderer/physics axis or timing mismatch                | One handedness/units convention, adapters, headless tests, fixed-step contract.                                                                                                                                   |
| Mobile GPU/thermal limits                               | DPR caps, dynamic quality, instancing, inexpensive default effects, sustained real-device testing.                                                                                                                |
| Streaming stalls or missing collision ground            | Bounded generation/upload work, velocity-aware prefetch, retained fallback coverage/safe slowdown.                                                                                                                |
| Terrain and road seams                                  | Shared global samples, shared edge road decisions, explicit LOD edge tests.                                                                                                                                       |
| Large-distance precision errors                         | Chunk-relative global coordinates and synchronized floating-origin rebasing.                                                                                                                                      |
| Asset payload and licensing                             | Small optimized GLBs/textures, lazy loading, verified redistribution rights, manifest/credits.                                                                                                                    |
| Memory leaks across long drives                         | Ownership tracking, disposal tests, repeated unload/reload and travel soaks.                                                                                                                                      |
| WebGPU/custom shader incompatibility                    | One TSL/WebGPURenderer path with automatic WebGL2 fallback; exercise both backends where hardware permits and keep compute-only effects disabled on WebGL2.                                                       |
| Heavy weather/post effects obscure driving              | Quality budgets, reduced-motion settings, optional effects, readable HUD.                                                                                                                                         |
| TSL/WebGPU migration invalidates Phase 1–2 shaders      | The Phase 3 migration ports or deletes the remaining GLSL-era code in one commit and adds a guard that fails on new `onBeforeCompile`/`ShaderMaterial` usage.                                                     |
| WebGPU absent on a meaningful share of browsers         | One render layer with the WebGL2 backend; both backends are exercised in the same test runs; the tier matrix states what each backend loses.                                                                      |
| AAA-fidelity scope creep without a horizon              | `docs/VISUAL_TARGET.md` quality bars are the definition of done; anything not in the bars is explicitly out of scope; each phase still stops for authorization.                                                   |
| Player-car fidelity remains below the visual target     | The original roadster is in-house and unbadged; review its shape/materials on actual devices before claiming fidelity. Only replace/extend it with an asset whose free/open provenance and pipeline are verified. |
| Asset budget explosion (VRAM/streaming)                 | Per-asset budgets, KTX2 for GPU textures, meshopt geometry, a manifest-driven pipeline, and a texture-memory readout in diagnostics.                                                                              |

### Decisions intentionally deferred

- **Named reference devices** and the exact browser-version floor; provisional baseline is recent Chromium/Firefox/Safari with WebGL2, including real iOS and Android testing. The WebGPU/WebGL2 split is tracked but not a blocker (Phase 3 ships both backends).
- ~~Car asset route, brand policy, region, audio scope, and photo mode~~ — **resolved 2026-10-14** (ADR 0005,
  `docs/VISUAL_TARGET.md` §7): free-and-open sourcing only with no purchases; unbadged fictional brand; rural-Japan
  “Hinode Prefecture”; free sample libraries plus a project-owned engine synth and a CC0/CC-BY music pool; photo
  mode in scope for Phase 8. **The CC-BY-with-credit exception was established in 2026-10-14 and extended to the hero
  vehicle on 2026-10-23 by ADR 0008.** CC0 remains preferred; compatible free CC-BY is permitted when required
  attribution is included in both the repository credit file and shipped game's credits UI.
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

**Current execution status (2026-10-23):** the owner-reported `Could not start: Cannot read properties of undefined (reading 'mesh')` was traced to vegetation placement: scatter could emit `rock:2` although only two rock mesh pools exist. Code commit `099cd01` now derives placement and pool counts from one species-variant helper, adds an explicit missing-pool diagnostic and regression coverage. The full `npm run check` passed there, and Validate #237 / Pages Deploy #226 succeeded. The follow-up fullscreen request is implemented by `b4f699c` with formatting correction `3363930`: request on driving-scene start, silently retry on first user gesture after denial, retain the existing touch button and landscape fallback, and fail softly when unsupported/denied. Full `npm run check` passed at `3363930` (71 test files / 538 tests, 20 assets / 47,814,431 bytes, production build); GitHub Validate #240 and Pages Deploy #229 succeeded. The deployed HTML and JS bundle return HTTP 200; the bundle includes the standard and WebKit fullscreen API markers. Fullscreen on a fresh URL load remains best-effort because browsers require user activation. No browser/device retest or owner confirmation is available; automated tests do not establish actual browser fullscreen behavior. A webpage still cannot override the operating system's rotation lock.

**Next permitted action:** ask the owner to hard-refresh the deployed default URL and retest startup. If the game is not fullscreen on initial visit, one pointer/click/key interaction should trigger the best-effort request; browsers may still deny it, so do not promise automatic fullscreen without activation. If startup still fails, collect the exact URL, device/browser, screenshot, and console stack. Keep Central Avenue as the default and preserve all existing scope/asset constraints; continue only the specifically authorized pause/home menu and named options; do not enter Phase 7 weather/seasons or unrelated Phase 8 HUD/polish. Manual drive, fullscreen-device acceptance, and performance claims require device evidence.
