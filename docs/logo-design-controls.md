# Logo Studio design controls

The composer now has actual editable main-text/tagline chips and a horizontally scrolling row of labeled select controls. These update structured form state without rewriting the user's visible brief. Main text and tagline stay synchronized with the sidebar fields.

The compact layout uses one 36-pixel desktop row, short visible labels, and selected-value sizing. Full field names remain available to assistive technology and hover titles. Scroll navigation appears only for overflow; the reset control appears only after a setting is selected. The heading/helper row and persistent scrollbar were removed. The compact layout passed a production build and browser checks for selection, reset and overflow navigation without any paid calls.

The public Logo Diffusion interface was inspected on 23 October 2026. Its Wordmark controls include letter type, details, treatment, font style, font characteristic, composition, two mood categories and industry. Its Mascot controls instead include character composition (portrait/full body). These observed interaction patterns informed the local controls; this does not claim access to Logo Diffusion's private backend or models.

Each style has an explicit server-side field profile. Mood, brand personality and industry are shared where the reference shares them. Their common presence does not make the construction instructions identical.

| Syncraft style | Controls in addition to the shared mood/personality/industry fields |
| --- | --- |
| Wordmark | Main text, tagline, letter type, detail, treatment, font style, font characteristic, text alignment |
| Monogram | Main letters, capitalization, detail, monogram treatment, monogram weight, monogram font |
| Badge | Main text, tagline, badge type, badge shape, badge detail |
| Line art | Line thickness, geometric/curved line structure, character composition, detail |
| Engraved | Detail, engraving style, engraving technique, line quality |
| Icon/Emoji | Detail, viewpoint |
| Pictorial | Character composition, detail, geometric/organic structure |
| Abstract | Detail, geometric/organic structure |
| Mascot | Detail, character composition |
| Cartoon | Character composition, detail |
| Retro mascot | Shared mood/personality/industry fields only, as observed in the reference |
| Minimalist | Mark construction (solid, outline, negative space), geometric/organic structure |

Minimalist is Syncraft's own explicit style; Logo Diffusion's inspected Logo Design category instead has Auto, which showed no Style Setting panel. Its controls are a local extension, not a claimed copy of Auto. The local Monogram main-letters editor supports 1–3 letters/numbers, extending the reference's single-letter chooser. Main letters are distinct from the full brand name and can generate with an empty optional brief.

The full per-style UI observations are saved in `outputs/logo-quality-pilot/logo-diffusion-style-audit.json`; inspected option menus are in `logo-diffusion-option-audit.json`. Source: the authenticated public interface at https://app.logodiffusion.com/gen/text-workspace, not private APIs or application internals.

- Auto leaves a field unspecified. Reset clears only the current style's construction controls and preserves optional color roles; Clear colors resets colors independently.
- Each style retains its own selections when switching. Drafts survive refresh; saved jobs retain validated selections, which restore when opening a project without a draft.
- Text, Image and Sketch creation share the existing compact controls and optional Colors popover (Primary, Secondary, Outline, Background). Direct editing and supporting tools keep their existing behavior.

The server allowlists catalog IDs in `designSettings`. It sends separate control instructions to the fal/Qwen planner and adds their authoritative requirements to the final Nano Banana Pro instructions. These requirements override conflicting planner suggestions. The baseline route also honors controls when art direction is disabled. The image model still interprets instructions, so controls do not guarantee pixel-exact typography or layout.

Image and Sketch generation send validated selections directly to the existing fal Nano Banana Pro edit endpoint, together with the uploaded reference. They do not invoke the Text art-direction planner. Image instructions preserve the recognizable subject, identifying features and pose; Sketch instructions preserve silhouette, proportions, orientation and relative positions. Framing can crop existing content but must not invent missing anatomy. Wordmark and Monogram intentionally integrate reference motifs into requested lettering; lettering sketches retain their arrangement and proportions. Explicit background colors replace the default white-background instruction. Empty settings remain Auto and require no additional prompt text.

Image to Logo uploads now offer an optional local crop using the existing `react-image-crop` library. The user can drag/resize a free rectangle, apply it, keep the full image, reopen the selection against the original, or reset from the preview. Cancel/Escape retains the current source. Applying creates a PNG containing only the selected pixels; this file replaces the generation upload and sidebar preview, so areas outside the crop never enter the image request. The original file stays in memory for adjustments until removal or a mode switch. Crops preserve transparency, cap the longest edge at 2048 without upscaling, and resize further if required by the existing 4 MB upload limit. Cropping makes no paid calls and does not modify existing saved logos.

Crop verification: all 150 repository tests and the production build passed. Tests cover original-image coordinates, selected-pixel export, PNG output, upload-size handling, encoding failure and preview controls. An isolated browser check of the actual modal verified keyboard resizing, crop export (640-pixel original to 511-pixel crop), reopening against the full original, Use full image, Escape cancellation and focus restoration. The temporary preview route was removed before the final build. No paid generation was needed for cropping verification.

Selections are stored in each saved job and restored alongside its creation mode when no local draft exists. Optional colors and controls add no extra model calls and retain the existing 10-credit generation price. Classic/Smart engine and Fast/Base/Pro quality selectors were not added.

Changing controls makes no paid calls and does not change the existing generation price.

Verification (24 October 2026): all 146 repository tests and the production build passed. Added coverage checks controls in all three composers, Image/Sketch validation, public saved settings, reference priority, Monogram lettering and actual service-to-fal payloads with one 10-credit charge per output. Browser checks confirmed Image/Mascot menus and all four optional color selections. Live Image/Sketch generations remain unverified: Chrome blocked automated upload, then computer control ended because the current URL could not be verified. No generation credits were spent during this verification. The Text compiler profile remains `art-direction-3`; already submitted jobs retain their previous frozen instructions.
