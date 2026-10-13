# ADR 0001 — Babylon.js Rendering with Independent Rapier Physics

> **Superseded in part (2026-10-13):** the renderer choice in this record was replaced by
> **Three.js** at the owner's explicit instruction during Phase 1 authorization. Physics, tooling,
> UI, and noise decisions below still stand. See [`0002-renderer-three-js.md`](0002-renderer-three-js.md).
> The original text is retained unedited as the historical record.

- **Date:** 2026-10-13
- **State:** Selected planning baseline; validated tooling, runtime integration deferred to authorized phases
- **Decision owner:** Project planning; the user may revise the stack before development

## Context

The brief permits Babylon.js or Three.js/R3F and Rapier or Cannon-es. The game needs PBR assets, cameras, shadows, post-processing, procedural terrain, raycast suspension, rigid-body collisions, and mobile performance. A simple, explicit architecture is preferable to running overlapping rendering/physics frameworks.

## Decision

Use Babylon.js ES modules for rendering, Rapier 3D for physics, Vite/TypeScript for tooling, semantic DOM/Tailwind for UI, and simplex-noise with a seeded random source for world sampling.

Begin with `@dimforge/rapier3d-compat` to simplify WASM packaging. Import and initialize it asynchronously when Phase 2 is authorized. Use a direct transform/query adapter rather than assuming Babylon includes an official Rapier vehicle plugin.

Do not enable Babylon's Havok/Cannon integrations or movement collision resolver for the same bodies. Rapier is the only simulation authority. WebGL2 is the baseline; WebGPU is optional after compatibility and cost validation.

## Consequences

### Benefits

- Mature rendering features without a React dependency.
- Headless-testable physics and generation logic.
- One clear source of collision and transform truth.
- Compatibility WASM package reduces initial bundler complexity.
- Data-driven vehicle systems can replace the Phase 2 placeholder without replacing the renderer.

### Costs and caveats

- The Babylon/Rapier adapter, pose interpolation, handedness handling, and resource lifecycle must be implemented and tested.
- The compatibility package embeds WASM and increases startup payload; measure and consider separate WASM serving later.
- Rapier's raycast controller does not itself provide a full drivetrain or advanced tire model. Phase 4 includes a feasibility gate before selecting built-in versus custom wheel forces.
- WebGPU custom effects need appropriate shader paths; GLSL support must not be assumed equivalent.

## Alternatives

- **Three.js + R3F:** viable, but adds React render/lifecycle concerns without a specific UI need; not selected.
- **Cannon-es:** viable for simpler raycast driving, but Rapier is preferred for the planned rigid-body/query pipeline.
- **Babylon + Havok:** viable, but would change the selected physics and vehicle strategy; do not install it alongside Rapier as a second solver.

## Revisit triggers

A material licensing/performance constraint, a blocking pinned-API integration issue, or a user-requested stack change. Record any replacement in a new decision record and update plan/architecture/handoff together.
