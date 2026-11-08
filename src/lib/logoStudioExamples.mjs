import { LOGO_EXAMPLES } from './logoExamples.mjs';
import { LOGO_BADGE_REFERENCE_EXAMPLES } from './logoBadgeReferenceExamples.mjs';
import { LOGO_MASCOT_EXAMPLES } from './logoMascotExamples.mjs';
import { LOGO_APPROVED_STYLE_EXAMPLES } from './logoApprovedStyleExamples.mjs';

// Keep the user's preferred Mascot and Badge collection first in both galleries.
const preferredExamples = [...LOGO_MASCOT_EXAMPLES, ...LOGO_BADGE_REFERENCE_EXAMPLES];
const preferredIds = new Set(preferredExamples.map(example => example.id));

// Studio ordering leaves the shared homepage catalog unchanged.
export const LOGO_PROMPT_EXAMPLES = [...preferredExamples, ...LOGO_APPROVED_STYLE_EXAMPLES,
  ...LOGO_EXAMPLES.filter(example => !preferredIds.has(example.id))];

// The workspace sidebar uses approved samples and their exact presets.
// Keep the existing Streetwear collection available below them.
export const LOGO_STUDIO_EXAMPLES = [
  ...preferredExamples,
  ...LOGO_APPROVED_STYLE_EXAMPLES,
  ...LOGO_EXAMPLES.filter(example => example.style === 'streetwear-lettering'),
];
