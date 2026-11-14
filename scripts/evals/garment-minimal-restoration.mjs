export const GARMENT_PROMPT_VERSION = 'minimal-edit-v12';
export const buildGarmentExtractionSystemPrompt = () => '';
export function buildGarmentExtractionPrompt(mode) {
  if (!['ERASE_LOGOS', 'PRESERVE_LOGOS'].includes(mode)) throw new Error('Unsupported garment mode');
  return `Edit this image to isolate the existing torso print as flat rectangular artwork. Keep the actual original drawing and colors. Remove the collar, neckline, sleeves, shoulder/shirt outline, hem, fabric folds and everything in the surrounding scene. Extend only the adjacent torso background to the rectangle edges.
${mode === 'ERASE_LOGOS' ? 'Erase the names, numbers, logos, crests, badges and labels; fill only those small footprints from their immediate printed surroundings. Keep the main decorative illustration.' : 'Keep all printed text, numbers, logos, badges and tiny marks exactly as they appear.'}
Do not trace, redraw, restyle, sharpen, recolor, enlarge or complete the illustration. Preserve its existing visible strokes, proportions and spacing. Do not add background ornament. Return only the flat print artwork.`;
}
