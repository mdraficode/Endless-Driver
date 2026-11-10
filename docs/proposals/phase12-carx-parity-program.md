# Phase 12 — CarX-class parity (original implementations)

**Owner instruction (2026-11-10):** bring in the graphics and gameplay mechanics the project is missing versus CarX Street, "all of the above in a logical sequence."
**Status:** proposed 2026-11-10, execution starts with pass 12.1.

## Boundary (recorded decision)

No CarX Street code, decompiled material, or assets may enter this project. CarX Street is a
commercial game (CarX Technology); its meshes, textures, VFX, shaders and code are copyrighted,
and no third-party "reverse engineering" repository can license what it does not own. This matches
the project's own standing rule (`docs/ASSET_POLICY.md`: "never use ripped/converted game meshes").
Every feature below is an **original implementation** inspired by the publicly observable behaviour
of the genre, built from the project's own systems, original code, and the existing asset policy
(CC0 preferred; AI-generated only after exact-item verification and owner approval).

## Current-state audit (2026-11-10, HEAD `2ccf6fd`)

| Area            | What exists                                                                                                                                                                                                                                                                                   | What is missing vs a CarX-class feel                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vehicle physics | Custom raycast vehicle (ADR 0003): Pacejka lateral magic formula, friction-circle budgeting, relaxation length, torque curve + auto gearbox, N₂O boost, blow-off dampers, force-rate limits, yaw-stability assist, cornering-budget steering authority with slip relief. Two selectable cars. | Feel is fixed: no player-facing tuning (power/suspension/tires), no handling-mode spectrum, no drift-oriented tuning. All numbers are dev-side only.                                                                 |
| Traffic         | `GpuTrafficWorld` (Phase 10.5 C5): two-kernel WebGPU compute (car-following target speed, integration + route sampling + turn signals), CPU shadow owning player collision, per-route player-as-leader speed matching, parked traffic.                                                        | Traffic does not react to the player as an _obstacle_ (player ahead of a traffic car → no brake/evade), no driver personality spread, no overtaking behaviour, no evasive lateral avoidance when the player cuts in. |
| Damage          | `VehicleImpact`: transient 0.9 s chassis shudder (bounce/pitch/roll) triggered above 1.25 m/s relative speed. Destroyable streetlights exist.                                                                                                                                                 | No persistent damage at all: no cracked/shattered glass, no popped hood, no dented panels, no debris, no smoke. A car can survive 50 collisions looking pristine.                                                    |
| Graphics        | Three.js + TSL node materials, WebGPU renderer with WebGL2 fallback, SSR + AO on all tiers (owner: both stay ON), no fog (owner: removed, never re-add), no global bloom, day/night + seasons + rain, urban night lighting, adaptive headlights.                                              | Look polish: road/building/terrain material quality, night-light richness, post-processing tuning. (Scoped in 12.4; must respect the no-fog/no-bloom constraints.)                                                   |

## Passes (logical sequence)

### 12.1 — Driving feel + in-game tuning (foundation)

The car model is already deep; the gap is _player control over it_.

- **Handling modes:** three named presets — `arcade` (current forgiving defaults), `balanced`,
  `sport` — as parameter sets in `config/vehicle.ts` (steering authority, slip relief, yaw
  assist, tire shape/curvature, suspension stiffness/damping, aero). Deterministic per mode.
- **Tuning menu** in the pause menu ("Car" section), persisted via `game-preferences.ts`
  (storage version bump), applied live at the next step:
  - Power: engine torque scale (0.9–1.25×)
  - Suspension: ride height (±2 cm), stiffness (±25 %), dampers compression/rebound (±25 %)
  - Tires: grip (0.85–1.15× friction coefficient)
  - Brake bias: front/rear split (40–60 %)
  - Handling mode select (arcade/balanced/sport)
- **Feel work** while the harness exists: steering smoothness at speed, handbrake-drift
  initiation/exit, anti-dive. Tuned via headless telemetry, not by eye.
- **Acceptance:** deterministic telemetry suite (0–100 km/h, 100–0 braking, skidpad
  lateral-g, handbrake-drift yaw rate) per mode with sane spread (sport ≥ balanced ≥ arcade in
  cornering, arcade most forgiving in recovery time); tuning persistence test (save →
  reload → apply); stability suite (vehicle-stability) still green; full `npm run check` green.

### 12.2 — Living traffic

Extend the existing two-kernel compute + CPU shadow (same determinism contract, plan §5):

- **Player as obstacle:** when the player is within the lead band _ahead_ of a traffic car
  (traffic car chasing the player), brake to a safe bumper gap; if the player is stationary in
  the lane, the car creeps/stops. Symmetric to the existing player-as-leader pass.
- **Driver personality:** per-car deterministic spread — cruise speed ±20 %, patience (gap
  factor), aggressiveness (overtake willingness). Same world + seed ⇒ same personalities.
- **Evasive avoidance:** lateral offset when the player is crossing the lane at speed
  (bounded, route-width-limited, no cutting corners off the road).
- **Overtaking:** slower cars let faster cars pass when the segment is clear (single-lane
  roads: yield at safe gaps; multi-lane where geometry allows: lateral shift within lane set).
- **Acceptance:** headless behaviour tests on the CPU shadow (deterministic): brake-before-
  stationary-player, no-collision invariants across N simulated minutes, personality spread
  measurable (speed std > 0), evasive offset bounded; traffic performance budget (compute
  pass + shadow ≤ current + 15 % frame time on tier C); full check green.

### 12.3 — Visible damage

Persistent per-part damage on the player car (traffic cars get cheap silhouette damage only,
if the budget allows):

- **Damage model:** per-part (windshield, side glass, hood, bumper F/R, doors, lights) with
  severity 0–1 accumulated from existing impact impulses (relative speed × side classification,
  already computed in `triggerVehicleImpact`). Part states: intact → dented/cracked →
  destroyed (glass shatters, hood pops open, lamp goes dark).
- **Presentation:** original, project-owned geometry/materials — cracked-glass overlay
  (procedural crack pattern), displaced dent verts or dent-normal maps generated in-repo,
  popped hood rig, broken-lamp emissive off. No external assets unless the owner approves a
  specific CC0 item per the asset policy.
- **Debris + FX:** short-lived glass shards / panel fragments on destruction events
  (existing `GpuParticlePool`), low smoke at high severity on the hood.
- **Persistence within a session** (resets on respawn/restart, like the car); no save-file
  persistence in v1.
- **Acceptance:** deterministic damage-state machine tests (same impulse sequence ⇒ same part
  states); visual smoke test (headless screenshot at each severity band, reviewed); per-frame
  cost negligible (damage presentation only updates on state change); no regressions in the
  stability suite; full check green.

### 12.4 — Graphics pass (modern-look polish)

- **Materials:** PBR quality pass over roads (wet/dry roughness response already exists via
  surface state), building facades, terrain — original or CC0-sourced textures where needed
  (asset-policy pipeline: manifest, hashes, CREDITS).
- **Lighting:** urban-night richness (emissive variety, light-pool hygiene), daylight
  atmosphere (respecting the removed-fog constraint: distance visibility via exposure/contrast,
  NOT fog), headlights/taillights quality.
- **Post:** SSR/AO parameter polish on all tiers (both stay ON), tonemapping/exposure polish.
  **No fog, no global bloom** (owner constraints, permanent).
- **Acceptance:** tier-C frame-time budget holds (measured before/after, reported),
  deterministic rendering snapshot tests where applicable, no-fog/no-bloom guard test,
  full check green, owner visual review.

## Sequencing and reporting

Each pass: implement → deterministic tests → full `npm run check` → commit + push → report
measured numbers (the established per-pass report pattern). Phase 11.0c (Bridson k=30) and
11.0d (WebGPU compute terrain) remain queued **behind** Phase 12 per the owner's 2026-11-10
instruction.
