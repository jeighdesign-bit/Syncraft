import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { adminSupabase } from "@/lib/supabase";
import { deleteFromR2, uploadToR2 } from "@/lib/cloudflare";
import { enforceRateLimit } from "@/lib/rateLimit";
import { fetchStoredAsset } from "@/lib/storageDownload";
import {
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_MAX_SVG_BYTES,
  DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
  isOwnedStorageUrl,
} from "@/lib/ssrf";
import { getProjectAccess, PROJECT_ACCESS } from "@/lib/projectAccess";

export const runtime = "nodejs";
export const maxDuration = 180;

function safeFileName(name) {
  return String(name || "Untitled_Design").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120);
}

function assetSignature(assets) {
  return createHash("sha256")
    // Invalidate archives made by the old partial-success behavior. A cached
    // ZIP with this signature is guaranteed to contain every listed asset.
    .update("complete-archive-v2\0")
    .update(JSON.stringify(assets.map(({ url, name }) => ({ url, name }))))
    .digest("hex");
}

function assetFailureStatus(errors) {
  if (errors.some(error => error?.message === "Remote file is too large")) return 413;
  if (errors.some(error => error?.message === "Remote file has an invalid content type")) return 415;
  if (errors.some(error => error?.name === "TimeoutError" || error?.name === "AbortError")) return 504;
  return 503;
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized: invalid session" }, { status: 401 });
    }

    const rateLimit = await enforceRateLimit({
      namespace: "api:prepare-zip:user",
      identifier: user.id,
      max: 6,
      window: "60 s",
      windowMs: 60_000,
    });
    if (!rateLimit.success) return rateLimit.response;

    const { projectId } = await request.json();
    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const { project } = await getProjectAccess(user.id, projectId, {
      required: PROJECT_ACCESS.EDIT,
      select: "id,user_id,created_at,name,original_image_url,generated_image_url,upscaled_image_url,svg_url,zip_url,zip_signature",
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    const baseName = safeFileName(project.name);
    const assets = [
      project.original_image_url && { url: project.original_image_url, name: `Syncraft_${baseName}_Reference.png`, maxBytes: DEFAULT_MAX_IMAGE_BYTES },
      project.generated_image_url && project.generated_image_url !== "REFUNDED" && { url: project.generated_image_url, name: `Syncraft_${baseName}_SyncraftVision.png`, maxBytes: DEFAULT_MAX_IMAGE_BYTES },
      project.upscaled_image_url && { url: project.upscaled_image_url, name: `Syncraft_${baseName}_Upscaled.png`, maxBytes: DEFAULT_MAX_UPSCALED_IMAGE_BYTES },
      project.svg_url && { url: project.svg_url, name: `Syncraft_${baseName}_Vector.svg`, maxBytes: DEFAULT_MAX_SVG_BYTES },
    ].filter(Boolean);

    if (assets.length === 0) {
      return NextResponse.json({ error: "No files available to zip" }, { status: 400 });
    }

    const signature = assetSignature(assets);
    if (project.zip_url && project.zip_signature === signature) {
      return NextResponse.json({
        success: true,
        cached: true,
        zipUrl: project.zip_url,
        fileName: `Syncraft_${baseName}_AllFiles.zip`,
      });
    }

    const zip = new JSZip();
    const unowned = assets.filter(asset =>
      !isOwnedStorageUrl(asset.url, { userId: user.id, projectId })
      && !isOwnedStorageUrl(asset.url, { userId: project.user_id, projectId }),
    );
    if (unowned.length) {
      console.warn(`[Prepare ZIP] Rejected ${unowned.length} unowned asset URL(s)`);
      return NextResponse.json({ error: "One or more project files are not authorized for export" }, { status: 403 });
    }

    // Four independent reads should not consume four sequential timeout
    // windows. Fetch in parallel, but publish nothing unless every file is
    // complete so users never receive a silently incomplete archive.
    const routeSignal = AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]);
    const downloads = await Promise.allSettled(assets.map(async asset => {
      const { response, buffer } = await fetchStoredAsset(asset.url, {
        maxBytes: asset.maxBytes,
        allowedContentTypes: ["image/", "application/octet-stream"],
        timeoutMs: 25_000,
        maxAttempts: 2,
        signal: routeSignal,
      });
      if (!response.ok) {
        const error = new Error(`Remote file request failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      return { asset, buffer };
    }));

    const failures = downloads
      .map((result, index) => result.status === "rejected" ? { asset: assets[index], error: result.reason } : null)
      .filter(Boolean);
    if (failures.length) {
      const status = assetFailureStatus(failures.map(({ error }) => error));
      console.warn(`[Prepare ZIP] Complete archive deferred; ${failures.length} asset download(s) failed`);
      return NextResponse.json({
        error: status === 504
          ? "A saved project file took too long to download. Please retry Download All."
          : "One or more saved project files are temporarily unavailable. Please retry Download All.",
        code: "ZIP_ASSET_UNAVAILABLE",
        failedFiles: failures.map(({ asset }) => asset.name),
      }, { status, headers: { "Cache-Control": "no-store", "Retry-After": "3" } });
    }

    for (const result of downloads) zip.file(result.value.asset.name, result.value.buffer);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
    const zipKey = `projects/${projectId}/zip_${signature.slice(0, 16)}.zip`;
    const zipUrl = await uploadToR2(zipBuffer, zipKey, "application/zip", {
      signal: AbortSignal.any([routeSignal, AbortSignal.timeout(30_000)]),
    });

    const { error: updateError } = await adminSupabase
      .from("projects")
      .update({
        zip_url: zipUrl,
        zip_signature: signature,
        zip_generated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .abortSignal(routeSignal);

    if (updateError) {
      throw updateError;
    }

    if (project.zip_url && project.zip_url !== zipUrl) {
      try {
        await deleteFromR2(project.zip_url, { allowedPrefixes: [`projects/${projectId}/`] });
      } catch (cleanupError) {
        console.warn("[Prepare ZIP] Previous archive cleanup deferred:", cleanupError.message);
      }
    }

    return NextResponse.json({
      success: true,
      cached: false,
      zipUrl,
      fileName: `Syncraft_${baseName}_AllFiles.zip`,
    });
  } catch (error) {
    console.error("[Prepare ZIP Error]:", { name: error.name, message: error.message });
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    return NextResponse.json({
      error: timedOut
        ? "ZIP preparation timed out. Your files are safe; please retry Download All."
        : "Failed to prepare ZIP",
    }, { status: timedOut ? 504 : 500, headers: { "Cache-Control": "no-store" } });
  }
}
