// Position an inline note beside its artwork point. When neither side has
// enough room, put it below/above the pin and keep it inside the preview.
export function artworkCommentLayout(point, artwork, viewport) {
  if (!point || !artwork.width || !artwork.height || !viewport.width || !viewport.height)
    return null;

  const margin = 12;
  const gap = 24;
  const height = 44;
  const width = Math.min(296, Math.max(0, viewport.width - margin * 2));
  const x = (viewport.width - artwork.width) / 2 + point.x * artwork.width;
  const y = (viewport.height - artwork.height) / 2 + point.y * artwork.height;
  const clamp = (value, max) => Math.max(margin, Math.min(value, Math.max(margin, max)));
  let left = x + gap;
  let top = y - height / 2;

  if (left + width > viewport.width - margin) {
    if (x - gap - width >= margin) {
      left = x - gap - width;
    } else {
      left = x - width / 2;
      top = y + gap;
      if (top + height > viewport.height - margin) top = y - gap - height;
    }
  }

  return {
    left: clamp(left, viewport.width - margin - width),
    top: clamp(top, viewport.height - margin - height),
    width,
  };
}
