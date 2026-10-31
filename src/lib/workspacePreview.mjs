// Previews are display-only derivatives. Editors and downloads keep their
// original, full-resolution URLs.
export function previewProxyUrl(proxyUrl) {
  if (!proxyUrl) return null;
  return `${proxyUrl}${proxyUrl.includes('?') ? '&' : '?'}preview=1`;
}

export function svgPreviewUrl(proxyUrl) {
  const preview = previewProxyUrl(proxyUrl);
  return preview ? `${preview}&svgPreview=1` : null;
}

export function canvasImageUrl(proxyUrl, { fullResolution = false } = {}) {
  return fullResolution ? proxyUrl : previewProxyUrl(proxyUrl);
}

export function canvasZoomLayout(value) {
  // Fit is the minimum view; deliberate zoom-in remains available.
  const zoom = Number.isFinite(value) ? Math.min(5, Math.max(1, value)) : 1;
  return { scrollPercent: zoom * 100, contentScale: 1 };
}

export function preferredCanvasTab(project) {
  if (project?.trace_type === 'upscale') return 'generated';
  if (project?.upscaled_image_url) return 'upscaled';
  if (project?.svg_url) return 'svg';
  return 'generated';
}

export function comparePreviewLayout(originalAspect) {
  const hasAspect = Number.isFinite(originalAspect) && originalAspect > 0;
  const previewAspect = hasAspect ? originalAspect : null;
  const imageStyle = {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover', objectPosition: 'center', pointerEvents: 'none',
  };
  return { rotateTallPreview: false, previewAspect, imageStyle };
}
