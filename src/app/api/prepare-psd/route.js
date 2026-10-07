import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { buildLayeredPsd } from "@/lib/layeredPsd.mjs";
import { deleteFromR2, uploadToR2 } from "@/lib/cloudflare";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  DEFAULT_MAX_SVG_BYTES,
  fetchWithSSRFProtection,
  getAllowedStorageHosts,
  isOwnedStorageUrl,
} from "@/lib/ssrf";

export const runtime = "nodejs";
export const maxDuration = 300;
const PSD_EXPORT_VERSION = "7";
const PSD_LONG_EDGE = 2048;

function safeFileName(name) {
  return String(name || "Untitled_Design").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120);
}

function svgSignature(svgUrl) {
  return createHash("sha256")
    .update(`${PSD_EXPORT_VERSION}:${String(svgUrl || "")}`)
    .digest("hex");
}

export async function POST(request) {
  let uploadedPsdUrl = null;
  let projectId = null;

  try {
    if (!adminSupabase) {
      return NextResponse.json({ error: "PSD export is not configured on this server." }, { status: 503 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized: invalid session" }, { status: 401 });
    }

    const payload = await request.json();
    projectId = typeof payload?.projectId === "string" ? payload.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const { data: project, error: projectError } = await adminSupabase
      .from("projects")
      .select("id, user_id, name, trace_type, svg_url, canvas_data")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }
    if (!project.svg_url) {
      return NextResponse.json({ error: "Generate the Vector SVG before exporting a layered PSD." }, { status: 409 });
    }
    if (!isOwnedStorageUrl(project.svg_url, { userId: user.id, projectId })) {
      return NextResponse.json({ error: "The project SVG is not stored in an approved location." }, { status: 403 });
    }

    const signature = svgSignature(project.svg_url);
    const cached = project.canvas_data?.layered_psd;
    const baseName = safeFileName(project.name);
    const fileName = `Syncraft_${baseName}_Layered.psd`;

    if (
      cached?.url
      && cached.signature === signature
      && cached.source_svg_url === project.svg_url
      && isOwnedStorageUrl(cached.url, { userId: user.id, projectId })
    ) {
      return NextResponse.json({
        success: true,
        cached: true,
        psdUrl: cached.url,
        fileName,
        width: cached.width,
        height: cached.height,
        layerCount: cached.layer_count,
        shapeLayerCount: cached.shape_layer_count || 0,
      });
    }

    const rateLimit = await enforceRateLimit({
      namespace: "api:prepare-psd:user",
      identifier: user.id,
      max: 3,
      window: "5 m",
      windowMs: 5 * 60_000,
    });
    if (!rateLimit.success) return rateLimit.response;

    const { response: svgResponse, buffer: svgBuffer } = await fetchWithSSRFProtection(project.svg_url, {
      allowedHosts: getAllowedStorageHosts(),
      maxBytes: DEFAULT_MAX_SVG_BYTES,
      timeoutMs: 30_000,
      allowedContentTypes: ["image/svg+xml", "text/plain", "application/octet-stream"],
    });
    if (!svgResponse.ok) {
      return NextResponse.json({ error: "Could not load the project SVG." }, { status: 502 });
    }

    // Keep meaningful SVG shapes independently editable at the source-native
    // 2K delivery size. Exceptionally complex traces adaptively batch only
    // consecutive microscopic details (such as halftone dots), avoiding
    // thousands of Photoshop layer records without flattening the artwork.
    const layered = await buildLayeredPsd(svgBuffer.toString("utf8"), {
      longEdge: PSD_LONG_EDGE,
    });
    const psdKey = `projects/${projectId}/layered_${signature.slice(0, 20)}.psd`;
    // The local Supabase project-assets bucket is image-only. Store the exact
    // PSD bytes under its accepted fallback MIME; the .psd download proxy
    // restores application/vnd.adobe.photoshop for the browser.
    uploadedPsdUrl = await uploadToR2(
      layered.buffer,
      psdKey,
      "application/vnd.adobe.photoshop",
      { fallbackContentType: "image/png" },
    );

    // Do not attach a PSD to the project if a new vector replaced its source
    // while the relatively heavy rasterization step was running.
    const { data: currentProject, error: currentError } = await adminSupabase
      .from("projects")
      .select("svg_url, canvas_data")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (currentError || !currentProject || currentProject.svg_url !== project.svg_url) {
      await deleteFromR2(uploadedPsdUrl, { allowedPrefixes: [`projects/${projectId}/`] }).catch(() => {});
      uploadedPsdUrl = null;
      return NextResponse.json({ error: "The vector changed during export. Please try again." }, { status: 409 });
    }

    const nextPsdMetadata = {
      url: uploadedPsdUrl,
      signature,
      source_svg_url: project.svg_url,
      generated_at: new Date().toISOString(),
      width: layered.width,
      height: layered.height,
      layer_count: layered.layerCount,
      source_object_count: layered.sourceObjectCount,
      optimized: layered.optimized,
      layer_names: layered.layerNames,
      group_count: layered.groupCount,
      shape_layer_count: layered.shapeLayerCount,
    };
    const { error: updateError } = await adminSupabase
      .from("projects")
      .update({
        canvas_data: {
          ...(currentProject.canvas_data || {}),
          layered_psd: nextPsdMetadata,
        },
      })
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    if (cached?.url && cached.url !== uploadedPsdUrl) {
      await deleteFromR2(cached.url, { allowedPrefixes: [`projects/${projectId}/`] }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      cached: false,
      psdUrl: uploadedPsdUrl,
      fileName,
      width: layered.width,
      height: layered.height,
      layerCount: layered.layerCount,
      sourceObjectCount: layered.sourceObjectCount,
      optimized: layered.optimized,
      shapeLayerCount: layered.shapeLayerCount,
    });
  } catch (error) {
    console.error("[Prepare PSD Error]:", error);
    if (uploadedPsdUrl && projectId) {
      await deleteFromR2(uploadedPsdUrl, { allowedPrefixes: [`projects/${projectId}/`] }).catch(() => {});
    }
    const message = String(error?.message || "");
    if (/unsupported active content|external asset reference|external style reference/i.test(message)) {
      return NextResponse.json({ error: "This SVG contains unsupported external or active content." }, { status: 422 });
    }
    if (/too large/i.test(message)) {
      return NextResponse.json({ error: "The layered PSD is too large to export safely." }, { status: 413 });
    }
    return NextResponse.json({ error: "Failed to prepare the layered PSD." }, { status: 500 });
  }
}
