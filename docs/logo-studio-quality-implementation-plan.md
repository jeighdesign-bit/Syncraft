# Logo Studio quality improvement — implementation plan

Status: proposed, ready for implementation review. Prepared 23 October 2026.

Objective: turn short user ideas into deliberate logo concepts with recognizable style differences, readable typography and faithful motifs, while retaining Nano Banana Pro for creation and Recraft for utility operations.

This document is a plan. It does not change application behavior or authorize additional paid tests. Findings and public research are recorded in [the quality audit](./logo-studio-quality-strategy.md).

## Intended user experience

1. Choose a style.
2. Type a short idea, or upload an image/sketch. Extra instructions remain optional for reference modes.
3. Supply exact brand text where lettering is essential.
4. Generate the selected number of options. Each option has a deliberate concept, not just another random rendering of the same prompt.
5. Keep a favorite and refine its details without losing the accepted direction.

Users do not need to write art-direction instructions or repeat the style name. The existing loading animation, history groups, sharing, downloads and credit displays continue to work. A request for one output returns one output; no hidden candidate generation.

## Architecture to add

```text
Short idea / source + style + brand settings
    ↓
Validate intent and required text
    ↓
Normalize design brief
    ↓
Plan concepts and visual decisions
    ↓
Validate plan against explicit user constraints
    ↓
Compile style-specific generation instructions
    ↓
Nano Banana Pro — one image per requested option
    ↓
Save result and its design direction
    ↓
User selection → targeted refinement
```

### New modules

| File | Responsibility |
| --- | --- |
| `src/lib/logoStyleProfiles.mjs` | Versioned visual rules for all 12 styles: composition, typography, geometry, detail, palette roles and rendering |
| `src/lib/logoDesignBrief.mjs` | Normalize exact text, essential motifs, relationships, user overrides and reference roles; validate planner output |
| `src/lib/logoArtDirectorServer.js` | Server-only planning adapter with a bounded call, validated structured output, usage logging and deterministic fallback |
| `src/lib/logoPromptCompiler.mjs` | Convert a validated brief and one design direction into coherent provider instructions |
| `src/lib/logoGenerationBatchServer.js` | One planning pass per multi-option request, atomic quota reservation and replay-safe submission per slot |
| `tests/logoArtDirection.test.mjs` | Intent preservation, style distinction rules, compiler constraints and malformed planner output |
| `tests/logoGenerationBatch.test.mjs` | Planning reuse, quota races, credit charges/refunds and recovery |
| `scripts/evals/logo-quality-eval.mjs` | Explicitly invoked, budgeted quality evaluation; dry-run by default |

Adapt these names to repository conventions during implementation; avoid introducing a second unrelated generation service.

### Existing integration points

- `src/lib/logoStudio.mjs`: delegate generation prompt building to the compiler; keep operation validation and existing export/history helpers. Keep the explicit edit-instruction path separate.
- `src/lib/logoFal.mjs`: consume a compiled prompt and optional seed/reference roles instead of deriving all art direction in the provider adapter.
- `src/lib/logoStudioServer.js`: reserve work, persist the plan, charge with the existing verified ledger, submit the existing fal endpoints, then use existing save/recovery behavior.
- `src/app/api/logo-studio/route.js`: add a validated batch-generation action under the feature flag. Keep existing operations compatible.
- `src/app/logo-studio/LogoStudio.js`: submit one generation batch rather than independent client-side calls for each option; render a concise direction label if useful.
- `src/lib/logoStudioIntegrity.mjs`: include all persisted batch/plan metadata in the existing signed state. Never accept a client's compiled prompt, billing identifier or supposedly approved plan as authoritative.
- Reuse `creditLedger.js`, project access checks, storage ownership checks, rate limits and cron reconciliation.

## Phase 1 — style rules and constraint cleanup

Deliver this first, behind `LOGO_ART_DIRECTION_ENABLED`, defaulting off.

1. Extract the 12 visual profiles from one-line descriptions into structured rule sets.
2. Remove blanket internal layout/palette assumptions when the chosen concept calls for another lockup. A square output canvas can still contain a wide wordmark or an oval badge.
3. Preserve exact brand/tagline spelling, explicit colors and required object relationships.
4. Separate content requirements from rendering technique. The selected style controls treatment; it does not erase the subject.
5. Resolve competing instructions before compilation. A Wordmark must retain readable lettering and an explicitly requested piggy-bank motif; the compiler must not automatically downgrade the motif to optional decoration.
6. Preserve the existing plain-background default unless users explicitly request another supported background. White backgrounds are not themselves the source of generic design.

Profile requirements:

| Style | Concrete direction fields |
| --- | --- |
| Wordmark | Letter proportions, custom letter feature, text hierarchy, spacing, baseline/arc and motif integration |
| Minimalist | One focal idea, few major forms, compact silhouette and intentional negative space |
| Retro mascot | Era, character proportions, gesture, ink rhythm and nostalgic palette |
| Mascot | Anatomy, pose, expression, silhouette rhythm and controlled shading policy |
| Cartoon | Exaggeration, expression, gesture and playful contour construction |
| Monogram | Exact initials, shared stems, counterforms and letter readability |
| Badge | Enclosure, border hierarchy, text path and subject/frame balance |
| Pictorial | Recognizable subject, contour simplification and one distinctive visual relationship |
| Abstract | Geometric transformation and concept association without unnecessary literal detail |
| Line art | Stroke continuity, weight, breaks and contour economy |
| Engraved | Directional hatching, contrast, silhouette and detail budget |
| Icon/Emoji | Rounded compact forms, limited detail and small-size clarity |

Acceptance: deterministic tests demonstrate that required motifs and exact text survive compilation, styles have materially different construction instructions, and legacy utility/edit paths remain compatible. This validates instructions, not image quality.

## Phase 2 — automatic art direction, Text to Logo first

Add a planner that makes design decisions rather than merely expanding adjectives.

### Structured output

Persist a versioned object containing:

- Raw user brief and normalized brand/tagline/explicit preferences.
- Essential subjects, motifs and relationships.
- For each option: `directionId`, short concept summary, focal idea, composition, shape construction, typography, palette roles, detail/rendering rules and required reference preservation.
- Planner version, style-profile version and compiler version.
- Final compiled prompt, seed where supported and selected provider parameters.
- Planner provider/model, usage, elapsed time, fallback reason and measured/estimated cost with its basis clearly distinguished.

User-entered words, brand text and color choices are authoritative. Planner suggestions fill unspecified design choices. Generated JSON cannot override validated inputs, change the billed count, insert arbitrary URLs or substitute a different subject. The planner receives no secrets.

### Provider decision

Keep the planner behind a server-only `planLogoDirections()` interface. Per the user's updated instruction, all remote planning goes through fal's supported `openrouter/router` endpoint, using the existing `FAL_KEY`. The low-cost default is `qwen/qwen3-30b-a3b-instruct-2507`; the model is configurable through `LOGO_PLANNER_MODEL`. JSON results are validated locally. Confirm latency, reported cost and intent fidelity in smoke tests; visual quality still needs the paired image pilot. Direct Google API planning is removed.

For Text to Logo, require structured text planning. For Image/Sketch, add visual interpretation in Phase 4; do not run a text-only planner that guesses the subject from a filename or empty prompt.

### Bounds and fallback

- One planner call per batch, no more than four directions and a bounded response size.
- Start with an eight-second planning deadline as a tunable target. Measure before adopting it as an SLA.
- Invalid, contradictory or timed-out plans use a deterministic style-specific fallback. Record the fallback; do not call an unbounded repair/retry loop.
- Planning alone does not consume an image-generation credit. Record its provider cost as platform cost even when generation never proceeds.
- Plan/compiler changes do not alter existing saved jobs. Store a frozen plan for a submitted batch.

Acceptance: a short idea produces a concrete concept, layout and typography plan without repeating the style; failures remain usable through fallback; exact text and essential motifs cannot be silently dropped.

## Phase 3 — deliberate multi-option generation and durable state

Replace the current repeated client submissions with one server-side batch request for new generation. Keep the existing single-request route as a compatibility path until rollout is complete.

1. Accept a unique batch request ID, mode, style, count, brief and validated source reference.
2. Authorize project access, validate source ownership, and atomically reserve the requested number of available logo slots. Return a clear rejection when the requested count exceeds remaining quota; do not silently generate a different count.
3. Save reserved jobs using the existing active `starting` status and a separate internal stage such as `planning`. Include `batches` metadata in signed canvas state; old projects default to an empty batch list.
4. Outside any compare-and-swap mutation callback, call the planner once and persist the validated directions before submitting images. Concurrent requests must not duplicate planning or submissions; use a durable batch claim/lease and bounded recovery.
5. For each reserved slot, attach its frozen direction, charge through the verified credit ledger and submit one Nano request. Keep its idempotency key, billed user, charge ID and provider request ID.
6. Handle partial success per output. Refund rejected/failed charged slots using the existing verified refund path; retain successful siblings. Never charge a second time to resume the same job.
7. A refresh/status GET may reconcile saved work but must not initiate a fresh paid generation. Stalled pre-submit work is released or failed safely through the recovery path. An ambiguous provider submission without a recorded request ID must not trigger a blind paid resubmission.
8. Record planner and image costs separately. Maintain editor-pays-own-credits behavior and project-owner-bound canvas signatures.

Distinct options must differ in at least a meaningful design choice such as visual metaphor, letter integration or composition. Changing only color or random seed is insufficient. One selected option still returns one concept; it does not hide four candidate renders.

Acceptance: concurrent/replayed batches cannot exceed quota, duplicate charges or duplicate provider submissions; partial failures and disconnections recover; one batch plans once; successful jobs are independently usable.

## Phase 4 — Image/Sketch interpretation and separate style references

1. Add a vision-capable brief interpretation path for uploaded images and sketches. Identify only visible subjects/structure, preserve explicit user instructions, and record uncertainty instead of inventing identity or intent.
2. Preserve uploaded subjects and sketch arrangement as structural constraints. Use the existing source image in the Nano edit request regardless of whether interpretation succeeds.
3. Maintain separate roles for subject reference, sketch structure and optional style reference. A style image must never silently replace the user's subject reference.
4. Create an original or appropriately licensed visual-direction library, beginning with Wordmark, Minimalist and Retro mascot. Do not use Logo Diffusion gallery designs as production templates.
5. Extend the provider adapter to pass approved multiple references with an explicit description of each role. Keep this behind `LOGO_STYLE_REFERENCES_ENABLED` while evaluating subject leakage and visual benefit.
6. Do not expose a claimed image-strength parameter unless the selected API actually supports it. Prompt-based preservation and seed logging are not equivalent to Logo Diffusion's strength control.

Acceptance: image/sketch generation still works with a blank extra prompt; reference identity/layout survives; style examples do not introduce their own names or subject shapes. Evaluate visual references as a separate experiment from art-direction text.

## Phase 5 — keep a direction and refine it

Reuse AI edit and Variations rather than adding a second editing product.

- Save a short user-readable direction summary with each new output.
- Refining a favorite inherits its frozen concept and source image. A small color or expression change should not produce a fresh logo concept.
- A requested new concept takes the variation path and counts against the existing original/variation quota.
- Keep backend prompts, planner JSON and usage metadata server-side. Expose only useful summaries and existing job fields.
- New planner calls do not run for Remove BG or Vectorize. Routine targeted AI edits should preserve their existing direct instruction path.

Acceptance: edits preserve source identity and typography except where the user requested a change; utilities have no planning dependency; older projects remain editable/downloadable.

## Phase 6 — quality evaluation and rollout

### Functional checks

Extend the current 67-test Logo Studio suite with meaningful coverage of:

- Required motifs and letter relationships retained alongside exact brand text.
- Explicit color/style overrides and short or empty reference-mode briefs.
- Contradictory/malformed planner responses, deadline and fallback behavior.
- Distinct directions for a multi-option request.
- Batch idempotency, quota races, partial failures and billed-user attribution.
- Resume/reconciliation without fresh image charges; old signed project compatibility.
- Reference-role assignment and exclusion of internal planning metadata from public snapshots.

Run the production build after integration. Follow the installed Next.js guides before route/client changes.

### Visual pilot

Use two briefs in each of Wordmark, Minimalist and Retro mascot. Compare the frozen baseline and new pipeline with two repetitions per brief: 24 total images, producing 12 paired comparisons. Keep brand text, source material, output count and generator model/resolution equal. Log paired seeds where supported without assuming strict determinism. Keep visual reference conditioning off for this first experiment.

Review outputs blind for brief fidelity, spelling, required motifs, style adherence, distinctiveness and small-size readability. Include TIP YOUR BARBER as a regression case. Do not compare a fresh single output against a curated gallery winner as the sole success criterion.

Proposed promotion gate: new pipeline preferred in at least 9 of 12 pairs, improvements distributed across at least 4 of 6 briefs, no observed exact-brand-text failures or dropped required motifs in the pilot's new outputs, and no billing/recovery regressions. This is a pilot gate, not a guarantee for all future images. If it fails, revise the relevant stage and budget a new experiment explicitly.

After the pilot, expand tests to the remaining nine styles and all three modes. Then test style references independently. Introduce machine-assisted quality review only if it catches practical defects reliably; human judgment remains necessary for taste and distinctiveness.

### Cost and release controls

- Keep the current 10-credit-per-output behavior during an internal flagged pilot; review measured planning cost and margins before broad enablement.
- At the previously verified $0.15 image rate, the 24-image pilot has an estimated image-provider component of $3.60, excluding planning, storage and any provider charges for failed attempts. Verify current rates and set an explicit run budget before executing it.
- No automatic multi-render selection or unlimited aesthetic retries. Technical failures retain the existing refund policy; a subjective dislike is not automatically classified as a provider failure.
- Log planning latency, fallback rate, image success, provider cost per delivered output and user preference results. Seed control and 2K resolution are experimental knobs, not promised creativity improvements.
- Enable for internal accounts first, then a small cohort, then wider rollout after review. Disable the feature flag to route future jobs to the baseline compiler; keep completed and in-flight jobs bound to their recorded versions.
- Explicitly test rollout and rollback with old jobs, shared editors/viewers, partially completed batches and cron reconciliation.

## Recommended first implementation package

Implement Phases 1–3 for Text to Logo, behind a disabled-by-default flag, with rules for all 12 styles and the visual pilot concentrated on Wordmark, Minimalist and Retro mascot. Preserve Image/Sketch behavior initially except shared rule cleanup. Add their vision-based planning and style references only after the first pilot demonstrates a benefit.

Deliverables: versioned style profiles, validated concept planner and fallback, prompt compiler, durable multi-option batching, audit metadata, regression tests, production build, and a written pilot report. Completion means measured quality improvement and reliable billing/recovery, not merely longer prompts or more settings.
