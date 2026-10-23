# Camera modes

**Status:** Chase and driver-seat cockpit cameras are gameplay views; the Three.js orbit camera remains a developer inspection view.

## Responsibility

Camera systems consume interpolated vehicle poses and telemetry; they never advance physics. `Application` chooses the active render camera, synchronizes cascade shadows/focus, and keeps the debug orbit target aligned during floating-origin rebases.

## Implemented

| File               | Responsibility                                                                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChaseCamera.ts`   | Damped third-person framing with Close / Normal / Far distance views, speed-scaled FOV, corner roll, ground clearance, 360° free-canvas orbit and drive-start recenter.                                                                                                                         |
| `CockpitCamera.ts` | First-person camera at a model-specific driver eye point; carries chassis pitch/roll, damps only the seat-local position/orientation/FOV, follows vehicle translation immediately, adds restrained steering gaze and small suspension cues, and supports bounded free-space look-around swipes. |
| `camera-orbit.ts`  | Pure chase-orbit math, gesture response, elevation bounds and neutral-recenter transition.                                                                                                                                                                                                      |
| `SceneManager.ts`  | Separate Three.js `OrbitControls` camera for scene inspection and capture; it is not a player driving view.                                                                                                                                                                                     |

Cockpit anchors sit near the windshield, with a small neutral downward pitch aimed at the street so the hero coupé's roofline clears the top of the view. The authored roadster keeps its own forward, open-cabin anchor. The hero glass borders approach the screen edges and only the upper steering-wheel arc remains at the bottom; the fallback likewise keeps the street visible and its right-hand wheel low. Projection tests guard the roofline clearance, street point, windshield, and wheel landmarks for both models. Vehicle translation is followed immediately, while damping applies only to the seat-local head/suspension offset, so world-space movement cannot make the view trail out of the car. The camera remains stable across floating-origin shifts and keeps motion subordinate to the chassis.

`C` cycles Close → Normal → Far → Orbit → Cockpit → Close. Free-canvas swipes continue to orbit chase views and look around from inside the cockpit. All on-screen controls capture their own pointers, preserving simultaneous steering/pedals.

## Design notes

- Damping uses exponential time constants, so feel is refresh-rate independent.
- The cockpit camera is independent of the renderer and can be tested in Node without WebGL.
- The debug orbit is explicitly not part of the gameplay camera set; toggling into it never advances simulation.
- Camera tests prove transforms, damping and bounded look response, not visual comfort, cabin visibility on a device, or user acceptance.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
