# Original Project Brief — Endless Driver

**Recorded:** 2026-10-13  
**Source:** Structured record of the user's requested scope; not a verbatim transcript

## Delivery instruction

First do the whole step-by-step planning, create a Markdown file with structured instructions and information about the project, then push all initial files and project structures to the user's dedicated GitHub repository named **Endless Driver**. Keep progress pushed to the dedicated repository to avoid losing it when shifting to another session. Then wait for further instruction to start development Phase 1.

This brief preserves requested scope. Engineering selections, feasibility qualifications, acceptance gates, and actual status are in `PROJECT_PLAN.md` and `docs/SESSION_HANDOFF.md`.

> **Renderer note (2026-10-13):** the brief offered Babylon.js or Three.js as options. Phase 1 was
> implemented with **Three.js** on explicit instruction; see
> `docs/decisions/0002-renderer-three-js.md`. Rapier remains the physics authority.

## Role and project overview

Expert Lead Game Developer and Graphics Engineer specializing in high-performance web-based 3D games using WebGL/WebGPU, modern JavaScript/TypeScript, and game engines like Three.js or Babylon.js.

Build a cutting-edge, cross-platform, web-based 3D realistic car driving game featuring an open-world procedurally generated environment, dynamic seasons, realistic vehicle physics, and responsive controls for both desktop and mobile devices.

## Tech stack and architecture requested

- **Core 3D engine:** Babylon.js, recommended for built-in physics/colliders, or Three.js with React Three Fiber and TypeScript.
- **Physics engine:** Rapier.js or Cannon-es for high-performance rigid-body and vehicle raycast physics.
- **Build tool:** Vite with TypeScript.
- **Styling/UI:** Tailwind CSS for HUD, menus, and responsive cross-platform overlays.
- **Shaders/post-processing:** Custom GLSL shaders or engine pipeline: bloom, SSAO, tone mapping, and color grading for an AAA look.

## 1. Project setup and engine initialization

- Clean Vite + TypeScript project with modular `/engine`, `/physics`, `/world`, `/vehicles`, `/ui`, and `/shaders` architecture.
- Responsive viewport canvas, automatic resizing, high-DPI/Retina support, and FPS monitoring.

## 2. Realistic vehicle physics and controller

- Raycast vehicle model: suspension springs, tire friction curves, steering angle, engine torque, braking, and transmission/gear shifting.
- Weight transfer, drifting, skidding, and collision response with environment objects.
- Realistic GLTF/GLB car with rotating wheels, working steering wheel, brake lights, and shadow casting.

## 3. Procedural open world and streaming

- Infinite procedural world generator with chunk/tile streaming and Perlin/Simplex noise for terrain, roads, trees, rocks, and buildings.
- Smooth LOD management targeting 60+ FPS across desktop and mobile.
- Dynamic seasons/weather with spring greenery, summer sunlight, autumn falling leaves/mud physics, and winter snow accumulation/slippery road friction.

## 4. Graphics, lighting, and post-processing

- Realistic PBR for cars, roads, and terrain.
- Dynamic day/night, sun positioning, real-time cascaded shadows, skyboxes, and volumetric lighting.
- Bloom, SSAO, motion blur, vignette, and ACES Filmic tone mapping.

## 5. Cross-platform controls

- Desktop: smooth keyboard listeners; WASD/arrow throttle and steering, Space handbrake, Shift nitro/gear, C camera change.
- Mobile: virtual analog joystick or steer buttons, throttle/brake pedals, handbrake, camera toggle, and mandatory multi-touch.
- Chase, cockpit/interior, and free orbital cameras.

## Required phased execution order

Do not write the whole game in a single file or response. Build iteratively:

1. **Phase 1:** Core engine setup, window loop, and basic camera/scene lighting.
2. **Phase 2:** Physics integration and a basic driving cube/car responding to keyboard input.
3. **Phase 3:** Procedural terrain and chunk streaming around the car.
4. **Phase 4:** Advanced raycast vehicle physics, realistic GLTF model loading, and wheel animation.
5. **Phase 5:** Mobile joystick/pedals alongside desktop bindings.
6. **Phase 6:** Environmental details, post-processing shaders, and season/weather toggles.

## Initial gate

The initial request authorizes planning, scaffold creation, and repository transfer only. It explicitly requires waiting for a further user instruction before developing Phase 1.
