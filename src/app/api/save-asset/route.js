import { NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/cloudflare";
import { adminSupabase } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rateLimit";
import { DEFAULT_MAX_IMAGE_BYTES, DEFAULT_MAX_SVG_BYTES, DEFAULT_MAX_UPSCALED_IMAGE_BYTES, fetchWithSSRFProtection, getAllowedProviderHosts, getAllowedStorageHosts, normalizeUserImageUrl } from "@/lib/ssrf";
import { getProjectAccess, PROJECT_ACCESS } from "@/lib/projectAccess";

export const maxDuration = 180;

const ALLOWED_REMOTE_HOSTS = [...getAllowedStorageHosts(), ...getAllowedProviderHosts()];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'];
const MAX_JSON_BODY_BYTES = Math.ceil(DEFAULT_MAX_IMAGE_BYTES * 1.4);

export async function POST(request) {
  try {
    // ─── Auth: verify the caller owns this project ────────────────────────────
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: invalid session' }, { status: 401 });
    }
    const rateLimit = await enforceRateLimit({
      namespace: "api:save-asset:user",
      identifier: user.id,
      max: 20,
      window: "60 s",
      windowMs: 60_000,
    });
    if (!rateLimit.success) return rateLimit.response;
    // ─────────────────────────────────────────────────────────────────────────

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength && contentLength > MAX_JSON_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    const body = await request.json();
    const { projectId, step, base64, mimeType, fileUrl } = body;

    if (!projectId || !step) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify the user owns this project before allowing any writes
    const { project } = await getProjectAccess(user.id, projectId, {
      required: PROJECT_ACCESS.EDIT,
      select: 'id,user_id,created_at',
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 });
    }

    let buffer;
    let ext;
    let finalMimeType = mimeType || "image/png";

    if (base64) {
      if (!ALLOWED_MIME_TYPES.includes(finalMimeType)) {
        return NextResponse.json({ error: "Invalid mime type" }, { status: 400 });
      }
      const maxBytes = finalMimeType === 'image/svg+xml' ? DEFAULT_MAX_SVG_BYTES : DEFAULT_MAX_IMAGE_BYTES;
      if (Buffer.byteLength(base64, 'base64') > maxBytes) {
        return NextResponse.json({ error: "File too large" }, { status: 413 });
      }
      buffer = Buffer.from(base64, "base64");
      ext = finalMimeType.split("/")[1] || "png";
      if (ext === "jpeg") ext = "jpg";
    } else if (fileUrl) {
      const normalizedFileUrl = normalizeUserImageUrl(fileUrl, new URL(request.url).origin);
      const maxBytes = step === 3
        ? DEFAULT_MAX_SVG_BYTES
        : step === 2
          ? DEFAULT_MAX_UPSCALED_IMAGE_BYTES
          : DEFAULT_MAX_IMAGE_BYTES;
      const { response, buffer: remoteBuffer, finalUrl } = await fetchWithSSRFProtection(normalizedFileUrl, {
        allowedHosts: ALLOWED_REMOTE_HOSTS,
        maxBytes,
        allowedContentTypes: ['image/', 'application/octet-stream'],
        timeoutMs: 30_000,
        maxAttempts: 2,
      });
      if (!response.ok) throw new Error("Failed to fetch fileUrl");
      buffer = remoteBuffer;
      finalMimeType = response.headers.get('content-type')?.split(';')[0] || finalMimeType;
      ext = new URL(finalUrl).pathname.split('.').pop() || "png";
      // Sanitize extension
      if (ext.length > 4 || ext.includes("?")) ext = "png";
    } else {
      return NextResponse.json({ error: "Provide either base64 or fileUrl" }, { status: 400 });
    }

    if (step === 1) {
      const fileName = `projects/${projectId}/generated_flat_${Date.now()}.${ext}`;
      const finalUrl = await uploadToR2(buffer, fileName, finalMimeType);
      const { error: saveError } = await adminSupabase.from('projects').update({ generated_image_url: finalUrl, upscaled_image_url: null, svg_url: null, ai_prompt: null, zip_url: null, zip_signature: null, zip_generated_at: null }).eq('id', projectId);
      if (saveError) throw new Error(`Could not save flat extract: ${saveError.message}`);
      return NextResponse.json({ success: true, url: finalUrl });
    }

    if (step === 2) {
      // Re-encode losslessly before storage so provider PNGs remain below the
      // fallback bucket limit. Dimensions and RGBA pixels remain identical;
      // only redundant PNG bytes are removed. Step 1 is never touched.
      if (finalMimeType === 'image/png') {
        const sharp = (await import('sharp')).default;
        buffer = await sharp(buffer)
          .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
          .toBuffer();
      }
      const fileName = `projects/${projectId}/upscaled_${Date.now()}.${ext}`;
      const finalUrl = await uploadToR2(buffer, fileName, finalMimeType);
      const { error: saveError } = await adminSupabase.from('projects').update({ upscaled_image_url: finalUrl, zip_url: null, zip_signature: null, zip_generated_at: null }).eq('id', projectId);
      if (saveError) throw new Error(`Could not save upscaled image: ${saveError.message}`);
      return NextResponse.json({ success: true, url: finalUrl });
    }

    if (step === 3) {
      const fileName = `projects/${projectId}/vector_${Date.now()}.svg`;
      const finalUrl = await uploadToR2(buffer, fileName, "image/svg+xml");
      await adminSupabase.from('projects').update({ svg_url: finalUrl, zip_url: null, zip_signature: null, zip_generated_at: null }).eq('id', projectId);
      return NextResponse.json({ success: true, url: finalUrl });
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });

  } catch (error) {
    console.error("[Save Asset Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
