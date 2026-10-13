# Testing strategy

Only `scaffold.test.ts` contains executable tests initially. Its five tests verify repository infrastructure, not rendering, physics, handling, mobile support, or frame rate.

| Directory      | Planned use                                                  |
| -------------- | ------------------------------------------------------------ |
| `unit/`        | Seeds, chunk math, action mapping, tuning, pure controllers  |
| `physics/`     | Headless Rapier fixed-step/contact/handling tests            |
| `integration/` | Streaming, ownership, worker cancellation, model binding     |
| `browser/`     | Browser startup, inputs, touch, resize, lifecycle, fallbacks |
| `performance/` | Documented device routes, measurements, resource soaks       |

The initial-entrypoint guard intentionally asserts that Phase 1 has not started. Replace that guard with actual engine lifecycle tests when Phase 1 is explicitly authorized. Browser automation dependencies are intentionally deferred until used. GPU performance must be measured on named real devices, not inferred from Node test success.

Run `npm test` or `npm run check`. Record manual and automated results separately in `docs/SESSION_HANDOFF.md`.
