import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { chargeCreditsVerified, findLatestProjectCharge, markCreditTransaction, recordProviderUsage, refundCreditVerified } from "@/lib/creditLedger";
import { fetchWithRetry } from "@/lib/fetchWithRetry";
import { CREDIT_COST } from "@/lib/pricing";
import { enforceRateLimit } from "@/lib/rateLimit";
import { DEFAULT_MAX_IMAGE_BYTES, fetchWithSSRFProtection, getAllowedProviderHosts, getAllowedStorageHosts, isOwnedStorageUrl, normalizeUserImageUrl, validateUrlForSSRF } from "@/lib/ssrf";
import { snapToAllowedAspectRatio } from "@/lib/aspectRatio";
import { buildGarmentExtractionInput, garmentExtractionMode, shouldSaveGarmentExtractionServerSide } from "@/lib/garmentExtractionConfig.mjs";
import { buildGarmentExtractionPrompt, buildGarmentExtractionSystemPrompt, resolveGarmentPromptMode } from "@/lib/garmentPromptRules.mjs";
import { uploadToR2 } from "@/lib/cloudflare";
import { usesNativeTraceUpscale, resizeTraceForUpscale } from "@/lib/traceUpscale.mjs";

// IMPORTANT: Must use Node.js runtime (not edge) so we get real 120s timeouts.
// Edge runtime on Vercel has a hard 30s cap which causes all Gemini generations to fail.
export const runtime = 'nodejs';
export const maxDuration = 120; // Vercel Pro plan allows up to 300s; 120s is safe

export async function POST(request) {
  let projectId;
  let userId;
  // Hoisted out of the try so the catch block can tell which step failed.
  // Only step 1 charges credits, so only step 1 may refund — see the catch block.
  let step;
  let skipRefund = false;
  let chargeTransactionId = null;
  let isOwnerTest = false;
  try {
    // ─── Auth: verify caller identity server-side ─────────────────────────────
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: invalid session' }, { status: 401 });
    }
    userId = user.id;

    const rateLimit = await enforceRateLimit({
      namespace: "api:trace:user",
      identifier: userId,
      max: 6,
      window: "60 s",
      windowMs: 60_000,
    });
    if (!rateLimit.success) return rateLimit.response;
    // ─────────────────────────────────────────────────────────────────────────

    const body = await request.json();
    projectId = body.projectId;
    step = body.step;
    // Set by callers re-running a stage on an already-paid project (e.g. after
    // Extend Design). Declining a refund can never gain the caller credits, so
    // it is safe to honour from the client.
    skipRefund = body.skipRefund === true;
    const { croppedImageUrl } = body;

    if (!projectId || !step) {
      return NextResponse.json({ error: "Missing required fields (projectId, step)" }, { status: 400 });
    }

    // Fetch project AND verify ownership in one query — prevents IDOR attacks
    const { data: project, error: projError } = await adminSupabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id) // ← ownership check: users can only trace their own projects
      .single();

    if (projError || !project) {
      // Log the denial — this branch covers "row missing", "owned by someone
      // else" and "malformed id" alike, which are indistinguishable from the
      // client's 404 and previously left no server-side trace.
      console.warn(
        `[Trace] Ownership check failed — projectId=${projectId} requestUser=${user.id} dbError=${projError?.message || 'none'}`
      );
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    // HARD BLOCK: project must belong to a real user
    if (!project.user_id) {
      return NextResponse.json({ error: "Project has no owner. Please re-upload your image." }, { status: 403 });
    }

    let sourceUrl;
    let rawSourceBuffer;
    if (step === 1) {
      sourceUrl = normalizeUserImageUrl(croppedImageUrl || project.original_image_url, new URL(request.url).origin);
      if (!isOwnedStorageUrl(sourceUrl, { userId: user.id, projectId }) || !(await validateUrlForSSRF(sourceUrl, { allowedHosts: getAllowedStorageHosts() }))) {
        return NextResponse.json({ error: "Invalid or unauthorized image URL" }, { status: 400 });
      }
      let sourceFetch;
      try {
        sourceFetch = await fetchWithSSRFProtection(sourceUrl, {
          allowedHosts: getAllowedStorageHosts(),
          maxBytes: DEFAULT_MAX_IMAGE_BYTES,
          allowedContentTypes: ['image/'],
        });
      } catch (sourceErr) {
        console.warn(`[Trace] Blocked or failed source image fetch for project ${projectId}:`, sourceErr.message);
        return NextResponse.json({ error: "Invalid or unauthorized image URL" }, { status: 400 });
      }
      if (!sourceFetch.response.ok) throw new Error("Failed to fetch source image");
      rawSourceBuffer = sourceFetch.buffer;
      sourceUrl = sourceFetch.finalUrl;
    }

    // Deduction and the project-linked ledger receipt are committed together.
    if (step === 1) {
      try {
        const charge = await chargeCreditsVerified({
          userId: project.user_id,
          projectId,
          feature: "garment_logo_extract",
          action: "Extract & Vectorize",
          amount: CREDIT_COST.trace,
          metadata: { route: "api/trace", step: 1, trace_type: project.trace_type || null },
        });
        chargeTransactionId = charge.transactionId;
        isOwnerTest = charge.isOwnerTest;
      } catch (billingError) {
        if (billingError.code === "INSUFFICIENT_CREDITS" || billingError.code === "PROFILE_NOT_FOUND") {
          return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 403 });
        }
        console.error("[Billing] Verified deduction failed:", billingError);
        return NextResponse.json({ error: "Billing error. Please try again." }, { status: 500 });
      }

      // Surface failures here — this flag is what makes the refund path in the
      // catch block eligible, so losing it silently means the user is charged
      // with no way to be refunded.
      const { error: flagErr } = await adminSupabase
        .from('projects')
        .update({ credit_deducted: true })
        .eq('id', projectId)
        .eq('user_id', user.id);
      if (flagErr) {
        console.error(`[Billing] Could not set credit_deducted for project ${projectId}:`, flagErr.message);
      }
    }

    if (step === 1) {
      // ==========================================
      // STAGE 1: Extract with Nano Banana Pro
      // ==========================================

      // Read image metadata to calculate the closest allowed aspect ratio for fal.ai
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(rawSourceBuffer).metadata();

      // Calculate closest aspect ratio for fal.ai Nano Banana Pro
      const targetAspectRatio = snapToAllowedAspectRatio(metadata?.width, metadata?.height);

      let prompt = "";
      const promptMode = resolveGarmentPromptMode(project);
      if (project) {
        if (promptMode === 'LOGO_FLATTEN') {
          prompt = `You are a FORENSIC LOGO REPRODUCTION ARTIST. Your task is to create a 100% pixel-accurate, flat vector-ready copy of the logo in this reference image. You are NOT allowed to be creative. You are NOT allowed to simplify, stylize, or interpret. Copy it EXACTLY.

== ACCURACY IS THE ONLY RULE (TARGET: 99%+ MATCH) ==
- Reproduce the logo with MATHEMATICAL EXACTNESS. Every shape, curve, angle, and proportion must be a perfect copy of the reference.
- Every color must be the EXACT same solid flat color as the reference. Do not shift the hue. Do not change the lightness. Copy it exactly.
- If the logo has multiple color layers or regions, reproduce ALL of them in their exact positions, sizes, and proportions.
- ZERO HALLUCINATION: Do not add any element that does not exist in the reference. Do not remove any element that does exist.

== TEXT & TYPOGRAPHY \u2014 ABSOLUTE RULE: COPY VERBATIM ==
- If the logo contains any text, letterforms, numbers, or words \u2014 reproduce EVERY SINGLE CHARACTER EXACTLY as written.
- Same font style, same weight (bold/thin/italic), same letter-spacing, same capitalization, same arrangement.
- Do NOT autocorrect spelling. Do NOT rewrite any word. Do NOT change any letter's shape.
- Even if the font looks unusual or custom, copy the letterforms exactly as they appear.

== ELEMENTS TO PRESERVE \u2014 ALL OF THEM ==
- Every icon, symbol, mascot, crest, shield, crown, star, swoosh, and decorative element.
- Every border, outline, ring, frame, and inner detail stroke.
- Every secondary piece of text: taglines, year numbers, location text, sub-brand text.

== BACKGROUND ==
- Preserve the original background exactly (transparent, white, or solid color).
- Do NOT add shadows, glows, gradients, or decorative borders that are not in the original.

== FINISHING ==
- Strip out all fabric texture, photo noise, compression artifacts, lighting shadows, and 3D shading.
- Output only pure, clean, flat solid colors \u2014 as if redrawn in Adobe Illustrator from scratch.
- Maintain the exact original proportions and centering.

== SHAPE PLACEMENT LOCK ==
- Divide the logo into a 3x3 grid. Every element must be in the correct grid cell matching the reference.
- Do NOT drift, shift, or reposition any element. Position accuracy is as important as color accuracy.

== ADDITIONAL: EXACT GEOMETRY PRESERVATION — ZERO TOLERANCE ==
You are now operating as a FORENSIC GEOMETRY ENGINE. Every polygon in the original image has a specific shape. You must preserve it with absolute precision.
- Preserve every original polygon, every angle, every corner, every cut, every notch, every diagonal, every intersection, every edge, every offset, every taper, every thickness, every spacing, every proportion, every alignment, every symmetry.
- No approximations. No simplification. No smoothing. No redesign. Zero tolerance for invented geometry.

== ADDITIONAL: EXACT SHAPE MATCHING ==
- Every visible shape must be reconstructed exactly as it appears in the reference.
- Every boundary, border, and outline must keep identical dimensions and angles.
- Every clipped corner, beveled edge, notch, and internal contour must be reproduced faithfully.
- Nothing may be guessed. Nothing may be replaced. Nothing may be stylized.

== ADDITIONAL: FORCE PIXEL ANALYSIS (MANDATORY) ==
- Inspect the image pixel-by-pixel. Analyze at maximum zoom.
- Compare neighboring pixels. Trace every color boundary. Follow every edge transition.
- Reconstruct directly from observed pixels.
- Never infer missing shapes. Never hallucinate geometry. Never invent symmetry. Never "clean up" irregularities.

== ADDITIONAL: VECTOR TRACE MODE ==
Behave like Adobe Illustrator Image Trace combined with manual Pen Tool tracing — not like an illustrator, not a concept artist, not a designer.
- Every path must follow the original image exactly. No artistic interpretation whatsoever.

== ADDITIONAL: MICRO DETAILS — MUST SURVIVE ==
Preserve all of the following without exception:
- micro details, tiny bevels, tiny chamfers, small clipped corners, micro offsets, hidden intersections, partial shapes, cropped polygons, thin connectors, tiny angular cuts, subtle breaks, edge discontinuities.
Every one of these must survive extraction intact.

== ADDITIONAL: COLOR REGION PRESERVATION ==
- Never merge two adjacent regions, even if they appear similar in color.
- Every color island must remain independent. Every boundary must remain intact.
- Do not average colors. Keep every distinct region separate.

== ADDITIONAL: TOPOLOGY LOCK ==
- Preserve the exact topology of the original artwork.
- The number of visible shapes in the output should remain nearly identical to the original.
- Do not reduce complexity. Do not merge polygons unless required by the source.

== ADDITIONAL: STRUCTURAL FIDELITY OVER CLEANLINESS ==
- Prioritize structural fidelity over visual cleanliness.
- Never beautify. Never improve. Never redesign. Only reconstruct.

== ADDITIONAL: ANTI-HALLUCINATION — STRICT EVIDENCE ONLY ==
- If any shape is partially obscured, reconstruct it ONLY from visible evidence.
- Never fabricate hidden geometry. Never invent missing edges. Never replace unknown details with generic patterns.

== ADDITIONAL: FINAL VALIDATION (MANDATORY BEFORE OUTPUT) ==
Before producing the final output, internally compare your reconstruction against the original image.
Verify: overall geometry, every polygon, every shape, every angle, every border, every spacing, every notch, every layer, every color region, every intersection.
If any difference is detected, continue refining until the reconstruction is visually indistinguishable from the original.`;

        } else {
          prompt = buildGarmentExtractionPrompt(promptMode === 'ERASE_LOGOS' ? 'ERASE_LOGOS' : 'PRESERVE_LOGOS');
        }

      }

      let generatedImageBuffer;
      let generatedMimeType = "image/png";
      let geminiThinking = "Generated via OpenRouter Gemini 3.1 Flash Image";
      let extractionMode;

      try {
        if (!process.env.FAL_KEY) {
          throw new Error("FAL_KEY is missing in environment variables. Please add it to your .env file.");
        }

        const { fal } = await import("@fal-ai/client");

        let finalImageUrl = sourceUrl;

        console.log("[fal.ai Input URL]:", finalImageUrl);

        // ── Step 1: Extract flat design directly using nano-banana-pro/edit ──
        // Feed original source image directly — no pre-upscale step.
        // Flow: Extract → Upscale (step 2) → Vectorize (step 3)
        console.log("[API Step 1] Extracting flat design with fal.ai (nano-banana-pro/edit)...");

        extractionMode = garmentExtractionMode();
        const extractionInput = buildGarmentExtractionInput({
          imageUrl: finalImageUrl,
          prompt,
          aspectRatio: targetAspectRatio,
          mode: extractionMode,
        });
        if (project.trace_type === "mockup") extractionInput.system_prompt = buildGarmentExtractionSystemPrompt();
        console.log("[API Step 1] Garment extraction configuration:", {
          mode: extractionMode,
          resolution: extractionInput.resolution || "provider-default",
          outputFormat: extractionInput.output_format || "provider-default",
          aspectRatio: targetAspectRatio,
          promptMode,
        });

        const result = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
          input: extractionInput,
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS") {
              update.logs.map((log) => log.message).forEach(console.log);
            }
          },
        });

        await recordProviderUsage({
          creditTransactionId: chargeTransactionId,
          projectId,
          userId,
          provider: "fal",
          endpoint: "fal-ai/nano-banana-pro/edit",
          providerRequestId: result?.requestId || null,
          estimatedCostUsd: 0.15,
          isOwnerTest,
        });

        console.log("[fal.ai RAW Response]:", JSON.stringify(result, null, 2));

        if (!result || !result.data || !result.data.images || result.data.images.length === 0) {
          throw new Error("fal.ai did not return a valid image URL. Response: " + JSON.stringify(result));
        }

        const outputUrl = result.data.images[0].url;
        let downloadedImage;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            downloadedImage = await fetchWithSSRFProtection(outputUrl, {
              allowedHosts: getAllowedProviderHosts(),
              maxBytes: DEFAULT_MAX_IMAGE_BYTES,
              timeoutMs: 10_000,
              allowedContentTypes: ['image/'],
            });
            break;
          } catch (downloadError) {
            const isNetworkFailure = downloadError?.message === "fetch failed"
              || downloadError?.name === "AbortError";
            if (!isNetworkFailure || attempt === 1) throw downloadError;
            console.warn("[API Step 1] Generated image download interrupted; retrying once.");
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        const { response: imgRes, buffer: generatedBuffer } = downloadedImage;
        if (!imgRes.ok) throw new Error("Failed to download generated image from fal.ai URL");

        generatedImageBuffer = generatedBuffer;
        generatedMimeType = result.data.images[0].content_type || "image/jpeg";
        geminiThinking = "Generated via fal.ai Nano Banana Pro Edit";
        await markCreditTransaction({
          transactionId: chargeTransactionId,
          status: "provider_succeeded",
          metadata: { provider: "fal", endpoint: "fal-ai/nano-banana-pro/edit" },
        });

      } catch (err) {
        console.error("[fal.ai Error]:", err);
        if (err.body && err.body.detail) {
          console.error("[fal.ai Error Detail]:", JSON.stringify(err.body.detail, null, 2));
        }
        // Keep the provider status/code when crossing into the route-level
        // billing handler. Previously a 403 was flattened into the literal
        // message "Forbidden", so the UI could neither explain the failure nor
        // distinguish it from an expired provider credential.
        const detailMessage = Array.isArray(err?.body?.detail)
          ? err.body.detail
              .map(item => item?.msg || item?.message || String(item))
              .filter(Boolean)
              .join("; ")
          : typeof err?.body?.detail === "string"
            ? err.body.detail
            : null;
        const providerMessage = [
          err?.body?.message,
          err?.body?.error,
          detailMessage,
          err?.message,
        ].find(value => typeof value === "string" && value.trim())?.trim()
          || "The image provider rejected the request.";
        const providerError = new Error(providerMessage);
        providerError.status = Number(err?.status) || 502;
        const isBalanceLock = providerError.status === 403
          && /exhausted\s+balance|user\s+is\s+locked|top\s+up|billing/i.test(providerMessage);
        const isNetworkFailure = err?.message === "fetch failed"
          || err?.cause?.code === "UND_ERR_CONNECT_TIMEOUT"
          || err?.name === "AbortError";
        providerError.code = isBalanceLock
          ? "FAL_BALANCE_EXHAUSTED"
          : providerError.status === 401
          ? "FAL_AUTH_FAILED"
          : providerError.status === 403
            ? "FAL_REQUEST_FORBIDDEN"
            : isNetworkFailure
              ? "FAL_NETWORK_FAILED"
            : "FAL_GENERATION_FAILED";
        providerError.providerRequestId = err?.requestId || null;
        throw providerError;
      }

      if (shouldSaveGarmentExtractionServerSide(extractionMode)) {
        const extension = generatedMimeType === "image/jpeg" ? "jpg" : "png";
        const fileName = `projects/${projectId}/generated_flat_${Date.now()}.${extension}`;
        const fileUrl = await uploadToR2(generatedImageBuffer, fileName, generatedMimeType);
        const { error: saveError } = await adminSupabase
          .from("projects")
          .update({
            generated_image_url: fileUrl,
            ai_prompt: null,
            zip_url: null,
            zip_signature: null,
            zip_generated_at: null,
          })
          .eq("id", projectId)
          .eq("user_id", user.id);
        if (saveError) throw new Error(`Could not save flat extract: ${saveError.message}`);

        console.log("[API Step 1] Saved enhanced extract directly to storage.");
        return NextResponse.json({
          success: true,
          step: 1,
          alreadySaved: true,
          fileUrl,
          mimeType: generatedMimeType,
          thinking: geminiThinking,
        });
      }

      return NextResponse.json({
        success: true,
        step: 1,
        base64: generatedImageBuffer.toString('base64'),
        mimeType: generatedMimeType,
        thinking: geminiThinking,
      });
    }

    if (step === 2) {
      // ==========================================
      // STAGE 2: ESRGAN 4x HD upscale
      // ==========================================
      // Both garment modes use ESRGAN. Universal background recovery retains
      // its existing native resize path.
      // ==========================================
      if (!project.generated_image_url || project.generated_image_url === 'REFUNDED') {
        return NextResponse.json({ error: "Step 1 (Auto-Trace) must be completed before upscaling." }, { status: 403 });
      }
      const upscaleInputUrl = normalizeUserImageUrl(project.generated_image_url, new URL(request.url).origin);
      if (!isOwnedStorageUrl(upscaleInputUrl, { userId: user.id, projectId }) || !(await validateUrlForSSRF(upscaleInputUrl, { allowedHosts: getAllowedStorageHosts() }))) {
        return NextResponse.json({ error: "Invalid or unauthorized generated image URL" }, { status: 400 });
      }

      if (usesNativeTraceUpscale(project)) {
        console.log("[API Step 2] Creating fidelity-safe, palette-preserving 4x PNG...");
        const { response, buffer: inputBuffer } = await fetchWithSSRFProtection(upscaleInputUrl, {
          allowedHosts: getAllowedStorageHosts(),
          maxBytes: DEFAULT_MAX_IMAGE_BYTES,
          allowedContentTypes: ['image/'],
        });
        if (!response.ok) throw new Error("Failed to fetch generated image for lossless upscale");

        const upscaledBuffer = await resizeTraceForUpscale(inputBuffer);

        const fileName = `projects/${projectId}/upscaled_${Date.now()}.png`;
        const finalUrl = await uploadToR2(upscaledBuffer, fileName, "image/png");
        const { error: saveError } = await adminSupabase.from('projects')
          .update({ upscaled_image_url: finalUrl, zip_url: null, zip_signature: null, zip_generated_at: null })
          .eq('id', projectId)
          .eq('user_id', user.id);
        if (saveError) throw new Error(`Could not save palette-preserving upscale: ${saveError.message}`);

        return NextResponse.json({ success: true, step: 2, fileUrl: finalUrl, mimeType: "image/png", alreadySaved: true, palettePreserved: true, fidelitySafe: true });
      }

      if (!process.env.FAL_KEY) throw new Error("FAL_KEY is missing in environment variables.");
      const { fal } = await import("@fal-ai/client");
      console.log("[API Step 2] Upscaling with fal-ai/esrgan...");
      const upscalerResult = await fal.subscribe("fal-ai/esrgan", {
        input: { image_url: upscaleInputUrl, scale: 4 },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") update.logs?.map((log) => log.message).forEach(console.log);
        },
      });

      const traceCharge = await findLatestProjectCharge(projectId);
      await recordProviderUsage({
        creditTransactionId: traceCharge?.transactionId || null,
        projectId,
        userId,
        provider: "fal",
        endpoint: "fal-ai/esrgan",
        providerRequestId: upscalerResult?.requestId || null,
        isOwnerTest: traceCharge?.isOwnerTest === true,
      });

      console.log("[ESRGAN RAW Response]:", JSON.stringify(upscalerResult?.data, null, 2));
      const upscaledUrl = upscalerResult?.data?.image?.url || upscalerResult?.data?.image_url;
      if (!upscaledUrl) {
        throw new Error("fal-ai/esrgan did not return a valid image URL. Response: " + JSON.stringify(upscalerResult));
      }

      const upscaledMimeType = upscalerResult?.data?.image?.content_type || "image/jpeg";

      return NextResponse.json({ success: true, step: 2, fileUrl: upscaledUrl, mimeType: upscaledMimeType });

    }

    return NextResponse.json({ error: "Invalid step parameter" }, { status: 400 });

  } catch (error) {
    console.error(`[Trace API Error]:`, error.message);

    const failedCharge = chargeTransactionId
      ? { transactionId: chargeTransactionId, isOwnerTest }
      : await findLatestProjectCharge(projectId);
    if (failedCharge && (step === 1 || step === 2)) {
      await recordProviderUsage({
        creditTransactionId: failedCharge.transactionId,
        projectId,
        userId,
        provider: "syncraft_pipeline",
        endpoint: `trace-step-${step}`,
        requestStatus: "failed",
        isOwnerTest: failedCharge.isOwnerTest === true,
        metadata: { error: String(error.message || "Unknown trace error").slice(0, 500) },
      });
    }

    // Only mark the project refunded after the linked atomic refund confirms
    // that the user's balance and refund receipt were both updated.
    let refundIssued = false;
    try {
      if (projectId && chargeTransactionId && step === 1 && !skipRefund) {
        const refund = await refundCreditVerified({
          chargeTransactionId,
          reason: error.message,
          action: "Refund: Extract & Vectorize (Error)",
          metadata: { route: "api/trace", step: 1 },
        });
        refundIssued = refund.refunded;
        if (refundIssued) {
          await adminSupabase
            .from('projects')
            .update({
              generated_image_url: 'REFUNDED',
              refunded: true,
            })
            .eq('id', projectId)
            .eq('user_id', userId);
        }
      }
    } catch (refundErr) {
      console.error(`[Billing] Refund failed:`, refundErr.message);
    }

    // Extract the actual error message from fal-ai/client ApiError objects
    let actualErrorMsg = error.message;
    if (!actualErrorMsg && error.body) {
      if (Array.isArray(error.body.detail) && error.body.detail[0]?.msg) {
        actualErrorMsg = error.body.detail[0].msg;
      } else if (typeof error.body.detail === 'string') {
        actualErrorMsg = error.body.detail;
      } else {
        actualErrorMsg = JSON.stringify(error.body);
      }
    }

    console.error(`[Trace API Error]:`, actualErrorMsg || error);

    // Never expose raw internal error messages (API keys, stack traces) to the client
    const isProviderAuthError = error.code === "FAL_AUTH_FAILED"
      || actualErrorMsg?.includes('FAL_KEY')
      || actualErrorMsg === 'Unauthorized';
    const isProviderBalanceExhausted = error.code === "FAL_BALANCE_EXHAUSTED";
    const isProviderForbidden = error.code === "FAL_REQUEST_FORBIDDEN";
    const isProviderNetworkFailure = error.code === "FAL_NETWORK_FAILED";
    const safeMessage = isProviderBalanceExhausted
      ? `AI generation is temporarily unavailable because the provider balance is exhausted. ${refundIssued
          ? 'Your credit has been refunded automatically. Please try again after service is restored.'
          : 'Please contact support; your credit could not be refunded automatically.'}`
      : isProviderAuthError
      ? `AI provider authentication failed (Unauthorized/Keys). ${refundIssued
          ? 'Your credit has been refunded automatically.'
          : 'Your credit could NOT be refunded automatically — please contact support.'}`
      : isProviderForbidden
        ? `The AI provider could not process this artwork. ${refundIssued
            ? 'Your credit has been refunded automatically. Please retry once or use a tighter crop.'
            : 'Please retry once or use a tighter crop.'}`
      : isProviderNetworkFailure
        ? `The image provider connection was interrupted. ${refundIssued
            ? 'Your credit has been refunded automatically. Please try again.'
            : 'Please try again. If a credit was deducted, contact support.'}`
      : (actualErrorMsg || 'Failed to process trace step');
    return NextResponse.json({
      error: safeMessage,
      code: error.code || "TRACE_FAILED",
      refunded: refundIssued,
    }, { status: isProviderBalanceExhausted || isProviderNetworkFailure ? 503 : isProviderForbidden ? 422 : 500 });
  }
}
