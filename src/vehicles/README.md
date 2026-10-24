# Vehicle systems

**Status (updated 2026-10-24):** Phase 2 simulation and the requested in-game model selector are implemented at code level. The default is the attributed MMC Works Generic Sport Coupé; the player may select the project-authored unbadged Kaminari GT Roadster. Both use the pose-driven visual/impact path and model-specific cockpit eye anchors. Brake-lamp brightness now follows the same physics brake pose on the imported hero and authored fallback; this code increment passed the full check at `5ee5ef0`, while manual visual/device review remains separate. `VehicleTelemetry` also reports mean effective grip and rolling resistance across contacting wheels for Phase 7 surface comparisons; the clear/rain telemetry increment passed the full check at `d12c838`.

## Responsibility

Convert normalized driving intent into forces on a single Rapier rigid body, and convert physics
poses into wheel/chassis presentation. Only one tire-force authority exists: the custom layer here,
never Rapier's `DynamicRayCastVehicleController`.

## Implemented

| File                 | Responsibility                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`           | `VehicleActions` (intent), `WheelState`/`WheelVisualState`, `VehicleTelemetry` (including contact-wheel surface averages), `VehiclePose`, `WHEEL_INDEX`                                                                                                                      |
| `TireModel.ts`       | Pure functions: Pacejka-style magic formula for lateral force (peaks near 10° of slip, keeps ~80% of peak past 45°), load sensitivity, friction-circle budgeting, low-speed-stable slip angle, torque-curve interpolation                                                    |
| `Drivetrain.ts`      | Torque curve, gear ratios, automatic up/down shifts with a torque cut, forward/reverse engagement (the brake key doubles as reverse throttle), driven-wheel-derived rpm                                                                                                      |
| `Car.ts`             | Raycast suspension (four independent rays, spring/damper forces, anti-roll bars), tire forces applied at the contact patches as impulses before each fixed step, pose snapshots after, interpolated render poses, telemetry, reset/dispose                                   |
| `CarVisual.ts`       | Original unbadged two-seat GT roadster fallback built from project-owned Three.js geometry; per-wheel suspension/steer/spin pivots, visible open cabin, TSL automotive paint, untextured physical glazing, and pose-driven local brake lamps. Reads interpolated poses only. |
| `PlayerCarVisual.ts` | Loads the selected credited MMC Works coupé or authored roadster fallback; applies validated LOD/wheel pose, model-specific cockpit anchors, brake lamps, and the player's night-gated adaptive headlights.                                                                  |

## Invariants

- The vehicle never touches the renderer, and the renderer never touches physics.
- All handling numbers live in `config/vehicle.ts`; no tuning constants inline in the model.
- The force pass runs in the pre-step hook and the pose capture in the post-step hook, so forces are
  always integrated by the step that follows them.

See [the project plan](../../PROJECT_PLAN.md), [architecture](../../docs/ARCHITECTURE.md), and
[ADR 0003](../../docs/decisions/0003-custom-raycast-vehicle.md).
