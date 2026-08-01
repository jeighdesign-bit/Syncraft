import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { uploadToR2 } from "@/lib/cloudflare";
import { enforceRateLimit } from "@/lib/rateLimit";
import { DEFAULT_MAX_IMAGE_BYTES, DEFAULT_MAX_UPSCALED_IMAGE_BYTES, fetchWithSSRFProtection, getAllowedProviderHosts, getAllowedStorageHosts, isOwnedStorageUrl, validateUrlForSSRF } from "@/lib/ssrf";
import { ANCHORS, BLEED_PERCENTS, RATIO_VALUES, SEED_MODES, evaluateExtend, evaluateExtendIntent } from "@/lib/aspectRatio";
import { CREDIT_COST } from "@/lib/pricing";
import { buildExtendPrompt } from "@/lib/prompts";
import { fal } from "@fal-ai/client";

export const runtime = 'nodejs';
// Nano Banana Pro editing plus storage and reconciliation can be long-running.
export const maxDuration = 180;

const SEAM_SAMPLE_PX = 4;

/**
 * Mean RGB and peak per-channel stdev of a rect, or null if the rect is
 * degenerate.
 *
 * Computed from raw pixels on purpose: sharp's `.stats()` reports on the whole
 * input image and silently IGNORES pipeline operations, so
 * `sharp(buf).extract(rect).stats()` returns figures for `buf` entire — which
 * made this guard compare the same whole-image numbers for every band and never
 * fire.
 */
async function regionStats(sharp, buffer, rect) {
  if (rect.width < 1 || rect.height < 1) return null;

  const { data, info } = await sharp(buffer)
    .extract(rect)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const bands = Math.min(3, ch);
  const n = data.length / ch;
  if (!n) return null;

  const sums = [0, 0, 0];
  const squares = [0, 0, 0];
  for (let i = 0; i < data.length; i += ch) {
    for (let c = 0; c < bands; c++) {
      const v = data[i + c];
      sums[c] += v;
      squares[c] += v * v;
    }
  }
  const means = sums.map((s) => s / n);
  const stdevs = squares.map((sq, c) => Math.sqrt(Math.max(0, sq / n - means[c] ** 2)));

  return {
    r: means[0],
    g: bands > 1 ? means[1] : means[0],
    b: bands > 2 ? means[2] : means[0],
    stdev: Math.max(...stdevs.slice(0, bands)),
  };
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Rects for each side that actually grew, in canvas coordinates. */
function bandRects(pads, width, height) {
  const bands = [];
  if (pads.left > 0) bands.push({ side: 'left', left: 0, top: 0, width: pads.left, height });
  if (pads.right > 0) bands.push({ side: 'right', left: width - pads.right, top: 0, width: pads.right, height });
  if (pads.top > 0) bands.push({ side: 'top', left: 0, top: 0, width, height: pads.top });
  if (pads.bottom > 0) bands.push({ side: 'bottom', left: 0, top: height - pads.bottom, width, height: pads.bottom });
  return bands;
}

/** Smallest supported Nano ratio canvas that contains the exact visible crop. */
function chooseNanoCarrier(width, height) {
  let best = null;
  for (const [aspectRatio, ratio] of Object.entries(RATIO_VALUES)) {
    let carrierWidth = width;
    let carrierHeight = Math.ceil(carrierWidth / ratio);
    if (carrierHeight < height) {
      carrierHeight = height;
      carrierWidth = Math.ceil(carrierHeight * ratio);
    }
    const extraArea = carrierWidth * carrierHeight - width * height;
    if (!best || extraArea < best.extraArea) {
      best = { aspectRatio, width: carrierWidth, height: carrierHeight, extraArea };
    }
  }
  const extraX = best.width - width;
  const extraY = best.height - height;
  return {
    ...best,
    hidden: {
      left: Math.floor(extraX / 2),
      right: Math.ceil(extraX / 2),
      top: Math.floor(extraY / 2),
      bottom: Math.ceil(extraY / 2),
    },
  };
}

/**
 * Make empty space visually unambiguous without leaking artwork into it.
 * Previous edge/mirror seeds placed recognizable motifs in the new bands; a
 * semantic editor could interpret those pixels as finished content and repeat
 * the nearby character, cloud, logo or panel. A neutral checkerboard carries
 * layout only, while the untouched image at the centre supplies all context.
 */
async function buildNanoExtendSeed({ sharp, originalBuffer, carrier, sourceRect }) {
  const tile = 32;
  const markerSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${carrier.width}" height="${carrier.height}">
      <defs>
        <pattern id="empty" width="${tile * 2}" height="${tile * 2}" patternUnits="userSpaceOnUse">
          <rect width="${tile * 2}" height="${tile * 2}" fill="#d9dbe0"/>
          <rect width="${tile}" height="${tile}" fill="#aeb2ba"/>
          <rect x="${tile}" y="${tile}" width="${tile}" height="${tile}" fill="#aeb2ba"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#empty)"/>
    </svg>
  `);

  return sharp(markerSvg)
    .composite([{
      input: originalBuffer,
      left: sourceRect.left,
      top: sourceRect.top,
    }])
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/**
 * Preserve the original artwork while allowing Nano's internally coherent
 * pixels to own a narrow overlap at every extended edge. A hard paste at the old
 * boundary exposes even a tiny model translation as a visible seam. Feathering
 * only inside the old artwork moves that join into shared context and keeps the
 * rest of the source pixel-exact.
 */
async function buildFeatheredOriginal({ sharp, buffer, width, height, pads }) {
  const feather = Math.max(12, Math.min(32, Math.round(Math.min(width, height) * 0.02)));
  const { data, info } = await sharp(buffer)
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let mask = 1;
      if (pads.left > 0 && x < feather) mask = Math.min(mask, x / feather);
      if (pads.right > 0 && x >= width - feather) mask = Math.min(mask, (width - 1 - x) / feather);
      if (pads.top > 0 && y < feather) mask = Math.min(mask, y / feather);
      if (pads.bottom > 0 && y >= height - feather) mask = Math.min(mask, (height - 1 - y) / feather);
      const alphaIndex = (y * width + x) * info.channels + 3;
      data[alphaIndex] = Math.round(data[alphaIndex] * Math.max(0, Math.min(1, mask)));
    }
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

export async function POST(request) {
  let userId = null;
  let projectId = null;
  let creditDeducted = false;

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
      namespace: "api:extend-design:user",
      identifier: userId,
      max: 3,
      window: "60 s",
      windowMs: 60_000,
    });
    if (!rateLimit.success) return rateLimit.response;
    // ─────────────────────────────────────────────────────────────────────────

    const body = await request.json();
    projectId = body.projectId;
    const seedMode = body.seedMode || "solid";

    // The route accepts EITHER the drag-to-expand shape { pads } (what the modal
    // sends) OR the ratio-first shape { targetRatio, anchor, bleedPercent }. The
    // pads path is primary; the ratio path is kept for any programmatic caller.
    const rawPads = body.pads && typeof body.pads === 'object' ? body.pads : null;
    const targetRatio = body.targetRatio;
    const anchor = body.anchor || "center";
    const bleedPercent = body.bleedPercent ?? 0;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }
    if (!SEED_MODES.includes(seedMode)) {
      return NextResponse.json({ error: "Invalid seedMode" }, { status: 400 });
    }

    if (rawPads) {
      // Shape check only here (cheap, pre-auth-work); caps are checked after we
      // know the source dimensions, below.
      const bad = ['top', 'right', 'bottom', 'left'].some((k) => {
        const v = rawPads[k];
        return v != null && (!Number.isFinite(Number(v)) || Number(v) < 0);
      });
      if (bad) {
        return NextResponse.json({ error: "Invalid pads" }, { status: 400 });
      }
    } else {
      if (!RATIO_VALUES[targetRatio]) {
        return NextResponse.json({ error: "INVALID_RATIO" }, { status: 400 });
      }
      if (!ANCHORS.includes(anchor)) {
        return NextResponse.json({ error: "Invalid anchor" }, { status: 400 });
      }
      if (!BLEED_PERCENTS.includes(bleedPercent)) {
        return NextResponse.json({ error: "Invalid bleedPercent" }, { status: 400 });
      }
    }

    // Fetch project AND verify ownership in one query — prevents IDOR attacks
    const { data: project, error: projError } = await adminSupabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projError || !project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    // Extend operates on the Stage 1 flat extract, not the original upload —
    // outpainting a photo of a shirt would mean extending stadium background and
    // fabric folds. 'REFUNDED' is the sentinel a failed trace leaves behind.
    const sourceUrl = project.generated_image_url;
    if (!sourceUrl || sourceUrl === 'REFUNDED') {
      return NextResponse.json({ error: "NO_FLAT_EXTRACT" }, { status: 400 });
    }

    if (!isOwnedStorageUrl(sourceUrl, { userId: user.id, projectId }) || !(await validateUrlForSSRF(sourceUrl, { allowedHosts: getAllowedStorageHosts() }))) {
      return NextResponse.json({ error: "Invalid or unauthorized image URL" }, { status: 400 });
    }

    const { response: srcRes, buffer: originalBuffer } = await fetchWithSSRFProtection(sourceUrl, {
      allowedHosts: getAllowedStorageHosts(),
      maxBytes: DEFAULT_MAX_IMAGE_BYTES,
      allowedContentTypes: ['image/'],
    });
    if (!srcRes.ok) {
      return NextResponse.json({ error: "Could not read the flat extract" }, { status: 400 });
    }

    const sharp = (await import('sharp')).default;
    const meta = await sharp(originalBuffer).metadata();
    const W0 = meta?.width;
    const H0 = meta?.height;
    if (!W0 || !H0) {
      return NextResponse.json({ error: "Could not read image dimensions" }, { status: 400 });
    }

    // Use the same exact-pad validation as the client preview so the generated
    // canvas matches the frame the user drew.
    const plan = rawPads
      ? evaluateExtendIntent({ width: W0, height: H0, rawPads })
      : evaluateExtend({ width: W0, height: H0, targetRatio, anchor, bleedPercent });
    if (!plan.ok) {
      return NextResponse.json({ error: plan.reason, message: plan.message }, { status: 400 });
    }
    const { pads, padded } = plan;
    const resultAspectRatio = rawPads ? plan.targetRatio : targetRatio;
    const W1 = padded.width;
    const H1 = padded.height;

    // ============================================================
    // Everything above is free. Only now touch money.
    // ============================================================
    const { data: profile, error: profileErr } = await adminSupabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Could not fetch profile" }, { status: 403 });
    }
    if (profile.credits < CREDIT_COST.extend) {
      return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 403 });
    }

    const { error: deductErr, data: updatedData } = await adminSupabase
      .from('profiles')
      .update({ credits: profile.credits - CREDIT_COST.extend })
      .eq('id', user.id)
      .eq('credits', profile.credits)
      .select();

    if (deductErr || !updatedData || updatedData.length === 0) {
      return NextResponse.json({ error: "Conflict updating credits. Please try again." }, { status: 409 });
    }
    creditDeducted = true;

    // 'Extend Design' is deliberately absent from the action allowlist in
    // api/refund/route.js, so a hand-crafted client refund can never claim this
    // charge. This route refunds itself inline in the catch block instead.
    await adminSupabase.from('credit_logs').insert({
      user_id: user.id,
      action: 'Extend Design',
      amount: -CREDIT_COST.extend,
    });

    // NOTE: projects.credit_deducted is deliberately NOT set here. That flag is
    // owned by the trace pipeline's refund state machine, and flipping it would
    // make this project eligible for a second refund it never earned.

    // ============================================================
    // GENERATIVE EXTEND (Nano Banana Pro)
    // ============================================================
    // Nano Banana has no mask or exact-pixel outpaint parameters. Give it one
    // larger carrier image instead: the original is untouched in the middle and
    // every editable pixel is a neutral checkerboard. Crucially, no mirrored,
    // repeated or blurred artwork is placed in the new bands, so the seed itself
    // cannot suggest a second character/logo/panel to the model.
    // Nano outputs only supported ratios. Hidden carrier padding is cropped away
    // after generation, so the user still receives the exact requested canvas.
    // The overlap composite below handles Nano's small positional redraws.
    const carrier = chooseNanoCarrier(W1, H1);
    const visibleRect = {
      left: carrier.hidden.left,
      top: carrier.hidden.top,
      width: W1,
      height: H1,
    };
    const sourceRect = {
      left: visibleRect.left + pads.left,
      top: visibleRect.top + pads.top,
      width: W0,
      height: H0,
    };
    const seedBuffer = await buildNanoExtendSeed({
      sharp,
      originalBuffer,
      carrier,
      sourceRect,
    });
    const seedUrl = await uploadToR2(
      seedBuffer,
      `projects/${projectId}/extend_seed_${Date.now()}.png`,
      "image/png",
    );
    const extendPrompt = buildExtendPrompt({
      pads,
      padded,
      source: { width: W0, height: H0 },
      traceType: project.trace_type,
      carrier: { width: carrier.width, height: carrier.height },
      visibleRect,
      sourceRect,
    });

    console.log(
      '[Extend] Requesting Nano Banana Pro edit project=%s carrier=%dx%d ratio=%s source@%d,%d pads=%j',
      projectId, carrier.width, carrier.height, carrier.aspectRatio,
      sourceRect.left, sourceRect.top, pads,
    );
    const result = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
      input: {
        prompt: extendPrompt,
        image_urls: [seedUrl],
        num_images: 1,
        aspect_ratio: carrier.aspectRatio,
        resolution: "2K",
        output_format: "png",
        safety_tolerance: "4",
        limit_generations: true,
        enable_web_search: false,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach((m) => console.log(m));
        }
      },
    });

    const outputUrl = result?.data?.images?.[0]?.url;
    if (!outputUrl) {
      throw new Error("fal.ai returned no image. Response: " + JSON.stringify(result));
    }

    const { response: aiRes, buffer: aiBuffer } = await fetchWithSSRFProtection(outputUrl, {
      allowedHosts: getAllowedProviderHosts(),
      maxBytes: DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
      allowedContentTypes: ['image/'],
    });
    if (!aiRes.ok) throw new Error("Failed to download the extended image from fal.ai");

    // ============================================================
    // RESIZE RECONCILIATION
    // ============================================================
    // Nano returns a preset 2K size for the selected carrier ratio. Keep
    // reconciliation defensive so provider-side rounding can never shift or
    // distort the preserved print area.
    const aiMeta = await sharp(aiBuffer).metadata();
    const aiW = aiMeta?.width;
    const aiH = aiMeta?.height;
    if (!aiW || !aiH) throw new Error("Could not read dimensions of the extended image");

    // Uniform-scale precondition. If the ratios disagree, any resize shears the
    // design — and a subtly stretched print file is only discovered at the
    // printer. Fail loudly and refund instead.
    if (Math.abs((aiW / aiH) - (carrier.width / carrier.height)) > 0.025) {
      throw new Error(`EXTEND_RATIO_DRIFT: requested carrier ${carrier.width}x${carrier.height} but the provider returned ${aiW}x${aiH}`);
    }

    // Normalize the AI output to the padded canvas so the preserved region can be
    // pasted back at native pixels — that keeps it bit-for-bit identical rather
    // than merely close. fit:'fill' is safe only because the guard above proved
    // the ratios match, making this a uniform scale.
    const carrierBuffer = (aiW === carrier.width && aiH === carrier.height)
      ? aiBuffer
      : await sharp(aiBuffer)
        .resize(carrier.width, carrier.height, { fit: 'fill', kernel: 'lanczos3' })
        .png()
        .toBuffer();
    const canvasBuffer = await sharp(carrierBuffer)
      .extract(visibleRect)
      .png()
      .toBuffer();
    const visibleSeedBuffer = await sharp(seedBuffer)
      .extract(visibleRect)
      .png()
      .toBuffer();

    let pasteW = W0;
    let pasteH = H0;
    const pasteLeft = pads.left;
    const pasteTop = pads.top;

    // Independent rounding across four values can push the paste one pixel past
    // the canvas, and sharp then throws "Image to composite must have same
    // dimensions or smaller" — a 500 after the user has already been charged.
    if (pasteLeft + pasteW > W1) pasteW = W1 - pasteLeft;
    if (pasteTop + pasteH > H1) pasteH = H1 - pasteTop;

    const pasteBuffer = (pasteW === W0 && pasteH === H0)
      ? originalBuffer
      : await sharp(originalBuffer).resize(pasteW, pasteH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    const featheredPasteBuffer = await buildFeatheredOriginal({
      sharp,
      buffer: pasteBuffer,
      width: pasteW,
      height: pasteH,
      pads,
    });

    console.log(
      '[Extend] src=%dx%d padded=%dx%d carrier=%dx%d ai=%dx%d paste=%dx%d@%d,%d pads=%j',
      W0, H0, W1, H1, carrier.width, carrier.height, aiW, aiH,
      pasteW, pasteH, pasteLeft, pasteTop, pads,
    );

    // ============================================================
    // DID THE MODEL ACTUALLY FILL ANYTHING?
    // ============================================================
    // Compare each grown band in the AI output against the SAME band in the seed
    // (the blurred underpainting). If the model returned the seed essentially
    // unchanged — same mean colour AND no added detail — it did not paint. Kept
    // deliberately lenient: it only fires when EVERY band is a near-identical
    // passthrough, so a genuine (even soft) fill is never discarded.
    const bands = bandRects(pads, W1, H1);
    let everyBandUnchanged = bands.length > 0;
    for (const band of bands) {
      const [before, after] = await Promise.all([
        regionStats(sharp, visibleSeedBuffer, band),
        regionStats(sharp, canvasBuffer, band),
      ]);
      if (
        !before ||
        !after ||
        colorDistance(before, after) > 4 ||
        Math.abs(before.stdev - after.stdev) > 4
      ) {
        everyBandUnchanged = false;
        break;
      }
    }
    if (everyBandUnchanged) {
      throw new Error('EXTEND_NO_FILL: the model left the empty canvas unchanged');
    }

    const finalBuffer = await sharp(canvasBuffer)
      .composite([{ input: featheredPasteBuffer, top: pasteTop, left: pasteLeft }])
      .png({ compressionLevel: 6 })
      .toBuffer();

    // Seam observability after the narrow overlap blend. Large deltas here are a
    // signal that the model ignored the boundary geometry.
    try {
      const deltas = [];
      for (const band of bands) {
        const horizontal = band.side === 'left' || band.side === 'right';
        const edgeX = band.side === 'left' ? pasteLeft : pasteLeft + pasteW - SEAM_SAMPLE_PX;
        const edgeY = band.side === 'top' ? pasteTop : pasteTop + pasteH - SEAM_SAMPLE_PX;
        const inside = horizontal
          ? { left: Math.max(0, edgeX), top: pasteTop, width: SEAM_SAMPLE_PX, height: pasteH }
          : { left: pasteLeft, top: Math.max(0, edgeY), width: pasteW, height: SEAM_SAMPLE_PX };
        const outside = horizontal
          ? { left: band.side === 'left' ? Math.max(0, pasteLeft - SEAM_SAMPLE_PX) : Math.min(W1 - SEAM_SAMPLE_PX, pasteLeft + pasteW), top: pasteTop, width: SEAM_SAMPLE_PX, height: pasteH }
          : { left: pasteLeft, top: band.side === 'top' ? Math.max(0, pasteTop - SEAM_SAMPLE_PX) : Math.min(H1 - SEAM_SAMPLE_PX, pasteTop + pasteH), width: pasteW, height: SEAM_SAMPLE_PX };
        const [i, o] = await Promise.all([
          regionStats(sharp, finalBuffer, inside),
          regionStats(sharp, finalBuffer, outside),
        ]);
        if (i && o) deltas.push(`${band.side}=${colorDistance(i, o).toFixed(1)}`);
      }
      if (deltas.length) console.log('[Extend] seam delta %s', deltas.join(' '));
    } catch (seamErr) {
      // Diagnostics only — never fail a good result over a sampling error.
      console.warn('[Extend] seam sampling failed:', seamErr.message);
    }

    const finalUrl = await uploadToR2(
      finalBuffer,
      `projects/${projectId}/extended_flat_${Date.now()}.png`,
      "image/png",
    );

    // Extend replaces the flat extract and invalidates only what comes after it.
    // original_image_url is deliberately untouched — unlike crop / erase /
    // remove-bg, which all reset the pipeline from the original upload down.
    const { error: updateError } = await adminSupabase
      .from('projects')
      .update({
        generated_image_url: finalUrl,
        upscaled_image_url: null,
        svg_url: null,
        zip_url: null,
        zip_signature: null,
        zip_generated_at: null,
      })
      .eq('id', projectId)
      .eq('user_id', user.id);

    if (updateError) {
      throw new Error("Failed to update project with the extended image");
    }

    return NextResponse.json({
      success: true,
      generated_image_url: finalUrl,
      aspect_ratio: resultAspectRatio,
      source: { width: W0, height: H0 },
      padded: { width: W1, height: H1, pads },
      ai: { width: aiW, height: aiH },
      final: { width: W1, height: H1 },
      creditsCharged: CREDIT_COST.extend,
    });

  } catch (error) {
    console.error("[Extend] Error:", error);

    if (creditDeducted && userId) {
      try {
        await adminSupabase.rpc('increment_credits', { user_id: userId, amount: CREDIT_COST.extend });
        await adminSupabase.from('credit_logs').insert({
          user_id: userId, action: 'Refund (Error)', amount: CREDIT_COST.extend,
        });
        console.log(`[Extend] Refunded ${CREDIT_COST.extend} credits to user ${userId}.`);
      } catch (refundErr) {
        console.error('[Extend] CRITICAL: failed to refund credits:', refundErr);
      }
      // NOTE: deliberately does NOT write projects.refunded or overwrite
      // generated_image_url. A failed extend must leave the existing flat extract
      // exactly as it was — that sentinel-write is what makes the trace routes'
      // catch blocks destructive.
    }

    let safeMessage;
    if (error.message?.startsWith('EXTEND_RATIO_DRIFT')) {
      safeMessage = 'The AI returned an unexpected canvas shape, so the extend was discarded. Your credits have been refunded.';
    } else if (error.message?.startsWith('EXTEND_NO_FILL')) {
      safeMessage = 'The AI did not fill the new canvas, so the result was discarded and your credits were refunded.';
    } else {
      const m = error.message?.toLowerCase() || '';
      safeMessage = (m.includes('fal') || m.includes('api') || m.includes('key') || error.message === 'Unauthorized')
        ? 'AI provider authentication failed. Your credits have been refunded automatically.'
        : (error.message || 'Failed to extend design');
    }
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}
