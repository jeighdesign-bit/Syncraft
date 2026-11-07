# Logo Studio: current providers and credits

As of 6 November 2026, Text to Logo uses Recraft V4.1 standard raster (recraftv4_1) for all 13 styles. Image to Logo and Sketch to Logo use Nano Banana 2 through fal. Variations follow the saved logo’s creation mode: Recraft V4.1 for Text, Nano Banana 2 for Image/Sketch. All new AI Edit requests use Nano Banana 2's image editing endpoint with the selected saved image, independently of its creation mode. Background removal and vectorization retain their original Recraft tools in every mode. Other Syncraft features are unaffected.

| Action | Provider / endpoint | Customer credits | Standard API cost |
| --- | --- | ---: | ---: |
| Text to Logo | images/generations | 8 / logo | $0.035 |
| Image / Sketch to Logo | fal fal-ai/nano-banana-2/edit | 8 / logo | $0.08 |
| Text Variations | Recraft images/imageToImage | 8 / output | $0.035 |
| AI Edit, every source mode | fal fal-ai/nano-banana-2/edit | 8 / output | $0.08 |
| Image / Sketch Variations | fal fal-ai/nano-banana-2/edit | 8 / output | $0.08 |
| Remove BG | images/removeBackground | 2 | $0.01 |
| Vectorize | images/vectorize | 2 | $0.01 |

Customer prices remain unchanged. Creation returns one 1024-square PNG per job; selected controls, exact text and compiled prompts are passed to the selected provider. A four-logo Text to Logo batch costs 32 customer credits and about $0.14 in image-provider charges; four Image/Sketch outputs cost about $0.32. Generation plus optional vectorization totals 10 customer credits: about $0.045 for text or $0.09 for Image/Sketch. Style preparation is local with zero planner API cost. PNG/JPG downloads and repeat downloads of existing SVG derivatives are included.

RECRAFT_API_TOKEN or RECRAFT_API_KEY is required for Text creation/variations and all background-removal/vectorization tools. FAL_KEY is required for all new AI edits and Image/Sketch creation/variations, and remains relevant to fal job recovery. Missing provider credentials fail before reservation/billing; AI Edit never falls back to Recraft generation. Image/Sketch creation is pinned to Nano Banana 2 even if the historical LOGO_STUDIO_NANO_MODEL=pro override exists.

Recraft synchronous results are persisted before storage saving. Text batches run their independently reserved jobs concurrently within the existing 180-second route duration. No paid submission is automatically retried. Replays, refund reconciliation, owner/editor billing, and saved-output recovery retain their existing protections. New Image/Sketch jobs and previously queued fal jobs complete through their recorded queue endpoint. Recraft saved-output recovery remains available.

Text variations retain Recraft image-to-image at strength 0.45. AI Edit uses instruction-based image editing with the actual accepted source in Nano's image_urls, never a source style reference or a newly generated concept. The signed source determines its history mode, brand, tagline and style. Text replacements recognize both “change the text to MANLY” and “change the text, MANLY”, save MANLY as the new brand, and freeze a versioned edit intent and compiled prompt before submission. The edit prompt preserves source letter anatomy, bevels, colors, layout and supporting text while specifying the complete replacement character sequence. Creation prompts, design controls and visual guides are excluded. Previously submitted Recraft edits still recover through their recorded provider. Image/Sketch creation retains its existing Nano request and Smart/Precise sketch instructions. AI Edit is not a masked pixel-exact edit: small incidental differences remain possible and spelling should be reviewed. SVG edit sources are validated and rasterized; background removal retains native SVG input. Utility outputs and original download history remain supported.

Live regression on 6 November 2026: the saved GRAVE / FOUR MAN source was edited with the original short instruction “change the text, MANLY”. The first pilot retained an extra R; adding an explicit full-word character sequence corrected it in the second pilot. Visual review confirmed MANLY, the unchanged FOUR MAN wording, silver bevels, black extrusion, teal outline and the arched layout. Source/output dimensions were both 1024 square; visible artwork bounds were 803×438 and 803×437 pixels. Tagline foreground overlap was 94.5%, so this was close preservation, not identical pixels. Local results are in outputs/logo-edit-grave-manly-v2. The evaluator scripts/evals/logo-edit-live.mjs makes one explicitly authorized paid edit without changing app history or charging customer credits, saves its request ID for recovery and rejects accidental resubmission to the same output directory.

The four-logo quota and existing UI controls remain. Completed synchronous outputs open in the existing preview flow.

Logo Studio's **Share** header action reuses the existing workspace sharing dialog and `/api/project-share` invitations. Owners manage access; invited editors can create and refine logos using their own credits, while invited viewers can preview and download saved outputs. Every generation shares the project's existing four-logo quota. Access, revocation and the three-day project expiry are checked on reads, downloads and writes. Canvas signatures remain bound to the project owner, and a signed job records its billed user so owner/cron reconciliation attributes provider costs and refunds to the original payer. Opening the dialog or copying a link does not make a project public.

Sharing checks cover owner/editor/viewer roles, rejected uninvited access, revocation, expiry, editor charges and refunds, shared quotas, role-aware controls, and authorized downloads. The sharing dialog was checked locally without sending an invitation or changing anyone's access.

Validation includes Recraft payloads for every style and mode, actual adapter SVG rasterization, compiled prompts, concurrent batches, billing, refunds, collaboration, legacy fal recovery, saved Recraft output recovery and exports. A direct live V4.1 image-to-image smoke test returned PNG and 35 API units ($0.035), without touching saved projects or app credits; visual inspection showed the requested color change plus some incidental redraw.

Official references:
- https://www.recraft.ai/docs/api-reference/models/recraft-v4-1
- https://www.recraft.ai/docs/api-reference/tools/image-to-image
- https://www.recraft.ai/docs/api-reference/pricing

All Text styles now share the same first-option compiler in direct and batch paths. Local style-specific alternatives preserve explicit briefs and settings; new batches make no remote text-planner call. Existing signed planner usage/recovery records remain supported. Selected colors are also passed to Recraft native RGB controls.
