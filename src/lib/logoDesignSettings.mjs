const choices = (entries) => entries.map(([id, label, instruction]) => ({ id, label, instruction }));
export const LOGO_DESIGN_FIELDS = Object.freeze({
  streetwearLetters: { label: 'Lettering style', options: choices([
    ['gothic', 'Gothic', 'Draw tall condensed ornamental Gothic/blackletter-inspired display letters with waisted vertical stems, narrow open counters, sharp inset cuts and flared wedge terminals. Coordinate oversized first and last letters with the inner letters into a dense, sculpted word silhouette. Preserve every requested letter and its case; avoid a stock medieval font with a decorative border.'],
    ['script', 'Chicano-inspired script', 'Draw bold condensed Chicano-inspired script with a strong italic slant, tall ascenders, tightly fitted strokes and sharp chisel-cut joins. Extend the lead capital and terminal strokes into long coordinated crossbars or underlines. Use pointed, angular swashes and deliberate thick-to-thin contrast rather than loose round loops or thin signature writing. Preserve every requested letter and its case.'],
    ['racing-script', 'Racing script', 'Build energetic sign-painter script with a strong forward slant, tall lead capitals, tight flowing joins and a controlled underline sweep. Convey motorsport decal rhythm through the letters. Keep every requested letter and its case readable; add no vehicles, speed lines or racing symbols unless requested.'],
    ['retro-swash', 'Retro swash', 'Draw substantial vintage display lettering with rounded flared strokes, expressive looping terminals and balanced sweeping swashes integrated into the word silhouette. Keep counters open and every requested letter and its case readable; do not add extra words.'],
    ['graffiti-brush', 'Graffiti brush', 'Draw bold hand-painted street lettering with lively thick-to-thin brush strokes, a confident bounce and a flowing underline when it supports the name. Favor readable broad strokes over intricate interlocking arrows. Keep every requested letter and its case readable; do not add a wall, paint splatters or distressed texture unless requested.'],
    ['wildstyle', 'Wildstyle graffiti', 'Construct angular graffiti lettering with interlocking strokes, directional extensions and controlled arrow-like terminals integrated into the letters. Preserve open counters and a clear reading order rather than an illegible tangle. Keep every requested letter and its case readable; do not add separate arrows or symbols.'],
    ['spiked-display', 'Spiked display', 'Build bold condensed display letters with sharply tapered outward terminals, flared end letters and a strong readable central word silhouette. Use sparse deliberate spikes, with clear stems and open counters, rather than dense tangled thorns. Keep every requested letter and its case readable.'],
    ['tribal-metal', 'Tribal metal', 'Build a readable metal-inspired word silhouette with curved blade-like strokes, branching thorn terminals and balanced outward extensions. Integrate the ornament into recognizable letters and retain open counters; avoid illegible black-metal tangles. Keep every requested letter and its case readable; add no skulls or occult symbols unless requested.'],
    ['athletic-block', 'Athletic block', 'Construct weighty athletic display letters with firm slab-like or chamfered terminals, deliberate condensed proportions and consistent stem rhythm. Keep the block letter construction recognizable without switching to connected script. Keep every requested letter and its case readable; add no sports equipment or team crest unless requested.'],
    ['flared-serif', 'Flared serif', 'Draw custom high-contrast display serif letters with pronounced flared wedge terminals, elegant narrow counters and restrained extended crossbars. Balance expressive serif contours with a clear reading rhythm. Keep every requested letter and its case readable; do not substitute blackletter or connected script.'],
  ]) },
  streetwearLayout: { label: 'Lettering layout', options: choices([
    ['straight', 'Straight', 'Arrange the complete name on one straight horizontal baseline; do not arch or stack the words.'],
    ['arched', 'Arched', 'Sculpt the whole word into an arched envelope: contour the upper and lower letter edges together, raise the center of the lower edge, and extend the outer letters downward where appropriate. Adjust letter heights and proportions rather than rotating unchanged letters around a circle. Keep the reading order and all terminals clear.'],
    ['stacked', 'Stacked', 'Stack complete words into balanced readable rows without changing their order. For a single word keep it intact in a compact lockup.'],
  ]) },
  streetwearOutline: { label: 'Lettering outline', options: choices([
    ['single', 'Single', 'Use one deliberate separation outline around the lettering; do not add layered keylines. Keep counters open.'],
    ['layered', 'Layered', 'Build a dark separating base contour plus controlled accent keylines, with a bold inner separation and a fine outer edge. Follow the custom word silhouette closely, keeping counters and gaps open. Avoid many equally thick concentric sticker borders.'],
  ]) },
  streetwearDepth: { label: 'Lettering depth', options: choices([
    ['flat', 'Flat', 'Use flat solid lettering fills with no extrusion, bevel, highlights or shadow shading. Retain the selected outline treatment.'],
    ['extruded', 'Extruded', 'Draw a substantial consistent offset extrusion with hard-edged side planes and stepped shadow bands. Let the depth reinforce the shaped word silhouette. Keep letter faces flat without bevel highlights. This is illustrated depth, not a photographed 3D object.'],
    ['beveled', 'Beveled', 'Draw broad chiseled bevel planes across the letter faces, combining crisp inset highlights, two or three stepped light/dark bands and consistent offset side depth. Use solid color regions instead of a thin shiny rim or soft gradients. This is illustrated 3D shading, not a photographed metal sign or soft cast shadow.'],
  ]) },
  letterType: { label: 'Letter type', options: choices([
    ['block', 'Block letters', 'Build separate, clearly readable block letterforms.'],
    ['cursive', 'Cursive', 'Use flowing connected letter construction while keeping every letter readable.'],
  ]) },
  detail: { label: 'Details', options: choices([
    ['minimal', 'Minimalist', 'Use an economical detail budget with clear major shapes.'],
    ['detailed', 'Detailed', 'Use deliberate fine details that support the selected logo style and remain legible.'],
  ]) },
  rendering: { label: 'Treatment', options: choices([
    ['traditional', 'Traditional', 'Use traditional signwriting craft and established lettering proportions.'],
    ['brush', 'Brush strokes', 'Build the lettering with intentional brush-stroke rhythm.'],
    ['modern', 'Modern', 'Use a contemporary lettering treatment and precise optical spacing.'],
  ]) },
  fontFamily: { label: 'Font style', options: choices([
    ['serif', 'Serif font', 'Use letterforms with deliberate serifs.'],
    ['sans', 'Sans font', 'Use sans-serif letterforms without serif terminals.'],
    ['script', 'Script font', 'Use expressive hand-lettered script forms.'],
    ['cursive', 'Cursive font', 'Use flowing cursive lettering.'],
    ['block', 'Block letters', 'Use substantial block letterforms.'],
    ['rounded', 'Rounded letters', 'Use softened rounded letter terminals and corners.'],
    ['bubble', 'Bubble letters', 'Use inflated bubble letterforms with clear counterforms.'],
    ['gothic', 'Gothic letters', 'Use blackletter-inspired gothic letter construction.'],
    ['geometric', 'Geometric letters', 'Construct letterforms from a consistent geometric system.'],
  ]) },
  lettering: { label: 'Font characteristic', options: choices([
    ['bold', 'Bold', 'Use substantial bold lettering weight.'],
    ['italic', 'Italic', 'Use a deliberate italic slant in the lettering.'],
    ['condensed', 'Condensed', 'Use condensed letter proportions with readable counters.'],
    ['custom', 'Custom', 'Construct bespoke letterforms with a distinctive recurring feature.'],
    ['distressed', 'Distressed', 'Apply controlled distressed ink texture without damaging letter recognition.'],
    ['block', 'Block letters', 'Use solid block lettering.'],
    ['uppercase', 'Uppercase', 'Set the supplied words in uppercase letterforms, preserving their spelling.'],
    ['lowercase', 'Lowercase', 'Set the supplied words in lowercase letterforms, preserving their spelling.'],
    ['stylized', 'Stylized', 'Use expressive custom letter features with a coherent visual rhythm.'],
  ]) },
  composition: { label: 'Text alignment', options: choices([
    ['horizontal', 'Horizontal alignment', 'Arrange the main text horizontally on one baseline; do not stack or curve the words.'],
    ['vertical', 'Vertical alignment', 'Arrange the main lettering on a vertical axis with an intentional reading order.'],
    ['stacked', 'Stacked alignment', 'Stack the main words into balanced rows.'],
    ['diagonal', 'Diagonal alignment', 'Build a diagonal directional text lockup.'],
    ['curved', 'Curved alignment', 'Arrange the lettering along a deliberate curved baseline.'],
  ]) },
  characterComposition: { label: 'Character composition', options: choices([
    ['portrait', 'Portrait', 'Show a character portrait with a recognizable head and expression.'],
    ['full-body', 'Full body', 'Show the complete character from head to feet with a deliberate full-body pose.'],
  ]) },
  outlineThickness: { label: 'Outline thickness', options: choices([
    ['none', 'No outline', 'Separate the character forms with clear solid color boundaries rather than a surrounding contour stroke. Retain readable internal features.'],
    ['thin', 'Thin outline', 'Use a fine deliberate outer contour and lighter internal feature lines. Keep the outline subordinate to the character shapes.'],
    ['thick', 'Thick outline', 'Use a substantial confident outer contour with lighter internal feature lines. Preserve generous open gaps and facial counterforms; avoid repeated sticker borders.'],
  ]) },
  monogramLetters: { label: 'Main letters', type: 'initials' },
  capitalization: { label: 'Capitalization', options: choices([
    ['uppercase', 'Uppercase', 'Use uppercase forms for the selected monogram letters.'],
    ['lowercase', 'Lowercase', 'Use lowercase forms for the selected monogram letters.'],
  ]) },
  monogramTreatment: { label: 'Monogram treatment', options: choices([
    ['organic', 'Organic', 'Construct the monogram from flowing organic contours.'],
    ['geometric', 'Geometric', 'Construct the monogram from consistent geometric stems and counterforms.'],
    ['stylized', 'Stylized', 'Give the monogram a distinctive shared-contour or ligature feature.'],
    ['dimensional', '3D', 'Use a controlled dimensional monogram treatment with clear letter silhouettes.'],
  ]) },
  monogramWeight: { label: 'Monogram weight', options: choices([
    ['bold', 'Bold', 'Use substantial bold weight in the monogram.'],
    ['italic', 'Italic', 'Give the monogram an intentional italic slant.'],
    ['extra-bold', 'Extra bold', 'Use extra-bold monogram stems with open readable counterforms.'],
    ['medium', 'Medium weight', 'Use balanced medium-weight monogram strokes.'],
    ['custom', 'Custom', 'Use bespoke stroke proportions with a coherent rhythm.'],
  ]) },
  monogramFont: { label: 'Monogram font', options: choices([
    ['serif', 'Serif font', 'Use serif letter construction for the monogram.'],
    ['sans', 'Sans-serif font', 'Use sans-serif letter construction for the monogram.'],
    ['script', 'Script font', 'Use flowing script letter construction for the monogram.'],
    ['gothic', 'Gothic font', 'Use gothic or blackletter-inspired monogram construction.'],
  ]) },
  structure: { label: 'Structure', options: choices([
    ['geometric', 'Geometric', 'Build the symbol from consistent geometric shapes and deliberate counterforms.'],
    ['organic', 'Organic', 'Use curved organic contours and a natural flow in the symbol.'],
  ]) },
  symbolConstruction: { label: 'Mark construction', options: choices([
    ['solid', 'Solid silhouette', 'Express the minimal mark as a few major solid forms.'],
    ['outline', 'Outline mark', 'Express the minimal mark through economical open outlines.'],
    ['negative-space', 'Negative space', 'Make one intentional negative-space relationship the core of the minimal mark.'],
  ]) },
  lineThickness: { label: 'Line thickness', options: choices([
    ['thin', 'Thin lines', 'Use delicate thin contours that remain readable at the intended logo size.'],
    ['thick', 'Thick lines', 'Use confident thick contours and generous open spaces.'],
  ]) },
  lineStructure: { label: 'Line structure', options: choices([
    ['geometric', 'Geometric', 'Use a geometric contour system with precise directional relationships.'],
    ['curved', 'Curved', 'Build the line work around flowing continuous curves.'],
  ]) },
  badgeType: { label: 'Badge type', options: choices([
    ['shield', 'Shield', 'Use a shield-style badge hierarchy with a strong central identity.'],
    ['emblem', 'Emblem', 'Build an integrated emblem with a compact symbolic center.'],
    ['crest', 'Crest', 'Use a heraldic crest hierarchy with balanced supporting elements.'],
  ]) },
  badgeShape: { label: 'Badge shape', options: choices([
    ['shield', 'Shield'], ['oval', 'Oval'], ['circle', 'Circular'], ['triangle', 'Triangular'],
    ['hexagon', 'Hexagonal'], ['rectangle', 'Rectangular'], ['diamond', 'Diamond'], ['square', 'Square'],
  ].map(([id, label]) => [id, label, `Use a ${label.toLowerCase()} outer enclosure for the badge; fit its internal hierarchy to this silhouette.`])) },
  badgeDetail: { label: 'Badge detail', options: choices([
    ['minimal', 'Modern, minimalist', 'Use a modern minimal badge with few major forms and a clean border hierarchy.'],
    ['illustrative', 'Illustrative', 'Use an illustrative badge with deliberate internal artwork and readable supporting text.'],
  ]) },
  viewpoint: { label: 'Viewpoint', options: choices([
    ['three-quarter', 'Three-quarter view', 'Show the icon subject rotated so the front and one side are visible, with a foreshortened front plane. Do not substitute a straight-on front view with an offset shadow.'],
    ['front', 'Front view', 'Show the icon subject from the front.'],
    ['high-angle', 'High angle view', 'Look down at the icon subject from above so its top surfaces are visible; do not keep a straight-on eye-level front view.'],
  ]) },
  engravingStyle: { label: 'Engraving style', options: choices([
    ['vintage', 'Vintage', 'Use a vintage printmaking character in the engraved artwork.'],
    ['ornate', 'Ornate', 'Use controlled ornate engraved decoration around a clear central silhouette.'],
    ['intricate', 'Intricate', 'Use intricate engraved internal construction while preserving subject recognition.'],
    ['simplified', 'Simplified', 'Simplify the engraved construction to its essential contours and tonal groups.'],
  ]) },
  engravingTechnique: { label: 'Engraving technique', options: choices([
    ['line', 'Line engraving', 'Build shading with directional engraved lines that follow the subject form.'],
    ['crosshatch', 'Crosshatching', 'Build engraved shading with deliberate crossing hatch groups.'],
    ['stipple', 'Stippling', 'Use engraved stipple dots for tonal variation rather than crosshatching.'],
    ['etch', 'Etching', 'Use fine etched contours and controlled plate-like tonal marks.'],
  ]) },
  lineQuality: { label: 'Line quality', options: choices([
    ['fine', 'Fine detailed lines', 'Use fine detailed engraved lines with clear separation.'],
    ['ultra', 'Ultra detailed lines', 'Use dense intricate engraved line work with a controlled tonal hierarchy.'],
    ['varied', 'Varied line thickness', 'Use purposeful variation in engraved line thickness.'],
    ['thick', 'Thick lines', 'Use strong thick engraved lines with open negative spaces.'],
    ['simple', 'Simplified lines', 'Use simplified engraved lines and omit unnecessary micro-detail.'],
  ]) },
  mood: { label: 'Mood', options: choices([
    ['elegant', 'Elegant'], ['clean', 'Clean'], ['professional', 'Professional'], ['nostalgic', 'Nostalgic'],
    ['energetic', 'Energetic'], ['friendly', 'Friendly'], ['cheerful', 'Cheerful'], ['comforting', 'Comforting'],
    ['youthful', 'Youthful'], ['sweet', 'Sweet'], ['lively', 'Lively'], ['rugged', 'Rugged'],
  ].map(([id, label]) => [id, label, `Express a ${label.toLowerCase()} mood through shape, rhythm and visual weight.`])) },
  personality: { label: 'Brand personality', options: choices([
    ['playful', 'Playful'], ['modern', 'Modern'], ['rustic', 'Rustic'], ['classic', 'Classic'],
    ['sophisticated', 'Sophisticated'], ['minimalist', 'Minimalist'], ['whimsical', 'Whimsical'], ['dynamic', 'Dynamic'],
    ['vintage', 'Vintage'], ['artistic', 'Artistic'], ['inviting', 'Inviting'], ['natural', 'Natural'], ['edgy', 'Edgy'],
    ['stylish', 'Stylish'], ['luxurious', 'Luxurious'], ['adventurous', 'Adventurous'], ['bold', 'Bold'],
  ].map(([id, label]) => [id, label, `Give the brand a ${label.toLowerCase()} personality within the selected logo style.`])) },
  industry: { label: 'Industry', options: choices([
    ['food', 'Food & beverage'], ['technology', 'Technology'], ['creative', 'Creative arts'], ['health', 'Health & wellness'],
    ['retail', 'Retail & commerce'], ['education', 'Education'], ['entertainment', 'Entertainment'], ['home', 'Home & living'],
    ['automotive', 'Automotive'], ['outdoors', 'Nature & outdoors'], ['fashion', 'Fashion & apparel'], ['travel', 'Hospitality & travel'],
    ['community', 'Community & nonprofit'], ['sports', 'Sports & recreation'], ['manufacturing', 'Manufacturing & industrial'],
  ].map(([id, label]) => [id, label, `Design for the ${label.toLowerCase()} sector; avoid adding generic industry symbols unless they help the brief.`])) },
});

const sharedMoodFields = ['mood', 'personality', 'industry'];
export const LOGO_COLOR_ROLES = Object.freeze({ primaryColor: 'Primary', secondaryColor: 'Secondary', outlineColor: 'Outline', backgroundColor: 'Background' });
// Explicit profiles mirror the observed control groups, rather than inheriting
// one generic set. Minimalist is our own style, not Logo Diffusion's Auto mode.
export const LOGO_DESIGN_STYLE_FIELDS = Object.freeze({
  'streetwear-lettering': ['streetwearLetters', 'streetwearLayout', 'streetwearOutline', 'streetwearDepth'],
  minimalist: ['symbolConstruction', 'structure', ...sharedMoodFields],
  mascot: ['detail', 'characterComposition', ...sharedMoodFields],
  retro: [...sharedMoodFields],
  badge: ['badgeType', 'badgeShape', 'badgeDetail', ...sharedMoodFields],
  monogram: ['monogramLetters', 'capitalization', 'detail', 'monogramTreatment', 'monogramWeight', 'monogramFont', ...sharedMoodFields],
  wordmark: ['letterType', 'detail', 'rendering', 'fontFamily', 'lettering', 'composition', ...sharedMoodFields],
  line: ['lineThickness', 'lineStructure', 'characterComposition', 'detail', ...sharedMoodFields],
  abstract: ['detail', 'structure', ...sharedMoodFields],
  pictorial: ['characterComposition', 'detail', 'structure', ...sharedMoodFields],
  engraved: ['detail', 'engravingStyle', 'engravingTechnique', 'lineQuality', ...sharedMoodFields],
  icon: ['detail', 'viewpoint', ...sharedMoodFields],
  cartoon: ['characterComposition', 'detail', ...sharedMoodFields],
});

const textStyleFields = Object.freeze({
  mascot: ['detail', 'characterComposition', 'outlineThickness', ...sharedMoodFields],
  cartoon: ['characterComposition', 'detail', 'outlineThickness', ...sharedMoodFields],
  retro: ['detail', 'characterComposition', 'outlineThickness', ...sharedMoodFields],
});
export function logoDesignFields(style, { mode } = {}) {
  return ((mode === 'text' && textStyleFields[style]) || LOGO_DESIGN_STYLE_FIELDS[style] || []).map(key => [key, LOGO_DESIGN_FIELDS[key]]);
}

// Values are IDs from our catalog, never arbitrary prompt text from the client.
export function normalizeLogoDesignSettings(value, style, { strict = true, mode } = {}) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    if (strict) throw new Error('Choose valid logo design settings.');
    return {};
  }
  const allowed = new Set(logoDesignFields(style, { mode }).map(([key]) => key));
  const result = {};
  for (const [key, id] of Object.entries(value)) {
    if (Object.hasOwn(LOGO_COLOR_ROLES, key)) {
      if (typeof id === 'string' && /^#[0-9a-f]{6}$/i.test(id)) result[key] = id.toUpperCase();
      else if (strict) throw new Error('Choose a valid color.');
      continue;
    }
    const field = LOGO_DESIGN_FIELDS[key];
    const validInitials = key === 'monogramLetters' && typeof id === 'string' && /^[\p{L}\p{N}]{1,3}$/u.test(id);
    if (!Object.hasOwn(LOGO_DESIGN_FIELDS, key) || typeof id !== 'string' || (id && !(validInitials || field.options?.some(option => option.id === id)))) {
      if (strict) throw new Error('Choose valid logo design settings.');
      continue;
    }
    if (allowed.has(key) && id) result[key] = id;
  }
  return result;
}

export function logoDesignInstructions(value, style, options = {}) {
  const settings = normalizeLogoDesignSettings(value, style, options);
  const defaults = style === 'streetwear-lettering' ? [
    !settings.streetwearLetters && 'Auto lettering: follow an explicit lettering genre in the brief; otherwise draw tall condensed ornamental Gothic-inspired letters with waisted stems, inset cuts, flared terminals and narrow open counters. Shape the exact name into one dense custom word silhouette. Preserve exact spelling and case.',
    !settings.streetwearLayout && 'Auto layout: follow any explicit layout preference in the brief; otherwise use a sculpted arched word envelope for a short name, adjusting letter heights and extending the outer letters. For several words use tightly balanced rows when needed. Preserve reading order and never split a single word into invented words.',
    !settings.streetwearOutline && 'Auto outline: follow any explicit outline preference in the brief; otherwise use layered separation outlines with a dark base, controlled accent keylines and open counters. Keep the outer keyline fine; avoid repeated thick concentric borders.',
    !settings.streetwearDepth && 'Auto depth: follow any explicit finish preference in the brief; otherwise draw broad chiseled bevel planes, crisp inset highlights, stepped shade bands and consistent offset side depth. Use hard-edged ink regions, not soft photographic lighting.',
  ].filter(Boolean) : [];
  return [...defaults, ...Object.entries(settings).map(([key, id]) => {
    if (Object.hasOwn(LOGO_COLOR_ROLES, key)) return `Authoritative ${LOGO_COLOR_ROLES[key].toLowerCase()} color: ${id}. Apply this color specifically to the ${key === 'backgroundColor' ? 'flat image background' : key === 'outlineColor' ? style === 'streetwear-lettering' ? 'lettering separation outline, respecting the selected single or layered treatment' : 'logo outline, retaining the thickness requested in the brief or controls' : `${LOGO_COLOR_ROLES[key].toLowerCase()} logo elements`}; preserve this assigned role over suggested colors.`;
    const field = LOGO_DESIGN_FIELDS[key];
    if (key === 'characterComposition' && ['pictorial', 'line', 'engraved'].includes(style)) return id === 'full-body'
      ? 'Subject framing: Full body. Show the complete requested subject with all defining parts inside the artboard; do not invent a character face or limbs for an object.'
      : 'Subject framing: Portrait. Frame the identifying part of the requested subject; do not add a character face or expression to an inanimate object.';
    if (key === 'monogramLetters') return `Main letters: ${JSON.stringify(id)}. Build the primary monogram using only these letters; do not substitute the full brand name.`;
    if (style === 'abstract' && key === 'structure' && id === 'geometric') return 'Structure: Geometric. Simplify the requested subject into a small coordinated system of geometric masses and deliberate negative spaces. Favor angular segments and faceted planes for forms left unspecified by the brief; preserve explicitly requested curves, shapes and anatomy. Geometric construction must shape the subject itself, not merely put a smooth illustration inside a geometric frame.';
    const choice = field.options.find(option => option.id === id);
    const anatomy = key === 'streetwearLetters' ? ({
      gothic: 'Use upright broken blackletter strokes; exclude connected brush script, sports slabs and tribal branches.',
      script: 'Use tightly connected italic calligraphic strokes and pointed swashes; exclude upright Gothic stems and varsity slabs.',
      'racing-script': 'Use forward-driving connected italic signwriting with an underline sweep; exclude upright ornamental blackletter and thorn branches.',
      'retro-swash': 'Use soft rounded bulbous curves, looping swashes and a warm vintage rhythm; exclude sharp Gothic notches, chiseled wedge terminals and tribal thorns.',
      'graffiti-brush': 'Use gestural brush-built glyphs with visibly varied stroke widths, blunt brush ends and an irregular bounce; exclude rigid serif stems, Gothic waists and mechanical varsity slabs.',
      wildstyle: 'Use angular interwoven graffiti glyphs with overlapping ribbons, directional extensions and arrow terminals. Keep the word decipherable; exclude serif lettering, blackletter waists and ordinary connected script.',
      'spiked-display': 'Use heavy angular display glyphs with triangular outward spikes and broad central stems; exclude soft script loops, ornamental blackletter waists and branching tribal filigree.',
      'tribal-metal': 'Use thin-to-thick curved blade strokes with branching barbed terminals and an aggressive balanced silhouette. The branches are essential letter anatomy; exclude conventional Gothic or flared-serif glyphs with only a few added spikes.',
      'athletic-block': 'Use geometric varsity block glyphs with uniform heavy strokes, squared counters, chamfered corners and slab terminals; exclude curved ornamental waists, brush joins, pointed swashes and delicate serif contrast.',
      'flared-serif': 'Use contrasting thick and hairline Roman display strokes with smoothly widening wedge serifs; exclude broken Gothic strokes, waisted blackletter stems, tribal branches and varsity slabs.',
    })[id] : '';
    return `${field.label}: ${choice.label}. ${choice.instruction}${anatomy ? ` Required glyph anatomy (takes priority over shared styling): ${anatomy} Outlines and bevels must follow these glyphs, never replace their construction.` : ''}`;
  })];
}
