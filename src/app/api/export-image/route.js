import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase';
import { getProjectAccess, PROJECT_ACCESS } from '@/lib/projectAccess';
import { enforceRateLimit } from '@/lib/rateLimit';
import { fetchStoredAsset } from '@/lib/storageDownload';
import { isOwnedStorageUrl, DEFAULT_MAX_UPSCALED_IMAGE_BYTES } from '@/lib/ssrf';
import { finalArtworkRaster, artworkExportName, artworkImageFormat } from '@/lib/artworkExport.mjs';
import { encodeArtworkImage } from '@/lib/artworkExportServer';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function POST(request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: { user }, error } = await adminSupabase.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const limit = await enforceRateLimit({ namespace: 'export-image', identifier: user.id, max: 12, window: '60 s', windowMs: 60_000 });
    if (!limit.success) return limit.response;
    const body = await request.json();
    let format;
    try { format = artworkImageFormat(body.format); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    if (typeof body.projectId !== 'string' || !body.projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    const { project } = await getProjectAccess(user.id, body.projectId, { required: PROJECT_ACCESS.EDIT,
      select: 'id,user_id,created_at,name,generated_image_url,upscaled_image_url' });
    if (!project) return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 });
    const url = finalArtworkRaster(project);
    if (!url) return NextResponse.json({ error: 'No finished image is available yet.' }, { status: 409 });
    if (!isOwnedStorageUrl(url, { userId: user.id, projectId: project.id }) && !isOwnedStorageUrl(url, { userId: project.user_id, projectId: project.id })) return NextResponse.json({ error: 'Image is not authorized for export.' }, { status: 403 });
    const { response, buffer } = await fetchStoredAsset(url, { maxBytes: DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
      allowedContentTypes: ['image/', 'application/octet-stream'], timeoutMs: 25_000, maxAttempts: 2,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]) });
    if (!response.ok) throw new Error('Saved image could not be downloaded.');
    const output = await encodeArtworkImage(buffer, format);
    return new Response(output, { headers: { 'Content-Type': format === 'jpg' ? 'image/jpeg' : 'image/png',
      'Content-Disposition': `attachment; filename="${artworkExportName(project.name)}.${format}"`, 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Image export]', error.message);
    return NextResponse.json({ error: 'The image could not be exported. Please try again.' }, { status: 503 });
  }
}
