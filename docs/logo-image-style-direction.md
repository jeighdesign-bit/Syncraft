# Image to Logo style direction (October 2026)

## Public reference

Logo Diffusion's public [Image to Logo page](https://logodiffusion.com/image-to-logo) shows eight image-first styles: Pictorial, Mascot, Retro Mascot, Cartoon, Abstract, Line Art, Icon/Emoji, and Engraved. Its examples preserve an identifiable person or object while changing the shape language of the mark. The pictured outputs favor a readable silhouette, deliberate negative space, limited color regions, and less photographic detail. Pictorial examples often use nearly solid silhouettes; mascot examples use stronger outlines and character framing; engraved examples retain selective hatch detail.

The eight public before/after cards were inspected individually:

| Style | Visible construction in the selected public example | Syncraft direction |
| --- | --- | --- |
| Pictorial | Mostly one solid subject silhouette with a few cutouts | Dominant mass and sparse internal cutouts |
| Mascot | Expressive compact character with a heavy contour | Recognizable face/pose, high-contrast blocks, clean outer contour |
| Retro Mascot | Playful character with simplified vintage cues | Compact mid-century character, warm broad color blocks |
| Cartoon | Rounded character and simple action pose | Controlled rounded exaggeration and a few large colors |
| Abstract | Subject reduced to a broad silhouette and negative space | Interlocking masses derived from source contour or gesture |
| Line Art | A few coordinated outline strokes with open interiors | Even-weight contours without filled masses or shading |
| Icon/Emoji | Compact multicolor subject with few interior details | Rounded solid shapes and app-icon readability |
| Engraved | One-ink subject with selective hatch marks | Readable silhouette plus deliberate etched cuts |

The [Text to Logo page](https://logodiffusion.com/ai-logo-generator) shows Badge/Crest, Logo Type, and Monogram separately: respectively a symbol and name inside one enclosure, the name as the logo, and one or two letterforms. Syncraft's Minimalist style is its own additional category. Logo Diffusion's post-generation effects are separate from its creation styles.

Those are observations of selected public examples, not access to Logo Diffusion's model, training data, hidden prompts, or typical output quality. Do not copy or ship their gallery artwork as a style reference.

## Syncraft implementation

`buildLogoPrompt` now gives each Image to Logo style a distinct construction instruction while keeping the uploaded subject as the source of identity. It remains possible to generate without typing a prompt. User preferences, brand text, color roles, and other validated design controls remain available. Abstract now derives a mark from the reference's contour or arrangement instead of receiving the contradictory instruction to avoid abstract shapes. Badge keeps optional brand text within its enclosure. The shared Line Art description now permits multiple coordinated contours. Variations and AI Edit retain their existing directions.

For Image to Logo, Syncraft also offers Wordmark and Monogram. Logo Diffusion's public page excludes these text-first styles from Image to Logo. Syncraft now treats the letters as primary and borrows only a small visual motif from the upload. Wordmark requires the exact brand name; an image-based Monogram requires a brand name or explicit main letters rather than guessing initials from a photo.

Syncraft uses a hosted Nano Banana 2 edit model. This change is prompt engineering, not training or fine-tuning that model. It cannot guarantee Logo Diffusion's proprietary look, exact lettering, or consistent flat colors.

## Validation

- Focused Logo Studio tests pass, including prompt-free Image to Logo, distinct directions for all eight photo-first styles, Badge text placement, image-based Wordmark and Monogram lettering, and the requirement for explicit Monogram letters.
- A production build passes.
- Two standalone Mascot generations from an existing local test image were inspected in `outputs/logo-image-direction-eval/`. They used the direct provider key, with an estimated $0.08 provider charge each. No Syncraft project or user credit balance changed. Both outputs have compact logo compositions but retain some soft shading despite explicit solid-fill instructions. They are exploratory samples, not an A/B quality claim or proof of style parity.
- Three additional standalone generations checked Wordmark and Monogram with the same source. The first Wordmark distorted a letter; stronger legibility instructions produced a readable "ORBIT" in the second sample. The Monogram showed the requested "OR". All still showed gradients or other finish choices that the prompt did not reliably prevent. Estimated provider charges for these three checks total $0.24; no Syncraft user credits changed.
- After inspecting all eight public Image to Logo style cards, three more standalone checks used the same local source: one Line Art and two Pictorial runs. Line Art used a distinct open-contour treatment but still included some filled masses. The first Pictorial run retained too much portrait detail and soft shading; the stricter silhouette prompt produced a flatter mark but lost one visible eye and too much identity. The final Pictorial instruction now preserves paired features as a group, but that last adjustment has not been visually retested. These three checks add an estimated $0.24 in provider charges and did not touch Syncraft user credits.

Next quality evaluation should use a consented set of diverse portraits, products, and animals, with the same source and seed across frozen baseline and candidate prompts. Review subject identity, style separation, silhouette at icon size, flatness, text accuracy, and user preference before claiming an improvement across styles.
