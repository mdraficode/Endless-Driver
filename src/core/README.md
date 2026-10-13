# Core runtime

**Status:** Phase 1 implemented (engine, loop, scene foundation, diagnostics); Phase 2 wires physics, vehicle, input, and the chase camera into the composition root.

## Responsibility

Renderer ownership, canvas sizing and pixel-ratio limits, the frame loop, scene composition,
reference lighting, frame statistics, and shutdown/disposal.

## Implemented

| File                    | Responsibility                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Engine.ts`             | `WebGLRenderer` (antialias, configurable filtered shadows, ACES filmic tone mapping), resize/DPR cap, delta-time loop (`THREE.Timer`, clamped deltas), pause/resume, context-loss handling, statistics, disposal                                       |
| `SceneManager.ts`       | Scene, backdrop sky-gradient dome, ambient + shadow-casting sun that follows the vehicle, arena ground and obstacles built from `WORLD_CONFIG` with an in-shader distance-fading grid, debug camera and orbit controls, add/remove for runtime objects |
| `PerformanceMonitor.ts` | Fixed-window FPS and frame-time statistics                                                                                                                                                                                                             |
| `Application.ts`        | Composition root: engine, scene, physics world, car, input, chase camera, HUD cadence, status messages, diagnostics snapshot, and disposal. Owns the per-frame order: input → intent → fixed-step physics → interpolated pose → visuals → render       |

## Not implemented here

Terrain/streaming, environment/weather, and post-processing remain placeholders in their own
modules until their phases are authorized. Physics, vehicles, input, and cameras are implemented in
their own modules and are only _wired_ here.

See [the project plan](../../PROJECT_PLAN.md), [architecture](../../docs/ARCHITECTURE.md), and
[the renderer decision](../../docs/decisions/0002-renderer-three-js.md).
