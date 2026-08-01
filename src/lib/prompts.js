/**
 * Prompt builders for fal.ai image operations.
 *
 * Extend Design uses Nano Banana Pro as a semantic editor. It has no mask
 * parameter, so the input canvas itself carries the edit mask: untouched art in
 * one rectangle, neutral checkerboard everywhere the model must generate.
 */

/**
 * Build a concise, geometry-aware outpainting instruction. Long lists of
 * stylistic rules made the model focus on redrawing the composition; this
 * version gives it one edit target, one frozen rectangle, and local continuation
 * rules that work for characters, manga panels, geometric prints and textures.
 */
export function buildExtendPrompt({
  pads,
  padded,
  source,
  traceType = "jersey",
  carrier,
  visibleRect,
  sourceRect,
}) {
  const pct = (value, total) => ((value / total) * 100).toFixed(1);
  const kind = traceType === "logo" ? "flat logo artwork" : "flat sublimation print artwork";

  const changedSides = [];
  if (pads.left) changedSides.push(`left by ${pads.left}px`);
  if (pads.right) changedSides.push(`right by ${pads.right}px`);
  if (pads.top) changedSides.push(`top by ${pads.top}px`);
  if (pads.bottom) changedSides.push(`bottom by ${pads.bottom}px`);

  return `IMAGE EDIT TASK: OUTPAINT THE EXISTING ARTWORK. DO NOT CREATE A NEW COMPOSITION.

The input is a ${carrier.width}x${carrier.height} carrier canvas and defines the exact output layout. It contains one finished ${kind} surrounded by a gray checkerboard editing marker.

GEOMETRY
- The finished artwork occupies exactly x=${sourceRect.left}..${sourceRect.left + source.width - 1}, y=${sourceRect.top}..${sourceRect.top + source.height - 1}.
- In percentage terms, its rectangle starts at (${pct(sourceRect.left, carrier.width)}%, ${pct(sourceRect.top, carrier.height)}%) and is ${pct(source.width, carrier.width)}% wide x ${pct(source.height, carrier.height)}% high.
- The customer-visible crop occupies x=${visibleRect.left}..${visibleRect.left + padded.width - 1}, y=${visibleRect.top}..${visibleRect.top + padded.height - 1}.
- Requested visible extension: ${changedSides.join(", ")}.
- Every gray checkerboard pixel is EMPTY and must be replaced. The checkerboard is an edit marker, never part of the design.

PRIMARY INSTRUCTION
Keep the existing artwork at the same pixel position and scale. Extend it outward across the checkerboard so the result looks like one larger original print file. Treat each boundary locally: inspect what physically touches that boundary and continue only that element with matching direction, thickness, scale, spacing, color and drawing style. The first 32 pixels on both sides of every old boundary must visually overlap and align; every line crossing the boundary must meet its continuation at the exact same point.

ANTI-DUPLICATION LAW
- Continuation is not copying. Never paste, tile, mirror, echo or restart a complete portion of the existing composition.
- Never create a second character, face, body, limb, weapon, logo, emblem, word, manga panel, cloud cluster or focal object.
- If an object is cut by a boundary, complete that same object once from the exact cut edge. If it does not touch the boundary, it must not appear in the extension.
- For repeated backgrounds, continue the pattern phase and rhythm at the seam; do not reuse a recognizable large motif as a tile.
- When boundary evidence is ambiguous, extend the nearby background color/texture. Do not invent or duplicate a focal subject to fill space.

CONTINUITY CHECK
- Lines and panel edges cross the seam at the same angle and thickness.
- Gradients and color fields continue from the immediately adjacent edge pixels.
- Texture density and pattern scale stay constant.
- No seam, frame, checkerboard, blur, blank area or sudden style change remains.

OUTPUT RULES
Return one flat rectangular print artwork only. No shirt, jersey silhouette, collar, sleeve, fabric, folds, mockup, border, watermark or new text. Fill the entire carrier edge-to-edge. Preserve the same illustration style and sharpness.`;
}
