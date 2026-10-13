# Architecture — Endless Driver

**State:** Design contract; runtime systems have not been implemented.  
**Related:** [Project plan](../PROJECT_PLAN.md), [engine/physics decision](decisions/0001-engine-and-physics.md).

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
        │                                      Babylon visual adapters
        │                                               │
        ├── cameras / HUD ◄──── telemetry / poses ───────┘
        │
        └── streaming scheduler ──► CPU workers ──► world buffers
                                           main-thread mesh/collider installation
```

Dependencies should be directed and explicit. `app` composes feature systems; individual features do not import a global application singleton. `shared` contains lightweight contracts, not mutable application state.

## 2. Module responsibility matrix

| Module        | Owns                                                          | Must not own                                        |
| ------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `app`         | Startup, composition, pause/reset/shutdown, system ordering   | Feature-specific physics/rendering algorithms       |
| `engine`      | Babylon engine/scene, render schedule, resize, diagnostics    | A second rigid-body solver                          |
| `physics`     | Rapier world, bodies/colliders, queries, snapshots            | DOM, Babylon scene, direct UI state                 |
| `vehicles`    | Vehicle config, drivetrain, wheel/controller state, telemetry | Chunk lifetime or input event listeners             |
| `world`       | Seed/version, terrain/road data, chunks, LOD, origin          | Hidden unbounded world allocations                  |
| `input`       | Browser event listeners, pointer identities, action state     | Vehicle transforms or physics stepping              |
| `cameras`     | View modes, damping, visual collision avoidance               | Simulation advancement                              |
| `ui`          | HUD/menu/control DOM, accessibility, user commands            | Vehicle-force calculations                          |
| `environment` | Time/season/weather/surface parameters                        | Arbitrary direct edits to car velocity              |
| `assets`      | Loading, normalization, shared resource ownership             | Rights assumptions or undocumented CDN dependencies |
| `shaders`     | Explicit visual effect code/variants                          | Physics surface-state authority                     |
| `workers`     | Pure generation jobs and typed request/result buffers         | GPU resources or the main Rapier world              |

Rendering-specific vehicle/world bindings may use Babylon, but pure generation and simulation components must remain separately testable. Use explicit interfaces for transform application and collider creation rather than spreading engine imports into every module.

## 3. Coordinate and unit contract

- Length: meters; mass: kilograms; time: seconds; angle: radians.
- World up: +Y; right: +X; normalized vehicle forward: -Z.
- Babylon scene: right-handed; Rapier position/quaternion conversions explicitly tested.
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

The actual sequence must be integration-tested against the pinned Rapier API in Phases 2 and 4. Fixed timestep alone is not a promise of bitwise cross-platform determinism. Pausing clears controls and resets time accumulation; restoring a tab cannot advance minutes of queued simulation.

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

Add these contracts as the relevant phase begins, not as speculative code now.

## 6. Physics and rendering boundary

Rapier bodies are authoritative. Babylon meshes are visual representations. Do not teleport a dynamic body by moving its mesh or apply Babylon collisions and Rapier collision resolution to the same motion.

The initial driving controller is a temporary Phase 2 implementation. Phase 4 replaces it through a shared vehicle-controller contract. The tire-model decision selects either the built-in wheel-force path or a custom path; never apply duplicate contact forces.

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

WebGL2 is the baseline; support failure must be an understandable UI state. Pixel ratio is capped per quality tier and constrained by an absolute resolution budget. Optional WebGPU support does not justify disabling the baseline.

PBR, color-space conversions, sky/IBL, tone mapping, and post-processing order must be configured as one coherent pipeline. Custom GLSL and optional WGSL variants are maintained separately where necessary. Low-tier presets may turn off CSM, SSAO, motion blur, and expensive atmosphere while retaining the core driving game.

## 10. Status and deferred work

All modules are currently documentation placeholders. There are no runtime interface implementations, engine adapters, worker protocols, physics worlds, or shader implementations yet. The first permitted implementation is Phase 1 only after explicit user authorization.
