const SOURCE_FALLBACK_FAILURES = new Set([
  "content_collapse",
  "near_solid_output",
  "missing_pattern",
  "missing_visible_artwork",
  "moved_or_mirrored",
]);

const RECOVERY_RATIO_VALUES = {
  "21:9": 21 / 9,
  "16:9": 16 / 9,
  "3:2": 3 / 2,
  "4:3": 4 / 3,
  "5:4": 5 / 4,
  "1:1": 1,
  "4:5": 4 / 5,
  "3:4": 3 / 4,
  "2:3": 2 / 3,
  "9:16": 9 / 16,
};

export function shouldFallbackToSource(failures = []) {
  return failures.some(failure => SOURCE_FALLBACK_FAILURES.has(failure));
}

const BACKGROUND_ONLY_HARD_FAILURES = new Set([
  "foreground_artwork_remains",
  "content_collapse",
  "near_solid_output",
  "missing_pattern",
]);

export function shouldRejectBackgroundOnly(failures = []) {
  return failures.some(failure => BACKGROUND_ONLY_HARD_FAILURES.has(failure));
}

export function backgroundOnlyFailureMessage(failures = []) {
  if (failures.includes("foreground_artwork_remains")) {
    return "Background-only extraction still contained visible text, logos, or foreground artwork.";
  }
  if (failures.includes("missing_pattern")) {
    return "Background-only extraction removed too much of the visible pattern.";
  }
  if (failures.includes("content_collapse") || failures.includes("near_solid_output")) {
    return "Background-only extraction lost too much design detail.";
  }
  return "Background-only extraction did not pass the pattern-preservation check.";
}

export function sourceFallbackCorrection(failures = []) {
  if (failures.includes("missing_visible_artwork")) {
    return "The generated flatten omitted visible artwork, so Syncraft preserved the exact source crop instead.";
  }
  if (failures.includes("missing_pattern")) {
    return "The generated flatten omitted visible pattern detail, so Syncraft preserved the exact source crop instead.";
  }
  if (failures.includes("moved_or_mirrored")) {
    return "The generated flatten changed the artwork orientation, so Syncraft preserved the exact source crop instead.";
  }
  return "The generated flatten collapsed visible detail, so Syncraft preserved the exact source crop instead.";
}

export function isRecoveryInProgress(status) {
  return status === "generating";
}

export function recoveryOutputDimensions({ sourceWidth, sourceHeight, aspectRatio, preserveSource = false }) {
  if (preserveSource || !RECOVERY_RATIO_VALUES[aspectRatio]) {
    return { width: sourceWidth, height: sourceHeight };
  }

  // Preserve approximately the same pixel area as the crop while changing the
  // canvas to the intended flat-design ratio. This avoids both oversized Step 2
  // inputs and forcing the recovered plane back into photographed geometry.
  const area = Math.max(1, sourceWidth * sourceHeight);
  const ratio = RECOVERY_RATIO_VALUES[aspectRatio];
  const width = Math.max(1, Math.round(Math.sqrt(area * ratio)));
  const height = Math.max(1, Math.round(width / ratio));
  return { width, height };
}
