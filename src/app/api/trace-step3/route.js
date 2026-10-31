import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/cloudflare';
import { adminSupabase } from '@/lib/supabase';
import { findLatestProjectCharge, recordProviderUsage } from '@/lib/creditLedger';
import { enforceRateLimit } from '@/lib/rateLimit';
import { fetchStoredAsset } from '@/lib/storageDownload';
import {
  DEFAULT_MAX_SVG_BYTES,
  DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
  fetchWithSSRFProtection,
  getAllowedProviderHosts,
  getAllowedStorageHosts,
  isOwnedStorageUrl,
  validateUrlForSSRF,
  isTransientFetchError,
} from '@/lib/ssrf';
import { getProjectAccess, PROJECT_ACCESS } from '@/lib/projectAccess';
import { universalUnavailableResponse } from '@/lib/universalAvailability.mjs';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request) {
  let projectId;
  let userId;
  const startedAt = Date.now();
  // Finish network work before the platform kills the route, leaving time to
  // record a useful failure and return the free-retry action to the user.
  const deadline = startedAt + 270_000;
  const signal = AbortSignal.timeout(270_000);
  let stage = 'authenticate';
  const setStage = (value) => {
    signal.throwIfAborted();
    stage = value;
    console.info('[Trace Step 3]', { projectId, stage, elapsedMs: Date.now() - startedAt });
  };
  try {
    // ─── Auth: verify the caller owns the project ─────────────────────────────
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const {
      data: { user },
      error: authError,
    } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: invalid session' }, { status: 401 });
    }
    userId = user.id;

    const rateLimit = await enforceRateLimit({
      namespace: 'api:trace-step3:user',
      identifier: userId,
      max: 3,
      window: '60 s',
      windowMs: 60_000,
    });
    if (!rateLimit.success) return rateLimit.response;
    // ─────────────────────────────────────────────────────────────────────────

    const body = await request.json();
    projectId = body.projectId;
    const colors = body.colors || 'auto';

    if (colors !== 'auto') {
      const colorLimit = parseInt(colors, 10);
      if (isNaN(colorLimit) || colorLimit < 2 || colorLimit > 256) {
        return NextResponse.json(
          { error: 'Invalid colors parameter. Must be between 2 and 256.' },
          { status: 400 },
        );
      }
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { project } = await getProjectAccess(user.id, projectId, {
      required: PROJECT_ACCESS.EDIT,
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const unavailable = universalUnavailableResponse(project.trace_type);
    if (unavailable) return unavailable;

    // ==========================================
    // STAGE 3: VECTORIZE WITH RECRAFT
    // The image is already upscaled in Step 2.
    // ==========================================
    if (!project.upscaled_image_url) {
      return NextResponse.json(
        { error: 'UPSCALE_REQUIRED', message: 'Resume HD Upscale before creating the SVG.' },
        { status: 400 },
      );
    }
    if (
      (!isOwnedStorageUrl(project.upscaled_image_url, { userId: user.id, projectId }) &&
        !isOwnedStorageUrl(project.upscaled_image_url, { userId: project.user_id, projectId })) ||
      !(await validateUrlForSSRF(project.upscaled_image_url, {
        allowedHosts: getAllowedStorageHosts(),
      }))
    ) {
      return NextResponse.json(
        { error: 'Invalid or unauthorized upscaled image URL' },
        { status: 400 },
      );
    }

    // Persisted provider receipts let a retry finish downloading/saving an SVG
    // without buying another vectorization. Match both source and color limit.
    setStage('recover-provider-result');
    const { data: receipt, error: receiptError } = await adminSupabase
      .from('provider_usage_logs')
      .select('metadata')
      .eq('project_id', projectId)
      .eq('provider', 'recraft')
      .eq('endpoint', 'images/vectorize')
      .eq('request_status', 'succeeded')
      .contains('metadata', {
        source_image_url: project.upscaled_image_url,
        colors: String(colors),
      })
      .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .abortSignal(signal)
      .maybeSingle();
    if (receiptError) console.warn('[Step 3] Could not read provider receipt:', receiptError.code);
    let vectorData = receipt?.metadata?.output_url
      ? { image: { url: receipt.metadata.output_url } }
      : null;

    if (!vectorData) {
      setStage('download-upscale');
      const { response: rasterImgRes, buffer: rawBuffer } = await fetchStoredAsset(
        project.upscaled_image_url,
        {
          maxBytes: DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
          allowedContentTypes: ['image/', 'application/octet-stream'],
          timeoutMs: 30_000,
          signal,
        },
      );
      if (!rasterImgRes.ok) throw new Error('Failed to fetch upscaled image from R2');

      // ─── Step 3 Pre-processing ────────────────────────────────────────────────
      // ESRGAN (Step 2) already upscaled the image.
      // Here we only resize to 2048px max (Recraft vectorize has a 4096px hard limit,
      // and smaller inputs process faster without sacrificing SVG path quality)
      // and convert to lossless PNG for clean color data.
      // NO aggressive contrast/normalize/sharpen — that caused the high-contrast SVG problem.
      // ─────────────────────────────────────────────────────────────────────────
      setStage('prepare-image');
      const sharp = (await import('sharp')).default;
      const sourceMetadata = await sharp(rawBuffer).metadata();
      if (!sourceMetadata.width || !sourceMetadata.height) {
        throw new Error('Unable to read the upscaled image dimensions');
      }

      // Recraft accepts raster inputs only when both sides are at least 256px.
      // Preserve the artwork's aspect ratio while bringing a small side up to
      // that floor, but never let the long side exceed our 2048px processing cap.
      // Extremely wide/tall artwork cannot satisfy both limits by scaling alone;
      // transparent padding handles that edge case without stretching the design.
      const swapsAxes = [5, 6, 7, 8].includes(sourceMetadata.orientation);
      const sourceWidth = swapsAxes ? sourceMetadata.height : sourceMetadata.width;
      const sourceHeight = swapsAxes ? sourceMetadata.width : sourceMetadata.height;
      const minVectorDimension = 256;
      const maxVectorDimension = 2048;
      const minSide = Math.min(sourceWidth, sourceHeight);
      const maxSide = Math.max(sourceWidth, sourceHeight);
      const scale = Math.min(
        maxVectorDimension / maxSide,
        Math.max(1, minVectorDimension / minSide),
      );
      const resizedWidth = Math.max(1, Math.floor(sourceWidth * scale));
      const resizedHeight = Math.max(1, Math.floor(sourceHeight * scale));
      const missingWidth = Math.max(0, minVectorDimension - resizedWidth);
      const missingHeight = Math.max(0, minVectorDimension - resizedHeight);

      let sharpInstance = sharp(rawBuffer)
        .rotate()
        .resize({ width: resizedWidth, height: resizedHeight, fit: 'fill' });

      if (missingWidth || missingHeight) {
        sharpInstance = sharpInstance.extend({
          left: Math.floor(missingWidth / 2),
          right: Math.ceil(missingWidth / 2),
          top: Math.floor(missingHeight / 2),
          bottom: Math.ceil(missingHeight / 2),
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        });
      }

      // Light sharpening for logos only: text and circular outlines benefit from
      // slightly crisper pixel edges before tracing, but we keep it gentle.
      if (project.trace_type === 'logo') {
        sharpInstance = sharpInstance.sharpen({
          sigma: 1.0,
          m1: 0.5,
          m2: 1.5,
          x1: 2,
          y2: 8,
          y3: 15,
        });
      }

      let compressedBuffer;
      if (colors && colors !== 'auto') {
        const colorLimit = parseInt(colors, 10);
        compressedBuffer = await sharpInstance
          .png({ palette: true, colors: colorLimit, effort: 1 })
          .toBuffer();
      } else {
        compressedBuffer = await sharpInstance.png({ effort: 1 }).toBuffer();
      }

      const token = process.env.RECRAFT_API_TOKEN || process.env.RECRAFT_API_KEY;
      if (!token) throw new Error('Vectorization is not configured on this server');
      let providerRequestId;
      for (let attempt = 1; attempt <= 2; attempt++) {
        setStage(`vectorize-attempt-${attempt}`);
        // Reserve 70s for output downloads, persistence, and the failure receipt.
        const timeoutMs = Math.min(105_000, deadline - Date.now() - 70_000);
        if (timeoutMs < 10_000)
          throw new DOMException('Vectorization time budget exhausted', 'TimeoutError');
        try {
          const vectorizeFormData = new FormData();
          vectorizeFormData.append(
            'image',
            new Blob([compressedBuffer], { type: 'image/png' }),
            'image.png',
          );
          const recraftVectorRes = await fetch(
            'https://external.api.recraft.ai/v1/images/vectorize',
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: vectorizeFormData,
              signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
            },
          );
          if (!recraftVectorRes.ok) {
            await recraftVectorRes.body?.cancel();
            const error = new Error(`Vectorization provider returned ${recraftVectorRes.status}`);
            error.status = recraftVectorRes.status;
            throw error;
          }
          // Read the body inside the attempt so interrupted JSON is handled too.
          vectorData = await recraftVectorRes.json();
          if (!vectorData?.image?.url)
            throw new Error('Vectorization provider returned no SVG URL');
          providerRequestId = vectorData.id || recraftVectorRes.headers.get('x-request-id') || null;
          break;
        } catch (error) {
          signal.throwIfAborted();
          // A lost response may already have been billed. Only retry an explicit
          // temporary HTTP rejection; users can retry an ambiguous failure free.
          if (attempt === 2 || ![429, 500, 502, 503, 504].includes(error.status)) throw error;
          console.warn('[Step 3] Temporary provider rejection:', { attempt, status: error.status });
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }

      setStage('save-provider-receipt');
      const charge = await findLatestProjectCharge(projectId);
      await recordProviderUsage({
        creditTransactionId: charge?.transactionId || null,
        projectId,
        userId,
        provider: 'recraft',
        endpoint: 'images/vectorize',
        providerRequestId,
        requestStatus: 'succeeded',
        estimatedCostUsd: 0.01,
        isOwnerTest: charge?.isOwnerTest === true,
        metadata: {
          source_image_url: project.upscaled_image_url,
          colors: String(colors),
          output_url: vectorData.image.url,
        },
      });
    }

    setStage('download-svg');
    const { response: svgRes, buffer: svgDownloadBuffer } = await fetchWithSSRFProtection(
      vectorData.image.url,
      {
        allowedHosts: getAllowedProviderHosts(),
        maxBytes: DEFAULT_MAX_SVG_BYTES,
        allowedContentTypes: ['image/svg+xml', 'text/plain', 'application/octet-stream'],
        timeoutMs: 20_000,
        maxAttempts: 2,
        signal,
      },
    );
    if (!svgRes.ok) throw new Error('Failed to fetch vectorized SVG');
    let svgText = svgDownloadBuffer.toString('utf8');

    // --- FIX FOR ADOBE ILLUSTRATOR "INVALID SVG" ERROR ---
    // 1. Remove markdown backticks if AI accidentally included them
    svgText = svgText
      .replace(/^```(xml|svg)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    // 2. Remove anything before the <svg> tag (like invalid <?xml ... ?> declarations)
    const svgStartMatch = svgText.match(/<svg[\s\S]*?>/i);
    if (svgStartMatch) {
      const startIndex = svgText.indexOf(svgStartMatch[0]);
      svgText = svgText.substring(startIndex);
    }

    // 3. Ensure xmlns is present
    if (!svgText.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgText = svgText.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Layer regrouping is disabled to preserve rendering. It needs no source
    // image download or extra provider call after the SVG is already ready.
    if (!/<svg\b/i.test(svgText) || !/<\/svg\s*>\s*$/i.test(svgText)) {
      throw new Error('Vectorization provider returned an incomplete SVG');
    }

    setStage('upload-svg');
    const svgBuffer = Buffer.from(svgText, 'utf8');
    const cfSvgFileName = `projects/${projectId}/vector_${Date.now()}.svg`;
    const finalSvgUrl = await uploadToR2(svgBuffer, cfSvgFileName, 'image/svg+xml', {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });

    setStage('save-project');
    const { data: saved, error: saveError } = await adminSupabase
      .from('projects')
      .update({ svg_url: finalSvgUrl, zip_url: null, zip_signature: null, zip_generated_at: null })
      .eq('id', projectId)
      .eq('upscaled_image_url', project.upscaled_image_url)
      .select('id')
      .abortSignal(signal)
      .maybeSingle();
    if (saveError) throw new Error(`Could not save SVG: ${saveError.message}`);
    if (!saved)
      return NextResponse.json(
        {
          error: 'ARTWORK_CHANGED',
          message:
            'Your artwork changed during processing. Retry Vector SVG for the current artwork.',
        },
        { status: 409 },
      );

    setStage('complete');
    return NextResponse.json({ success: true, step: 3, svg_url: finalSvgUrl });
  } catch (error) {
    const failure = {
      error: String(error.message || 'Unknown vectorization error').slice(0, 500),
      stage,
      elapsed_ms: Date.now() - startedAt,
      error_name: error.name,
      cause_code: error.cause?.code || error.code || null,
      status: error.status || null,
    };
    console.error('[Trace Step 3 Error]', { projectId, ...failure });

    try {
      const charge = await findLatestProjectCharge(projectId);
      if (charge) {
        await recordProviderUsage({
          creditTransactionId: charge.transactionId,
          projectId,
          userId,
          provider: 'syncraft_pipeline',
          endpoint: 'trace-step-3',
          requestStatus: 'failed',
          isOwnerTest: charge.isOwnerTest === true,
          metadata: failure,
        });
      }
    } catch (ledgerError) {
      console.error('[Step 3] Could not record failure:', ledgerError.message);
    }

    // This stage does not change balances directly. The project-linked failure
    // receipt allows the existing refund endpoint to verify a pipeline failure.

    const timedOut =
      signal.aborted ||
      error?.name === 'TimeoutError' ||
      /aborted|timeout/i.test(error?.message || '');
    const networkFailed = !timedOut && isTransientFetchError(error);
    return NextResponse.json(
      {
        error: timedOut
          ? 'VECTORIZE_TIMEOUT'
          : networkFailed
            ? 'VECTORIZE_NETWORK_FAILED'
            : 'VECTORIZE_FAILED',
        message: timedOut
          ? 'Vectorization timed out. Your upscale is saved. Retry Vector SVG for free.'
          : networkFailed
            ? 'The SVG connection was interrupted. Your upscale is saved. Retry Vector SVG for free.'
            : 'Could not finish saving your SVG. Your upscale is saved. Retry Vector SVG for free.',
      },
      { status: timedOut ? 504 : networkFailed ? 503 : 500 },
    );
  }
}
