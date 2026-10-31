// Base Pro accepts reference images as native context; /edit uses image_urls.
// Keep the reference when selecting the base generation endpoint.
export const ARTWORK_GENERATION_MODEL = "fal-ai/nano-banana-pro";

export function buildArtworkGenerationInput(input) {
  const { image_urls: imageUrls = [], context = [], ...options } = input;
  if (!imageUrls.length || imageUrls.some(url => typeof url !== "string" || !url.trim())) {
    throw new Error("Artwork generation requires a reference image.");
  }
  return {
    ...options,
    context: [...context, ...imageUrls.map(image_url => ({ type: "image", image_url }))],
  };
}
