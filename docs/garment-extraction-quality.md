# Garment extraction: physical fabric and removal rules

## Current prompt baseline — live deployment verified 10 November 2026

The production target and the `syncraftech.com` alias were both checked against Vercel. Both point to deployment `dpl_98K9ZNGKUk4TCBktiCJ8LAwgXb3i`, built from Git commit `895988aab7157bfbc6db2ca404bb2bf4ee220e5a`. The local garment prompt module and mode resolver have been restored byte-for-byte from that deployed commit. Runtime selection of the experimental v10 prompt and the optional flat-cleanup prompt pass have been removed. Retired environment flags cannot reactivate either experiment.

Consumer and B2B Logo Extraction instructions, Universal extraction instructions in both content modes and all seven categories, visual-review instructions and strip prompt builders already matched this deployed source. Exact-output regression fingerprints are recorded with deployment provenance in `tests/fixtures/live-extraction-prompts.json`. Experimental builders remain archived under `scripts/evals/experiments/` for the existing offline evidence, without application imports.

This is a prompt-only rollback. Existing UI improvements, V2/V3 resolution choices, 2K/4K request handling, tier pricing, native 4K pass-through, save/download/refund behavior and unrelated functionality are retained. Restoring prompts does not undo the intentionally retained resolution differences from older 1K requests, or guarantee identical stochastic image outputs. No deployment or paid image generation is part of this rollback.

## Current extraction resolution — 11 November 2026

Consumer Garment, Logo Extraction and Universal use one tier table: **1K / Syncraft V1 at 12 credits (default), 2K / Syncraft V2 at 16 credits, and 4K / Syncraft V3 at 24 credits**. Omitted resolution explicitly requests 1K. The selector and server billing share this table; invalid tiers fail before billing and client-supplied prices cannot override it. Failed runs refund their exact linked charge, including the original amounts on historical jobs. Universal remains disabled by its existing availability switch.

The verified live prompt strings, model, crop handling and unrelated UI updates are unchanged. The B2B endpoint explicitly retains its existing 2K request and separate pricing. Existing 1K/2K upscale, native-4K pass-through, saved projects and export behavior are preserved. Tests cover tier requests, exact charges, insufficient balances, refunds, selector updates and live prompt fingerprints without submitting paid generations.

## Previous extraction resolution — 10 November 2026 (prices and defaults superseded above)

Garment Extraction and Logo Extraction default to `resolution: "2K"` at 12 credits. Their workspace selector also offers native `4K` at 20 credits, with the Generate Now cost updating immediately. The server validates the resolution before billing, derives the amount itself, and records the selected tier with the charge. Omitted resolution remains 2K; invalid values are rejected. The shared B2B extraction input continues to default to 2K.

Both tiers request PNG output from the same model. Consumer results are saved server-side and returned with `alreadySaved` plus `fileUrl`, avoiding Base64 uploads of large PNGs. The 4K path checks decoded provider dimensions before saving; an undersized output fails and refunds the linked 20-credit charge rather than silently upscaling it. The old quality-mode environment setting and stale `legacy` caller arguments cannot fall back to the provider's 1K default.

Syncraft V2 / 2K retains ESRGAN followed by Syncraft Vector. Syncraft V3 / 4K bypasses ESRGAN after checking the server-recorded charge tier and decoded native dimensions. The existing second preview slot aliases the exact generated file URL, without resize, re-encoding or another upload; the three tabs and their rendering remain unchanged. Vectorization then consumes this saved native asset through the existing processing path. Start/status/save can recover an earlier failed 4K upscale job without resubmission or new credits. A zero-cost internal pass-through receipt links to the original extraction charge, retaining the older failed provider receipt for audit.

Generated flat-art PNG previews/downloads accept a bounded 64 MiB source, fixing the old 15 MiB rejection for native 4K assets. Uploaded references retain their original limit. The same display-only preview conversion, dimensions, aspect ratio and full-resolution export bytes remain in use.

A real 4K extraction completed at 3392 × 5056, but its 18.7 MB PNG download exceeded the old 10-second transfer deadline. Native 4K transfers now allow 60 seconds per attempt and two bounded GET attempts through the shared download helper, including body timeout retries. The existing 2K transfer deadline remains 10 seconds. Transfer retries reuse the generated URL and never resubmit paid generation. Exhausted transfer timeouts retain a specific error message and refund the exact linked charge; they are no longer presented as a generic generation timeout. The original failed request's 28-credit refund was verified, and its existing PNG was recovered locally without generating again.

Universal extraction now shares the compact V2/V3 selector: V2 defaults to 2K at its existing 24 credits, while V3 requests native 4K at 28 credits. The backend validates the tier before taking the run lock or charging and records the tier and exact price with the ledger receipt. Native dimensions are verified before and after any narrow-strip proportion correction; V3 retains the provider's pixel budget instead of using the legacy 2048px strip carrier. Universal V3 uses the same exact-file pass-through to Syncraft Vector, including pattern-only mode, without ESRGAN or the Universal V2 background-mode 4x resize. Original sources and 2K behavior remain unchanged.

Garment, Logo and Universal share one compact Activity component and the same “Ready when you are” empty state. Logging actual preparation/generation events replaces the placeholder; Universal preparation now logs its real local-crop preparation stage. Universal availability remains controlled by its existing switch. The local test override is currently disabled at the user's request while Universal is in development; production is also disabled by default. Logo Studio generation is separate from Logo Extraction and retains its own settings. Prompts and optional cleanup availability are unchanged. Checks use isolated provider doubles, without starting paid generations.

## Status — 9 November 2026

The default remained `reconstruction-v6`. The then-new `reconstruction-v10` rules were a local, opt-in evaluation candidate and were **not approved as a quality improvement or enabled in production**. That runtime opt-in was removed in the 10 November prompt rollback above. Live tests found improvements in physical flattening alongside changes to retained artwork. Cropping remained under user control; no crop requirement or source preprocessing change was introduced by the candidate.

## Candidate behavior

The archived `scripts/evals/experiments/garmentPromptCandidate.mjs` distinguishes physical textile weave, knit/mesh pores, stitching, hems, fold distortion and material lighting from genuinely printed textures, gradients and illustration shading. It preserves torso/yoke color blocks and printed borders while removing construction. Pattern-only mode explicitly includes small text, associated underlines, wordless branding symbols and complete, clearly identifiable compound identity badges. Preserve mode retains printed artwork. Removing identities does not authorize enlarging or recentering retained illustrations.

Both consumer and B2B extraction use the restored shared live prompt builders. `GARMENT_EXTRACTION_PROMPT_VERSION` no longer selects a candidate at runtime. The offline evaluation runner imports the archived candidate directly; it cannot change customer prompt selection.

## Live evidence

Private customer evidence stays in ignored `outputs/`. The frozen review is `outputs/garment-review-20261109/`. Development receipts and raw outputs are retained in `outputs/garment-prompt-v7-20261109/`, `outputs/garment-prompt-v8-20261109/`, `outputs/garment-prompt-v9-20261109/`, `outputs/garment-prompt-v10-20261109/` and `outputs/garment-prompt-v10-high-20261109/`. Do not commit or publish these customer images or request payloads.

Sixteen new image requests covered eight unchanged customer references, including two fresh v6 controls. Every submitted source URL was downloaded and SHA-256 checked against its frozen source before submission. Model, crop, ratio, image count and output resolution settings were unchanged. One separately labeled trial used `thinking_level: high`; it was not adopted in application settings. No customer project, credit balance or application usage ledger was changed by the evaluation.

- **06, black/gold:** candidates reduce physical mesh/fold presentation but expand dark printed motifs, retain trim-like elements or introduce collar-like geometry. V10 with default thinking adds a curved upper gold band; higher thinking does not establish accurate recovery. No Case 06 candidate passes the combined flatness and design-fidelity requirements.
- **07, distressed heart:** v8/v9 enlarge the retained illustration. The narrowed v10 result is closer to the fresh v6 control in placement and scale, but does not establish exact recovery.
- **05, red jacket:** v8 removes white armhole-like cutouts. Its pattern and panel geometry still need review; this is not a v10 validation.
- **08, preserved text/illustration:** v8 retains the main readable content. Small illustration details still change; this is not a v10 validation.
- **12/13, compound club emblems:** v8 retains the framed helmet emblem in 12 but removes the full emblem in 13. Removal remains inconsistent across related references.
- **16, soldiers:** v8 expands three visible figures to seven, worsening the original five-figure baseline.
- **19, dense tribal print:** v8 still substitutes pattern details and expands pale ornament. It is not faithful recovery.

These are development observations, not a paired population success rate. Each candidate has limited repeats, and later candidates were deliberately limited to the two references revealing the most important regressions. Earlier failed revisions remain in the evidence. Passing code checks cannot certify image fidelity.

## Repeatable evaluation

`node scripts/evals/garment-prompt-compare.mjs AUDIT_DIR OUTPUT_DIR --cases 06,07 --control 06,07` writes a plan only. Add `--generate` to submit paid Fal requests. Optional `--thinking high` labels and changes only the candidate thinking setting. Use a separate output directory for changed inputs or candidate versions. Completed outputs are reused and recorded request IDs are resumed rather than automatically resubmitted.

Keep successful controls alongside failures, retain every outcome, and review actual raw output against the source. Reject newly invented motifs, changed illustration counts, identity remnants, scaling of retained artwork and physical construction even when a result looks cleaner. Further adoption needs a candidate that improves Case 06 without regressing those controls.

## Focused surface cleanup follow-up

The later experiment edits the **existing flat extraction**, using the garment photograph only as secondary evidence for material and fold lighting. It does not repeat extraction from the photograph. The archived `scripts/evals/experiments/garmentFlatCleanup.mjs` provides this separate `flat-cleanup-v1` operation. Its optional consumer-route integration was removed in the 10 November prompt rollback. `GARMENT_FLAT_CLEANUP_ENABLED` no longer enables another application prompt pass.

Six additional image requests covered four references: two independent cleanup runs each for Case 06 and the user's purple preserve-mode jersey, plus one each for the distressed heart and scripture/illustration controls. All six inputs match the shared input builder exactly. Their source extraction is the unchanged v6 result. Evidence stays in ignored `outputs/garment-flat-cleanup-20261109/`.

- Both purple runs reduce lower vertical fold bands while retaining the neon strokes, main lettering, number, chest mark and coarse pattern geometry. Fine detail is not certified pixel-identical.
- Both Case 06 runs remove much of the upper mesh/fold presentation with less composition drift than the earlier direct extraction candidates. The lower hem/strip and some edge distortion remain; this is a partial improvement, not a fully recovered print master.
- Heart and scripture controls retain their main geometry. Cleanup does not repair content errors introduced in the first extraction.

A local guard checks exact output dimensions and coarse print-edge alignment against the input extraction. It rejects the previously failed Case 06 v8/v10 redraws. This is only a coarse layout safeguard: it cannot certify text, colors, tiny patterns, complete fold removal or accuracy against the photograph. Results retain `reviewRequired: true`, including when cleanup is applied.

If cleanup changes the frame/coarse layout, fails, or cannot be downloaded, the route returns the original generated extraction unchanged. It never substitutes the source photograph, automatically regenerates, adds another customer credit charge or refunds a successful primary extraction for a cleanup problem. Both provider attempts are recorded with the same charge ID and linked request IDs, including the cleanup outcome and layout measurements.

The experiment would add **one paid Nano Banana 2.1 Edit call and its latency per consumer garment extraction**. It was never enabled for customers or deployed, and its application integration has now been removed. B2B behavior is unchanged.

## Phoenix preservation / silhouette follow-up — 10 November 2026

The exact source from the user's failed phoenix run was frozen and SHA-256 checked before each evaluation: 479 × 920, `09929e03363f86dc4d413116b36c72df9dd136f439e651aea3a71f304d8e7666`. The old production result was v6 with omitted resolution (provider 1K), ERASE_LOGOS and 9:16. Its raw image already retained the shirt silhouette and exterior flames; upscale was not the source of that failure.

Evidence and a complete local comparison are in ignored `outputs/garment-phoenix-fix-20261110/review.html`. No candidate in this follow-up passes both flatness and visible-artwork fidelity. No runtime prompt, production flag, customer project, balance or application usage ledger was changed by these evaluations.

- **Matched 1K:** one fresh v6 control and two `artwork-restoration-v11` edits used exactly the original source/crop, mode, ratio and settings, changing only prompt/system instruction in the candidate. V11 improves the rectangular presentation but changes feather strokes, head/body detail and dark ornament outside removal areas.
- **Matched 2K:** one v6 control and two v11 repeats were all explicitly 2K. The v6 control itself removes the shirt outline in this single fresh run. Therefore the full improvement relative to the old 1K image cannot be attributed to v11. All three still redraw visible artwork; one control does not establish reliable silhouette removal.
- **Shorter instructions:** two `minimal-edit-v12` 2K edits also redraw the artwork. One adds visible bird feet. Less prompt text is not an established fix.
- **Source-locking prototype:** source pixels outside bounded edit masks are mechanically preserved, verified by adversarial-fill tests. Two Nano Banana aligned-fill attempts preserve about 71% of the output from the deterministic source resize but produce obvious patch seams and retain collar/construction. A revised mask and non-generative adjacent-color fill preserve about 72% but leave visible smooth holes and exterior color bleed. These fail visual review and are not wired into application routes.

There were ten new image calls and five mask-analysis calls. Mask analysis includes an endpoint rejection (`reasoning` cannot be disabled), a repetitive non-JSON response from the older configured Gemini model, and three returned plans. The first returned mask's 0.95 self-reported confidence did not prevent missed identity lettering or an incomplete neckline. A later 0.86 plan was explicitly inspected for a development experiment, keeping its actual score; the automatic 0.9 threshold was not silently lowered. Even that reviewed attempt failed the output review. Model confidence and mechanical pixel preservation are not production-quality certificates.

The new experiments live under `scripts/evals/experiments/`, outside the customer pipeline. `garment-reference-regression.mjs` and `garment-locked-regression.mjs` default to planning, require `--generate` for paid work, freeze input fingerprints, retain every receipt and resume recorded request IDs rather than automatically regenerating. The latter's `--reviewed-mask` and `--repair-mask` are explicitly development-only; the repaired mask was given observed errors from a real overlay, so it is not an unassisted automatic-success result. Seven source-lock tests and the existing garment checks passed (33 focused tests total); image quality still failed.

The underlying drawing hidden by the large number and badges is not observable. A plausible generated continuation cannot be certified as the original. This does not excuse changing visible ink outside those removal footprints. The unresolved work is accurate construction/identity boundaries and aligned local inpainting that joins the retained source without seams; full-frame prompt rewrites and higher output resolution have not established that behavior.
