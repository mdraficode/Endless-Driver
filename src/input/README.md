# Platform input

**Status:** Keyboard (Phase 2) and multi-touch driving controls (pulled forward from
Phase 8 at the owner's request, 2026-10-15 — the game was unplayable on phones without
them).

## Responsibility

Keyboard and independent-pointer touch handling publish normalized actions. Input never directly
mutates vehicle transforms.

## Implemented

| File               | Responsibility                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InputManager.ts`  | Keyboard state → `VehicleActions`. Asymmetric attack/release smoothing on throttle and brake with a response curve, a steering rate limiter plus exponential smoothing so a key press interpolates instead of snapping, a smoothed handbrake, one-shot reset/camera commands with a lifetime, and full clearing on blur or detach. |
| `touch-state.ts`   | Pure touch logic: joystick deflection → analog steer (dead-zoned, rim-clamped), and the multi-pointer `TouchStateTracker` that lets independent thumbs steer and pedal simultaneously.                                                                                                                                             |
| `TouchControls.ts` | The DOM surface: left steering joystick, BRAKE/GAS pedals, handbrake, camera/reset/fullscreen buttons — each tracking its own pointer ids, publishing into `InputManager.setTouchState`. Attempts fullscreen + landscape lock on first touch; the portrait rotate prompt is CSS.                                                   |

## Design notes

- Smoothing is frame-rate independent (exponential time constants), so a 30 Hz phone and a 144 Hz
  desktop produce the same car behaviour.
- The stored axes are linear ramps; the response curve is applied when actions are read, so the
  curve cannot distort the ramp's convergence.
- Input only ever produces intent: `Application` copies the actions onto the vehicle before the next
  fixed step, and the vehicle never queries the keyboard.
- An `InputTarget` interface keeps the manager instantiable in Node tests without a DOM.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
