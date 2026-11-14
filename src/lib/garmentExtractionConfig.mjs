import { extractionResolution } from './extractionResolution.mjs';

// Garment and Logo Extraction default to explicit 1K. Retain the mode
// helper for existing callers; the selected resolution is server-validated.
export function garmentExtractionMode() {
  return "enhanced";
}

export function buildGarmentExtractionInput({ imageUrl, prompt, aspectRatio, resolution }) {
  return {
    image_urls: [imageUrl],
    prompt,
    aspect_ratio: aspectRatio,
    num_images: 1,
    output_format: "png",
    resolution: extractionResolution(resolution),
    limit_generations: true,
  };
}

// Extraction PNGs can exceed the browser-to-server request body limit when Base64
// encoded. Save results inside the trace route instead of sending the
// bytes back through the browser for a second upload.
export function shouldSaveGarmentExtractionServerSide() {
  return true;
}
