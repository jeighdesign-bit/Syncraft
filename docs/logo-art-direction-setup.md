# Text to Logo art direction setup

> Current Text-only behavior (5 November 2026): see [Text to Logo direction contract](./logo-text-direction.md). The historical notes below describe earlier versions; Image/Sketch and Streetwear retain their existing behavior.


Text to Logo uses Recraft V4.1. Its first option follows the exact user brief and selected controls. Additional options use bounded, style-specific construction directions that preserve the same subjects, lettering, framing, palette and geometry. A remote text model no longer rewrites complete briefs or invents anatomy and color-role assignments.

## Configuration

`LOGO_ART_DIRECTION_ENABLED=true` enables durable multi-option preparation and storage of directions, seeds and compiler versions. Preparation is local and costs no planner API credits; `LOGO_PLANNER_MODEL` and planner credentials are no longer used. With the flag off, Text generation uses the same first-option compiler. Recraft credentials are required for Text output. `FAL_KEY` remains required for Image/Sketch generation and editing, plus recovery of existing fal jobs.

Image/Sketch creation, edits and variations continue using Nano Banana 2. Text edits/variations and background/vector tools keep their documented provider routing. See [providers](logo-studio-providers.md).

## Constraint priority

- Preserve subjects, exact text and explicit relationships in the brief. Font, construction, framing, technique and color controls override conflicting brief text or style defaults.
- Option one adds no optional concept changes. Other options may vary only unspecified construction decisions; they cannot add subjects, reassign colors or change selected framing.
- Automatic Streetwear defaults apply only where the brief and controls leave a choice unspecified. Color-role instructions retain requested outline thickness.
- Recraft receives the selected colors as native RGB controls in addition to role-specific prompt instructions. These are provider preferences, not guaranteed pixel-exact output colors.
- Monograms preserve their selected letters, font and requested joined/separate construction. Engraved stipple/crosshatch/line/etch techniques remain distinct. Object framing never asks a sailboat or other object to grow character limbs.
- Automatic Text backgrounds preserve an explicit background in the brief. Otherwise, they prefer white for dark foregrounds and a contrasting dark field for explicitly white/light subjects. Explicit background color controls remain authoritative; Streetwear retains its existing default. The compiler does not request a tile or frame as a contrast workaround.
- Abstract geometric controls describe construction of the subject itself. Symbol styles preserve requested pose and facing direction and exclude unrequested letter-shaped backdrops or enclosures. These are generation instructions, not a guarantee that every provider image obeys them.

## Durability and billing

The client submits one batch and reserves 1–4 slots atomically. Preparation happens once. Replays return the reservation and do not submit or bill again. Each output keeps its verified ledger key, and failed charged slots use the existing refund path. Local preparation records zero cost. Historical fal planner usage, frozen prompts, provider outputs and queue endpoints remain recoverable through their existing paths. Public project snapshots exclude private compiler data.

## Verification

Run `node --test tests/logo*.test.mjs` and `npm run build`. Coverage checks every available field option through both direct and compiled Text paths, color RGB payloads, conflicting defaults, billing/replay and all provider routes.

`node scripts/evals/logo-style-fidelity.mjs --run-paid` runs a paid live Recraft review across all 13 styles and six paired settings cases. Existing completed cases are skipped unless `--force` is explicit; `--style=<id>` selects a style. Artifacts, exact prompts/settings, seeds and visual-review notes are saved under `outputs/logo-style-review/`. These evaluations do not create app projects or debit customer app credits. Samples demonstrate observed behavior, not perfect adherence across every combination.
