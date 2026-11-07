import { LOGO_EXAMPLES } from './logoExamples.mjs';

// Keep one reviewed sample per non-streetwear style and retain the original
// streetwear collection. Every preview keeps its matching brief and controls.
const GENERATED_EXAMPLES = [
  {
    "id": "audit-minimalist-a",
    "title": "Minimalist — Geometric solid",
    "mode": "text",
    "style": "minimalist",
    "brand": "",
    "tagline": "",
    "prompt": "An otter curled around one smooth pebble, forming one compact integrated symbol. No text, extra objects or enclosing frame.",
    "designSettings": {
      "primaryColor": "#173B57",
      "backgroundColor": "#FFFFFF",
      "symbolConstruction": "solid",
      "structure": "geometric",
      "mood": "clean",
      "personality": "modern",
      "industry": "outdoors"
    },
    "image": "/images/logo-examples/studio-audit-minimalist-a.webp?v=29f006a3e5e1"
  },
  {
    "id": "audit-minimalist-b",
    "title": "Minimalist — Organic outline",
    "mode": "text",
    "style": "minimalist",
    "brand": "",
    "tagline": "",
    "prompt": "An otter curled around one smooth pebble, forming one compact integrated symbol. No text, extra objects or enclosing frame.",
    "designSettings": {
      "primaryColor": "#173B57",
      "backgroundColor": "#FFFFFF",
      "symbolConstruction": "outline",
      "structure": "organic",
      "mood": "clean",
      "personality": "natural",
      "industry": "outdoors"
    },
    "image": "/images/logo-examples/studio-audit-minimalist-b.webp?v=187568017fd7"
  },
  {
    "id": "audit-mascot-a",
    "title": "Mascot — Full body, minimal, thick outline",
    "mode": "text",
    "style": "mascot",
    "brand": "",
    "tagline": "",
    "prompt": "A friendly puffin holding one small compass in its left wing. Keep both eyes and its broad striped beak readable. No text or unrelated props.",
    "designSettings": {
      "primaryColor": "#263D57",
      "secondaryColor": "#F2A33A",
      "outlineColor": "#172536",
      "backgroundColor": "#FFFFFF",
      "characterComposition": "full-body",
      "detail": "minimal",
      "outlineThickness": "thick",
      "mood": "energetic",
      "personality": "adventurous",
      "industry": "travel"
    },
    "image": "/images/logo-examples/studio-audit-mascot-a.webp?v=7a89f8b97b10"
  },
  {
    "id": "audit-mascot-b",
    "title": "Mascot — Portrait, detailed, thin outline",
    "mode": "text",
    "style": "mascot",
    "brand": "",
    "tagline": "",
    "prompt": "A friendly puffin holding one small compass in its left wing. Keep both eyes and its broad striped beak readable. No text or unrelated props.",
    "designSettings": {
      "primaryColor": "#263D57",
      "secondaryColor": "#F2A33A",
      "outlineColor": "#172536",
      "backgroundColor": "#FFFFFF",
      "characterComposition": "portrait",
      "detail": "detailed",
      "outlineThickness": "thin",
      "mood": "friendly",
      "personality": "inviting",
      "industry": "travel"
    },
    "image": "/images/logo-examples/studio-audit-mascot-b.webp?v=ef013f8c5100"
  },
  {
    "id": "audit-retro-a",
    "title": "Retro mascot — Full body, bold vintage ink",
    "mode": "text",
    "style": "retro",
    "brand": "",
    "tagline": "",
    "prompt": "A smiling lemon character with one raised gloved hand. Mid-century advertising character, no lettering, extra props or distressed texture.",
    "designSettings": {
      "primaryColor": "#E5B936",
      "secondaryColor": "#284A42",
      "outlineColor": "#18382D",
      "backgroundColor": "#FFF8E8",
      "characterComposition": "full-body",
      "detail": "minimal",
      "outlineThickness": "thick",
      "mood": "nostalgic",
      "personality": "vintage",
      "industry": "food"
    },
    "image": "/images/logo-examples/studio-audit-retro-a.webp?v=8cc714bd785f"
  },
  {
    "id": "audit-retro-b",
    "title": "Retro mascot — Portrait, fine detailed ink",
    "mode": "text",
    "style": "retro",
    "brand": "",
    "tagline": "",
    "prompt": "A smiling lemon character with one raised gloved hand. Mid-century advertising character, no lettering, extra props or distressed texture.",
    "designSettings": {
      "primaryColor": "#E5B936",
      "secondaryColor": "#284A42",
      "outlineColor": "#18382D",
      "backgroundColor": "#FFF8E8",
      "characterComposition": "portrait",
      "detail": "detailed",
      "outlineThickness": "thin",
      "mood": "cheerful",
      "personality": "playful",
      "industry": "food"
    },
    "image": "/images/logo-examples/studio-audit-retro-b.webp?v=2012bc793d97"
  },
  {
    "id": "audit-badge-a",
    "title": "Badge — Circular illustrative emblem",
    "mode": "text",
    "style": "badge",
    "brand": "TIDEPOINT",
    "tagline": "COASTAL CLUB",
    "prompt": "A small lighthouse with exactly three light rays above two simple wave lines. Integrate the brand and tagline inside the badge. No dates or extra wording.",
    "designSettings": {
      "primaryColor": "#163E59",
      "secondaryColor": "#D4A555",
      "outlineColor": "#D4A555",
      "backgroundColor": "#FFF8E8",
      "badgeType": "emblem",
      "badgeShape": "circle",
      "badgeDetail": "illustrative",
      "mood": "professional",
      "industry": "community"
    },
    "image": "/images/logo-examples/studio-audit-badge-a.webp?v=6f3f8f5057de"
  },
  {
    "id": "audit-badge-b",
    "title": "Badge — Hexagonal minimal emblem",
    "mode": "text",
    "style": "badge",
    "brand": "TIDEPOINT",
    "tagline": "COASTAL CLUB",
    "prompt": "A small lighthouse with exactly three light rays above two simple wave lines. Integrate the brand and tagline inside the badge. No dates or extra wording.",
    "designSettings": {
      "primaryColor": "#163E59",
      "secondaryColor": "#D4A555",
      "outlineColor": "#D4A555",
      "backgroundColor": "#FFF8E8",
      "badgeType": "emblem",
      "badgeShape": "hexagon",
      "badgeDetail": "minimal",
      "mood": "clean",
      "industry": "community"
    },
    "image": "/images/logo-examples/studio-audit-badge-b.webp?v=e6f67171f53c"
  },
  {
    "id": "audit-monogram-a",
    "title": "Monogram — Bold geometric sans KH",
    "mode": "text",
    "style": "monogram",
    "brand": "Kite Harbor",
    "tagline": "",
    "prompt": "Use KH as the only main lettering. Keep both initials recognizable and give their relationship one intentional shared feature. No full brand name, icons or extra letters.",
    "designSettings": {
      "primaryColor": "#3D335B",
      "backgroundColor": "#F6F1E8",
      "monogramLetters": "KH",
      "capitalization": "uppercase",
      "monogramFont": "sans",
      "monogramWeight": "bold",
      "monogramTreatment": "geometric",
      "detail": "minimal",
      "personality": "modern"
    },
    "image": "/images/logo-examples/studio-audit-monogram-a.webp?v=741bc4b25124"
  },
  {
    "id": "audit-monogram-b",
    "title": "Monogram — Medium stylized serif KH",
    "mode": "text",
    "style": "monogram",
    "brand": "Kite Harbor",
    "tagline": "",
    "prompt": "Use KH as the only main lettering. Keep both initials recognizable and give their relationship one intentional shared feature. No full brand name, icons or extra letters.",
    "designSettings": {
      "primaryColor": "#3D335B",
      "backgroundColor": "#F6F1E8",
      "monogramLetters": "KH",
      "capitalization": "uppercase",
      "monogramFont": "serif",
      "monogramWeight": "medium",
      "monogramTreatment": "stylized",
      "detail": "detailed",
      "personality": "classic"
    },
    "image": "/images/logo-examples/studio-audit-monogram-b.webp?v=1c2469c086b1"
  },
  {
    "id": "audit-wordmark-a",
    "title": "Wordmark — Bold horizontal sans",
    "mode": "text",
    "style": "wordmark",
    "brand": "Luma Finch",
    "tagline": "",
    "prompt": "Distinctive readable brand lettering only, without a separate icon, decorative objects or an invented tagline.",
    "designSettings": {
      "primaryColor": "#246357",
      "backgroundColor": "#FFF8EE",
      "letterType": "block",
      "fontFamily": "sans",
      "lettering": "bold",
      "composition": "horizontal",
      "rendering": "modern",
      "detail": "minimal"
    },
    "image": "/images/logo-examples/studio-audit-wordmark-a.webp?v=658210daee64"
  },
  {
    "id": "audit-wordmark-b",
    "title": "Wordmark — Lowercase stacked serif",
    "mode": "text",
    "style": "wordmark",
    "brand": "Luma Finch",
    "tagline": "",
    "prompt": "Distinctive readable brand lettering only, without a separate icon, decorative objects or an invented tagline.",
    "designSettings": {
      "primaryColor": "#246357",
      "backgroundColor": "#FFF8EE",
      "letterType": "block",
      "fontFamily": "serif",
      "lettering": "lowercase",
      "composition": "stacked",
      "rendering": "traditional",
      "detail": "detailed"
    },
    "image": "/images/logo-examples/studio-audit-wordmark-b.webp?v=9ee42187a6a4"
  },
  {
    "id": "audit-streetwear-lettering-a",
    "title": "Streetwear Lettering — Straight athletic block, flat, single outline",
    "mode": "text",
    "style": "streetwear-lettering",
    "brand": "RIFT",
    "tagline": "NIGHT DIVISION",
    "prompt": "Apparel lettering with the exact brand name and a small supporting tagline. No icons, extra words or decorative objects.",
    "designSettings": {
      "primaryColor": "#F5EAD2",
      "secondaryColor": "#C65B3E",
      "outlineColor": "#EDB646",
      "backgroundColor": "#17283D",
      "streetwearLetters": "athletic-block",
      "streetwearLayout": "straight",
      "streetwearOutline": "single",
      "streetwearDepth": "flat"
    },
    "image": "/images/logo-examples/studio-audit-streetwear-lettering-a.webp?v=b77da26f2999"
  },
  {
    "id": "audit-streetwear-lettering-b",
    "title": "Streetwear Lettering — Arched retro swash, beveled, layered outline",
    "mode": "text",
    "style": "streetwear-lettering",
    "brand": "RIFT",
    "tagline": "NIGHT DIVISION",
    "prompt": "Apparel lettering with the exact brand name and a small supporting tagline. No icons, extra words or decorative objects.",
    "designSettings": {
      "primaryColor": "#F5EAD2",
      "secondaryColor": "#C65B3E",
      "outlineColor": "#EDB646",
      "backgroundColor": "#17283D",
      "streetwearLetters": "retro-swash",
      "streetwearLayout": "arched",
      "streetwearOutline": "layered",
      "streetwearDepth": "beveled"
    },
    "image": "/images/logo-examples/studio-audit-streetwear-lettering-b.webp?v=8a46c1bf3404"
  },
  {
    "id": "audit-line-a",
    "title": "Line art — Thick curved contours",
    "mode": "text",
    "style": "line",
    "brand": "",
    "tagline": "",
    "prompt": "One upright seahorse with a curled tail and a clear pointed snout. Show the complete subject. No bubbles, plants, filled body regions, shading or text.",
    "designSettings": {
      "primaryColor": "#15616B",
      "backgroundColor": "#FFF9EE",
      "lineThickness": "thick",
      "lineStructure": "curved",
      "characterComposition": "full-body",
      "detail": "minimal",
      "mood": "clean"
    },
    "image": "/images/logo-examples/studio-audit-line-a.webp?v=15e76b2b14c1"
  },
  {
    "id": "audit-line-b",
    "title": "Line art — Thin geometric contours",
    "mode": "text",
    "style": "line",
    "brand": "",
    "tagline": "",
    "prompt": "One upright seahorse with a curled tail and a clear pointed snout. Show the complete subject. No bubbles, plants, filled body regions, shading or text.",
    "designSettings": {
      "primaryColor": "#15616B",
      "backgroundColor": "#FFF9EE",
      "lineThickness": "thin",
      "lineStructure": "geometric",
      "characterComposition": "full-body",
      "detail": "detailed",
      "mood": "elegant"
    },
    "image": "/images/logo-examples/studio-audit-line-b.webp?v=9498afab0f9d"
  },
  {
    "id": "audit-abstract-a",
    "title": "Abstract — Minimal geometric segments",
    "mode": "text",
    "style": "abstract",
    "brand": "",
    "tagline": "",
    "prompt": "Exactly three distinct segments arranged around one open central counter to suggest circular motion. Each segment is separated by a small gap. No letters, arrows, enclosing frame or literal objects.",
    "designSettings": {
      "primaryColor": "#223C60",
      "secondaryColor": "#E27C61",
      "backgroundColor": "#FFF8EA",
      "structure": "geometric",
      "detail": "minimal",
      "personality": "modern",
      "industry": "technology"
    },
    "image": "/images/logo-examples/studio-audit-abstract-a.webp?v=195bb21778cf"
  },
  {
    "id": "audit-abstract-b",
    "title": "Abstract — Detailed organic segments",
    "mode": "text",
    "style": "abstract",
    "brand": "",
    "tagline": "",
    "prompt": "Exactly three distinct segments arranged around one open central counter to suggest circular motion. Each segment is separated by a small gap. No letters, arrows, enclosing frame or literal objects.",
    "designSettings": {
      "primaryColor": "#223C60",
      "secondaryColor": "#E27C61",
      "backgroundColor": "#FFF8EA",
      "structure": "organic",
      "detail": "detailed",
      "personality": "dynamic",
      "industry": "creative"
    },
    "image": "/images/logo-examples/studio-audit-abstract-b.webp?v=ddd12cfd0a96"
  },
  {
    "id": "audit-pictorial-a",
    "title": "Pictorial — Minimal geometric bird",
    "mode": "text",
    "style": "pictorial",
    "brand": "",
    "tagline": "",
    "prompt": "A kingfisher perched on a single short branch, facing right, with a long pointed beak. The whole bird and branch are visible. No text, face-like decorations or scenery.",
    "designSettings": {
      "primaryColor": "#126A79",
      "secondaryColor": "#DE9E43",
      "backgroundColor": "#FFF9EE",
      "structure": "geometric",
      "detail": "minimal",
      "characterComposition": "full-body",
      "personality": "modern",
      "industry": "outdoors"
    },
    "image": "/images/logo-examples/studio-audit-pictorial-a.webp?v=61b3c221cc3f"
  },
  {
    "id": "audit-pictorial-b",
    "title": "Pictorial — Detailed organic bird",
    "mode": "text",
    "style": "pictorial",
    "brand": "",
    "tagline": "",
    "prompt": "A kingfisher perched on a single short branch, facing right, with a long pointed beak. The whole bird and branch are visible. No text, face-like decorations or scenery.",
    "designSettings": {
      "primaryColor": "#126A79",
      "secondaryColor": "#DE9E43",
      "backgroundColor": "#FFF9EE",
      "structure": "organic",
      "detail": "detailed",
      "characterComposition": "full-body",
      "personality": "natural",
      "industry": "outdoors"
    },
    "image": "/images/logo-examples/studio-audit-pictorial-b.webp?v=af9e4d3777c2"
  },
  {
    "id": "audit-engraved-a",
    "title": "Engraved — Simplified fine stippling",
    "mode": "text",
    "style": "engraved",
    "brand": "",
    "tagline": "",
    "prompt": "One open walnut with one walnut leaf. A standalone engraved mark, no lettering, border, ribbons or scenery.",
    "designSettings": {
      "primaryColor": "#3B2A26",
      "backgroundColor": "#FFF5E1",
      "engravingStyle": "simplified",
      "engravingTechnique": "stipple",
      "lineQuality": "fine",
      "detail": "minimal",
      "personality": "natural"
    },
    "image": "/images/logo-examples/studio-audit-engraved-a.webp?v=aa4d9c4cfdcb"
  },
  {
    "id": "audit-engraved-b",
    "title": "Engraved — Detailed vintage crosshatching",
    "mode": "text",
    "style": "engraved",
    "brand": "",
    "tagline": "",
    "prompt": "One open walnut with one walnut leaf. A standalone engraved mark, no lettering, border, ribbons or scenery.",
    "designSettings": {
      "primaryColor": "#3B2A26",
      "backgroundColor": "#FFF5E1",
      "engravingStyle": "vintage",
      "engravingTechnique": "crosshatch",
      "lineQuality": "varied",
      "detail": "detailed",
      "personality": "classic"
    },
    "image": "/images/logo-examples/studio-audit-engraved-b.webp?v=d11b59cb23dc"
  },
  {
    "id": "audit-icon-a",
    "title": "Icon/Emoji — Minimal front view",
    "mode": "text",
    "style": "icon",
    "brand": "",
    "tagline": "",
    "prompt": "A compact friendly purple backpack icon with one front pocket and one small gold zipper pull. No face, lettering or scenery.",
    "designSettings": {
      "primaryColor": "#7751AD",
      "secondaryColor": "#E0B246",
      "outlineColor": "#362C5A",
      "backgroundColor": "#FFF9EF",
      "viewpoint": "front",
      "detail": "minimal",
      "mood": "friendly",
      "personality": "playful",
      "industry": "education"
    },
    "image": "/images/logo-examples/studio-audit-icon-a.webp?v=c26c732858f9"
  },
  {
    "id": "audit-icon-b",
    "title": "Icon/Emoji — Detailed high-angle view",
    "mode": "text",
    "style": "icon",
    "brand": "",
    "tagline": "",
    "prompt": "A compact friendly purple backpack icon with one front pocket and one small gold zipper pull. No face, lettering or scenery.",
    "designSettings": {
      "primaryColor": "#7751AD",
      "secondaryColor": "#E0B246",
      "outlineColor": "#362C5A",
      "backgroundColor": "#FFF9EF",
      "viewpoint": "high-angle",
      "detail": "detailed",
      "mood": "clean",
      "personality": "modern",
      "industry": "education"
    },
    "image": "/images/logo-examples/studio-audit-icon-b.webp?v=90d711b32279"
  },
  {
    "id": "audit-cartoon-a",
    "title": "Cartoon — Detailed full body, thick outline",
    "mode": "text",
    "style": "cartoon",
    "brand": "",
    "tagline": "",
    "prompt": "An upbeat red panda holding a small steaming cocoa mug with both paws. Keep its distinctive red-panda facial markings. No text, badge or surrounding objects.",
    "designSettings": {
      "primaryColor": "#C76A40",
      "secondaryColor": "#FFE8B8",
      "outlineColor": "#382B29",
      "backgroundColor": "#FFFFFF",
      "characterComposition": "full-body",
      "detail": "detailed",
      "outlineThickness": "thick",
      "mood": "cheerful",
      "personality": "playful",
      "industry": "food"
    },
    "image": "/images/logo-examples/studio-audit-cartoon-a.webp?v=c7ffeb9628e3"
  },
  {
    "id": "audit-cartoon-b",
    "title": "Cartoon — Minimal portrait, thin outline",
    "mode": "text",
    "style": "cartoon",
    "brand": "",
    "tagline": "",
    "prompt": "An upbeat red panda holding a small steaming cocoa mug with both paws. Keep its distinctive red-panda facial markings. No text, badge or surrounding objects.",
    "designSettings": {
      "primaryColor": "#C76A40",
      "secondaryColor": "#FFE8B8",
      "outlineColor": "#382B29",
      "backgroundColor": "#FFFFFF",
      "characterComposition": "portrait",
      "detail": "minimal",
      "outlineThickness": "thin",
      "mood": "friendly",
      "personality": "sophisticated",
      "industry": "food"
    },
    "image": "/images/logo-examples/studio-audit-cartoon-b.webp?v=a42365fb1003"
  }
];

const featuredIds = new Set([
  'audit-minimalist-b',
  'audit-mascot-b',
  'audit-retro-a',
  'audit-badge-b',
  'audit-monogram-a',
  'audit-wordmark-b',
  'audit-line-a',
  'audit-abstract-b',
  'audit-pictorial-b',
  'audit-engraved-b',
  'audit-icon-a',
  'audit-cartoon-a',
]);

export const LOGO_STUDIO_EXAMPLES = [
  ...GENERATED_EXAMPLES.filter(example => featuredIds.has(example.id)),
  ...LOGO_EXAMPLES.filter(example => example.style === 'streetwear-lettering'),
];
