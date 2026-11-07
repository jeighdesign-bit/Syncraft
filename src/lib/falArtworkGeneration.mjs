// Nano Banana 2.1's edit endpoint takes references through image_urls.
export const ARTWORK_GENERATION_MODEL = "google/nano-banana-2.1/edit";

export function buildArtworkGenerationInput(input) {
  const { image_urls: imageUrls = [] } = input;
  if (!imageUrls.length || imageUrls.some(url => typeof url !== "string" || !url.trim())) {
    throw new Error("Artwork generation requires a reference image.");
  }
  return { ...input, image_urls: [...imageUrls] };
}
