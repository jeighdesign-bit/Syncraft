// Mode capabilities are separate from the catalog to keep prompts and UI cycle-free.
export const STREETWEAR_STYLE = 'streetwear-lettering';

export function isLetteringStyle(style) {
  return ['wordmark', 'monogram', STREETWEAR_STYLE].includes(style);
}

export function requiresLogoBrand(style) {
  return style === 'wordmark' || style === STREETWEAR_STYLE;
}

export function isLogoStyleAvailable(style, mode) {
  return ['text', 'image', 'sketch'].includes(mode) && (style !== STREETWEAR_STYLE || mode === 'text');
}

export function normalizeLogoStyleForMode(style, mode) {
  return style === STREETWEAR_STYLE && mode !== 'text' ? 'wordmark' : style;
}
