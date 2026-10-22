# Asset and Licensing Policy

## Current inventory

`public/assets/manifest.json` currently contains 19 pinned CC0 runtime entries at the verified PBR baseline: three HDRIs, nine 1K PBR surface sets, one colour-grading LUT, and six optimized environment models (44,913,263 asset bytes). The selected MMC Works Generic Sport Coupé Car is not yet in the manifest or runtime; it is a CC BY 4.0 candidate pending the reproducible FBX-to-GLB pipeline, attribution UI, and validation. The current in-house player roadster remains the runtime fallback. The manifest, `CREDITS.md`, and [`docs/ASSET_SOURCES.md`](ASSET_SOURCES.md) remain the source/provenance records.

The project's initial `UNLICENSED` status does not replace or remove dependency licenses. Choosing an open-source project license later does not automatically permit redistribution of purchased or restricted assets.

## Standing rule (owner amendment 2026-10-23; ADR 0008 supersedes hero CC0-only rule)

**Free/open only. No purchases, fees, or paid credits.** CC0 remains preferred. A free licence that clearly permits the project's intended use, modification, self-hosting, and redistribution—including CC BY 4.0 with required attribution—is eligible for hero content. NC/ND, marketplace-freebie, paid, paywalled, or otherwise incompatible terms remain excluded. AI-generated and free account-gated sources are permitted only after exact-item verification and owner approval for any new account. Trademark, trade-dress, and recognizable real-vehicle design rights remain separate from copyright licensing; logos, badges, plates, and uncleared recognizable designs must be absent or separately cleared.

On 2026-10-23 the owner selected MMC Works' [Generic Sport Coupé Car](https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882), displayed as CC BY 4.0, and supplied the sanitized archive. Four local views show no visible exterior logo/badge/plate and no unambiguous production-car identity; the internal name `ModelLbmw` and the creator's separate BMW M3 E46 project are cautions, not proof. Treat the visual gate as provisional and stop if closer geometry review identifies a real-car design. Keep the neutralized dashboard media. The source archive is hash-pinned and remains an uncommitted build input; the optimized GLB, manifest entry, and both required attribution paths are still pending. Until then, keep the in-house roadster active as fallback.

## Preferred sources (visual-fidelity re-plan, 2026-10-14)

The owner requires Forza-Horizon-class visuals, which makes sourcing a first-class planning input
(see `docs/RESEARCH_AAA_FIDELITY.md` §5 and `docs/VISUAL_TARGET.md`):

- **CC0 first** for environment content: Poly Haven (HDRIs, PBR textures, models) and ambientCG.
  CC0 still gets recorded in the manifest — "no attribution required" is not "no provenance".
- **Free account-gated and AI-generated sources:** allowed only after owner approval and exact-item review under ADRs 0007–0008. A free download is not automatically redistributable; verify the exact licence, modifications, self-hosting and redistribution rights. CC0 is preferred; compatible CC BY 4.0 is also accepted for the selected hero with attribution. No paid plans, subscriptions, upgrades, credits, or unapproved accounts. Fab/Megascans remains excluded where its terms are incompatible.
- **Cars:** never use ripped/converted game meshes. The selected hero is MMC Works' Generic Sport Coupé Car (CC BY 4.0); it remains pending the reproducible pipeline and runtime gates. Preserve the sanitized media and `CarVisual` fallback; require no visible branding and stop if closer review identifies a specific real-car design. See ADR 0008 and `docs/ASSET_SOURCES.md` §3.5.
- Audio, if it is ever added, follows the same rules and needs its own scope decision.

## Before adding an asset

1. Identify the creator, original source, and exact license or purchase terms.
2. Verify rights to use, modify, self-host, and redistribute within a downloadable web build/repository as appropriate.
3. Determine required attribution, share-alike conditions, commercial-use restrictions, and whether source distribution is forbidden.
4. Check separate trademark/brand, music, voice, and other rights. A realistic branded car model may have additional restrictions.
5. Save appropriate license/credit evidence and inventory metadata. Never include purchase credentials or receipts containing private payment details in Git.
6. Obtain owner approval for new sources and account creation/use; no paid assets, plans, subscriptions, credits, or upgrades are authorized.
7. Normalize units, axes, pivots, node names, and material maps; document modifications.
8. Optimize, measure, and test the asset against the target device tier.

Do not infer that an image-search result, marketplace download, or publicly viewable GLB is free to redistribute. Prefer owned content or clearly compatible licenses such as verified CC0 when appropriate.

## Manifest contract for asset acquisition

The runtime manifest and loader are established. Every new entry must continue recording:

- Unique asset identifier and kind.
- Relative runtime path(s), format, and content/version identifier.
- Original source URL and creator.
- License name/link or internal approved-license reference.
- Required attribution and redistribution status.
- Modifications, authoring scale/axes, and relevant node bindings.
- Approximate file size, texture dimensions, and intended quality/LOD tier.
- Decoder/transcoder requirements and where the self-hosted decoder lives.
- The optimization chain and non-default settings used to produce the runtime file (so the pipeline
  is reproducible rather than a hand-edited asset of unknown provenance).

Any examples in documentation are examples, not authorization for a specific download.

## Car model contract — Phase 6

- The selected hero is MMC Works' Generic Sport Coupé Car under CC BY 4.0; see ADR 0008 and `docs/ASSET_SOURCES.md` §3.5. The owner-provided neutral-screen archive is the source input; verify its exact SHA-256 before conversion.
- Convert the FBX reproducibly to a GLB, preserving PBR materials, sanitized dashboard media, separate wheel assemblies, and four named physics-driven wheel pivots. Normalize the source axes to +Y up / local -Z forward and align each wheel to `VEHICLE_CONFIG` in metres.
- Keep `CarVisual` as the deterministic fallback. Imported loading must fail soft to it; do not replace the fallback until the pipeline, manifest, runtime load, and automated checks pass.
- Keep chassis collision geometry independent and simple; never use the detailed render mesh as a dynamic triangle collider.
- Attribute the creator and source, link CC BY 4.0, and state modifications in generated `CREDITS.md` and the in-game credits view before public distribution.
- The open cabin is part of the selected model; cockpit-camera and owner-device acceptance remain separate Phase 6 items.

## Optimization and hosting

- Use relative same-origin paths; avoid undeclared CDN runtime dependencies.
- Every asset goes through the project pipeline (`gltf-transform`-based): prune/dedupe → LODs →
  quantization → **meshopt** geometry compression → **KTX2/Basis** textures → budget check. Custom
  one-off exports are not accepted; the chain and its settings are recorded per manifest entry.
- Budgets per asset class are enforced in review: hero car 100k–200k triangles with halving LODs;
  props ≤ 5k; textures capped at 1024/2048 (a single uncompressed 4096² RGBA8 texture costs ~89 MB
  of GPU memory); vegetation through atlases and impostors.
- Prefer small GLBs, appropriate material counts, mesh LOD, and instanced environment assets.
- Keep color-space metadata correct for base color/emissive versus linear material maps.
- KTX2/Basis is the default for GPU textures, with `KTX2Loader.detectSupport(renderer)` deciding the
  fallback path; meshopt is preferred over Draco on the web because decoding is much faster.
- Do not commit generated dependency/build directories as a way to preserve assets.
- Record texture/mesh memory estimates and mobile fallbacks.

## Large-file Git policy

Git LFS is **not enabled in the initial scaffold**. Before enabling it, verify client installation, the actual dedicated repository's support, budget/quotas, and collaborators' clone workflow.

Do not add LFS filters blindly and leave only unresolved pointers. Do not commit large asset packs when only a few optimized runtime files are needed. Existing assets should never be moved or history-rewritten without user approval. GitHub's file/repository limits must be checked when large assets are proposed.

## Licence register

Alongside the manifest, every acquisition is recorded in a licence register: asset id, source URL,
creator, licence name and version/date, redistribution and modification rights, required
attribution text, and where the proof (licence page or receipt reference, never payment details) is
stored. An asset without a register entry does not enter the repository, and the register is
reviewed at the same gate as the manifest. Anything whose terms cannot be confirmed is replaced,
not "kept for now".

## Credits and release gate

[`CREDITS.md`](../CREDITS.md) is the attribution file. It is written by the same script that writes the manifest, so
a licence entry and its credit line land in the same commit and cannot drift from what ships. CC0 assets are credited
there anyway (out of respect, not obligation); CC-BY entries carry the required credit line and appear in the
in-game credits screen.

Create/update an attribution file as soon as the first asset requires credit. Before release, verify the inventory against files actually distributed, include required notices, and document any non-redistributable source assets. No public release or deployment is authorized by this initial setup.
