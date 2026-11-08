import { STREETWEAR_STYLE } from './logoStyleCapabilities.mjs';

// Call only after refinements resolve their style from the signed saved source.
// Only these Text-to-Logo styles use Nano. Keep reference creation and the
// existing refinement providers independent of this Text-to-Logo selection.
// Utility operations always use Recraft, independently of the creation model.
export const LOGO_NANO_TEXT_STYLES = Object.freeze(['mascot', 'retro', 'icon', 'cartoon']);

export function logoUsesNano(input) {
  if (input.operation === 'generate' && input.mode === 'text') return LOGO_NANO_TEXT_STYLES.includes(input.style);
  return ['generate', 'variations', 'edit'].includes(input.operation)
    && input.style !== STREETWEAR_STYLE;
}
