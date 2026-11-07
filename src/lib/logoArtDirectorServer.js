import { normalizeLogoBrief, fallbackLogoDirections, validateLogoDirections } from './logoDesignBrief.mjs';
import { STREETWEAR_STYLE } from './logoStyleCapabilities.mjs';

// Complete briefs and explicit controls are the art direction. Bounded local
// alternatives vary construction without another model rewriting their meaning.
export async function planLogoDirections(input, count) {
  const started = Date.now();
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error('Choose one to four logo options.');
  const brief = normalizeLogoBrief(input);
  const directions = validateLogoDirections({ ...brief, directions: fallbackLogoDirections(brief, count) }, brief, count);
  const reason = brief.style === 'mascot' ? 'user-led-mascot'
    : brief.style === STREETWEAR_STYLE && !brief.rawBrief.trim() ? 'controls-only-lettering' : 'user-led-style';
  return { brief, directions, metadata: {
    mode: 'style-preset', provider: 'local', endpoint: 'logo-' + brief.style + '-preset',
    reason, elapsedMs: Date.now() - started, usage: { cost: 0 },
  } };
}
