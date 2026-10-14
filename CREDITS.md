# Credits and attributions

This file lists every third-party asset in Endless Driver, its creator, its licence, and — where a licence requires
it — the credit line that must appear in the shipped game's credits screen.

**Licence policy:** CC0-first, no purchases. CC-BY is an exception used only where no CC0 asset of comparable
quality exists, and those entries carry a required credit line. See
[`docs/ASSET_POLICY.md`](docs/ASSET_POLICY.md) and [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md).

**Nothing is listed here yet.** No asset has been acquired or committed. This file becomes accurate the moment the
Phase 3 asset pipeline lands: `scripts/fetch-assets.mjs` writes the manifest entry and appends the credit line here
in the same commit, so the register cannot drift from what actually ships.

---

## Required credit lines

_None yet._ CC-BY entries will appear in this exact format:

```text
"<Asset name>" by <Creator> — <Source URL> — <Licence> (modifications: <summary>)
```

## Assets used

All assets below are CC0 (public domain). Attribution is not required by the licence; the creators are
listed because their work deserves the credit, not because the licence asks for it.

- **Bamboo Tunnel — 1K HDR** — Dimitrios Savva, Jarod Guest — [source](https://polyhaven.com/a/bamboo_tunnel) — CC0-1.0
  - file: `assets/hdri/bamboo_tunnel_1k.hdr`
- **Cedar Bridge Sunset — 1K HDR** — Greg Zaal — [source](https://polyhaven.com/a/cedar_bridge_sunset_1) — CC0-1.0
  - file: `assets/hdri/cedar_bridge_sunset_1k.hdr`
- **Ninomaru Teien (Tokyo garden) — 1K HDR** — Greg Zaal — [source](https://polyhaven.com/a/ninomaru_teien) — CC0-1.0
  - file: `assets/hdri/ninomaru_teien_1k.hdr`
- **Boulder 01 — 1K scanned prop** — James Ray Cock — [source](https://polyhaven.com/a/boulder_01) — CC0-1.0
  - file: `assets/models/boulder-01.glb`
- **Japanese Cedar Planks — 1K PBR set** — Rob Tuytel — [source](https://polyhaven.com/a/japanese_cedar_planks) — CC0-1.0
  - file: `assets/textures/japanese_cedar_planks_1k_diff_1k.jpg`, `assets/textures/japanese_cedar_planks_1k_nor_gl_1k.jpg`, `assets/textures/japanese_cedar_planks_1k_rough_1k.jpg`, `assets/textures/japanese_cedar_planks_1k_arm_1k.jpg`

`retrieved` and `sha256` for each file are recorded in `public/assets/manifest.json`.
