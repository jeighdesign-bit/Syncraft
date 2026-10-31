# Universal extraction quality work — 30 October 2026

## Temporary unavailability — 31 October 2026

Universal is temporarily unavailable to users while extraction quality is improved. `src/lib/universalAvailability.mjs` is the shared UI/server switch, currently `UNIVERSAL_AVAILABLE = false`. The sidebar and new-project card remain visible with an Unavailable label; stale creation state cannot upload/create a Universal project. Existing projects retain authorized viewing and saved-file downloads, while extraction, editing, new upscale and vector jobs are blocked before charging or starting providers. Existing job status/save and completed-asset operations remain available.

The same server gate covers Universal recovery endpoints, project creation, generic trace entry points, crop/edit/extend/remove-background operations and explicit Universal API modes. No owner-only production bypass or environment-only enablement is provided. The extraction implementation and local evaluation records below remain available for development; those records describe earlier behavior rather than currently available user functionality. This source change must be deployed before the live site receives the same restriction.

Verification: all 437 repository tests and the production build pass. Availability tests exercise real route handlers with provider, billing and database-write sentinels: blocked Universal starts reach none of those effects, while existing status/save, saved-file access and other tools continue. UI tests invoke disabled handlers directly and cover stale modal/file-picker state as well as ordinary clicks.

## Current user preference: direct crop extraction — 31 October 2026

The user explicitly requested removing the analyzing stage and sending the selected crop straight to extraction. This supersedes the source-analysis strategy described below. Universal generation now makes one image-edit request using the exact stored crop URL. Category is a guide only. No remote source analysis, output inspection, semantic target substitution, source-pixel fallback, section grid or post-generation plane selection runs in this path, including when old experimental environment flags remain enabled.

The existing preparation endpoint only reads local crop dimensions and preserves the billing/run lock protocol. Generation discards stale surface descriptions, readable-text transcriptions, corner proposals and aspect predictions. Supported portrait/landscape format is chosen arithmetically from crop dimensions; unusually narrow output canvases retain the selected crop ratio. Provider receipts retain the exact input, crop byte hash and generation request ID. No automatic fidelity approval is claimed.

The actual pouch failure in project `16372f3a-156d-4451-bc16-4e46d87a0d2c` used a 367×494 crop. Its inspector identified a single pouch, but the image editor produced a duplicated, redesigned 2816×1536 output; upscale enlarged that same failure. There were zero output validation calls. Evidence is archived in ignored `outputs/user-universal-tests/user-pouch-16372f3a/`. This crop differs from the earlier full-poster benchmark; the earlier poster passes cannot establish isolated-pouch fidelity.

The direct-crop retest used the same original JPEG URL and verified SHA256, requesting a local 3:4 canvas. One image request (`01a18ff6-3f08-7663-aa0e-05f465555b98`) returned a 1792×2400 single-face result with zero analysis/quality-model calls. Manual assessment is partial: duplication and the major layout improve, but regenerated details and pouch-shaped edges remain. Original and new outputs, exact input, hashes and the manual verdict are recorded in `before-after.html` and `after-direct.json`. No project writes or Syncraft credit transactions were made by the standalone test. All 39 focused tests and the production build pass.

## User-folder before/after evaluation — 31 October 2026

The current Keep All Artwork path first inspects the actual upright crop for one selected surface. The shared analysis normalizer retains explicit digital/physical presentation, planar corners, geometry confidence, occlusion and observed text. Missing evidence stays unknown. `RECOVERY_SOURCE_PIXELS_ENABLED=false` disables this strategy; Background Only continues to accept small crops without mandatory surface inspection.

Already-flat digital artwork can retain its original decoded pixels and canvas dimensions. Clearly bounded planar faces, including straight ribbon segments, can be rectified from source pixels. Both require a separate positive geometry/content comparison before being selected. Uncertain geometry, content loss, review failure or review unavailability continues to one normal image edit. No source photograph is substituted merely because a generated result failed. No extra image generation is triggered by a quality verdict.

Source geometry and all bounds checks now use real unpadded source/output images. The first test attempt exposed a coordinate error caused by the old contact-sheet context: it selected only a thin slice of a narrow banner and an upper slice of a poster. A second attempt also showed an exact digital strip being rejected because the reviewer mistook the inspection sheet for the actual output. Those attempts and their failed checks remain in the recorded audit history.

Keep-mode prompts preserve glyph shapes, typography, small logos, object count and the selected single face, distinguishing printed photographs from the surrounding scene. A local advisory check detects large nearly uniform light/dark bands around physical lanyard results even when a remote reviewer falsely passes them. It changes neither pixels nor crop bounds. A physical strip's recovered plane is no longer stretched back into the wider photographed crop box. Background-only narrow-canvas behavior remains covered by regression tests.

Generated outputs with one supported trapezoidal print on uniform neutral exterior can receive a deterministic rectification proposal. The fit must contain all visible foreground at original resolution; irregular outlines and multiple objects are refused. The live route allows this tightly scoped local geometry correction with advisory status: geometry can pass locally while content and lettering remain unverifiable. Strict remote comparison against the generated input is available for calibration and retains the original bytes on rejection or unavailability. This correction does not repair lettering or illustration errors introduced by generation; comparison against the original reference remains separate.

Evidence is stored under ignored `outputs/user-universal-tests/`: the original 12-case baseline, two development attempts, and a final review-only revision. Originals, identical manual crops, crop coordinates/maps, prompts, system context, model/request IDs, usage receipts, raw/final images, rejected source candidates, prior outputs and manual findings are retained. The final review-only revision reuses existing image generations and source analyses, with zero new image submissions. Cases 09 and 12 lacked baseline outputs and must not be counted as measured visual improvements.

Final manual assessment: 5 overall-layout passes, 6 partials, 1 failed extraction, compared with baseline 2 passes, 5 partials, 3 failures and 2 provider errors. Three of the ten cases with baseline images improve their coarse grade; the other two new outputs have no baseline image to compare. Cases 09, 10 and 12 exactly preserve decoded crop pixels. Case 11 remains failed and has worse content fidelity despite the same failed grade; it is called out separately in the report. Physical lanyard 06 still contains large black side fields, now correctly flagged rather than falsely passed. Banner 05 is flattened locally while inherited generated detail errors remain partial. All 81 targeted tests and the final production build pass; an unauthenticated localhost extraction request correctly returns 401. This is a local implementation, not a production deployment.

This evaluation covers the shared extraction and review stages with explicit manual target selection. It does not exercise the full workspace, upscale or vectorization flow. Model aliases and null seeds do not guarantee identical regeneration. Planar resampling does not establish physical print dimensions; small or hidden lettering remains limited by the source. The dated sections below describe earlier behavior where they conflict with this section.

## Reference category control — 31 October 2026

Universal's right sidebar now replaces Vector Engine with Reference Category: Auto, Poster, Lanyard, Banner / Tarp, Packaging, Label / Sticker, Other. Garment vector controls remain available. Universal vectorization uses Auto.

Selections save immediately through authenticated `PATCH /api/recovery/category` to `canvas_data.reference_category`, preserving the extraction mode and crop metadata. The endpoint requires project edit access, rejects changes during generation, validates the category allowlist, and compares the previous canvas JSON to prevent overwriting a concurrently changed project. The UI disables category selection and generation while a selection is saving and restores the prior value if saving fails.

Both local preparation and generation read the persisted category. Explicit categories select the appropriate layout rules and provider prompt; optional visual analysis cannot override the selected category. Auto uses general visible-surface instructions within the existing image edit call; selecting a category does not add a separate paid detection call. The selected category is retained in recovery analysis and provider usage metadata for testing and review.

Verification: 17 focused category, component, access-control and generation-flow tests passed, along with the full production build and a localhost HTTP check. No new live image generation was needed for this selector change. Browser visual verification was unavailable because the Computer Use tool could not verify the active browser URL.

## Fidelity and narrow-canvas correction — 31 October 2026

The background/pattern-only prompt now follows garment semantics: remove identity lettering/logos while retaining integrated illustrations and motifs. The former instruction to remove all illustrations was incorrect for this requested workflow.

Narrow generated outputs are normalized back to the selected crop canvas ratio before saving; optional review cannot crop that ratio again. The 44×565 reference produces a 132×1695 flat canvas and a 528×6780 4x upscale. This fixes canvas proportions, but does not prove that internal artwork geometry is preserved.

A single-call section-grid experiment preserved canvas ratio but introduced seams, remaining lettering and displaced illustrations, so it is disabled by default (RECOVERY_STRIP_GRID_ENABLED is opt-in for evaluation only). Direct edits with revised wording retained more medical content but still invented/rearranged details. A local text-mask experiment preserved source pixels better but left lettering remnants and remains in ignored outputs, outside the application. No live result from this round should be described as an exact artwork recovery. Eighteen targeted tests pass; live fidelity remains unresolved.


## Current behavior after small-crop feedback — 31 October 2026

The user requested garment-like flexibility. Valid decodable crops now generate regardless of small dimensions or low-confidence source analysis. The default path performs one image edit, with no paid remote analysis or validation stages. Enable `RECOVERY_VISUAL_REVIEW_ENABLED=true` only for optional advisory source/output review. An insufficient analysis, unavailable reviewer, or failed quality verdict never discards an otherwise valid generated image or triggers a quality-based refund. The actual provider image is saved as a best-effort result with a review notice. If an optional outer crop is rejected, the untouched provider result is retained instead. An independently approved crop may still be used.

Refunds remain attached to real provider, transfer, decoding, or persistence failures. Authentication, storage ownership, duplicate generation locks and verified billing remain enforced. There is no fallback that substitutes the source photograph for a generated result. The older fail-closed quality behavior described below is historical and has been superseded.

Regression coverage executes the real generation route with mocked external services for a one-pixel-wide crop, insufficient analysis, failed background-pattern review, unavailable reviewer and a true provider failure. It verifies that valid outputs are saved, only one generation occurs, and real errors still refund the charge.

## Pinterest continuation — 31 October 2026

References were inspected directly on Pinterest and downloaded from the displayed pin image URLs:

- [Printed sublimation lanyards](https://www.pinterest.com/pin/595249275723958781/): selected the visible dark-blue ribbon. Generation completed, but validation timed out; no passing claim.
- [Box mockup](https://www.pinterest.com/pin/46654546135902001/): generated output replaced the original mark with a head silhouette, invented text and added side bands. The checker rejected it. A subsequent generative trial was also rejected.
- [Advertising banner](https://www.pinterest.com/pin/30891947431683997/): this pin is a presentation collage/stock preview. The model removed the surrounding scene but changed motif layout. The checker approved it incorrectly; manual review overrides that verdict. This is unsuitable as a passing benchmark or a reusable production asset. Do not count this as a successful test.

New outer-context cropping accepts only bounded rectangular proposals and requires a second independent visual verdict. It cannot repair missing artwork, incorrect wording, or wrong logo shapes. Unit tests cover rejection and the maximum of one crop attempt.

A planar pixel rectifier now supports extracting an existing quadrilateral into a rectangle without generative redraw. A manual corner selection on the box lid preserved original letterforms and the lid's visible partial logo, with no orange scene or box side faces. Automatic corner prediction was inaccurate in the live trial and the checker confused a side-wall logo with missing lid art. Therefore this path is **opt-in only** via server-side `RECOVERY_PLANAR_PIXELS_ENABLED=true`; leave it disabled until automatic geometry and face-specific validation are calibrated. The manual demonstration is not proof of successful automatic extraction.

The pilot runner now checkpoints usage, source analysis and provider request IDs before finishing, so interrupted runs can resume inspection against saved candidates without regenerating. `candidate` supplies a local saved output; optional `analysis` reuses a known source description. Manually supplied descriptions/corners must be identified as such in reports.

Latest verification: 27 targeted tests and the full Next.js production build passed. No deployment. Raw results and images remain in ignored `outputs/pinterest-eval/` and `outputs/universal-live-*`.

Universal now inspects the source with Fal's `openrouter/router/vision`, generates with `fal-ai/nano-banana-pro/edit`, and checks the original against the output before saving a Flat Extract. The vision model defaults to `google/gemini-2.5-pro`, configurable through server-only `RECOVERY_VISION_MODEL`. Each run has one source inspection and one output inspection, each with a 45-second deadline. Actual reported text-model usage is recorded in the provider ledger; there are no automatic image retries or extra customer charges.

A failed, unavailable, malformed, or contradictory visual verdict rejects the result and uses the existing verified refund path. Carrier/background, changed layout, invented text, missing art and foreground remnants in background-only mode all reject. Pixel statistics are retained as diagnostics and cannot certify extraction quality. No source photograph is returned as a successful extraction.

Narrow references are presented to the inspector as an overview and four ordered detail crops. This is only an inspection aid; the image editor receives the original. Without these detail crops, both Flash and Pro incorrectly described readable lanyard text as motion blur. Pro then incorrectly approved a reconstructed result in an earlier raw-image trial. The visual check is probabilistic and still requires broader calibration.

## Pilot evidence

Private customer evidence stays in ignored `outputs/universal-real/`; do not commit or publish it. Two real Fal Universal lanyard references were reprocessed. Their old outputs lost visible artwork. New outputs also failed: one changed the cross pattern and one duplicated the strip into parallel columns. The checker rejected both when given readable detail sheets. A known synthetic failed lanyard output was also rejected for faded text/content collapse.

Public cases and their source pages:

- Hanging banner: [Wikimania05 banner](https://commons.wikimedia.org/wiki/File:Wikimania05-banner.jpg). Generation removed the outdoor scene but added an outer gray canvas. The visual-check request timed out, so this case is unvalidated and must not ship as a passing example.
- Box front panel: [Bell Tea packaging, Hands On Tauranga](https://www.handsontauranga.co.nz/hot-items/nga-toi-the-arts/bell-tea-packaging-hc115/). First output combined a side-panel shield with the front artwork. The checker rejected `bad_layout`. A targeted panel-separation pilot removed the wrongly transferred shield, but retained physical worn box edges and an outer margin. Its visual check timed out, so it remains unvalidated and is not a passing example.
- Cylindrical label: [Gray's Compound, Smithsonian](https://www.si.edu/object/grays-compound%3Anmah_720127). Output removed the bottle but invented small text and omitted a printed date. The checker rejected `invented_text` and `missing_visible_artwork`.

The documented `1:8` ratio produced a live Fal downstream 500, so it is not enabled. Extremely narrow strips remain a provider/geometry limitation. Current changes improve reference targeting and prevent detected failures from being delivered; this pilot does not establish reliable recovery across all categories.

## Repeatable pilot

Run `node scripts/evals/universal-recovery-live.mjs manifest.json` for source/baseline inspections; add `--generate` for one new image per case. The manifest is an array of `{ id, category, source, baseline?, mode? }`, capped at eight cases. It uses real Fal credits, records usage/request IDs and writes local evidence to ignored `outputs/`. Failed HTTP downloads and non-images are rejected. Public references are uploaded to Fal for generation because some original image hosts fail provider-side retrieval.

Validation: 21 targeted tests and a full Next.js production build passed during implementation. These checks cover parsing, fail-closed verdicts, source/output ordering, usage receipts and narrow-image preparation; live image quality is evaluated separately above. No production deployment was made.
