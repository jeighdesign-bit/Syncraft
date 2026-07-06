import { NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/cloudflare";
import { supabase, adminSupabase } from "@/lib/supabase";

export const maxDuration = 60; 

const RECRAFT_API_KEY = process.env.RECRAFT_API_KEY;

export async function POST(request) {
  let projectId;
  try {
    const body = await request.json();
    projectId = body.projectId;

    if (!projectId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: project, error: projError } = await adminSupabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // ==========================================
    // STAGE 3: VECTORIZE THE UPSCALED IMAGE (RECRAFT)
    // ==========================================
    console.log(`[API Step 3] Running Recraft Vectorizer for Project ${projectId}...`);
    if (!project.upscaled_image_url) throw new Error("No upscaled image found for Step 3");

    const rasterImgRes = await fetch(project.upscaled_image_url);
    if (!rasterImgRes.ok) throw new Error("Failed to fetch upscaled image from R2");
    const rawBuffer = Buffer.from(await rasterImgRes.arrayBuffer());

    // Convert image to lossless PNG to prevent JPEG compression artifacts during vectorization
    const sharp = (await import('sharp')).default;
    const compressedBuffer = await sharp(rawBuffer)
      .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
      .png({ effort: 7 })
      .toBuffer();
    console.log(`[API Step 3] Original: ${rawBuffer.length} bytes → PNG Compressed: ${compressedBuffer.length} bytes`);

    const vectorizeFormData = new FormData();
    const blob = new Blob([compressedBuffer], { type: 'image/png' });
    vectorizeFormData.append('image', blob, 'image.png');

    const recraftVectorRes = await fetch("https://external.api.recraft.ai/v1/images/vectorize", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RECRAFT_API_KEY}` },
      body: vectorizeFormData,
      signal: AbortSignal.timeout(55000)
    });

    if (!recraftVectorRes.ok) {
      const errText = await recraftVectorRes.text();
      throw new Error(`Vectorization failed: ${errText}`);
    }

    const vectorData = await recraftVectorRes.json();
    const vectorUrl = vectorData.image.url;

    const svgRes = await fetch(vectorUrl);
    const svgBuffer = Buffer.from(await svgRes.arrayBuffer());
    const cfSvgFileName = `projects/${projectId}/vector_${Date.now()}.svg`;
    const finalSvgUrl = await uploadToR2(svgBuffer, cfSvgFileName, "image/svg+xml");

    await adminSupabase.from('projects').update({ svg_url: finalSvgUrl }).eq('id', projectId);

    console.log(`[Billing] Step 3 complete. Credit was already deducted in Step 1.`);

    return NextResponse.json({ success: true, step: 3, svg_url: finalSvgUrl });

  } catch (error) {
    console.error(`[Trace API Error]:`, error);
    
    // Attempt automatic refund on server-side failure
    try {
      if (typeof projectId !== 'undefined' && projectId) {
        const { data: proj } = await adminSupabase.from('projects').select('user_id').eq('id', projectId).single();
        if (proj && proj.user_id) {
          await adminSupabase.rpc('refund_credit', { target_user_id: proj.user_id, target_project_id: projectId });
          console.log(`[Billing] 🔄 Refund executed for project ${projectId} due to error`);
        }
      }
    } catch (refundErr) {
      console.error(`[Billing] Failed to process automatic refund:`, refundErr);
    }

    return NextResponse.json({ error: error.message || "Failed to process trace step" }, { status: 500 });
  }
}
