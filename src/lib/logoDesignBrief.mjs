import { LOGO_STYLE_PROFILES, LOGO_PROFILE_VERSION } from './logoStyleProfiles.mjs';
import { normalizeLogoDesignSettings } from './logoDesignSettings.mjs';
import { STREETWEAR_STYLE } from './logoStyleCapabilities.mjs';
import { MASCOT_DIRECTIONS } from './logoMascot.mjs';
import { logoStyleDirections } from './logoStyleDirections.mjs';
import { resolveLogoTextDirection, LOGO_TEXT_DIRECTION_VERSION } from './logoTextDirection.mjs';

const STREETWEAR_ROUTES = [
  { summary: 'Sculpted outer letters', construction: 'Construct the exact name using the selected genre characteristic proportions, joins and terminals. Do not introduce another genre glyph anatomy.', composition: 'Shape the word envelope through letter heights and terminal extensions, following the selected layout. Give the main name most of the lockup.' },
  { summary: 'Inset cut rhythm', construction: 'Develop a consistent stroke rhythm and counter shapes appropriate to the selected genre. Use waists or inset cuts only if that genre calls for them.', composition: 'Create a compact joined word silhouette with intentional gaps and controlled extended terminals, following the selected layout.' },
  { summary: 'Extended crossbars', construction: 'Explore lead-letter and terminal proportions within the selected genre. Connect letters only for a genre that calls for joined lettering.', composition: 'Balance the extended strokes around the main name within the selected layout; preserve the exact reading order and complete word shapes.' },
  { summary: 'Interlocked strokes', construction: 'Draw new stem proportions and restrained shared contours while keeping every letter separate enough to read. Repeat purposeful terminal shapes rather than changing fonts.', composition: 'Build an optically balanced lockup with genre-appropriate open counters and a distinct outer silhouette, respecting the selected layout.' },
];
export function normalizeLogoBrief(input) {
  if (input.mode !== 'text' || input.operation !== 'generate' || !LOGO_STYLE_PROFILES[input.style]) throw new Error('Art direction supports Text to Logo creation only.');
  const brief = { version: input.style === STREETWEAR_STYLE ? LOGO_PROFILE_VERSION : LOGO_TEXT_DIRECTION_VERSION, rawBrief: input.prompt, brand: input.brand, tagline: input.tagline, palette: [...input.palette], style: input.style, designSettings: normalizeLogoDesignSettings(input.designSettings, input.style, { mode: 'text' }) };
  if (input.style !== STREETWEAR_STYLE) brief.textDirection = resolveLogoTextDirection(brief);
  return brief;
}
export function fallbackLogoDirections(brief, count) {
  const routes = brief.style === STREETWEAR_STYLE ? STREETWEAR_ROUTES : brief.style === 'mascot' ? MASCOT_DIRECTIONS : logoStyleDirections(brief.style);
  return Array.from({ length: count }, (_, i) => ({ ...routes[i], preserveBrief: i === 0,
    typography: brief.style === STREETWEAR_STYLE ? 'The exact brand name is the dominant artwork. Preserve spelling and case; follow the chosen lettering, layout, outline and depth controls over concept suggestions.' : brief.style === 'wordmark' ? 'Custom readable lettering with a motif integrated into its letter construction.' : brief.style === 'monogram' ? 'Use the requested initials as the symbol; keep their counterforms readable.' : 'When text is supplied, integrate it into the chosen lockup without obscuring the subject.',
    palette: brief.palette.length ? brief.palette.join(', ') : 'Choose purposeful color roles appropriate to the brief; keep contrast and reproduction practical.',
    directionId: `direction-${i + 1}` }));
}
const fields = ['summary', 'construction', 'composition', 'typography', 'palette'];
export function validateLogoDirections(value, brief, count) {
  if (!value || value.brand !== brief.brand || value.tagline !== brief.tagline || value.style !== brief.style || value.rawBrief !== brief.rawBrief
    || !Array.isArray(value.directions) || value.directions.length !== count) throw new Error('Planner changed the brief.');
  const directions = value.directions.map((d, i) => {
    const result = { directionId: `direction-${i + 1}`, preserveBrief: i === 0 };
    for (const field of fields) {
      if (typeof d[field] !== 'string' || !d[field].trim() || d[field].length > (field === 'summary' ? 120 : 900) || /https?:\/\/|data:|<\/?(?:script|iframe)/i.test(d[field])) throw new Error('Invalid design direction.');
      result[field] = d[field].trim();
    }
    return result;
  });
  if (new Set(directions.map(d => `${d.construction} ${d.composition}`.toLowerCase())).size !== count) throw new Error('Duplicate design directions.');
  return directions;
}
