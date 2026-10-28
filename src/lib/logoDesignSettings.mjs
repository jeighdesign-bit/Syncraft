const choices = (entries) => entries.map(([id, label, instruction]) => ({ id, label, instruction }));
export const LOGO_DESIGN_FIELDS = Object.freeze({
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
    ['three-quarter', 'Three-quarter view', 'Show the icon subject from a recognizable three-quarter view.'],
    ['front', 'Front view', 'Show the icon subject from the front.'],
    ['high-angle', 'High angle view', 'Show the icon subject from a deliberate high-angle view.'],
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

export function logoDesignFields(style) {
  return (LOGO_DESIGN_STYLE_FIELDS[style] || []).map(key => [key, LOGO_DESIGN_FIELDS[key]]);
}

// Values are IDs from our catalog, never arbitrary prompt text from the client.
export function normalizeLogoDesignSettings(value, style, { strict = true } = {}) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    if (strict) throw new Error('Choose valid logo design settings.');
    return {};
  }
  const allowed = new Set(logoDesignFields(style).map(([key]) => key));
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

export function logoDesignInstructions(value, style) {
  const settings = normalizeLogoDesignSettings(value, style);
  return Object.entries(settings).map(([key, id]) => {
    if (Object.hasOwn(LOGO_COLOR_ROLES, key)) return `Authoritative ${LOGO_COLOR_ROLES[key].toLowerCase()} color: ${id}. Apply this color specifically to the ${key === 'backgroundColor' ? 'flat image background' : key === 'outlineColor' ? 'thin logo outline' : `${LOGO_COLOR_ROLES[key].toLowerCase()} logo elements`}; preserve this assigned role over suggested colors.`;
    const field = LOGO_DESIGN_FIELDS[key];
    if (key === 'monogramLetters') return `Main letters: ${JSON.stringify(id)}. Build the primary monogram using only these letters; do not substitute the full brand name.`;
    const choice = field.options.find(option => option.id === id);
    return `${field.label}: ${choice.label}. ${choice.instruction}`;
  });
}
