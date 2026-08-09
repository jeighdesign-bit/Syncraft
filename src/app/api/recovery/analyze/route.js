import { NextResponse } from "next/server";
import sharp from "sharp";
import { adminSupabase } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rateLimit";
import { fetchWithSSRFProtection, getAllowedStorageHosts, isOwnedStorageUrl, normalizeUserImageUrl, validateUrlForSSRF, DEFAULT_MAX_IMAGE_BYTES } from "@/lib/ssrf";
import { normalizeRecoveryAnalysis } from "@/lib/recovery";
import { isRecoveryInProgress } from "@/lib/recoveryPolicy.mjs";
import { snapToAllowedAspectRatio } from "@/lib/aspectRatio";
import { CREDIT_COST } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "").trim();
    const { data: { user } } = await adminSupabase.auth.getUser(token || "");
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const limit = await enforceRateLimit({ namespace: "api:recovery:analyze", identifier: user.id, max: 10, window: "60 s", windowMs: 60_000 });
    if (!limit.success) return limit.response;

    const { projectId } = await request.json();
    const { data: project } = await adminSupabase.from("projects").select("id,user_id,trace_type,original_image_url,canvas_data,ai_prompt").eq("id", projectId).eq("user_id", user.id).single();
    if (!project || project.trace_type !== "universal") return NextResponse.json({ error: "Universal project not found" }, { status: 404 });
    if (isRecoveryInProgress(project.canvas_data?.universal_recovery?.status)) {
      return NextResponse.json({
        error: "A recovery run is already in progress. Please wait for it to finish.",
        code: "RECOVERY_ALREADY_RUNNING",
      }, { status: 409 });
    }

    const sourceUrl = normalizeUserImageUrl(project.original_image_url, new URL(request.url).origin);
    if (!isOwnedStorageUrl(sourceUrl, { userId: user.id, projectId }) || !(await validateUrlForSSRF(sourceUrl, { allowedHosts: getAllowedStorageHosts() }))) {
      return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
    }
    const fetched = await fetchWithSSRFProtection(sourceUrl, { allowedHosts: getAllowedStorageHosts(), maxBytes: DEFAULT_MAX_IMAGE_BYTES, allowedContentTypes: ["image/"] });
    const meta = await sharp(fetched.buffer).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);
    const pixelArea = width * height;

    // Keep analysis deterministic and local. The stable garment extractor does
    // not block generation on a separate vision model; Universal should follow
    // the same architecture. Fal's edit model performs the visual reasoning in
    // the actual extraction request.
    const cropRatio = width && height ? width / height : 1;
    const analysis = normalizeRecoveryAnalysis({
      state: "partial",
      quality: shortSide < 192 || pixelArea < 65_536 ? "poor" : "fair",
      confidence: 70,
      visible_coverage: 100,
      layout_strategy: cropRatio >= 2.4 || cropRatio <= 0.42 ? "long_strip" : "large_format_rectangle",
      aspect_ratio: snapToAllowedAspectRatio(width, height),
      perspective: "medium",
      curvature: "medium",
      folds: "medium",
      reflections: "low",
      missing_areas: [],
      reason: "Layout was derived locally from the uploaded crop; the Fal extraction model will perform flattening and recovery.",
      expected_result: "Best-effort recovery of the visible artwork in a clean flat layout.",
    }, snapToAllowedAspectRatio(width, height));
    const isLowResolution = shortSide < 192 || pixelArea < 65_536;
    if (analysis.state === "insufficient") {
      analysis.state = "partial";
      analysis.reason = analysis.reason || "The reference has limited evidence; recovery will use visible content only.";
    }
    if (isLowResolution && analysis.state === "safe") {
      analysis.state = "partial";
      analysis.quality = "poor";
      analysis.reason = "The artwork is visible, but the uploaded crop is low resolution. Fine text and logo details may not be exact.";
    }
    // Migrate unversioned Universal projects away from the former destructive
    // default. New v2 projects retain the user's explicit mode selection.
    const hasExplicitMode = Number(project.canvas_data?.universal_mode_selection_version) >= 2;
    const selectedMode = hasExplicitMode
      ? project.canvas_data?.universal_mode
        || project.canvas_data?.universal_recovery?.mode
        || project.ai_prompt
        || "UNIVERSAL_KEEP_ARTWORK"
      : "UNIVERSAL_KEEP_ARTWORK";
    const recovery = {
      analysis,
      mode: selectedMode,
      status: "analyzed",
      validation: null,
      retry_count: 0,
      costs: { analysis_calls: 0, image_generation_calls: 0, validation_calls: 0, charged_credits: 0 },
    };
    let saveQuery = adminSupabase.from("projects").update({
      // A completed/partial result may be deliberately re-run. Reset the
      // per-run billing lock here; generate will acquire it atomically before
      // debiting credits, so concurrent generation requests still cannot bill
      // twice.
      credit_deducted: false,
      refunded: false,
      canvas_data: {
        ...(project.canvas_data || {}),
        universal_mode_selection_version: 2,
        universal_mode: selectedMode,
        universal_recovery: recovery,
      },
    }).eq("id", projectId).eq("user_id", user.id);
    // The vision call above can take several seconds. Re-check the persisted
    // JSON status as part of the update so a delayed analysis cannot overwrite
    // a generation that acquired the lock while analysis was in flight.
    if (project.canvas_data?.universal_recovery) {
      saveQuery = saveQuery.neq("canvas_data->universal_recovery->>status", "generating");
    }
    const { data: saved, error: saveError } = await saveQuery.select("id");
    if (saveError) throw new Error(`Could not save recovery analysis: ${saveError.message}`);
    if (!saved?.length) {
      return NextResponse.json({
        error: "A recovery run is already in progress. Please wait for it to finish.",
        code: "RECOVERY_ALREADY_RUNNING",
      }, { status: 409 });
    }
    return NextResponse.json({ success: true, analysis, creditCost: CREDIT_COST.universal });
  } catch (error) {
    console.error("[Recovery Analyze]", error);
    return NextResponse.json({ error: error.message || "Analysis failed" }, { status: 500 });
  }
}
