export const SKETCH_SIZE = 600;

export function smoothSketchPoints(points, smoothness = 40) {
  if (points.length < 3 || smoothness <= 0) return points;
  const radius = Math.max(1, Math.round(Math.min(100, smoothness) / 25));
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    let x = 0; let y = 0; let total = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const neighbor = points[Math.max(0, Math.min(points.length - 1, index + offset))];
      const weight = radius + 1 - Math.abs(offset);
      x += neighbor[0] * weight; y += neighbor[1] * weight; total += weight;
    }
    return [x / total, y / total];
  });
}

export function mirroredSketchPositions(x, y, vertical = false, horizontal = false) {
  const result = [[x, y]];
  if (vertical) result.push([SKETCH_SIZE - x, y]);
  if (horizontal) result.push([x, SKETCH_SIZE - y]);
  if (vertical && horizontal) result.push([SKETCH_SIZE - x, SKETCH_SIZE - y]);
  return result.filter(([px, py], index) => result.findIndex(([qx, qy]) => px === qx && py === qy) === index);
}

export function floodFillSketchPixels(pixels, width, height, x, y, color, tolerance = 24) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const origin = (y * width + x) * 4;
  const target = [pixels[origin], pixels[origin + 1], pixels[origin + 2], pixels[origin + 3]];
  if (target.every((value, index) => Math.abs(value - color[index]) <= tolerance)) return false;
  const matches = index => {
    const offset = index * 4;
    return Math.abs(pixels[offset] - target[0]) <= tolerance
      && Math.abs(pixels[offset + 1] - target[1]) <= tolerance
      && Math.abs(pixels[offset + 2] - target[2]) <= tolerance
      && Math.abs(pixels[offset + 3] - target[3]) <= tolerance;
  };
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0; let tail = 0;
  queue[tail++] = y * width + x;
  visited[y * width + x] = 1;
  while (head < tail) {
    const index = queue[head++];
    if (!matches(index)) continue;
    const offset = index * 4;
    for (let channel = 0; channel < 4; channel++) pixels[offset + channel] = color[channel];
    const cx = index % width; const cy = Math.floor(index / width);
    for (const next of [cx > 0 ? index - 1 : -1, cx < width - 1 ? index + 1 : -1,
      cy > 0 ? index - width : -1, cy < height - 1 ? index + width : -1]) {
      if (next >= 0 && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
    }
  }
  return true;
}
