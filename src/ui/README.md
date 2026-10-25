# User interface

**Status (2026-10-25):** After the owner reported the bar still appearing to dwell at 80%, the progress ticker was decoupled from `requestAnimationFrame` and moved to its own 50 ms timer. It now accounts for elapsed time at 12–16 percentage points per second; if the first playable frame arrives while the bar is partial, the final fill proceeds at 12 points/second. The counter remains plain `NN%`, with no “Est.” prefix, and gameplay remains hidden until readiness and visible 100%. This follow-up is pending validation; the preceding `d52b3da` code passed `npm run check` (80 test files / 601 tests, asset verification and production build). No live-browser or affected-device review has been performed. Restart/apply rebuilds in-page, the minimap is hidden while paused, and fullscreen attempts native landscape lock where supported. Touch/pen retries use `pointerup` (or `touchend` without Pointer Events), since `pointerdown` is not a reliable Android Chrome activation event. The full-screen diagnostics report includes weather/wetness and mean contacting-wheel grip/rolling resistance; the 30-card layout has DOM coverage but no refreshed rendered/device fit review. Manual Android-device review remains pending. Auto-start and best-effort handling are unchanged.

## Responsibility

DOM UI for diagnostics, pause/home navigation, saved gameplay/display preferences, asset credits, startup feedback, HUD elements, and the mobile touch overlay. UI reads snapshots and sends user actions through application callbacks; it never drives physics or rendering directly.

## Implemented

- `PauseMenu.ts` — keyboard- and touch-accessible Resume/Restart, overview, Spawn Location, Gameplay Options, Graphics, Car Model, Controls & Help, and final Credits navigation. The menu can be opened from the right-corner button, `P`, or `Escape`; it stops/resumes the running application and rebuilds in-page on restart/apply to avoid a fullscreen-breaking navigation.
- `CreditsPanel.ts` — manifest-driven attribution dialog opened from the final menu entry, with focus return to the invoking item.
- `StartLocationSelector.ts` — URL helper preserves unrelated query options while switching spawn; spawn choice is now presented from the menu rather than a separate HUD picker.
- `LoadingScreen.ts` — monotonic reported startup stages plus a separate 50 ms timer-driven visual fill that follows reported progress without snapping and advances at 12–16 percentage points per second. The visible counter is plain `NN%` with no “Est.” prefix; if the bar fills early, it says “Still working…” with a sheen. When the first playable frame arrives before the bar is full, the overlay holds and fills at 12 points per second to 100%, then fades. Elapsed time is integrated across delayed timer ticks; reduced-motion mode suppresses decorative sheen, not functional progress motion. No Play gate.
- `FullscreenOnStart.ts` and `LandscapeFallback.ts` — best-effort fullscreen requests, with touch/pen retries at `pointerup` (mouse at `pointerdown`, plus keyboard/accessibility and legacy `touchend` paths), native landscape lock after entry where supported, and a page-level landscape fallback; none claims to override browser gesture or OS rotation policy.
- `Minimap.ts` — destination map HUD parented to the app rotation/stacking context and hidden while the pause/home menu is open.
- `DiagnosticsOverlay.ts` — full-screen live FPS/frame-time, viewport, render, scene, vehicle, weather and surface-response report; responsive non-scrolling metric grid sits above the minimap/touch HUD, updates at the application's HUD interval, and closes with × or F2.
- `TouchControls.ts` — multi-touch steering, pedals and utility buttons; the pause button remains at the upper-right without overlapping the utility row.

## Preferences with gameplay effects

- `game-preferences.ts` validates and persists graphics tier, city traffic intensity, player-car model, startup camera, and steering response. Invalid or blocked storage safely falls back to defaults.
- Graphics tiers resolve at startup; traffic intensity changes Aohara's moving-vehicle budget; the selected car model chooses the imported Generic Sport Coupé or project-authored Kaminari GT Roadster; camera and steering options feed the runtime. These options display an Apply & Restart action rather than pretending to change the active simulation immediately.
- Credits remain the last menu item and retain the existing required CC BY 4.0 attribution.

## Still out of scope

A continuously updating speed/RPM/gear HUD, photo mode, broad Phase 8 polish, Phase 7 visual weather/seasons, and visual/device-performance acceptance remain separate work. The authorized clear/rain physics presets and contact-wheel surface telemetry are implemented; visual precipitation remains open. See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
