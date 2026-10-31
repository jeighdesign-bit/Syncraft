import assert from "node:assert/strict";
import test from "node:test";
import { ARTWORK_GENERATION_MODEL, buildArtworkGenerationInput } from "../src/lib/falArtworkGeneration.mjs";

test("base Pro generation preserves all original references and extraction settings", () => {
  const input = { image_urls: ["https://storage.test/reference.png", "data:image/png;base64,abc"], prompt: "Recover the print", aspect_ratio: "auto", system_prompt: "Preserve the source", resolution: "2K", num_images: 1 };
  const result = buildArtworkGenerationInput(input);
  assert.equal(ARTWORK_GENERATION_MODEL, "fal-ai/nano-banana-pro");
  assert.equal(result.image_urls, undefined);
  assert.deepEqual(result.context, input.image_urls.map(image_url => ({ type: "image", image_url })));
  for (const key of ["prompt", "aspect_ratio", "system_prompt", "resolution", "num_images"]) assert.equal(result[key], input[key]);
  assert.equal(input.image_urls.length, 2);
});

test("existing context order remains intact and missing references fail before submission", () => {
  assert.deepEqual(buildArtworkGenerationInput({ context: [{ type: "text", text: "reference" }], image_urls: ["https://storage.test/a.png"] }).context[0], { type: "text", text: "reference" });
  assert.throws(() => buildArtworkGenerationInput({ prompt: "Recover" }), /reference image/);
  assert.throws(() => buildArtworkGenerationInput({ image_urls: [null] }), /reference image/);
});
