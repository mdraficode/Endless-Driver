# Platform input

**Status:** Phase 2 implemented for keyboard. Touch (multi-contact) arrives in Phase 5.

## Responsibility

Keyboard and independent-pointer touch handling publish normalized actions. Input never directly
mutates vehicle transforms.

## Implemented

| File              | Responsibility                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InputManager.ts` | Keyboard state → `VehicleActions`. Asymmetric attack/release smoothing on throttle and brake with a response curve, a steering rate limiter plus exponential smoothing so a key press interpolates instead of snapping, a smoothed handbrake, one-shot reset/camera commands with a lifetime, and full clearing on blur or detach. |

## Design notes

- Smoothing is frame-rate independent (exponential time constants), so a 30 Hz phone and a 144 Hz
  desktop produce the same car behaviour.
- The stored axes are linear ramps; the response curve is applied when actions are read, so the
  curve cannot distort the ramp's convergence.
- Input only ever produces intent: `Application` copies the actions onto the vehicle before the next
  fixed step, and the vehicle never queries the keyboard.
- An `InputTarget` interface keeps the manager instantiable in Node tests without a DOM.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
