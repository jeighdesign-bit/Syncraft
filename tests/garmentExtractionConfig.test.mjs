import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGarmentExtractionInput,
  garmentExtractionMode,
  shouldSaveGarmentExtractionServerSide,
} from "../src/lib/garmentExtractionConfig.mjs";

const commonInput = {
  imageUrl: "https://example.com/garment.png",
  prompt: "Flatten the visible garment artwork.",
  aspectRatio: "9:16",
};

test("legacy mode flags do not override explicit resolution selection", () => {
  assert.equal(garmentExtractionMode(undefined), "enhanced");
  assert.equal(garmentExtractionMode("unexpected"), "enhanced");
  assert.equal(garmentExtractionMode("legacy"), "enhanced");
  assert.equal(garmentExtractionMode(" ENHANCED "), "enhanced");
});

test("omitted resolution explicitly requests the approved 1K default", () => {
  assert.deepEqual(buildGarmentExtractionInput({ ...commonInput, mode: "legacy" }), {
    image_urls: [commonInput.imageUrl],
    prompt: commonInput.prompt,
    aspect_ratio: commonInput.aspectRatio,
    num_images: 1,
    output_format: "png",
    resolution: "1K",
    limit_generations: true,
  });
});

test("neither mode sends unsupported diffusion controls as fidelity settings", () => {
  for (const mode of ["legacy", "enhanced"]) {
    const input = buildGarmentExtractionInput({ ...commonInput, mode });
    for (const unsupported of ["guidance_scale", "num_inference_steps", "image_strength"]) {
      assert.equal(unsupported in input, false);
    }
  }
});

test("legacy enhanced mode flags cannot silently upgrade a 1K request", () => {
  const input = buildGarmentExtractionInput({ ...commonInput, mode: "enhanced" });

  assert.deepEqual(input, {
    image_urls: [commonInput.imageUrl],
    prompt: commonInput.prompt,
    aspect_ratio: commonInput.aspectRatio,
    num_images: 1,
    output_format: "png",
    resolution: "1K",
    limit_generations: true,
  });
  assert.equal("guidance_scale" in input, false);
  assert.equal("num_inference_steps" in input, false);
  assert.equal("image_strength" in input, false);
});

test("all extraction tiers bypass the browser Base64 save flow", () => {
  assert.equal(shouldSaveGarmentExtractionServerSide("legacy"), true);
  assert.equal(shouldSaveGarmentExtractionServerSide(), true);
  assert.equal(shouldSaveGarmentExtractionServerSide("enhanced"), true);
});

test('4K requests reach the native generator input and unsupported resolutions fail', () => {
  assert.equal(buildGarmentExtractionInput({ ...commonInput, resolution: '4K' }).resolution, '4K');
  for (const resolution of ['8K', null, '4k']) assert.throws(() => buildGarmentExtractionInput({ ...commonInput, resolution }), /1K, 2K or 4K/);
});
