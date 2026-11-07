import { LOGO_STYLE_PROFILES, LOGO_PROFILE_VERSION } from './logoStyleProfiles.mjs';
import { logoDesignInstructions } from './logoDesignSettings.mjs';
import { STREETWEAR_STYLE } from './logoStyleCapabilities.mjs';
import { streetwearBackground, streetwearPaletteDirection } from './logoStreetwear.mjs';
import { compileLogoTextDirection, LOGO_TEXT_DIRECTION_VERSION } from './logoTextDirection.mjs';
export const LOGO_COMPILER_VERSION = LOGO_TEXT_DIRECTION_VERSION;
export const logoCompilerVersion = style => style === STREETWEAR_STYLE ? LOGO_PROFILE_VERSION : LOGO_COMPILER_VERSION;
export function compileLogoDirection(brief, direction) {
  if (brief.style !== STREETWEAR_STYLE) return compileLogoTextDirection(brief, direction);
  const settings = brief.designSettings || {};
  const background = settings.backgroundColor
    ? `Use exactly ${settings.backgroundColor} as the flat background.`
    : brief.style === STREETWEAR_STYLE
      ? `Follow any background specified in the brief; otherwise use a plain ${streetwearBackground()} background.`
      : 'Follow any background specified in the brief. When no background is specified, choose a plain flat background with strong contrast against the requested subject colors: prefer white for dark foregrounds and a dark background for a white or very light foreground. Preserve the requested foreground color; do not invent a backdrop tile, badge or frame to create contrast.';
  const symbolStyle = ['abstract', 'pictorial', 'minimalist', 'line'].includes(brief.style);
  return [
    brief.rawBrief ? `User brief: ${brief.rawBrief}` : '',
    `Create one finished original logo, with crisp edges and purposeful optical spacing. ${background} The canvas is square; keep the entire mark, lettering and extended details inside the artboard with comfortable clear space. No mockup or presentation grid.`,
    `Selected style: ${brief.style}. ${LOGO_STYLE_PROFILES[brief.style].join(' ')}`,
    'Preserve the user brief’s subjects, essential motifs, object relationships and explicit visual preferences. Style defaults and optional construction never replace an explicit instruction.',
    symbolStyle ? 'Keep the requested pose, viewing angle and facing direction. Do not mirror the subject or substitute a different stance.' : '',
    symbolStyle ? 'Do not invent alphabetic glyphs, monograms, letter-shaped backdrops, enclosing tiles, crests or badges. Use a letterform or enclosure only when explicitly requested in the brief.' : '',
    brief.style === 'monogram'
      ? `Render the selected monogram letters, or the initials requested in the brief. ${brief.brand ? `Brand context: ${JSON.stringify(brief.brand)}. Do not substitute the full brand name for the monogram.` : 'Invent no additional letters.'}`
      : brief.brand ? `The exact brand name is ${JSON.stringify(brief.brand)}. Spell every letter exactly; apply any explicitly selected case, otherwise preserve the supplied case.` : 'No invented brand text; only render lettering explicitly requested in the brief.',
    brief.tagline ? `Exact supporting tagline: ${JSON.stringify(brief.tagline)}.` : 'Do not invent a tagline.',
    brief.style === STREETWEAR_STYLE ? 'Preserve the exact brand spelling and case unless explicitly asked to change case. Lettering is the dominant artwork; integrate requested motifs without obscuring the letters.' : '',
    direction && !direction.preserveBrief ? `Optional construction, only where consistent with the brief and controls: ${direction.construction} ${direction.composition}` : '',
    brief.palette.length ? `Authoritative brand colors: ${brief.palette.join(', ')}. Keep the assigned color roles.` : 'Follow colors specified in the brief and controls; choose a restrained palette only where colors are unspecified.',
    brief.style === STREETWEAR_STYLE ? streetwearPaletteDirection(brief.designSettings, brief.palette) : '',
    brief.style === STREETWEAR_STYLE && !brief.rawBrief ? 'The optional brief is blank. Complete the design from the exact brand text and selected controls; do not invent a subject, symbol or extra wording.' : '',
    ...logoDesignInstructions(settings, brief.style).map(instruction => instruction.startsWith('Auto ')
      ? `Style default, only where the brief and controls leave a choice unspecified: ${instruction}`
      : `Required design control (overrides conflicting brief text and style defaults): ${instruction}`),
    'Resolve all design decisions into one coherent mark. For flat treatments use uniformly colored regions with hard boundaries. Preserve detail only when the chosen style calls for it.',
  ].filter(Boolean).join('\n');
}
