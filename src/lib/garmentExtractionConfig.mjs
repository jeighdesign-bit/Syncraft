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
    num_images: 1,
    output_format: "png",
    limit_generations: true,
  };

  if (selectedMode === ENHANCED_MODE) {
    return {
      ...baseInput,
      resolution: "2K",
    };
  }

  // Nano Banana Pro does not expose diffusion guidance, steps or image strength.
  // Sending those fields cannot enforce reference fidelity. Legacy retains the
  // provider's default resolution and the existing browser save flow.
  return baseInput;
}

// 2K PNGs can exceed the browser-to-server request body limit when Base64
// encoded. Save enhanced results inside the trace route instead of sending the
// bytes back through the browser for a second upload.
export function shouldSaveGarmentExtractionServerSide(mode) {
  return garmentExtractionMode(mode) === ENHANCED_MODE;
}
