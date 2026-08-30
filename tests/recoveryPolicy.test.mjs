import test from "node:test";
import assert from "node:assert/strict";
import {
  backgroundOnlyFailureMessage,
  isRecoveryInProgress,
  isOutsideRecoveryProviderRatio,
  normalizedCorrelation,
  recoveryAspectRatioDrift,
  recoveryOutputDimensions,
  shouldFallbackToSource,
  shouldPreserveExactRecoverySource,
  shouldRejectBackgroundOnly,
  sourceFallbackCorrection,
} from "../src/lib/recoveryPolicy.mjs";

test("destructive detail loss falls back to the exact source", () => {
  assert.equal(shouldFallbackToSource(["missing_visible_artwork"]), true);
  assert.equal(shouldFallbackToSource(["missing_pattern"]), true);
  assert.equal(shouldFallbackToSource(["content_collapse"]), true);
  assert.equal(shouldFallbackToSource(["invented_text"]), true);
  assert.equal(shouldFallbackToSource(["invented_logo"]), true);
  assert.equal(shouldFallbackToSource(["wrong_layout"]), true);
});

test("extreme crops bypass provider ratio snapping in keep-artwork mode", () => {
  assert.equal(isOutsideRecoveryProviderRatio(121, 754), true);
  assert.equal(shouldPreserveExactRecoverySource({
    mode: "UNIVERSAL_KEEP_ARTWORK",
    sourceWidth: 121,
    sourceHeight: 754,
  }), true);
  assert.equal(shouldPreserveExactRecoverySource({
    mode: "UNIVERSAL_BACKGROUND_ONLY",
    sourceWidth: 121,
    sourceHeight: 754,
  }), false);
});

test("aspect-ratio drift is measured relative to the exact crop", () => {
  assert.ok(recoveryAspectRatioDrift(121, 754, 1536, 2752) > 2);
  assert.equal(recoveryAspectRatioDrift(121, 754, 484, 3016), 0);
});

test("normalized correlation distinguishes preserved from redesigned structure", () => {
  assert.equal(normalizedCorrelation([0, 20, 50, 100], [0, 20, 50, 100]), 1);
  assert.ok(normalizedCorrelation([0, 20, 50, 100], [100, 50, 20, 0]) < 0);
  assert.equal(normalizedCorrelation([1, 2], [1]), -1);
});

test("non-destructive pose flags may release the generated result as partial", () => {
  assert.equal(shouldFallbackToSource([
    "carrier_present",
    "photographed_pose",
  ]), false);
});

test("fallback message describes the actual failure", () => {
  assert.match(sourceFallbackCorrection(["missing_pattern"]), /pattern detail/);
  assert.match(sourceFallbackCorrection(["moved_or_mirrored"]), /orientation/);
  assert.match(sourceFallbackCorrection(["wrong_layout"]), /crop proportions/);
});

test("only the generating state blocks a fresh recovery analysis", () => {
  assert.equal(isRecoveryInProgress("generating"), true);
  assert.equal(isRecoveryInProgress("partial"), false);
  assert.equal(isRecoveryInProgress("validated"), false);
  assert.equal(isRecoveryInProgress("failed"), false);
});

test("recovered artwork keeps the inferred flat-design ratio", () => {
  const output = recoveryOutputDimensions({
    sourceWidth: 777,
    sourceHeight: 621,
    aspectRatio: "3:2",
  });
  assert.ok(Math.abs(output.width / output.height - 1.5) < 0.005);
  assert.ok(Math.abs(output.width * output.height - 777 * 621) < 1_000);
});

test("source fallback preserves photographed crop dimensions", () => {
  assert.deepEqual(recoveryOutputDimensions({
    sourceWidth: 777,
    sourceHeight: 621,
    aspectRatio: "3:2",
    preserveSource: true,
  }), { width: 777, height: 621 });
});

test("background-only rejects an output that still contains foreground artwork", () => {
  assert.equal(shouldRejectBackgroundOnly(["foreground_artwork_remains"]), true);
  assert.equal(shouldRejectBackgroundOnly(["wrong_layout"]), false);
});

test("background-only rejection describes the validator failure", () => {
  assert.match(backgroundOnlyFailureMessage(["foreground_artwork_remains"]), /still contained/);
  assert.match(backgroundOnlyFailureMessage(["missing_pattern"]), /removed too much/);
  assert.match(backgroundOnlyFailureMessage(["content_collapse"]), /lost too much/);
});
