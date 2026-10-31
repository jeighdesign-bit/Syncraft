export const REFERENCE_CATEGORIES = [
  { value: 'auto', label: 'Auto', description: 'Use the visible printed surface in your reference.' },
  { value: 'poster', label: 'Poster', description: 'Recover one flat poster and preserve its original layout.' },
  { value: 'lanyard', label: 'Lanyard', description: 'Recover one ribbon face, keeping its narrow proportions.' },
  { value: 'banner', label: 'Banner / Tarp', description: 'Recover the print inside the hems, frame and attachments.' },
  { value: 'packaging', label: 'Packaging', description: 'Recover one visible printed panel without mixing box faces.' },
  { value: 'label', label: 'Label / Sticker', description: 'Recover the printed label without its container or backing.' },
  { value: 'other', label: 'Other', description: 'Recover the selected artwork using a general extraction approach.' },
];

export function isReferenceCategory(value) {
  return REFERENCE_CATEGORIES.some(category => category.value === value);
}

export function normalizeReferenceCategory(value) {
  return isReferenceCategory(value) ? value : 'auto';
}

export function categoryRecoveryAnalysis(analysis, value) {
  const category = normalizeReferenceCategory(value);
  const layouts = { poster: 'flat_rectangle', lanyard: 'long_strip', banner: 'large_format_rectangle', packaging: 'packaging_panels' };
  return { ...analysis, reference_category: category, layout_strategy: layouts[category] || analysis.layout_strategy };
}

export function referenceCategoryInstructions(value) {
  const category = normalizeReferenceCategory(value);
  const rules = {
    auto: 'Identify one main printed surface in the selected reference and recover only its supported visible artwork. If there are several objects, select one dominant view; do not combine their designs.',
    poster: 'POSTER: recover one flat, front-facing poster canvas. Preserve the poster\'s text hierarchy, illustrations, margins that belong to the design, colors and relative placement. Remove its wall, frame, glass glare, hanging fixtures and surrounding scene, including the physical panel thickness and shadowed mounting lip. Photographs of product packages, food or people printed inside the poster are part of its composition and must remain. If already digital artwork, keep its composition unchanged. Do not turn it into a repeating pattern.',
    lanyard: 'LANYARD: recover one visible printed ribbon face as one continuous straight strip. Preserve its narrow proportions and the visible sequence, orientation, size and spacing of text, motifs and illustrations. Rotate/rectify the entire selected face together; do not rotate individual words to a different reading direction or compress its full length into a broader layout. Remove the clasp, hook, ring, buckle, stitching, sewn ends, surrounding scene and physical loop. Do not combine the reverse face, other ribbons or the ID card. Never tile the strip into extra columns or invent additional repeats. Never extend the ribbon graphics into the surrounding blank area. If the selected crop is already a flat finished strip, preserve that strip without regenerating a loop or a new pattern.',
    banner: 'BANNER / TARP: recover the inner printed rectangle, front-facing and axis-aligned; retain an explicitly visible nonrectangular printed contour such as a feather flag instead of inventing rectangle corners. Remove grommets, ropes, poles, frame, hems, clamps and the real surrounding scene. Do not redraw hardware as decorative circles, rails or border strips. Correct supported perspective, sag and folds while preserving the full original printed layout and tiny sponsor marks. Printed people and photographs inside the banner are artwork; people physically holding it are not. Never replace the print with a generic repeated pattern.',
    packaging: 'PACKAGING: recover only the dominant visible printed panel as a flat production canvas, ONE instance of that face. Keep that panel\'s lettering, logos, illustrations, printed product photographs and spacing. Exclude box thickness, flaps, side/top faces, shadows and product photography outside the selected printed face. Never transfer a side-panel logo onto the selected panel, assemble a new collage, duplicate the front, or invent a complete dieline or hidden panels. Keep unreadable small print as visible ink shapes rather than writing substitute words.',
    label: 'LABEL / STICKER: recover one visible printed label or decal in a front-facing view. Keep its supported printed contours, lettering and artwork. Exclude the bottle, cap, jar, liquid, container silhouette, backing paper, reflections and surrounding scene. Correct only supported curvature; do not invent wording or artwork from the unseen back of a wrapped label.',
    other: 'OTHER PRINTED SURFACE: recover one selected visible artwork region. Preserve its composition and proportions while removing the physical carrier and scene. Use visible evidence only; do not impose a poster, ribbon, packaging dieline or repeating-pattern layout.',
  };
  return `REFERENCE CATEGORY: ${REFERENCE_CATEGORIES.find(item => item.value === category).label}\n${rules[category]}\nThe category controls the target surface and layout. The separate extraction mode controls whether identity text and logos are retained or removed.`;
}
