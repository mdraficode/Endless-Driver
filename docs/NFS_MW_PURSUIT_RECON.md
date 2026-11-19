# NFS Most Wanted (2005) — Police Pursuit Recon

Reference pass for the Endless-Driver Phase 10 pursuit AI. This is a _behavioral_ recon of how
the real chase works, used to build an **original, clean-room** implementation (matching the
feel/mechanics, not copying EA's code or assets). Compiled from community walkthroughs, the
fan wiki, and player reports.

## Heat levels → police "conditions" (unit roster)

The real game has 6 standard heat levels (7 in the Black Edition challenge; 10 were built, only
7 shipped). Higher levels unlock as Blacklist rivals are busted:

| Level | Force                 | Units (per the real game)                              | New tactics                                             |
| ----- | --------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| 1     | District / City       | Marked cruisers (Crown-Vic-like)                       | Just chase; run you off the road                        |
| 2     | District              | + Unmarked (black) cruisers                            | **Roadblocks** (weak), boxing, ramming                  |
| 3     | State                 | Marked GTO state cruisers + **Light Rhino SUVs**       | **P.I.T.**, rolling roadblocks, Rhino head-on ram       |
| 4     | State (undercover)    | Unmarked GTOs + **Heavy Rhinos** + **helicopter**      | **Spike strips**, roadblocks with Rhinos, heli spotting |
| 5     | Federal               | Corvette federal cruisers + Cross's Street Racing Unit | All of the above, more aggressive, Rhinos in pairs      |
| 6     | Cross's SRU           | Cross leads, Supercharged Rhinos                       | Full escalation                                         |
| 7+    | (Black Ed. challenge) | Rhinos only                                            | —                                                       |

- **Rhino** = the armored SUV "head-on collision expert": rams you head-on → instant stop,
  pushed backwards, or a rollover. Light (L3, no bull bar), Heavy (L4–5, bull bars, used for
  roadblocks, 1 at L4 / pairs at L5), Supercharged (L6, high speed).
- **Heat unlocks by Blacklist** (real game): L3 after rival #13, L4 after #9, L5 after #5,
  L6 after #1 (the boss). Our simplified ceiling (`1 + rivals busted`, D2) approximates this.

## Police maneuvers

- **Stationary:** **Roadblock** (block the road ahead), **Spike strips** (L4+; hitting one ≈ busted).
- **Moving:** **Pinning** (push you into a wall), **Rolling Block** (surround + brake),
  **P.I.T.** (Precise Immobilization Tactic — shove a rear wheel to spin you), **Rhino** ram.

## Evading / cooldown (the core loop)

- You shake the police by **disabling units** (ramming them off), **gaining distance**, or
  **Pursuit Breakers** (environmental traps — e.g. smashing a gas station — that total N police).
- Losing the police does **not** end the pursuit → you enter **COOLDOWN** ("evading"/searching).
  Reinforcements pause; you must **hide and stay out of sight** for a period.
- **Cooldown is longer at higher heat.** It drops **much faster with the engine off** (L-stick)
  and faster inside a **Hiding Spot** (marked on the minimap during cooldown; quicker cooldown +
  no detection while inside).
- If you're **spotted again** during cooldown, you're re-pursued and the heat re-rises.
- The pursuit **ends** when the cooldown completes (successful escape) or you're **busted**
  (overwhelmed / boxed / spike strip).
- **Reinforcements:** when only ~1–2 units remain, backup is called and N new units arrive after
  a delay (scales with heat).

## HUD + radio

- During a pursuit the HUD adds a **pursuit bar** (units in pursuit, evaded, taken out),
  highlights police on the minimap, and shows the heat level.
- Authentic police-radio codes: `10-39` P.I.T., `10-44` call for Rhinos, `10-65` vehicle box,
  `10-67` spike strip, `10-71` helicopter, `10-73` stationary roadblock, `10-75` rolling block,
  `10-83` lost racer / on the lookout, `10-87` in pursuit, `10-32` wanted racer, `10-25` unit down.

## Sources

- NFS MW Pursuit system — Wikibooks / fan wiki (heat levels, conditions, tactics, cooldown).
- Rhino SUV + Hiding Spot — nfs.fandom.com.
- Walkthroughs (GameFAQs/Grawl, BurlyBrawler) — police maneuvers, radio codes, heat-unlock map.
- Player reports (Reddit, TechEnclave, TrueAchievements) — reinforcement timing, engine-off
  cooldown, spike-strip bust, pursuit bar, heat-by-Blacklist.
