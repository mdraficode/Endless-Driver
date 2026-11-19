# Most Wanted — Police Chase & Blacklist System

**Design spec (planning only — no implementation yet).** A Need for Speed: Most Wanted–class
wanted/heat system, 15-rival Blacklist campaign, and full police pursuit, integrated into
Endless Driver's existing procedural world, Rapier physics, and Three.js/TSL renderer.

**Status:** DRAFT v1 for owner review. Requires a new **phase authorization** before any
implementation (see §2). All numbers below are tunable defaults living in `src/config/*`.

---

## 0. What this is (and is not)

**Is:** an original, from-scratch reimplementation of the _game system_ of NFS: Most Wanted (2005)
— heat/hit levels, police pursuits and tactics, evades, hiding spots, pursuit breakers, bounty,
impound strikes, and a 15-rival "Blacklist" bust campaign — adapted to Endless Driver's fictional
**Hinode Prefecture / Aohara** setting.

**Is not:** a copy of EA's assets. Per the project's standing asset policy (ADR 0005/0007/0008,
AGENTS.md), **every car is fictional and unbadged** ("Kaminari" marque, no recognizable production
designs). We reuse the _mechanics_ (not copyrightable) and the _difficulty/tier structure_ of NFS MW
as the reference, but the rival identities, car designs, police units, names, and audio are all
original/CC0. No ripped assets, no EA logos/names/music.

**Scope guardrails (default, adjustable in §15):**

- Single-player, no online/multiplayer, no trading/economy shop.
- The Blacklist bust race + police pursuits are the two new "modes"; free-roam driving already exists.
- We do **not** build a full open-world race-event economy (circuit races, tollbooths) unless
  authorized — the Blacklist uses two short structured "challenge" legs + the pursuit, not a race hub.

---

## 1. Canonical NFS Most Wanted reference (the behavior we must match)

Documented from the game so "works exactly like NFS MW" is verifiable. All of the following is the
target behavior; our data models in §6 map 1:1 to it.

### 1.1 The two currency/progression loops

- **Bounty** = the currency earned from _police pursuits_. Two sources: (a) a **time rate** while
  you are being chased, (b) a **per-unit reward** for each police vehicle you **wreck/immobilize**
  (scales with unit tier). Bounty is a _career total_ plus a _per-pursuit total_ (used by milestones).
- **Blacklist** = 15 rival racers ranked **#15 (weakest) → #1 (strongest, the finale boss)**. To
  _challenge_ a rival you must have accumulated **enough bounty** (a per-rival threshold). Busting a
  rival unlocks the next and **raises your Heat Ceiling** (§1.2).

### 1.2 Heat / Hit levels (1–15) — the wanted system

- A **heat meter** fills from _crimes_: excessive speed in policed zones, collisions, ramming police,
  committing a "bounty event". When full, you **rise a heat level**.
- **Heat Ceiling** is gated by Blacklist progress: `ceiling = 1 + (rivals busted)`, capped at 15.
  Start = level 1. After busting #15 → ceiling 2 … after busting #2 → ceiling 15.
- Higher heat = more police units, tougher unit mix, and more dangerous tactics (§1.4).
- **Cooling off:** once you **evade** (shed all police), you enter cool-down and your heat level
  decays over time (faster at low levels). Re-triggering a crime re-raises it.

### 1.3 Bust (of the player)

- A **bust meter** rises when you are **slow** and **boxed in** by close police; it falls when you
  keep moving / open distance. ("The police cannot bust you if you are moving.")
- At 100% you are **BUSTED**: the pursuit ends, a **fine** is paid (cash first, then "marker" points),
  your car takes an **impound strike**; **3 strikes = car impounded** (removed from your garage).
  After "jail" your heat resets low and you respawn at the nearest safe point.

### 1.4 Police units and tactics (escalate by heat)

Reference escalation (Blackwood PD, from the game):

- **H1:** marked patrol sedans. Ramming + light rolling roadblocks. Fast cool-down.
- **H2:** + unmarked sedans. Rolling roadblocks, ramming, static roadblocks.
- **H3:** + light-SUV roadblocks, **Rhino** armored units, **PIT** maneuvers.
- **H4:** + unmarked state-patrol muscle, **spike strips** (helicopter-dropped), heavy-SUV roadblocks,
  **helicopters**.
- **H5:** + marked federal muscle, the **Cross racing unit** (fast special unit), all tactics.
- **H6:** + unmarked federal muscle + heavy SUVs, maximum unit count.
- **Reinforcements:** when only a few units remain, a **backup timer** (≈2 min) starts; at zero, new
  units spawn (count scales with heat).

**Tactics catalog:** pursuit (chase to your position), ramming, **PIT** (flank + spin you out),
**rolling roadblock** (units crossing your path), **static roadblock** (units parked across the road),
**spike strip** (flat prop that flats your tires), **Rhino block** (heavy unit wedging in front),
**helicopter** (overhead; drops spike strips, provides a "lock/radar" buff to ground units).

### 1.5 Evades, hiding spots, pursuit breakers

- **Evade:** get **all** police out of detection (distance + line-of-sight) and hold it for a short
  window → "Evaded" → cool-down. The primary win condition of a pursuit.
- **Pursuit breakers:** fixed map spots (red triangles). Driving through one makes nearby units lose
  you / drop off. Limited uses per pursuit.
- **Hiding spots / safe houses:** fixed map spots (blue circles). **Park** inside for a few seconds →
  the pursuit ends and heat clears (a "safe" escape). These are the "blue circles" from the game.

### 1.6 Radar & police radio

- **Radar detector:** a ping (audio + on-screen icon) when a unit is behind/adjacent and closing.
- **Minimap:** blips for police (units), the active Blacklist rival, hiding spots, pursuit breakers,
  and roadblock/spike warnings.
- **Police radio / scanner:** short dispatch lines that telegraph intent ("backup en route",
  "spikes deployed ahead", "we've lost them") — gives the player a beat to react.

### 1.7 Blacklist bust race (the rival "boss")

- A structured event against one rival. The goal is to **bust** them: **destroy their car** (fill
  their damage to the destroyed threshold) while **surviving the police** (the race generates heat,
  so it is a three-way: you vs rival vs police). If **your** car is destroyed or you are busted, the
  attempt fails (retry). On success you "take their spot" and pick **reward cards** (a **pink slip**
  that lets you take _their car_, plus upgrade/pursuit rewards).
- **Boss per heat level:** in addition to the campaign boss (the rival), each heat level has a
  signature **boss police unit** (the toughest/most-aggressive unit introduced at that level — e.g.
  the Rhino at H3, the Cross unit at H5). This satisfies "a boss in every hit level."

### 1.8 Milestones & rewards

- **Per-rival milestones** (unlock after busting a rival): "evade with X bounty", "tag N police",
  "dodge N roadblocks", etc.
- **Global milestones:** "photo ticket > 149 mph", "30k bounty in one pursuit", "evade in < 3 min".
- Rewards = cash/bounty.

---

## 2. Phase gate & authorization (IMPORTANT)

Per AGENTS.md **rule 10** and the phase gates in PROJECT_PLAN.md §9, the currently-open phases are
Phase 6 (vehicle/render), Phase 7 (weather/seasons, authorized 2026-10-24), and Phase 9 (urban
systems). **Phase 8 (polish) and any "final" scope remain gated.** A full Most Wanted system is a
**new major gameplay layer** and is **not** covered by an open phase.

**Recommendation:** authorize this as a **new dedicated phase — "Phase 10 — Most Wanted (police &
Blacklist)"**, dependent on the delivered Phase 6/9 (vehicle physics, unbadged traffic/vehicles,
Aohara city + seeded region grid all exist and are the integration surface). I will **not** write
gameplay code until this is explicitly authorized. The plan, config scaffolding, pure state-machine
modules, and their Node tests can be staged as _non-behavioral_ increments if you prefer, but the
live integration lands under the authorized phase.

**Decision needed (D1):** authorize "Phase 10 — Most Wanted" as its own gated phase? (or fold it into
Phase 9 Urban Systems as a sub-scope?)

---

## 3. Architecture & integration (how it fits the existing code)

Module-responsibility constraints (ARCHITECTURE.md §2) and invariants (AGENTS.md) drive the design:
Rapier is the **only** physics authority; TSL-only shading; fixed 1/60 tick; **seeded deterministic**
world gen; floating-origin rebasing; interval (not per-frame) HUD; every resource has a `dispose()`;
all tuning in `src/config/*`; engine-independent generation stays DOM/Three-free and unit-testable.

### 3.1 New feature module: `src/most-wanted/`

A self-contained feature, **composed by `core/Application`** (core owns composition; features never
import a global singleton). Layout:

```
src/config/most-wanted.ts        # ALL tuning: heat curve, police roster, bounty rates, bust/evade
                                 #   thresholds, 15-rival roster, hideout/breaker counts, tier caps
src/most-wanted/
  types.ts                        # shared enums/interfaces (HeatState, PoliceUnitKind, BountyState, ...)
  SeededMwPlacement.ts            # PURE: region-seed -> rival spawn, hide spots, breakers, bounty spots
                                 #   (follows computeRegionEvents(region, network) pattern)
  HeatModel.ts                    # PURE: crimes -> heat meter -> level, ceiling gate, cool-down decay
  BountyModel.ts                  # PURE: time + per-unit accrual; career + per-pursuit totals; thresholds
  BustMeter.ts                    # PURE: fill (slow + boxed) / drain (moving); busted event
  EvadeModel.ts                   # PURE: all-lost detection, evade confirmation, cool-down
  PoliceForce.ts                  # bounded set of police actors (Rapier dynamic bodies), spawn/despawn,
                                 #   per-heat unit mix + count, reinforcements, origin rebase, streaming
  PoliceAI.ts                     # per-unit behaviors: pursuit/steering, ram, PIT, roadblock placement,
                                 #   spike drop, Rhino block, heli lock; tier-simplified on C
  PoliceVehicleFactory.ts         # unbadged unit meshes + Rapier colliders (reuses traffic-geometry approach)
  Blacklist.ts                    # the 15 rivals; challenge gate; bust-race orchestration; reward cards;
                                 #   pink slip (car ownership)
  RivalActor.ts                   # the single rival car: Rapier body, damage, fight-back + escape AI
  MilestoneModel.ts               # per-rival + global milestones; completion; rewards
  MostWantedSystem.ts             # the composition object owned by Application: wires Heat/Bounty/Bust/
                                 #   Evade/Police/Blacklist/Milestones; exposes a fixed-tick update +
                                 #   HUD snapshot; owns all disposal
  most-wanted-save.ts             # save/load via a PreferenceStorage-style abstraction (versioned key)
```

### 3.2 UI additions: `src/ui/`

- `MostWantedHud.ts` — the on-interval DOM: **heat bar + heat-level badge**, **bounty** (career +
  this pursuit), **bust meter**, **evade/"cooling off" prompt**, **radar-detector icon**, and a
  **Blacklist status** chip. Updated on the same capped `window.setInterval` cadence as `BoostGauge`
  (Application lines ~2141/2172); per-frame path never touches the DOM.
- **`Minimap` extension** — a new **entity blip layer** (police dots, rival marker, hide-spot circles,
  pursuit-breaker triangles, roadblock/spike warnings). Add an optional `getBlips(): readonly Blip[]`
  to `MinimapOptions` (Application feeds it from `MostWantedSystem`); no existing behavior changes.

### 3.3 Reused existing systems

- **`CarDamage` / `VehicleImpact`** — the impact part-damage model (with a `destroyed` threshold) is
  reused for (a) player damage from police, (b) police units being wrecked (bounty), and (c) the
  rival car being busted. No new damage math.
- **`WorldPlan` / `RegionPlan` / `computeRegionEvents`** — deterministic, region-seeded placement of
  rival spawns, hide spots, pursuit breakers, and bounty spots on the road network (pure, testable).
- **`WorldEventMessage`** (world-events.ts) — the police radio / scanner + event toasts
  ("911: red coupé speeding on Aohara Central", "Backup en route", "Spikes deployed", "We've lost them").
- **`Car`** (`getInterpolatedPose`, `telemetry`, `position`, `body`) — the MW system reads the player
  pose/telemetry each fixed tick and applies impacts via the physics world.
- **`GpuTrafficWorld`** (civilians) — **unchanged**; police are a _separate_ bounded CPU/Rapier set
  (they need per-unit damage, tactics, spawn/despawn, and are low-count). The two coexist: civilians
  react to police and the player; police ignore the GPU pool (treat civilians as static-ish obstacles
  via the same impulse/obstacle signals the player uses).
- **`HideoutWorld`** (town visuals) — distinct from gameplay "hiding spots"; no change, but the
  gameplay hide spots can be placed near these settlements for coherence.
- **Physics** — police are Rapier **dynamic rigid bodies** in the existing `PhysicsWorld`; collisions
  with the player, each other, and the terrain are authoritative via Rapier (no renderer-side solver).
- **Persistence** — `game-preferences.ts` `PreferenceStorage` + versioned-key pattern → a
  `MostWantedSave` under key `endless-driver:most-wanted:v1`.
- **Floating origin** — police bodies, hide spots, and the rival rebase with the origin shift
  (they live in world space; the `#origin.update()` rebase moves them, per the invariant).

### 3.4 Wiring into `Application` (the only composition edits)

- Construct `MostWantedSystem` in the `Application` constructor (after world/physics/car exist),
  passing `{ physics, worldPlan, network, terrainSampler, car, tier, backend, config }`.
- Add **one** fixed-tick slot in the per-frame sequence (after `#physics.update`, before/around
  `#scene.update`): `this.#mw.update(delta, pose, telemetry, actions)`.
- Add the HUD interval callback to update `MostWantedHud` and the `Minimap` blips.
- Add `#mw` to `stop()`/`dispose()` (idempotent).
- Add `mostWanted` config block to `RenderConfig`/`WorldConfig` surface and a `game-preferences`
  toggle ("Police: off / standard / intense") mirroring `trafficIntensity`.

---

## 4. Systems in detail (behavior + design)

### 4.1 Heat / Hit levels

- State: `{ level (1..ceiling), meter (0..1), ceiling, cooling (bool), cooldownT }`.
- **Crimes** feed `meter` at per-crime rates: `speedCrime` (sustained > policed-speed threshold while
  in a policed region), `collisionCrime` (impact above a speed threshold), `ramCrime` (hitting a
  police unit). Rates and thresholds in config.
- `meter >= 1` → `level = min(level+1, ceiling)`, `meter = 0` (carry-over optional, tunable).
- **Cool-down:** after a successful evade, `cooling = true`; `meter`/`level` decay by `cooldownRate`
  per second (faster at low levels); a new crime during cool-down exits cool-down.
- **Ceiling gate:** `ceiling = 1 + bustedRivals`, capped at 15 (D2: confirm the 1:1 mapping).
- Exposes a **HUD snapshot** (`{ level, ceiling, meter, cooling }`) read by `MostWantedHud` on the
  interval.

### 4.2 Bounty

- **Per-pursuit:** `bountyRate/sec` while `level >= 1` and being chased; **+ `unitBounty(kind)`** for
  each police unit wrecked/immobilized (e.g. sedan 250 → unmarked 500 → muscle/SUV 1k → Rhino 10k →
  Cross 100k; all in config).
- **Career total** accumulates across pursuits.
- **Challenge gate:** to challenge Blacklist #N requires `careerBounty >= threshold(N)` (monotone
  thresholds in config). (D3: career-total gate vs "this-pursuit" gate — I recommend career-total.)

### 4.3 Bust meter (of the player)

- `bust (0..1)`. Rises when `speed < bustMaxSpeed` **and** `nearestPolice < bustRadius` **and**
  `policeClosing`; rate scales with closeness and unit count. Falls when `speed > bustMaxSpeed` or
  no close police. ("Can't bust you if you're moving.")
- At 1.0 → **busted**: end pursuit, `fine = baseFine + k·level`, deduct cash then markers,
  `impoundStrikes += 1`, `heat = low`, respawn at nearest safe point. `impoundStrikes >= 3` → car
  impounded (removed from garage; D4: confirm impound severity for our single hero-car flow).

### 4.4 Evade / cool-down

- **Detected as lost:** each unit has a `lostTimer`; when the player is beyond `detectRadius` **and**
  fails line-of-sight (raycast against terrain/buildings) for `lostHold` seconds, the unit marks lost.
- When **all** active units are lost → **evade confirmed** → `cooling = true`, pursuit ends, radio
  "we've lost them". Reaching a **pursuit breaker** or **hide spot** also confirms the evade.
- **Pursuit breakers:** driving through the trigger radius sheds the `K` nearest units (marks them
  lost) — limited uses per pursuit.
- **Hide spots:** park (speed < threshold) inside the circle for `hideHold` seconds → pursue ends +
  heat clears; limited uses/cooldown to prevent camping (D5: cooldown length / use limit).

### 4.5 Police force

- A **bounded** set (cap per tier, §9). Each unit: Rapier dynamic rigid body, a `CarDamage` map, a
  `PoliceAI` state, a class (sedan/unmarked/muscle/SUV/Rhino/motorcycle/heli), a position (world),
  and a `lost` state.
- **Spawn:** at heat rise, spawn `countFor(level, tier)` units at "patrol" nodes/districts within a
  bounded radius ahead of the player (never underfoot), deterministically per `(seed, level, spawnIndex)`.
- **Despawn/stream:** units beyond `despawnRadius` or outside loaded chunks are retired (bodies
  removed, resources disposed) and respawned on demand — bounded active count, bounded memory.
- **Reinforcements:** when `active < minActive(level)`, start a `backupTimer` (config ≈ 120 s); at
  zero, spawn a fresh wave. Radio "backup en route" at start.
- **Per-heat unit mix:** a table in config mapping `level -> { counts by class, tacticsEnabled }`
  (the §1.4 escalation). A **boss unit** for the level is the highest-tier unit present (extra HP +
  smarter AI) — "a boss in every hit level."

### 4.6 Police AI (per unit; tier-simplified on C)

- **Pursuit:** steer toward the player's _predicted_ position (lead = f(closing speed, distance)),
  using the road network for long-range (route to a node near the player) and direct steering for
  short-range. Respects terrain (no flying); collides physically.
- **Ramming:** within `ramRadius`, close at high speed to apply impact (drives `bust` + player damage).
- **PIT:** a flank unit approaches from the side at angle, taps the shoulder to induce a spin
  (impulse); limited PITs per pursuit per unit.
- **Roadblock:** 2–3 units pull ahead of the player and orient across the travel lane (static), or
  "rolling" (crossing). Placed on a node ahead within `roadblockRange`; count scales with heat.
- **Spike strip:** the **helicopter** (or a ground unit) drops a spike prop at a point ahead of the
  player's path; crossing it flats tires (traction penalty + forced slow) — reuses `SurfaceState`-style
  effect, tier-gated.
- **Rhino block:** a heavy unit wedges directly in front at speed to stop/turn the player (high mass,
  high HP).
- **Helicopter:** flies overhead on a bounded path, maintains a "lock" that boosts ground units'
  detection/accuracy, and drops spikes. Gated off on tier C (and optionally low A).
- **Tier simplification (C):** lower AI update cadence, no lead-prediction (chase current position),
  no PIT/Rhino/heli, reduced unit count.

### 4.7 Wrecking police / immobilized

- Each unit's `CarDamage` map fills from impacts (player ramming it, or units hitting each other/the
  terrain). At the `destroyed` threshold → **wrecked**: removed from play, `+unitBounty(kind)`,
  wrecked prop + smoke (GPU compute on WebGPU; disabled on WebGL2). A unit stuck/spun and slow for
  `immobilizeTime` counts as **immobilized** (also awards bounty once).

### 4.8 Blacklist (15 rivals) + bust race

- **Roster (config):** 15 entries, each `{ rank (15→1), name (fictional), carId (unbadged),
perfTier (accel/top/handling), bountyThreshold, rewardCards, pinkSlipCar }`. Difficulty and
  performance rise as rank → 1. Names/car designs are original (see §10). The #1 is our finale boss
  (the "Black Friday" analogue).
- **Challenge gate:** `careerBounty >= threshold(rank)`.
- **Bust race (three-way):** a bounded structured event. The rival `RivalActor` (a Rapier body with a
  damage map) spawns with you; a heat level is set so **police are present**. Win = **destroy the
  rival's car** (their damage → destroyed) while you are not destroyed/busted. The rival AI: races a
  set course / route _and_ fights back (rams you), and can be pushed toward hazards. Lose = your car
  destroyed or busted → retry.
  - (D6: structure the bust race as (a) two short legs then a "bust" phase, like MW, or (b) a single
    free-form "hunt and destroy" pursuit. I recommend (b) for our open world — simpler and fits the
    seeded roads.)
- **Reward cards:** on success, pick from 3 cards (a **pink slip** for their car → adds it to the
  garage/`PlayerCarModel`-style ownership, plus 2 upgrade/cash/pursuit cards). Pink-slip cars are
  original/unbadged.
- **Boss framing:** the rival is the campaign boss for its tier; the per-heat police boss unit (§4.5)
  is the "boss in every hit level."

### 4.9 Milestones

- **Per-rival** (unlocked post-bust) and **global**, each `{ id, type, target, reward }`, tracked by
  `MilestoneModel` (e.g. "tag N police in one pursuit", "X bounty in one pursuit", "evade in < T",
  "photo ticket > S mph"). Completion toasts via `WorldEventMessage`; rewards = cash/bounty.

### 4.10 Radar & police radio

- **Radar detector:** when any unit is within `radarRadius` and closing and (optionally) behind, fire
  a ping: on-screen icon flash + audio "whoosh", rate-limited. Drives `MostWantedHud`.
- **Minimap blips:** `MostWantedSystem.getBlips()` → `{ kind: police|rival|hide|breaker|roadblock|spike,
x, z, active }[]` fed to `Minimap` on the interval.
- **Radio/scanner:** a scripted event-to-`WorldEventMessage` table (dispatch lines) triggered by
  state changes (heat rise, roadblock placed, spike dropped, backup timer, evade). Audio = synth.

---

## 5. Determinism, world integration & streaming

- **Placement is seeded:** `SeededMwPlacement(region, network, config)` is a **pure** function deriving,
  from `RegionPlan.seed` + generator version, the positions of rival spawn points, hide spots, pursuit
  breakers, and bounty spots **on the road network** (snapped to edges/nodes, at a distance from the
  centerline so they are drivable). Same seed ⇒ same layout, every engine. Follows
  `computeRegionEvents(region, network)` exactly (engine-independent, Node-testable).
- **Police are dynamic & streaming:** active units are bounded and rebase with the floating origin;
  far units retire + dispose; new units spawn within a bounded forward window. No unbounded
  world-wide allocations (the `world` module's "no hidden unbounded allocations" rule).
- **Chunks/colliders:** police use the existing terrain collider queries; spike/roadblock props are
  lightweight instanced colliders installed with the chunk budget.

---

## 6. Core data models & state machines (concrete TS contracts)

```ts
// src/most-wanted/types.ts
export type HeatCooling = 'active' | 'cooling';
export interface HeatState {
  level: number;
  ceiling: number;
  meter: number;
  cooling: HeatCooling;
}

export type PoliceUnitKind =
  'sedan' | 'unmarked' | 'muscle' | 'suv' | 'rhino' | 'motorcycle' | 'heli' | 'cross';
export type PoliceTactic = 'pursuit' | 'ram' | 'pit' | 'roadblock' | 'spike' | 'rhino' | 'lock';

export interface PoliceUnit {
  readonly id: number;
  kind: PoliceUnitKind;
  boss: boolean;
  x: number;
  z: number;
  yaw: number;
  damage: CarDamageMap; // reused from vehicles/CarDamage
  lost: boolean;
  lostTimer: number;
  pitUsed: boolean;
  spikeCooldown: number;
}

export interface BountyState {
  career: number; // lifetime total
  pursuit: number; // this pursuit
  unitsWrecked: number;
}

export interface BlacklistRival {
  readonly rank: number; // 15 (easiest) .. 1 (finale)
  readonly name: string; // fictional, unbadged
  readonly carId: string; // unbadged design id
  readonly perf: { accel: number; top: number; handling: number };
  readonly bountyThreshold: number;
  readonly rewardCards: readonly string[];
  readonly pinkSlipCar: string;
}

export interface MwBlip {
  readonly kind: 'police' | 'rival' | 'hide' | 'breaker' | 'roadblock' | 'spike';
  readonly x: number;
  readonly z: number;
  readonly active: boolean;
}

// MostWantedSystem public surface (composed by Application):
export interface MostWantedSystem {
  update(dt: number, pose: VehiclePose, telemetry: VehicleTelemetry, actions: InputActions): void;
  readonly heat: HeatState;
  readonly bounty: BountyState;
  readonly bust: number;
  readonly activeRival: BlacklistRival | null;
  readonly bustedThisPursuit: boolean;
  getBlips(): readonly MwBlip[];
  radioMessage(): WorldEventMessage | null; // drained by the toast system
  challengeNextRival(): void; // gated on bounty
  save(): MostWantedSave;
  load(s: MostWantedSave): void;
  dispose(): void;
}
```

State machines (all in PURE modules, fully Node-tested):

- **Heat:** `idle → (crime) → filling → (meter=1) → level↑ → filling … ; (evade) → cooling → (crime) → filling`.
- **Pursuit:** `none → active (units>0) → evading (all lost) → cooled ; active → busted`.
- **Bust meter:** `0..1`, monotonic per the §4.3 rule; `=1 → busted` event.
- **Blacklist:** `locked(rank) → ready (bounty ok) → in-bust-race → busted(rank) → next`.

---

## 7. Performance & tier budgets (C/B/A) — everything expensive tier-gated

Config in `src/config/most-wanted.ts`, declared C/B/A per the VISUAL_TARGET §3 convention:

| Capability                        | C                               | B              | A                      |
| --------------------------------- | ------------------------------- | -------------- | ---------------------- |
| Max active police units           | 4                               | 8              | 12 (15 for boss heats) |
| AI update cadence                 | every 3rd tick, no lead-predict | every 2nd tick | every tick             |
| PIT / Rhino / roadblocks          | no                              | PIT+roadblock  | all tactics            |
| Spike strips                      | no                              | yes            | yes                    |
| Helicopter                        | **off**                         | 1 (lock only)  | 1–2 (lock + spikes)    |
| Reinforcements                    | reduced                         | yes            | full                   |
| Impact sparks/smoke (GPU compute) | off                             | on (WebGPU)    | on (WebGPU)            |
| Minimap blips + HUD               | on (interval)                   | on             | on                     |
| Siren/poly audio voices           | 1                               | 3              | 5                      |

- **No CPU particle fallback** (WebGL2 disables GPU-compute effects, per invariant).
- Bounded AI cost: only active units step; steering is cheap (no pathfinding per frame beyond
  node-target selection, which is throttled). Physics bodies are bounded and removed on despawn.
- The sandbox (SwiftShader) **asserts correctness, never frame rate**; a named-device perf capture
  is recorded separately before any perf claim (per AGENTS.md).

---

## 8. Rendering (TSL-only, no ShaderMaterial/RawShaderMaterial/onBeforeCompile)

- **Police meshes:** unbadged, code-authored (reuse the `GpuTrafficWorld` code-authored geometry
  approach — sedan/muscle/SUV/Rhino/motorcycle/heli shapes), instanced per class where static,
  dynamic per unit for the active set. Rapier convex/box colliders (one per unit; no per-part).
- **Light bars / sirens:** TSL emissive + a small number of tier-capped point lights (within the
  existing Aohara light cap; partitioned so the city budget isn't exceeded). Rotating-beam look via
  TSL (no bloom).
- **Spike strip / roadblock props:** instanced TSL props.
- **Wreck FX:** impact sparks + smoke via the existing GPU-compute particle path (WebGPU); disabled
  on WebGL2.
- **Helicopter:** separate mesh + rotor spin (TSL/animated), no shadows on low tiers.

---

## 9. Audio (project Web-Audio synth + CC0; no EA material)

- Sirens (per active unit, distance/pan, tier-capped), police radio **scanner** (synth tones +
  optional CC0 "radio-speak" one-liners), **bust stinger**, **evade chime**, **bounty tick**,
  **helicopter rotor**, **spike** "thump". All through the existing Web Audio engine; CC0 pools with
  attribution where used (CREDITS.md). No ripped NFS audio.

---

## 10. Roster & unbadged vehicle design (original, per asset policy)

- **15 Blacklist rivals:** original fictional identities + original unbadged car silhouettes, tiered
  by performance. We use the NFS MW **difficulty curve** (rival perf rises toward rank 1) and the
  _archetypes_ as inspiration, but names/designs are ours. The finale (#1) is our "Black Friday"
  analogue — a flagship supercar silhouette. Each maps to a `perf` tier and a `pinkSlipCar`.
  - Names are provisional (to be finalized with you): e.g. a low-key commuter rival up to a
    syndicate boss; all fictional, Hinode-flavored, unbadged.
- **Police units:** 8 unbadged classes (sedan, unmarked sedan, state muscle, patrol SUV, Rhino
  armored unit, motorcycle, van, helicopter). No real badges/logos; a generic light-bar + livery
  (our own color scheme).
- **Asset pipeline:** all geometry authored or CC0-sourced through the existing pipeline
  (optimize → LODs → meshopt → KTX2 → budget check) with a licence record + manifest entry + CREDITS.
  (Most police geometry is expected to be **code-authored** to avoid asset risk.)

---

## 11. Testing strategy (Node logic tests — honest scope)

Unit tests (pure, headless) for: `HeatModel` (crime→level, ceiling gate, cool-down decay),
`BountyModel` (rates, per-unit, thresholds), `BustMeter` (fill/drain, busted trigger), `EvadeModel`
(all-lost, evade confirm, breaker/hide), `SeededMwPlacement` (determinism: same seed ⇒ same positions;
positions snapped to drivable road points), `PoliceAI` decisions (PIT trigger, roadblock placement,
reinforcement timer, tier gating), `Blacklist` (gate, bust win/lose, reward cards, pink slip,
impound strikes), `most-wanted-save` (load/save round-trip). Integration test: `MostWantedSystem`
composed in a headless Application steps heat→spawn→despawn→evade without throwing and respects caps.
**Not provable headless** (recorded, done on device): pursuit feel/AI quality, light-bar/siren
rendering+audio, 60 FPS.

---

## 12. Implementation roadmap (each = one coherent, pushed increment with acceptance)

1. **Config + types + seeded placement** (`src/config/most-wanted.ts`, `types.ts`,
   `SeededMwPlacement`) + determinism tests + a debug overlay (behind a flag). No behavior yet.
2. **Heat model + crimes + wanted HUD** (heat bar/level badge, 911 trigger, radio toasts) — heat
   rises from speed/collision/ram; HUD updates on interval.
3. **Police force v1**: unbadged sedan units, pursuit + basic ram, spawn/despawn by heat, **radar
   detector + minimap blips**.
4. **Player-vs-police**: bust meter, busted flow, fines, impound strikes, **evade + cool-down**.
5. **Wrecking police**: unit damage (reuse CarDamage), bounty per unit, wrecked prop + FX.
6. **Tactics escalation**: PIT, roadblocks, spike strips, Rhino, motorcycle, reinforcements, and the
   per-heat **boss unit**.
7. **Helicopter** (A-tier; lock + spikes) + tier gating.
8. **Hide spots + pursuit breakers** + evade completion paths.
9. **Bounty system** (rates, career + per-pursuit, HUD) + **challenge gate**.
10. **Blacklist + bust race** (15 rivals, three-way bust, reward cards, pink slip/ownership).
11. **Milestones** (per-rival + global) + rewards.
12. **Persistence** (save/load, new game, "Police intensity" preference).
13. **Radar/minimap polish + police radio + siren audio.**
14. **Tier tuning (C/B/A) + perf profiling + diagnostics.**
15. **Content pass**: finalize 15 rival identities + car designs (unbadged), balance pass.
16. **Docs** (ADR + PROJECT_PLAN §9 phase section + SESSION_HANDOFF), full `npm run check`, deploy.

Milestones 1–3 are the "prove the loop" spine (see heat → chase → evade). Each lands with its tests,
is committed + pushed + SHA-verified, and `npm run check` is green before the next.

---

## 13. Risks

- **Scope/perf:** a live police pursuit + rival + FX on mobile (tier C) is the hard part; the tier
  table (§7) + bounded actors + no-pathfinding-per-frame is the mitigation. Risk that "exactly like
  NFS MW" polish (PIT feel, helicopter drops) is expensive to tune.
- **AI quality:** steering/PIT/roadblock feel needs iterative tuning on device; the sandbox can't
  prove it (SwiftShader). Budget iteration for AI tuning.
- **Content volume:** 15 unbadged car designs + 8 police classes + tuning is the long tail; code-
  authored geometry keeps it feasible and asset-risk-free.
- **Determinism vs. fun:** fully-seeded placement is required; we keep _spawns_ seeded but unit
  _behavior_ may be seeded-but-stochastic within a pursuit (documented) so replays aren't identical
  in feel while the world stays deterministic.
- **Phase gate:** nothing ships gameplay code without Phase 10 authorization (D1).

---

## 14. Decisions I'm making by default (call out any you want changed)

- **A:** One dedicated `src/most-wanted/` feature module composed by `Application`.
- **B:** Police are a separate bounded Rapier actor set (not in the GPU traffic pool).
- **C:** 15 rivals; difficulty curve mirrors NFS MW; all cars fictional/unbadged.
- **D:** Heat ceiling = 1 + rivals busted (capped 15); bounty is a career-total gate.
- **E:** Bust race = single free-form "hunt-and-destroy" three-way (not two-leg), fits seeded roads.
- **F:** Hide spots have a use/cooldown to prevent camping.
- **G:** No multiplayer, no race-economy hub, no tuning shop (pink slip only) unless authorized.

## 15. Open decisions for you (D1–D6)

- **D1:** Authorize **Phase 10 — Most Wanted** as its own gated phase? (or fold into Phase 9?)
- **D2:** Confirm heat-ceiling mapping (`1 + busted`) and the 1–15 level range, or prefer fewer
  "feel" levels (e.g. 1–6 like the base game) with the rest as Black Edition-style extras?
- **D3:** Challenge gate on **career bounty** vs. **single-pursuit bounty**? (I recommend career.)
- **D4:** Impound severity — with our single hero-car flow, is a 3-strike full impound right, or
  should it be a "repair + fine" that can't fully remove the car?
- **D5:** Hide-spot anti-camp rule (cooldown length / uses-per-pursuit)?
- **D6:** Bust-race structure: free-form hunt (recommended) vs. two-leg + bust phase?

---

## 16. Next step

Once D1–D6 are answered (or you accept the defaults in §14), I will: (1) add the ADR + a PROJECT_PLAN
§9 phase section for Phase 10, (2) implement **milestone 1** (config + types + seeded placement +
tests + debug overlay) as the first pushed increment, then proceed through §12 in order.
