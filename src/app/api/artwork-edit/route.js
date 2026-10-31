import { adminSupabase } from '@/lib/supabase';
import { authenticateRequest, getProjectAccess, PROJECT_ACCESS } from '@/lib/projectAccess';
import { universalUnavailableResponse } from '@/lib/universalAvailability.mjs';
import { enforceRateLimit } from '@/lib/rateLimit';
import {
  chargeCreditsVerified,
  refundCreditVerified,
  markCreditTransaction,
  recordProviderUsage,
} from '@/lib/creditLedger';
import { uploadToR2 } from '@/lib/cloudflare';
import { fetchStoredAsset } from '@/lib/storageDownload';
import { uploadArtworkEditSource } from '@/lib/artworkEditSource.mjs';
import { artworkEditProviderRequest as providerRequest } from '@/lib/artworkEditProvider.mjs';
import { createFalClient } from '@fal-ai/client';
import {
  DEFAULT_MAX_IMAGE_BYTES,
  fetchWithSSRFProtection,
  getAllowedProviderHosts,
  getAllowedStorageHosts,
  isOwnedStorageUrl,
  validateUrlForSSRF,
} from '@/lib/ssrf';
import {
  ARTWORK_EDIT_COST,
  ARTWORK_EDIT_MODEL,
  createArtworkEditService,
} from '@/lib/artworkEditService.mjs';
import { signArtworkEditState, verifyArtworkEditState } from '@/lib/artworkEditIntegrity.mjs';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () =>
  Object.assign(new Error('AI Edit is temporarily unavailable. Please try again shortly.'), {
    status: 503,
  });

function serviceFor(userId) {
  const signingKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  async function verifyJob(projectId, job) {
    if (
      !/^[a-zA-Z0-9-]{16,80}$/.test(job.id || '') ||
      (['queued', 'ready'].includes(job.status) && !/^[\w-]{1,150}$/.test(job.providerId || ''))
    )
      throw Object.assign(new Error('Invalid saved edit request.'), { status: 409 });
    const { data, error } = await adminSupabase
      .from('credit_logs')
      .select('id,user_id')
      .eq('id', job.chargeId)
      .eq('project_id', projectId)
      .eq('feature', 'artwork_edit')
      .eq('transaction_type', 'charge')
      .eq('idempotency_key', `artwork-edit:${projectId}:${job.id}`)
      .maybeSingle();
    if (error) throw unavailable();
    if (!data || data.user_id !== job.actorId)
      throw Object.assign(new Error('Could not verify the saved edit. Please contact support.'), {
        status: 409,
      });
  }
  return createArtworkEditService({
    verifyJob,
    load: async (projectId) => {
      const { project } = await getProjectAccess(userId, projectId, {
        required: PROJECT_ACCESS.EDIT,
      });
      if (!project)
        throw Object.assign(new Error('Project not found or access denied.'), { status: 403 });
      if (!['mockup', 'logo', 'universal'].includes(project.trace_type))
        throw Object.assign(new Error('AI Edit is available for extraction projects only.'), {
          status: 400,
        });
      if (!project.generated_image_url || project.generated_image_url === 'REFUNDED')
        throw Object.assign(new Error('Generate your artwork before using AI Edit.'), {
          status: 409,
        });
      if (!verifyArtworkEditState(projectId, project.canvas_data?.artwork_edits, signingKey))
        throw Object.assign(
          new Error('The saved edit could not be verified. Please contact support.'),
          { status: 409 },
        );
      return project;
    },
    cas: async (project, patch) => {
      const editState = patch.canvas_data.artwork_edits;
      editState.signature = signArtworkEditState(project.id, editState, signingKey);
      let query = adminSupabase
        .from('projects')
        .update(patch)
        .eq('id', project.id)
        .eq('generated_image_url', project.generated_image_url);
      query =
        project.canvas_data == null
          ? query.is('canvas_data', null)
          : query.eq('canvas_data', JSON.stringify(project.canvas_data));
      const { data, error } = await query.select('*').maybeSingle();
      if (error) throw unavailable();
      return data;
    },
    validateSource: async (project, url) => {
      if (
        !isOwnedStorageUrl(url, { userId: project.user_id, projectId: project.id }) ||
        !(await validateUrlForSSRF(url, { allowedHosts: getAllowedStorageHosts() }))
      )
        throw Object.assign(new Error('Invalid or unauthorized artwork source.'), { status: 400 });
    },
    sourceUrl: async (url) => {
      const { buffer } = await fetchStoredAsset(url, {
        maxBytes: DEFAULT_MAX_IMAGE_BYTES,
        allowedContentTypes: ['image/'],
        timeoutMs: 10000,
        signal: AbortSignal.timeout(15000),
        maxAttempts: 1,
      });
      const signal = AbortSignal.timeout(35_000);
      const fal = createFalClient({
        credentials: process.env.FAL_KEY,
        retry: { maxRetries: 0 },
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
          }),
      });
      return uploadArtworkEditSource(buffer, {
        uploadFile: (file) => fal.storage.upload(file, { lifecycle: { expiresIn: '1d' } }),
      });
    },
    charge: ({ actorId, projectId, requestId }) =>
      chargeCreditsVerified({
        userId: actorId,
        projectId,
        feature: 'artwork_edit',
        action: 'AI Edit',
        amount: ARTWORK_EDIT_COST,
        idempotencyKey: `artwork-edit:${projectId}:${requestId}`,
        metadata: { model: ARTWORK_EDIT_MODEL, requestId },
      }),
    refund: async (job, projectId) => {
      await verifyJob(projectId, job);
      return refundCreditVerified({
        chargeTransactionId: job.chargeId,
        reason: 'AI artwork edit failed',
        action: 'AI Edit refund',
      });
    },
    mark: async (job, projectId) => {
      await verifyJob(projectId, job);
      return markCreditTransaction({ transactionId: job.chargeId, status: 'succeeded' });
    },
    submit: (input) => providerRequest(ARTWORK_EDIT_MODEL, input),
    status: (id) => providerRequest(`fal-ai/nano-banana-pro/requests/${id}/status`),
    result: async (id) =>
      (await providerRequest(`fal-ai/nano-banana-pro/requests/${id}`)).images?.[0],
    save: async (project, job) => {
      const { buffer } = await fetchWithSSRFProtection(job.providerUrl, {
        allowedHosts: getAllowedProviderHosts(),
        maxBytes: DEFAULT_MAX_IMAGE_BYTES,
        allowedContentTypes: ['image/'],
        timeoutMs: 30000,
      });
      // Validate/decode the provider file and store a predictable PNG for exports.
      let png;
      try {
        png = await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer();
      } catch {
        throw Object.assign(new Error('Invalid provider image'), { providerTerminal: true });
      }
      return uploadToR2(png, `projects/${project.id}/ai-edit-${job.id}.png`, 'image/png');
    },
    usage: (project, job) =>
      recordProviderUsage({
        creditTransactionId: job.chargeId,
        projectId: project.id,
        userId: job.actorId,
        provider: 'fal',
        endpoint: ARTWORK_EDIT_MODEL,
        providerRequestId: job.providerId,
        isOwnerTest: job.isOwnerTest,
        metadata: { operation: 'artwork_edit' },
      }),
  });
}

async function handle(request, method) {
  try {
    const { user } = await authenticateRequest(request);
    if (!user)
      return Response.json({ error: 'Please sign in to edit your artwork.' }, { status: 401 });
    const input =
      method === 'GET'
        ? { projectId: new URL(request.url).searchParams.get('projectId') }
        : await request.json();
    if (!UUID.test(input.projectId || ''))
      return Response.json({ error: 'Invalid project.' }, { status: 400 });
    const limit = await enforceRateLimit({
      namespace: `api:artwork-edit:${method}`,
      identifier: `${user.id}:${input.projectId}`,
      max: method === 'GET' ? 60 : 12,
      window: '60 s',
      windowMs: 60000,
    });
    if (!limit.success) return limit.response;
    if (method === 'POST') {
      const { project } = await getProjectAccess(user.id, input.projectId, { required: PROJECT_ACCESS.EDIT });
      if (!project) return Response.json({ error: 'Project not found or access denied.' }, { status: 403 });
      const blocked = universalUnavailableResponse(project.trace_type);
      if (blocked) return blocked;
    }
    if (method === 'POST' && !process.env.FAL_KEY) throw unavailable();
    const service = serviceFor(user.id);
    const result =
      method === 'GET'
        ? await service.read(input.projectId)
        : method === 'POST'
          ? await service.generate({ ...input, actorId: user.id })
          : await service.change(input);
    return Response.json(result, {
      status: result.pending ? 202 : 200,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error(
      '[Artwork Edit] ' +
        JSON.stringify({
          status: error.status,
          errorName: error.name,
          causeCode: error.cause?.code || null,
          code: error.code,
          providerStatus: error.providerStatus,
          providerCode: error.providerCode,
          diagnostic: error.diagnostic,
        }),
    );
    const insufficient = error.code === 'INSUFFICIENT_CREDITS';
    const status = insufficient ? 402 : error.status || (error instanceof SyntaxError ? 400 : 503);
    return Response.json(
      {
        error: insufficient
          ? 'Not enough credits. Please top up to generate an edit.'
          : error.status
            ? error.message
            : 'Could not complete this request. Reopen AI Edit to check its saved status.',
        ...(error.snapshot ? { snapshot: error.snapshot } : {}),
      },
      { status, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
export const GET = (request) => handle(request, 'GET');
export const POST = (request) => handle(request, 'POST');
export const PATCH = (request) => handle(request, 'PATCH');
