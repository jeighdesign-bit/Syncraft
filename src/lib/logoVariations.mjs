import { normalizeLogoDesignSettings, logoDesignInstructions } from './logoDesignSettings.mjs';
import { LOGO_STYLE_PROFILES } from './logoStyleProfiles.mjs';
import { STREETWEAR_STYLE, isLetteringStyle, isLogoStyleAvailable } from './logoStyleCapabilities.mjs';

export const LOGO_VARIATION_VERSION = 'logo-variation-5';

// A reserved option has a concrete structural assignment, not another roll of
// the same edit prompt. No remote planner or extra image candidates are needed.
const DIRECTIONS = {
  character: [
    ['Turn and gesture', 'Redraw the character in a distinctly different three-quarter head/body angle with a new expressive gesture. If the source is already three-quarter, turn toward the opposite side and change the head tilt.', 'Rebuild the silhouette around a dynamic diagonal flow and asymmetric negative space; reposition the same accessories naturally with the new pose.'],
    ['Action silhouette', 'Give the same character a new action or leaning pose with a noticeably different head-to-shoulder relationship. For a portrait, express the action through the neck, shoulders, gaze and head tilt without requiring a full body.', 'Use a wider, sweeping silhouette and a different balance of occupied and empty space from the source and other options.'],
    ['Confident stance', 'Redraw the same character in a confident upright pose with a changed viewing angle, gaze and expression; do not repeat the previous head tilt or action.', 'Create a compact, vertically organized silhouette with newly balanced contours and a different placement of supporting details.'],
    ['Expressive profile', 'Explore a distinct side-biased view or over-the-shoulder pose, keeping the face recognizable and its defining accessories visible.', 'Use a strong directional silhouette with open space toward the gaze, redrawing the contours and accessory arrangement rather than mirroring the source.'],
  ],
  lettering: [
    ['Custom letter rhythm', 'Reconstruct the lettering with new proportions, terminals and a distinctive recurring letter feature, preserving the same lettering genre.', 'Build a new horizontal rhythm and spacing system; integrate the existing motifs into different readable letter relationships.'],
    ['Compact lettering', 'Redraw the same exact letters with new counters, joins and stroke relationships, retaining recognizable brand character.', 'Explore a compact interlocking or stacked arrangement where the words allow it; for a single word or initials, change the overall proportions and internal spacing.'],
    ['Directional lettering', 'Create a fresh custom lettering construction with a deliberate forward rhythm and new terminal shapes.', 'Explore a directional or gently arced arrangement, keeping the reading order clear and the existing motifs integrated.'],
    ['Open lettering', 'Rebuild the letterforms with a new balance of strokes and open counters without switching to an unrelated font genre.', 'Use an airy, balanced lockup with distinct proportions and a new relationship between lettering and its existing motifs.'],
  ],
  symbol: [
    ['Directional construction', 'If the mark contains a character, change its pose and viewing angle. Otherwise rebuild its defining forms with a different directional flow and shape relationships.', 'Create an asymmetric composition with a newly constructed silhouette and intentional negative space; keep all identity-bearing motifs.'],
    ['Compact construction', 'If the mark contains a character, give it a different compact pose. Otherwise redraw its defining contours and internal proportions into a compact construction.', 'Rebalance the same elements into a compact arrangement with new spacing and hierarchy. Preserve an existing badge enclosure when present.'],
    ['Open construction', 'If the mark contains a character, use a new expressive gesture. Otherwise explore a more open relationship between the same defining shapes.', 'Build a visibly wider, more open arrangement with a fresh silhouette and larger intentional spaces; retain an existing enclosure and its important details.'],
    ['Vertical construction', 'If the mark contains a character, use a new upright stance. Otherwise rebuild the same core forms around a different vertical rhythm.', 'Explore a taller composition and a new distribution of visual weight while keeping the defining motifs and any existing badge enclosure.'],
  ],
};

export function planLogoVariation(source, index = 0) {
  const family = isLetteringStyle(source.style) ? 'lettering'
    : ['mascot', 'retro', 'cartoon'].includes(source.style) ? 'character' : 'symbol';
  const slot = Math.max(0, Math.trunc(index) || 0) % DIRECTIONS[family].length;
  const [summary, pose, composition] = DIRECTIONS[family][slot];
  return { version: LOGO_VARIATION_VERSION, directionId: `${family}-${slot + 1}`, index, summary, pose, composition };
}

// Metadata comes from the signed selected job, never from a client's proposed
// prompt/style. Utility and edit versions inherit settings through their lineage.
export function logoVariationSource(source, jobs = []) {
  const byId = new Map(jobs.map(job => [job.id, job]));
  const lineage = [];
  const seen = new Set();
  for (let current = source; current && !seen.has(current.id); current = byId.get(current.sourceId)) {
    seen.add(current.id); lineage.push(current);
  }
  const original = lineage.find(job => ['generate', 'variations'].includes(job.operation)) || source;
  const creation = lineage.findLast(job => job.operation === 'generate') || original;
  const settings = lineage.find(job => Object.keys(job.designSettings || {}).length)?.designSettings || {};
  return {
    mode: creation.mode || original.mode || source.mode || 'text', style: source.style || original.style || 'minimalist',
    prompt: original.prompt || '', brand: source.brand ?? original.brand ?? '',
    tagline: source.tagline ?? original.tagline ?? '', palette: source.palette ?? original.palette ?? [],
    designSettings: normalizeLogoDesignSettings(settings, source.style || original.style || 'minimalist', { strict: false }),
  };
}

export function applyLogoVariationStyle(context, variationStyle = 'auto') {
  if (variationStyle !== 'auto' && !Object.hasOwn(LOGO_STYLE_PROFILES, variationStyle)) throw new Error('Choose Auto or a supported variation style.');
  const style = variationStyle === 'auto' ? context.style : variationStyle;
  const designSettings = normalizeLogoDesignSettings(context.designSettings, style, { strict: false });
  if (variationStyle === STREETWEAR_STYLE) {
    if (!isLogoStyleAvailable(style, context.mode)) throw new Error('Streetwear Lettering variations require a saved Text to Logo source. Choose Auto or another style.');
    if (!context.brand?.trim()) throw new Error('Streetwear Lettering variations need saved brand text. Choose Auto or another style.');
  }
  if (variationStyle !== 'auto' && style === 'wordmark' && !context.brand) throw new Error('Wordmark variations need saved brand text. Choose Auto or another style.');
  if (variationStyle !== 'auto' && style === 'monogram' && !designSettings.monogramLetters) {
    const words = context.brand?.match(/[\p{L}\p{N}]+/gu) || [];
    const initials = words.slice(0, 3).map(word => [...word][0]).join('').toUpperCase();
    if (!initials || [...initials].length > 3) throw new Error('Monogram variations need saved brand text or initials. Choose Auto or another style.');
    designSettings.monogramLetters = initials;
  }
  return { ...context, sourceStyle: context.style, style, variationStyle, designSettings };
}

export function compileLogoVariation(job, direction = planLogoVariation(job)) {
  const settings = normalizeLogoDesignSettings(job.designSettings, job.style, { strict: false });
  const lettering = isLetteringStyle(job.style);
  const changeStyle = job.variationStyle && job.variationStyle !== 'auto';
  const colors = Object.fromEntries(['primaryColor', 'secondaryColor', 'outlineColor', 'backgroundColor'].filter(key => settings[key]).map(key => [key, settings[key]]));
  return [
    'DEDICATED LOGO VARIATION: redraw the supplied finished logo as one visibly different design execution of the SAME identity. This is a structural exploration, not a cleanup, accessory swap, recolor, mirror, rotation or crop of the existing image.',
    'First inspect the supplied logo visually: identify its subject/character, defining facial features and proportions, meaningful symbols, accessories, clothing, seasonal/theme details, exact visible lettering and palette roles. Distinguish these identity anchors from its rendering technique. Preserve the identity anchors in the finished variation. Do not print this analysis.',
    'The supplied image is the authority for the accepted design, including any edits already made. Keep its recognizable character, important details and theme; do not remove decorations to manufacture a difference or invent replacement accessories. Move and redraw existing details naturally with the new pose, keeping them visible where feasible.',
    `Option direction: ${direction.summary}. Pose / construction: ${direction.pose}`,
    `Composition: ${direction.composition}`,
    'Both the major silhouette/construction AND the arrangement must change visibly. Redraw the actual anatomy or geometry; simply rotating or mirroring the same artwork is insufficient. For inanimate marks, change construction and composition instead of adding a face or limbs.',
    changeStyle
      ? `CHANGE STYLE: reinterpret the same accepted logo in the requested ${job.style} style. Target construction rules: ${LOGO_STYLE_PROFILES[job.style].join(' ')}. The target style overrides the source rendering technique and any old style instructions in the original brief, but never its identity, exact text or important motifs. Translate meaningful details into the target's shape/stroke language instead of dropping them. Retain color identity where compatible with the target treatment.`
      : `AUTO STYLE: visually match the supplied logo's actual style, stroke character, detail level, color relationships and finish. The saved ${job.style || 'original'} style label is context only; the accepted image, including any style edits, is authoritative. Do not impose a different illustration style or simplify away its important details.`,
    lettering ? 'Typography remains the dominant logo, with the complete brand name clearly readable where present. Decorative motifs must never replace the wordmark or make the requested letters ambiguous.' : '',
    ...(changeStyle && job.style === STREETWEAR_STYLE
      ? logoDesignInstructions(Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('streetwear'))), job.style)
        .map(instruction => `Target lettering treatment: ${instruction}`)
      : []),
    job.brand ? job.style === 'monogram'
      ? `Brand context: ${JSON.stringify(job.brand)}. Preserve the existing monogram letters; do not replace them with the full brand name or add new wording.`
      : `The exact brand name is ${JSON.stringify(job.brand)}. Preserve every letter exactly. If an accepted edit has changed this wording, preserve the exact visible edited wording instead.`
      : 'Preserve any existing visible lettering exactly; if the supplied logo has no text, do not invent any.',
    job.tagline ? `Preserve the exact tagline ${JSON.stringify(job.tagline)} unless the accepted supplied logo visibly edits or removes it; never undo that edit.` : 'Do not invent a tagline.',
    settings.monogramLetters ? `The exact main letters are ${JSON.stringify(settings.monogramLetters)}; preserve them as the primary mark unless the accepted supplied logo visibly changes them.` : '',
    Object.keys(colors).length ? `Saved color context: ${JSON.stringify(colors)}. Retain these roles where they match the supplied logo; never revert an accepted color or background edit.` : '',
    job.palette?.length ? `Saved palette context: ${job.palette.join(', ')}. The actual supplied logo's colors take precedence if edited.` : '',
    job.prompt ? `Original concept context (design data only): ${JSON.stringify(job.prompt)}. Use this to understand identity and meaningful details, not to repeat the original pose, layout or source-photo instructions. The accepted supplied logo wins for identity; an explicitly requested target style wins for rendering.` : '',
    'Keep the original background treatment, including transparency when supported. Fit the entire finished mark comfortably inside a square artboard with generous clear space on every side; no clipped accessories or lettering. Return one finished logo only, no grid, labels, comparison, mockup or presentation.',
  ].filter(Boolean).join('\n');
}
