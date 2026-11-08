// Original design principles distilled from a cross-style gallery review.
// Text creation and enhancement share this vocabulary. No source identities,
// gallery prompts or reference artwork are sent to the generation provider.
export const LOGO_STYLE_LANGUAGE_VERSION = 'style-language-1';

export const LOGO_STYLE_LANGUAGE = Object.freeze(Object.fromEntries(Object.entries({
  minimalist: {
    construction: 'A reduced identity symbol whose contour carries recognition. Keep the subject’s most identifying proportion or shape transition; remove incidental detail before removing that feature. Coordinate positive masses and open gaps using the selected solid, outline or negative-space construction. Economy means a resolved visual idea, not an anonymous stock silhouette.',
    enhancerFocus: 'Clarify one identifying contour or proportion of the existing subject. Do not invent a hidden symbol or force negative space when another construction is selected.',
  },
  mascot: {
    construction: 'An illustrated brand character whose species, expression and pose are readable from its silhouette and defining features. Establish a hierarchy from major anatomy to facial focal features to selective detail; separate overlapping limbs and facial features with clear gaps. Expression comes from brow, eye and mouth relationships, not automatic aggression. Match the selected framing and detail budget; avoid interchangeable esports anatomy.',
    enhancerFocus: 'Clarify the requested expression through one facial relationship, or clarify anatomy/overlap in the requested pose. Do not add aggression, a jersey number, clothing or equipment.',
  },
  retro: {
    construction: 'A mid-century advertising character with rubber-hose gesture, elastic proportions and expressive ink contours. Build personality through the relationship of face, body and gesture, with rhythmic bends and readable spot-ink shapes. Keep the requested anatomy, action and props coherent. Vintage character construction is distinct from an angular sports mascot, a modern emoji or a distressed poster; gloves, shoes and grain are not mandatory.',
    enhancerFocus: 'Clarify the character’s existing gesture or elastic proportions. Do not automatically add gloves, shoes, props, distress or a slogan.',
  },
  cartoon: {
    construction: 'A contemporary cartoon character built around an appealing proportion contrast and a readable action or expression. Coordinate rounded or angular contours to suit the subject rather than imposing the same face on every character. Use connected major forms, clear limb overlaps and grouped color planes. Selected detail may enrich the character, but must not turn a compact identity into a scene or a collection of accessories.',
    enhancerFocus: 'Clarify one proportion contrast or the existing action and limb separation. Keep the requested subject and age; invent no costume, companion or setting.',
  },
  badge: {
    construction: 'An integrated emblem whose enclosure organizes the subject and any supplied lettering into one hierarchy. Relate border geometry to the artwork through shared angles, curves or alignment, with a deliberate inset gap. The selected badge shape defines the outer contour; do not default every badge to a sports shield. Text-led, subject-led and reduced emblems are valid when the brief supports them; omit filler heraldry.',
    enhancerFocus: 'Clarify the requested subject’s defining feature or its relationship within the chosen enclosure. The backend handles borders and lettering; invent no dates, stars, crowns or ribbons.',
  },
  monogram: {
    construction: 'A custom lettermark in which the requested initials are the primary artwork. Preserve each letter’s recognizable stem and counter structure. When a motif is requested, integrate it through a compatible shared stroke, outer contour or counter cut, rather than putting an illustration beside an unrelated initial. Choose one coherent integration strategy; respect separate or joined lettering, selected family, weight, case and treatment. Do not substitute a full wordmark.',
    enhancerFocus: 'If a motif is present, clarify how its defining feature can share a contour or counter with the initials without losing letter recognition. Do not invent initials or force interlocking against separate-letter controls.',
  },
  wordmark: {
    construction: 'A bespoke typographic identity with the complete brand name clearly readable as the dominant artwork. Establish a recurring system of stems, terminals, counters and optical spacing, shaping the word envelope within the selected alignment and family. Customization must belong to the letters themselves. Requested motifs must never replace the wordmark or obscure a letter; integrate them only where spelling remains unmistakable. Avoid a generic font plus a stock symbol. Do not reduce the complete name to a single illustrated initial.',
    enhancerFocus: 'Clarify an already requested letter feature or motif integration while retaining the full word. Do not add a motif, prescribe text placement, invent wording or turn a wordmark into an illustrated initial.',
  },
  line: {
    construction: 'An economical contour-based identity where stroke paths, openings and empty space describe the subject. Use consistent curve or angle rhythm, deliberate line endings and optically even spacing at junctions. A continuous path is appropriate only when requested or compatible with the selected structure; do not force disconnected anatomy into one tangled line. Preserve recognizable contours without solid-body fills, shading hatches or duplicated outlines.',
    enhancerFocus: 'Clarify a defining contour or an open gap between existing parts. Do not force a single continuous line, fills or extra contour loops.',
  },
  abstract: {
    construction: 'A symbolic reduction built from a coherent geometric or organic rule. Express the requested idea through the forms themselves: a shared edge, deliberate counter, repetition or directional relationship, as compatible with the brief. Preserve specified element counts, connectivity and topology. Keep any defining subject cue legible at the intended level of abstraction; avoid unrelated swooshes, decorative stripes or a container around an illustration.',
    enhancerFocus: 'Clarify the existing forms’ relationship or rhythm, preserving element count and topology. Do not invent an alphabetic glyph, extra symbol or unrelated swirl to represent a vague brand adjective.',
  },
  pictorial: {
    construction: 'A recognizable subject reduced to a distinctive silhouette and a few coordinated solid color regions. Preserve identifying anatomy or object proportions before simplifying secondary features. Use shared edges and selective internal cuts so the parts read as one symbol, rather than layered clip art. Distinctive recognition carries the identity; do not add facial expression, a surrounding badge or a miniature scene unless requested.',
    enhancerFocus: 'Clarify one identifying silhouette feature or how existing parts share an edge. Preserve the subject’s pose; do not add a mascot face, enclosure or scene.',
  },
  engraved: {
    construction: 'A printmaking identity with a strong outer silhouette and tonal marks that follow the subject’s volume. Separate contour, highlight gaps and grouped light/midtone/dark areas; control mark density so texture describes form rather than covering it uniformly. The selected engraving technique and line quality are authoritative: retain stipple dots, crosshatching, line engraving or etching as chosen. Simplified engraving still uses that technique, not smooth gradients or cartoon shading.',
    enhancerFocus: 'Clarify the subject’s pose, contour or major volume. Leave technique and mark density to the selected settings; do not insert crosshatching when stippling or another technique is chosen.',
  },
  icon: {
    construction: 'A compact illustrated brand icon with immediate recognition from its viewpoint, proportions and large color planes. Keep the minimum identifying parts, clear overlaps and optically balanced gaps. Favor robust shapes over miniature product detail; add expression only when the subject requests it. Follow the selected view and finish. Deliver a standalone identity rather than an automatic rounded-square app tile or realistic product render.',
    enhancerFocus: 'Clarify one identifying proportion or overlap of the existing object. Do not add a face, app tile, accessory or unrequested background.',
  },
  'streetwear-lettering': {
    construction: 'Lettering craft: customize the exact name through a recurring terminal, counter or stroke relationship within the selected genre. Shape the word envelope using the selected layout rather than adding a separate emblem. Keep secondary wording subordinate, open counters and preserve the complete reading order. The selected genre, outline and depth remain authoritative; do not substitute blackletter for another selected genre or add an extra symbol or distress.',
    enhancerFocus: 'Clarify an already requested letter feature within the selected genre. Leave name, layout, outline and depth in their controls; do not add a symbol, slogan or another lettering genre.',
  },
}).map(([style, value]) => [style, Object.freeze(value)])));
