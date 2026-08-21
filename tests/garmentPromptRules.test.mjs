import test from "node:test";
import assert from "node:assert/strict";

import {
  GARMENT_PROMPT_VERSION,
  buildGarmentFlexibilityGuard,
  resolveGarmentPromptMode,
} from "../src/lib/garmentPromptRules.mjs";

test("extract-pattern guard returns background only and removes all foreground content", () => {
  const guard = buildGarmentFlexibilityGuard("ERASE_LOGOS");

  assert.match(guard, /EXTRACT PATTERN ONLY/);
  assert.match(guard, /BACKGROUND DESIGN ONLY/i);
  assert.match(guard, /REMOVE every visible text or identity element without exception/i);
  assert.match(guard, /REMOVE every foreground subject or focal artwork element/i);
  assert.match(guard, /no text, number, logo, badge, mascot, character, object, emblem, or focal illustration remains/i);
});

test("keep-all guard explicitly retains every printed-content family", () => {
  const guard = buildGarmentFlexibilityGuard("PRESERVE_LOGOS");

  assert.match(guard, /KEEP ALL ARTWORK/);
  assert.match(guard, /all text, letters, numbers, names, logos, crests, badges, sponsors, mascots/i);
  assert.match(guard, /Remove only the physical garment presentation/i);
  assert.match(guard, /no visible printed element/i);
});

test("non-garment prompt modes do not receive a garment guard", () => {
  assert.equal(buildGarmentFlexibilityGuard("LOGO_FLATTEN"), "");
  assert.equal(buildGarmentFlexibilityGuard(undefined), "");
  assert.equal(GARMENT_PROMPT_VERSION, "flex-v1");
});

test("garment selection survives ai_prompt cleanup and legacy projects fail safe", () => {
  assert.equal(resolveGarmentPromptMode({
    trace_type: "mockup",
    ai_prompt: null,
    canvas_data: { garment_mode: "ERASE_LOGOS" },
  }), "ERASE_LOGOS");
  assert.equal(resolveGarmentPromptMode({
    trace_type: "mockup",
    ai_prompt: "ERASE_LOGOS",
    canvas_data: null,
  }), "ERASE_LOGOS");
  assert.equal(resolveGarmentPromptMode({ trace_type: "mockup", ai_prompt: null }), "PRESERVE_LOGOS");
  assert.equal(resolveGarmentPromptMode({ trace_type: "logo", ai_prompt: "LOGO_FLATTEN" }), "LOGO_FLATTEN");
});
