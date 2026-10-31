import { authenticateRequest, getProjectAccess, PROJECT_ACCESS } from '@/lib/projectAccess';
import { enforceRateLimit } from '@/lib/rateLimit';
import { getAllowedStorageHosts, isOwnedStorageUrl, validateUrlForSSRF } from '@/lib/ssrf';
import { startTraceUpscale, getTraceUpscaleStatus, saveTraceUpscale } from '@/lib/traceUpscaleJobs';
import { universalUnavailableResponse } from '@/lib/universalAvailability.mjs';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request) {
  const { user } = await authenticateRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { projectId, action = 'status' } = await request.json();
    if (!projectId || !['start', 'status', 'save'].includes(action)) {
      return Response.json({ error: 'Invalid upscale request' }, { status: 400 });
    }
    const limit = await enforceRateLimit({
      namespace: `api:trace-upscale:${action}`,
      identifier: `${user.id}:${projectId}`,
      max: action === 'status' ? 90 : 10,
      window: '60 s',
      windowMs: 60_000,
    });
    if (!limit.success) return limit.response;
    // Status reads can recover provider results, so they require edit access too.
    const { project } = await getProjectAccess(user.id, projectId, { required: PROJECT_ACCESS.EDIT });
    if (!project) return Response.json({ error: 'Project not found or access denied' }, { status: 403 });
    // Existing jobs may still be read and saved while new work is unavailable.
    const unavailable = action === 'start' ? universalUnavailableResponse(project.trace_type) : null;
    if (unavailable) return unavailable;
    if (!project.generated_image_url || project.generated_image_url === 'REFUNDED') {
      return Response.json(
        { error: 'UPSCALE_SOURCE_REQUIRED', message: 'Complete the flat extraction first.' },
        { status: 409 },
      );
    }
    if (
      !isOwnedStorageUrl(project.generated_image_url, { userId: project.user_id, projectId }) ||
      !(await validateUrlForSSRF(project.generated_image_url, { allowedHosts: getAllowedStorageHosts() }))
    ) {
      return Response.json({ error: 'Invalid or unauthorized source image' }, { status: 400 });
    }
    const result =
      action === 'start'
        ? await startTraceUpscale(project, user.id)
        : action === 'save'
          ? await saveTraceUpscale(project)
          : await getTraceUpscaleStatus(project);
    return Response.json(result, { status: ['succeeded', 'none'].includes(result.status) ? 200 : 202 });
  } catch (error) {
    console.error('[Trace Upscale API]', { code: error.code, error: error.message });
    return Response.json(
      {
        error: error.code || 'UPSCALE_UNAVAILABLE',
        message: error.code
          ? error.message
          : 'Could not check HD Upscale. Your artwork is saved. Reopen the project to resume for free.',
      },
      { status: error.status === 409 ? 409 : 503 },
    );
  }
}
