import { LOGO_DESIGN_FIELDS, logoDesignInstructions, normalizeLogoDesignSettings } from './logoDesignSettings.mjs';

// This contract is used only by Recraft Text to Logo creation. Reference-image
// creation and Streetwear retain their existing compilers and defaults.
export const LOGO_TEXT_DIRECTION_VERSION = 'text-direction-12';
export const TEXT_STYLE_GRAMMAR = Object.freeze({
  minimalist: 'A reduced identity symbol with a decisive outer silhouette, a few intentional masses and carefully opened negative spaces. Recognition comes from the contour rather than internal illustration. The selected solid, outline or negative-space construction defines how the mark is built.',
  mascot: 'A finished illustrated brand mascot: distinctive character anatomy, a clear expression, purposeful pose and a compact readable silhouette. Construct facial features as bold separated shapes; use a deliberate contour hierarchy and a small number of hard-edged shadow planes. The subject determines its character; do not make every mascot an angry sports animal.',
  retro: 'A mid-century advertising mascot with rubber-hose gesture, expressive ink contours and exaggerated character proportions. Use coherent vintage cartoon anatomy and a compact spot-ink silhouette. Keep it distinct from angular esports artwork, a modern emoji or a distressed poster.',
  cartoon: 'An expressive contemporary cartoon brand character with exaggerated proportions, clear gesture and rounded contour rhythm. Simplify anatomy into appealing connected forms with readable facial features. Use deliberate flat color groups and limited shape-based shading rather than a realistic illustration.',
  badge: 'An integrated badge or crest with a clear outer enclosure, a dominant central subject and a disciplined border hierarchy. Fit the artwork and any supplied text into a unified silhouette, with readable internal spacing. The selected badge shape controls the actual outer contour.',
  monogram: 'A custom lettermark in which the requested initials are the primary artwork. Coordinate stems, joins, terminals and counters into one intentional system while keeping each letter identifiable. Any requested motif belongs inside the letter construction rather than beside an unrelated initial.',
  wordmark: 'A bespoke typographic identity with the complete brand name clearly readable as the dominant artwork. Establish a recurring system of stems, terminals, counters and optical spacing. Requested motifs must never replace the wordmark or obscure a letter. Integrate a requested motif into a letter only if the complete spelling remains immediately readable; avoid a generic font next to a stock symbol.',
  line: 'An economical contour-based identity. The subject is described by intentional open lines, consistent stroke rhythm and deliberate connected or separated contours. Open negative space is part of the drawing; avoid filling the subject as a solid silhouette or shading it with hatching.',
  abstract: 'A designed symbolic reduction using coherent geometric or organic forms and deliberate negative space. Build the requested subject or idea out of the forms themselves. Preserve the requested element count, topology and relationships; abstraction must not become an unrelated ornamental swirl or a container around an illustration.',
  pictorial: 'A recognizable pictorial identity built from distinctive contours and a few interlocking solid color regions. Keep the defining subject characteristics, simplify secondary anatomy and make the silhouette readable at small size. Use purposeful positive and negative shapes rather than a scene or generic clip-art icon.',
  engraved: 'A printmaking identity with a strong outer silhouette and engraved tonal marks that follow the form. Group light, midtone and dark areas deliberately, leaving clear highlights and separation between strokes. The selected engraving technique and line quality define the drawing; do not replace them with smooth gradients or flat cartoon shading.',
  icon: 'A compact illustrated brand icon with immediately recognizable geometry, a clear viewpoint and large color regions. Separate overlapping parts with intentional shape boundaries, using only enough interior features to identify the subject. It is a standalone logo asset, not an app-button tile or a realistic product render.',
});

// Defaults fill gaps; they never add a new subject, accessory or brand name.
const AUTO = {
  minimalist: { symbolConstruction: 'use a solid silhouette with a small number of open cuts', structure: 'derive a consistent shape system from the subject, balancing smooth arcs and purposeful straight edges' },
  mascot: { detail: 'use medium-low internal detail: defining expression, major anatomy and at most a few large shadow regions', characterComposition: 'use a compact head-and-shoulders portrait for a character; show the whole subject when its action or defining feature needs the body', outlineThickness: 'use a substantial outer contour with lighter internal feature lines and generous gaps' },
  retro: { detail: 'retain expressive face and gesture with economical spot-ink details', characterComposition: 'use a complete compact character when a body or action is relevant; otherwise frame the identifying portrait', outlineThickness: 'use confident thick ink contours with open facial features' },
  cartoon: { detail: 'retain the expression and gesture, with a few large color and shadow shapes', characterComposition: 'use a complete compact character for an action, otherwise a close character portrait', outlineThickness: 'use bold rounded outer contours and lighter internal feature lines' },
  badge: { badgeType: 'build one integrated emblem without unrequested heraldic accessories', badgeShape: 'choose a simple enclosure that fits the subject and text; prefer a circular emblem when neither suggests a different silhouette', badgeDetail: 'use a clean modern badge with one central identity and an economical border' },
  monogram: { capitalization: 'preserve the case of supplied initials; use uppercase only when deriving initials from a brand', detail: 'keep letter recognition ahead of ornament', monogramTreatment: 'coordinate geometric stems and open counterforms', monogramWeight: 'use substantial medium-to-bold stems with optically balanced counters', monogramFont: 'use custom sans-serif construction unless the brief calls for another family' },
  wordmark: { letterType: 'keep the name as readable separate letterforms unless the requested family calls for connected strokes', detail: 'use one purposeful recurring letter feature rather than many decorations', rendering: 'use precise contemporary lettering craft', fontFamily: 'choose a custom readable family appropriate to the brief, defaulting to sans-serif', lettering: 'use substantial medium-to-bold strokes with open counters and preserve the supplied case', composition: 'use a horizontal reading order; balance multiple words without splitting a single word into invented words' },
  line: { lineThickness: 'use a confident medium contour that remains readable when reduced', lineStructure: 'follow the subject with flowing contours and a consistent curve rhythm', characterComposition: 'include the complete subject unless the brief asks for a portrait or a defining cropped detail', detail: 'keep only identifying contours; use empty space instead of small interior marks' },
  abstract: { detail: 'use a small coordinated set of major forms and deliberate counters', structure: 'derive geometric or organic construction from explicit shape cues; otherwise use coordinated geometric masses with intentional negative space' },
  pictorial: { characterComposition: 'include the whole subject unless a portrait or defining cropped feature better follows the brief', detail: 'use a few major solid regions and only essential identifying details', structure: 'simplify the subject into coherent contours rather than imposing an unrelated frame' },
  engraved: { detail: 'use controlled internal detail with three readable tonal groups', engravingStyle: 'use restrained vintage printmaking character', engravingTechnique: 'use directional line engraving following the subject form', lineQuality: 'use separated fine contours with a stronger outer silhouette' },
  icon: { detail: 'use a few distinct color planes with only essential identifying features', viewpoint: 'use a three-quarter view for a physical object when that reveals its form; keep an explicitly requested view or an inherently frontal symbol' },
};

export const TEXT_MOODS = Object.freeze({
  elegant: 'controlled proportions, graceful contour transitions and generous breathing room',
  clean: 'crisp joins, uncluttered shape boundaries and even optical spacing',
  professional: 'stable proportions, restrained expression and a clear visual hierarchy',
  nostalgic: 'period-aware proportions and warm familiar contour rhythm',
  energetic: 'directional contour rhythm and lively visual weight without extra motion symbols',
  friendly: 'open shapes, approachable proportions and softened transitions where compatible with the construction',
  cheerful: 'uplifting contour rhythm and an upbeat expression when a face is part of the subject',
  comforting: 'calm rounded rhythm, stable balance and gentle proportions',
  youthful: 'fresh exaggerated proportions and a lively but readable rhythm',
  sweet: 'gentle curves and charming proportions with clear feature separation',
  lively: 'varied but coordinated contour rhythm and an expressive silhouette',
  rugged: 'sturdy proportions and decisive joins; texture only when requested or intrinsic to engraving',
});
export const TEXT_PERSONALITIES = Object.freeze({
  playful: 'introduce a controlled surprise in proportion, gesture or letter rhythm',
  modern: 'use precise contemporary proportions and purposeful asymmetric balance where appropriate',
  rustic: 'use grounded hand-crafted contour rhythm without automatically adding grain or tools',
  classic: 'use enduring proportions, balanced hierarchy and restrained ornament',
  sophisticated: 'use subtle custom relationships and carefully resolved spacing',
  minimalist: 'reduce secondary ornament within the selected style; keep its defining construction',
  whimsical: 'use a charming unexpected contour or gesture within the requested subject',
  dynamic: 'use directional shape flow and a strong distribution of visual weight',
  vintage: 'use period-aware shape or lettering proportions within the chosen style',
  artistic: 'use a distinctive authored contour relationship rather than decorative clutter',
  inviting: 'use open negative spaces and an accessible, welcoming visual rhythm',
  natural: 'use balanced organic rhythm where compatible with explicit geometric controls',
  edgy: 'use decisive cuts and high-contrast proportions without adding spikes or weapons',
  stylish: 'use deliberate custom proportions and a concise focal feature',
  luxurious: 'use refined proportions, restrained ornament and generous clear space; do not assume gold or metallic effects',
  adventurous: 'use confident directional balance and an exploratory contour rhythm',
  bold: 'use substantial visual weight and a decisive silhouette while keeping counters open',
});
export const TEXT_INDUSTRIES = Object.freeze({
  food: 'Appetizing, approachable identity; legible lettering and a welcoming character when relevant. Do not add food, utensils or chef clothing unless requested.',
  technology: 'Precise, scalable identity with disciplined geometry and clear counters. Do not add circuits, arrows, lightning bolts or a robot unless requested.',
  creative: 'Distinctive authored contour or custom typographic feature with a clear hierarchy. Do not add brushes, cameras or art tools unless requested.',
  health: 'Calm, trustworthy proportions and accessible readability. Do not add medical crosses, leaves or wellness figures unless requested.',
  retail: 'Immediate recognition on signage and small labels, with a strong name-to-mark hierarchy. Do not add shopping bags, carts or storefronts unless requested.',
  education: 'Clear, approachable visual organization and readable forms across ages. Do not add books, graduation caps or school crests unless requested.',
  entertainment: 'Expressive personality and a memorable silhouette with clear display lettering when supplied. Do not add stages, screens or instruments unless requested.',
  home: 'Balanced, reassuring proportions and strong recognition on a small product label. Do not add houses, roofs or furniture unless requested.',
  automotive: 'Confident construction and readable identity on a small decal. Do not add a car, wheel, road or speed stripes unless requested.',
  outdoors: 'Grounded proportions and durable silhouette recognition. Do not add mountains, trees, leaves or a landscape unless requested.',
  fashion: 'Distinctive proportions and carefully spaced lettering that reproduces on a small garment label. Do not add clothing or automatically switch to Streetwear lettering.',
  travel: 'Welcoming, memorable identity with clear hierarchy at signage size. Do not add globes, airplanes, buildings or compass symbols unless requested.',
  community: 'Inclusive, approachable proportions and balanced visual relationships. Do not add hands, people or charity emblems unless requested.',
  sports: 'Decisive silhouette, strong separation and compact readability on team merchandise. Do not add equipment, a shield, aggression or an esports treatment unless the brief supports it.',
  manufacturing: 'Robust proportions, precise joins and clear reproduction on equipment labels. Do not add gears, factories or tools unless requested.',
});

// Conservative business-context inference. A lone animal/object or an invented
// brand name is insufficient evidence of an industry. Ambiguity stays neutral.
const INDUSTRY_CUES = {
  food: /\b(?:cafe|café|bakery|restaurant|coffee shop|tea shop|pizzeria|food brand|beverage brand)\b/i,
  technology: /\b(?:software company|software startup|saas|technology company|tech startup|app developer|cybersecurity)\b/i,
  creative: /\b(?:design studio|creative agency|art studio|photography business)\b/i,
  health: /\b(?:health clinic|dental clinic|wellness brand|medical practice|yoga studio|pharmacy)\b/i,
  retail: /\b(?:retail shop|online store|retail store|ecommerce|e-commerce)\b/i,
  education: /\b(?:school|tutoring|education company|learning center|learning centre)\b/i,
  entertainment: /\b(?:gaming studio|music label|entertainment company|film studio|game studio)\b/i,
  home: /\b(?:furniture brand|interior design|homeware|home decor)\b/i,
  automotive: /\b(?:auto repair|car dealership|automotive company|car detailing)\b/i,
  outdoors: /\b(?:outdoor gear|camping brand|hiking club|nature reserve)\b/i,
  fashion: /\b(?:fashion brand|clothing brand|apparel brand|fashion label)\b/i,
  travel: /\b(?:travel agency|tour company|hotel|resort|guesthouse)\b/i,
  community: /\b(?:nonprofit|non-profit|charity|community group)\b/i,
  sports: /\b(?:sports team|football club|basketball team|cycling club|fitness gym|sports club)\b/i,
  manufacturing: /\b(?:manufacturing company|industrial supplier|machine shop|fabrication company)\b/i,
};

const FONT_CONSTRUCTION = {
  sans: 'SANS-SERIF anatomy: plain stems with flush unadorned ends, open counters and consistent stroke logic. No serif feet, projecting slabs, hairline serifs or wedge-shaped terminals.',
  serif: 'SERIF anatomy: deliberate terminal serifs attached to recognizable stems, with coordinated stroke contrast and open counters.',
  script: 'SCRIPT anatomy: hand-drawn calligraphic strokes, coordinated entry/exit strokes and flowing joins; preserve every recognizable letter.',
  cursive: 'CURSIVE anatomy: connected handwritten letter construction with a consistent slant, readable loops and deliberate thick-to-thin rhythm.',
  block: 'BLOCK anatomy: substantial solid stems, firm corners and generous counters, with a consistent weight system.',
  rounded: 'ROUNDED anatomy: softened stroke ends, smooth corner radii and generous internal counters; retain distinct letter shapes.',
  bubble: 'BUBBLE anatomy: inflated rounded letter masses with open inset counters and controlled joins, rather than ordinary thin sans-serif text.',
  gothic: 'GOTHIC anatomy: broken blackletter strokes, deliberate waists and angular chisel terminals with narrow but open counters; not generic Roman serif letters.',
  geometric: 'GEOMETRIC anatomy: coordinated straight stems, repeated angles and circular or polygonal counters; deliberate optical corrections keep letters readable.',
};

// Recraft supports native background_color on V4.1. Resolve a simple Auto
// background only when the brief has not already assigned its treatment.
export function logoTextAutoBackground(input) {
  if (input.mode !== 'text' || input.operation !== 'generate' || !TEXT_STYLE_GRAMMAR[input.style]
    || input.designSettings?.backgroundColor || (input.compiledPrompt && input.compilerVersion !== LOGO_TEXT_DIRECTION_VERSION)) return null;
  const raw = input.rawBrief ?? input.prompt ?? '';
  if (/\b(?:background|backdrop|transparent|transparency)\b|\bon\s+(?:(?:a|an|the|plain|solid|flat|dark|light|deep|pale|soft|bright|muted|pastel|warm|cool|saturated|off)\s+)*(?:white|black|navy|blue|red|green|yellow|pink|purple|orange|cream|ivory|teal|gr[ae]y|#[0-9a-f]{3,8})\b/i.test(raw)) return null;
  const light = hex => {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return false;
    const rgb = [1,3,5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.8;
  };
  const primary = input.designSettings?.primaryColor;
  const colors = input.palette || [];
  const lightSubject = /(?:^|\b(?:a|an|one|the)\s+)(?:white|ivory|cream|silver-white)\s+(?!(?:eyes?|teeth|fangs?|outline|border|background)\b)\w+/i.test(raw);
  return (primary ? light(primary) : (colors.length && colors.every(light)) || lightSubject) ? '#111820' : '#FFFFFF';
}

export function resolveLogoTextDirection(brief) {
  if (!TEXT_STYLE_GRAMMAR[brief.style]) throw new Error('Unsupported Text to Logo direction.');
  const settings = normalizeLogoDesignSettings(brief.designSettings, brief.style, { mode: 'text' });
  const raw = brief.rawBrief ?? brief.prompt ?? '';
  // Remove quoted copy and exact brand text from inference, but never the prompt.
  const context = raw.replace(/"[^"\n]*"|'[^'\n]*'|“[^”\n]*”/g, ' ');
  const withoutBrand = brief.brand ? context.split(brief.brand).join(' ') : context;
  const inferred = Object.entries(INDUSTRY_CUES).filter(([,pattern]) => pattern.test(withoutBrand)).map(([id]) => id);
  const industry = settings.industry ? { id: settings.industry, source: 'control' }
    : inferred.length === 1 ? { id: inferred[0], source: 'brief-context' } : { id: null, source: 'neutral' };
  const suppressedControls = [];
  // Family defines anatomy more specifically than the broad letter-type hint.
  if (brief.style === 'wordmark' && settings.letterType && settings.fontFamily) {
    const connected = ['script', 'cursive'].includes(settings.fontFamily);
    if ((settings.letterType === 'block') === connected) suppressedControls.push('letterType');
  }
  if (brief.style === 'wordmark' && settings.lettering === 'block' && ['script', 'cursive'].includes(settings.fontFamily)) suppressedControls.push('lettering');
  if (settings.outlineThickness === 'none' && settings.outlineColor) suppressedControls.push('outlineColor');
  const autoBackground = logoTextAutoBackground({ ...brief, mode: 'text', operation: 'generate', designSettings: settings });
  return { version: LOGO_TEXT_DIRECTION_VERSION, industry, suppressedControls,
    background: settings.backgroundColor ? { color: settings.backgroundColor, source: 'control' }
      : autoBackground ? { color: autoBackground, source: 'auto-contrast' } : { color: null, source: 'brief' },
    automatic: Object.entries(AUTO[brief.style] || {}).filter(([field]) => !settings[field]).map(([field, instruction]) => ({ field, instruction, source: 'brief-then-style-default' })),
  };
}

function textControls(brief, settings, resolved) {
  const effective = Object.fromEntries(Object.entries(settings).filter(([key]) => !resolved.suppressedControls.includes(key) && !['mood', 'personality', 'industry'].includes(key)));
  const lines = logoDesignInstructions(effective, brief.style, { mode: 'text' });
  const font = brief.style === 'monogram' ? settings.monogramFont : brief.style === 'wordmark' ? settings.fontFamily : null;
  if (font) lines.unshift(FONT_CONSTRUCTION[font]);
  if (brief.style === 'engraved' && settings.engravingTechnique === 'stipple') lines.unshift('STIPPLE construction: build all tonal shading from separated ink dots whose density follows the form. Contour outlines may define edges; do not shade fur, horns or other parts with parallel hatch bands or crosshatching.');
  if (settings.mood) lines.push(`Mood: ${LOGO_DESIGN_FIELDS.mood.options.find(x => x.id === settings.mood).label}. Use ${TEXT_MOODS[settings.mood]}. Mood refines the selected construction; it does not change the subject, pose or assigned colors.`);
  if (settings.personality) lines.push(`Brand personality: ${LOGO_DESIGN_FIELDS.personality.options.find(x => x.id === settings.personality).label}. ${TEXT_PERSONALITIES[settings.personality]}. Keep explicit structure, font family, detail and color controls authoritative.`);
  if (resolved.suppressedControls.some(key => ['letterType', 'lettering'].includes(key))) lines.push('Resolve the incompatible broad letter-type hint using the more specific selected font family. Keep that family’s recognizable glyph anatomy and the exact spelling.');
  if (resolved.suppressedControls.includes('outlineColor')) lines.push('No outline is selected: do not introduce an outline merely to use the saved outline color.');
  if (brief.style === 'badge' && settings.badgeShape && settings.badgeType) lines.push('Badge shape defines the outer enclosure; badge type defines its internal hierarchy. Do not draw a second competing enclosure to satisfy the badge type.');
  if (brief.style === 'monogram' && settings.monogramTreatment === 'dimensional') lines.push('Retain the selected dimensional treatment through consistent hard-edged face and side planes; the detail budget simplifies ornament, not the requested depth.');
  if (brief.style === 'engraved' && settings.detail === 'minimal') lines.push('The minimal detail budget removes secondary ornament; retain the selected engraving technique and line quality for the essential tonal groups.');
  return lines;
}

export function compileLogoTextDirection(brief, direction) {
  const raw = brief.rawBrief ?? brief.prompt ?? '';
  const settings = normalizeLogoDesignSettings(brief.designSettings, brief.style, { mode: 'text' });
  const resolved = resolveLogoTextDirection({ ...brief, designSettings: settings });
  const autoBackground = logoTextAutoBackground({ ...brief, mode: 'text', operation: 'generate', designSettings: settings });
  const background = settings.backgroundColor ? `Use exactly ${settings.backgroundColor} as the flat background.`
    : autoBackground ? `Auto background: use one uniformly filled ${autoBackground} field with no gradient, vignette or texture. Preserve the requested foreground color; do not invent a backdrop tile, badge or frame to create contrast.`
    : 'Follow any background specified in the brief. Otherwise choose one plain flat field with strong foreground contrast: prefer white for dark foregrounds and a dark background for a white or very light foreground. Preserve the requested foreground color; do not invent a backdrop tile, badge or frame to create contrast.';
  const symbol = ['minimalist', 'abstract', 'pictorial', 'line', 'icon', 'engraved'].includes(brief.style);
  const noLettering = /\b(?:no|without|omit|exclude)\s+(?:(?:any|all)\s+)?(?:text|letters|lettering|words|typography)\b|\b(?:symbol|icon|mark)[ -]only\b/i.test(raw);
  const letteringRequested = !!brief.brand || !!brief.tagline || ['wordmark', 'monogram'].includes(brief.style)
    || (!noLettering && /["“][^"”\n]+["”]|\b(?:text|letters?|lettering|numbers?|digits?|wordmark|monogram|initials|typograph\w*|labels?|words?\s+(?:read|reading|says?)|(?:named|called)\s+\S+)\b/i.test(raw));
  const visibleContent = brief.style === 'monogram' && settings.monogramLetters
    ? `PRIMARY VISIBLE CONTENT: the monogram letters ${JSON.stringify(settings.monogramLetters)}. ${settings.monogramFont ? FONT_CONSTRUCTION[settings.monogramFont] : ''}`
    : !letteringRequested ? 'PRIMARY VISIBLE CONTENT: the requested subject only. Symbol-only artwork: leave all letters, initials, words, numbers, captions and signatures absent.'
      : '';
  return [
    `Create one original finished ${brief.style} logo. ${TEXT_STYLE_GRAMMAR[brief.style]}`,
    visibleContent,
    ...textControls(brief, settings, resolved).map(value => `Required design control: ${value}`),
    raw ? `User brief (preserve its subjects, essential motifs and relationships): ${raw}` : '',
    'Decision order: explicit design controls first; then the brief’s explicit visual preferences; then style defaults. Treat mood, personality and industry as refinements within that construction, never replacements for the requested subject or selected style.',
    'Keep the requested pose, viewing angle and facing direction. Do not mirror the subject or substitute a different stance. Preserve explicit counts, accessories, proportions and color relationships. Do not invent extra subjects.',
    symbol ? 'Do not invent alphabetic glyphs, monograms, letter-shaped backdrops, enclosing tiles, crests or badges. Use a letterform or enclosure only when explicitly requested in the brief.' : '',
    brief.style === 'monogram' ? `Render only the selected monogram letters or the initials explicitly requested in the brief. ${brief.brand ? `Brand context: ${JSON.stringify(brief.brand)}; if no initials are specified, derive up to three initials from its words. Do not substitute the full brand name for the monogram.` : 'Invent no additional letters.'}`
      : brief.brand ? `The exact brand name is ${JSON.stringify(brief.brand)}. Spell every letter exactly. Preserve supplied case unless the user explicitly selects another case. ${brief.style === 'wordmark' ? 'The name is the main artwork.' : 'Keep any lettering subordinate to the primary mark in a balanced compact lockup, unless the brief requests a different hierarchy.'}`
        : letteringRequested ? 'No invented brand text; only render lettering explicitly requested in the brief.' : '',
    brief.tagline ? `Exact supporting tagline: ${JSON.stringify(brief.tagline)}. Keep it secondary and legible.` : 'Do not invent a tagline.',
    resolved.industry.id ? `Industry context (${resolved.industry.source === 'control' ? 'selected' : 'inferred from the business description'}): ${LOGO_DESIGN_FIELDS.industry.options.find(x => x.id === resolved.industry.id).label}. ${TEXT_INDUSTRIES[resolved.industry.id]} Preserve the selected style and all explicit visual preferences.` : 'Industry Auto: keep the identity appropriate to the described business; when context is absent or ambiguous, use neutral branding and invent no sector symbols.',
    ...resolved.automatic.map(({field, instruction}) => `Auto ${LOGO_DESIGN_FIELDS[field].label}: first honor any explicit preference for this attribute in the brief or another selected control; only if unspecified, ${instruction}.`),
    !settings.mood && 'Mood Auto: follow the brief’s expression and tone; otherwise choose a balanced tone appropriate to the subject and selected style, without adding an emotion or pose that conflicts with the brief.',
    !settings.personality && 'Personality Auto: follow the described brand character; otherwise make the contours distinctive within the chosen style, without adding ornament or changing the subject.',
    direction && !direction.preserveBrief ? `Optional construction, only where consistent with the brief and controls: ${direction.construction} ${direction.composition}` : '',
    brief.palette?.length ? `Authoritative brand colors: ${brief.palette.join(', ')}. Explicit primary, secondary, outline and background assignments determine their roles.` : 'Follow colors specified in the brief and controls. Where colors are unspecified, choose a coherent restrained ink palette with strong separation; do not assume monochrome for every style.',
    background,
    'Use the selected drawing logic throughout the mark. Flat treatments use solid color regions with hard boundaries; engraved treatments use their selected tonal marks; dimensional lettering retains its selected depth. Avoid photographic lighting and mockup materials unless explicitly requested as part of the artwork.',
    'Keep the entire mark, lettering, outline and extended details inside the square artboard with comfortable clear space. Present one complete logo only, without mockup, presentation grid, watermark or comparison labels.',
  ].filter(Boolean).join('\n');
}
