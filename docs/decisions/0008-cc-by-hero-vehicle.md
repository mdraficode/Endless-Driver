# CC-BY-eligible hero vehicle and selected generic coupé

**Status:** Accepted 2026-10-23 (owner instruction)  
**Date:** 2026-10-23  
**Scope:** Hero-vehicle licence eligibility and the selected model candidate  
**Supersedes:** ADR 0005 §1/§4 and ADR 0007 §3/§4 only where they require CC0-only hero vehicles. All no-purchase, source-verification, attribution, and brand/design restrictions remain in force.

## Context

The owner directed: **“Integrate the model.”** The earlier CC0-only hero rule was relaxed: free licences that clearly permit the intended use, modification, self-hosting, and redistribution are acceptable, including CC BY 4.0 with its required attribution. No purchase, paid plan, or new source account is authorized.

The selected item is MMC Works' [Generic Sport Coupé Car](https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882), whose Sketchfab listing describes a generic sports coupé, identifies the creator, and displays Creative Commons Attribution (CC BY 4.0). The owner supplied `/home/user/hero-car-candidate-neutral-screen.zip`, a 79,563,959-byte archive with SHA-256 `222b8a9322a94305a5065d9adb56836c93451f040baea45dca4e774ba8f178e6`. Its included attribution note records replacement of the BMW-branded dashboard media with a neutral screen texture; no other source files were changed in that archive.

## Decision

1. **Licence eligibility.** CC0 remains preferred, but a free licence such as CC BY 4.0 is eligible for hero content when the exact item and source archive permit the project's intended modification, self-hosting, and redistribution, and all required credit is supplied. Non-commercial/no-derivatives, paid, paywalled, marketplace-freebie, or otherwise incompatible terms remain excluded.
2. **Selected model.** Integrate the generic MMC Works coupé as the player hero car, subject to the engineering and visual gates below. The code-authored `CarVisual` remains a fallback until the imported model is loaded and validated; collision geometry and vehicle physics stay independent of the render mesh.
3. **Brand/design gate.** The four local review renders show no visible exterior logo, badge, or plate, and no unambiguous production-car identity. The FBX-internal name `ModelLbmw` and the creator's separate BMW M3 E46 project are cautions, not proof that this candidate depicts that car. This is a visual screening result, not legal clearance. Stop integration if closer geometry review reveals a specific real-car design or uncleared branding.
4. **Sanitized media.** Keep the neutralized dashboard media texture. Do not restore or redistribute the BMW-branded screen texture.
5. **Pipeline.** Build a reproducible, hash-checked FBX-to-GLB derivation that preserves PBR materials, all four wheel pivot/steering/spin bindings, and the sanitized media; produce measured LODs and optimized KTX2/meshopt output. The asset is not runtime-accepted until automated checks and project-level visual/runtime validation pass.
6. **Attribution.** The manifest, generated `CREDITS.md`, and the in-game credits view must carry a credit identifying “Generic Sport Coupé Car” by MMC Works, linking to the Sketchfab source and CC BY 4.0, and stating the modifications. Attribution remains required even though the project is personal/noncommercial.

## Consequences

- The hero-content rule is now CC0-preferred rather than CC0-only; this amendment does not clear recognizable brands, badges, number plates, or real-car trade dress.
- A CC-BY hero asset adds attribution obligations to both project records and the shipped game UI. If either credit path is missing, the asset must not be publicly distributed until it is restored.
- The selected model's visual gate is provisionally clear from the four-view review, but integration, optimization, runtime loading, and final in-game validation remain work in progress.
- The owner-provided source archive is the build input; the pipeline must verify its exact hash before conversion. Do not commit the large source archive merely to make the build run; keep it in the documented source cache/input path and commit the optimized runtime GLB plus small sanitization patch if needed.
