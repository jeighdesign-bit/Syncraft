import { TEXT_STYLE_GRAMMAR } from './logoTextDirection.mjs';

export const LOGO_VISUAL_GUIDE_VERSION = 'logo-visual-guides-1';

// Rollout is server-owned and frozen into the signed job before charging.
// A client cannot supply references or opt other modes into this pipeline.
export function logoVisualDirection(input, enabledStyles = '') {
  if (input.operation !== 'generate' || input.mode !== 'text' || !TEXT_STYLE_GRAMMAR[input.style]) return null;
  const enabled = new Set(String(enabledStyles).split(',').map(value => value.trim()));
  if (!enabled.has('all') && !enabled.has(input.style)) return null;
  return { version: LOGO_VISUAL_GUIDE_VERSION, style: input.style, match: 'flexible' };
}

export function hasLogoVisualDirection(input) {
  const guide = input.visualGuidance;
  return input.operation === 'generate' && input.mode === 'text' && !!TEXT_STYLE_GRAMMAR[input.style]
    && guide?.version === LOGO_VISUAL_GUIDE_VERSION && guide.style === input.style && guide.match === 'flexible';
}
