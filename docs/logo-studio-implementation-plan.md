# Logo Studio implementation plan

Date: 2026-10-21
Status: planning only; application changes have not started.
Reference: [Logo Studio research](./logo-studio-research.md).

## Outcome

Replace Scan Phone with Logo Studio. Users can create a logo from text, a sketch, or an image; explore variations; edit a selected result; and export PNG or genuine SVG paths. Keep the existing tracing, extraction, background removal, and upscaling workflows working.

## User experience

- Homepage quick action: replace Scan Phone with Logo Studio using a consistent Lucide icon and the existing button styling.
- Dedicated /logo-studio workspace; saved projects open at /logo-studio/[id]. Use the existing authentication flow and preserve the intended destination after login.
- Add Logo Studio to the new-project chooser as a creation tool; keep Logo / Wordmark Tracing as the existing tracing tool.
- Desktop: settings panel on the left, results/selected-logo canvas in the center, version thumbnails alongside or below the canvas. Do not force a dense three-column layout at narrow widths.
- Initial modes: Text, Image, Sketch. Show only the inputs relevant to the selected mode.
- Text inputs: project/brand name, optional tagline, description, style, and palette. Brand text is separate from the visual prompt.
- Image mode: upload preview, clear/replace actions, desired changes, and a preservation preference whose limitations are explained in plain language.
- Sketch mode: brush size/color, eraser, undo/redo, clear, and uploaded sketch support. Also accept file upload so drawing gestures are not the only input method.
- Eight initial categories: minimalist, mascot, retro mascot, badge, monogram, wordmark, line art, abstract. These are Syncraft's curated presets, not a claim of identical competitor outputs.
- Start with 1 or 4 results, subject to provider support and unit-cost evaluation. Display the complete credit estimate for the selected count before submission.
- Result actions: Select, Make Variations, Edit with AI, Remove Background, Vectorize, Download. Preserve the original and add edits as new versions.
- PNG preview supports white, dark, and checkerboard backgrounds. Preview backgrounds must not alter the downloaded file.
- Show accurate queued/running/saving/failed states; never invent a completion percentage or fixed ETA.
- Use existing Syncraft colors, typography, and spacing after inspecting the shared styles. Skill search did not provide a verified editor-specific visual match; existing-product consistency and general UX guidance are the fallback.
- Visible labels, keyboard-operable controls, useful error messages, focus visibility, responsive layouts, and reduced-motion support.

## Scope and sequence

### 1. Validate provider and production outputs

- Compare Recraft generation/vector capabilities with existing provider infrastructure using a small fixed set of test briefs.
- Cover simple symbols, mascots, initials, exact brand lettering, photo-to-logo, and rough sketch structure.
- Evaluate fidelity, usable SVG paths, background behavior, latency, and actual cost per successful asset.
- Choose task-specific providers; do not add user-facing model selectors in the first release.
- Recraft is a candidate, not an integration already present in the inspected code. Confirm credentials and endpoint contracts before live integration tests; use mocks for development and avoid uncontrolled paid batches.
- Confirm current Next.js guides in node_modules/next/dist/docs before application code changes, especially routing, server handlers, and client/server boundaries.

### 2. Introduce project persistence and reliable generation

- First inspect existing project schemas, asset storage, row-level access, and credit ledger contracts.
- Prefer existing project records with an additive tool discriminator if compatible; store generated assets and operation/version relationships separately where necessary.
- Proposed records: project owner/tool/title; job operation/status/provider request ID/request key; asset URL/type/dimensions/parent version/prompt/style; vector/background-removal derivatives.
- Persist accepted jobs before provider submission and use idempotency keys to prevent duplicate charging or generation after refresh/retry.
- Reconcile provider success, storage success, and credits. Only expose download links after saving the asset. Handle partial batch success explicitly.
- Scope every read/write to the authenticated owner or existing project permissions. Reuse upload validation, storage ownership checks, SSRF protections, rate limits, and private asset conventions.
- Add logo operation costs to the central pricing configuration after provider cost testing; do not copy a competitor's credit prices.

### 3. Build the complete first release

- Implement the workspace and the three input modes.
- Add provider adapters for text/image/sketch generation and instruction edits, keeping operation validation on the server.
- Proposed API surface: create/list logo projects through compatible project APIs; submit a logo operation; fetch job status; retrieve saved versions. Exact route names follow the architecture audit.
- Implement result selection, four-result comparison, variations, and non-destructive AI edits.
- Reuse or adapt existing background-removal and tracing services only after confirming compatible project fields and billing semantics.
- Download ordinary PNG, transparent PNG after background removal, and SVG after successful vectorization/native vector generation. Never wrap a bitmap in SVG and call it vector output.
- Keep exact vector recoloring distinct from approximate AI recoloring. Do not promise editable fonts in generated lettering.

### 4. Retire Scan Phone and connect the launch points

- Replace the homepage Scan Phone action in src/app/page.js; it currently calls setShowQrModal, for which the inspected search found no matching declaration.
- Remove the Scan Phone action and QR section from src/app/upscale/page.js; retain ordinary image upload and upscale behavior.
- Remove GlobalMobileSync from src/app/layout.js and retire src/components/GlobalMobileSync.js after confirming no remaining consumers.
- Remove pendingMobileImage/mobileTraceType listeners, sync storage keys, broadcast listeners, and unused imports after checking all references.
- Retire /mobile and /api/upload-mobile with a clear discontinued-upload response or transition page for old links, rather than leaving a broken upload flow.
- Remove the retired upload endpoint's proxy rate-limit entry. Remove react-qr-code only if a full reference search confirms no other usage.
- The upscale page also passes syncSessionId as projectId to another component: inspect that consumer and replace it with the appropriate real project ID if required. Do not blindly delete the state.
- Preserve already uploaded files, existing project data, and payment QR functionality. This migration concerns phone-upload scanning.
- Enable the replacement button only when the core workspace is usable. Hide unfinished premium tools rather than shipping dead controls.

### 5. Verify and release

- Validate that each mode produces a saved result and that editing/variations retain their source version.
- Verify owner isolation, expired sessions, malformed uploads, repeated submissions, provider failures, save failures, and partial batch refunds.
- Verify refresh/reopen behavior for running jobs and saved projects.
- Inspect downloaded transparency and SVG path content; compare render quality against the selected source.
- Regression-check current tracing, extraction, background removal, normal uploads, and upscaling after removing mobile sync.
- Check button navigation, login return destination, keyboard interaction, narrow screens, and loading/error states.
- Run relevant existing tests, focused new tests for job/credit reliability, and the production build. Use controlled live-provider checks only where credentials and test budget permit.

## Later releases

1. Branding: product mockups, merch presentations, logo-system variants, matching icon sets, and brand presentation layouts.
2. Effects: metallic, embroidery, balloon, 3D image renders, and uploaded style-reference transfer.
3. Animation: separately evaluate image-to-video providers and original-logo ending fidelity.

Do not represent one generated merch/icon collage as separately editable production assets. Separate exports require individual generation or validated extraction.

## Completion criteria for first release

- Scan Phone is retired across its user interface and unused sync flow.
- Logo Studio opens from the former homepage button and new-project chooser.
- Text, image, and sketch inputs work end to end with real saved assets.
- Variations, instruction edits, background removal, and SVG export work with explicit credit costs.
- Original and edited versions survive refresh and reopening.
- Failures do not leave users with duplicate charges or falsely successful outputs.
- Existing Syncraft production workflows continue to work.

## Decisions made / remaining dependencies

- Plan now; do not modify product code in this turn.
- First release includes all three creation modes and the finishing workflow; branding effects and animation are later additions.
- Final provider selection, credit amounts, database migration shape, and batch strategy depend on the validation stage. These are implementation decisions, not reasons to stall layout and architecture work.
