# Core runtime

**Status:** Phase 1 implemented (engine, loop, scene foundation, diagnostics).

## Responsibility

Renderer ownership, canvas sizing and pixel-ratio limits, the frame loop, scene composition,
reference lighting, frame statistics, and shutdown/disposal.

## Implemented

| File                    | Responsibility                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Engine.ts`             | `WebGLRenderer` (antialias, configurable filtered shadows, ACES filmic tone mapping), resize/DPR cap, delta-time loop (`THREE.Timer`, clamped deltas), pause/resume, context-loss handling, statistics, disposal |
| `SceneManager.ts`       | Scene, backdrop sky-gradient dome, ambient + shadow-casting sun, temporary ground plane with an in-shader distance-fading reference grid, three shadow props, debug camera and orbit controls                    |
| `PerformanceMonitor.ts` | Fixed-window FPS and frame-time statistics                                                                                                                                                                       |
| `Application.ts`        | Composition root: wiring, HUD cadence, status messages, diagnostics snapshot, disposal                                                                                                                           |

## Not implemented here

Physics, terrain/streaming, vehicles, input, gameplay cameras, environment/weather, and
post-processing remain placeholders in their own modules until their phases are authorized.

See [the project plan](../../PROJECT_PLAN.md), [architecture](../../docs/ARCHITECTURE.md), and
[the renderer decision](../../docs/decisions/0002-renderer-three-js.md).
