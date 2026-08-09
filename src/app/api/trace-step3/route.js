import { NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/cloudflare";
import { adminSupabase, safeRefundCredit } from "@/lib/supabase";
import { fetchWithRetry } from "@/lib/fetchWithRetry";
import { enforceRateLimit } from "@/lib/rateLimit";
import { segmentSvgLayers } from "@/lib/svgSegmenter";
import { DEFAULT_MAX_IMAGE_BYTES, DEFAULT_MAX_SVG_BYTES, DEFAULT_MAX_UPSCALED_IMAGE_BYTES, fetchWithSSRFProtection, getAllowedProviderHosts, getAllowedStorageHosts, isOwnedStorageUrl, validateUrlForSSRF } from "@/lib/ssrf";

export const runtime = 'nodejs';
export const maxDuration = 240; // Complex extended artwork can take over 2 minutes to vectorize.

export async function POST(request) {
  let projectId;
  let userId;
  let skipRefund = false;
  try {
    // ─── Auth: verify the caller owns the project ─────────────────────────────
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
      namespace: "api:trace-step3:user",
      identifier: userId,
      max: 3,
      window: "60 s",
      windowMs: 60_000,
    });
    if (!rateLimit.success) return rateLimit.response;
    // ─────────────────────────────────────────────────────────────────────────

    const body = await request.json();
    projectId = body.projectId;
    const colors = body.colors || "auto";
    // Set by callers re-running this stage on an already-paid project (e.g.
    // after Extend Design). This route never charges, so it must not refund on
    // behalf of a charge it did not make. Declining a refund can never gain the
    // caller credits, so it is safe to honour from the client.
    skipRefund = body.skipRefund === true;

    if (colors !== "auto") {
      const colorLimit = parseInt(colors, 10);
      if (isNaN(colorLimit) || colorLimit < 2 || colorLimit > 256) {
        return NextResponse.json({ error: "Invalid colors parameter. Must be between 2 and 256." }, { status: 400 });
      }
    }

    if (!projectId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: project, error: projError } = await adminSupabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Verify caller owns this project
    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // ==========================================
    // STAGE 3: VECTORIZE WITH RECRAFT (SVG only)
    // The image is already upscaled by ESRGAN in Step 2.
    // Here we only convert to lossless PNG and apply optional Shadow Killer
    // color reduction before handing off to Recraft vectorize.
    // ==========================================
    if (!project.upscaled_image_url) throw new Error("No upscaled image found for Step 3");
    if (!isOwnedStorageUrl(project.upscaled_image_url, { userId: user.id, projectId }) || !(await validateUrlForSSRF(project.upscaled_image_url, { allowedHosts: getAllowedStorageHosts() }))) {
      return NextResponse.json({ error: "Invalid or unauthorized upscaled image URL" }, { status: 400 });
    }

    const { response: rasterImgRes, buffer: rawBuffer } = await fetchWithSSRFProtection(project.upscaled_image_url, {
      allowedHosts: getAllowedStorageHosts(),
      maxBytes: DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
      allowedContentTypes: ['image/', 'application/octet-stream'],
    });
    if (!rasterImgRes.ok) throw new Error("Failed to fetch upscaled image from R2");

    // ─── Step 3 Pre-processing ────────────────────────────────────────────────
    // Recraft crispUpscale (Step 2) already sharpened and enhanced the image.
    // Here we only resize to 2048px max (Recraft vectorize has a 4096px hard limit,
    // and smaller inputs process faster without sacrificing SVG path quality)
    // and convert to lossless PNG for clean color data.
    // NO aggressive contrast/normalize/sharpen — that caused the high-contrast SVG problem.
    // ─────────────────────────────────────────────────────────────────────────
    const sharp = (await import('sharp')).default;
    const sourceMetadata = await sharp(rawBuffer).metadata();
    if (!sourceMetadata.width || !sourceMetadata.height) {
      throw new Error("Unable to read the upscaled image dimensions");
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
      sharpInstance = sharpInstance
        .sharpen({ sigma: 1.0, m1: 0.5, m2: 1.5, x1: 2, y2: 8, y3: 15 });
    }

    let compressedBuffer;
    if (colors && colors !== "auto") {
      const colorLimit = parseInt(colors, 10);
      compressedBuffer = await sharpInstance.png({ palette: true, colors: colorLimit, effort: 1 }).toBuffer();
    } else {
      compressedBuffer = await sharpInstance.png({ effort: 1 }).toBuffer();
    }

    const blob = new Blob([compressedBuffer], { type: 'image/png' });
    const vectorizeFormData = new FormData();
    vectorizeFormData.append('image', blob, 'image.png');

    console.log("[Step 3] Sending to Recraft vectorize (RECRAFT_API_TOKEN)...");
    const recraftVectorRes = await fetchWithRetry("https://external.api.recraft.ai/v1/images/vectorize", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.RECRAFT_API_TOKEN || process.env.RECRAFT_API_KEY}` },
      body: vectorizeFormData,
      // One long request avoids retrying an already-consumed multipart stream.
      signal: AbortSignal.timeout(210000),
    }, 1);

    if (!recraftVectorRes.ok) {
      const errText = await recraftVectorRes.text();
      throw new Error(`Vectorization failed: ${errText}`);
    }

    const vectorData = await recraftVectorRes.json();
    const vectorUrl = vectorData.image.url;

    const { response: svgRes, buffer: svgDownloadBuffer } = await fetchWithSSRFProtection(vectorUrl, {
      allowedHosts: getAllowedProviderHosts(),
      maxBytes: DEFAULT_MAX_SVG_BYTES,
      allowedContentTypes: ['image/svg+xml', 'text/plain', 'application/octet-stream'],
    });
    if (!svgRes.ok) throw new Error("Failed to fetch vectorized SVG");
    let svgText = svgDownloadBuffer.toString('utf8');

    // --- FIX FOR ADOBE ILLUSTRATOR "INVALID SVG" ERROR ---
    // 1. Remove markdown backticks if AI accidentally included them
    svgText = svgText.replace(/^```(xml|svg)?\n?/i, '').replace(/\n?```$/i, '').trim();
    
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

    // ─── Semantic Layer Grouping ──────────────────────────────────────────────
    // Post-processes the SVG to wrap paths in named <g id="layer-..."> groups.
    // Uses Gemini Flash vision on the ORIGINAL image (not the generated one) so
    // that layer classification is based on the user's actual design intent.
    // COMPLETELY NON-FATAL: falls back to saving the original SVG on any error.
    // ─────────────────────────────────────────────────────────────────────────
    try {
      // Fetch the original (pre-AI) image to give Gemini context about the design
      if (!isOwnedStorageUrl(project.original_image_url, { userId: user.id, projectId })) {
        throw new Error('Original image URL is not owned by this user/project');
      }
      const { response: originalImgRes, buffer: originalImgBuf } = await fetchWithSSRFProtection(project.original_image_url, {
        allowedHosts: getAllowedStorageHosts(),
        maxBytes: DEFAULT_MAX_IMAGE_BYTES,
        allowedContentTypes: ['image/'],
      });
      if (originalImgRes.ok) {
        const originalBase64 = originalImgBuf.toString('base64');
        const originalMime = originalImgRes.headers.get('content-type') || 'image/png';

        // Map project trace type to a context hint for Gemini
        const traceTypeHint = project.trace_type === 'logo' ? 'logo'
          : project.trace_type === 'universal' ? 'universal'
          : 'jersey';

        svgText = await segmentSvgLayers(svgText, originalBase64, originalMime, traceTypeHint);
      } else {
        console.warn('[Step 3] Could not fetch original image for segmentation — skipping');
      }
    } catch (segErr) {
      console.warn('[Step 3] Segmentation error (non-fatal):', segErr.message);
      // svgText remains unchanged — safe to continue
    }
    // ─────────────────────────────────────────────────────────────────────────

    const svgBuffer = Buffer.from(svgText, 'utf8');
    const cfSvgFileName = `projects/${projectId}/vector_${Date.now()}.svg`;
    const finalSvgUrl = await uploadToR2(svgBuffer, cfSvgFileName, "image/svg+xml");

    await adminSupabase
      .from('projects')
      .update({ svg_url: finalSvgUrl, zip_url: null, zip_signature: null, zip_generated_at: null })
      .eq('id', projectId)
      .eq('user_id', user.id);

    return NextResponse.json({ success: true, step: 3, svg_url: finalSvgUrl });

  } catch (error) {
    console.error(`[Trace Step 3 Error]:`, error.message);
    
    // Attempt automatic refund on server-side failure.
    //
    // skipRefund is set when this stage is being re-run on a project that was
    // already paid for (e.g. after Extend Design). Without that opt-out, the
    // update below would overwrite generated_image_url with the 'REFUNDED'
    // sentinel — destroying work the user paid for — and refund credits this
    // re-run never charged.
    try {
      if (projectId && !skipRefund) {
        const { data: updatedProj } = await adminSupabase
          .from('projects')
          .update({ generated_image_url: 'REFUNDED', refunded: true })
          .eq('id', projectId)
          .eq('user_id', userId)
          .eq('credit_deducted', true)
          .eq('refunded', false)
          .select('user_id');
          
        if (updatedProj && updatedProj.length > 0) {
           await safeRefundCredit(updatedProj[0].user_id);
        }
      }
    } catch (refundErr) {
      console.error(`[Billing] Refund failed:`, refundErr.message);
    }

    const timedOut = error?.name === 'TimeoutError' ||
      /aborted|timeout/i.test(error?.message || '');
    return NextResponse.json(
      {
        error: timedOut ? "VECTORIZE_TIMEOUT" : (error.message || "Failed to process trace step"),
        message: timedOut
          ? "Vectorization took too long. The upscaled design is safe; retry Vector SVG."
          : undefined,
      },
      { status: timedOut ? 504 : 500 },
    );
  }
}
