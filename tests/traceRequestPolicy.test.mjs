import test from "node:test";
import assert from "node:assert/strict";
import { TRACE_REQUEST_TIMEOUT_MS, canResumeTraceUpscale, traceTimeoutMessage } from "../src/lib/traceRequestPolicy.mjs";

test("browser allows the full server run plus response time", () => {
  assert.ok(TRACE_REQUEST_TIMEOUT_MS > 300_000);
});

test("saved flat artwork resumes without another generation, including a zero-credit account", () => {
  assert.equal(canResumeTraceUpscale({ generated_image_url: "https://storage/flat.png", credits: 0 }), true);
  for (const project of [null, {}, { generated_image_url: "REFUNDED" },
    { generated_image_url: "flat", upscaled_image_url: "upscaled" },
    { generated_image_url: "flat", svg_url: "vector" }]) {
    assert.equal(canResumeTraceUpscale(project), false);
  }
});

test("late-stage timeouts give stage-specific recovery instead of blaming the image crop", () => {
  for (const label of ["step2", "save2"]) assert.match(traceTimeoutMessage(label), /Resume HD Upscale for free/);
  assert.match(traceTimeoutMessage("step3"), /Retry Vector SVG for free/);
  assert.doesNotMatch(traceTimeoutMessage("step1"), /crop|upscale is saved/i);
});
