import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGarmentExtractionInput,
  garmentExtractionMode,
} from "../src/lib/garmentExtractionConfig.mjs";

const commonInput = {
  imageUrl: "https://example.com/garment.png",
  prompt: "Flatten the visible garment artwork.",
  aspectRatio: "9:16",
};

test("garment extraction stays in legacy mode unless enhanced is explicit", () => {
  assert.equal(garmentExtractionMode(undefined), "legacy");
  assert.equal(garmentExtractionMode("unexpected"), "legacy");
  assert.equal(garmentExtractionMode(" ENHANCED "), "enhanced");
});

test("legacy mode preserves the currently deployed request shape", () => {
  assert.deepEqual(buildGarmentExtractionInput({ ...commonInput, mode: "legacy" }), {
    image_urls: [commonInput.imageUrl],
    prompt: commonInput.prompt,
    aspect_ratio: commonInput.aspectRatio,
    guidance_scale: 10,
    num_inference_steps: 50,
    image_strength: 0.55,
  });
});

test("enhanced mode requests supported 2K PNG output", () => {
  const input = buildGarmentExtractionInput({ ...commonInput, mode: "enhanced" });

  assert.deepEqual(input, {
    image_urls: [commonInput.imageUrl],
    prompt: commonInput.prompt,
    aspect_ratio: commonInput.aspectRatio,
    num_images: 1,
    output_format: "png",
    resolution: "2K",
    limit_generations: true,
  });
  assert.equal("guidance_scale" in input, false);
  assert.equal("num_inference_steps" in input, false);
  assert.equal("image_strength" in input, false);
});

