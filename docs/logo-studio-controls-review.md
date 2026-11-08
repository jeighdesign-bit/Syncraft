# Logo Studio controls review — 8 November 2026

This extends [the first workspace review](./logo-studio-benchmark-review.md). Scope: useful generation controls within the existing models, prices and workspace. No image generation or purchase was made in Logo Diffusion. Its signed-in controls were inspected in a separate audit tab; the user's original tabs were left alone.

## What the benchmark controls actually do

| Logo Diffusion control | Observed behavior | Syncraft decision |
| --- | --- | --- |
| Style Image | Built-in image gallery includes inflated, clay, metallic and other rendering treatments. Selecting a clay reference added a Style Image chip, disabled/collapsed the normal style categories, changed the displayed option count and displayed generation cost. | Add optional native style inspiration for Text to Logo using Recraft V4.1's supported reference input. Keep explicit logo style and brand settings; avoid silently changing model, price or output count. |
| Style Image Smart / Legacy | Both labels were visible; selecting Legacy opened a paid-access modal. Legacy generation could not be tested on the available account. | Do not invent a matching switch. It would imply a provider/model capability we have not verified and would conflict with fixed model routing. |
| Input Image Smart | Input types include Logo Variation, Sketch and Photo. They distinguish how the same image should be interpreted. | Preserve Syncraft's existing Text/Image/Sketch separation, saved-logo variations and Smart/Precise sketch interpretation. A subject image is not interchangeable with a style inspiration image. |
| Quality | With an input image, Low/Mid/High showed different credit charges and estimated durations. This is a paid quality tier, not merely a prompt-strength adjustment. | Do not add quality tiers: models and app prices must remain unchanged. |
| Advanced images | Images to Generate changes batch count. | Retain the real one-to-four batch control, independent of unlimited subsequent variation batches. |
| Advanced dimensions | The inspected Smart state offered 1024 × 1024. Other states may differ. | Keep the existing square 1024 PNG output. No unsupported resolution/aspect-ratio menu. |
| Advanced seed | Numeric seed with random/freeze controls. | Add an optional supported Recraft random seed for Text creation; persist base seed and each output seed. Blank means fresh seeds, subsequent options increment and wrap at the unsigned 32-bit boundary. No new seed promise for Nano image/sketch/edit workflows. |
| Prompt enhancement | For “A curious otter holding a coffee cup,” it proposed a more specific pose, gaze and expression and suggested several design settings. Accept, Redo and Revert appeared. | Keep the short idea unchanged. The current free compiler already adds style-specific art direction and explicit controls. A new rewriting model would change costs/models; a canned rewrite button would add little value and could change intent. |
| Prompt freeze | With freeze on, changing Pictorial to Mascot retained the original idea text. Some per-style settings still changed. This is not a lock for every setting or a guarantee of repeatable output. | Preserve manual idea text and explicit selections by default. Add an actual Explore / Follow brief choice for batch composition, rather than an ambiguous “freeze AI” switch. |
| Per-field icons | Off/lock/shuffle-looking controls were present next to style fields. Their individual behavior was not tested; do not infer exact semantics from icons. | Existing Auto versus explicit selections already make this choice understandable. Do not randomize or reset selected settings behind the user's back. |
| Colors, style-specific settings and history | Separate palette and style controls, active input chips, output history and refinement actions support iterative work. | Retain native Recraft color controls and compatible style fields; build on the saved-style indicator, small-size review and recipe reuse from the first pass. Do not add unrelated mockup, animation or asset features to fix concept generation. |

Vendor background: [prompt enhancer and freeze](https://logodiffusion.com/design-hub/turn-simple-ideas-into-logos-illustrations-and-images). Direct UI observations above are more specific than vendor marketing claims, and are limited to the accessible account/state. This review does not establish which private models Logo Diffusion uses internally.

## Implemented behavior

### Style inspiration

- Available in Text to Logo creation only. Separate upload and state from Image-to-Logo subject images; hidden during AI Edit and in image/sketch modes.
- One PNG/JPEG/WebP up to 4 MB. The server verifies authorized project/user storage, bounded download, decoded image format and pixel limits **before reserving batch slots or deducting credits**. No arbitrary remote URL retrieval.
- The actual Recraft call includes `style_reference_urls` and `style_match` (`flexible` or `precise`), while retaining explicit `model: recraftv4_1`, existing 1024 size and native color controls. The user's image replaces optional internal style guides instead of being blended with an unrelated guide.
- Prompt contract makes the short idea and separate brand/tagline fields authoritative. The reference supplies drawing language, contours and finish; copying its identity, subject or composition is discouraged. This is guidance, not a guarantee against resemblance or palette carryover.
- No Pinterest scraping, internal reference collection, training or third-party logo upload was added. Use images the user owns or has permission to use.
- Jobs retain a private reference URL for recovery/retention cleanup; public recipe metadata exposes only the presence of inspiration and the selected match mode. Files are not silently persisted as browser drafts. Reload/reuse clearly requires reattaching an image or explicitly continuing without it.

### Generation controls

- **Explore concepts:** existing default. Option one follows the brief; additional batch outputs receive distinct optional construction directions only where the brief/settings leave choices unspecified.
- **Follow brief closely:** every output uses the same composition instructions. Different seeds still allow visual variation. It does not promise identical images or override the explicit brief.
- **Seed:** Text-only integer 0–4294967295, including zero. A supplied base seed is propagated to each real provider call, including direct service calls. Batched output seeds are base plus index modulo 2^32. Blank uses fresh seeds. Repeat comparison requires the same brief, settings, inspiration, model and option count; exact repetition is not promised.
- Saved recipes and Review & brief show concept mode, inspiration status and the actual output seed. Recipe reuse restores the batch base seed so repeating the same batch is deliberate. Project navigation clears any in-memory style file to prevent carrying it to a different project.
- Existing Select components, keyboard behavior and mobile-safe disclosure are reused. Selected controls remain visible; additional settings stay optional.

## Provider fit, model and price isolation

Primary documentation: [Recraft V4.1](https://www.recraft.ai/docs/api-reference/models/recraft-v4-1), [styles](https://www.recraft.ai/docs/api-reference/styles), [API endpoints](https://www.recraft.ai/docs/api-reference/endpoints), [pricing](https://www.recraft.ai/docs/api-reference/pricing), [Nano Banana 2.1 Edit](https://fal.ai/models/google/nano-banana-2.1/edit/api).

V4.1 supports native style references and `random_seed`; explicitly supplying `recraftv4_1` avoids a change to the provider's default model. The reference request adds the documented style preparation cost; it does not require a new generation model. Observed provider cost was $0.035 without a reference and $0.040 with it. The existing 8-credit creation charge remains unchanged.

No CFG, inference steps, negative-prompt box, arbitrary quality slider, automatic prompt rewriting, or higher resolution tier was added. Those would not be a faithful control for the currently routed APIs/model budget. Nano image/sketch generation remains Nano Banana 2.1 Edit. Existing AI Edit, Streetwear exceptions and utilities retain their routes. Existing 8-credit creation/edit, 6-credit variations and 2-credit Studio utility prices are unchanged; unrelated pricing was not edited in this pass.

## Verification and limitations

- Automated coverage checks strict option validation, Text-only scope, zero/max/wrapped seeds, fixed composition across styles, native reference payloads, private asset metadata, pre-billing failures, replay safety, batch charges, saved recipes, public lineage and compatible UI controls.
- Live paid test: two PINEWATCH mascot outputs from the same short idea “A watchful lynx,” same palette/settings and seed 27641. Both used Recraft V4.1 and cost 8 app credits each; total **16 credits**, no grant or price override. The inspiration was an original Syncraft RIVERDAY test output, not a third-party logo. Resumable request IDs and results are in `outputs/logo-studio-controls-smoke/manifest.json`.
- Observed effect: the baseline was an angular side-view lynx with a large wordmark; the inspired result used softer, rounded, front-facing character construction and smaller lettering. The requested PINEWATCH spelling and new subject were retained. The inspired result also shifted dark green toward the reference's blue-green. The baseline's long curled tail is an anatomical weakness for a lynx. These are retained in the test, not filtered out.
- This pair verifies a real pipeline effect; it is **not** proof of consistent professional originality or a general quality improvement. Style inspiration can influence composition, palette and subject cues despite instructions. It should remain optional and default to flexible matching. Broader blind evaluation across multiple briefs and seeds is the next evidence needed, rather than adding more knobs.
- Desktop/mobile browser checks cover disclosure, concept selection, seed persistence, saved inspiration recovery and unchanged mode/price displays. The extension's file chooser denied automated access to local file URLs, so selecting a file through that browser path could not be completed. Native image preparation, owned upload, live reference generation and invalid-reference failures were independently exercised through the actual backend.

Verification: all 578 automated tests passed; the final reference image preparation adjustment also passed all 12 adapter tests. The optimized production build passed. Browser checks reported no client errors and no horizontal overflow at 390 px; the responsive viewport was reset afterward. Logs and desktop/phone screenshots are saved under `outputs/logo-controls-*` and `outputs/logo-studio-controls-smoke/`. Local changes only; no deployment performed.
