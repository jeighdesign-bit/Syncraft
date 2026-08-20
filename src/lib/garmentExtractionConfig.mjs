const ENHANCED_MODE = "enhanced";

export function garmentExtractionMode(value = process.env.GARMENT_EXTRACTION_QUALITY_MODE) {
  return value?.trim().toLowerCase() === ENHANCED_MODE ? ENHANCED_MODE : "legacy";
}

export function buildGarmentExtractionInput({ imageUrl, prompt, aspectRatio, mode }) {
  const selectedMode = garmentExtractionMode(mode);
  const baseInput = {
    image_urls: [imageUrl],
    prompt,
    aspect_ratio: aspectRatio,
  };

  if (selectedMode === ENHANCED_MODE) {
    return {
      ...baseInput,
      num_images: 1,
      output_format: "png",
      resolution: "2K",
      limit_generations: true,
    };
  }

  // Keep the deployed request shape available for a zero-risk rollback while
  // the enhanced, provider-supported configuration is evaluated in preview.
  return {
    ...baseInput,
    guidance_scale: 10,
    num_inference_steps: 50,
    image_strength: 0.55,
  };
}

