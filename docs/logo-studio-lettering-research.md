# Expanded Streetwear lettering — Pinterest research

Reviewed and implemented locally on 4 November 2026.

Later correction: the user's original typographic-illustration references take priority over these additional genre examples. See [the reference-focused correction](./logo-studio-streetwear-reference-correction.md) for the current construction rules, blank-prompt flow and pending visual validation. The first-pass gallery samples described in earlier notes are now withheld.

The user's [Pinterest pin](https://ph.pinterest.com/pin/608619337165485834/) was inspected in the browser, including its related pins. It displays Arias Trucking lettering and credits kirillrichert via Dribbble. The [artist's Arias project](https://dribbble.com/shots/9631607-Arias) confirms the custom lettering work. The web reader could not retrieve Pinterest, so Pinterest observations below come from the visible browser page rather than search snippets.

A Pinterest search for “streetwear spiky lettering logo” was also visually reviewed. It included brush, angular interlocking graffiti, condensed spiked display and branching metal-like letter construction. Examples observed included [Vortex](https://ph.pinterest.com/pin/1136666393477247313/), [a brush lettering pin](https://ph.pinterest.com/pin/954129871077023126/), and [a metal-style lettering pin](https://ph.pinterest.com/pin/1151654935995142741/). These are research links, not shipped artwork or authoritative type classifications. Pinterest's automatic captions are not used as exact transcriptions of lettering.

Supporting primary-source portfolio examples: [Seamzone's brush-script Rovela](https://dribbble.com/shots/27552591-Hand-Lettering-Logo-For-Rovela) describes flowing brush construction and an underline swash; [Sergey Shapiro's clothing-brand lettering](https://www.behance.net/gallery/212521527/SELECTED-LOGO-LETTERING-WORKS-FOR-CLOTHING-BRANDS) shows custom scripts for apparel. The user's supplied screenshots remain the main visual reference.

## Product choices

These are descriptive generation directions, not installed fonts or promises to duplicate particular artists. Keep existing `gothic` and `script` IDs compatible with saved work; add eight IDs. The menu now has ten genres plus Auto.

| Label | ID | Construction and reference fit |
| --- | --- | --- |
| Gothic | `gothic` | Existing angular blackletter forms |
| Chicano-inspired script | `script` | Existing controlled connected script and swashes |
| Racing script | `racing-script` | Forward slant, tall lead capitals, compact joins, underline sweep; Arias reference |
| Retro swash | `retro-swash` | Substantial flared curves and expressive looping terminals; Northeast reference |
| Graffiti brush | `graffiti-brush` | Bold hand-painted stroke contrast and bounce; SoulMind reference |
| Wildstyle graffiti | `wildstyle` | Angular interlocking stems and directional terminals; graffiti-related pins |
| Spiked display | `spiked-display` | Condensed bold stems with sparse pointed outer terminals; Ganires/Strongers reference |
| Tribal metal | `tribal-metal` | Curved blade-like strokes and branching thorn terminals; metal-related pins |
| Athletic block | `athletic-block` | Heavy, rhythmic slab/chamfered display letters; Champion/sports lettering in the supplied Pinterest screenshot |
| Flared serif | `flared-serif` | High-contrast custom display serifs and controlled crossbars; serif lettering in the supplied Pinterest screenshot |

The mapping is our visual interpretation; the attached artists did not supply these labels. Outline, depth, layout and colors remain independent, so choosing metal or racing letters does not force a metallic finish or add symbols. Every option preserves exact requested spelling/case, readable counters and no invented wording. Auto follows an explicit genre in the brief and retains the prior Gothic default when unspecified.

## Integration

The shared settings catalog supplies both menu options and server-validated prompt instructions. Updated the style profile to describe all ten genres and avoid forcing new choices into Gothic/script forms. Existing baseline, planned and explicit-variation paths use these instructions. Profile version is `art-direction-5`; variation version is `logo-variation-4`.

The scrollable menu now brings the active option into view during keyboard navigation. Text-only creation and the existing main text, layout, outline and depth controls still apply. No new reference images were copied into public assets, and the existing three example presets remain the gallery examples.

Validation: all 917 tests and the production build passed. Integration tests cover each genre through request normalization, baseline/compiled/planner instructions, public saved settings and explicit variations. Browser checks cover all eleven menu entries, keyboard navigation to the bottom option, and selection persistence after reload. New genres have not each received a live image-generation comparison; this change verifies their routing and instructions, not guaranteed visual similarity.
