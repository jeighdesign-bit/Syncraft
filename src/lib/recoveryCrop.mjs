// Crop only removable outer context. A second visual check must approve the
// cropped result before it can replace the candidate.
const CROPPABLE_FAILURES = new Set(['background_present', 'carrier_present', 'wrong_layout', 'bad_layout']);
export function recoveryCropRegion(validation, width, height) {
  if (validation.pass || !validation.failures?.length || validation.failures.some(f => !CROPPABLE_FAILURES.has(f))) return null;
  const box = validation.artwork_box;
  if (!Array.isArray(box) || box.length !== 4 || box.some(v => !Number.isFinite(v) || v < 0 || v > 1000)) return null;
  const [x1, y1, x2, y2] = box;
  if (x2 <= x1 || y2 <= y1) return null;
  const area = (x2 - x1) * (y2 - y1) / 1e6;
  if (area < 0.2 || area > 0.985 || !(width > 0 && height > 0)) return null;
  const left = Math.floor(x1 * width / 1000), top = Math.floor(y1 * height / 1000);
  const right = Math.ceil(x2 * width / 1000), bottom = Math.ceil(y2 * height / 1000);
  return { left, top, width: right - left, height: bottom - top };
}
