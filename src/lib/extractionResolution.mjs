// Shared by the selector and server billing. Clients never choose the charge.
export const DEFAULT_EXTRACTION_RESOLUTION = '1K';
export const EXTRACTION_RESOLUTIONS = Object.freeze([
  Object.freeze({ value: '1K', label: 'Syncraft V1', credits: 12 }),
  Object.freeze({ value: '2K', label: 'Syncraft V2', credits: 16 }),
  Object.freeze({ value: '4K', label: 'Syncraft V3', credits: 24 }),
]);
export const MAX_NATIVE_4K_BYTES = 64 * 1024 * 1024;

export function extractionResolution(value = DEFAULT_EXTRACTION_RESOLUTION) {
  if (!EXTRACTION_RESOLUTIONS.some(option => option.value === value)) {
    throw Object.assign(new Error('Choose a supported extraction resolution: 1K, 2K or 4K.'), { code: 'INVALID_EXTRACTION_RESOLUTION' });
  }
  return value;
}

export function extractionCredits(value = DEFAULT_EXTRACTION_RESOLUTION) {
  const resolution = extractionResolution(value);
  return EXTRACTION_RESOLUTIONS.find(option => option.value === resolution).credits;
}

export function extractionDisplayName(value = DEFAULT_EXTRACTION_RESOLUTION) {
  return EXTRACTION_RESOLUTIONS.find(option => option.value === extractionResolution(value)).label;
}

export function supportsExtractionResolution(project) {
  return ['mockup', 'logo', 'universal'].includes(project?.trace_type);
}

// Verify the decoded provider asset, never a UI label or an upscaled derivative.
// Allowed ratios vary in dimensions; 2K images are ~4MP, native 4K ~16MP.
export function verifyNative4K({ width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || Math.max(width, height) < 3840 || width * height < 8_000_000) {
    throw Object.assign(new Error('The provider did not return native 4K artwork. Please try again.'), { code: 'EXTRACTION_RESOLUTION_MISMATCH' });
  }
}
