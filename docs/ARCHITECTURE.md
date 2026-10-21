# Architecture — Endless Driver

**State (updated 2026-10-21):** Architecture reference; implementation has progressed beyond the original Phase 1–2 baseline below. Phase 5 acceptance remains open; broad Phase 6 rendering/material work was authorized on 2026-10-20 despite that gate; Phase 9 urban systems is separately authorized; Phases 7–8 remain gated. Current delivery and evidence are tracked in [`README.md`](../README.md), [`PROJECT_PLAN.md`](../PROJECT_PLAN.md), and [`SESSION_HANDOFF.md`](SESSION_HANDOFF.md).  
**Related:** [Project plan](../PROJECT_PLAN.md) §9 (phases) and §6 (rendering architecture), [visual target](VISUAL_TARGET.md), [AAA fidelity research](RESEARCH_AAA_FIDELITY.md), [engine/physics decision](decisions/0001-engine-and-physics.md), [renderer decision](decisions/0002-renderer-three-js.md), [vehicle physics decision](decisions/0003-vehicle-physics-and-camera.md), [visual fidelity and rendering pipeline decision](decisions/0004-visual-fidelity-and-rendering-pipeline.md), [urban-systems decision](decisions/0006-urban-systems-and-city-night-lighting.md).

## 1. Composition and data flow

```text
Keyboard / Touch
        │ normalized actions
        ▼
Application composition root
        │
        ├── fixed tick ──► Vehicle controller ──► Rapier physics world
        │                       ▲                       │
        │                       │ surface state         │ authoritative snapshots
        │                Environment systems            ▼
        ├── render ───────────────────────────► Transform interpolation
        │                                               │
        │                                      Three.js visual adapters
        │                                               │
        ├── cameras / HUD ◄──── telemetry / poses ───────┘
        │
        └── streaming scheduler ──► CPU workers ──► world buffers
                                           main-thread mesh/collider installation
```

Dependencies should be directed and explicit. `core` composes feature systems; individual features do not import a global application singleton. `shared` contains lightweight contracts, not mutable application state.

## 2. Module responsibility matrix

| Module        | Owns                                                                                                | Must not own                                                     |
| ------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `core`        | Startup/composition/pause/shutdown, renderer and loop, Phase 1 scene, frame statistics, diagnostics | Feature-specific physics/rendering algorithms or a second solver |
| `physics`     | Rapier world, bodies/colliders, queries, snapshots                                                  | DOM, Three.js scene, direct UI state                             |
| `vehicles`    | Vehicle config, drivetrain, wheel/controller state, telemetry                                       | Chunk lifetime or input event listeners                          |
| `world`       | Seed/version, terrain/road data, chunks, LOD, origin                                                | Hidden unbounded world allocations                               |
| `input`       | Browser event listeners, pointer identities, action state                                           | Vehicle transforms or physics stepping                           |
| `cameras`     | View modes, damping, visual collision avoidance                                                     | Simulation advancement                                           |
| `ui`          | HUD/menu/control DOM, accessibility, user commands                                                  | Vehicle-force calculations                                       |
| `environment` | Time/season/weather/surface parameters                                                              | Arbitrary direct edits to car velocity                           |
| `assets`      | Loading, normalization, shared resource ownership                                                   | Rights assumptions or undocumented CDN dependencies              |
| `shaders`     | Explicit visual effect code/variants                                                                | Physics surface-state authority                                  |
| `workers`     | Pure generation jobs and typed request/result buffers                                               | GPU resources or the main Rapier world                           |

Rendering-specific vehicle/world bindings may use Three.js, but pure generation and simulation components must remain separately testable. Use explicit interfaces for transform application and collider creation rather than spreading engine imports into every module.

## 3. Coordinate and unit contract

- Length: meters; mass: kilograms; time: seconds; angle: radians.
- World up: +Y; right: +X; normalized vehicle forward: -Z.
- Three.js scene: right-handed by default; Rapier position/quaternion conversions explicitly tested.
- Imported GLB/GLTF models: normalized once at the asset adapter; scale/axis correction must not leak into physics constants.
- HUD speed: km/h from internal m/s; physics retains SI units.
- Global world identity: seed, generator version, integer chunk coordinates, local offset.
- Local physics/render position: nearby coordinate relative to the floating origin.
- Road and heightfield index orientation: validated with asymmetrical test fixtures so x/z transposition cannot go unnoticed.

## 4. Time and fixed-tick contract

Initial fixed physics interval: `1 / 60` second. Rendering uses a bounded accumulator and independently variable display rate.

Planned per-frame sequence:

1. Measure elapsed time and process pause/visibility state.
2. Clamp pathological deltas; add elapsed time to the accumulator.
3. Run up to five ticks: sample stable actions, apply vehicle controller/drivetrain work, update the raycast controller when used, step Rapier, capture transforms and telemetry.
4. If the catch-up budget is exhausted, discard excess backlog and increment a diagnostic counter; do not spiral indefinitely.
5. Interpolate previous/current poses using remaining accumulator fraction.
6. Update visual adapters, camera, and bounded environment animation.
7. Schedule generation and perform budgeted resource installation.
8. Update HUD at its own capped cadence and render once.

The actual sequence was integration-tested against the pinned Rapier 0.21 API in Phase 2 and will be re-verified when terrain colliders arrive in Phase 4. Fixed timestep alone is not a promise of bitwise cross-platform determinism. Pausing clears controls and resets time accumulation; restoring a tab cannot advance minutes of queued simulation.

## 5. Planned interface contracts

These are design requirements, not scaffold source implementations.

- **InputActions:** normalized axes/buttons plus discrete edge-triggered commands.
- **PoseSnapshot:** translation, quaternion, velocities, and tick identifier in engine-independent data.
- **VehicleDefinition:** mass/COM, chassis dimensions, wheel geometry, suspension, torque curve, ratios, steering and brake tuning.
- **VehicleTelemetry:** speed, RPM, gear, contact state, suspension travel, wheel rotation/steering, and slip/grip signals when available.
- **ChunkId / ChunkData:** key, generator version, typed geometry/height buffers, deterministic road and placement data.
- **GenerationRequest / Result:** world/version identifiers, job identifier, cancellation stamp, transferable payloads, and error result.
- **SurfaceState:** material class and wet/mud/snow/ice factors with a documented traction mapping.
- **QualityProfile:** pixel cap, draw/LOD/shadow/effect/particle limits and adaptation thresholds.
- **Disposable:** an explicit idempotent disposal operation or equivalent ownership protocol.

The inventory above began as a design checklist; it is not a statement that every listed contract is still unimplemented. The current scene-content seam is `src/world/WorldContent.ts`: `SceneManager` owns the environment and invokes optional content `setDaylight`/`update`/streaming hooks. Phase 9's `?scene=city` composition root remains an orbit-only look-dev view. The main driving world starts on Aohara Central Avenue in a 5×5 grid; roads, sidewalks, crossings, terrain and physics consume the shared graph/sampler, while terrain and vegetation use prepare-ahead streamers. The current Aohara kit has 240 instanced graph-aligned streetlamp poles (40 m spacing), 48 unbadged street banners, 32 high-rises, 22 low-rise shop/casino/mansion/townhouse/house shells, one open-bowl stadium and 18 abstract billboard panels. C/B/A point-light caps are 6/8/12 total, partitioned into 4/6/8 street lights and 2/2/4 locally selected architectural lights; the emissive window, banner and sign meshes are instanced, and shadows remain off for these local lights. The city asphalt's wet-look clearcoat and local optics remain visual-only—no weather, standing water, traction physics, SSR, ray tracing or whole-frame bloom. Automated checks cover budgets, placement counts, collision and streaming selection; manual driving and owner-device visual/performance review remain outstanding.

## 6. Physics and rendering boundary

Rapier bodies are authoritative. Three.js objects are visual representations. Do not teleport a dynamic body by moving its object, and never apply renderer-side collision handling and Rapier collision resolution to the same motion.

The driving controller is the Phase 2 implementation (custom raycast force layer over Rapier, per ADR 0003); Phase 6 refines it (more contact samples per wheel) rather than replacing it. Never apply duplicate contact forces: one force model per body.

Use simplified chassis and nearby prop collision shapes. Keep detailed GLB triangle meshes for rendering, not as dynamic vehicle colliders. Road and terrain visuals/colliders derive from the same generation data.

## 7. Chunk lifecycle and floating origin

Planned state machine:

```text
absent -> queued -> generating -> ready-data -> installing -> active
                    │                 │                       │
                    └── stale/cancelled┴───────────────► discarded
                                                            │
active -> evicting -> absent ◄───────────────────────────────┘
```

- Bound queue length, active worker jobs, CPU buffers, mesh/collider installations, and render/physics radii.
- Prioritize near and forward chunks; retain collision coverage or safely stop the car on a streaming miss.
- Separate render radius from physics radius and use unload hysteresis.
- Generation results carry identity/version tags; stale jobs must never install into a reset world.
- Rebase all local spatial state at a physics boundary, including previous/current poses and camera references.
- Temporal graphics buffers are reset or corrected when rebasing/cutting the camera.
- Chunk resource counts must plateau on a repeatable long-distance route.

## 8. Resource ownership

| Resource                         | Owner / lifetime                                                 |
| -------------------------------- | ---------------------------------------------------------------- |
| Engine and scene                 | Application/engine host; full shutdown                           |
| Physics world                    | Physics service; full reset/shutdown                             |
| Vehicle controller/chassis       | Vehicle instance; detach/free before destroying supporting world |
| Chunk mesh/collider/buffer       | Chunk record; eviction or world reset                            |
| Shared materials/textures/models | Asset cache; reference-aware release                             |
| Input listeners/pointer capture  | Input service; pause/cancel/dispose                              |
| Workers and pending jobs         | Generation service; cancel/reset/terminate                       |
| Post-process render targets      | Rendering pipeline; quality changes/resize/disposal              |
| Particles/skid marks             | Bounded pools; reset/eviction/disposal                           |

Avoid disposing shared materials when unloading a single chunk. Instrument resource counts and test multiple startup/reset/shutdown cycles.

## 9. Rendering compatibility

**Current implementation (updated 2026-10-21):** `WebGPURenderer` from `three/webgpu` prefers WebGPU with automatic WebGL2 fallback; `?backend=webgl` forces the fallback for comparison. AgX tone mapping is the default and is applied once in the TSL `RenderPipeline`, with standard linear-working-space/sRGB-output colour management. The scene uses a Preetham sky and manifest-loaded Radiance HDRI for image-based lighting; `?envbg=1` displays the HDRI as a look-dev background. Cascaded shadows use `CSMShadowNode` and tier budgets; custom shading is TSL only. MRT normals/depth feed SSAO and the chain retains SMAA/TAAU, while gameplay-wide bloom and fog remain off. Three.js r186's non-deprecated `HDRLoader` reads the same Radiance format as `RGBELoader`.

**Phase 6 renderer/material foundation (authorized 2026-10-20):** opaque scanned maps bind sRGB albedo, tangent-space normals and linear AO/roughness/metalness through `src/world/scanned-pbr.ts`, with large-surface TSL macro variation. Glass/emissive surfaces get no fabricated maps. The placeholder vehicle uses node-based physical materials; the hero model remains outstanding. Particle emitters submit CPU spawn requests, while fixed-capacity WebGPU compute integrates, sizes and fades them; WebGL2 disables these effects rather than falling back to CPU simulation. The world-scale boundary is 1 Three.js unit = 1 metre. Code implementation is not visual acceptance, owner-device evidence or a named-hardware performance claim.

Support failure must remain an understandable UI state for both backends. Pixel ratio is capped per quality tier and constrained by an absolute resolution budget. Every effect is declared on/off per tier in [`docs/VISUAL_TARGET.md`](VISUAL_TARGET.md) §3 and must pass the look-dev workflow in that document's §4 before it counts as delivered.

## 10. Status and deferred work

**Implemented (Phase 1):** `core/Engine.ts`, `core/SceneManager.ts`, `core/PerformanceMonitor.ts`, `shared/math.ts`, and the page shell (`index.html`, `src/style.css`, `src/main.ts`).

**Implemented (Phase 2):** `physics/RapierModule.ts`, `physics/PhysicsWorld.ts`, `vehicles/Car.ts`, `vehicles/TireModel.ts`, `vehicles/Drivetrain.ts`, `vehicles/CarVisual.ts`, `input/InputManager.ts`, `cameras/ChaseCamera.ts`, `config/{world,physics,vehicle,input,camera}.ts`, `shared/vector.ts`, the rewritten composition root `core/Application.ts`, `core/SceneManager.ts` (world-driven ground/obstacles), and the extended `ui/DiagnosticsOverlay.ts`.

**Implemented (Phase 3, in progress):** `core/Engine.ts` (WebGPU renderer + WebGL2 fallback + `RenderPipeline` output chain), `core/SceneManager.ts` (Preetham sky, HDRI environment, cascaded shadows, TSL ground), `assets/AssetManifest.ts` (manifest-driven asset loading), `shaders/{atmosphere-sky,ground-grid}.ts` (TSL node factories), `scripts/{fetch,verify}-assets.mjs` + `scripts/guard-no-glsl.mjs`, and the extended `ui/DiagnosticsOverlay.ts` (backend/sky/shadow reporting).

**Still placeholders:** `world/` (Phase 4), `environment/` (Phase 7), `workers/`, and the gameplay parts of `ui/`.

**Rearranged phase mapping (ADR 0004):** `shaders/` and `assets/` (pipeline, manifest, licence register) arrive in **Phase 3** together with the renderer migration, lighting, post stack, and the look-dev scenes; `world/` and `workers/` in **Phase 4** (terrain, roads, streaming); vegetation, props, and atmosphere in **Phase 5**; the hero car, cockpit camera, and refined vehicle systems in **Phase 6**; `environment/` (day/night, seasons, weather, surface state) in **Phase 7**; touch input, the full camera suite, HUD, settings, and the final quality pass in **Phase 8**.

Each phase requires its own explicit authorization; completing Phase 2 does not authorize Phase 3. The re-plan's region, brand, and sourcing decisions are resolved (ADR 0005); Phase 3 (renderer, lighting, post, asset/material pipeline) is the next gated phase.
