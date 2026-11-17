import { createHash } from 'node:crypto';
import { adminSupabase } from '@/lib/supabase';
import { authenticateGalleryRequest } from '@/lib/adminGalleryAuth';
import { PROJECT_RETENTION_MS } from '@/lib/projectAccess';
import { HISTORY_FIELDS, isHistoryId, historyExpiry, outputImage, createHistoryPreviewCache, createHistoryWorkLimiter } from '@/lib/adminGenerationHistory.mjs';
import { fetchStoredAsset } from '@/lib/storageDownload';
import { isOwnedStorageUrl, validateUrlForSSRF, getAllowedStorageHosts } from '@/lib/ssrf';
import { MAX_NATIVE_4K_BYTES } from '@/lib/extractionResolution.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;
const previews = createHistoryPreviewCache();
const runPreview = createHistoryWorkLimiter(2);
const fail = (message, status) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  try {
    const auth = await authenticateGalleryRequest(request);
    if (!auth.user) return fail(auth.error, auth.status);
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    const kind = params.get('kind') || 'output';
    const size = params.get('size') || 'thumb';
    if (!isHistoryId(id) || !['input', 'output'].includes(kind) || !['thumb', 'preview', 'full'].includes(size)) return fail('Invalid image request.', 400);
    const { data: project, error } = await adminSupabase.from('projects').select(HISTORY_FIELDS).eq('id', id).maybeSingle();
    if (error) throw error;
    const expiresAt = historyExpiry(project, PROJECT_RETENTION_MS);
    if (!project || expiresAt <= Date.now()) return fail('Result not found or expired.', 404);
    const url = kind === 'input' ? project.original_image_url : outputImage(project);
    if (!url || !isOwnedStorageUrl(url, { userId: project.user_id, projectId: id }) || !(await validateUrlForSSRF(url, { allowedHosts: getAllowedStorageHosts() }))) return fail('Image unavailable.', 404);
    const key = createHash('sha256').update(`${id}:${kind}:${size}:${url}`).digest('hex');
    let result = size !== 'full' ? previews.get(key) : null;
    if (!result) result = await runPreview(async () => {
      request.signal.throwIfAborted();
      const existing = size !== 'full' ? previews.get(key) : null;
      if (existing) return existing;
      const asset = await fetchStoredAsset(url, { maxBytes: MAX_NATIVE_4K_BYTES, timeoutMs: 25_000, maxAttempts: 1, signal: AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]), allowedContentTypes: ['image/'] });
      if (!asset.response.ok) throw new Error('Image unavailable');
      const sharp = (await import('sharp')).default;
      const image = sharp(asset.buffer, { limitInputPixels: 40_000_000 }).timeout({ seconds: 20 });
      const metadata = await image.metadata();
      if (!['png', 'jpeg', 'webp', 'avif', 'gif'].includes(metadata.format)) throw new Error('Unsupported image');
      let value;
      if (size === 'full') value = { body: asset.buffer, mime: `image/${metadata.format}` };
      else {
        const edge = size === 'thumb' ? 320 : 1200;
        value = { body: await image.rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).webp({ quality: size === 'thumb' ? 62 : 85, effort: 1 }).toBuffer(), mime: 'image/webp' };
        previews.set(key, value, Math.min(expiresAt, Date.now() + 5 * 60_000));
      }
      return value;
    });
    if (expiresAt <= Date.now()) return fail('Result expired.', 404);
    return new Response(result.body, { headers: {
      'Content-Type': result.mime, 'Content-Length': String(result.body.length), 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': size === 'full' ? 'private, no-store' : `private, max-age=${Math.max(0, Math.min(300, Math.floor((expiresAt - Date.now()) / 1000)))}, must-revalidate`,
      Vary: 'Cookie, Authorization',
    } });
  } catch (error) {
    console.warn('[Admin history preview] Unavailable:', error.code || error.name || 'Error');
    return fail('Image unavailable or removed.', error.status === 429 ? 429 : 503);
  }
}
