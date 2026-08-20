import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { chargeCreditsVerified, markCreditTransaction, recordProviderUsage, refundCreditVerified } from "@/lib/creditLedger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { DEFAULT_MAX_IMAGE_BYTES, fetchWithSSRFProtection, getAllowedProviderHosts, getAllowedStorageHosts, isOwnedStorageUrl, normalizeUserImageUrl, validateUrlForSSRF } from "@/lib/ssrf";
import { buildRecoveryPrompt, normalizeRecoveryAnalysis } from "@/lib/recovery";
import { backgroundOnlyFailureMessage, shouldFallbackToSource, shouldRejectBackgroundOnly, sourceFallbackCorrection } from "@/lib/recoveryPolicy.mjs";
import { CREDIT_COST } from "@/lib/pricing";
import sharp from "sharp";

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

async function runEdit(imageUrls, prompt, aspectRatio = "auto", backgroundOnly = false, stage = "generation") {
  const { fal } = await import("@fal-ai/client");
  let requestId = "";
  try {
    const result = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
      input: {
        image_urls: imageUrls,
        prompt,
        aspect_ratio: aspectRatio,
        system_prompt: backgroundOnly
          ? "This is a benign graphic-design clean-plate edit of a user-supplied printed surface. Return only its non-typographic background layer. Omit overlaid typography, badges, mascots, emblems, and other focal foreground graphics, then naturally continue the adjacent abstract pattern through those areas. Preserve the source palette, stripes, gradients, halftones, textures, and asymmetric layout. Correct camera tilt, perspective, folds, sag, and curvature, and return a straight, front-facing, full-bleed production canvas."
          : "You are a forensic print-artwork recovery engine. The reference image is authoritative for design content, but photographed geometry is not authoritative. Always remove camera tilt, keystone perspective, fabric sag, folds, and curvature. Render the recovered design as a straight, front-facing, axis-aligned, full-bleed production canvas with no photographed border or triangular corner gaps. Preserve supported visual evidence exactly, perform only the requested edit, and never replace detailed artwork with a flat color or generic design.",
        num_images: 1,
        output_format: "png",
        resolution: "2K",
        // Background clean-plate requests commonly contain sports mascots and
        // team marks. Fal supports level 6 for benign edits that are otherwise
        // prone to false-positive moderation blocks.
        safety_tolerance: backgroundOnly ? "6" : "4",
        limit_generations: true,
      },
      logs: true,
      onEnqueue: id => { requestId = id; },
    });
    const image = result?.data?.images?.[0];
    if (!image?.url) throw new Error("Recovery model did not return an image.");
    return { ...image, requestId: result?.requestId || requestId || null };
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

async function saturatedColorStats(buffer, width, height) {
  const { data, info } = await sharp(buffer)
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sums = [0, 0, 0];
  const squares = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const hi = Math.max(...rgb);
    const lo = Math.min(...rgb);
    const light = (hi + lo) / 2;
    // Ignore white/black scene pixels and neutral text. The remaining pixels
    // represent the printable design palette more reliably.
    if (light < 20 || light > 238 || hi - lo < 12) continue;
    for (let c = 0; c < 3; c++) {
      sums[c] += rgb[c];
      squares[c] += rgb[c] * rgb[c];
    }
    count++;
  }
  if (count < 100) return null;
  const mean = sums.map(value => value / count);
  const stdev = squares.map((value, c) => Math.sqrt(Math.max(1, value / count - mean[c] * mean[c])));
  return { mean, stdev };
}

async function dominantSourcePalette(sourceBuffer, maxColors = 18) {
  const { data, info } = await sharp(sourceBuffer)
    .rotate()
    .resize(192, 192, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bin.count++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  return [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map(bin => [bin.r / bin.count, bin.g / bin.count, bin.b / bin.count]);
}

function colorDistance(rgb, candidate) {
  const [r, g, b] = rgb;
  const [cr, cg, cb] = candidate;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cy = 0.299 * cr + 0.587 * cg + 0.114 * cb;
  const blue = b - y;
  const candidateBlue = cb - cy;
  const red = r - y;
  const candidateRed = cr - cy;
  return (y - cy) ** 2 * 0.7
    + (blue - candidateBlue) ** 2 * 1.35
    + (red - candidateRed) ** 2 * 1.35;
}

async function remapToSourcePalette(buffer, sourceBuffer, width, height) {
  const palette = await dominantSourcePalette(sourceBuffer);
  if (!palette.length) return buffer;
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(width, height, { fit: "cover", position: "centre", kernel: sharp.kernel.lanczos3 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Precompute a compact 5-bit RGB lookup table. Each output pixel keeps its
  // luminance variation but inherits hue/chroma from a dominant source color.
  const lookup = new Uint8Array(32 * 32 * 32 * 3);
  for (let r5 = 0; r5 < 32; r5++) {
    for (let g5 = 0; g5 < 32; g5++) {
      for (let b5 = 0; b5 < 32; b5++) {
        const rgb = [r5 * 8 + 4, g5 * 8 + 4, b5 * 8 + 4];
        let best = palette[0];
        let bestDistance = Infinity;
        for (const candidate of palette) {
          const distance = colorDistance(rgb, candidate);
          if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
          }
        }
        const index = (((r5 << 10) | (g5 << 5) | b5) * 3);
        lookup[index] = Math.round(best[0]);
        lookup[index + 1] = Math.round(best[1]);
        lookup[index + 2] = Math.round(best[2]);
      }
    }
  }

  for (let i = 0; i < data.length; i += info.channels) {
    const key = (((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)) * 3;
    const sourceLuma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const paletteLuma = 0.299 * lookup[key] + 0.587 * lookup[key + 1] + 0.114 * lookup[key + 2];
    const luminanceScale = Math.max(0.72, Math.min(1.28, sourceLuma / Math.max(8, paletteLuma)));
    data[i] = Math.min(255, Math.round(lookup[key] * luminanceScale));
    data[i + 1] = Math.min(255, Math.round(lookup[key + 1] * luminanceScale));
    data[i + 2] = Math.min(255, Math.round(lookup[key + 2] * luminanceScale));
  }
  return sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
}

async function lockOutputToSource(buffer, sourceBuffer, width, height, matchPalette) {
  // Preserve geometry. Provider outputs use a finite set of aspect ratios, so
  // `fill` can squash long labels and lanyards into a solid-looking strip.
  if (matchPalette) {
    return remapToSourcePalette(buffer, sourceBuffer, width, height);
  }
  return sharp(buffer)
    .rotate()
    .resize(width, height, { fit: "cover", position: "centre", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toBuffer();
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
  const { data: project } = await adminSupabase.from("projects").select("canvas_data").eq("id", projectId).eq("user_id", userId).single();
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
  }).eq("id", projectId).eq("user_id", userId);
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
    userId = user.id;
    const limit = await enforceRateLimit({ namespace: "api:recovery:generate", identifier: user.id, max: 3, window: "60 s", windowMs: 60_000 });
    if (!limit.success) return limit.response;

    ({ projectId } = await request.json());
    const { data: project } = await adminSupabase.from("projects").select("*").eq("id", projectId).eq("user_id", user.id).single();
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
      .eq("id", projectId).eq("user_id", user.id)
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
        metadata: { route: "api/recovery/generate", mode: recovery.mode || project.ai_prompt || null },
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
    if (!isOwnedStorageUrl(sourceUrl, { userId: user.id, projectId }) || !(await validateUrlForSSRF(sourceUrl, { allowedHosts: getAllowedStorageHosts() }))) throw new Error("Invalid source image URL");
    const source = await fetchRecoveryAsset(sourceUrl, {
      allowedHosts: getAllowedStorageHosts(),
      maxBytes: DEFAULT_MAX_IMAGE_BYTES,
      allowedContentTypes: ["image/"],
    }, "Source image");
    const sourceMeta = await sharp(source.buffer).metadata();
    const sourceWidth = sourceMeta.width;
    const sourceHeight = sourceMeta.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Could not read cropped reference dimensions.");
    const analysis = normalizeRecoveryAnalysis(recovery.analysis);
    const recoveryMode = recovery.mode || project.ai_prompt;
    const prompt = buildRecoveryPrompt({ analysis, mode: recoveryMode, sourceWidth, sourceHeight });
    const backgroundOnly = recoveryMode === "UNIVERSAL_BACKGROUND_ONLY";
    const keepArtwork = !backgroundOnly;
    const needsStructuralReconstruction = ["parallel_strips", "cylindrical_label", "packaging_panels"].includes(analysis.layout_strategy)
      || [analysis.perspective, analysis.curvature, analysis.folds].includes("high");
    const hasNoDetectedDistortion = [analysis.perspective, analysis.curvature, analysis.folds, analysis.reflections]
      .every(value => value === "none");
    const directSourceLayouts = ["flat_rectangle", "long_strip", "sticker_decal", "large_format_rectangle", "unknown"];
    const canPreserveSourceDirectly = keepArtwork
      && hasNoDetectedDistortion
      && !needsStructuralReconstruction
      && directSourceLayouts.includes(analysis.layout_strategy)
      && analysis.visible_coverage >= 85;
    // The crop ratio describes the photographed view; the analyzed ratio
    // describes the intended flat printable plane. Keep the latter through
    // generation and post-processing so perspective correction is not undone.
    const generationAspectRatio = analysis.aspect_ratio || "auto";

    let finalImage = null;
    let downloaded = { buffer: source.buffer };
    let generationPasses = 0;
    let validationCalls = 0;
    let foregroundDetectionCalls = 0;
    let successfulForegroundDetectionCalls = 0;
    let maskedRegionCount = 0;
    let validation;

    if (canPreserveSourceDirectly) {
      // A clean, already-flat crop is more exact than any generative redraw.
      // Passing it through keeps narrow labels, small text, logos, and patterns
      // pixel-faithful; Step 2 still performs the normal production upscale.
      validation = {
        pass: true,
        usable_partial: false,
        failures: [],
        source_passthrough: true,
        correction: "",
      };
    } else {
      if (backgroundOnly) {
        // Match the stable garment-pattern extractor: one Fal edit performs
        // flattening and foreground removal without blocking vision stages.
        finalImage = await runEdit(
          [source.finalUrl],
          `${prompt}\nCLEAN-PLATE BACKGROUND EXTRACTION:\nCreate one flat rectangle filled edge-to-edge with the source's abstract background design. Omit the photographed carrier and surrounding scene, along with overlaid typography, numerals, badges, mascots, emblems, and focal foreground illustrations. Continue the immediately adjacent background colors, stripes, camouflage shapes, gradients, halftones, textures, and pattern geometry naturally through the cleared areas. Preserve the original palette, asymmetric layout, stripe count, shape placement, and pattern density. Correct photographed tilt, perspective, sag, curvature, and folds. Return only the straight, front-facing, print-ready background layer without blank patches or newly invented focal artwork.`,
          generationAspectRatio,
          true,
          "background-pattern extraction",
        );
        generationPasses = 1;
      } else {
        finalImage = await runEdit(
          [source.finalUrl],
          `${prompt}\nONE-PASS RECOVERY: complete the requested flattening and extraction directly from this reference. Preserve every supported line, texture, pattern, edge, color boundary, and visible text or graphic. Geometrically rectify the complete printable plane before rendering: it must face the viewer squarely, fill the canvas edge-to-edge, and have perfectly horizontal top/bottom axes and perfectly vertical left/right axes. Remove all source tilt, rotation, keystone, folds, fabric sag, and curvature. Do not leave white, black, transparent, or blank triangular wedges at any corner, and do not keep a photographed slanted outer edge. Do not return a blank, generic, simplified, or near-solid replacement.`,
          generationAspectRatio,
          false,
          "artwork-recovery stage",
        );
        generationPasses = 1;
      }
      downloaded = await fetchRecoveryAsset(finalImage.url, {
        allowedHosts: getAllowedProviderHosts(),
        maxBytes: DEFAULT_MAX_IMAGE_BYTES,
        allowedContentTypes: ["image/"],
      }, "Generated image");
      await recordProviderUsage({
        creditTransactionId: chargeTransactionId,
        projectId,
        userId,
        provider: "fal",
        endpoint: "fal-ai/nano-banana-pro/edit",
        providerRequestId: finalImage.requestId || null,
        estimatedCostUsd: 0.15,
        isOwnerTest,
        metadata: { operation: "universal_design_recovery", mode: recoveryMode },
      });
      const retention = await contentRetentionCheck(source.buffer, downloaded.buffer);
      if (retention.collapsed) {
        validation = {
          pass: false,
          usable_partial: false,
          failures: ["content_collapse"],
          correction: "The generated flatten collapsed detailed artwork into a flat color.",
        };
      } else {
        validation = {
          pass: true,
          usable_partial: false,
          failures: [],
          local_validation: true,
          correction: "",
        };
      }
    }

    validation = normalizeValidation(validation);
    if (backgroundOnly) {
      validation = {
        ...validation,
        foreground_detection_calls: foregroundDetectionCalls,
        successful_foreground_detection_calls: successfulForegroundDetectionCalls,
        masked_regions: maskedRegionCount,
        image_generation_calls: generationPasses,
      };
    }
    const hasHardFailure = keepArtwork
      ? shouldFallbackToSource(validation.failures)
      : shouldRejectBackgroundOnly(validation.failures);
    if (!validation.pass && hasHardFailure) {
      if (keepArtwork) {
        // A failed flatten never replaces customer artwork. Preserve the exact
        // source crop and continue through the normal free upscale/vector steps.
        downloaded = { buffer: source.buffer };
        validation = {
          ...validation,
          pass: false,
          usable_partial: true,
          source_fallback: true,
          released_best_effort: true,
          correction: sourceFallbackCorrection(validation.failures),
        };
      } else {
        const validationError = new Error(`${backgroundOnlyFailureMessage(validation.failures)} ${CREDIT_COST.universal} Syncraft credits will be refunded; no additional retry was launched.`);
        validationError.code = "BACKGROUND_ONLY_VALIDATION_FAILED";
        validationError.status = 422;
        validationError.validation = validation;
        throw validationError;
      }
    }

    // Non-destructive imperfections may still be released as partial.
    // Validation never triggers another paid generation.
    if (!validation.pass) {
      validation = {
        ...validation,
        pass: false,
        usable_partial: true,
        released_best_effort: true,
      };
    }
    // Preserve the exact provider bytes, just like the garment extraction
    // pipeline. The fal output is the Flat Extract source of truth; resizing,
    // cropping, palette locking, or PNG re-encoding here makes the workspace
    // preview differ from the successful image shown in the fal request log.
    let exactOutput = downloaded.buffer;
    if (keepArtwork) {
      const finalRetention = await contentRetentionCheck(source.buffer, exactOutput);
      if (finalRetention.collapsed) {
        exactOutput = source.buffer;
        validation = {
          ...validation,
          pass: false,
          usable_partial: true,
          source_fallback: true,
          released_best_effort: true,
          failures: [...new Set([...(validation.failures || []), "content_collapse"])],
          correction: "The resized flatten lost detail, so Syncraft preserved the exact source crop instead.",
        };
      }
    }
    await adminSupabase.from("projects").update({
      canvas_data: {
        ...(project.canvas_data || {}),
        universal_recovery: {
          ...recovery,
          status: validation.pass ? "validated" : "partial",
          validation,
          retry_count: 0,
          costs: {
            analysis_calls: 1,
            image_generation_calls: generationPasses,
            validation_calls: validationCalls,
            foreground_detection_calls: foregroundDetectionCalls,
            masked_regions: maskedRegionCount,
            charged_credits: CREDIT_COST.universal,
          },
        },
      },
    }).eq("id", projectId).eq("user_id", user.id);

    await markCreditTransaction({
      transactionId: chargeTransactionId,
      status: "succeeded",
      metadata: { recovery_status: validation.pass ? "complete" : "partial" },
    });

    return NextResponse.json({
      success: true,
      base64: exactOutput.toString("base64"),
      mimeType: downloaded.response?.headers.get("content-type")?.split(";")[0] || "image/png",
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
