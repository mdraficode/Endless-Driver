# Vehicle physics, tire model, input smoothing, and chase camera

**Status:** Accepted  
**Date:** 2026-10-14  
**Phase:** 2 (advanced vehicle physics, keyboard smoothing, dynamic chase camera)

## Context

Phase 2 required a driveable "sim-cade" car: raycast suspension, an adjustable chassis, a drivetrain
with a torque curve, a slip-friction model that lets the car drift under power or handbrake, smooth
digital keyboard input, and a damped chase camera. Three choices had real architectural weight:

1. **Which wheel-force implementation to use.** Rapier ships `DynamicRayCastVehicleController`, but
   the phase requires slip-dependent lateral grip that breaks away smoothly, a handbrake that scales
   only rear-wheel lateral traction, and a drivetrain whose torque curve is authored in project code.
2. **Where the simulation boundary sits** between fixed-step physics and the render loop.
3. **How discrete keyboard state becomes continuous driving input**, given that a key press is a
   step function and the acceptance criteria demand "no snapping".

## Decision

### 1. A custom raycast-suspension force layer on Rapier rigid bodies

`src/vehicles/Car.ts` owns four suspension rays per car and applies forces to a single Rapier
`RigidBody`. Rapier remains the **sole physics authority**: it integrates the chassis, resolves
collisions with the ground and arena, and reports contacts. Rapier's built-in vehicle controller is
deliberately **not** used, and is never combined with the custom layer — two force models on one body
would double-count contact forces and make tuning unreproducible.

Per wheel the car computes: suspension compression from a `castRayAndGetNormal` hit, a
spring/damper force (`stiffness` 33 000 N/m, 3000 Ns/m compression, 3600 Ns/m rebound) clamped to
`maxForce` 22 000 N, an anti-roll term shared across each axle, a longitudinal force from drivetrain
torque and brakes, and a lateral force from the tire model. Load transfer, roll, and pitch therefore
emerge from the force application points rather than being scripted.

### 2. Tire model: slip-dependent, with the lateral peak inside the plausible range

`src/vehicles/TireModel.ts` uses a simplified magic formula for lateral grip and a saturating curve
for longitudinal force. The current shaping constants (`lateralStiffness` 9.5, `lateralShape` 1.55,
`lateralCurvature` 0.15) put peak grip near 10° of slip: grip rises quickly, plateaus, then falls
away, which is what makes progressive slides and recoverable drifts possible. A near-1 curvature was
tried first and made the curve so flat that the car could not break traction at any steering angle;
that value must not be reintroduced.

Slip angle uses the wheel's own longitudinal velocity, with the denominator floored by a reference
speed so low-speed math stays finite. Handbrake input multiplies rear lateral grip by
`handbrakeGripScale` (0.5) rather than adding a separate sideways impulse, so a handbrake turn is the
same physics as a power slide with less rear grip.

### 3. Fixed-step simulation with bounded catch-up and render-time interpolation

`src/physics/PhysicsWorld.ts` steps Rapier at exactly 1/60 s from an accumulator, with at most five
steps per rendered frame, and a frame delta clamp of 0.25 s. Gameplay state (pose, wheel angles) is
**not** read directly by the renderer: `Car.getInterpolatedPose(alpha)` blends the previous and
current physics poses so visuals stay smooth when the render rate and the physics rate differ. The
HUD reports physics steps per frame and stalled frames so a broken step budget is visible instead of
silently slowing the simulation.

### 4. Keyboard smoothing lives in the input layer, not in the car

`src/input/InputManager.ts` converts key state into continuous `VehicleActions`. Throttle and brake
use asymmetric attack/release time constants plus a response exponent; steering is rate-limited
(3.2 units/s, 5 units/s back to centre) and lightly smoothed, with the _linear_ ramp kept inside the
rate limiter and the response curve applied only on read. Shaping inside the ramp stalls the
exponential short of full lock, which is a subtle and repeatable bug — it is documented here so it is
not reintroduced. The car consumes only the shaped actions, so a future gamepad or touch source
(Phase 5) can drive the same contract.

### 5. Chase camera with separate position, look, heading, and FOV time constants

`src/cameras/ChaseCamera.ts` follows the car through four independent damped channels: position
(0.18 s), look-at (0.1 s), heading yaw (0.28 s — this is the spring-arm lag behind turns), and FOV
(62° at rest to 78° near 62 m/s). Roll is applied inside the camera quaternion rather than to
`camera.up`, so the horizon tilts with lateral acceleration without corrupting the up vector. The
Phase 1 `OrbitControls` camera remains available as a debug view; `C` toggles, and switching to the
chase camera snaps it rather than easing from a stale pose.

## Consequences

**Positive**

- Wheel forces, grip, and the torque curve are all project code, so feel changes are tuning edits in
  `src/config/vehicle.ts` with unit-test coverage, not library swaps.
- The physics/render split is explicit: Rapier steps at a fixed rate, the renderer interpolates, and
  the diagnostics surface both.
- Drift, handbrake turns, and opposite-lock recovery are the same code path as normal cornering,
  which keeps the acceptance criteria honest.

**Negative / mitigations**

- A hand-written force layer is more code to maintain than a library controller; it is covered by
  `tests/physics/vehicle-physics.test.ts` (straight-line, braking, planted cornering, drift,
  opposite-lock recovery, reverse, obstacle collision, determinism, reset, interpolation, disposal).
- Performance-parameter tuning is empirical. The measured envelope is recorded in
  `docs/SESSION_HANDOFF.md` rather than asserted in tests, so retuning the car cannot silently break
  CI.
- Interpolation means the rendered pose is a blend, so any future feature that needs exact contact
  positions (e.g. Phase 4 terrain queries) must read the physics state directly, not the visual pose.
- Rapier is only loaded as an async module and is a large chunk (~4.3 MB unminified in the build);
  code splitting and load-time work are Phase 6 concerns.

## Related

- `PROJECT_PLAN.md` Phase 2 section.
- `docs/decisions/0001-engine-and-physics.md` (Rapier as the solver), `0002-renderer-three-js.md`
  (Three.js as the renderer).
- `src/vehicles/README.md`, `src/physics/README.md`, `src/input/README.md`, `src/cameras/README.md`.
