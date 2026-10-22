# AI-generated and free account-gated asset policy amendment

**Status:** Accepted 2026-10-22 (owner instruction)  
**Date:** 2026-10-22  
**Scope:** All future asset sourcing and project work  
**Supersedes:** ADR 0005 §1's blanket exclusion of AI-generated galleries and account-gated sources, and ADR 0004 §5's no-account-gated-model constraint, only to the extent stated below. All other ADR 0004/0005 decisions, including the existing license hierarchy, remain in force.

## Context

The owner originally required free/open-only sourcing and excluded AI-generated galleries and account-gated downloads. On 2026-10-22, after selecting a generic Meshy red supercar candidate, the owner explicitly directed that the rule be changed for all future project work and authorized a free Meshy account. This amendment allows those two source categories without relaxing the no-purchase, license, brand-rights, or reproducibility requirements.

## Decision

1. **No purchases or fees.** No asset purchases, subscriptions, paid plans, upgrades, paid API access, or paid credits. Free account-gated assets are permitted only where the owner has approved the account/source. Never ask the owner to buy an asset.
2. **AI-generated sources are permitted.** AI origin is not, by itself, a disqualifier. Record the platform, exact item URL, displayed creator/uploader, AI-generated status, model/version or other provenance the source provides, date accessed, and the license evidence.
3. **Verify the exact item.** A gallery-wide promise or platform-level FAQ is not a substitute for the exact item's license. The exact item must meet the standing license hierarchy: CC0 is preferred; CC-BY remains an attributed exception only for suitable non-hero content when no comparable CC0 asset exists; hero vehicle content remains CC0-only; NC/ND, marketplace-freebie, and other restricted terms remain excluded. Confirm that applicable terms allow download, modification, self-hosting, redistribution, and intended use. Preserve source/license evidence in the register; do not infer rights from a thumbnail, tag, or search result.
4. **Hero vehicle content remains CC0-only.** CC-BY remains excluded for hero vehicle assets. CC0 applies to copyright permissions only; it does not establish trademark, trade-dress, patent, or rights in a recognizable real vehicle design. Any identifiable branded design needs separate, verifiable rights clearance. Default presentation remains fictional and unbadged; remove logos, badge-like marks, and number plates unless separately cleared.
5. **Account/privacy boundary.** Do not create an account, submit personal data, accept legally binding terms, upload project/user content, or request a verification code unless explicitly authorized by the owner for that provider and purpose. Never bypass CAPTCHA or other anti-abuse controls. No credentials or personal email address are recorded in public project documentation.
6. **Pinned pipeline remains mandatory.** Every adopted external asset must be acquired reproducibly through the project’s pinned asset scripts, hashed, recorded in `public/assets/manifest.json` and `CREDITS.md` as applicable, optimized through the model pipeline, and covered by the asset checks. A manual download is not an integration path.

## Current candidate (not yet acquired)

The owner selected Meshy's [generic red sports-car listing](https://www.meshy.ai/posts/019db878-afec-724d-9675-a1710eddd51b) as the candidate to pursue after broadening the search from an exact Ferrari California to any manufacturer. The public listing displays CC0, identifies the model as Meshy 6, reports 400,689 triangular faces and 232,209 vertices, and describes an Italian-supercar-inspired generic design. This is a candidate record only: no Meshy account has been created, no model has been downloaded, and nothing has been added to the project. The license, creator attribution, downloadable file/provenance, badge-like details, design suitability, and redistribution terms must be rechecked against the exact item and terms at acquisition time.

The official sign-in flow states that continuing means agreeing to Meshy's Terms of Use and Privacy Policy and presents hCaptcha. After disclosure of the binding-arbitration/class-action-waiver, indemnification, and data-processing provisions, the owner explicitly accepted those Terms/Privacy for a free account. No account has been created and no verification code requested because hCaptcha remains a human-only gate; do not bypass it. The existing code-authored Kaminari roadster remains the runtime vehicle until account access and all source, model-quality, pipeline, and visual checks pass.

## Consequences

- AI-generated and free account-gated assets may now be used project-wide, but only under exact-item license review and the controls above; the existing CC0-first/CC-BY exception/CC0-only hero hierarchy is unchanged.
- The sourcing register and project instructions must distinguish a selected candidate from an acquired, verified, integrated asset.
- The no-purchase rule, CC0-only hero rule, CC-BY attribution exception for suitable non-hero content, separate brand/design-rights check, and reproducible pipeline are unchanged.
- The owner has separately accepted Meshy's Terms/Privacy for a free account; that does not complete registration, authorize paid features, or establish that the selected car is suitable to ship.
