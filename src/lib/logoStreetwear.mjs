// Visual construction distilled from the user's original typographic illustrations.
// No reference artwork, artist names, reference wording or contact details are sent.
export const STREETWEAR_ART_DIRECTION = Object.freeze([
  'Create a custom typographic illustration for apparel: the letterforms themselves are the artwork. The selected Lettering style determines the actual glyph anatomy, joins, proportions and terminals. Construct that genre first, before adding color, outlines or depth. Preserve its characteristic counters and spacing rather than forcing every genre into narrow ornamental letters.',
  'The selected Lettering style is authoritative over shared art direction and concept suggestions. Streetwear is the application, not a Gothic font requirement. Gothic stems, chisel notches, swashes, connecting strokes and exaggerated outer letters belong only to genres that call for them. Do not carry these features between unrelated styles. Give the main name visual dominance; supporting text, when supplied, is much smaller.',
  'Use crisp drawn ink regions and hard boundaries. When depth is selected, construct broad light and dark face planes, stepped shadow bands and one consistent offset direction. Keep the construction visible across the letters, not just in a thin rim. Flat treatment removes all shading while retaining the custom letter structure. Avoid soft airbrushed gradients, photographic material lighting and glossy mockup effects.',
  'Keep a compact, front-facing lockup with all letter terminals, swashes and depth inside the artboard. Show one finished mark on a uniform background, without texture, vignette, floor or mockup. Invent no captions, dates, slogans, signatures or contact details. Add symbols or decorative objects only when the user requests them; keep every requested letter readable.',
]);

export function streetwearBackground(settings = {}) {
  return settings.backgroundColor || '#191919';
}

export function streetwearPaletteDirection(settings = {}, palette = []) {
  if (palette.length || settings.primaryColor || settings.secondaryColor || settings.outlineColor) {
    return 'Build related light, midtone and dark ink regions from the supplied color roles. Keep an explicit Outline color on the separation keyline. Respect the selected background; do not replace user colors with a suggested finish.';
  }
  return 'Automatic ink palette: follow explicit color preferences in the brief; otherwise use silver-white letter faces, two clearly separated gray shade regions and a restrained teal separation keyline, with a dark separating base where contrast needs it. For Flat, use uniform silver-white faces and the keyline only; no shade regions. Keep all regions crisp.';
}
