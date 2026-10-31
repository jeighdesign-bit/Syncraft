import { NextResponse } from "next/server";
import { universalUnavailableResponse } from "@/lib/universalAvailability.mjs";
import { adminSupabase } from "@/lib/supabase";
import { chargeCreditsVerified, markCreditTransaction, recordProviderUsage, refundCreditVerified } from "@/lib/creditLedger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { DEFAULT_MAX_IMAGE_BYTES, fetchWithSSRFProtection, getAllowedProviderHosts, getAllowedStorageHosts, isOwnedStorageUrl, normalizeUserImageUrl, validateUrlForSSRF } from "@/lib/ssrf";
import { normalizeRecoveryAnalysis } from "@/lib/recovery";
import { normalizedCorrelation, recoveryAspectRatioDrift } from "@/lib/recoveryPolicy.mjs";
import { CREDIT_COST } from "@/lib/pricing";
import { getProjectAccess, PROJECT_ACCESS } from "@/lib/projectAccess";
import { uploadToR2 } from "@/lib/cloudflare";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { snapToAllowedAspectRatio } from "@/lib/aspectRatio";
import { categoryRecoveryAnalysis, normalizeReferenceCategory } from "@/lib/referenceCategories.mjs";
import { matchRecoveryStripProportions } from "@/lib/recoveryStrip.mjs";
import { inspectStripExterior } from "@/lib/recoveryStripBounds.mjs";
import { buildRecoveryImageInput, RECOVERY_IMAGE_ENDPOINT } from "@/lib/recoveryVision.mjs";

export const runtime = "nodejs";
export const maxDuration = 300;

function providerErrorMessage(error) {
  const detail = error?.body?.detail;
  const detailMessage = Array.isArray(detail)
    ? detail.map(item => item?.msg || item?.message || String(item)).filter(Boolean).join("; ")
    : typeof detail === "string" ? detail : "";
  return [
    error?.message,
    error?.body?.message,
    error?.body?.error,
    detailMessage,
    error?.cause?.message,
  ].find(value => typeof value === "string" && value.trim())?.trim()
    || (error?.status ? `Provider request failed with status ${error.status}.` : "Provider request failed without an error description.");
}

const waitForRetry = delayMs => new Promise(resolve => setTimeout(resolve, delayMs));

async function fetchRecoveryAsset(url, options, stage) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetchWithSSRFProtection(url, { ...options, timeoutMs: 30_000 });
    } catch (error) {
      lastError = error;
      const message = providerErrorMessage(error);
      const transient = error instanceof TypeError
        || /fetch failed|network|socket|econn|timed?\s*out|timeout|aborted/i.test(message);
      if (!transient || attempt === 3) break;
      await waitForRetry(attempt * 350);
    }
  }
  const wrapped = new Error(`${stage} download failed: ${providerErrorMessage(lastError)}`);
  wrapped.code = "RECOVERY_NETWORK_FAILED";
  wrapped.status = 503;
  throw wrapped;
}

async function runGeneration(imageUrls, analysis, mode, sourceBuffer, stage = "generation") {
  const { fal } = await import("@fal-ai/client");
  let requestId = "";
  try {
    const input = buildRecoveryImageInput({ imageUrls, analysis, mode, directCrop: true });
    const result = await fal.subscribe(RECOVERY_IMAGE_ENDPOINT, {
      input,
      logs: true,
      onEnqueue: id => { requestId = id; },
    });
    const image = result?.data?.images?.[0];
    if (!image?.url) throw new Error("Recovery model did not return an image.");
    return { ...image, requestId: result?.requestId || requestId || null, input };
  } catch (error) {
    const wrapped = new Error(`Fal ${stage} failed: ${providerErrorMessage(error)}`);
    wrapped.code = "FAL_RECOVERY_FAILED";
    wrapped.status = 502;
    wrapped.providerRequestId = error?.requestId || requestId || "";
    throw wrapped;
  }
}

async function visualContentStats(buffer) {
  const size = 128;
  const { data } = await sharp(buffer)
    .rotate()
    .resize(size, size, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let squareSum = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const value = data[index];
      sum += value;
      squareSum += value * value;
      if (x > 0) {
        edgeSum += Math.abs(value - data[index - 1]);
        edgeCount++;
      }
      if (y > 0) {
        edgeSum += Math.abs(value - data[index - size]);
        edgeCount++;
      }
    }
  }
  const count = size * size;
  const mean = sum / count;
  return {
    stdev: Math.sqrt(Math.max(0, squareSum / count - mean * mean)),
    edgeMean: edgeCount ? edgeSum / edgeCount : 0,
  };
}

async function contentRetentionCheck(sourceBuffer, outputBuffer) {
  const [source, output] = await Promise.all([
    visualContentStats(sourceBuffer),
    visualContentStats(outputBuffer),
  ]);
  const sourceHasDetail = source.stdev >= 18 || source.edgeMean >= 4;
  const outputLostContrast = output.stdev < Math.max(7, source.stdev * 0.35);
  const outputLostEdges = output.edgeMean < Math.max(1.25, source.edgeMean * 0.3);
  return {
    source,
    output,
    collapsed: sourceHasDetail && outputLostContrast && outputLostEdges,
  };
}

async function structuralSimilarity(sourceBuffer, outputBuffer) {
  const prepare = buffer => sharp(buffer)
    .rotate()
    .resize(96, 96, { fit: "fill" })
    .greyscale()
    .blur(1)
    .raw()
    .toBuffer();
  const [sourcePixels, outputPixels] = await Promise.all([
    prepare(sourceBuffer),
    prepare(outputBuffer),
  ]);
  return normalizedCorrelation(sourcePixels, outputPixels);
}

function normalizeValidation(raw) {
  return {
    ...(raw && typeof raw === "object" ? raw : {}),
    pass: raw?.pass === true,
    usable_partial: raw?.usable_partial === true,
    failures: Array.isArray(raw?.failures)
      ? raw.failures.slice(0, 12).map(String)
      : [],
    correction: String(raw?.correction || "").slice(0, 300),
  };
}

async function refund(userId, projectId, chargeTransactionId, reason, validation = null) {
  let ok = false;
  try {
    const result = await refundCreditVerified({
      chargeTransactionId,
      reason,
      action: "Refund: Universal Design Recovery (Error)",
      metadata: { route: "api/recovery/generate", validation: validation || null },
    });
    ok = result.refunded;
  } catch (refundError) {
    console.error("[Universal Recovery] Verified refund failed:", refundError);
  }
  const { data: project } = await adminSupabase.from("projects").select("canvas_data").eq("id", projectId).single();
  const currentRecovery = project?.canvas_data?.universal_recovery || {};
  await adminSupabase.from("projects").update({
    credit_deducted: !ok,
    refunded: ok,
    canvas_data: {
      ...(project?.canvas_data || {}),
      universal_recovery: {
        ...currentRecovery,
        status: "failed",
        error: String(reason).slice(0, 300),
        ...(validation ? { validation } : {}),
      },
    },
  }).eq("id", projectId);
  return ok;
}

export async function POST(request) {
  let charged = false;
  let projectId;
  let userId;
  let chargeTransactionId = null;
  let isOwnerTest = false;
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "").trim();
    const { data: { user } } = await adminSupabase.auth.getUser(token || "");
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const unavailable = universalUnavailableResponse();
    if (unavailable) return unavailable;
    userId = user.id;
    const limit = await enforceRateLimit({ namespace: "api:recovery:generate", identifier: user.id, max: 3, window: "60 s", windowMs: 60_000 });
    if (!limit.success) return limit.response;

    ({ projectId } = await request.json());
    const { project } = await getProjectAccess(user.id, projectId, { required: PROJECT_ACCESS.EDIT });
    if (!project || project.trace_type !== "universal") return NextResponse.json({ error: "Universal project not found" }, { status: 404 });
    const recovery = project.canvas_data?.universal_recovery;
    if (!recovery?.analysis) return NextResponse.json({ error: "RECOVERY_NOT_ANALYZED" }, { status: 409 });

    // Reuse the existing project billing flag as the atomic duplicate lock; all
    // Universal-only metadata lives inside the existing canvas_data JSON field.
    if (recovery.status !== "analyzed") return NextResponse.json({ error: "RECOVERY_NOT_ANALYZED" }, { status: 409 });
    const generatingCanvas = {
      ...(project.canvas_data || {}),
      universal_recovery: { ...recovery, status: "generating" },
    };
    const { data: locked, error: lockError } = await adminSupabase.from("projects")
      .update({ canvas_data: generatingCanvas, credit_deducted: true, refunded: false })
      .eq("id", projectId)
      .or("credit_deducted.eq.false,credit_deducted.is.null").select("id");
    if (lockError) throw new Error(`Could not start recovery: ${lockError.message}`);
    if (!locked?.length) return NextResponse.json({
      error: "A recovery run is already in progress. Please wait for it to finish.",
      code: "RECOVERY_ALREADY_RUNNING",
    }, { status: 409 });

    try {
      const charge = await chargeCreditsVerified({
        userId: user.id,
        projectId,
        feature: "universal_design_recovery",
        action: "Universal Design Recovery",
        amount: CREDIT_COST.universal,
        metadata: { route: "api/recovery/generate", mode: recovery.mode || project.ai_prompt || null, reference_category: normalizeReferenceCategory(project.canvas_data?.reference_category) },
      });
      chargeTransactionId = charge.transactionId;
      isOwnerTest = charge.isOwnerTest;
      charged = true;
    } catch (billingError) {
      await adminSupabase.from("projects").update({ canvas_data: project.canvas_data, credit_deducted: false }).eq("id", projectId);
      if (billingError.code === "INSUFFICIENT_CREDITS" || billingError.code === "PROFILE_NOT_FOUND") {
        return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 403 });
      }
      console.error("[Universal Recovery] Verified charge failed:", billingError);
      return NextResponse.json({ error: "Billing error. Please try again." }, { status: 500 });
    }

    const sourceUrl = normalizeUserImageUrl(project.original_image_url, new URL(request.url).origin);
    if ((!isOwnedStorageUrl(sourceUrl, { userId: user.id, projectId }) && !isOwnedStorageUrl(sourceUrl, { userId: project.user_id, projectId })) || !(await validateUrlForSSRF(sourceUrl, { allowedHosts: getAllowedStorageHosts() }))) throw new Error("Invalid source image URL");
    const source = await fetchRecoveryAsset(sourceUrl, {
      allowedHosts: getAllowedStorageHosts(),
      maxBytes: DEFAULT_MAX_IMAGE_BYTES,
      allowedContentTypes: ["image/"],
    }, "Source image");
    const sourceReferenceHash = createHash("sha256").update(source.buffer).digest("hex");
    // Read local crop dimensions without changing the reference sent to the model.
    source.buffer = await sharp(source.buffer).rotate().png().toBuffer();
    const sourceMeta = await sharp(source.buffer).metadata();
    const sourceWidth = sourceMeta.width;
    const sourceHeight = sourceMeta.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Could not read cropped reference dimensions.");
    const recoveryMode = recovery.mode || project.ai_prompt || 'UNIVERSAL_KEEP_ARTWORK';
    const backgroundOnly = recoveryMode === 'UNIVERSAL_BACKGROUND_ONLY';
    const keepArtwork = !backgroundOnly;
    const cropRatio = sourceWidth / sourceHeight;
    // This is arithmetic on the user's crop, never remote target detection.
    const aspectRatio = cropRatio >= 9 / 16 && cropRatio <= 21 / 9
      ? snapToAllowedAspectRatio(sourceWidth, sourceHeight) : 'auto';
    // Discard every prior semantic analysis, transcription and proposed quad.
    // The only extraction reference is the exact crop saved by the user.
    const analysis = categoryRecoveryAnalysis({ ...normalizeRecoveryAnalysis({
      state: 'partial', quality: Math.min(sourceWidth, sourceHeight) < 192 ? 'poor' : 'fair',
      confidence: 0, aspect_ratio: aspectRatio, layout_strategy: 'unknown',
      surface_description: 'All visible printed artwork inside the exact user-selected crop.',
      reason: 'Direct extraction from the selected crop; no separate image analysis was requested.',
    }, 'auto'), source_width: sourceWidth, source_height: sourceHeight,
      crop_authoritative: true, preparation: 'local_crop_dimensions_only' }, project.canvas_data?.reference_category);
    const finalImage = await runGeneration([source.finalUrl], analysis, recoveryMode, source.buffer);
    let downloaded = await fetchRecoveryAsset(finalImage.url, {
      allowedHosts: getAllowedProviderHosts(), maxBytes: DEFAULT_MAX_IMAGE_BYTES,
      allowedContentTypes: ['image/'],
    }, 'Generated image');
    await recordProviderUsage({ creditTransactionId: chargeTransactionId, projectId, userId,
      provider: 'fal', endpoint: RECOVERY_IMAGE_ENDPOINT, providerRequestId: finalImage.requestId || null,
      estimatedCostUsd: 0.15, isOwnerTest,
      metadata: { operation: 'universal_design_recovery', extraction_flow: 'direct_crop',
        mode: recoveryMode, reference_category: analysis.reference_category,
        input_reference_sha256: sourceReferenceHash, provider_input: finalImage.input,
        source_width: sourceWidth, source_height: sourceHeight },
    });
    const preserveStripProportions = cropRatio < 0.35 || cropRatio > 3;
    if (preserveStripProportions) downloaded = { ...downloaded,
      buffer: await matchRecoveryStripProportions(downloaded.buffer, sourceWidth, sourceHeight),
      response: new Response(null, { headers: { 'content-type': 'image/png' } }) };
    const [retention, outputMeta, similarity] = await Promise.all([
      contentRetentionCheck(source.buffer, downloaded.buffer), sharp(downloaded.buffer).metadata(),
      keepArtwork ? structuralSimilarity(source.buffer, downloaded.buffer) : Promise.resolve(null),
    ]);
    let validation = { pass: false, usable_partial: true, advisory_only: true, failures: [],
      review_status: 'not_requested', extraction_method: 'direct_crop_image_edit',
      correction: 'Extraction is ready. Compare the artwork with your selected crop before use.',
      input_reference_sha256: sourceReferenceHash, crop_authoritative: true,
      diagnostics: { collapsed: retention.collapsed, similarity,
        ratioDrift: recoveryAspectRatioDrift(sourceWidth, sourceHeight, outputMeta.width, outputMeta.height) },
      source_proportions_preserved: preserveStripProportions };
    // This local warning cannot change the crop, call a model, or reject output.
    const stripExterior = await inspectStripExterior(downloaded.buffer, { category: analysis.reference_category,
      mode: recoveryMode, analysis, method: 'image_edit' });
    if (stripExterior?.suspected_exterior) validation = { ...validation, failures: ['wrong_layout'],
      correction: 'The extracted ribbon may still contain large plain side bands. Compare it with your crop before use.',
      advisory_diagnostics: { strip_exterior: stripExterior } };
    validation = normalizeValidation(validation);
    const exactOutput = downloaded.buffer;
    const exactOutputMimeType = downloaded.response?.headers.get('content-type')?.split(';')[0] || 'image/png';
    const outputExtension = ({
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
    })[exactOutputMimeType] || "png";
    const outputFileName = `projects/${projectId}/generated_flat_${Date.now()}.${outputExtension}`;
    const fileUrl = await uploadToR2(exactOutput, outputFileName, exactOutputMimeType);

    const { error: saveError } = await adminSupabase.from("projects").update({
      generated_image_url: fileUrl,
      upscaled_image_url: null,
      svg_url: null,
      ai_prompt: null,
      zip_url: null,
      zip_signature: null,
      zip_generated_at: null,
      canvas_data: {
        ...(project.canvas_data || {}),
        universal_recovery: {
          ...recovery,
          analysis,
          status: validation.pass ? "validated" : "partial",
          validation,
          retry_count: 0,
          costs: {
            analysis_calls: 0,
            image_generation_calls: 1,
            validation_calls: 0,
            source_verification_calls: 0,
            output_plane_verification_calls: 0,
            foreground_detection_calls: 0,
            masked_regions: 0,
            charged_credits: CREDIT_COST.universal,
          },
        },
      },
    }).eq("id", projectId);
    if (saveError) throw new Error(`Could not save Universal flat extract: ${saveError.message}`);

    await markCreditTransaction({
      transactionId: chargeTransactionId,
      status: "succeeded",
      metadata: { recovery_status: validation.pass ? "complete" : "partial" },
    });

    return NextResponse.json({
      success: true,
      alreadySaved: true,
      fileUrl,
      mimeType: exactOutputMimeType,
      recoveryStatus: validation.pass ? "complete" : "partial",
      validation,
      analysis,
    });
  } catch (error) {
    const errorMessage = providerErrorMessage(error);
    const expectedValidationFailure = error?.code === "BACKGROUND_ONLY_VALIDATION_FAILED";
    if (expectedValidationFailure) {
      console.warn("[Universal Recovery] Background-only output rejected:", error.validation?.failures || []);
    } else {
      console.error("[Universal Recovery]", error);
    }
    const refunded = charged && userId && projectId
      ? await refund(userId, projectId, chargeTransactionId, errorMessage, error.validation)
      : false;
    const expectedQualityRejection = error.code === "BACKGROUND_ONLY_VALIDATION_FAILED"
      || error.code === "RECOVERY_VALIDATION_FAILED"
      || error.code === "RECOVERY_VISUAL_CHECK_FAILED"
      || error.code === "FOREGROUND_MASK_NOT_FOUND"
      || error.code === "FOREGROUND_DETECTION_UNAVAILABLE"
      || error.code === "RECOVERY_NETWORK_FAILED";
    return NextResponse.json({
      success: false,
      error: errorMessage,
      code: error.code || "UNIVERSAL_RECOVERY_FAILED",
      refunded,
      ...(error.validation ? { validation: error.validation } : {}),
      ...(error.providerRequestId ? { requestId: error.providerRequestId } : {}),
    }, { status: expectedQualityRejection ? 200 : error.status || 500 });
  }
}
