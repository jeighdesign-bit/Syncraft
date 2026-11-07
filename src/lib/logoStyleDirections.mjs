// Alternatives change construction within a style, never the requested subject,
// wording, palette, framing or selected controls. Option one stays literal.
const constructions = {
  minimalist: ['Refine the economy of the requested outer contour.', 'Explore a different balance of the same major forms.', 'Refine spacing within the selected mark construction.'],
  wordmark: ['Refine letter proportions within the selected font and weight.', 'Explore the rhythm of terminals within the selected font.', 'Refine counters and spacing without changing the selected alignment.'],
  retro: ['Refine the character contour rhythm within the requested pose.', 'Explore expressive proportions without changing the requested framing.', 'Refine the balance of the same character and any requested props.'],
  badge: ['Refine the outer border hierarchy within the selected enclosure.', 'Rebalance the same subject and wording inside the selected badge shape.', 'Refine internal spacing without adding decorative objects or changing the enclosure.'],
  monogram: ['Refine the proportions of the specified letters in the selected font.', 'Explore counter spacing while preserving the requested joined or separate construction.', 'Refine stroke relationships without adding, replacing or obscuring initials.'],
  line: ['Refine contour rhythm while retaining the selected thickness and structure.', 'Explore the spacing of the same contours without adding fills.', 'Refine line endings and open spaces without adding subject details.'],
  abstract: ['Refine the curvature or angles within the selected structure.', 'Explore spacing between the same requested elements.', 'Refine the outer silhouette without changing the element count or relationships.'],
  pictorial: ['Refine the contour of the same recognizable subject.', 'Explore the balance of the same main color masses.', 'Refine the negative spaces within the same subject silhouette.'],
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
