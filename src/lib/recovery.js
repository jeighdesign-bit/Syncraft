import { ALLOWED_ASPECT_RATIOS } from "@/lib/aspectRatio";

export const RECOVERY_LAYOUTS = [
  "flat_rectangle", "long_strip", "parallel_strips", "cylindrical_label",
  "sticker_decal", "packaging_panels", "large_format_rectangle", "unknown",
];

export const RECOVERY_STATES = ["safe", "partial", "insufficient"];

const severity = (value) => ["none", "low", "medium", "high"].includes(value) ? value : "unknown";

export function normalizeRecoveryAnalysis(raw = {}, fallbackAspectRatio = "1:1") {
  const state = RECOVERY_STATES.includes(raw.state) ? raw.state : "insufficient";
  const layout = RECOVERY_LAYOUTS.includes(raw.layout_strategy) ? raw.layout_strategy : "unknown";
  const ratio = ALLOWED_ASPECT_RATIOS.includes(raw.aspect_ratio) ? raw.aspect_ratio : fallbackAspectRatio;
  return {
    state,
    quality: ["good", "fair", "poor"].includes(raw.quality) ? raw.quality : "poor",
    confidence: Math.max(0, Math.min(100, Number(raw.confidence) || 0)),
    visible_coverage: Math.max(0, Math.min(100, Number(raw.visible_coverage) || 0)),
    layout_strategy: layout,
    aspect_ratio: ratio,
    perspective: severity(raw.perspective),
    curvature: severity(raw.curvature),
    folds: severity(raw.folds),
    reflections: severity(raw.reflections),
    missing_areas: Array.isArray(raw.missing_areas) ? raw.missing_areas.slice(0, 8).map(String) : [],
    expected_result: String(raw.expected_result || "Recovered visible artwork in a clean flat layout.").slice(0, 300),
    reason: String(raw.reason || "").slice(0, 300),
  };
}

export function recoveryAnalysisPrompt() {
  return `Analyze this single cropped reference for exact-visible print recovery. Do not design or reconstruct it.
Return JSON only with: state (safe|partial|insufficient), quality (good|fair|poor), confidence (0-100), visible_coverage (0-100), layout_strategy (flat_rectangle|long_strip|parallel_strips|cylindrical_label|sticker_decal|packaging_panels|large_format_rectangle|unknown), aspect_ratio (${ALLOWED_ASPECT_RATIOS.join("|")}), perspective/curvature/folds/reflections (none|low|medium|high), missing_areas (short string array), expected_result, reason.
aspect_ratio means the intended straight, front-facing printable plane—not the photographed crop box. Infer the original design proportion from supported outer edges, repeated geometry, and known rectangular layout. Do not copy a narrowed or widened camera-view ratio when perspective, folds, cropping, or fabric sag altered it.
Long, narrow, tall, or unusual aspect ratios are valid for banners, labels, lanyards, strips, and packaging panels. Do not mark a reference insufficient solely because one image dimension is below 256 pixels. If the artwork is recognizable but low resolution, use partial and explain that fine text/logo accuracy is limited. Use insufficient only when printable artwork is genuinely unreadable or no logical flat result is supported. Use partial when visible portions are recoverable but important areas are cropped, hidden, wrapped behind, covered by hardware, glare, folds, or low resolution. Never assume unseen back portions.`;
}

export function buildRecoveryPrompt({ analysis, mode, correction = "", sourceWidth, sourceHeight }) {
  const keepArtwork = mode === "UNIVERSAL_KEEP_ARTWORK";
  return `UNIVERSAL SYSTEM RULES
The reference image is the only source of truth. Recover printable artwork only. Remove the carrier object, surrounding scene, hardware, shadows, glare, folds, wrinkles, and photographic artifacts. Correct perspective and supported curvature. Do not redesign, beautify, mirror, or invent unsupported text, logos, shapes, panels, decorative dots, gradients, ornaments, patterns, or hidden areas.

CANVAS AND EVIDENCE LOCK
${keepArtwork ? "Preserve all visible printable evidence" : "Preserve all visible BACKGROUND evidence, excluding every foreground text, logo, badge, mascot, emblem, and mark that must be removed"} from the complete source crop${sourceWidth && sourceHeight ? ` (${sourceWidth}:${sourceHeight})` : ""}, but do not preserve the photographed crop geometry when it conflicts with the intended flat design. Recover the printable plane at its intended ${analysis.aspect_ratio || "auto"} aspect ratio. Do not crop supported ${keepArtwork ? "design content" : "background pattern content"}, invent hidden regions, or add visual interest.

GEOMETRIC RECTIFICATION LOCK
The intended flat printed design plane is the geometry target; the photographed pose is not. Unwarp the visible artwork into a straight, front-facing, axis-aligned production canvas. Remove camera rotation, keystone perspective, curved or sagging fabric geometry, folds, and slanted photographed borders while keeping the supported design relationships intact. The recovered artwork must fill all four canvas corners edge-to-edge. Its intended horizontal axes must be level and its intended vertical axes must be upright. Never leave white, black, transparent, or blank triangular wedges caused by retaining the source angle.

CONTENT INTEGRITY LOCK
The output must retain the source's ${keepArtwork ? "overall visual information density" : "background-pattern information density"}. Preserve every supported ${keepArtwork ? "color boundary, thin line, woven or printed texture, repeating motif, gradient transition, stripe, edge, symbol, and small graphic" : "non-logo color boundary, thin line, woven or printed texture, repeating background motif, gradient transition, stripe, and background edge"}. ${keepArtwork ? "Never remove supported foreground artwork." : "Do not preserve any foreground symbol or small graphic merely to retain information density; all text, logos, badges, mascots, emblems, and trademarks must be absent."} Never simplify detailed artwork into a solid fill, broad gradient, generic texture, blank canvas, or approximate color block. Long strips, narrow labels, lanyards, banners, and unusually shaped crops are complete designs, not background swatches.

DYNAMIC STRATEGY
Layout: ${analysis.layout_strategy}. Visible coverage: ${analysis.visible_coverage}%. Perspective: ${analysis.perspective}. Curvature: ${analysis.curvature}. Folds: ${analysis.folds}. Reflections: ${analysis.reflections}. Missing: ${analysis.missing_areas.join("; ") || "none detected"}.
Straighten or unwrap only what the reference supports. For parallel_strips or packaging_panels, separate only clearly independent printable components and keep their supported order. For every other layout, preserve one continuous canvas and the exact relative position, scale, orientation, and spacing of all visible elements.

USER MODE
${keepArtwork
    ? "KEEP ALL ARTWORK: reproduce every clearly visible text block, logo, symbol, border, texture, and graphic in the same position, scale, orientation, and color relationship. Do not omit or replace content. Never guess unreadable characters or hidden logo details; preserve their visible shapes exactly."
    : "BACKGROUND / PATTERN ONLY — CONTROLLED INPAINTING: remove EVERY text glyph, word, letter, number, logo, badge, trademark, mascot, emblem, and foreground illustration, including small, blurry, dark, translucent, shadow-like, or watermark-like copies. ZERO recognizable foreground artwork may remain. Treat removed foreground artwork only as holes. Fill each hole by continuing the immediately adjacent existing background colors, lines, and pattern geometry. Preserve all non-text background pixels and shapes. Never use the removed silhouette, mascot, letters, or emblem as inspiration for new background artwork. Never replace removed content with a new design."}
${keepArtwork
    ? "A flat-color, blank, simplified, or generic replacement is always a failed result."
    : "Preserve all supported non-text weave, texture, gradients, stripes, edges, and repeating pattern geometry. A flat-color result is valid only when the visible source background is genuinely flat and solid."}
Exact Visible Recovery only. Output clean flat artwork, not a mockup cut-out.${correction ? `\nTARGETED CORRECTION: ${correction}` : ""}`;
}

export function recoveryValidationPrompt(analysis, mode) {
  const backgroundOnly = mode === "UNIVERSAL_BACKGROUND_ONLY";
  return `Compare image 1 (source) and image 2 (recovered output). Validate exact-visible Universal recovery. Return JSON only: pass (boolean), usable_partial (boolean), failures (array selected from carrier_present, background_present, photographed_pose, bad_layout, missing_visible_artwork, missing_pattern, content_collapse, near_solid_output, moved_or_mirrored, color_shift, invented_text, invented_logo, foreground_artwork_remains, wrong_layout), correction (one concise instruction).
Expected layout is ${analysis.layout_strategy} at the intended ${analysis.aspect_ratio || "auto"} flat-design ratio. It must look like clean flat production artwork. The recovered plane must be front-facing and axis-aligned: intended top/bottom axes horizontal, intended side axes vertical, and artwork filling all four corners without white, black, transparent, or blank triangular wedges. Use bad_layout or wrong_layout when photographed tilt, keystone, curvature, sag, or a slanted outer edge remains. Compare information density: visible source text, graphics, pattern edges, and color boundaries must not disappear into a blank area, broad gradient, generic texture, or near-solid color. Use content_collapse or near_solid_output when detail has been broadly erased, and missing_pattern when a supported texture, weave, stripe, gradient structure, or repeating motif is absent. Missing or hidden source areas must not be presented as exact. A sharper or cleaner reconstruction of the same visible word, logo, or emblem in the same location is not invented artwork; use invented_text or invented_logo only for unsupported wording, identity, symbols, or duplicates. Use carrier_present or photographed_pose only when the output still contains a literal physical carrier, person, surrounding scene, or physical pose—not merely shadows or texture that belong to the printed design.${backgroundOnly ? " This is BACKGROUND ONLY: pass=false and include foreground_artwork_remains if ANY source text, number, word, logo, badge, trademark, mascot, or emblem remains in image 2. Preserve all supported non-text texture and pattern geometry; a flat-color result fails when the source background contains visible detail." : ""}`;
}
