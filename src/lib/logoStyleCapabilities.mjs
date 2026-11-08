// Mode capabilities are separate from the catalog to keep prompts and UI cycle-free.
export const STREETWEAR_STYLE = 'streetwear-lettering';
// Image-to-Logo translates an existing visual subject, rather than constructing
// lettering or a new abstract concept. Other creation modes keep their catalog.
export const IMAGE_LOGO_STYLES = Object.freeze([
  'minimalist', 'mascot', 'retro', 'badge', 'line', 'pictorial', 'engraved', 'icon', 'cartoon',
]);

export function isLetteringStyle(style) {
  return ['wordmark', 'monogram', STREETWEAR_STYLE].includes(style);
}

export function requiresLogoBrand(style) {
  return style === STREETWEAR_STYLE;
}

export function supportsLogoBrandOnly(style) {
  return style === 'wordmark' || style === STREETWEAR_STYLE;
}

export function isLogoStyleAvailable(style, mode) {
  if (mode === 'image') return IMAGE_LOGO_STYLES.includes(style);
  return ['text', 'image', 'sketch'].includes(mode) && (style !== STREETWEAR_STYLE || mode === 'text');
}

export function normalizeLogoStyleForMode(style, mode) {
  if (mode === 'image' && !isLogoStyleAvailable(style, mode)) return 'minimalist';
  return style === STREETWEAR_STYLE && mode !== 'text' ? 'wordmark' : style;
}
