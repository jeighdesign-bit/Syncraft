import { createHash, randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/supabase';
import { uploadToR2, getR2DownloadUrl } from '@/lib/cloudflare';
import { fetchStoredAsset } from '@/lib/storageDownload';
import { downloadUpscaleFile } from '@/lib/upscaleDownload.mjs';
import { optimizePngLosslessly } from '@/lib/pngOptimization.mjs';
import {
  fetchWithSSRFProtection,
  getAllowedProviderHosts,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
} from '@/lib/ssrf';
import { usesNativeTraceUpscale, resizeTraceForUpscale } from '@/lib/traceUpscale.mjs';
import { findLatestProjectCharge, recordProviderUsage } from '@/lib/creditLedger';

const PROVIDER = 'syncraft_upscale';
const ENDPOINT = 'fal-ai/esrgan';
const ACTIVE = ['submitting', 'queued', 'running', 'ready', 'saving'];
const query = () => adminSupabase.from('provider_usage_logs');
const jobKey = (project) =>
  createHash('sha256')
    .update(
      JSON.stringify([project.id, project.generated_image_url, usesNativeTraceUpscale(project), 4]),
    )
    .digest('hex');

function failure(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function snapshot(job) {
  if (!job) return { success: true, status: 'none' };
  if (job.request_status === 'submission_unknown')
    throw failure(
      'UPSCALE_SUBMISSION_UNCONFIRMED',
      'The provider did not confirm this upscale request. Your artwork is saved. Contact support before starting another upscale.',
    );
  if (job.request_status === 'failed')
    throw failure(
      'UPSCALE_PROVIDER_FAILED',
      'The AI provider could not finish this upscale. Your flat artwork is saved. Resume HD Upscale for free.',
    );
  if (job.request_status === 'superseded')
    throw failure(
      'UPSCALE_ARTWORK_CHANGED',
      'This upscale belongs to earlier artwork. Resume HD Upscale for the current artwork.',
      409,
    );
  return {
    success: true,
    status: job.request_status,
    elapsedSeconds: Math.max(
      0,
      Math.floor(
        (Date.now() - Date.parse(job.metadata.attempt_started_at || job.created_at)) / 1000,
      ),
    ),
    queuePosition: job.metadata.queue_position ?? null,
    ...(job.request_status === 'succeeded'
      ? { fileUrl: job.metadata.saved_url, mimeType: job.metadata.mime_type, alreadySaved: true }
      : {}),
  };
}

async function loadJob(project) {
  const { data, error } = await query()
    .select('*')
    .eq('provider', PROVIDER)
    .eq('provider_request_id', jobKey(project))
    .maybeSingle();
  if (error)
    throw failure(
      'UPSCALE_STORAGE_UNAVAILABLE',
      'Could not read the saved upscale job. Please try again.',
    );
  return data;
}

async function transition(job, status, metadata = {}, expected = job.request_status) {
  let update = query()
    .update({ request_status: status, metadata: { ...job.metadata, ...metadata } })
    .eq('id', job.id)
    .eq('request_status', expected);
  if (job.metadata.lease_token)
    update = update.eq('metadata->>lease_token', job.metadata.lease_token);
  const { data, error } = await update.select('*').maybeSingle();
  if (error)
    throw failure(
      'UPSCALE_STORAGE_UNAVAILABLE',
      'Could not save the upscale job. Your artwork is safe; resume for free.',
    );
  return data;
}

// Never repeat submission after a lost response. GET status/result reads are
// safe to retry on a later poll; the durable job ID is always reused.
async function falRequest(path, { body, timeoutMs = 15_000 } = {}) {
  if (!process.env.FAL_KEY)
    throw failure(
      'UPSCALE_UNAVAILABLE',
      'HD Upscale is temporarily unavailable. Your artwork is saved.',
    );
  const response = await fetch(`https://queue.fal.run/${ENDPOINT}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      ...(body ? { 'Content-Type': 'application/json', 'x-fal-request-timeout': '120' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error(`Upscale provider returned ${response.status}`), {
      status: response.status,
      providerTerminal: response.headers.get('x-fal-request-timeout-type') === 'user',
    });
  }
  return response.json();
}

export async function startTraceUpscale(project, actorId) {
  let job = await loadJob(project);
  if (project.upscaled_image_url)
    return {
      success: true,
      status: 'succeeded',
      fileUrl: project.upscaled_image_url,
      alreadySaved: true,
    };
  if (!job) {
    const native = usesNativeTraceUpscale(project);
    const { data, error } = await query()
      .insert({
        project_id: project.id,
        user_id: project.user_id,
        provider: PROVIDER,
        endpoint: 'trace-upscale',
        provider_request_id: jobKey(project),
        request_status: native ? 'ready' : 'submitting',
        metadata: {
          source_url: project.generated_image_url,
          native,
          actor_id: actorId,
          attempt_started_at: new Date().toISOString(),
        },
      })
      .select('*')
      .single();
    if (error?.code === '23505') return snapshot(await loadJob(project));
    if (error)
      throw failure(
        'UPSCALE_STORAGE_UNAVAILABLE',
        'Could not reserve the upscale job. Please try again.',
      );
    job = data;
  } else if (['superseded', 'succeeded'].includes(job.request_status)) {
    const status =
      job.metadata.native || job.metadata.output_url
        ? 'ready'
        : job.metadata.request_id
          ? 'queued'
          : 'submission_unknown';
    return snapshot(
      (await transition(job, status, { lease_token: null, lease_until: null })) ||
        (await loadJob(project)),
    );
  } else if (job.request_status === 'failed') {
    // Only a definite provider rejection may start another attempt. Network
    // ambiguity is retained separately and cannot release this reservation.
    job = await transition(job, job.metadata.native ? 'ready' : 'submitting', {
      request_id: null,
      output_url: null,
      last_error: null,
      attempt_started_at: new Date().toISOString(),
    });
    if (!job) return snapshot(await loadJob(project));
  } else {
    return snapshot(job);
  }
  if (job.metadata.native) return snapshot(job);

  let requestId;
  let submissionAttempted = false;
  try {
    const imageUrl =
      (await getR2DownloadUrl(project.generated_image_url, { expiresIn: 3600 })) ||
      project.generated_image_url;
    if (!process.env.FAL_KEY)
      throw failure(
        'UPSCALE_UNAVAILABLE',
        'HD Upscale is temporarily unavailable. Your artwork is saved.',
      );
    submissionAttempted = true;
    const result = await falRequest('', {
      body: { image_url: imageUrl, scale: 4 },
      timeoutMs: 25_000,
    });
    if (typeof result.request_id !== 'string' || !/^[\w-]{1,150}$/.test(result.request_id))
      throw new Error('Upscale submission returned no request ID');
    requestId = result.request_id;
    console.info(
      '[Trace Upscale] Provider accepted ' + JSON.stringify({ projectId: project.id, requestId }),
    );
    // This write is awaited before returning 202. A browser reconnect never
    // starts a second request while the original job is queued/running.
    const saved = await transition(job, 'queued', {
      request_id: requestId,
      queued_at: new Date().toISOString(),
    });
    if (!saved) return snapshot(await loadJob(project));
    return snapshot(saved);
  } catch (error) {
    const definiteRejection =
      !submissionAttempted || (!requestId && [400, 401, 402, 403, 422, 429].includes(error.status));
    try {
      await transition(
        job,
        requestId ? 'queued' : definiteRejection ? 'failed' : 'submission_unknown',
        {
          ...(requestId ? { request_id: requestId } : {}),
          last_error: String(error.message).slice(0, 300),
        },
      );
    } catch {
      /* Keep the reservation; never submit again to recover a DB outage. */
    }
    if (requestId)
      throw failure(
        'UPSCALE_STORAGE_UNAVAILABLE',
        'Your upscale was submitted. Reopen this project to reconnect without starting another job.',
      );
    if (definiteRejection)
      throw failure(
        'UPSCALE_PROVIDER_FAILED',
        'The provider could not accept this upscale. Your artwork is saved. Resume HD Upscale for free.',
      );
    throw failure(
      'UPSCALE_SUBMISSION_UNCONFIRMED',
      'The provider did not confirm this upscale request. Your artwork is saved. Contact support before starting another upscale.',
    );
  }
}

export async function getTraceUpscaleStatus(project) {
  let job = await loadJob(project);
  if (project.upscaled_image_url)
    return {
      success: true,
      status: 'succeeded',
      fileUrl: project.upscaled_image_url,
      alreadySaved: true,
    };
  if (!job) return snapshot(null);
  if (job.request_status === 'succeeded') {
    job =
      (await transition(job, 'ready', { lease_token: null, lease_until: null })) ||
      (await loadJob(project));
  }
  if (
    job.request_status === 'submitting' &&
    Date.now() - Date.parse(job.metadata.attempt_started_at || job.created_at) > 60_000
  ) {
    // A killed process may have submitted successfully. Do not release it by age.
    throw failure(
      'UPSCALE_SUBMISSION_UNCONFIRMED',
      'The provider did not confirm this upscale request. Your artwork is saved. Contact support before starting another upscale.',
    );
  }
  if (!['queued', 'running'].includes(job.request_status)) return snapshot(job);
  const requestId = job.metadata.request_id;
  if (!requestId || !/^[\w-]{1,150}$/.test(requestId))
    throw failure(
      'UPSCALE_SUBMISSION_UNCONFIRMED',
      'Could not confirm the saved upscale job. Please contact support.',
    );
  let completed = false;
  try {
    const status = await falRequest(`/requests/${requestId}/status`);
    if (status.status !== 'COMPLETED') {
      const next = status.status === 'IN_PROGRESS' ? 'running' : 'queued';
      job =
        (await transition(job, next, {
          queue_position: status.status === 'IN_QUEUE' ? status.queue_position : null,
        })) || (await loadJob(project));
      return snapshot(job);
    }
    completed = true;
    const output = await falRequest(`/requests/${requestId}`);
    const url = output.image?.url || output.image_url;
    if (!url) throw Object.assign(new Error('Upscale provider returned no image'), { status: 422 });
    job =
      (await transition(job, 'ready', {
        output_url: url,
        mime_type: output.image?.content_type || 'image/png',
        provider_completed_at: new Date().toISOString(),
        provider_inference_ms: Number.isFinite(status.metrics?.inference_time)
          ? Math.round(status.metrics.inference_time * 1000)
          : null,
        queue_position: null,
      })) || (await loadJob(project));
    return snapshot(job);
  } catch (error) {
    if (error.providerTerminal || (completed && [400, 422].includes(error.status))) {
      await transition(job, 'failed', { last_error: String(error.message).slice(0, 300) });
      throw failure(
        'UPSCALE_PROVIDER_FAILED',
        'The AI provider could not finish this upscale. Your flat artwork is saved. Resume HD Upscale for free.',
      );
    }
    throw failure(
      'UPSCALE_STATUS_UNAVAILABLE',
      'Could not check progress. Your upscale job is saved. Reconnect to resume the same job for free.',
    );
  }
}

export async function saveTraceUpscale(project) {
  let job = await loadJob(project);
  if (project.upscaled_image_url)
    return {
      success: true,
      status: 'succeeded',
      fileUrl: project.upscaled_image_url,
      alreadySaved: true,
    };
  if (!job) throw failure('UPSCALE_REQUIRED', 'Start HD Upscale first.', 409);
  if (job.request_status === 'saving' && Date.parse(job.metadata.lease_until) < Date.now()) {
    job =
      (await transition(job, 'ready', { lease_token: null, lease_until: null })) ||
      (await loadJob(project));
  }
  if (job.request_status !== 'ready') return snapshot(job);
  job = await transition(job, 'saving', {
    lease_token: randomUUID(),
    lease_until: new Date(Date.now() + 180_000).toISOString(),
  });
  if (!job) return snapshot(await loadJob(project));

  const signal = AbortSignal.timeout(150_000);
  const saveStartedAt = Date.now();
  const timings = {};
  let stage = 'download';
  let stageStartedAt = saveStartedAt;
  const logStage = () =>
    console.info(
      '[Trace Upscale] Save stage ' +
        JSON.stringify({
          projectId: project.id,
          stage,
          elapsedMs: Date.now() - saveStartedAt,
        }),
    );
  const setStage = (next) => {
    const now = Date.now();
    timings[stage] = now - stageStartedAt;
    stage = next;
    stageStartedAt = now;
    logStage();
  };
  logStage();
  try {
    let buffer, mime;
    if (job.metadata.native) {
      const input = await fetchStoredAsset(job.metadata.source_url, {
        maxBytes: DEFAULT_MAX_IMAGE_BYTES,
        allowedContentTypes: ['image/'],
        timeoutMs: 30_000,
        signal,
      });
      setStage('resize');
      buffer = await resizeTraceForUpscale(input.buffer);
      mime = 'image/png';
    } else {
      const download = await downloadUpscaleFile(job.metadata.output_url, {
        fetchAsset: fetchWithSSRFProtection,
        allowedHosts: getAllowedProviderHosts(),
        maxBytes: DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
        signal,
      });
      buffer = download.buffer;
      mime = download.response.headers.get('content-type')?.split(';')[0] || job.metadata.mime_type;
    }
    signal.throwIfAborted();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime))
      throw new Error('Unsupported upscale image format');
    const originalBytes = buffer.length;
    if (mime === 'image/png') {
      setStage('optimize-png');
      buffer = await optimizePngLosslessly(buffer, { signal });
    }
    signal.throwIfAborted();
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime];
    setStage('upload');
    // PNG is replaced only with a smaller, pixel-verified lossless encoding.
    // Other formats retain their original provider bytes.
    const url = await uploadToR2(
      buffer,
      `projects/${project.id}/upscaled_job_${job.id}.${ext}`,
      mime,
      {
        signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
      },
    );
    signal.throwIfAborted();
    setStage('save-project');
    const { data, error } = await adminSupabase
      .from('projects')
      .update({
        upscaled_image_url: url,
        svg_url: null,
        zip_url: null,
        zip_signature: null,
        zip_generated_at: null,
      })
      .eq('id', project.id)
      .eq('generated_image_url', job.metadata.source_url)
      .select('id')
      .abortSignal(signal)
      .maybeSingle();
    if (error) throw new Error('Could not save the completed upscale');
    if (!data)
      throw failure(
        'ARTWORK_CHANGED',
        'The artwork changed during processing. Reopen the current artwork to continue.',
        409,
      );
    setStage('complete');
    await transition(job, 'succeeded', {
      saved_url: url,
      mime_type: mime,
      original_bytes: originalBytes,
      saved_bytes: buffer.length,
      lease_token: null,
      lease_until: null,
      save_timings_ms: timings,
      save_total_ms: Date.now() - saveStartedAt,
      save_completed_at: new Date().toISOString(),
    });
    if (!job.metadata.native) {
      const charge = await findLatestProjectCharge(project.id);
      await recordProviderUsage({
        creditTransactionId: charge?.transactionId || null,
        projectId: project.id,
        userId: project.user_id,
        provider: 'fal',
        endpoint: ENDPOINT,
        providerRequestId: job.metadata.request_id,
        isOwnerTest: charge?.isOwnerTest === true,
        metadata: { operation: 'trace_upscale', source_url: job.metadata.source_url },
      });
    }
    console.info(
      '[Trace Upscale] Saved ' +
        JSON.stringify({
          projectId: project.id,
          requestId: job.metadata.request_id,
          saveTimingsMs: timings,
        }),
    );
    return { success: true, status: 'succeeded', fileUrl: url, mimeType: mime, alreadySaved: true };
  } catch (error) {
    timings[stage] = Date.now() - stageStartedAt;
    console.error(
      '[Trace Upscale] Save interrupted ' +
        JSON.stringify({
          projectId: project.id,
          stage,
          error: error.message,
          saveTimingsMs: timings,
        }),
    );
    await transition(job, error.code === 'ARTWORK_CHANGED' ? 'superseded' : 'ready', {
      lease_token: null,
      lease_until: null,
      last_error: String(error.message).slice(0, 300),
      last_stage: stage,
      save_timings_ms: timings,
    }).catch(() => {});
    if (error.code === 'ARTWORK_CHANGED') throw error;
    throw failure(
      'UPSCALE_SAVE_INTERRUPTED',
      'The upscale result is saved with the provider. Resume HD Upscale for free to finish saving it.',
    );
  }
}

export async function reconcileTraceUpscales(deadline = Date.now() + 210_000) {
  const { data: jobs, error } = await query()
    .select('*')
    .eq('provider', PROVIDER)
    .in('request_status', ACTIVE)
    .gte('created_at', new Date(Date.now() - 3 * 86400_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(10);
  if (error) throw error;
  let checked = 0;
  for (const row of jobs) {
    if (Date.now() + 35_000 > deadline) break;
    try {
      const { data: project } = await adminSupabase
        .from('projects')
        .select('*')
        .eq('id', row.project_id)
        .maybeSingle();
      if (
        !project ||
        Date.parse(project.created_at) + 3 * 86400_000 <= Date.now() ||
        !project.generated_image_url ||
        project.generated_image_url === 'REFUNDED' ||
        row.provider_request_id !== jobKey(project)
      ) {
        await transition(row, 'superseded');
        continue;
      }
      if (project.upscaled_image_url) {
        await transition(row, 'succeeded', {
          saved_url: project.upscaled_image_url,
          lease_token: null,
          lease_until: null,
        });
        continue;
      }
      if (
        row.request_status === 'submitting' &&
        Date.now() - Date.parse(row.metadata.attempt_started_at || row.created_at) > 60_000
      ) {
        await transition(row, 'submission_unknown');
        continue;
      }
      const result = await getTraceUpscaleStatus(project);
      if (result.status === 'ready' || result.status === 'saving') {
        if (Date.now() + 150_000 > deadline) break;
        await saveTraceUpscale(project);
      }
      checked++;
    } catch (err) {
      console.warn('[Trace Upscale reconciliation]', { projectId: row.project_id, code: err.code });
    }
  }
  return checked;
}
