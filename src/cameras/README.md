# Camera modes

**Status:** Phase 2 implemented (damped chase camera + debug orbit camera).

## Responsibility

Inspection, chase, cockpit, and orbital modes consume interpolated poses and physics queries without
advancing simulation.

## Implemented

| File             | Responsibility                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ChaseCamera.ts` | Gameplay chase camera: an offset arm in car space, exponentially damped position and look-at targets (the visible lag behind hard turns and acceleration), speed-scaled field of view with a smoothstep ramp, a small lean into corners, and a ground floor so the camera never dips below the road. It reads interpolated poses and telemetry and writes nothing. |

The debug orbit camera lives in `core/SceneManager.ts` (Three.js `OrbitControls`); `Application`
owns which one is active. `C` toggles between them.

## Design notes

- Damping is expressed as time constants, so camera feel does not change with display refresh rate.
- The chase camera never reads physics objects directly; it consumes `VehiclePose` and
  `VehicleTelemetry`, which keeps it testable in Node with no WebGL.
- Cockpit and cinematic modes remain future work (Phase 6 feel pass).

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
