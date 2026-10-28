# Logo Studio research and proposed scope

Researched: 2026-10-21. Reference product: Logo Diffusion.
This is a research brief, not an implemented feature or a verified hands-on product audit.

## Product direction

Build a connected logo and brand-design workspace: start from text, a sketch, or an image; explore concepts; refine a selected result; create brand applications; export usable assets. Use Logo Diffusion's capabilities and workflow as a reference while developing Syncraft's own interface and presets.

## Verified public capabilities

- Text to Logo: prompt and style selection; four images for paid plans, two for free plans; optional existing-logo input for variations.
- Eleven logo categories: Pictorial, Mascot, Retro Mascot, Badge/Crest, Cartoon, Logo Type, Abstract, Line Art, Icon/Emoji, Engraved, Monogram. The current help article also lists 41 additional art styles (52 total). Older marketing pages advertise 45+ styles; these numbers describe different or older catalogues.
- Sketch to Logo: draw inside a sketch editor or upload a drawing, then generate refined concepts.
- Image to Logo: transform an existing image into a logo direction.
- Magic Editor: edits through written instructions. It is distinct from the drawing editor and does not itself expose brush, pen, or shape tools according to current help documentation.
- Eight Magic Editor workflows: Logo to Merch Set, Preserve Style, Brand Presentation, Logo System, Logo to Icon Set, Logo Minimizer, 2D Logo to 3D, Text Extractor.
- Magic Editor offers Base/Pro engines and Fast/Standard/2K/4K output levels. Its effects gallery advertises over 100 prepared effects.
- Style Transfer: a separate input consisting of the logo and a reference-style image; distinct from preset effects.
- Mockup Generator: route a selected logo into product presentations.
- Finishing tools: background removal, standard/HQ vectorization, and 2x/4x creative upscaling.
- SVG and transparent PNG are documented deliverables. A 2D-to-3D result is a rendered image, not an editable 3D model.
- Credits are charged per generated image; failed generations cost nothing and partial batches are charged only for successfully saved results.

## Proposed Syncraft workflow

1. Create: text prompt, sketch canvas, or image upload; brand name, logo category, palette, and number of results.
2. Explore: result grid, selected concept, variations, favorites, and saved generation settings.
3. Refine: text-instruction edits, before/after comparison, version history, and exact vector color edits where available.
4. Apply: style effects, reference-style transfer, product mockups, matching icon sets, and brand presentation layouts.
5. Finish: background removal, vectorization, upscale where appropriate, and exports.

## Suggested delivery sequence

### First release: complete core workflow

- Text/image/sketch entry points, a curated initial logo-style catalogue, and configurable result count.
- Text-based refinement and variations of the selected concept.
- Transparent PNG and real vector SVG exports.
- Project assets, version history, visible credit estimate, and failed-job refunds.

### Second release: branding tools

- Product mockups and merch sets.
- Logo system variants, icon sets, and brand presentation presets.
- Material effects and style-reference input.
- Small-size simplification and better typography controls.

### Later extension

- Animate Logo through a separately evaluated image-to-video integration. The reviewed Logo Diffusion documentation does not establish an animation capability.

## Existing Syncraft foundations inspected

- Upload endpoints, project/workspace routes, asset persistence, and ZIP preparation are present.
- Background removal and upscaling endpoints are present.
- Recovery generation calls fal-ai/nano-banana-pro/edit; this establishes an existing image-edit integration, not a general-purpose logo editor ready for release.
- Trace routes and a logo-vectorizer page are present; exported SVG quality and editability need a focused audit before reuse claims.
- Existing authentication, project-access checks, credit ledger, rate limiting, and provider usage recording can inform new routes.

File presence and source inspection do not establish that all tools work correctly or are suitable without changes.

## Provider strategy and open validation

- Recraft is a candidate for image/vector generation, image-to-image processing, vectorization, and background removal. Public image API documentation was reviewed earlier in this conversation.
- Reuse the existing image-edit provider integration only after testing logo fidelity, lettering, sketch adherence, and mockup quality.
- Product tools can be preset prompts and controlled inputs on shared model integrations; each feature need not have a distinct model.
- Mockups rendered through AI may distort a logo; compositing templates are an alternative when exact reproduction matters.
- Hex-accurate recoloring should edit vector fills or controlled pixels; a generative edit cannot promise exact brand colors.
- Treat multi-item brand sheets as presentation images until individual assets have been generated or extracted and validated.
- Do not promise exact feature parity, speed, output quality, or model identity from a marketing demo.

## Sources

- https://logodiffusion.com/
- https://logodiffusion.com/features
- https://logodiffusion.com/sketch-to-logo
- https://faq.logodiffusion.com/en/articles/16567579-text-to-logo-how-it-works-and-the-11-logo-styles
- https://faq.logodiffusion.com/en/articles/16567581-the-magic-editor-editing-your-logo-with-text
- https://faq.logodiffusion.com/en/articles/16567572-how-credits-work-in-logo-diffusion
- https://logodiffusion.com/blog/how-ai-adjusts-logo-colors-with-style-transfer
- https://www.recraft.ai/api
- https://external.api.recraft.ai/doc/ui/?spec=external-api.yaml
