# Asset loading and ownership

**Status:** Phase 3 started — the manifest-driven load path and the first verified asset set exist; model loading,
LOD selection, and shared-resource reference counting arrive with the assets that need them (Phases 4–6).

## Responsibility

Manifest-driven loading, GLB node normalization, shared-resource reference ownership, errors/fallbacks, and
disposal.

## Implemented

| File               | Responsibility                                                                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AssetManifest.ts` | Reads `public/assets/manifest.json` (written by `scripts/fetch-assets.mjs`), resolves an HDRI by manifest id, and loads it as a linear half-float reflection texture. A missing or unreachable asset is reported and the caller falls back — the scene keeps rendering with the procedural sky and the sun |

The manifest is the only path by which an asset can reach the renderer, which is what keeps `CREDITS.md` and
`docs/ASSET_SOURCES.md` true: an asset that the pipeline did not fetch and hash cannot be referenced.

## Planned work

GLB/GLTF loading with node normalization and material translation, meshopt/KTX2 compressed variants, asset pools
with reference-counted release (Phases 4–6, per `docs/ASSET_POLICY.md`). Image-decoding work moves to a worker
when the first heavy asset lands.

See [the project plan](../../PROJECT_PLAN.md) and [architecture](../../docs/ARCHITECTURE.md).
