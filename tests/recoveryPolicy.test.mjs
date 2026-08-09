import test from "node:test";
import assert from "node:assert/strict";
import {
  backgroundOnlyFailureMessage,
  isRecoveryInProgress,
  recoveryOutputDimensions,
  shouldFallbackToSource,
  shouldRejectBackgroundOnly,
  sourceFallbackCorrection,
} from "../src/lib/recoveryPolicy.mjs";

test("destructive detail loss falls back to the exact source", () => {
  assert.equal(shouldFallbackToSource(["missing_visible_artwork"]), true);
  assert.equal(shouldFallbackToSource(["missing_pattern"]), true);
  assert.equal(shouldFallbackToSource(["content_collapse"]), true);
});

test("subjective reconstruction flags release the generated result as partial", () => {
  assert.equal(shouldFallbackToSource([
    "carrier_present",
    "photographed_pose",
    "invented_text",
    "invented_logo",
    "wrong_layout",
  ]), false);
});

test("fallback message describes the actual failure", () => {
  assert.match(sourceFallbackCorrection(["missing_pattern"]), /pattern detail/);
  assert.match(sourceFallbackCorrection(["moved_or_mirrored"]), /orientation/);
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
