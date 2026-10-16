# Environment state

**Status:** Phase 3 delivered the time-of-day clock (`EnvironmentClock.ts`, `solar.ts`). Seasons, weather, and
surface conditions remain Phase 7.

## Responsibility

Day/night clock, seasons, weather, and shared gameplay surface conditions. Visual snow color is not the source of
tire friction.

## Implemented

| File                  | Responsibility                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solar.ts`            | Solar position from hour, latitude, and day of year: declination, hour angle, and rotation into world axes. A pure function, accurate to well under a degree — far more than lighting needs — and therefore fully testable in Node                                                                |
| `EnvironmentClock.ts` | Owns time: wraps hours, advances them at the configured rate, and resolves a `DaylightState` — sun direction/colour/intensity, ambient fill, environment intensity, exposure, horizon tint, atmospheric scattering, sun-disc visibility. The curve math is a pure function of the sun's elevation |

The clock knows nothing about rendering, and the renderer never reads the clock: the application resolves a
`DaylightState` once per frame and hands it to the scene and the engine, so there is exactly one place where time
becomes light.

## Planned work

`SeasonSystem.ts`, `WeatherSystem.ts`, and `SurfaceState.ts` in Phase 7, on top of the same clock and the same
resolve-once-per-frame pattern.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md). Do not implement this module before the relevant phase is authorized.
