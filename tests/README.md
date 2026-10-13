# Tests

Layered testing plan. Only the layers marked **implemented** exist today.

| Layer           | Path               | Purpose                                                                                               |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| Scaffold checks | `scaffold.test.ts` | Project metadata, module boundaries, page wiring, documents, asset manifest                           |
| Unit            | `unit/`            | **Implemented:** math helpers, render config invariants, performance monitor, core module API surface |
| Physics         | `physics/`         | Deterministic Rapier stepping, raycast suspension, drivetrain, traction                               |
| Integration     | `integration/`     | Chunk streaming, spawn/road seams, float-origin rebasing, save/load                                   |
| Browser         | `browser/`         | Real rendering, mobile touch multi-contact, camera modes, context-loss recovery                       |
| Performance     | `performance/`     | Frame budgets, streaming hitches, memory growth, draw-call limits                                     |

## What the current suite does and does not prove

`npm test` (Vitest, Node environment) covers pure logic and module wiring only. It does **not**
prove that the scene renders, that shadows appear, that physics behaves realistically, or that any
frame-rate target is met. Those claims require the browser smoke test and named-device measurements
recorded in `docs/SESSION_HANDOFF.md`.

Browser-level verification for Phase 1 is performed out-of-repo (headless Chromium driving
`npm run dev`) because the software rasterizer used in this environment cannot represent GPU
performance. Results, including the FPS caveat, are recorded in the session handoff rather than
asserted as a hardware guarantee.
