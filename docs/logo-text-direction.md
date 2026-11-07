# Text to Logo direction contract

The `text-direction-12` compiler applies to **new, non-Streetwear Text to Logo generations only**. Recraft remains `recraftv4_1`, one 1024×1024 PNG per requested output at the existing 8 app credits. No extra planner model, candidates or retries were added. Existing jobs keep their frozen prompts. Image and Sketch creation retain their Nano Banana 2 prompts and control catalogs. Streetwear retains its existing compiler and four lettering controls.

## Construction and Auto

| Style | Construction | Auto fills unspecified choices |
| --- | --- | --- |
| Minimalist | Reduced silhouette, intentional masses and open cuts | Solid construction; subject-led geometry |
| Mascot | Character anatomy, expression, contour hierarchy and limited shape shading | Economical detail, action-aware framing, substantial outer contour |
| Retro | Mid-century advertising character and rubber-hose gesture | Expressive spot-ink detail, action-aware framing, thick ink contour |
| Cartoon | Exaggerated contemporary character and rounded contour rhythm | Clear gesture, economical color planes, rounded contour |
| Badge | Integrated enclosure, central subject and readable border/text hierarchy | Clean emblem; subject-led enclosure, circular if otherwise unspecified |
| Monogram | Requested initials coordinated through stems, counters and terminals | Readable custom sans, substantial stems, coherent geometric construction |
| Wordmark | Exact name as bespoke dominant typography | Readable family, recurring letter feature, horizontal reading order |
| Line Art | Open contour drawing and purposeful negative space | Confident medium contour, subject-led curves, essential contours only |
| Abstract | Coordinated forms, topology and negative space | Few major forms; geometric unless the brief provides organic cues |
| Pictorial | Recognizable contour and interlocking solid regions | Whole subject, essential detail, coherent contour system |
| Engraved | Printmaking silhouette and form-following tonal marks | Controlled vintage line engraving with separated fine contours |
| Icon/Emoji | Compact illustrated geometry and clear viewpoint | Essential color planes; three-quarter physical objects when appropriate |

Auto is implemented as **brief first, then style fallback**, not forced control IDs. It does not rewrite the raw prompt or silently select UI options. Mood, personality and industry now have concrete shape, proportion, spacing and hierarchy instructions. Business-context inference accepts specific descriptions such as “bakery” or “software company”; a lone animal/object, quoted logo copy or exact brand name is insufficient. Multiple conflicting sectors remain neutral. Industry never adds a stock sector symbol or changes the selected style.

The server stores `designBrief.textDirection` with the version, industry source, conditional defaults and suppressed conflicting hints. Both the direct generation path and enabled local planner compile the same contract.

## Control priority

1. Exact brand/initials and selected design controls.
2. Explicit subject, pose, orientation, count, motif, color and rendering preferences in the brief.
3. Conditional style defaults.

Mood, personality and industry refine the style rather than replacing it. Specific font-family anatomy wins over an incompatible broad block/cursive hint. Badge shape controls the outer contour while badge type controls internal hierarchy. Minimal detail does not erase dimensional monogram depth or a selected engraving technique. No outline suppresses an otherwise saved outline-color instruction. Explicit foreground/background role colors retain their native Recraft RGB controls. When no background treatment is specified, Text Auto also sends a native background-color preference: white by default or dark navy for a clearly light foreground. Brief-specified background treatments are left to the brief; frozen older prompts do not gain the new Auto preference.

Mascot, Cartoon and Retro have a **Text-only Outline thickness** menu: Auto, No outline, Thin, Thick. Retro also exposes detail and framing for Text. Image/Sketch catalogs retain their previous fields.

## Research

Reviewed the public [Logo Diffusion gallery](https://logodiffusion.com/) and its [Mascot](https://logodiffusion.com/mascot), [Logo Type](https://logodiffusion.com/logo-type), [Badge/Crest](https://logodiffusion.com/badge-crest), [Monogram](https://logodiffusion.com/monogram), [Line Art](https://logodiffusion.com/line-art), [Cartoon](https://logodiffusion.com/cartoon), [Pictorial](https://logodiffusion.com/pictorial), [Abstract](https://logodiffusion.com/abstract), [Engraved](https://logodiffusion.com/engraved), [Icon](https://logodiffusion.com/icon) and [Retro Mascot](https://logodiffusion.com/retro-mascot) pages. Construction principles and the distinction between style and industry informed Syncraft's own rules; competitor artwork, prompts and names are not sent to Recraft or published as examples. Minimalist is Syncraft's own category.

Recraft's [V4 prompting guide](https://www.recraft.ai/docs/prompt-engineering-guide/prompting-with-recraft-v4) emphasizes explicit drawing logic, hierarchy, composition and color relationships. Its [styles documentation](https://www.recraft.ai/docs/api-reference/styles) distinguishes V4/V4.1 custom style references from V2/V3 curated styles. This change keeps the current model and does not attach unsupported V3 style strings, a negative-prompt field, competitor references or unvalidated custom style IDs.

## Verification

`tests/logoTextDirection.test.mjs` exercises all twelve Auto profiles, every selectable Text field option, industry inference, conflicting controls, exact saved settings, Recraft prompt limits and direct/batch parity. The protected fixture was captured before the change: 1,304 Image/Sketch request hashes and 18 Streetwear prompt strings must remain identical.

Live review uses `scripts/evals/logo-text-direction.mjs` and short ordinary briefs in its fixture. The user authorized **nine outputs from the existing 72 credits, with no grant**. Selected styles: Minimalist, Mascot, Retro, Monogram, Wordmark, Line Art, Abstract, Engraved and Icon. Badge, Pictorial and Cartoon have automated coverage but no new live generation in this review. Outputs and job metadata are saved under `outputs/text-logo-improvement/live-review`; they are not published to the example gallery or marketing pack. Code checks establish request correctness, not guaranteed visual quality; inspect the actual native Recraft results separately.

Live review result: all nine native jobs completed on `text-direction-11`, using exactly 72 credits and leaving 0. The outputs exposed serif anatomy despite Sans, invented HRN lettering in the Line result, an outline where Minimalist Auto suggested solid, uneven background contrast, and mixed hatch/stipple shading. The follow-up `text-direction-12` moves selected controls ahead of the brief, adds explicit font anatomy and symbol-only content, strengthens stipple construction, and adds native Auto background color. These follow-up changes pass automated checks but have **not** had another paid visual test. The nine images must not be represented as outputs from version 12 or as nine accepted/passing designs.

For the native visual-reference implementation and its separate, gated pilot, see [Recraft visual controls](./logo-visual-control.md). The text-direction-12 compiler is retained; visual guidance is independently versioned and disabled for ordinary generations until validated.
