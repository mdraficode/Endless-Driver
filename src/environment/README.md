# Environment state

**Status (2026-10-24):** Phase 3 delivered the time-of-day clock (`EnvironmentClock.ts`, `solar.ts`). Phase 7 is now authorized; `SurfaceState.ts` adds physics-only clear/rain responses; the diagnostics report exposes preset wetness and mean contacting-wheel grip/rolling resistance. Visual precipitation, transitions, seasons, snow/ice/mud and the radiance-cascades hardware go/no-go remain open.

## Responsibility

Day/night clock, seasons, weather, and shared gameplay surface conditions. Visual snow color is not the source of
tire friction.

## Implemented

| File                  | Responsibility                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solar.ts`            | Solar position from hour, latitude, and day of year: declination, hour angle, and rotation into world axes. A pure function, accurate to well under a degree — far more than lighting needs — and therefore fully testable in Node                                                                |
| `EnvironmentClock.ts` | Owns time: wraps hours, advances them at the configured rate, and resolves a `DaylightState` — sun direction/colour/intensity, ambient fill, environment intensity, exposure, horizon tint, atmospheric scattering, sun-disc visibility. The curve math is a pure function of the sun's elevation |
| `SurfaceState.ts`     | Resolves the fixed clear/rain preset and applies a bounded, surface-specific wet grip/rolling-resistance response; the initial rain switch is physics-only and dry response is unchanged                                                                                                          |

The clock knows nothing about rendering, and the renderer never reads the clock: the application resolves a
`DaylightState` once per frame and hands it to the scene and the engine, so there is exactly one place where time
becomes light.

## Planned work

`WeatherSystem.ts` transitions, `SeasonSystem.ts`, visual precipitation/season variants, wet-road rendering, and further surface states remain Phase 7 follow-ups. The radiance-cascades experiment is timeboxed and requires a measured real-hardware go/no-go.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md). Phase 7 is authorized; Phase 8 remains gated.
