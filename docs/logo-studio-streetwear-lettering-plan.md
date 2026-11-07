# Streetwear Lettering — research and implementation plan

Prepared: 4 November 2026 (Asia/Shanghai).
Status: implemented locally on 4 November 2026. Automated checks, desktop/mobile UI review, three provider generations and one SVG conversion completed. See the implementation evidence below.

## Product decision

Add **Streetwear Lettering** as a distinct STYLE in **Text to Logo**. Stable style ID: `streetwear-lettering`.

The style is a focused custom-wordmark treatment: Gothic/blackletter or Chicano-inspired script, expressive terminals and swashes, layered outlines, and illustrated dimensional shading. These are related visual directions, not interchangeable names for one font. Treat “Streetwear Lettering” as our product category, not a formal historical type classification.

Text-only creation is a deliberate first-release scope, not an inherent limitation of lettering. Users can still edit, remove the background, vectorize, download, and create variations of a generated result.

## Research and visual findings

The supplied references show tall condensed decorative letters, flowing slanted scripts, curved or stacked lockups, strong separation outlines, and solid shadow/highlight bands. Some are monochrome and flat; others suggest gold or silver through drawn color shapes. The target is **illustrated 3D depth**, with readable letter silhouettes, rather than a photographed metal sign.

Relevant public sources, checked 4 November 2026:

- [Adobe: Putting a (type)face on design trends](https://blog.adobe.com/en/publish/2020/10/29/putting-a-typeface-on-design-trends) identifies Gothic with blackletter and discusses layered dimensional typography. This supports treating letter construction and finish as separate controls.
- [Hammer Museum: Philosophy of Lettering — Chaz Bojorquez](https://hammer.ucla.edu/programs-events/2010/05/philosophy-of-lettering-chaz-bojorquez) describes the artist’s East Los Angeles Mexican American graffiti and calligraphy context. Use “Chicano-inspired” as a direction, rather than labeling every ornate script as Chicano.
- [Google: Nano Banana image generation](https://aistudio.google.com/docs/image-generation) documents native image generation/editing and text-rendering capabilities. Our exact-text field and explicit lettering instructions fit this workflow; model capability does not guarantee correct spelling on every result.
- [fal: Nano Banana Pro API](https://fal.ai/models/fal-ai/nano-banana-pro/api) documents the existing provider family’s text-to-image interface. Repository inspection, rather than the latest marketing model list, determines the integration we retain.
- [Recraft: Practical prompt engineering](https://www.recraft.ai/blog/prompt-engineering-guide) recommends explicit typography structure and quoted required text. This is supporting design guidance, not evidence that our generation runs on Recraft.

Design inference: use hard-edged shadow and highlight regions so the requested dimensional look remains visually crisp and is easier to assess after vectorization. Export fidelity still needs a real visual check.

## Current implementation findings

| Area | Observed behavior | Required response |
| --- | --- | --- |
| `src/lib/logoStudio.mjs` | Shared catalog of 12 styles; validator does not restrict styles by mode; Wordmark has exact-name behavior | Add style capabilities and exact-text validation |
| `src/app/logo-studio/LogoStudio.js` | All modes display the same style catalog; mode changes, upload, draft restoration and saved-job restoration set state separately | Filter by mode and normalize every entry path |
| `src/lib/logoStudio.mjs` baseline prompt | Generic generation says “Flat artwork” | Add dedicated Streetwear lettering instructions |
| `src/lib/logoStyleProfiles.mjs`, `logoDesignBrief.mjs`, `logoPromptCompiler.mjs` | Text art direction is a separate path; fallback typography recognizes Wordmark/Monogram | Support Streetwear in planned and deterministic fallback paths |
| `src/lib/logoDesignSettings.mjs` | Controls are allowlisted per style; outline color currently implies a thin outline | Add narrow controls and style-specific outline wording |
| `src/lib/logoVariations.mjs` | Only Wordmark/Monogram enter lettering variation routes | Classify Streetwear as lettering and validate target eligibility |
| `studio.module.css` | Style labels use `white-space: nowrap` in compact columns | Allow the new label to wrap without shrinking it further |
| `src/lib/logoFal.mjs` | Nano Banana 2 by default, Pro if configured; PNG output | Retain configured model and request count |

The art-direction path is enabled by `LOGO_ART_DIRECTION_ENABLED`; both enabled and disabled paths must produce coherent instructions. There is no universal “no 3D” ban in the compiler: the actual global conflict is baseline “Flat artwork.” Engraved has its own intentional no-3D instruction, which stays scoped to Engraved.

## Intended interaction

1. Choose Text to Logo → Streetwear Lettering.
2. Enter the exact brand/name in the existing text field. This is required; a separate description is optional.
3. Optionally choose lettering, layout, outline, finish and existing colors.
4. Generate using the normal output count, loading state, project history and credits.

Card description: **Bold custom lettering with Gothic or flowing script forms, layered outlines, and dimensional shading.**

Reuse the existing text chips for main text and optional tagline. Preserve spelling and case unless the user explicitly requests a case transformation. Do not infer a brand name from a vague description.

### Small, dedicated control set

Every selector retains the existing Auto convention. Auto must still produce a deliberate Streetwear result.

| Control | Choices | Auto behavior |
| --- | --- | --- |
| Letters | Auto / Gothic / Chicano-inspired script | Choose one coherent lettering system based on the brief; Gothic-leaning if unspecified |
| Layout | Auto / Straight / Arched / Stacked | Choose readable proportions for the supplied words |
| Outline | Auto / Single / Layered | Layered separation outlines with open counters |
| Depth | Auto / Flat / Extruded / Beveled | Controlled bevel highlights and shallow offset depth |

Reuse compatible composition options where possible, but do not expose unrelated sans, bubble, character-pose or monogram controls. Reuse Primary, Secondary, Outline and Background color roles. Default background follows the existing white-background behavior; a dark background is optional. Explicit controls override style defaults, so Flat has no extrusion or bevel shading.

## Implementation sequence

### 1. Catalog and capability rules

- Register `streetwear-lettering` with display name, prompt description and text-generation capability. Place it beside Wordmark.
- Introduce a shared mode/style eligibility helper in a dependency-safe module or existing registry. Use the same rule in UI and server validation; preserve existing styles’ availability.
- Require trimmed exact brand text. Allow empty description when valid brand text is present.
- Reject Image/Sketch generation with this style before reservation, provider submission or credit charging. Audit both batch and single generation entry points.
- Scope checks to creation/explicit style conversion, so saved results remain editable and exportable.

### 2. UI and state handling

- Filter the STYLE grid and its count by creation mode: 13 in Text, 12 in Image/Sketch.
- Add `public/images/logo-styles/streetwear-lettering.webp` with an original representative lettering thumbnail. Do not use the supplied branded samples or their contact details as shipped artwork.
- Update required-field copy, Generate eligibility, description placeholder and main-text chips.
- Normalize style eligibility during tab switching, automatic switch on upload, draft restore, project restore and example selection. When leaving Text with Streetwear selected, use Wordmark as the compatible fallback; preserve the text draft and Streetwear settings for returning to Text.
- Permit a readable two-line card label, retain `aria-pressed`, visible focus and keyboard activation, and check narrow layouts. Use the skill’s general accessibility guidance; its Python search runner was unavailable in this environment.

### 3. Prompt and planning support

- Add a dedicated baseline lettering branch, sharing exact-text handling with Wordmark where safe.
- Add the Streetwear style profile and lettering-specific deterministic fallback concepts, and bump the prompt/profile version for traceability.
- Have both compiled and baseline prompts request typography as the dominant artwork; exact quoted name/tagline; readable counters and spacing; coherent letter construction; layered outlines; and finish matching the controls.
- Specify that bevel/extrusion is drawn inside the logo. Keep all swashes, outlines and depth within the artboard with generous margins.
- Remove conflicting flat-only language for this style and adapt the thin-outline instruction only where needed.
- Do not inject skulls, shields, dates, slogans, reference names, signatures or contact information by default. Explicit user-requested motifs can support the letters without replacing them.
- Confirm the planner payload receives the new profile and required controls; retain the existing adapter rather than introducing another planner.

### 4. Variations, persistence and export

- Add Streetwear to the lettering family in variation planning and compilation. Auto variations preserve the accepted image’s actual lettering genre and finish, including edits.
- Allow explicit Streetwear variations only for saved **text-mode** sources with saved brand text. Determine this from trusted source lineage on the server, not client-provided mode/brand fields. Hide or disable ineligible UI choices with a useful reason.
- Keep ordinary Edit, background removal and vectorization usable for Streetwear results.
- Store the style and normalized settings through existing job/draft data. No new database field is expected from the inspected JSON job storage.
- Initial output remains PNG. SVG is the existing separate Recraft vectorization operation, not native editable font text. Inspect thin counters, layered keylines and bevel regions after conversion.
- Keep the existing model selection, pricing, output limits and retry behavior. Do not introduce automatic extra generations.

### 5. Examples and documentation

- Add a few original example prompts once representative outputs have been visually checked: a short Gothic name, a flowing script name, and a stacked two-word lockup.
- Wire examples through the existing gallery collection and text-mode selection callback. Gallery examples must include exact brand text and matching settings.
- Update `docs/logo-design-controls.md` and relevant Logo Studio mode/variation documentation with capability and text requirements.

## Verification and completion criteria

Extend existing tests rather than creating a parallel test framework:

- `logoStudio.test.mjs`: exact brand required, description optional, text creation accepted, image/sketch creation rejected, utilities still valid.
- `logoDesignSettings.test.mjs` and `logoColorRoles.test.mjs`: control allowlists, invalid options, explicit Flat override, proper layered-outline color instructions.
- `logoArtDirection.test.mjs`: profile completeness, distinct lettering fallback directions, exact text and control priority in compiled prompts; enabled/disabled/fallback paths covered.
- `logoVariations.test.mjs`: lettering routes, Auto preservation, explicit target eligibility using saved mode/brand, and edit/utility lineage.
- `logoFal.test.mjs`: provider selection and requested image count remain unchanged.
- `logoExamples.test.mjs`: valid styles, assets and exact text for new examples.
- Replace fixed 12-style assumptions with catalog/profile consistency checks. Reference-mode test loops must iterate eligible styles rather than all styles.
- Add an appropriate server-level check that rejected requests never reach credit charging; a validator-only test cannot prove that order.

Run the focused suites, then `npm test` and `npm run build`. Read the relevant bundled Next.js guides before application edits; the local `use-client` guide was reviewed during planning.

Manual acceptance: keyboard and mobile selection; required-text feedback; switch/upload/restore paths; save/reload; Gothic, script, arched and stacked results; gold bevel, silver/teal outline and monochrome flat treatments; exact spelling; no cropped swashes; correct colors; Auto variations; PNG download and one SVG derivative. Inspect real generated outputs before claiming the style matches the references; unit tests only prove instructions and routing.

Completion means the new style is discoverable in Text to Logo, both generation paths honor its controls, invalid mode combinations cannot charge credits, existing styles still work, and representative outputs pass visual review.

## Implementation evidence — 4 November 2026

- Added text-only catalog entry, required exact brand name, four focused controls, original thumbnail and three example presets. Both baseline and art-directed prompts support the treatment. Prompt profile is `art-direction-4`; variations are `logo-variation-3`.
- Invalid reference-mode creation is rejected at route and service boundaries before job reservation, credit charge or provider submission. Explicit variation targets resolve mode and brand from saved source lineage; UI uses the same source resolution.
- `npm test`: 916 tests passed, zero failures. `npm run build`: passed. Existing module-type and Turbopack root warnings are unrelated to this change.
- Desktop browser: required-name/optional-description behavior, Gothic selector, keyboard-opened depth menu, Image/Sketch exclusion, Text round-trip, draft reload, gallery filtering and example selection verified.
- Mobile browser at 390 × 844: the two-line Streetwear card label is readable and the document has no horizontal overflow. Restored normal viewport after checking.
- Three original outputs generated through the app's current `nanoLogoPlan` adapter with configured Nano Banana 2: IRONVALE (compiled deterministic fallback, gold arched Gothic/bevel), Sonder (baseline, script/extrusion/teal outlines), and NORTH UNION (AI-planned, stacked Gothic/flat). All names are spelled correctly in these samples, with complete outlines and unclipped flourishes. These samples are now the gallery assets.
- IRONVALE was vectorized through the existing Recraft adapter, passed SVG safety validation and was rendered for inspection. Its outlines, letters and solid bevel regions remain recognizable; finer tonal transitions are simplified by tracing.
- Local evidence lives in ignored `outputs/streetwear-validation/`: prompts/provider request metadata, original PNG files, SVG plus rendered preview, and gallery/mobile screenshots. Three image calls were made with no automatic retries; adapter estimates total USD 0.24 for those images, plus planner usage and vectorization. No account credits were granted, consumed, or modified by this standalone provider smoke test.
- Scope of live verification: provider generation/vectorization and browser form interactions were real. Billing, saved-project service behavior, variations and export regressions were covered by automated tests; no live customer project was created for this check. Nothing was deployed.
