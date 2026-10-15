# Route baseline — the accepted reference captures

The 12 fixed bookmarks of the 2 km validation route (`src/config/route.ts`), captured on tier B
with the shipped post chain, at 800×500. These are the pictures every later phase re-shoots and
diffs (`docs/VISUAL_TARGET.md` §4, `docs/REALISM_PLAN.md` §5).

**Conditions of this set** (also recorded per capture in `manifest.json`): WebGL2 fallback
backend, headless Chromium under SwiftShader, height-aware fog on, dynamic resolution pinned
(`?res=1`), frozen clock per bookmark. SwiftShader renders the same shaders as a GPU, so the
set is a valid _structural_ reference — framing, exposure, colour, fog — and says nothing about
frame rate, which only named hardware can.

## Regenerate or compare

```sh
npm run build && npx vite preview --port 4173
npm install --no-save playwright && npx playwright install chromium   # once, tooling only
node scripts/capture-route.mjs                  # compare; exit 1 below SSIM 0.97
node scripts/capture-route.mjs --baseline       # accept a new baseline (rewrites this folder)
node scripts/capture-route.mjs --stability      # + TAA on/off temporal-stability bursts
```

A baseline is only ever rewritten deliberately, in the same commit as the rendering change that
moved the pictures, with the reason in the commit message. Silent drift is the failure this
folder exists to catch.

## Regeneration log

- **2026-10-15 (second set):** regenerated because tier B's chain gained screen-space
  contact shadows (`src/shaders/contact-shadows.ts`) — the deliberate-rewrite case this
  README exists for. Self-consistency on the new set: start-noon 0.9999, canopy-dawn
  0.9989, summit-night 0.9812, exit 0 (night sits lowest: near-black frames converge
  with more TAA variance, still above the 0.97 gate).

## What the numbers said when this set was accepted (2026-10-15)

- Self-consistency: re-capturing three bookmarks scored SSIM 0.9999–1.0000 against this set.
- Temporal stability (12-frame bursts, static camera, clouds held): TAA off is exactly 0.000
  under a deterministic software renderer; TAA on measured flat σ 0.048 (start) / 0.436
  (canopy, p95 3.3 at the thin posts). Read the handoff before quoting these — a static burst
  on SwiftShader measures jitter convergence, not the in-motion shimmer TAA exists to fix.
