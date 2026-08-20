import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { chargeCreditsVerified, markCreditTransaction, recordProviderUsage, refundCreditVerified } from "@/lib/creditLedger";
import { CREDIT_COST } from "@/lib/pricing";
import { uploadToR2 } from "@/lib/cloudflare";
import { DEFAULT_MAX_IMAGE_BYTES, fetchWithSSRFProtection, getAllowedProviderHosts, getAllowedStorageHosts, isOwnedStorageUrl, validateUrlForSSRF } from "@/lib/ssrf";
import { fal } from "@fal-ai/client";

export const runtime = 'nodejs';
export const maxDuration = 120; // Enough time for BG removal + R2 upload

export async function POST(request) {
  let userId = null;
  let projectId = null;
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
    // ─────────────────────────────────────────────────────────────────────────────

    const body = await request.json();
    projectId = body.projectId;
    const { keepOriginal } = body;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    // Fetch project AND verify ownership
    const { data: project, error: projError } = await adminSupabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projError || !project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    if (!project.original_image_url) {
      return NextResponse.json({ error: "No image found to process" }, { status: 400 });
    }

    if (!isOwnedStorageUrl(project.original_image_url, { userId: user.id, projectId }) || !(await validateUrlForSSRF(project.original_image_url, { allowedHosts: getAllowedStorageHosts() }))) {
      return NextResponse.json({ error: "Invalid or unauthorized image URL" }, { status: 400 });
    }

    // ─── Fix #1: Re-processing guard ─────────────────────────────────────────
    // If BG has already been removed, block the request. Do NOT charge again.
    if (keepOriginal && project.generated_image_url) {
      return NextResponse.json({ error: "ALREADY_PROCESSED" }, { status: 409 });
    }
    // ─────────────────────────────────────────────────────────────────────────

    try {
      const charge = await chargeCreditsVerified({
        userId: user.id,
        projectId,
        feature: "background_removal",
        action: "Background Removal",
        amount: CREDIT_COST.removeBg,
        metadata: { route: "api/remove-bg" },
      });
      chargeTransactionId = charge.transactionId;
      isOwnerTest = charge.isOwnerTest;
    } catch (billingError) {
      if (billingError.code === "INSUFFICIENT_CREDITS" || billingError.code === "PROFILE_NOT_FOUND") {
        return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 403 });
      }
      console.error("[Remove BG] Verified charge failed:", billingError);
      return NextResponse.json({ error: "Billing error. Please try again." }, { status: 500 });
    }

    await adminSupabase
      .from('projects')
      .update({ credit_deducted: true })
      .eq('id', projectId)
      .eq('user_id', user.id);

    // ============================================================
    // PROCESS WITH FAL.AI (BiRefNet)
    // ============================================================
    console.log(`[Remove BG] Sending to Fal.ai BiRefNet for project ${projectId}...`);
    
    const result = await fal.subscribe("fal-ai/birefnet", {
      input: {
        image_url: project.original_image_url
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs.map((log) => console.log(log.message));
        }
      },
    });

    await recordProviderUsage({
      creditTransactionId: chargeTransactionId,
      projectId,
      userId,
      provider: "fal",
      endpoint: "fal-ai/birefnet",
      providerRequestId: result?.requestId || null,
      isOwnerTest,
    });

    console.log("[fal.ai RAW Response]:", JSON.stringify(result, null, 2));

    const transparentImageUrl = result?.data?.image?.url || result?.image?.url || result?.data?.image_url;

    if (!transparentImageUrl) {
      throw new Error("Fal.ai returned no image URL. Response: " + JSON.stringify(result));
    }

    console.log("[Remove BG] Received transparent image from Fal:", transparentImageUrl);

    // ============================================================
    // DOWNLOAD FROM FAL AND UPLOAD TO R2 (Permanent Storage)
    // ============================================================
    console.log("[Remove BG] Downloading from Fal to upload to R2...");
    const { response: imageResponse, buffer } = await fetchWithSSRFProtection(transparentImageUrl, {
      allowedHosts: getAllowedProviderHosts(),
      maxBytes: DEFAULT_MAX_IMAGE_BYTES,
      allowedContentTypes: ['image/'],
    });
    if (!imageResponse.ok) throw new Error("Failed to fetch image from Fal.ai");

    const fileName = `projects/${projectId}/bg-removed-${Date.now()}.png`;
    const r2Url = await uploadToR2(buffer, fileName, "image/png");

    console.log("[Remove BG] Saved to R2:", r2Url);

    // ============================================================
    // UPDATE PROJECT IN SUPABASE
    // ============================================================
    const updatePayload = keepOriginal 
      ? { 
          generated_image_url: r2Url, 
          upscaled_image_url: null, 
          svg_url: null,
          zip_url: null,
          zip_signature: null,
          zip_generated_at: null
        }
      : { 
          original_image_url: r2Url, 
          generated_image_url: null, 
          upscaled_image_url: null, 
          svg_url: null,
          zip_url: null,
          zip_signature: null,
          zip_generated_at: null
        };

    const { error: updateError } = await adminSupabase
      .from('projects')
      .update(updatePayload)
      .eq('id', projectId)
      .eq('user_id', user.id);

    if (updateError) {
      throw new Error("Failed to update project with new image URL");
    }

    await markCreditTransaction({ transactionId: chargeTransactionId, status: "succeeded" });

    return NextResponse.json({ 
      success: true, 
      transparent_image_url: r2Url, 
      original_image_url: keepOriginal ? project.original_image_url : r2Url 
    });

  } catch (error) {
    console.error("[Remove BG] Error:", error);

    let refunded = false;
    if (chargeTransactionId && userId) {
      try {
        const refund = await refundCreditVerified({
          chargeTransactionId,
          reason: error.message,
          action: "Refund: Background Removal (Error)",
          metadata: { route: "api/remove-bg" },
        });
        refunded = refund.refunded;
        if (refunded && projectId) {
          await adminSupabase.from('projects').update({ refunded: true }).eq('id', projectId).eq('user_id', userId);
        }
      } catch (refundErr) {
        console.error('[Remove BG] CRITICAL: Failed to refund credit:', refundErr);
      }
    }

    // ─── Fix #2: Never expose raw internal error messages to the client ─────
    const safeMessage =
      error.message?.toLowerCase().includes('fal') ||
      error.message?.toLowerCase().includes('api') ||
      error.message?.toLowerCase().includes('key') ||
      error.message === 'Unauthorized'
        ? `AI provider authentication failed (Unauthorized/Keys).${refunded ? ' Your credits were refunded automatically.' : ' Please contact support about the credit charge.'}`
        : (error.message || 'Failed to remove background');
    return NextResponse.json({ error: safeMessage, refunded }, { status: 500 });
  }
}
