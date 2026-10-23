# User interface

**Status (2026-10-23):** The right-corner pause control and in-game home menu are implemented. The game still auto-starts when ready; the menu is not a startup Play gate. Menu settings persist locally and are applied on restart. Automated checks and manual visual review are pending for this increment.

## Responsibility

DOM UI for diagnostics, pause/home navigation, saved gameplay/display preferences, asset credits, startup feedback, HUD elements, and the mobile touch overlay. UI reads snapshots and sends user actions through application callbacks; it never drives physics or rendering directly.

## Implemented

- `PauseMenu.ts` — keyboard- and touch-accessible Resume/Restart, overview, Spawn Location, Gameplay Options, Graphics, Car Model, Controls & Help, and final Credits navigation. The menu can be opened from the right-corner button, `P`, or `Escape`; it stops/resumes the running application and preserves auto-start on a fresh load.
- `CreditsPanel.ts` — manifest-driven attribution dialog opened from the final menu entry, with focus return to the invoking item.
- `StartLocationSelector.ts` — URL helper preserves unrelated query options while switching spawn; spawn choice is now presented from the menu rather than a separate HUD picker.
- `LoadingScreen.ts` — startup stages and first-frame readiness; no Play gate.
- `FullscreenOnStart.ts` and `LandscapeFallback.ts` — best-effort fullscreen requests and the page-level landscape fallback; neither claims to override browser gesture or OS rotation policy.
- `DiagnosticsOverlay.ts` — bounded FPS/frame-time, viewport, render, scene, and vehicle metrics; updated at the application's HUD interval, never per frame.
- `TouchControls.ts` — multi-touch steering, pedals and utility buttons; the pause button remains at the upper-right without overlapping the utility row.

## Preferences with gameplay effects

- `game-preferences.ts` validates and persists graphics tier, city traffic intensity, player-car model, startup camera, and steering response. Invalid or blocked storage safely falls back to defaults.
- Graphics tiers resolve at startup; traffic intensity changes Aohara's moving-vehicle budget; the selected car model chooses the imported Generic Sport Coupé or project-authored Kaminari GT Roadster; camera and steering options feed the runtime. These options display an Apply & Restart action rather than pretending to change the active simulation immediately.
- Credits remain the last menu item and retain the existing required CC BY 4.0 attribution.

## Still out of scope

A continuously updating speed/RPM/gear HUD, photo mode, broad Phase 8 polish, Phase 7 weather/seasons, and visual/device-performance acceptance remain separate work. See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
