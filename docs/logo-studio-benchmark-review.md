# Logo Studio benchmark review — 8 November 2026

## Scope and evidence

Reviewed the signed-in Logo Diffusion Text-to-Logo workspace, its completed bear example, style controls and Image-to-Logo entry flow. Compared these with Syncraft's live MOUNTAIN BIRDS project, source code, provider requests, history, billing and exports. No generations or purchases were made in Logo Diffusion.

Public context: [Logo Diffusion](https://logodiffusion.com/), [content styles](https://faq.logodiffusion.com/en/articles/8840448-in-depth-content-styles), [Magic Editor](https://logodiffusion.com/magic-editor). Public claims about a proprietary model or editing fidelity are vendor descriptions, not independently verified performance measurements. The older content-styles guide is background, not an inventory of the current signed-in workspace.

## Findings and priorities

| Area | Evidence in Syncraft | Priority and response |
| --- | --- | --- |
| Generation quality | General image models interpret logo prompts; extra fur, feather cuts, highlights and stock symbol/text arrangements can overpower the concept. | P1: add a compact craft contract focused on coordinated forms, open gaps, small-size recognition and finish discipline. Preserve subjects, wording, colors and explicit controls. |
| Concept exploration | Construction directions were gated behind an experimental environment flag. Several directions only said to refine contours or spacing. | P1: enable the existing free local planner for non-Streetwear Text batches by default. Give Minimalist, Pictorial and Badge alternatives different construction ideas. First option stays faithful to the brief; alternatives change unspecified choices. |
| Variation consistency | Auto uses the accepted artwork, not the current draft. Generic structural instructions can increase detail. Explicit target styles did not receive most compatible saved controls. | P1: state finish/detail continuity in Auto; send compatible controls and Badge direction when a target style is explicitly selected. Do not undo accepted edits by blindly replaying old creation settings in Auto. |
| Draft versus saved identity | The selected MOUNTAIN BIRDS variation had saved Mascot identity while the draft was showing Badge settings. This made it look as if Badge controls had been ignored. | P1: show the saved style above the canvas and explain the source used by Variations. Add a saved brief/settings inspector and deliberate recipe reuse. |
| Controls | Long horizontal chip rows hid settings, particularly Badge's controls. | P2: expose four core controls and every explicitly selected control; disclose remaining controls with More settings. Wrap controls instead of hiding them offscreen. Keep the existing Select component. |
| Reviewing results | History thumbnails and parent comparison exist, but a large canvas masks small-size problems and recipe provenance is hard to inspect. | P2: add Review & brief with actual 32/64/128-pixel previews, selectable recent concepts, real batch comparison where batch metadata exists, and saved settings. |
| Refinement and export | AI edit, variations, background removal, SVG vectorization and downloads already exist. | Preserve. Element editing, layered vector editing, brand systems, mockups and animation are separate capabilities, not remedies for weak concept generation. |
| History | Syncraft's three-day file retention remains visible. | Record the difference; do not silently change storage policy or claim permanent project assets. |

## Implemented contracts

- Idea text remains separate from brand name and tagline. No automatic name insertion or instruction to put lettering below the symbol was added to the user's prompt.
- Text craft contract version: text-direction-13; Badge version: badge-direction-2; variation version: logo-variation-6. Existing frozen requests retain their saved prompts and charges.
- Public job data now includes batchId, allowing actual batch comparison without exposing internal compiled prompts or planner metadata.
- Recipe reuse restores a Text-to-Logo draft without submitting it or spending credits. Reference-based recipes remain inspectable; new image/sketch creation requires the original reference again. Variations use the saved result directly.
- Models remain Recraft V4.1 for Text creation, Nano Banana 2.1 Edit for Image/Sketch and non-Streetwear refinements, with the existing Streetwear exceptions. Protected image/sketch and Streetwear creation prompt tests remain in place.
- Prices remain 8 credits for creation/AI edit, 6 per variation and 2 for Logo Studio background removal/vectorization. No unrelated prices or credit packages changed.

## Live visual smoke test

Normal Studio billing created two originals and one variation, consuming exactly 22 app credits with no credit grant. Outputs and frozen requests are in outputs/logo-studio-benchmark-smoke/manifest.json.

| Sample | Observed result | Limitation |
| --- | --- | --- |
| RIDGELINE, Minimal emblem Badge | Flat green/gold identity, open silhouette, shield/bird relationship, correct supplied spelling. | Border weight is prominent; text is not readable at 32 px. |
| RIDGELINE Auto variation | Same bird/ridge identity, green/gold palette and flat finish; new silhouette and arrangement. | Adds feather cuts and mountain detail. Detail preservation is still imperfect despite the prompt guard. |
| RIVERDAY, Mascot | Recognizable friendly otter, cup, restrained palette and correct supplied spelling. | Conventional character-over-wordmark composition and some extra tonal detail remain. Not proof of designer-level originality. |

This is a functional and visual smoke test, not a blinded before/after quality study or proof of parity with Logo Diffusion. Do not advertise a guaranteed quality improvement from three outputs. The review tools expose weaknesses instead of hiding them behind scores.

## Next quality work, in order

1. Evaluate a fixed set of briefs across styles with several repetitions. Rate subject fidelity, distinctive construction, spelling, small-size recognition, detail/finish consistency and diversity. Keep rejected outputs in the results.
2. For reduced symbols, target the remaining Auto variation detail inflation before adding more settings. Investigate a source-analysis contract only if measured gains justify its additional inference cost.
3. Evaluate curated, owned/licensed style references against prompt-only generation. Extract transferable design principles; do not depend on copying a reference identity or indiscriminately inserting Pinterest images.
4. Consider another model or training only after the same evaluation demonstrates a persistent limitation. A proprietary logo model's reported strengths cannot be reproduced merely by adding dropdowns to a general-purpose model.

UI validation covers desktop and a 390-pixel phone viewport, native dialog focus/Escape behavior, recipe reuse, responsive overflow and existing price displays. Automated checks cover batch provenance, saved lineage, required target controls, free default planning, pricing isolation, billing/refunds and protected model routing.
