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

_None yet._

## Libraries and tooling already in use

| Dependency                             | Licence    | Notes                                  |
| -------------------------------------- | ---------- | -------------------------------------- |
| three.js                               | MIT        | Renderer, loaders, TSL node materials  |
| Rapier (`@dimforge/rapier3d-compat`)   | Apache-2.0 | Sole physics authority                 |
| Vite, TypeScript, Vitest, Tailwind CSS | MIT        | Build, type checking, tests, UI styles |

## Fonts (planned, Phase 3)

| Font           | Licence     | Use                     |
| -------------- | ----------- | ----------------------- |
| Noto Sans JP   | SIL OFL 1.1 | Japanese signage and UI |
| Inter          | SIL OFL 1.1 | Latin UI                |
| JetBrains Mono | SIL OFL 1.1 | Diagnostics overlay     |

## Attribution-free sources we still credit

CC0 does not require attribution. Where a library or creator is credited in this file despite that (Poly Haven,
ambientCG, Kenney, Quaternius, KayKit and others), it is done because their work deserves the mention — never
because the licence demands it.
