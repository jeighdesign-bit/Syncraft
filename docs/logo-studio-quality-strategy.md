# Logo Studio quality audit and proposed strategy

Reviewed 23 October 2026. Research and planning only: no application changes or paid generations performed for this audit.

## Finding

The current backend has a real art-direction gap. It assembles a general logo instruction, a short style description, the user's brief and brand fields, then submits directly to Nano Banana Pro. It does not make an explicit design concept, assign composition and typography, or plan different concepts across options. Fixing style routing and required brand text solved instruction conflicts, but did not add these missing design decisions.

This does not establish that all quality differences are backend-related. Logo Diffusion publicly describes a rebuilt V5 image engine, but the reviewed sources do not disclose its full architecture, weights, training data or internal prompts. We cannot claim it uses Nano Banana, a particular fine-tune, LoRA, ControlNet, or an undisclosed multi-stage workflow.

## Evidence from Logo Diffusion

1. Its [V5 release notes](https://logodiffusion.com/updates/logo-diffusion-v-5-smarter-faster-and-more-creative) describe prompt expansion, automatic settings and color selection, alongside a rebuilt model. These are vendor claims, not independent quality measurements. The visible short prompt therefore is not necessarily its entire generation instruction.
2. Its [badge tutorial](https://logodiffusion.com/design-hub/mastering-badge-logos-a-deep-dive-tutorial-with-logo-diffusion-v5-2) demonstrates moodboarding, enhancement, explicit shape/detail/mood choices, selecting a favorite from a batch, and refining with the chosen output as input. It also documents freezing the prompt and seed while changing image influence. These controls support a deliberate iteration process; they are not evidence of an invisible automatic ranking system.
3. Its [style-transfer explanation](https://logodiffusion.com/design-hub/how-logo-diffusions-style-transfer-compares-to-adobe-firefly-2) distinguishes reference structure from material/appearance, with input influence and color controls. This is documented especially for texture transfer; it does not prove that every text-to-logo request silently includes a style image.
4. Read-only inspection of the signed-in app confirmed Badge Type, Badge Shape, Detail, Mood 01, Mood 02, Industry Association, separate Main Text/Tagline, a separate Style Image panel, and seed controls. Earlier Wordmark inspection showed font, lettering treatment and alignment settings. These are observed product capabilities, not a reconstruction of private server requests.

## What the current code actually does

| Area | Current implementation | Consequence to investigate |
| --- | --- | --- |
| Style definition | `LOGO_STYLES` in `src/lib/logoStudio.mjs` contains one short descriptive string per style | A style name and adjectives leave many design decisions to generic model defaults |
| Prompt assembly | `buildLogoPrompt` repeatedly favors a centered logo, clear space and restrained colors | Different brands can converge on similar composition and palette choices |
| Wordmark | A separate lettering-first branch now exists, but objects in the brief are explicitly made optional/subtle | This can weaken the core concept, such as a requested piggy-bank motif |
| Image/Sketch | Strong subject/structure preservation; image mode makes lettering secondary, except the Wordmark branch | Useful fidelity controls, but little guidance for context-specific composition or typography |
| Options | Client submits the same brief/style/settings for every selected output | Different randomness is not the same as different planned concepts |
| Provider adapter | `src/lib/logoFal.mjs` sends a prompt and, for editing, one source image; fixed 1K, square canvas | There is no separate style reference, structured art direction or logged seed in the current adapter |
| Completion | Provider output is saved and returned | Completion checks do not establish lettering correctness, style fidelity or design distinctiveness |

Square canvases and white backgrounds are not inherently bad. The issue is applying the same internal layout and conservative defaults to almost every brief. Increasing resolution alone would not add a stronger concept.

## Limits of the twelve-style comparison

We compared one fresh Syncraft output per style with existing curated gallery samples. We did not reproduce every Logo Diffusion font, alignment, color, mood or enhancement setting. Five comparisons adapted briefs from another source style. There is no evidence about how many attempts produced each featured sample. These observations reveal shortcomings in our results, but cannot isolate a model-quality advantage or prove its cause.

Observed issues worth targeting: generic sports-mascot silhouettes across Mascot/Cartoon/Retro, unwanted shading in nominally flat styles, complex geometry in Minimalist, and Wordmark lettering that loses the important illustrative idea. Functional tests passing does not validate those aesthetic properties.

## Proposed generation process

Keep the user flow short: subject/idea, selected style, optional brand and preferences. The backend supplies design decisions.

### 1. Interpret the brief without changing its intent

Create a structured design brief containing exact brand spelling, subject, essential motifs, requested relationships, explicit colors, intended use and selected style. Distinguish essential content from optional decoration. Preserve the raw user text alongside the interpreted version. If a required name is absent, ask for the name rather than inventing one.

### 2. Plan a concrete concept before rendering

An art-direction model or deterministic planning fallback should choose:

- One clear visual idea and why it fits the brief.
- How elements combine: shared contour, negative-space cutout, fused letter, enclosing emblem, etc.
- Composition: lockup, balance, hierarchy and relative scale.
- Typography: letter proportions, terminal/serif character, spacing, alignment and exact text.
- Palette roles and positive rendering instructions.
- What must remain intact when a reference is supplied.

This stage must produce decisions, not a longer list of terms like “premium, unique, stunning, professional.” It must not override explicit user instructions. A simple preference such as “navy and orange” remains a preference, not a request for an entirely different subject.

### 3. Give each style its own visual rules

| Family | Decisions that should differ |
| --- | --- |
| Wordmark | Custom letter construction, hierarchy, spacing, curves/stacking and purposeful motif integration |
| Monogram | Initials, shared stems, stroke compatibility, counterforms and readability |
| Minimalist/Pictorial | One visual idea, compact silhouette, limited forms and controlled negative space |
| Abstract | A geometric relationship that communicates the concept without over-literal illustration |
| Mascot | Character anatomy, pose, attitude, contour rhythm and controlled shading |
| Cartoon | Exaggerated proportions, expression, gesture and a playful silhouette |
| Retro mascot | Era-specific character construction, expressive movement, ink treatment and warm palette; not merely an orange sports mascot |
| Badge | Enclosure geometry, text paths, border hierarchy and subject-to-frame balance |
| Line art | Stroke rhythm, contour continuity, purposeful breaks and simplification |
| Engraved | Directional hatching, ink contrast, silhouette and a controlled detail budget |
| Icon/Emoji | Rounded compact forms and legibility at small sizes |

### 4. Compile coherent instructions for Nano Banana

Combine the planned concept, style rules, exact text, user overrides and reference roles. Resolve contradictions before submitting. Replace broad negative lists with positive construction instructions where possible: for example, uniformly colored solid regions with hard boundaries instead of only “no gradient.”

Google's [image-generation best practices](https://ai.google.dev/gemini-api/docs/image-generation?hl=en) recommend specific context, intent, descriptive typography, iteration and positive descriptions of desired results. Those recommendations support richer art direction; they do not guarantee creative or original outputs.

### 5. Add optional visual direction, separately from subject references

Build an original or appropriately licensed internal reference set for visual treatment. A reference should communicate line rhythm, lettering construction or composition principles, with explicit instructions to invent new subject shapes and lettering. Do not reuse the exact Logo Diffusion designs as production templates.

The reviewed [fal Pro edit schema](https://fal.ai/models/fal-ai/nano-banana-pro/edit/api) supports multiple `image_urls`, `system_prompt`, `seed` and resolution choices. These provide implementation hooks; they are not equivalent to Logo Diffusion's image-strength slider. Label the role of each reference in the prompt. Benchmark this separately from text-only art direction because image references can introduce subject leakage.

### 6. Make options different by design

For three requested options, plan three distinct concepts rather than resubmitting one compiled prompt. Example: an integrated-letter idea, a narrative character idea and a compact geometric idea, within the selected style. Do not generate extra paid images secretly to select a winner. Let users keep a favorite and refine it while preserving the accepted concept.

### 7. Evaluate quality without pretending it is guaranteed

Check brand spelling, required motifs, style adherence, silhouette legibility and unwanted rendering effects. A vision-model review can flag obvious defects but cannot reliably certify originality or taste. Show the result and support targeted refinement; avoid an unlimited automatic critique/regenerate loop.

## Example: TIP YOUR BARBER

The current prompt fixes legibility but weakens the piggy-bank idea by classifying objects as optional. A better plan could specify TIP YOUR as a restrained upper arc, BARBER as the dominant custom word, a controlled cracked-piggy motif integrated into one letter's counter, coins connecting the two text tiers, and FRESH CUTS as a supporting baseline. The planner should preserve readable spelling and the requested piggy-bank concept together. This is a proposed direction to test, not a claim that Logo Diffusion uses this plan internally.

## Implementation order and validation

1. Add structured concept/typography/composition planning and differentiated style rules. Remove conflicting global defaults. Preserve billing, saved-project recovery and reference identity.
2. Version and save the compiled brief, final prompt and selected parameters so good outcomes can be explained and repeated. Expose a simple “keep this direction” action, not the implementation details.
3. Run a small blind comparison on Wordmark, Minimalist and Retro mascot first. These show the most visible gaps. Keep exact briefs and brand text identical between baseline and proposed pipeline; compare equal candidate counts, not a single output against a curated winner.
4. Only then test visual reference conditioning, broader styles and optional quality review. Do not change every factor at once or attribute gains to an untested component.

Suggested pilot: two briefs in each of the three priority styles, two pipelines and two repetitions: 24 paid images. Record seeds where supported, while treating them as a comparison aid rather than a guarantee of identical output. Human reviewers score brief fidelity, typography, style fidelity, distinctiveness and small-size readability without knowing the pipeline. Promote the change only if it improves results consistently without losing explicit requirements.

## Cost boundary

Retaining one image per billed output keeps the image-generation portion comparable to the current route. Concept planning and optional visual review add separate cost and latency that must be measured. Generating four candidates and returning one multiplies the image-generation portion by four; that should not silently inherit the current single-output credit price. No additional credits or image calls were spent on this audit.

## What remains unknown

Logo Diffusion's exact model, training/fine-tuning strategy, hidden prompts, automatic ranking, and any undisclosed preprocessing remain unknown. The credible approach is to reproduce the publicly demonstrated design workflow and measure the benefit on our chosen model, not to claim that we have copied its private backend or can promise identical quality.
