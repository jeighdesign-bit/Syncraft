import { LOGO_STYLES } from '../../lib/logoStudio.mjs';
import { normalizeLogoStyleForMode } from '../../lib/logoStyleCapabilities.mjs';

const modes = ['text', 'image', 'sketch'];
const knownStyle = value => LOGO_STYLES.some(item => item.id === value) ? value : 'minimalist';

export function restoreLogoStyleSelection(draft = {}) {
  const mode = modes.includes(draft.mode) ? draft.mode : 'text';
  const stylesByMode = Object.fromEntries(modes.filter(key => typeof draft.stylesByMode?.[key] === 'string')
    .map(key => [key, normalizeLogoStyleForMode(knownStyle(draft.stylesByMode[key]), key)]));
  const requestedStyle = knownStyle(draft.style);
  // Keep a text-only selection recoverable even from an older incompatible draft.
  if (normalizeLogoStyleForMode(requestedStyle, mode) !== requestedStyle) stylesByMode.text = requestedStyle;
  const style = normalizeLogoStyleForMode(requestedStyle, mode);
  return { mode, style, stylesByMode: { ...stylesByMode, [mode]: style } };
}

export function switchLogoStyleMode({ mode, style, stylesByMode }, nextMode) {
  const next = modes.includes(nextMode) ? nextMode : 'text';
  const remembered = { ...stylesByMode, [mode]: style };
  const nextStyle = normalizeLogoStyleForMode(knownStyle(remembered[next] || style), next);
  return { mode: next, style: nextStyle, stylesByMode: { ...remembered, [next]: nextStyle } };
}
