// Ordinary short briefs, not curated marketing prompts. Review-only outputs.
export const textDirectionCases = [
  { style: 'minimalist', title: 'Otter silhouette · Auto', prompt: 'An otter curled around a pebble.' },
  { style: 'mascot', title: 'Badger mascot · Auto', prompt: 'A confident badger mechanic holding a wrench.' },
  { style: 'retro', title: 'Toaster character · Auto', prompt: 'A cheerful toaster waving.' },
  { style: 'badge', title: 'Coffee badge · selected shape', brand: 'ROOKRIDGE', prompt: 'A coffee roaster with a mountain and rising sun.', designSettings: { badgeType: 'emblem', badgeShape: 'hexagon', badgeDetail: 'minimal', industry: 'food' } },
  { style: 'monogram', title: 'AV lettermark · selected initials', brand: 'Arc Vale', prompt: 'An AV monogram for a design studio.', designSettings: { monogramLetters: 'AV', monogramFont: 'sans', monogramTreatment: 'geometric' } },
  { style: 'wordmark', title: 'Bakery lettering · Auto', brand: 'BLOOMBAKE', prompt: 'A cheerful bakery wordmark.' },
  { style: 'line', title: 'Heron contour · Auto', prompt: 'A heron standing on one leg.' },
  { style: 'abstract', title: 'White horse · geometric regression', prompt: 'A white horse standing in profile view, facing left, with a long flowing tail.', designSettings: { detail: 'minimal', structure: 'geometric' } },
  { style: 'pictorial', title: 'Kingfisher symbol · Auto', prompt: 'A kingfisher diving toward a ripple.' },
  { style: 'engraved', title: 'Ram engraving · selected stipple', prompt: 'A ram head in profile.', designSettings: { engravingTechnique: 'stipple', lineQuality: 'fine', detail: 'detailed' } },
  { style: 'icon', title: 'Lantern icon · selected viewpoint', prompt: 'A small yellow camping lantern.', designSettings: { viewpoint: 'three-quarter', industry: 'outdoors' } },
  { style: 'cartoon', title: 'Turtle courier · Auto', prompt: 'A cheerful turtle carrying a parcel.' },
];
