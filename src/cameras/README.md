# Camera modes

**Status:** Chase and driver-seat cockpit cameras are gameplay views; the Three.js orbit camera remains a developer inspection view.

## Responsibility

Camera systems consume interpolated vehicle poses and telemetry; they never advance physics. `Application` chooses the active render camera, synchronizes cascade shadows/focus, and keeps the debug orbit target aligned during floating-origin rebases.

## Implemented

| File               | Responsibility                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChaseCamera.ts`   | Damped third-person framing with Close / Normal / Far distance views, speed-scaled FOV, corner roll, ground clearance, 360° free-canvas orbit and drive-start recenter.                                                                                    |
| `CockpitCamera.ts` | First-person camera at a model-specific driver eye point; carries chassis pitch/roll, damps position/orientation/FOV, adds restrained steering gaze, acceleration/suspension cues and speed vibration, and supports bounded free-space look-around swipes. |
| `camera-orbit.ts`  | Pure chase-orbit math, gesture response, elevation bounds and neutral-recenter transition.                                                                                                                                                                 |
| `SceneManager.ts`  | Separate Three.js `OrbitControls` camera for scene inspection and capture; it is not a player driving view.                                                                                                                                                |

The cockpit anchor follows the active car visual: the hero coupé uses its measured left-hand steering-wheel position, while the authored fail-soft roadster has a separate right-hand open-cabin point. The active camera follows the same local physics pose as the visible car, so it remains stable across the floating-origin shift. Its motion is intentionally subordinate to the chassis; there are no mirror or wiper systems in this request.

`C` cycles Close → Normal → Far → Orbit → Cockpit → Close. Free-canvas swipes continue to orbit chase views and look around from inside the cockpit. All on-screen controls capture their own pointers, preserving simultaneous steering/pedals.

## Design notes

- Damping uses exponential time constants, so feel is refresh-rate independent.
- The cockpit camera is independent of the renderer and can be tested in Node without WebGL.
- The debug orbit is explicitly not part of the gameplay camera set; toggling into it never advances simulation.
- Camera tests prove transforms, damping and bounded look response, not visual comfort, cabin visibility on a device, or user acceptance.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
