import { CREDIT_COST } from './pricing.js';
import { normalizeLogoDesignSettings, logoDesignInstructions } from './logoDesignSettings.mjs';
import { compileLogoVariation } from './logoVariations.mjs';
import { STREETWEAR_STYLE, requiresLogoBrand, isLogoStyleAvailable } from './logoStyleCapabilities.mjs';
import { LOGO_STYLE_PROFILES } from './logoStyleProfiles.mjs';
import { streetwearBackground, streetwearPaletteDirection } from './logoStreetwear.mjs';
import { compileLogoDirection } from './logoPromptCompiler.mjs';

export const LOGO_STYLES = [
  { id: 'minimalist', name: 'Minimalist', mark: '◒', prompt: 'minimal geometric symbol, simple silhouette, balanced negative space' },
  { id: 'mascot', name: 'Mascot', mark: '♞', prompt: 'expressive original mascot, bold outlines, strong recognizable silhouette' },
  { id: 'retro', name: 'Retro mascot', mark: '✳', prompt: 'vintage mid-century mascot, confident ink strokes, warm nostalgic character' },
  { id: 'badge', name: 'Badge', mark: '◈', prompt: 'balanced badge emblem, clear hierarchy, enclosed composition' },
  { id: 'monogram', name: 'Monogram', mark: 'Aa', prompt: 'interlocking brand initials, elegant custom monogram, legible letter shapes' },
  { id: 'wordmark', name: 'Wordmark', mark: 'ab', prompt: 'distinctive custom lettering, precise spelling, balanced kerning, typography as the primary mark' },
  { id: STREETWEAR_STYLE, name: 'Streetwear Lettering', mark: 'streetwear', prompt: 'dense custom typographic illustration, sculpted word silhouettes, sharp ornamental letters, controlled keylines and graphic dimensional shading' },
  { id: 'line', name: 'Line art', mark: '⌁', prompt: 'clean confident contour lines, consistent stroke weight, simple outline symbol' },
  { id: 'abstract', name: 'Abstract', mark: '✦', prompt: 'distinctive abstract geometric mark, intentional negative space, balanced proportions' },
  { id: 'pictorial', name: 'Pictorial', mark: 'pictorial', prompt: 'recognizable pictorial symbol of the subject, bold simplified silhouette, one or two flat colors, no character face unless the subject requires it' },
  { id: 'engraved', name: 'Engraved', mark: 'engraved', prompt: 'engraved woodcut illustration, fine etched contours and parallel hatching, restrained single-ink palette, handcrafted detail, no photographic shading or 3D effects' },
  { id: 'icon', name: 'Icon/Emoji', mark: 'icon', prompt: 'friendly compact icon with rounded geometric shapes, bold readable silhouette, simple bright flat colors, minimal detail that stays clear at small sizes' },
  { id: 'cartoon', name: 'Cartoon', mark: 'cartoon', prompt: 'playful cartoon illustration, rounded exaggerated proportions, lively expression where appropriate, clean bold outlines, bright flat colors' },
];

// Image-first directions describe construction, not a reference artwork to copy.
// The uploaded image remains the sole source for the subject and its identity.
const IMAGE_STYLE_DIRECTIONS = Object.freeze({
  minimalist: 'Reduce the subject to a few large geometric or organic masses. Let one clear silhouette and deliberate negative space carry its identity.',
  mascot: 'Build an original character mark around the subject. For a person or animal, favor a confident head-and-shoulders or compact character pose. Use a heavy, clean outer contour, a few expressive but recognizable facial cues, and two to four high-contrast flat color regions. Keep small facial and hair details subordinate to the silhouette; add a simple separation keyline only if a dark background needs it.',
  retro: 'Build an original mid-century character mark from the subject with simplified expressive features, confident ink-like contours, a compact silhouette, and a restrained warm palette. Favor a few broad color blocks and period character cues over aged-paper effects, distress, and decorative noise.',
  badge: 'Place the recognizable subject inside one simple enclosed emblem. Give the subject most of the space, with a clear outer rim or banner reserved for optional exact brand lettering inside the same badge. Keep the hierarchy readable at small size.',
  line: 'Describe the subject with a few separate but coordinated contour strokes of consistent visual weight and intentional open space. Keep its identifying pose and parts legible without filled color masses, photographic shading, or a tangle of interior strokes.',
  abstract: 'Extract a distinctive gesture, contour, or relationship of parts from the subject and rebuild it from one or two broad interlocking shapes and intentional negative-space cuts. Preserve a visual connection to the reference without literal facial details or unrelated generic geometry.',
  pictorial: 'Build a recognizable subject symbol around one dominant solid silhouette. Keep only a few identity-defining feature groups as large negative-space cutouts or secondary solid shapes; preserve paired features such as two visible eyes together instead of collapsing them into one. Omit small incidental marks and separate decoration. Use one flat ink color plus the background unless the user chose a palette. Favor filled masses over outlines, hatching, and photographic detail.',
  engraved: 'Build a compact subject illustration with a solid readable silhouette in a restrained single-ink treatment. Use deliberate etched cuts and selective parallel hatching only where they clarify form; leave larger areas open and avoid photographic texture or gradients.',
  icon: 'Build a compact, friendly icon from a few rounded solid shapes, crisp color boundaries, and clear negative space. Preserve the subject’s distinctive outline and reduce interior details until it reads at small size; avoid mascot-level facial detail unless the source requires it.',
  cartoon: 'Build a lively drawn character or object from the reference using controlled rounded exaggeration, a simple readable pose, clean bold contours, and a few large flat color regions. Preserve identity-defining features instead of inventing a different character; leave fine texture behind.',
});
export const LOGO_COST = Object.freeze({ generate: CREDIT_COST.logoGenerate, variations: CREDIT_COST.logoVariations, edit: CREDIT_COST.logoEdit, removeBg: CREDIT_COST.logoRemoveBg, vectorize: CREDIT_COST.logoVectorize });
export function logoOperationCost(operation, mode = 'text') {
  if (operation === 'generate') {
    const costs = { text: CREDIT_COST.logoGenerate, image: CREDIT_COST.logoImageGenerate, sketch: CREDIT_COST.logoSketchGenerate };
    if (!Object.hasOwn(costs, mode)) throw new Error('Unknown logo creation mode.');
    return costs[mode];
  }
  if (!Object.hasOwn(LOGO_COST, operation)) throw new Error('Unknown logo operation.');
  return LOGO_COST[operation];
}
export const LOGO_ACTIVE = ['starting', 'queued', 'running', 'saving', 'refunding'];
export const LOGO_GENERATION_LIMIT = 4;

export function groupLogoHistory(jobs = []) {
  const byId = new Map(jobs.map(job => [job.id, job]));
  const groups = new Map();
  for (const job of [...jobs].reverse()) {
    let root = job;
    const seen = new Set([root.id]);
    while (!['generate', 'variations'].includes(root.operation) && byId.has(root.sourceId) && !seen.has(root.sourceId)) {
      root = byId.get(root.sourceId);
      seen.add(root.id);
    }
    if (!groups.has(root.id)) groups.set(root.id, { id: root.id, jobs: [] });
    groups.get(root.id).jobs.push(job);
  }
  return [...groups.values()];
}

export function logoGenerationQuota(jobs = []) {
  const used = jobs.filter(job => ['generate', 'variations'].includes(job.operation)
    && (job.status === 'succeeded' || LOGO_ACTIVE.includes(job.status))).length;
  return { used, remaining: Math.max(0, LOGO_GENERATION_LIMIT - used), limit: LOGO_GENERATION_LIMIT };
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateLogoOperation(input) {
  if (!UUID.test(input?.requestId || '')) throw new Error('A valid request ID is required.');
  const operation = input.operation || 'generate';
  if (!Object.hasOwn(LOGO_COST, operation)) throw new Error('Unknown logo operation.');
  const mode = input.mode || 'text';
  if (!['text', 'image', 'sketch'].includes(mode)) throw new Error('Choose text, image, or sketch.');
  const sketchMode = mode === 'sketch' && operation === 'generate' ? input.sketchMode || 'smart' : 'smart';
  if (!['smart', 'precise'].includes(sketchMode)) throw new Error('Choose Smart or Precise for your sketch.');
  const style = input.style || 'minimalist';
  if (!LOGO_STYLES.some(item => item.id === style)) throw new Error('Choose a supported logo style.');
  if (operation === 'generate' && !isLogoStyleAvailable(style, mode)) throw new Error('Streetwear Lettering is available in Text to Logo only.');
  const variationStyle = operation === 'variations' ? input.variationStyle ?? 'auto' : undefined;
  if (variationStyle !== undefined && variationStyle !== 'auto' && !LOGO_STYLES.some(item => item.id === variationStyle)) throw new Error('Choose Auto or a supported variation style.');
  const prompt = String(input.prompt || '').trim();
  const brand = String(input.brand || '').trim();
  const tagline = String(input.tagline || '').trim();
  if (prompt.length > 1800 || brand.length > 100 || tagline.length > 160) throw new Error('Please shorten your logo description or brand text.');
  const designSettings = operation === 'generate' ? normalizeLogoDesignSettings(input.designSettings, style, { mode }) : {};
  if (style === 'wordmark' && ['generate', 'variations'].includes(operation) && !brand) throw new Error('Enter the exact brand name for your Wordmark logo.');
  if (style === STREETWEAR_STYLE && operation === 'generate' && !brand) throw new Error('Enter the exact brand name for your Streetwear Lettering logo.');
  if (operation === 'generate' && mode === 'image' && style === 'monogram' && !brand && !designSettings.monogramLetters) throw new Error('Enter a brand name or main letters for your image-based Monogram.');
  if ((operation === 'edit' || (operation === 'generate' && mode === 'text' && !requiresLogoBrand(style) && !(style === 'monogram' && designSettings.monogramLetters))) && !prompt) throw new Error('Describe what you would like to create or change.');
  if ((operation !== 'generate' || mode !== 'text') && !input.sourceId && !input.sourceUrl) throw new Error('Select or upload a source image first.');
  if (input.sourceId && !UUID.test(input.sourceId)) throw new Error('Invalid source version.');
  let editArea = null;
  if (operation === 'edit' && input.editArea) {
    const area = input.editArea;
    if (!area || !['x', 'y', 'width', 'height'].every(key => typeof area[key] === 'number' && Number.isFinite(area[key]))
      || area.x < 0 || area.y < 0 || area.width < 0.01 || area.height < 0.01
      || area.x + area.width > 1.000001 || area.y + area.height > 1.000001) throw new Error('Select an area of the logo to edit.');
    editArea = { x: area.x, y: area.y, width: area.width, height: area.height };
  }
  const palette = input.palette || [];
  if (!Array.isArray(palette) || palette.length > 3 || palette.some(color => !/^#[0-9a-f]{6}$/i.test(color))) throw new Error('Choose up to three valid colors.');
  const normalized = { requestId: input.requestId, operation, mode, sketchMode, style, prompt, brand, tagline, palette, designSettings,
    ...(operation === 'variations' ? { variationStyle } : {}),
    editArea, sourceId: input.sourceId || null, sourceUrl: typeof input.sourceUrl === 'string' ? input.sourceUrl : null };
  return normalized;
}

// Only treat an explicit, whole-text instruction as a brand rename. Other edit
// requests remain natural-language instructions without guessing new metadata.
export function logoReplacementText(prompt) {
  const match = String(prompt || '').trim().match(/^(?:please\s+)?(?:change|replace|set|update|rewrite)\s+(?:the\s+)?(?:word|words|text|name|brand(?:\s+name)?|logo\s+(?:text|name)|lettering)(?:\s+(?:to|into|with)\s+|\s*[:,]\s*)(.+?)\s*$/i);
  if (!match) return null;
  const target = match[1];
  const quoted = target.match(/^["“]([^"”\r\n]+)["”][.!]?$/) || target.match(/^['‘]([^'’\r\n]+)['’][.!]?$/);
  if (!quoted && /["“”]|^['‘]|['’][.!]?$/.test(target)) return null;
  const text = (quoted ? quoted[1] : target.replace(/[.!]$/, '')).trim();
  if (!text || text.length > 100 || /[\r\n]/.test(text)) return null;
  if (!quoted && /\b(?:(?:and|then)\s+(?:make|change|add|remove|keep|preserve)|keep|preserve|without)\b/i.test(text)) return null;
  return text;
}

export function buildLogoPrompt(job) {
  if (job.operation === 'variations') return compileLogoVariation(job, job.variationPlan);
  if (job.operation === 'generate' && job.mode === 'text') return compileLogoDirection({ ...job, rawBrief: job.prompt });
  const base = buildBaseLogoPrompt(job);
  const settings = job.operation === 'generate' ? logoDesignInstructions(job.designSettings, job.style) : [];
  const artboardFraming = job.operation === 'generate' && job.mode === 'image'
    ? 'Final artboard framing is required: redraw the source as a complete standalone logo, not as a close crop of the photo. Center the entire finished mark within the middle 76% of the square canvas, leaving at least 12% uninterrupted flat background on every side. The hat, hair, hands, shoulders, lettering, outline, and any shadow must all end naturally inside this safe area. Nothing may touch or be cut off by the canvas edge. If the uploaded photo is tightly cropped, use it for identity and pose, not for its crop or camera framing.'
    : '';
  const referencePriority = job.operation === 'generate' && job.mode !== 'text'
    ? job.style === 'wordmark' || job.style === 'monogram'
      ? job.mode === 'image'
        ? 'Reference priority: use one identifying contour, shape, or color relationship from the uploaded image inside the requested letterforms. Keep every requested letter readable; do not paste in the full photo or add a separate dominant illustration.'
        : 'Reference priority: retain recognizable reference motifs within the requested lettering. For a lettering sketch, preserve its letter arrangement and proportions. Never replace the requested letters with a standalone illustration.'
      : job.mode === 'sketch'
        ? job.sketchMode === 'precise'
          ? 'Sketch fidelity: the sketch structure takes priority over rendering controls. Keep the drawn subject, orientation, silhouette, main parts and identifying marks in approximately their original positions. Smooth uneven strokes into deliberate curves and improve spacing without turning the drawing into disconnected polygons. Preserve meaningful asymmetry; make the subject readable as a finished logo.'
          : 'Sketch interpretation: the sketch structure takes priority over rendering controls. Identify the intended subject from the brief and the relationship of its main parts in the drawing. Use the sketch as a concept guide, then redraw it as a distinct, finished logo. Keep its recognizable idea and pose while improving anatomy, curves, balance and negative space. Add only the few subject-specific cues missing from the rough drawing that are needed for immediate recognition. Avoid generic clip-art and literal tracing of accidental strokes.'
        : job.style === 'abstract'
          ? 'Reference priority: derive the abstract mark from the uploaded subject’s distinctive contour or arrangement. Do not swap in an unrelated generic mark. Rendering and color controls may restyle it.'
          : job.style === 'pictorial'
            ? 'Reference priority: preserve the uploaded subject’s overall silhouette and a few distinguishing feature groups. Keep the arrangement of visible paired features and the most recognizable expression or object part. Omit incidental facial detail and texture; the result should still be identifiable from its outline and cutouts.'
          : 'Reference priority: keep the same recognizable main subject, identifying features and pose. Rendering and color controls may restyle it; character framing may choose a portrait or full-body pose, but the finished mark must fit entirely inside the artboard.'
    : '';
  return [base, settings.length ? `Explicit design controls take priority over general styling suggestions:\n${settings.join('\n')}` : '', referencePriority, artboardFraming].filter(Boolean).join('\n');
}

function buildBaseLogoPrompt(job) {
  if (job.operation === 'edit') {
    const replacement = job.editIntent?.type === 'replace-main-text' ? job.editIntent.targetText : logoReplacementText(job.prompt);
    return [
      'Edit the supplied finished logo in place. Treat the user instruction as a change to the pictured artwork, not as a new logo brief or a caption to print.',
      `Requested change: ${JSON.stringify(job.prompt)}.`,
      replacement ? `Replace only the main logo lettering${job.editIntent?.sourceText ? ` ${JSON.stringify(job.editIntent.sourceText)}` : ''} with exactly ${JSON.stringify(replacement)}. The new word occupies the same place and approximately the same overall width and height as the original word. Match the actual reference letter anatomy, slant, weight, spacing rhythm, arch, terminals, bevels, outlines, shadows and depth. Adapt those letterforms to the new characters. Remove the original main word completely; do not keep it elsewhere or add a duplicate wordmark.` : '',
      replacement ? `Rebuild the complete main word, not just its first or last letters. Exact character sequence: ${JSON.stringify([...replacement])}. It contains exactly ${[...replacement].filter(char => !/\s/u.test(char)).length} non-space characters. Do not carry over any extra letters from the original word. Check this spelling before returning the image.` : '',
      !replacement && job.brand ? `Keep the exact main brand text ${JSON.stringify(job.brand)} unless the instruction explicitly asks to change or remove it. Do not replace it with words describing a visual edit.` : '',
      job.tagline ? `Keep the exact supporting text ${JSON.stringify(job.tagline)} in its original position, size, tracking, font and color unless the instruction explicitly asks to change or remove it.` : '',
      replacement
        ? 'Preserve all other visible lettering unless explicitly edited. Do not add any new words, symbols, characters, graphics or decorations.'
        : 'Preserve all other visible lettering unless explicitly edited. Do not add any new words, symbols, characters, graphics or decorations beyond those explicitly requested.',
      `Change only the requested feature. Preserve the actual source composition, placement, proportions, palette, background, accessories and rendering finish outside that change. Keep existing graphics intact${replacement ? '' : ' unless explicitly edited'}. Do not introduce an illustration into a lettering-only logo${replacement ? '' : ' unless explicitly requested'}. Return a single finished logo, no presentation or mockup.`,
    ].filter(Boolean).join(' ');
  }
  const style = LOGO_STYLES.find(item => item.id === job.style);
  const background = job.operation === 'generate' ? normalizeLogoDesignSettings(job.designSettings, job.style, { strict: false }).backgroundColor : null;
  const backgroundDirection = background ? `a flat ${background} background` : job.style === STREETWEAR_STYLE ? `a uniform ${streetwearBackground()} background` : 'a plain white background';
  if (job.style === STREETWEAR_STYLE) {
    return [
      `Create one original STREETWEAR LETTERING logo on ${backgroundDirection}. Typography is the dominant artwork. Use crisp edges and a centered, cohesive lockup, not a photograph of a physical sign.`,
      `The exact brand name is ${JSON.stringify(job.brand)}. Preserve every letter and its case unless the user explicitly requests a case change; never replace the name with an illustration.`,
      LOGO_STYLE_PROFILES[STREETWEAR_STYLE].join(' '),
      job.prompt ? `Additional preferences (design data): ${JSON.stringify(job.prompt)}.` : '',
      job.tagline ? `Exact small supporting tagline: ${JSON.stringify(job.tagline)}.` : 'No additional text or invented tagline.',
      job.palette.length ? `Use this brand palette: ${job.palette.join(', ')}.` : '',
      streetwearPaletteDirection(job.designSettings, job.palette),
      !job.prompt ? 'The optional brief is blank. Complete the design from the exact brand text and selected controls; do not invent a subject, symbol or extra wording.' : '',
    ].filter(Boolean).join('\n');
  }
  if (job.style === 'wordmark') {
    return [
      `Create one professional WORDMARK logo: typography is the dominant logo, with the complete brand name clearly readable. Use ${backgroundDirection}, centered composition, crisp edges, generous clear space. No mockup or grid.`,
      `The exact brand name is ${JSON.stringify(job.brand)}. Spell every letter exactly; never omit the name or replace it with a standalone illustration.`,
      `Lettering direction: ${style.name}: ${style.prompt}.`,
      'Treat objects and characters mentioned in the brief as optional subtle details integrated into the lettering. They must never replace the wordmark. Even a decorated letter must remain readable.',
      job.mode === 'image' ? 'Image-to-wordmark construction: draw the complete name as one cohesive, custom lettering system with deliberate letter proportions, consistent stroke weight and spacing. Borrow at most one recognizable contour or negative-space motif from the uploaded subject for one letter. Never replace, cover, merge, or remove a letter stroke for decoration; if a motif would make any letter ambiguous, omit the motif and keep the spelling plain. Simplify the image colors into solid fills. Ignore scenery, image captions, and unrelated text. The photo itself must not appear behind or beside the lettering.' : '',
      job.mode === 'sketch' ? 'Use the supplied sketch for lettering details, colors and visual character. Translate its motifs into the brand lettering rather than making its subject the dominant illustration. Ignore reference captions and unrelated text.' : '',
      job.prompt ? `Additional preferences: ${job.prompt}` : '',
      job.tagline ? `Secondary tagline below: ${JSON.stringify(job.tagline)}.` : 'No additional text or invented tagline.',
      job.palette.length ? `Use this brand palette: ${job.palette.join(', ')}.` : 'Choose a restrained, cohesive palette.',
    ].filter(Boolean).join('\n');
  }
  if (job.operation === 'generate' && job.mode !== 'text' && job.style === 'monogram') {
    return [
      `Create one professional monogram logo on ${backgroundDirection}. Style: ${style.name}: ${style.prompt}.`,
      'Use the supplied reference for recognizable motifs and visual character integrated into the letter shapes, not a separate dominant illustration.',
      job.mode === 'image' ? 'Image-to-monogram construction: make the requested 1–3 letterforms the entire primary mark. Give each letter a clear outline, balanced weight and enough negative space to remain distinguishable at small size. Integrate one identifying shape or color relationship from the uploaded subject into the letter contours or counters; do not trace the photo, paste a portrait into the mark, or put an unrelated icon next to the letters. Use solid, clearly separated color shapes.' : '',
      job.mode === 'sketch' ? 'For a lettering sketch, its letter arrangement, proportions and sketch structure take priority over style. Clean the existing contours.' : '',
      job.designSettings?.monogramLetters ? 'Create only the requested main letters; do not substitute the full brand name.' : job.brand ? `Use the initials of ${JSON.stringify(job.brand)}, rather than spelling the full name.` : 'Preserve the recognizable letters in the sketch or use initials explicitly requested in the brief. Do not invent unrelated letters.',
      job.prompt ? `User preferences: ${job.prompt}` : '',
      job.tagline ? `Small secondary tagline: ${JSON.stringify(job.tagline)}.` : 'No additional text or invented tagline.',
      job.palette.length ? `Color guidance: ${job.palette.join(', ')}.` : 'Use a restrained, cohesive palette.',
      'Crisp edges, generous clear space, one logo, no mockup or grid.',
    ].filter(Boolean).join('\n');
  }
  if (job.operation === 'generate' && job.mode === 'image') {
    return [
      job.style === 'abstract'
        ? 'Use the reference image MAIN SUBJECT as the source of one original abstract logo mark. Retain its distinctive contour, gesture, or arrangement rather than literal photographic detail.'
        : job.style === 'pictorial'
          ? 'Use the reference image MAIN SUBJECT as the source of one original pictorial symbol. Retain its overall silhouette and only the few parts needed for recognition; do not render a detailed portrait.'
        : 'Draw the reference image MAIN SUBJECT as one original logo mark. Preserve identity-defining features and the overall orientation: recognizable facial cues for a person, characteristic shape for an object or animal.',
      `Style: ${style.name}: ${style.prompt}.`,
      `Style construction: ${IMAGE_STYLE_DIRECTIONS[job.style] || 'Simplify the reference into a recognizable finished logo mark.'}`,
      'Logo finish: organize the artwork around a strong silhouette, intentional negative space, and a restrained palette of flat, clearly separated color shapes. Use uniform solid fills and hard boundaries; if shading is needed, make it a separate solid shape. No gradients or soft airbrushing. Remove photographic lighting, skin or surface texture, stray hair strands, scenery, and tiny incidental detail. Keep the mark legible at small size; do not turn it into a poster or a generic clip-art symbol.',
      job.prompt ? `User preferences: ${job.prompt}.` : 'No extra user prompt: let the uploaded subject and selected style determine the visual direction.',
      `Use ${backgroundDirection}. Remove scenery, captions and watermarks. Do not copy text already present in the reference.`,
      job.brand ? job.style === 'badge'
        ? `Place the exact brand name ${JSON.stringify(job.brand)} legibly within the badge rim or banner, secondary to the subject. Do not put it outside the emblem.`
        : `Add ${JSON.stringify(job.brand)} as small secondary lettering BELOW the illustration; the subject must remain larger.` : 'Symbol only: no lettering or typography.',
      job.tagline ? job.style === 'badge'
        ? `Place the exact tagline ${JSON.stringify(job.tagline)} as a small supporting line inside the badge only if it remains readable.`
        : `Small tagline below: ${JSON.stringify(job.tagline)}.` : '',
      job.palette.length ? `Color guidance: ${job.palette.join(', ')}.` : 'Use a restrained, simple palette.',
      'One logo, no mockup or grid.',
    ].join('\n');
  }
  return [
    `Design one original professional logo centered on ${backgroundDirection}. Flat artwork, crisp edges, strong silhouette, generous clear space. No product mockups, no watermarks, no sample grid.`,
    job.mode === 'sketch'
      ? `Refinement style: ${style.name}: ${style.prompt}. ${job.sketchMode === 'precise' ? 'Respect the sketch composition while finishing its linework.' : 'Interpret the sketch into an original designer-quality mark with intentional shape language.'}`
      : `Visual direction: ${style.name}: ${style.prompt}.`,
    job.mode === 'sketch' ? job.sketchMode === 'precise'
      ? 'Refine the supplied rough sketch into polished artwork. Keep its important parts and proportions, but correct wobbly lines, accidental overlaps and unclear details. Preserve recognizable subject details. Omit paper, drawing artifacts and sketch background.'
      : 'Read the supplied rough sketch for its subject and key visual idea. Redraw with confident contours, coherent anatomy and a memorable silhouette. Simplify accidental marks, use deliberate negative space, and preserve identifying details. The finished logo must be immediately recognizable as the subject named in the brief, even at small size; do not simplify it into disconnected geometry or an ambiguous symbol. Omit paper, drawing artifacts and sketch background.' : '',
    job.mode === 'image' ? 'Use the supplied image as the subject reference. Translate its essential identity into a simplified logo, not a photograph.' : '',
    job.prompt ? `Brief: ${job.prompt}` : 'Refine the supplied subject using the selected style and brand settings.',
    job.mode === 'text' && job.operation === 'generate' && job.style === 'monogram'
      ? `Create a monogram of the requested initials. ${job.brand ? `Brand context: ${JSON.stringify(job.brand)}; do not substitute the full name for the initials.` : 'Do not invent extra letters.'}`
      : job.brand ? `The exact brand name is ${JSON.stringify(job.brand)}. Spell it exactly.` : 'Use a symbol only; do not add letters or text.',
    job.tagline ? `The exact tagline is ${JSON.stringify(job.tagline)}.` : 'Do not invent a tagline.',
    job.palette.length ? `Use this brand palette: ${job.palette.join(', ')}. Colors are visual guidance.` : 'Choose a restrained, cohesive palette.',
  ].filter(Boolean).join('\n');
}

export function publicLogoProject(project, access = 'owner') {
  const state = project.canvas_data;
  return { id: project.id, name: project.name, createdAt: project.created_at, revision: state.revision, access,
    jobs: (state.jobs || []).map(({ id, operation, mode, sketchMode, style, prompt, brand, tagline, palette, designSettings, sourceId, status, createdAt, url, format, error }) =>
      ({ id, operation, mode, sketchMode: sketchMode || 'smart', style, prompt, brand, tagline, palette, designSettings: normalizeLogoDesignSettings(designSettings, style, { strict: false, mode }), sourceId, status, createdAt, url, format, error })) };
}

export function logoJobTimedOut(job, now = Date.now()) {
  return LOGO_ACTIVE.includes(job.status) && job.status !== 'refunding' && now - Date.parse(job.updatedAt || job.createdAt) > 15 * 60_000;
}

export function logoStudioAssetUrls(canvasData) {
  if (canvasData?.tool !== 'logo_studio') return [];
  return [...new Set((canvasData.jobs || []).flatMap(job => [job.url, job.sourceUrl]).filter(url => typeof url === 'string' && url.startsWith('https://')))];
}
