import { logoDesignInstructions } from './logoDesignSettings.mjs';

export const MASCOT_DIRECTIONS = Object.freeze([
  { summary: 'Follow the brief', preserveBrief: true, construction: 'Follow the user’s requested character construction directly.', composition: 'Keep the requested pose and framing.' },
  { summary: 'Expressive contour', construction: 'Use flowing contour rhythm and restrained angular accents to emphasize the requested expression.', composition: 'Keep the requested pose and framing; give the defining facial features clear separation.' },
  { summary: 'Compact character', construction: 'Use substantial connected forms with generous negative space between the defining features.', composition: 'Build a compact silhouette within the requested pose and framing.' },
  { summary: 'Directional rhythm', construction: 'Create directional rhythm through the character’s own contours, without extra motion lines or symbols.', composition: 'Balance the requested pose and framing around one clear focal point.' },
]);

// A mascot brief already describes the character. Keep its anatomy, pose and
// color relationships intact rather than having a planner rewrite them.
export function buildMascotLogoPrompt(brief, direction) {
  return [
    brief.rawBrief || brief.prompt || 'Create one finished original mascot logo.',
    /\bmascot\b/i.test(brief.rawBrief || brief.prompt || '') ? '' : 'Create a mascot logo with a recognizable character silhouette.',
    direction && !direction.preserveBrief ? `Optional construction, only where consistent with the brief: ${direction.construction} ${direction.composition}` : '',
    brief.brand ? `Exact brand text: ${JSON.stringify(brief.brand)}.` : 'No invented brand text.',
    brief.tagline ? `Exact supporting tagline: ${JSON.stringify(brief.tagline)}.` : 'No invented tagline.',
    brief.palette?.length ? `Required palette: ${brief.palette.join(', ')}.` : '',
    ...logoDesignInstructions(brief.designSettings, 'mascot').map(value => `Required design control: ${value}`),
    'Keep the complete character silhouette and any outline or extended features inside the square artboard with comfortable clear space. No mockup, watermark or presentation grid.',
  ].filter(Boolean).join('\n');
}
