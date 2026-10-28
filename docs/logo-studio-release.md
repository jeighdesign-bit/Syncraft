# Logo Studio first release

Provider update: creation uses Nano Banana Pro; Recraft supports background removal and vectorization. See [current providers and pricing](./logo-studio-providers.md). The original release notes below describe the initial implementation.

Implemented locally on 2026-10-21. No deployment performed.

## Included

- `/logo-studio` and `/logo-studio/[id]`: text, reference-image, and sketch creation; eight styles; brand name, tagline, and palette guidance; one or four results.
- Sketch brush/eraser, undo/redo, clear, and uploaded-sketch alternative.
- Saved result versions, variations, instruction edits, before/after preview, and preview background choices.
- Transparent PNG through background removal and genuine SVG through Recraft vectorization; exports do not overwrite the source version.
- Each generated image/edit/background removal/vectorization costs 12 Syncraft credits; four generated options cost 48. Costs are centralized in `src/lib/pricing.js`.
- The existing Scan Phone homepage action is replaced, its upscale UI and shared sync listeners are removed, and its API returns HTTP 410. Old mobile links explain the retirement.
- Logo Studio appears in navigation and the project chooser; homepage saved projects route to the logo workspace.
- No schema migration: existing `projects.canvas_data` stores versioned studio state. Owner access is required. Signed state prevents direct client edits from forging provider or billing references; the server credit ledger prevents replayed snapshots from generating/refunding the same charge twice.
- Compare-and-swap revisions handle concurrent tabs. Independent job charges allow failed batch slots to refund without affecting saved outputs.
- Queued jobs resume on reopening. A protected `/api/cron/logo-studio` reconciliation route is configured every ten minutes for deployment; local development resumes through workspace polling. It uses the existing `CRON_SECRET`.
- Existing three-day project retention also applies to logo projects. Cleanup includes version assets and source uploads.

## Providers and configuration

- Fal Nano Banana Pro: text generation, reference/sketch generation, variations, and instruction edits.
- Fal BiRefNet: background removal.
- Recraft: SVG vectorization.
- Existing `FAL_KEY`, `RECRAFT_API_TOKEN` or `RECRAFT_API_KEY`, Supabase service configuration, and storage configuration are reused.
- Signing uses the Supabase service-role key on the server. Rotating that key invalidates existing signed studio snapshots; preserve/re-sign active projects as part of a rotation.
- Results are private to the account at the application level. Assets use the existing public-URL storage system; this release does not introduce signed private-download storage.

## Verification

- Production build succeeds.
- Full automated suite passes, including isolated execution of the actual job service with mocked I/O for owner isolation, simultaneous duplicate submissions, revision conflicts, pending-job recovery, partial failure, insufficient credits, refunds, signed-state tampering/replay, and SVG derivatives.
- Controlled live checks with synthetic test artwork: text generation and instruction edit each returned 1024×1024 PNG; background removal returned a non-opaque RGBA PNG; Recraft returned SVG containing 17 paths.
- Read-only checks confirmed the existing database fields and JSON revision-filter syntax.
- Local HTTP checks: unauthenticated logo API and reconciliation calls return 401, retired mobile upload returns 410, and existing homepage/upscale routes load.
- Browser checks cover the desktop workspace, preset selection, mode switching, login gate, brief retention, and a 390px mobile layout without horizontal overflow.
- A complete signed-in browser run against live project persistence and account billing has not been exercised because the local browser session is signed out. Provider operations and service/billing behavior were tested separately; production deployment has not been verified.

## Deferred

Merch/product mockups, matching icon sets, logo systems, branding presentations, material effects, exact vector-color editing, and video animation are not part of this release.

The live-provider checks establish endpoint compatibility and one example per operation, not a broad quality benchmark. Users should review lettering, paths, and fine details before production use.
