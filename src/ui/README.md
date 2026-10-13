# User interface

**Status:** Partially implemented; diagnostics overlay is live, gameplay HUD is not.

## Responsibility

DOM/Tailwind UI: diagnostics, menus, HUD elements, and the mobile touch overlay. UI reads snapshots
from systems; it never drives physics or rendering directly.

## Implemented

- `DiagnosticsOverlay.ts` — Phase 1 metrics panel (FPS average/worst, frame time and p95, viewport
  and pixel ratio, draw calls, triangles, scene object count, camera position, frame count). Updated
  on the application's HUD interval, never per frame.

## Planned work

Speed/RPM/gear HUD and telemetry readouts (Phase 4), touch controls and on-screen prompts with
multi-touch support (Phase 5), quality/settings menus and accessibility review (Phase 6).

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
