// A small craft contract, not a second creative brief. Never supplies subjects,
// brand names, text placement, palettes or references from another identity.
export function logoCraftInstructions(style) {
  if (style === 'streetwear-lettering') return [];
  return [
    'Identity craft: find one distinctive relationship in the requested subject and make it the visual idea. Resolve its contours, overlaps and negative spaces into a coordinated shape system rather than assembling a stock icon, unrelated frame and default text lockup. Do not add a new motif to manufacture originality.',
    ['engraved', 'retro', 'cartoon', 'mascot'].includes(style)
      ? 'Reproduction check: retain the selected drawing character, but group small details into readable feature clusters. The silhouette and defining expression must survive a small-size preview; extra fur strokes, isolated slivers and decorative highlights must earn their place.'
      : 'Reproduction check: design the silhouette and internal gaps to remain recognizable at small size. Use deliberate optical spacing, clean joins and a restrained hierarchy of shape weights; remove incidental slivers and filler.',
    'Finish discipline: use flat spot-color regions by default. Do not introduce bevels, metallic lighting, glossy gradients, drop shadows or repeated sticker keylines unless the brief or a selected control explicitly requests that finish. Preserve the drawing logic of the selected style.',
  ];
}

export const LOGO_VARIATION_FINISH = 'Finish continuity: first identify whether the accepted source is flat, outlined, engraved, textured or dimensional. Preserve that finish and its approximate detail budget in Auto. A flat minimal mark stays flat and minimal; do not escalate it into a glossy esports crest, add nested outlines or change a quiet identity into an aggressive mascot. Explore the construction, not extra decoration. An explicit target style may change rendering, within its selected controls.';
