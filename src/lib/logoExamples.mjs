import { LOGO_EXAMPLE_RECENT } from './logoExampleRecent.mjs';

// Public starting points stay concise. The original production briefs remain
// in the source catalog and generation records for reproducibility.
const prompts = {
  'original-mintwheel': 'A confident tree-frog cyclist wearing a streamlined helmet, shown in three-quarter portrait with athletic lettering below.',
  'original-kovelune': 'Bold, flowing custom lettering stacked in two rows, KOVE above LUNE, with rounded strokes, open counters and a small tagline below.',
  'original-qz-foundry': 'Interlocking geometric QZ initials with chamfered corners, bold orange strokes and clear negative space between the letters. Show only the initials.',
  'original-lumipod': 'A firefly with leaf-shaped wings and an amber seed-shaped abdomen, combining garden lighting and nature in one compact symbol.',
  'original-duskvale': 'A coastal coffee badge with an enamel mug and curling ocean-wave steam inside a rounded diamond. Custom cream lettering across the middle, with the tagline below.',
  'original-fernthread': 'An alert rabbit sitting in side profile, drawn with bold curved outlines, upright ears and a rounded haunch. Indigo line art with the name below.',
  'original-sunday-spore': 'A cheerful capybara courier carrying a teal messenger bag and offering a yellow envelope, in a lively full-body cartoon pose.',
  'original-brimbop': 'A rounded coral backpack in three-quarter view, with a teal flap and leaf-shaped front pocket. Simple flat color planes and a friendly wordmark below.',
  'original-prismfold': 'Four broad curved wedges forming a flowing rounded diamond around an open four-point center. Alternate cobalt and mint, with a quiet wordmark below.',
  'original-cindermoth': 'A powerful mountain ram with a curled horn, standing in profile with one forehoof on a rock. Deep-green engraved lines and serif lettering below.',
  'original-zippear': 'A cheerful lightning-bolt character walking with a thumbs-up, cream gloves and chunky sneakers. Golden-yellow retro mascot with friendly vintage lettering below.',
  'original-notchfold': 'A swift bird sweeping upward, with long tapered wings, a forked tail and one crescent-shaped cutout. A single blue-teal silhouette with the name below.',
};

// Public allowlist: independently authored Studio examples and original DARKMEN
// streetwear only. Older reference-derived and unverified collections are retired.
export const LOGO_EXAMPLES = LOGO_EXAMPLE_RECENT.map(example => ({
  ...example,
  prompt: prompts[example.id] ?? (example.style === 'streetwear-lettering'
    ? 'Custom apparel lettering with a strong, readable word silhouette and a small contrasting tagline below.'
    : example.prompt),
}));
