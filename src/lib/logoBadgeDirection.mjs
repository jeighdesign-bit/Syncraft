export const BADGE_DIRECTION_VERSION = 'badge-direction-3';

export const BADGE_DIRECTIONS = Object.freeze({
  'modern-club': {
    label: 'Modern club crest',
    instruction: 'Build a contemporary club crest with a decisive subject silhouette, purposeful angular cuts, disciplined border weight and compact custom lettering. Give the subject, enclosure and lettering related geometry; avoid an unrelated mascot pasted inside a stock shield.',
    detail: 'use a small number of flat ink shapes and open cuts; retain identifying anatomy, not fur, tiny facial lines or decorative shading',
    subject: 'for an animal, prefer a complete readable body and purposeful stance when the brief leaves framing open; for an object, show its complete defining form',
  },
  'minimal-emblem': {
    label: 'Minimal emblem',
    instruction: 'Build a reduced emblem around one memorable silhouette or negative-space relationship. Use an economical enclosure and a small number of coordinated shapes. Let proportion and optical spacing create character; avoid nested shields, repeated keylines and ornamental filler.',
    detail: 'reduce internal marks to the few cuts needed for immediate recognition; keep the surrounding enclosure lighter than the central identity',
    subject: 'choose the most recognizable complete form or identifying part, following any framing requested in the brief',
  },
  heritage: {
    label: 'Heritage badge',
    instruction: 'Build a crafted heritage badge with restrained sign-painter or engraved character, balanced lettering and deliberate border rhythm. Use controlled contrast and a clear central identity. Heritage comes from construction and typography, not automatic distress, invented dates, ribbons or heraldic accessories.',
    detail: 'use selective illustrative detail with generous open space; avoid dense engraving or distressed texture unless requested',
    subject: 'choose framing that keeps the requested subject and supplied wording clear within the enclosure',
  },
});

export function badgeAutomaticDetail(settings) {
  return BADGE_DIRECTIONS[settings.badgeDirection]?.detail;
}

// Text creation only. Accepted artwork remains authoritative during refinements.
export function compileBadgeArtDirection(brief) {
  if (brief.style !== 'badge') return [];
  const settings = brief.designSettings || {};
  const direction = BADGE_DIRECTIONS[settings.badgeDirection];
  return [
    'Badge craft: design the subject, enclosure and supplied lettering as one deliberate identity. Coordinate contour angles, curves and visual weight. Keep open breathing room between the subject, border and text; avoid a generic shield-and-clip-art assembly.',
    'Use a clear hierarchy at small size: one dominant identity, readable supplied lettering and a restrained border. Preserve defining anatomy while removing incidental detail. Keep negative-space gaps open and stroke weights purposeful.',
    'Do not invent establishment years, dates, stars, crowns, laurels, ribbons, extra initials or slogans. Add a supporting motif only when the brief requests it. Return flat finished artwork with a clean background, no jersey, fabric texture or presentation scene.',
    direction && 'Direction defaults apply only to unspecified choices. Explicit subject framing, view, layout, enclosure, detail and color controls override direction defaults; explicit preferences in the brief override any remaining default.',
    direction && !settings.badgeSubject && `Subject framing Auto: first follow any framing or pose specified in the brief; otherwise ${direction.subject}. Never replace an explicitly requested head with a full body.`,
    direction && !settings.badgeLayout && 'Layout Auto: honor any layout stated in the brief; otherwise integrate the subject and supplied lettering through shared alignment and balanced negative space within the selected enclosure. Integration does not require merging unrelated objects.',
    settings.badgeSubject === 'full-body' && 'Show the complete requested subject, including feet, horns, tail or other defining extremities where relevant. Fit it naturally within the enclosure; do not substitute a large floating head or crop the body. Objects do not gain invented faces or limbs.',
    settings.badgeSubject === 'portrait' && 'Keep the subject to a head or its identifying focal detail. Do not add a full body merely because a club crest is selected; for objects, show their identifying part without inventing a face.',
    settings.badgeView === 'profile' && 'Render an actual side profile with consistent anatomy and overlap; do not keep a frontal face and turn only its eyes. Preserve an explicit left/right direction in the brief.',
    settings.badgeLayout === 'integrated' && 'Coordinate the central subject, enclosure and exact supplied lettering as one optical composition. Align their major edges and negative spaces; do not simply stack separate clip-art and text blocks.',
    settings.badgeLayout === 'framed' && 'Keep the illustration distinct inside a surrounding frame, with a clear inset gap. Balance supplied lettering within that frame; do not merge the subject into the border.',
    brief.brand && 'Treat the exact supplied brand text as designed badge lettering: coordinate its terminals, widths and spacing with the badge construction while preserving every character. Follow any requested font or text placement; invent no extra wordmark.',
    settings.badgeDetail === 'illustrative' && 'Illustrative detail permits meaningful subject features; it does not require extra border layers, decorative objects or photographic shading. Keep the selected direction and framing clear.',
  ].filter(Boolean);
}
