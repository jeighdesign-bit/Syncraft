// Alternatives change construction within a style, never the requested subject,
// wording, palette, framing or selected controls. Option one stays literal.
const constructions = {
  minimalist: ['Contour-led concept: use one memorable contour transition to express the subject, with economical interior cuts.', 'Shape relationship concept: coordinate the subject’s major masses around one intentional open gap, avoiding a generic container.', 'Negative-space concept: make a defining subject feature emerge from an open cut within the main form, if compatible with the selected construction.'],
  wordmark: ['Proportion-led lettering: shape the complete name through coordinated letter widths and heights within the selected family, weight and alignment.', 'Terminal-led lettering: develop one recurring terminal or join characteristic across the name, without adding a new motif or changing the selected font family.', 'Counter-led lettering: coordinate the internal counters and interletter gaps into a distinctive reading rhythm, retaining every character and the selected alignment.'],
  retro: ['Refine the character contour rhythm within the requested pose.', 'Explore expressive proportions without changing the requested framing.', 'Refine the balance of the same character and any requested props.'],
  badge: ['Contour relationship concept: coordinate the subject contour with the selected enclosure through related curves or angles, retaining a clear inset gap.', 'Shared-axis concept: organize the same subject and supplied wording around a deliberate shared alignment within the selected badge shape.', 'Open-field concept: let a bold subject silhouette and generous interior breathing room carry the identity, with the lightest border hierarchy allowed by the controls.'],
  monogram: ['Contour-led lettermark: coordinate the outside contours of the exact initials. A requested motif may share a compatible contour, but each initial must remain identifiable.', 'Counter-led lettermark: refine the counters of the exact initials; a requested motif may occupy an existing counter only if spelling and the selected treatment remain clear.', 'Stroke-led lettermark: develop the stroke rhythm of the exact initials within the selected font and weight. Preserve separate or joined construction; do not force a ligature or add a motif.'],
  line: ['Contour-led drawing: refine the identifying contour rhythm within the selected thickness and structure, without tracing every small feature.', 'Gap-led drawing: use deliberate openings and clear separation between existing contours to describe overlaps, without adding fills or details.', 'Path-led drawing: refine line endings and junctions into an economical path system; use a continuous path only when compatible with the selected structure and requested anatomy.'],
  abstract: ['Shape-rule concept: coordinate the existing forms through repeated curvature or angles within the selected structure; retain the requested connectivity and element count.', 'Counter-led concept: refine the open space between the same requested elements without inventing a new symbol or changing their relationships.', 'Silhouette-led concept: resolve the outer contour and directional balance of the same forms while preserving topology, count and the selected construction.'],
  pictorial: ['Silhouette-led concept: concentrate recognition in an unusual but accurate contour of the requested subject, with very few interior features.', 'Interlocking-form concept: build the same subject from coordinated large color masses with shared edges rather than layered clip-art parts.', 'Cutout-led concept: use an identifying negative-space cut to describe the subject while keeping one coherent outer silhouette.'],
  engraved: ['Refine tonal grouping using only the selected engraving technique.', 'Explore contour rhythm while retaining the selected technique and detail level.', 'Refine spacing between engraved marks without adding decoration.'],
  icon: ['Refine compact proportions while preserving the selected viewpoint.', 'Explore the balance of the same recognizable parts.', 'Refine the outer contour without adding a face or changing the subject.'],
  cartoon: ['Refine expressive contours within the requested pose.', 'Explore playful proportions within the requested framing.', 'Refine the balance of the same character and requested props.'],
};

export function logoStyleDirections(style) {
  return [
    { summary: 'Follow the brief', preserveBrief: true, construction: 'Follow the requested subject, text and settings directly.', composition: 'Keep the requested layout and framing.' },
    ...(constructions[style] || []).map((construction, index) => ({
      summary: `Construction ${index + 2}`, construction,
      composition: 'Preserve all explicit user instructions and controls; adapt only unspecified design decisions.',
    })),
  ];
}
