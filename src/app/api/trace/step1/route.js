import { NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/cloudflare";
import { createClient } from "@supabase/supabase-js";

// BYPASS VERCEL 10s SERVERLESS LIMIT (Edge gives up to 25s-30s on Hobby)
export const runtime = "edge"; 

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  let projectId;
  try {
    const body = await request.json();
    projectId = body.projectId;
    const { step } = body;

    if (!projectId || step !== 1) {
      return NextResponse.json({ error: "Missing required fields (projectId, step)" }, { status: 400 });
    }

    const { data: project, error: projError } = await adminSupabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.user_id) {
      return NextResponse.json({ error: "Project has no owner." }, { status: 403 });
    }

    // ============================================================
    // ATOMIC CREDIT DEDUCTION
    // ============================================================
    const { data: profile, error: profileErr } = await adminSupabase
      .from('profiles')
      .select('credits')
      .eq('id', project.user_id)
      .single();

    if (profileErr || !profile || profile.credits <= 0) {
      return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 403 });
    }

    const { error: deductErr } = await adminSupabase
      .from('profiles')
      .update({ credits: profile.credits - 1 })
      .eq('id', project.user_id)
      .eq('credits', profile.credits)
      .select();

    if (deductErr) {
      return NextResponse.json({ error: "Credit deduction failed." }, { status: 500 });
    }

    await adminSupabase.from('projects').update({ credit_deducted: true }).eq('id', projectId);

    // ==========================================
    // STAGE 1: GET RASTER IMAGE
    // ==========================================
    // Since the user cropped the image (Option A), the original_image_url IS the cropped image!
    // We can fetch it, and pass it directly as the completed Step 1 output, bypassing Gemini completely!
    // This makes Step 1 take 0.5 seconds instead of 15 seconds!
    const imageResponse = await fetch(project.original_image_url);
    if (!imageResponse.ok) throw new Error("Failed to fetch image from URL");
    
    const arrayBuffer = await imageResponse.arrayBuffer();
    // In Edge Runtime, Buffer is polyfilled or we can use Uint8Array
    const generatedImageBuffer = Buffer.from(arrayBuffer);
    let generatedMimeType = imageResponse.headers.get("content-type") || "image/png";
    let generatedExt = generatedMimeType.split("/")[1] || "png";
    if (generatedExt === "jpeg") generatedExt = "jpg";

    const cfRasterFileName = `projects/${projectId}/generated_flat_${Date.now()}.${generatedExt}`;
    const finalRasterUrl = await uploadToR2(generatedImageBuffer, cfRasterFileName, generatedMimeType);

    await adminSupabase.from('projects').update({ generated_image_url: finalRasterUrl, ai_prompt: null }).eq('id', projectId);

    return NextResponse.json({ success: true, step: 1, generated_image_url: finalRasterUrl });

  } catch (error) {
    console.error(`[Trace Edge API Error]:`, error);
    try {
      if (typeof projectId !== 'undefined' && projectId) {
        const { data: proj } = await adminSupabase.from('projects').select('user_id').eq('id', projectId).single();
        if (proj && proj.user_id) {
          await adminSupabase.rpc('refund_credit', { target_user_id: proj.user_id, target_project_id: projectId });
        }
      }
    } catch (refundErr) {
      console.error(`[Billing] Failed to process automatic refund:`, refundErr);
    }
    return NextResponse.json({ error: error.message || "Failed to process trace step" }, { status: 500 });
  }
}
