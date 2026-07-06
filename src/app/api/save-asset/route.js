import { NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/cloudflare";
import { adminSupabase } from "@/lib/supabase";

export const maxDuration = 60; 

export async function POST(request) {
  try {
    const body = await request.json();
    const { projectId, step, base64, mimeType, fileUrl } = body;

    if (!projectId || !step) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let buffer;
    let ext;
    let finalMimeType = mimeType || "image/png";

    if (base64) {
      buffer = Buffer.from(base64, "base64");
      ext = finalMimeType.split("/")[1] || "png";
      if (ext === "jpeg") ext = "jpg";
    } else if (fileUrl) {
      const imgRes = await fetch(fileUrl);
      if (!imgRes.ok) throw new Error("Failed to fetch fileUrl");
      buffer = Buffer.from(await imgRes.arrayBuffer());
      ext = fileUrl.split('.').pop() || "png";
      // Sanitize extension
      if (ext.length > 4 || ext.includes("?")) ext = "png"; 
    } else {
      return NextResponse.json({ error: "Provide either base64 or fileUrl" }, { status: 400 });
    }

    if (step === 1) {
      const fileName = `projects/${projectId}/generated_flat_${Date.now()}.${ext}`;
      const finalUrl = await uploadToR2(buffer, fileName, finalMimeType);
      await adminSupabase.from('projects').update({ generated_image_url: finalUrl, ai_prompt: null }).eq('id', projectId);
      return NextResponse.json({ success: true, url: finalUrl });
    } 
    
    if (step === 2) {
      const fileName = `projects/${projectId}/upscaled_${Date.now()}.${ext}`;
      const finalUrl = await uploadToR2(buffer, fileName, "image/png");
      await adminSupabase.from('projects').update({ upscaled_image_url: finalUrl }).eq('id', projectId);
      return NextResponse.json({ success: true, url: finalUrl });
    }

    if (step === 3) {
      const fileName = `projects/${projectId}/vector_${Date.now()}.svg`;
      const finalUrl = await uploadToR2(buffer, fileName, "image/svg+xml");
      await adminSupabase.from('projects').update({ svg_url: finalUrl }).eq('id', projectId);
      return NextResponse.json({ success: true, url: finalUrl });
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });

  } catch (error) {
    console.error("[Save Asset Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
