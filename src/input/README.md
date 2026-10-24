# Platform input

**Status:** Keyboard (Phase 2), multi-touch driving controls and standard-mapping
gamepad (both pulled forward from
Phase 8 at the owner's request, 2026-10-15), plus the requested live wheel/arrow steering
selector, adjustable touch-control scale, and N₂O boost input that accelerates independently of GAS.

## Responsibility

Keyboard, independent-pointer touch handling, and per-frame gamepad polling publish normalized actions. Input never directly
mutates vehicle transforms.

## Implemented

| File               | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gamepad-state.ts` | Pure standard-mapping pad → drive state: dead-zoned centre-softened stick steer, analog LT/RT triggers, A/RB handbrake, B boost, Y reset, X camera, D-pad steer fallback; polled (never event-trusted) by `InputManager`.                                                                                                                                                                                                                                                                                                                                                                              |
| `InputManager.ts`  | Keyboard state → `VehicleActions`. Asymmetric attack/release smoothing on throttle and brake with a response curve, a steering rate limiter plus exponential smoothing so a key press interpolates instead of snapping, Shift-held N₂O request, a smoothed handbrake, one-shot reset/camera commands with a lifetime, and full clearing on blur or detach.                                                                                                                                                                                                                                             |
| `touch-state.ts`   | Pure touch logic: one-finger rotary wheel angle → dead-zoned analog steer (with a horizontal centre-hub drag fallback), plus the multi-pointer `TouchStateTracker` for digital arrows, simultaneous pedals, and boost.                                                                                                                                                                                                                                                                                                                                                                                 |
| `TouchControls.ts` | The DOM surface: selectable wheel or left/right arrows with enlarged transparent hit areas around the larger visible faces, BRAKE pedal, GAS pedal with the independent N₂O button directly above it, handbrake, plus camera/reset/fullscreen. Controls track their own pointer ids, arrow/wheel state publishes into `InputManager.setTouchState`, and the Gameplay Options slider scales the touch controls live. Fullscreen retry waits for touch/pen `pointerup` (or `touchend` without Pointer Events); portrait native landscape lock is best-effort from `pointerup`. The rotate prompt is CSS. |

## Design notes

- Smoothing is frame-rate independent (exponential time constants), so a 30 Hz phone and a 144 Hz
  desktop produce the same car behaviour.
- The stored axes are linear ramps; the response curve is applied when actions are read, so the
  curve cannot distort the ramp's convergence.
- Input only ever produces intent: `Application` copies the actions onto the vehicle before the next
  fixed step, and the vehicle never queries the keyboard.
- An `InputTarget` interface keeps the manager instantiable in Node tests without a DOM.
- Gameplay touch buttons are faint at rest and fully visible while pressed or keyboard-focused. Their hit areas and pointer tracking are unchanged; menu and settings buttons are not affected.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
