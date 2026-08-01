/**
 * Aspect-ratio helpers shared by the server routes and the client modals.
 *
 * IMPORTANT: this module must stay dependency-free. The Extend Design preview in
 * ExtendCanvas renders the exact pads the server will apply, which only holds if
 * both sides run this same code.
 */

// Ratios are used by the legacy ratio-first API and as Nano Banana carrier
// ratios. The customer-visible crop still uses exact per-side expansion.
export const ALLOWED_ASPECT_RATIOS = [
  "21:9", "16:9", "3:2", "4:3", "5:4",
  "1:1", "4:5", "3:4", "2:3", "9:16",
];

export const RATIO_VALUES = {
  "21:9": 21 / 9, "16:9": 16 / 9, "3:2": 3 / 2, "4:3": 4 / 3, "5:4": 5 / 4,
  "1:1": 1 / 1, "4:5": 4 / 5, "3:4": 3 / 4, "2:3": 2 / 3, "9:16": 9 / 16,
};

// Where the EXISTING design sits on the enlarged canvas. New space goes on the
// opposite side(s) — "left" pins the design left and grows to the right.
export const ANCHORS = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right",
];

export const BLEED_PERCENTS = [0, 5, 10];

export const SEED_MODES = ["solid", "mirror", "repeat"];

// Recraft vectorize resizes to 2048 in trace-step3, so a padded canvas beyond
// that buys nothing downstream.
export const MAX_PADDED_DIMENSION = 2048;

// Caps how far one operation may grow the canvas. At 2x, the original design
// still occupies >=1024px of the 2048px vectorizer input, which is the floor
// where fine pattern detail survives tracing.
export const MAX_EXPANSION_FACTOR = 2.0;

// Quality guardrails for generative outpainting. Larger bands may be accepted
// technically, but become unreliable for print-ready pattern continuation.
export const SAFE_SIDE_EXPANSION_FACTOR = 0.25;
export const MAX_SIDE_EXPANSION_FACTOR = 0.35;

/**
 * Nearest allowed aspect ratio for an image's dimensions.
 * @returns {string} one of ALLOWED_ASPECT_RATIOS, or "auto" if dimensions are unusable.
 */
export function snapToAllowedAspectRatio(width, height) {
  if (!width || !height) return "auto";
  const ratio = width / height;
  let best = "auto";
  let minDiff = Infinity;
  for (const [str, val] of Object.entries(RATIO_VALUES)) {
    const diff = Math.abs(ratio - val);
    if (diff < minDiff) {
      minDiff = diff;
      best = str;
    }
  }
  return best;
}

/**
 * Split `add` pixels across the two sides of one axis, given where the design
 * is anchored. Returns [beforePad, afterPad] — i.e. [left, right] or [top, bottom].
 */
function splitByAnchor(add, position) {
  if (position === "start") return [0, add];          // design pinned start → grow at end
  if (position === "end") return [add, 0];            // design pinned end   → grow at start
  const before = Math.floor(add / 2);
  return [before, add - before];                      // centered → split evenly
}

function axisPositions(anchor) {
  const x = anchor.includes("left") ? "start" : anchor.includes("right") ? "end" : "center";
  const y = anchor.includes("top") ? "start" : anchor.includes("bottom") ? "end" : "center";
  return { x, y };
}

/**
 * Compute the padding needed to grow a source image to a target aspect ratio.
 *
 * The pads are derived FROM the target ratio, never the reverse. That is what
 * makes the padded canvas exactly the requested ratio (to within integer
 * rounding), which in turn lets the server reconcile fal's output with a
 * uniform scale instead of a shear. Letting a caller pick pixel amounts first
 * and snapping the ratio afterwards would break that guarantee.
 *
 * @param {object}  opts
 * @param {number}  opts.width          source width in px
 * @param {number}  opts.height         source height in px
 * @param {string}  opts.targetRatio    key of RATIO_VALUES
 * @param {string} [opts.anchor]        one of ANCHORS, default "center"
 * @param {number} [opts.bleedPercent]  uniform pre-pad on all four sides, default 0
 * @returns {{ pads: {top,right,bottom,left}, padded: {width,height} }}
 */
export function computeExtendPads({ width, height, targetRatio, anchor = "center", bleedPercent = 0 }) {
  const r = RATIO_VALUES[targetRatio];
  if (!r) throw new Error(`Unknown targetRatio: ${targetRatio}`);

  const bw = Math.round(width * bleedPercent / 100);
  const bh = Math.round(height * bleedPercent / 100);
  const pads = { top: bh, right: bw, bottom: bh, left: bw };
  let w = width + 2 * bw;
  let h = height + 2 * bh;

  const { x, y } = axisPositions(anchor);
  const current = w / h;

  if (current < r) {
    // Canvas is too narrow for the target ratio → grow width.
    const add = Math.round(h * r) - w;
    if (add > 0) {
      const [left, right] = splitByAnchor(add, x);
      pads.left += left;
      pads.right += right;
      w += add;
    }
  } else if (current > r) {
    // Canvas is too wide → grow height.
    const add = Math.round(w / r) - h;
    if (add > 0) {
      const [top, bottom] = splitByAnchor(add, y);
      pads.top += top;
      pads.bottom += bottom;
      h += add;
    }
  }

  return { pads, padded: { width: w, height: h } };
}

/**
 * Grow a source image by the exact amount the user dragged on each side. Nano's
 * supported-ratio carrier is internal and cropped away by the route, so no ratio
 * snapping or hidden padding changes the customer-visible canvas here.
 *
 * The design is never cropped—we only ever add the requested padding.
 *
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {{top,right,bottom,left}} opts.rawPads  what the user dragged, in px (>=0)
 * @returns {{ pads: object, padded: object, targetRatio: string }}
 */
export function computeExtendPadsFromIntent({ width, height, rawPads }) {
  const rp = {
    top: Math.max(0, Math.round(rawPads?.top || 0)),
    right: Math.max(0, Math.round(rawPads?.right || 0)),
    bottom: Math.max(0, Math.round(rawPads?.bottom || 0)),
    left: Math.max(0, Math.round(rawPads?.left || 0)),
  };

  // Preserve the user's exact per-side expansion amounts. The route may use a
  // user's crop literally—no ratio snapping or hidden cross-axis padding.
  const exactPadded = {
    width: width + rp.left + rp.right,
    height: height + rp.top + rp.bottom,
  };
  return {
    pads: rp,
    padded: exactPadded,
    targetRatio: snapToAllowedAspectRatio(exactPadded.width, exactPadded.height),
  };

}

/**
 * Validate a computed expansion against the growth caps. Shared so the route and
 * the modal reject for exactly the same reasons — no divergence between what the
 * UI offers and what succeeds.
 *
 * @returns {{ ok, reason, message, pads, padded }}
 */
export function checkExtendCaps({ width, height, pads, padded }) {
  const total = pads.top + pads.right + pads.bottom + pads.left;
  const fail = (reason, message) => ({ ok: false, reason, message, pads, padded });

  if (total === 0) {
    return fail("NO_GROWTH", "Drag an edge outward to add space for the AI to fill.");
  }
  if (padded.width > MAX_PADDED_DIMENSION || padded.height > MAX_PADDED_DIMENSION) {
    return fail(
      "EXPANSION_TOO_LARGE",
      `That needs a ${padded.width}×${padded.height} canvas, over the ${MAX_PADDED_DIMENSION}px limit.`,
    );
  }
  if (padded.width / width > MAX_EXPANSION_FACTOR || padded.height / height > MAX_EXPANSION_FACTOR) {
    return fail(
      "EXPANSION_TOO_LARGE",
      `That is more than ${MAX_EXPANSION_FACTOR}× growth in one step. Extend again after this one.`,
    );
  }
  const maxHorizontalPad = Math.floor(width * MAX_SIDE_EXPANSION_FACTOR);
  const maxVerticalPad = Math.floor(height * MAX_SIDE_EXPANSION_FACTOR);
  if (
    pads.left > maxHorizontalPad ||
    pads.right > maxHorizontalPad ||
    pads.top > maxVerticalPad ||
    pads.bottom > maxVerticalPad
  ) {
    return fail(
      "QUALITY_LIMIT",
      "Maximum recommended extension reached. Extend the result again for a larger canvas.",
    );
  }

  return { ok: true, reason: null, message: null, pads, padded };
}

/**
 * Ratio-first evaluation (kept for any caller that picks a ratio directly).
 * @returns {{ ok, reason, message, pads, padded }}
 */
export function evaluateExtend({ width, height, targetRatio, anchor = "center", bleedPercent = 0 }) {
  const { pads, padded } = computeExtendPads({ width, height, targetRatio, anchor, bleedPercent });
  return checkExtendCaps({ width, height, pads, padded });
}

/**
 * Drag-to-expand evaluation: the modal's live source of truth.
 * @returns {{ ok, reason, message, pads, padded, targetRatio }}
 */
export function evaluateExtendIntent({ width, height, rawPads }) {
  const { pads, padded, targetRatio } = computeExtendPadsFromIntent({ width, height, rawPads });
  return { ...checkExtendCaps({ width, height, pads, padded }), targetRatio };
}
