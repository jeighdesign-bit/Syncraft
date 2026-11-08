import { LOGO_EXAMPLE_RECENT } from './logoExampleRecent.mjs';
import { LOGO_BADGE_EXAMPLES } from './logoBadgeExamples.mjs';
import { LOGO_MASCOT_EXAMPLES } from './logoMascotExamples.mjs';

// Public starting points stay concise. The original production briefs remain
// in the source catalog and generation records for reproducibility.
const prompts = {
  'original-kovelune': 'Bold, flowing custom lettering stacked in two rows, KOVE above LUNE, with rounded strokes, open counters and a small tagline below.',
  'original-qz-foundry': 'Interlocking geometric QZ initials with chamfered corners, bold orange strokes and clear negative space between the letters. Show only the initials.',
  'original-duskvale': 'A coastal coffee badge with an enamel mug and curling ocean-wave steam inside a rounded diamond. Custom cream lettering across the middle, with the tagline below.',
};

// Removed from both public galleries at the user's request. Keep source records.
const retiredExampleIds = new Set([
  'original-mintwheel',
  'original-lumipod',
  'original-fernthread',
  'original-sunday-spore',
  'original-brimbop',
  'original-prismfold',
  'original-cindermoth',
  'original-zippear',
  'original-notchfold',
]);

// Public allowlist: user-approved Studio outputs, independently authored examples
// and original DARKMEN streetwear. Unverified collections remain retired.
export const LOGO_EXAMPLES = [
  ...LOGO_MASCOT_EXAMPLES,
  ...LOGO_BADGE_EXAMPLES,
  {
    id: 'wk-goat-shield',
    title: 'WK goat shield',
    mode: 'text',
    style: 'badge',
    brand: 'WK',
    tagline: '',
    prompt: 'a badge with a minimal goat',
    palette: [],
    designSettings: {
      mood: 'clean',
      badgeType: 'shield',
      badgeShape: 'shield',
      badgeDetail: 'illustrative',
      personality: 'minimalist',
    },
    image: '/images/logo-examples/studio-wk-goat-shield.webp?v=25b9b3735292',
  },
  ...LOGO_EXAMPLE_RECENT.filter(example => !retiredExampleIds.has(example.id)).map(example => ({
    ...example,
    prompt: prompts[example.id] ?? (example.style === 'streetwear-lettering'
      ? 'Custom apparel lettering with a strong, readable word silhouette and a small contrasting tagline below.'
      : example.prompt),
  })),
];
