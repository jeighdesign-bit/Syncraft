import sharp from 'sharp';
import { createHash } from 'node:crypto';

const image = (buffer) => sharp(buffer, { limitInputPixels: 100_000_000 }).timeout({ seconds: 15 });

function hasUnsupportedChunks(buffer) {
  // Preserve original bytes for profiles, unusual colour interpretations, and
  // animation rather than risking a colour/bit-depth conversion in libvips.
  const unsupported = new Set(['iCCP', 'gAMA', 'cHRM', 'cICP', 'sBIT', 'acTL']);
  for (let offset = 8; offset + 12 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    if (offset + length + 12 > buffer.length) return true;
    if (unsupported.has(buffer.toString('ascii', offset + 4, offset + 8))) return true;
    offset += length + 12;
  }
  return false;
}

async function pixelHash(buffer, signal) {
  signal?.throwIfAborted();
  const stream = image(buffer).raw();
  const abort = () => stream.destroy(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const hash = createHash('sha256');
  try {
    for await (const chunk of stream) hash.update(chunk);
    signal?.throwIfAborted();
    return hash.digest('hex');
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

export async function optimizePngLosslessly(buffer, { signal } = {}) {
  signal?.throwIfAborted();
  try {
    if (
      buffer.length < 33 ||
      !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return buffer;
    // Never quantize, resize, reduce bit depth, or change transparency.
    if (buffer[24] !== 8 || ![2, 6].includes(buffer[25]) || hasUnsupportedChunks(buffer))
      return buffer;
    const before = await image(buffer).metadata();
    if (before.hasProfile || before.depth !== 'uchar' || before.space !== 'srgb') return buffer;
    // Level 4 keeps adaptive filtering and exact pixels while avoiding the
    // extra CPU time of level 6+ on 60+ megapixel artwork. Compression level
    // changes file packing only; the pixel/dimension checks below still apply.
    const candidate = await image(buffer)
      .keepMetadata()
      .png({ compressionLevel: 4, adaptiveFiltering: true, palette: false })
      .toBuffer();
    signal?.throwIfAborted();
    if (candidate.length >= buffer.length) return buffer;
    const after = await image(candidate).metadata();
    if (
      before.width !== after.width ||
      before.height !== after.height ||
      before.channels !== after.channels ||
      before.depth !== after.depth ||
      before.density !== after.density
    )
      return buffer;
    if ((await pixelHash(buffer, signal)) !== (await pixelHash(candidate, signal))) return buffer;
    return candidate;
  } catch {
    // Optional optimization must never lose a valid HD result or block saving.
    signal?.throwIfAborted();
    return buffer;
  }
}
