# Logo Studio code map

## Application

- `src/app/logo-studio/LogoStudio.js`: workspace state and controls. The style grid uses the existing `SectionBadge` component for its NEW label.
- `src/lib/logoStyleCapabilities.mjs`: which styles and modes can be combined.
- `src/app/logo-studio/styleSelection.mjs`: remembered selections across Text, Image and Sketch.
- `src/lib/logoStylePreviews.mjs`: generated preview URLs with content-based cache versions. Never edit versions manually in the component.
- `src/lib/logoStudioServer.js`: authorization, reservations, billing, provider routing, saving and recovery.
- `src/lib/logoFal.mjs`: Nano Banana 2 request builder. Receives the job and source; compiled prompts and seeds come from that job. No environment model override.
- `src/lib/logoRecraft.mjs` and `logoRecraftServer.js`: Recraft request planning, reference normalization and response handling.

Routing is intentional: Text generation and variations use Recraft V4.1; Image/Sketch generation and variations use Nano Banana 2. All new AI edits use Nano Banana 2's image editing endpoint while retaining the saved creation mode for history. Edit identity comes from the signed source; the normalized edit intent and compiled prompt are frozen before charging. Creation controls and guides are excluded from edits. Remove BG and Vectorize retain their original Recraft tools in all modes. Previously submitted jobs recover using their persisted provider and endpoint, including older Recraft edits and Pro jobs. Do not submit new work when refreshing an existing job.

## Preview artwork (offline)

Source SVG definitions live in `scripts/lib/logoStylePreviewAssets.mjs`. Run:

```sh
node scripts/create-signature-style-previews.mjs
```

This rebuilds SVG previews in `public/images/logo-styles/`, regenerates the URL manifest from SHA-256 file hashes, and writes large/48px review sheets under `outputs/style-preview-refresh/`. It makes no provider requests and changes no credits. After replacing any preview image, rerun this command so its version matches the new contents.

## Marketing tools

- `scripts/generate-darkmen-marketing.mjs` and `generate-darkmen-seven.mjs` create saved projects and spend provider credits. They require `--run-paid`; the latter also contains the previously authorized 56-credit grant, protected by its saved grant record. Review configuration and saved manifests before running either script.
- `scripts/build-darkmen-carousel-white.mjs` + `darkmen-carousel-white-layout.mjs`: current white, minimal 12-card carousel. Includes a cover, ten settings-only cards and closing CTA. Rendering does not generate logos or touch credits.
- `scripts/build-darkmen-carousel.mjs` and the `v2` versions: retained earlier design iterations. They render to separate output folders.
- `scripts/build-darkmen-seven-gallery.mjs`: gallery/contact sheet for the seven additional originals.
- `scripts/evals/logo-image-direction-live.mjs`: standalone paid Nano Image-to-Logo check. Requires explicit source/style/output arguments and never writes app projects or credit logs.

Rendered images, originals and manifests are kept under `outputs/`; runtime code does not import the marketing scripts. Generated artwork and earlier user revisions are retained.

## Checks

Run the Logo Studio test files, including `logoStylePreviews.test.mjs`, followed by `npm run build`. The preview test detects missing catalog assets and stale cache hashes. Service tests exercise provider selection, replay protection, credits, saved-output recovery, collaboration and legacy queue recovery without paid calls.

Mascot prompts are assembled in `src/lib/logoMascot.mjs`, shared by the direct and batch paths. Mascot batches avoid remote concept rewriting so that a complete user brief retains its anatomy, pose and color relationships.

All-style fidelity: `logoPromptCompiler.mjs` is shared by direct Text generation and batches. `logoStyleDirections.mjs` bounds additional constructions; `logoArtDirectorServer.js` prepares them locally. `scripts/evals/logo-style-fidelity.mjs` provides guarded paid visual checks; see `docs/logo-art-direction-setup.md` for current behavior.
