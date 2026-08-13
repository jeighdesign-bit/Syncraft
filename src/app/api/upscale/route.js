import { NextResponse } from "next/server";
import sharp from "sharp";
import { adminSupabase, safeRefundCredit } from "@/lib/supabase";
import { uploadToR2 } from "@/lib/cloudflare";
import { CREDIT_COST } from "@/lib/pricing";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
  fetchWithSSRFProtection,
  getAllowedProviderHosts,
  getAllowedStorageHosts,
  isOwnedStorageUrl,
  validateUrlForSSRF,
} from "@/lib/ssrf";

export const runtime = 'nodejs';
export const maxDuration = 120;

async function inspectUpscaleImage(buffer) {
  const metadata = await sharp(buffer, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) {
    return { valid: false, blankBlack: false };
  }

  const stats = await sharp(buffer, { failOn: "error" }).stats();
  const visibleChannels = stats.channels.slice(0, Math.min(3, stats.channels.length));
  return {
    valid: true,
    blankBlack: visibleChannels.length > 0
      && visibleChannels.every((channel) => channel.max <= 5 && channel.mean <= 1),
  };
}

export async function POST(request) {
  let userId;
  let projectId;
  let chargedThisRequest = false;
  try {
    // Auth
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
      namespace: "api:upscale:user",
      identifier: userId,
      max: 3,
      window: "60 s",
      windowMs: 60_000,
    });
    if (!rateLimit.success) return rateLimit.response;

    ({ projectId } = await request.json());
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const { data: project, error: projectError } = await adminSupabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .eq("trace_type", "upscale")
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Upscale project not found" }, { status: 404 });
    }

    const finalImageUrl = project.original_image_url;
    if (!isOwnedStorageUrl(finalImageUrl, { userId, projectId }) || !(await validateUrlForSSRF(finalImageUrl, { allowedHosts: getAllowedStorageHosts() }))) {
      return NextResponse.json({ error: "Invalid or unauthorized image URL" }, { status: 400 });
    }

    // Results produced by the old studio were saved as short-lived fal.media URLs.
    // A paid legacy project is repaired in place without charging the user again.
    const hasDurableResult = project.generated_image_url
      && isOwnedStorageUrl(project.generated_image_url, { userId, projectId });
    if (hasDurableResult) {
      try {
        const existing = await fetchWithSSRFProtection(project.generated_image_url, {
          allowedHosts: getAllowedStorageHosts(),
          maxBytes: DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
          timeoutMs: 30_000,
          allowedContentTypes: ["image/"],
        });
        const inspection = existing.response.ok
          ? await inspectUpscaleImage(existing.buffer)
          : { valid: false, blankBlack: false };
        if (inspection.valid && !inspection.blankBlack) {
          return NextResponse.json({
            success: true,
            upscaledUrl: project.generated_image_url,
            projectId,
            alreadyProcessed: true,
          });
        }
      } catch (existingResultError) {
        console.warn("[API Upscale] Existing result needs repair:", existingResultError.message);
      }
    }
    const isPaidLegacyRepair = !!project.generated_image_url
      && project.credit_deducted === true
      && project.refunded !== true;

    if (!isPaidLegacyRepair) {
      const { data: claimed } = await adminSupabase
        .from("projects")
        .update({
          credit_deducted: true,
          refunded: false,
          canvas_data: { ...(project.canvas_data || {}), upscale_status: "processing" },
        })
        .eq("id", projectId)
        .eq("user_id", userId)
        .or("credit_deducted.eq.false,credit_deducted.is.null")
        .select("id");

      if (!claimed?.length) {
        return NextResponse.json({ error: "UPSCALE_ALREADY_PROCESSING" }, { status: 409 });
      }

      const { data: profile, error: profileErr } = await adminSupabase
        .from("profiles")
        .select("credits")
        .eq("id", userId)
        .single();

      if (profileErr || !profile || profile.credits < CREDIT_COST.upscale) {
        await adminSupabase
          .from("projects")
          .update({ credit_deducted: false, canvas_data: project.canvas_data || {} })
          .eq("id", projectId)
          .eq("user_id", userId);
        return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 403 });
      }

      const { data: updatedProfiles } = await adminSupabase
        .from("profiles")
        .update({ credits: profile.credits - CREDIT_COST.upscale })
        .eq("id", userId)
        .eq("credits", profile.credits)
        .select("id");

      if (!updatedProfiles?.length) {
        await adminSupabase
          .from("projects")
          .update({ credit_deducted: false, canvas_data: project.canvas_data || {} })
          .eq("id", projectId)
          .eq("user_id", userId);
        return NextResponse.json({ error: "Conflict updating credits. Please try again." }, { status: 409 });
      }
      chargedThisRequest = true;

      await adminSupabase.from("credit_logs").insert({
        user_id: userId,
        action: "AI Upscale (4K)",
        amount: -CREDIT_COST.upscale,
      });
    } else {
      await adminSupabase
        .from("projects")
        .update({ canvas_data: { ...(project.canvas_data || {}), upscale_status: "processing" } })
        .eq("id", projectId)
        .eq("user_id", userId);
    }

    // Process via fal.ai
    if (!process.env.FAL_KEY) throw new Error("FAL_KEY missing");
    const { fal } = await import("@fal-ai/client");

    console.log("[API Upscale] Using fal-ai/clarity-upscaler for high-end upscale on:", finalImageUrl);

    const result = await fal.subscribe("fal-ai/clarity-upscaler", {
      input: {
        image_url: finalImageUrl,
        // Clarity Upscaler's current schema uses `upscale_factor`; `scale` is
        // ignored and silently falls back to the provider default.
        upscale_factor: 4,
        // This endpoint only transforms an authenticated user's existing
        // image. The provider safety checker can replace otherwise valid
        // sports/artwork inputs with an all-black image while still returning
        // a successful response.
        enable_safety_checker: false,
        resemblance: 0.8,
        creativity: 0.2,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    if (!result || !result.data || !result.data.image || !result.data.image.url) {
      throw new Error("Upscaler failed to return a valid image URL.");
    }

    const providerUrl = result.data.image.url;
    const { response: imageResponse, buffer } = await fetchWithSSRFProtection(providerUrl, {
      allowedHosts: getAllowedProviderHosts(),
      maxBytes: DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
      timeoutMs: 60_000,
      allowedContentTypes: ["image/"],
    });
    if (!imageResponse.ok) throw new Error("Upscaler result could not be downloaded");

    // A provider-side moderation/decoding failure may be returned as a valid
    // image containing only black pixels. Never persist that as a completed
    // paid result.
    const inspection = await inspectUpscaleImage(buffer);
    if (!inspection.valid) {
      throw new Error("Upscaler returned an invalid image");
    }
    if (inspection.blankBlack) {
      throw new Error("Upscaler returned a blank image. Please try again.");
    }

    const responseType = imageResponse.headers.get("content-type") || "image/png";
    const extension = responseType.includes("jpeg") ? "jpg" : responseType.includes("webp") ? "webp" : "png";
    const durableUrl = await uploadToR2(
      buffer,
      `projects/${projectId}/upscaled_${Date.now()}.${extension}`,
      responseType
    );

    const { error: saveError } = await adminSupabase
      .from("projects")
      .update({
        generated_image_url: durableUrl,
        credit_deducted: true,
        refunded: false,
        canvas_data: { ...(project.canvas_data || {}), upscale_status: "complete" },
      })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (saveError) throw new Error("Failed to save the upscaled image");

    return NextResponse.json({ success: true, upscaledUrl: durableUrl, projectId, repaired: isPaidLegacyRepair });

  } catch (error) {
    console.error(`[Upscale API Error]:`, error.message);
    let refunded = false;
    if (chargedThisRequest && userId) {
      refunded = await safeRefundCredit(userId, CREDIT_COST.upscale);
      if (refunded) {
        await adminSupabase.from("credit_logs").insert({
          user_id: userId,
          action: "Refund: AI Upscale (Error)",
          amount: CREDIT_COST.upscale,
        });
      }
    }
    if (projectId && userId) {
      const { data: failedProject } = await adminSupabase
        .from("projects")
        .select("canvas_data")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();
      await adminSupabase
        .from("projects")
        .update({
          ...(chargedThisRequest ? { credit_deducted: refunded ? false : true, refunded } : {}),
          canvas_data: { ...(failedProject?.canvas_data || {}), upscale_status: "failed" },
        })
        .eq("id", projectId)
        .eq("user_id", userId);
    }
    const safeMessage =
      error.message?.toLowerCase().includes('fal') ||
      error.message?.toLowerCase().includes('api') ||
      error.message?.toLowerCase().includes('key') ||
      error.message === 'Unauthorized'
        ? `AI provider authentication failed.${refunded ? " Your credits were refunded automatically." : ""}`
        : (error.message || 'Failed to upscale image');
    return NextResponse.json({ error: safeMessage, refunded }, { status: 500 });
  }
}
