# Asset and Licensing Policy

## Current inventory

`public/assets/manifest.json` contains an empty versioned asset list. No car model, environment texture, building/tree/rock model, sound, HDRI, or third-party shader has been acquired or committed.

The project's initial `UNLICENSED` status does not replace or remove dependency licenses. Choosing an open-source project license later does not automatically permit redistribution of purchased or restricted assets.

## Before adding an asset

1. Identify the creator, original source, and exact license or purchase terms.
2. Verify rights to use, modify, self-host, and redistribute within a downloadable web build/repository as appropriate.
3. Determine required attribution, share-alike conditions, commercial-use restrictions, and whether source distribution is forbidden.
4. Check separate trademark/brand, music, voice, and other rights. A realistic branded car model may have additional restrictions.
5. Save appropriate license/credit evidence and inventory metadata. Never include purchase credentials or receipts containing private payment details in Git.
6. Obtain user approval for paid assets, asset-source decisions, or additional accounts/services.
7. Normalize units, axes, pivots, node names, and material maps; document modifications.
8. Optimize, measure, and test the asset against the target device tier.

Do not infer that an image-search result, marketplace download, or publicly viewable GLB is free to redistribute. Prefer owned content or clearly compatible licenses such as verified CC0 when appropriate.

## Manifest contract to extend during asset loading

The current manifest is intentionally minimal. Add a loader/schema as assets appear. Each actual entry should record:

- Unique asset identifier and kind.
- Relative runtime path(s), format, and content/version identifier.
- Original source URL and creator.
- License name/link or internal approved-license reference.
- Required attribution and redistribution status.
- Modifications, authoring scale/axes, and relevant node bindings.
- Approximate file size, texture dimensions, and intended quality/LOD tier.
- Decoder/transcoder requirements and where the self-hosted decoder lives.

Any examples in documentation are examples, not authorization for a specific download.

## Car model contract — Phase 4

- GLB preferred for packaging; external GLTF resources allowed only when paths are tracked and deployment-safe.
- Normalize to meters, +Y up, +X right, and local -Z forward.
- Resolve four wheel nodes, front steering pivots, an optional interior steering wheel, brake-light material/meshes, and cockpit camera anchor.
- Keep chassis collision geometry independent and simple; do not use the detailed render mesh as a dynamic triangle collider.
- Provide a placeholder/error fallback for missing files or nodes.
- Interior detail must support cockpit view or the view's limitations must be explicitly documented.

## Optimization and hosting

- Use relative same-origin paths; avoid undeclared CDN runtime dependencies.
- Prefer small GLBs, appropriate material counts, mesh LOD, and instanced environment assets.
- Keep color-space metadata correct for base color/emissive versus linear material maps.
- Consider KTX2/Basis and mesh compression only with measured benefit and compatible self-hosted decoder setup.
- Do not commit generated dependency/build directories as a way to preserve assets.
- Record texture/mesh memory estimates and mobile fallbacks.

## Large-file Git policy

Git LFS is **not enabled in the initial scaffold**. Before enabling it, verify client installation, the actual dedicated repository's support, budget/quotas, and collaborators' clone workflow.

Do not add LFS filters blindly and leave only unresolved pointers. Do not commit large asset packs when only a few optimized runtime files are needed. Existing assets should never be moved or history-rewritten without user approval. GitHub's file/repository limits must be checked when large assets are proposed.

## Credits and release gate

Create/update an attribution file as soon as the first asset requires credit. Before release, verify the inventory against files actually distributed, include required notices, and document any non-redistributable source assets. No public release or deployment is authorized by this initial setup.
