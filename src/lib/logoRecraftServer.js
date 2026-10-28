import sharp from 'sharp';
import { recraftLogoPlan, recraftResult } from './logoRecraft.mjs';
import { assertSafeSvg } from './layeredPsd.mjs';

const dataUrl = (buffer, mime) => `data:${mime};base64,${buffer.toString('base64')}`;

export function validateLogoSvg(buffer) {
  const svg = assertSafeSvg(buffer.toString('utf8'));
  if (!/<(?:path|polygon|circle|rect|ellipse|polyline)\b/i.test(svg)
    || /<(?:script|foreignObject|image|use)\b|\bon\w+\s*=|@import|<!DOCTYPE|<!ENTITY/i.test(svg)) {
    throw new Error('This vector contains unsupported or unsafe content.');
  }
}

export async function generateRecraftLogo(input, sourceBuffer, sourceFormat, { request = fetch } = {}) {
  const token = process.env.RECRAFT_API_TOKEN || process.env.RECRAFT_API_KEY;
  if (!token) throw new Error('Recraft is not configured on this server.');
  if (sourceFormat === 'svg') validateLogoSvg(sourceBuffer);
  let image;
  if (sourceBuffer) {
    // Keep SVG background removal vector-native; rasterize references only.
    const nativeSvg = sourceFormat === 'svg' && input.operation === 'removeBg';
    const buffer = nativeSvg ? sourceBuffer : await sharp(sourceBuffer, { limitInputPixels: 25_000_000 })
      .resize(1024, 1024, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png().toBuffer();
    image = dataUrl(buffer, nativeSvg ? 'image/svg+xml' : 'image/png');
  }
  const plan = recraftLogoPlan({ ...input, sourceFormat }, { image });
  const response = await request(`https://external.api.recraft.ai/v1/${plan.endpoint}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(plan.body), signal: AbortSignal.timeout(105_000),
  });
  // A generation POST is deliberately never retried: retries can bill twice.
  if (!response.ok) throw new Error(`Recraft could not complete the operation (${response.status}).`);
  const result = recraftResult(await response.json(), plan);
  return { ...result, providerRequestId: result.providerRequestId || response.headers.get('x-request-id') };
}
