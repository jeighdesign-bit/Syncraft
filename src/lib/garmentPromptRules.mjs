export const GARMENT_PROMPT_VERSION = "flex-v1";

const GARMENT_MODES = new Set(["ERASE_LOGOS", "PRESERVE_LOGOS"]);

export function resolveGarmentPromptMode(project) {
  if (project?.trace_type !== "mockup") return project?.ai_prompt || null;

  const persistedMode = project?.canvas_data?.garment_mode;
  if (GARMENT_MODES.has(persistedMode)) return persistedMode;
  if (GARMENT_MODES.has(project?.ai_prompt)) return project.ai_prompt;

  // Preserve is the safest legacy fallback: an unknown old project must not
  // silently erase visible artwork when its one-time ai_prompt was cleared.
  return "PRESERVE_LOGOS";
}

export function buildGarmentFlexibilityGuard(mode) {
  if (mode === "ERASE_LOGOS") {
    return `FINAL MODE CONTRACT — EXTRACT PATTERN ONLY (${GARMENT_PROMPT_VERSION})
This final contract has priority over any broader wording above.

1. Return the BACKGROUND DESIGN ONLY. Preserve background colors, gradients, textures, halftones, stripes, panels, flames, splashes, brush strokes, abstract geometry, repeating motifs, and non-semantic decorative shapes.
2. REMOVE every visible text or identity element without exception: all letters, words, names, numbers, equations, readable handwriting, team/sponsor/brand wordmarks, logos, crests, badges, taglines, years, flags used as badges, labels, and signatures.
3. REMOVE every foreground subject or focal artwork element: mascots, characters, animals, people, objects, emblems, standalone icons, and central illustrations. Large size, complexity, or integration into the composition does not exempt an element from removal.
4. Classify by visual role. A non-semantic field, texture, stripe, splash, or repeated abstract motif is background and must remain. A readable, recognizable, identity-bearing, or standalone focal subject is foreground and must be removed.
5. When uncertain, preserve only pixels that clearly belong to the continuous background pattern. Do not retain an uncertain focal subject merely because it is difficult to remove.
6. After removing foreground content, fill only its footprint by conservatively continuing the nearest supported background colors, lines, gradients, texture, or repeated motif. Do not redesign the surrounding composition.
7. Every background region must retain the same relative position, scale, direction, density, color relationship, and asymmetry as the source.
8. Do not crop, mirror, center, enlarge, shrink, duplicate, simplify, restyle, or rearrange the background composition. Do not turn it into a new balanced poster layout.

FINAL COMPLETENESS CHECK: Account for the top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, and bottom-right regions. Confirm that the full background pattern survived and that no text, number, logo, badge, mascot, character, object, emblem, or focal illustration remains before returning the image.`;
  }

  if (mode === "PRESERVE_LOGOS") {
    return `FINAL MODE CONTRACT — KEEP ALL ARTWORK (${GARMENT_PROMPT_VERSION})
This final contract has priority over any broader wording above.

1. Preserve EVERY visible printed element: all text, letters, numbers, names, logos, crests, badges, sponsors, mascots, characters, illustrations, equations, symbols, patterns, textures, gradients, borders, and micro-details.
2. Remove only the physical garment presentation: shirt silhouette, collar and sleeve shape, folds, wrinkles, fabric lighting, body curvature, camera perspective, hanger, person, and surrounding scene.
3. Never erase, replace, rewrite, autocorrect, summarize, simplify, or reinterpret any printed content. Difficult or partially readable content must retain its visible shapes rather than being omitted.
4. Every medium or large source element must appear once in the output at the same relative position, scale, orientation, color relationship, and overlap order.
5. Do not crop, mirror, center, enlarge, shrink, duplicate, beautify, or rearrange the composition. Do not create a new poster layout from the source elements.
6. Adapt to whatever design language is present. The source may be geometric, organic, typographic, illustrated, photographic, minimal, maximal, dark, bright, symmetric, or asymmetric; do not force it into any preferred style.

FINAL COMPLETENESS CHECK: Account for the top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, and bottom-right regions. Confirm that no visible printed element was omitted before returning the image.`;
  }

  return "";
}
