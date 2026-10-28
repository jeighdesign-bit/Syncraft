import { LOGO_STYLE_PROFILES, LOGO_PROFILE_VERSION, LOGO_CONCEPT_ROUTES } from './logoStyleProfiles.mjs';
import { normalizeLogoDesignSettings } from './logoDesignSettings.mjs';
export function normalizeLogoBrief(input) {
  if (input.mode !== 'text' || input.operation !== 'generate' || !LOGO_STYLE_PROFILES[input.style]) throw new Error('Art direction supports Text to Logo creation only.');
  return { version: LOGO_PROFILE_VERSION, rawBrief: input.prompt, brand: input.brand, tagline: input.tagline, palette: [...input.palette], style: input.style, designSettings: normalizeLogoDesignSettings(input.designSettings, input.style) };
}
export function fallbackLogoDirections(brief, count) {
  return Array.from({ length: count }, (_, i) => ({ ...LOGO_CONCEPT_ROUTES[i],
    typography: brief.style === 'wordmark' ? 'Custom readable lettering with a motif integrated into its letter construction.' : brief.style === 'monogram' ? 'Use the requested initials as the symbol; keep their counterforms readable.' : 'When text is supplied, integrate it into the chosen lockup without obscuring the subject.',
    palette: brief.palette.length ? brief.palette.join(', ') : 'Choose purposeful color roles appropriate to the brief; keep contrast and reproduction practical.',
    directionId: `direction-${i + 1}` }));
}
const fields = ['summary', 'construction', 'composition', 'typography', 'palette'];
export function validateLogoDirections(value, brief, count) {
  if (!value || value.brand !== brief.brand || value.tagline !== brief.tagline || value.style !== brief.style || value.rawBrief !== brief.rawBrief
    || !Array.isArray(value.directions) || value.directions.length !== count) throw new Error('Planner changed the brief.');
  const directions = value.directions.map((d, i) => {
    const result = { directionId: `direction-${i + 1}` };
    for (const field of fields) {
      if (typeof d[field] !== 'string' || !d[field].trim() || d[field].length > (field === 'summary' ? 120 : 900) || /https?:\/\/|data:|<\/?(?:script|iframe)/i.test(d[field])) throw new Error('Invalid design direction.');
      result[field] = d[field].trim();
    }
    return result;
  });
  if (new Set(directions.map(d => `${d.construction} ${d.composition}`.toLowerCase())).size !== count) throw new Error('Duplicate design directions.');
  return directions;
}
