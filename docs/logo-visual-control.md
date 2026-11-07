# Recraft Text to Logo visual controls

This adds **native visual style references** to new, server-selected Text to Logo jobs. It does not change the Recraft V4.1 model, 1024px PNG output, one-image request count or 8-credit app charge. Image creation, Sketch creation, Streetwear, edits, variations and utilities remain outside this rollout.

## Why this is different

The earlier text-only review produced serif AV letters despite Sans being selected, and added HRN to a symbol-only heron. More prompt instructions did not establish reliable visual control. Recraft V4.1 supports `style_reference_urls` and `style_match` but does not support V3's curated-style, negative-prompt, `no_text` or text-layout controls. This implementation uses the supported style-reference input, not unsupported flags or a hidden model switch.

The first pilot repeats those two failed briefs with a visual guide attached. It evaluates literal requirements, not a subjective claim that every logo now looks good. No pilot is automatically accepted or published.

## Server-controlled rollout

`LOGO_TEXT_VISUAL_STYLES` is empty/off by default. A comma-separated list enables individual styles, for example `line,monogram`; `all` is available only after broader validation. The flag is not exposed as a user setting. A validated request cannot supply its own reference URL, file path or `visualGuidance` descriptor.

The server freezes `{version, style, match}` into the signed job before charging. The provider adapter builds the guide from that job's saved settings. A flag change does not retrofit pending or saved jobs. Jobs without the descriptor keep their existing requests. Streetwear is excluded even when the flag is `all`.

The pilot process temporarily enables only Line and Monogram; it does not edit `.env` or enable the feature for regular localhost generations. The actual images must be inspected before rollout.

## Guides and controls

| Guide | Behavior |
| --- | --- |
| Typography | Renders the exact requested name/initials as actual licensed glyph paths. Supports sans, serif, script/cursive, Gothic, rounded, bubble, geometric and block families. Selected case, italic, stacked/diagonal arrangement and dimensional monogram treatment affect the guide. |
| Line Art | Text-free original contour samples. Thin/thick and geometric/curved selections change the pixels supplied to Recraft. No example brand or invented initials appear in the guide. |
| Engraving | A selected stipple, line or crosshatch technique gets its own tonal construction sample; stipple does not inherit a hatched goat reference. |
| Enclosure | Selected Badge shape generates the actual outer-contour guide. |
| Abstract/Pictorial | Explicit construction can select organic versus geometric form guidance. |
| Icon | A selected viewpoint has genuine front/side/top planes, rather than a front view with an offset shadow. |
| Other defaults | Use text-free crops from Syncraft's own approved artwork. Source wording is excluded. Public originals and examples are not modified. |

References are appearance guides, not replacement subjects. Prompt wording preserves the user's subject, pose, exact text and selected controls. Native color controls remain in place. A reference's old colors are removed when explicit palette roles would conflict. Examples conflicting with explicit character framing or outline settings are omitted rather than overriding those controls. Unsupported font glyphs and wording too small for a useful guide also omit the guide as a whole; they are never replaced with missing-glyph boxes.

Licensed font files, their licenses and original guide provenance are under `src/assets/logo-guides`. The asset manifest records source and output hashes. `scripts/build-logo-visual-guides.mjs` recreates the static original-art guides; it does not call an image provider or write website examples.

## Provider request, cost and traceability

- Recraft receives an inline local PNG through `style_reference_urls`, with `style_match: flexible`.
- There is one generation POST and no automatic retry/reroll.
- A reference request includes Recraft's style-creation charge: fallback provider estimate is $0.04 instead of $0.035. The actual API-unit cost is retained when returned. The app charge stays 8 credits.
- Saved job metadata records the guide role/family, image SHA-256, submitted-prompt SHA-256 and returned native style ID. The public job serializer exposes neither guide blobs nor internal metadata.
- Static guide PNGs/fonts are included in the Next.js server trace; `fontkit` runs as a server package. Rendering needs no system-installed fonts, browser, external font CDN or remote reference fetch.

## Verification and pilot

Automated coverage verifies all twelve default guide paths, actual PNG dimensions, different font/geometry/weight/viewpoint pixels, exact saved settings, unsupported glyph behavior, protected operations, internal URL validation, one normal app charge, replay protection and native provider payloads. Existing Image/Sketch hashes and Streetwear prompt snapshots remain unchanged. All 974 repository checks and the production build pass. The production trace includes 8 font files and 10 original-art guide images.

`scripts/evals/logo-visual-control-pilot.mjs` prepares two immutable requests and their visual criteria under `outputs/text-logo-visual-control/pilot`. A dry run spends no credits and makes no generation call. The proposed live pilot is 2 × 8 = 16 app credits; the account balance was verified as 0. A 16-credit grant requires explicit user approval. The script makes no grant unless the separate authorized flag is supplied, and has a durable receipt to prevent repeated grants.

Until that pilot runs and its outputs are inspected, this is an implemented and tested request path, **not a visually proven quality fix**. A passing Monogram/Line pilot does not validate the remaining ten styles.

Primary references: [Recraft V4.1 parameters](https://www.recraft.ai/docs/api-reference/models/recraft-v4-1), [Recraft style references and match modes](https://www.recraft.ai/docs/api-reference/styles), [fontkit glyph outlines](https://github.com/foliojs/fontkit), [Fontsource](https://fontsource.org/docs/getting-started/install).

## Authorized pilot result — 6 November 2026

The user approved the 16-credit grant and exactly two outputs. Both completed on Recraft V4.1 with native style references. The AV result has sans-serif terminals and a connected geometric construction; the heron is a single contour-drawn bird on one leg with no HRN or other wording. Both pass the prepared criteria in this one-sample visual review. Guide and submitted-prompt hashes were reconstructed from the actual saved jobs and matched their native-request traces. Billing audit: one 16-credit grant, two 8-credit charges, 0 remaining, no automatic rerolls.

Local `.env` now enables `LOGO_TEXT_VISUAL_STYLES=line,monogram`, and the verified local development server was restarted. Other styles remain outside the new reference rollout pending their own visual checks. This is not a production deployment or a claim that all subjects, fonts and settings are validated. Pilot outputs remain review-only and are not added to the website examples. Comparison: `outputs/text-logo-visual-control/pilot/before-after.png`. The before/after images repeat the same user brief and settings but use different seeds and prompt versions; this is a qualitative comparison, not an isolated benchmark.
