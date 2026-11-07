import { STREETWEAR_STYLE } from './logoStyleCapabilities.mjs';
import { STREETWEAR_ART_DIRECTION } from './logoStreetwear.mjs';

export const LOGO_PROFILE_VERSION = 'art-direction-10';
export const LOGO_STYLE_PROFILES = Object.freeze({
  [STREETWEAR_STYLE]: STREETWEAR_ART_DIRECTION,
  wordmark: ['Custom lettering is the main mark, with the complete brand name clearly readable. Requested motifs must never replace the wordmark or obscure any letter.', 'Follow the selected font, weight and alignment; preserve every brand letter.'],
  minimalist: ['Express the requested idea economically, following the selected solid, outline or negative-space construction.', 'Use a compact silhouette and optical balance. Remove secondary details rather than assembling many symbols.'],
  retro: ['Build a mid-century advertising character with rubber-hose gesture, exaggerated proportions and expressive ink contours.', 'Use restrained spot inks in the requested colors and the requested pose. Character construction must differ from an angular sports-team mascot.'],
  mascot: ['Construct a recognizable character with deliberate anatomy, pose, expression and contour rhythm.', 'Use controlled shape-based shading and a memorable silhouette, avoiding interchangeable clip-art anatomy.'],
  cartoon: ['Use playful exaggerated proportions, a distinct gesture and expressive rounded contour construction.', 'Make the character feel animated through its pose; bright color alone is not a cartoon treatment.'],
  badge: ['Design an enclosing emblem with a purposeful border hierarchy and balanced subject-to-frame scale.', 'Integrate text into the enclosure when supplied; choose enclosure geometry to suit the subject.'],
  monogram: ['Make the specified initials the primary mark, following the selected font, weight and treatment.', 'Keep each initial readable. Use joined or separate strokes as requested; add no extra letters or full brand name.'],
  pictorial: ['Simplify the recognizable subject into one distinctive contour or shared-shape relationship.', 'Use a few uniformly colored solid regions with hard boundaries and controlled internal detail.'],
  abstract: ['Communicate the requested idea through coherent organic or geometric forms, following the selected structure.', 'Honor the requested topology: connected, interlocking, closed around a central counter, or separate. Preserve the requested element count and relationships instead of substituting parallel decorative stripes. Use solid regions of uniform color.'],
  line: ['Create economical continuous contours with deliberate breaks, consistent stroke rhythm and clear subject recognition.', 'Use line hierarchy sparingly and preserve open negative space.'],
  engraved: ['Follow the selected engraving technique: stipple dots, crosshatching, line engraving or etching. Do not replace one technique with another.', 'Keep a strong silhouette, a controlled detail budget and the requested ink colors.'],
  icon: ['Use rounded compact geometry, limited interior detail and an immediately readable silhouette.', 'Construct simple solid color regions that remain clear at small sizes.'],
});
