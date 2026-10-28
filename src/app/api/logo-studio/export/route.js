import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/projectAccess';
import { enforceRateLimit } from '@/lib/rateLimit';
import { accessibleLogoProject } from '@/lib/logoStudioServer';
import { UUID } from '@/lib/logoStudio.mjs';
import { createLogoExport, LOGO_EXPORT_FORMATS, resolveLogoExportJob } from '@/lib/logoStudioExport.mjs';
import { fetchWithSSRFProtection, getAllowedStorageHosts, DEFAULT_MAX_IMAGE_BYTES, DEFAULT_MAX_SVG_BYTES } from '@/lib/ssrf';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  const { user } = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limit = await enforceRateLimit({ namespace: 'logo-export', identifier: user.id, max: 20, window: '60 s', windowMs: 60_000 });
  if (!limit.success) return limit.response;
  try {
    if (Number(request.headers.get('content-length') || 0) > 2048) throw new Error('Request too large.');
    const text = await request.text();
    if (text.length > 2048) throw new Error('Request too large.');
    const { projectId, jobId, format } = JSON.parse(text);
    if (!UUID.test(projectId || '') || !UUID.test(jobId || '')) throw new Error('Invalid logo selection.');
    const { project } = await accessibleLogoProject(user.id, projectId);
    const job = resolveLogoExportJob(project.canvas_data.jobs, jobId, format);
    const { response, buffer } = await fetchWithSSRFProtection(job.url, {
      allowedHosts: getAllowedStorageHosts(), timeoutMs: 30_000,
      maxBytes: job.format === 'svg' ? DEFAULT_MAX_SVG_BYTES : DEFAULT_MAX_IMAGE_BYTES,
      allowedContentTypes: job.format === 'svg' ? ['image/svg+xml', 'text/plain', 'application/octet-stream'] : ['image/'],
    });
    if (!response.ok) throw new Error('The logo could not be loaded. Please try again.');
    const output = await createLogoExport(buffer, job.format, format);
    const name = String(job.brand || project.name || 'logo').replace(/[^a-z0-9_-]/gi, '-').slice(0, 100);
    const filename = `${name}-${jobId.slice(0, 6)}.${LOGO_EXPORT_FORMATS[format].extension}`;
    return new Response(output, { headers: {
      'Content-Type': LOGO_EXPORT_FORMATS[format].mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(output.length), 'Cache-Control': 'no-store',
    } });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Download failed. Please try again.' }, { status: 400 });
  }
}
