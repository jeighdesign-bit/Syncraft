import { adminSupabase } from '@/lib/supabase';
import { uploadToR2 } from '@/lib/cloudflare';
import { chargeCreditsVerified, refundCreditVerified, markCreditTransaction, recordProviderUsage } from '@/lib/creditLedger';
import { getProjectAccess, PROJECT_ACCESS } from '@/lib/projectAccess';
import { fetchWithSSRFProtection, getAllowedProviderHosts, getAllowedStorageHosts, isOwnedStorageUrl, DEFAULT_MAX_IMAGE_BYTES, DEFAULT_MAX_SVG_BYTES } from '@/lib/ssrf';
import { LOGO_ACTIVE, logoOperationCost, logoGenerationQuota, logoJobTimedOut } from '@/lib/logoStudio.mjs';
import { generateRecraftLogo, validateLogoSvg } from '@/lib/logoRecraftServer';
import { nanoLogoPlan } from '@/lib/logoFal.mjs';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import { signLogoState, verifyLogoState } from '@/lib/logoStudioIntegrity.mjs';
import { randomUUID } from 'node:crypto';
import { planLogoDirections } from './logoArtDirectorServer';
import { compileLogoDirection, LOGO_COMPILER_VERSION } from './logoPromptCompiler.mjs';
import { fitImageLogoToArtboard } from './logoArtboard.mjs';

export function createLogoState(userId, projectId) {
  const state = { tool: 'logo_studio', revision: 0, activity: 'idle', jobs: [] };
  state.signature = signLogoState(state, userId, projectId, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return state;
}

export async function accessibleLogoProject(userId, id, required = PROJECT_ACCESS.VIEW) {
  const { project, access } = await getProjectAccess(userId, id, { required });
  if (project?.canvas_data?.tool !== 'logo_studio') throw new Error('Logo project not found or expired.');
  // The legacy projects table permits owner writes. Never trust billing IDs or
  // provider request IDs read from JSON unless the server signed that state.
  if (!verifyLogoState(project.canvas_data, project.user_id, id, process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Logo project data could not be verified. Please start a new project.');
  return { project, access };
}

export async function ownedLogoProject(userId, id) {
  return (await accessibleLogoProject(userId, id, PROJECT_ACCESS.OWNER)).project;
}

// Revision compare-and-swap protects concurrent tabs and independent batch results.
// Reuses the existing project JSON column; no database migration is required.
export async function mutateLogoProject(userId, id, mutate) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { project } = await accessibleLogoProject(userId, id, PROJECT_ACCESS.EDIT);
    const previous = project.canvas_data;
    const next = mutate(structuredClone(previous));
    if (!next) return project;
    next.revision = previous.revision + 1;
    next.activity = next.jobs.some(job => LOGO_ACTIVE.includes(job.status)) ? 'active' : 'idle';
    next.signature = signLogoState(next, project.user_id, id, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await adminSupabase.from('projects')
      .update({ canvas_data: next, original_image_url: [...next.jobs].reverse().find(job => job.status === 'succeeded')?.url || project.original_image_url })
      .eq('id', id).eq('user_id', project.user_id)
      .eq('canvas_data->>revision', String(previous.revision)).select('*').maybeSingle();
    if (error) throw new Error('Could not save your logo project.');
    if (data) return data;
  }
  throw new Error('This project is busy in another tab. Please try again.');
}

async function patchJob(userId, projectId, jobId, patch, expected) {
  return mutateLogoProject(userId, projectId, state => {
    const job = state.jobs.find(item => item.id === jobId);
    if (!job || (expected && !expected.includes(job.status))) return null;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    return state;
  });
}

const chargeKey = (projectId, id) => `logo-studio:${projectId}:${id}`;
async function findCharge(projectId, job) {
  const { data, error } = await adminSupabase.from('credit_logs').select('id,transaction_status,metadata')
    .eq('idempotency_key', chargeKey(projectId, job.id)).maybeSingle();
  if (error) throw new Error('Could not reconcile credits. Please retry.');
  return data || null;
}

async function failJob(userId, projectId, job, message) {
  let project = await patchJob(userId, projectId, job.id, { status: 'refunding', error: message }, LOGO_ACTIVE);
  const current = project.canvas_data.jobs.find(item => item.id === job.id);
  if (current.status !== 'refunding') return project;
  const charge = await findCharge(projectId, current);
  const chargeId = charge?.id;
  // Credit logs are server-owned and authoritative even if an owner replays an
  // older, legitimately signed project snapshot through the legacy table API.
  if (charge?.transaction_status === 'succeeded') {
    const output = charge.metadata?.logoOutput;
    return patchJob(userId, projectId, job.id, output
      ? { status: 'succeeded', url: output.url, format: output.format, error: null }
      : { status: 'failed', error: 'This request was already completed. Start a new operation.' }, ['refunding']);
  }
  if (chargeId) {
    const refund = await refundCreditVerified({ chargeTransactionId: chargeId, reason: message, action: 'Logo Studio refund' });
    if (!refund.refunded) throw new Error('Credit refund is pending. Please reopen this project to retry.');
  }
  return patchJob(userId, projectId, job.id, { status: 'failed', error: `${message}${chargeId ? ' Credits refunded.' : ''}` }, ['refunding']);
}

async function saveOutput(userId, projectId, job, url, format) {
  const { response, buffer } = await fetchWithSSRFProtection(url, {
    allowedHosts: getAllowedProviderHosts(), timeoutMs: 30_000,
    maxBytes: format === 'svg' ? DEFAULT_MAX_SVG_BYTES : DEFAULT_MAX_IMAGE_BYTES,
    allowedContentTypes: format === 'svg' ? ['image/svg+xml', 'text/plain', 'application/octet-stream'] : ['image/'],
  });
  if (!response.ok) throw new Error('The provider output could not be downloaded.');
  let output = buffer;
  if (format === 'svg') {
    validateLogoSvg(buffer);
    const svg = buffer.toString('utf8');
    if (!/<svg\b/i.test(svg) || !/<(?:path|polygon|circle|rect|ellipse|polyline)\b/i.test(svg)
      || /<(?:script|foreignObject|image)\b|\bon\w+\s*=|(?:href\s*=\s*["']\s*(?:https?:|data:|javascript:))|<!ENTITY|<!DOCTYPE/i.test(svg)) {
      throw new Error('The vector output was invalid. Please try again.');
    }
  } else {
    output = await sharp(buffer, { limitInputPixels: 25_000_000 }).png().toBuffer();
    if (job.operation === 'generate' && job.mode === 'image') output = await fitImageLogoToArtboard(output);
  }
  const savedUrl = await uploadToR2(output, `projects/${projectId}/logo-${job.id}.${format}`, format === 'svg' ? 'image/svg+xml' : 'image/png');
  const marked = await markCreditTransaction({ transactionId: job.chargeId, status: 'succeeded', metadata: { logoOutput: { url: savedUrl, format } } });
  if (!marked) throw new Error('Could not finalize logo billing.');
  const project = await patchJob(userId, projectId, job.id, { status: 'succeeded', url: savedUrl, format }, ['saving', 'running']);
  return project;
}

export async function startLogoOperation(userId, project, input, prepared = false) {
  const projectId = project.id;
  project = (await accessibleLogoProject(userId, projectId, PROJECT_ACCESS.EDIT)).project;
  const previous = project.canvas_data.jobs.find(item => item.id === input.requestId);
  if (previous && !prepared) return project; // A replay can never submit or charge again.
  let sourceUrl = input.sourceUrl;
  let sourceBuffer;
  let sourceFormat;
  if (input.sourceId) {
    const source = project.canvas_data.jobs.find(item => item.id === input.sourceId && item.status === 'succeeded');
    if (!source) throw new Error('Select a saved logo as your source.');
    if (input.operation === 'vectorize' && source.format === 'svg') throw new Error('This logo is already a vector. Download SVG directly.');
    sourceFormat = source.format;
    sourceUrl = source.url;
  }
  if (sourceUrl) {
    if (!isOwnedStorageUrl(sourceUrl, { userId, projectId })) throw new Error('Upload an image to your own storage first.');
    const { buffer, response } = await fetchWithSSRFProtection(sourceUrl, {
      allowedHosts: getAllowedStorageHosts(), maxBytes: sourceFormat === 'svg' ? DEFAULT_MAX_SVG_BYTES : DEFAULT_MAX_IMAGE_BYTES, allowedContentTypes: ['image/'],
    });
    if (!response.ok) throw new Error('Source image could not be loaded.');
    sourceBuffer = buffer;
    if (sourceFormat === 'svg') validateLogoSvg(buffer);
    const metadata = await sharp(buffer, { limitInputPixels: 25_000_000 }).metadata();
    if (!['png', 'jpeg', 'webp', ...(sourceFormat === 'svg' ? ['svg'] : [])].includes(metadata.format)) throw new Error('Use a PNG, JPG or WebP source image.');
  }
  const useRecraft = ['removeBg', 'vectorize'].includes(input.operation);
  if (useRecraft && !(process.env.RECRAFT_API_TOKEN || process.env.RECRAFT_API_KEY)) throw new Error('Recraft tools are not configured on this server.');
  if (!useRecraft && !process.env.FAL_KEY) throw new Error('Logo generation is not configured on this server.');
  let claimed = false;
  const now = new Date().toISOString();
  project = await mutateLogoProject(userId, projectId, state => {
    claimed = false;
    if (prepared) {
      const reserved = state.jobs.find(item => item.id === input.requestId);
      if (!reserved || reserved.status !== 'starting' || reserved.submissionClaimed || reserved.billedUserId !== userId) return null;
      reserved.submissionClaimed = true;
      claimed = true;
      return state;
    }
    if (state.jobs.some(item => item.id === input.requestId)) return null;
    if (input.operation === 'vectorize' && input.sourceId && state.jobs.some(item => item.operation === 'vectorize' && item.sourceId === input.sourceId
      && (item.status === 'succeeded' || LOGO_ACTIVE.includes(item.status)))) throw new Error('An SVG already exists or is being created for this logo. Use Download when it is ready.');
    if (['generate', 'variations'].includes(input.operation) && !logoGenerationQuota(state.jobs).remaining) {
      throw new Error('This project has reached its 4-logo limit. Start a new project to create more logos.');
    }
    if (state.jobs.length >= 120) throw new Error('This project has reached 120 versions. Start a new project.');
    if (state.jobs.filter(item => LOGO_ACTIVE.includes(item.status)).length >= 4) throw new Error('Wait for your current logos to finish first.');
    state.jobs.push({ ...input, billedUserId: userId, creditCost: logoOperationCost(input.operation, input.mode), id: input.requestId, sourceUrl, status: 'starting', createdAt: now, updatedAt: now });
    claimed = true;
    return state;
  });
  if (!claimed) return project;
  let job = project.canvas_data.jobs.find(item => item.id === input.requestId);
  try {
    const charge = await chargeCreditsVerified({ userId, projectId, feature: 'logo_studio',
      action: `Logo Studio: ${input.operation}`, amount: job.creditCost,
      idempotencyKey: chargeKey(projectId, job.id), metadata: { jobId: job.id, operation: input.operation } });
    if (charge.replayed) {
      const original = await findCharge(projectId, job);
      const output = original?.transaction_status === 'succeeded' && original.metadata?.logoOutput;
      return patchJob(userId, projectId, job.id, output
        ? { status: 'succeeded', chargeId: charge.transactionId, url: output.url, format: output.format }
        : { status: 'failed', error: 'This request has already been submitted. Start a new operation.' }, ['starting']);
    }
    project = await patchJob(userId, projectId, job.id, { chargeId: charge.transactionId, isOwnerTest: charge.isOwnerTest }, ['starting']);
    job = project.canvas_data.jobs.find(item => item.id === job.id);
    if (!useRecraft) {
      let image = sourceUrl;
      if (sourceFormat === 'svg') {
        const png = await sharp(sourceBuffer, { limitInputPixels: 25_000_000 }).resize({ width: 1024, height: 1024, fit: 'inside' }).png().toBuffer();
        image = `data:image/png;base64,${png.toString('base64')}`;
      }
      const plan = nanoLogoPlan(input, image, job.compiledPrompt, job.seed);
      await patchJob(userId, projectId, job.id, { provider: 'fal', endpoint: plan.endpoint, model: plan.model, estimatedCostUsd: plan.cost }, ['starting']);
      const result = await fal.queue.submit(plan.endpoint, { input: plan.input });
      if (!result.request_id) throw new Error('The image model did not accept this request.');
      return await patchJob(userId, projectId, job.id, { status: 'queued', providerRequestId: result.request_id }, ['starting']);
    }
    project = await patchJob(userId, projectId, job.id, { status: 'running', provider: 'recraft' }, ['starting']);
    job = project.canvas_data.jobs.find(item => item.id === job.id);
    const result = await generateRecraftLogo(input, sourceBuffer, sourceFormat);
    // Persist the remote output before saving so a refresh can finish a crashed save.
    project = await patchJob(userId, projectId, job.id, {
      status: 'saving', endpoint: result.endpoint, model: result.model, providerRequestId: result.providerRequestId,
      providerOutputUrl: result.url, outputFormat: result.format,
    }, ['running']);
    job = project.canvas_data.jobs.find(item => item.id === job.id);
    await recordProviderUsage({ userId, projectId, creditTransactionId: job.chargeId, provider: 'recraft', endpoint: result.endpoint,
      providerRequestId: result.providerRequestId, estimatedCostUsd: result.cost, isOwnerTest: job.isOwnerTest });
    return await saveOutput(userId, projectId, job, result.url, result.format);
  } catch (error) {
    const message = error.code === 'INSUFFICIENT_CREDITS' ? 'Not enough credits for this operation.'
      : error.code === 'PROFILE_NOT_FOUND' ? 'Your account is not ready for billing. Please sign in again.'
      : 'This operation could not be completed. Please try again.';
    console.error('[Logo Studio] Operation failed:', error.message);
    return failJob(userId, projectId, job, message);
  }
}

// One durable reservation and one planner call per text-generation batch.
// Replay/status reads never initiate paid work; stale reservations use normal timeout recovery.
export async function startLogoTextBatch(userId, project, input, count) {
  if (input.operation !== 'generate' || input.mode !== 'text' || input.sourceId || input.sourceUrl
    || !Number.isInteger(count) || count < 1 || count > 4) throw new Error('Choose one to four Text to Logo options.');
  const id = project.id;
  project = (await accessibleLogoProject(userId, id, PROJECT_ACCESS.EDIT)).project;
  if (project.canvas_data.batches?.some(batch => batch.id === input.requestId)) return project;
  const { data: profile, error: profileError } = await adminSupabase.from('profiles').select('credits').eq('id', userId).maybeSingle();
  if (profileError || !profile) throw new Error('Your account is not ready for billing. Please sign in again.');
  if (Number(profile.credits) < count * logoOperationCost('generate', 'text')) throw new Error('Not enough credits for these logo options.');
  const ids = Array.from({ length: count }, () => randomUUID());
  let claimed = false;
  project = await mutateLogoProject(userId, id, state => {
    claimed = false;
    if (state.batches?.some(batch => batch.id === input.requestId)) return null;
    if (logoGenerationQuota(state.jobs).remaining < count) throw new Error('Not enough logo slots remain in this project.');
    if (state.jobs.length + count > 120) throw new Error('This project has reached 120 versions.');
    if (state.jobs.some(job => LOGO_ACTIVE.includes(job.status))) throw new Error('Wait for your current logos to finish first.');
    const now = new Date().toISOString();
    state.batches = [...(state.batches || []), { id: input.requestId, jobIds: ids, createdAt: now, billedUserId: userId }];
    for (const jobId of ids) state.jobs.push({ ...input, id: jobId, requestId: jobId, batchId: input.requestId, seed: parseInt(jobId.slice(0, 8), 16),
      billedUserId: userId, creditCost: logoOperationCost('generate', 'text'), status: 'starting', createdAt: now, updatedAt: now });
    claimed = true;
    return state;
  });
  if (!claimed) return project;
  try {
    if (process.env.LOGO_ART_DIRECTION_ENABLED === 'true') {
      const plan = await planLogoDirections(input, count);
      const logged = await recordProviderUsage({ projectId: id, userId, provider: plan.metadata.provider || 'local',
        endpoint: plan.metadata.endpoint || 'logo-art-direction', providerRequestId: input.requestId,
        estimatedCostUsd: Number.isFinite(plan.metadata.usage?.cost) && plan.metadata.usage.cost >= 0 ? plan.metadata.usage.cost : null,
        metadata: { ...plan.metadata, batchId: input.requestId, imageCalls: 0 } });
      project = await mutateLogoProject(userId, id, state => {
        const batch = state.batches.find(b => b.id === input.requestId);
        batch.planner = { ...plan.metadata, usageRecorded: logged }; batch.compilerVersion = LOGO_COMPILER_VERSION;
        ids.forEach((jobId, i) => {
          const job = state.jobs.find(j => j.id === jobId);
          if (job.status !== 'starting' || job.submissionClaimed) return;
          job.artDirection = plan.directions[i]; job.designBrief = plan.brief;
          job.compilerVersion = LOGO_COMPILER_VERSION;
          job.compiledPrompt = compileLogoDirection(plan.brief, plan.directions[i]);
        });
        return state;
      });
    }
    for (const jobId of ids) {
      project = await startLogoOperation(userId, project, { ...input, requestId: jobId }, true);
    }
    return project;
  } catch (error) {
    for (const jobId of ids) {
      const job = project.canvas_data.jobs.find(j => j.id === jobId);
      if (job?.status === 'starting' && !job.submissionClaimed) project = await failJob(userId, id, job, 'Logo preparation could not be completed.');
    }
    throw error;
  }
}

export async function refreshLogoJob(userId, project, id) {
  let job = project.canvas_data.jobs.find(item => item.id === id);
  if (!job || !LOGO_ACTIVE.includes(job.status)) return project;
  if (job.status === 'refunding') return failJob(userId, project.id, job, job.error || 'The operation could not be completed.');
  if (job.provider === 'recraft') {
    if (!job.providerOutputUrl) return logoJobTimedOut(job) ? failJob(userId, project.id, job, 'The operation timed out.') : project;
    if (job.status === 'saving' && Date.now() - Date.parse(job.updatedAt) < 90_000) return project;
    let claimed = false;
    project = await mutateLogoProject(userId, project.id, state => {
      claimed = false;
      const current = state.jobs.find(item => item.id === id);
      if (!current || !LOGO_ACTIVE.includes(current.status) || current.status === 'refunding'
        || (current.status === 'saving' && Date.now() - Date.parse(current.updatedAt) < 90_000)) return null;
      current.status = 'saving'; current.updatedAt = new Date().toISOString(); claimed = true; return state;
    });
    if (!claimed) return project;
    job = project.canvas_data.jobs.find(item => item.id === id);
    try { return await saveOutput(userId, project.id, job, job.providerOutputUrl, job.outputFormat); }
    catch { return failJob(userId, project.id, job, 'The logo could not be saved.'); }
  }
  // Nano Banana creation and legacy fal jobs share the durable queue flow.
  if (!job.providerRequestId || !['queued', 'running', 'saving'].includes(job.status)) {
    return logoJobTimedOut(job) ? failJob(userId, project.id, job, 'The operation timed out.') : project;
  }
  // A short save lease prevents duplicate uploads from concurrent polling tabs.
  if (job.status === 'saving' && Date.now() - Date.parse(job.updatedAt) < 90_000) return project;
  let status;
  try { status = await fal.queue.status(job.endpoint, { requestId: job.providerRequestId, logs: false }); }
  catch (error) {
    if ([400, 404, 422].includes(error.status)) return failJob(userId, project.id, job, 'The provider could not complete this logo.');
    if (logoJobTimedOut(job)) return failJob(userId, project.id, job, 'The operation could not be recovered.');
    return project; // A temporary status outage must not refund an active job.
  }
  if (status.status !== 'COMPLETED') {
    if (logoJobTimedOut(job)) return failJob(userId, project.id, job, 'The operation timed out.');
    if (status.status === 'IN_PROGRESS' && job.status === 'queued') return patchJob(userId, project.id, id, { status: 'running' }, ['queued']);
    return project;
  }
  let claimed = false;
  project = await mutateLogoProject(userId, project.id, state => {
    claimed = false;
    const current = state.jobs.find(item => item.id === id);
    if (!['queued', 'running', 'saving'].includes(current.status) || (current.status === 'saving' && Date.now() - Date.parse(current.updatedAt) < 90_000)) return null;
    current.status = 'saving'; current.updatedAt = new Date().toISOString(); claimed = true;
    return state;
  });
  if (!claimed) return project;
  job = project.canvas_data.jobs.find(item => item.id === id);
  try {
    const result = await fal.queue.result(job.endpoint, { requestId: job.providerRequestId });
    const url = result.data?.images?.[0]?.url || result.data?.image?.url;
    if (!url) throw new Error('Provider returned no image.');
    await recordProviderUsage({ userId: job.billedUserId || project.user_id, projectId: project.id, creditTransactionId: job.chargeId, provider: 'fal', endpoint: job.endpoint, providerRequestId: job.providerRequestId,
      estimatedCostUsd: job.estimatedCostUsd ?? (job.endpoint?.startsWith('fal-ai/nano-banana-pro') ? 0.15
        : job.endpoint?.startsWith('fal-ai/nano-banana-2') ? 0.08 : null), isOwnerTest: job.isOwnerTest });
    return await saveOutput(userId, project.id, job, url, 'png');
  } catch (error) {
    console.error('[Logo Studio] Save failed:', error.message);
    return failJob(userId, project.id, job, 'The logo could not be saved.');
  }
}
