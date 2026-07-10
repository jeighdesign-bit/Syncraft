import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";

// IMPORTANT: Must use Node.js runtime (not edge) so we get real 120s timeouts.
// Edge runtime on Vercel has a hard 30s cap which causes all Gemini generations to fail.
export const runtime = 'nodejs';
export const maxDuration = 120; // Vercel Pro plan allows up to 300s; 120s is safe

const RECRAFT_API_KEY = process.env.RECRAFT_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export async function POST(request) {
  let projectId;
  try {
    const body = await request.json();
    projectId = body.projectId;
    const { step, croppedImageUrl } = body;

    if (!projectId || !step) {
      return NextResponse.json({ error: "Missing required fields (projectId, step)" }, { status: 400 });
    }

    // ALWAYS use adminSupabase to fetch project — regular client has RLS
    // and may return null user_id if session is missing on server side
    const { data: project, error: projError } = await adminSupabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // HARD BLOCK: project must belong to a real user
    if (!project.user_id) {
      return NextResponse.json({ error: "Project has no owner. Please re-upload your image." }, { status: 403 });
    }

    // ============================================================
    // ATOMIC CREDIT DEDUCTION — Step 1 ONLY, MANDATORY check
    // project.user_id is guaranteed non-null from check above.
    // ============================================================
    if (step === 1) {
      const { data: profile, error: profileErr } = await adminSupabase
        .from('profiles')
        .select('credits')
        .eq('id', project.user_id)
        .single();

      if (profileErr || !profile) {
        console.error('[Billing] Could not fetch profile:', profileErr);
        return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 403 });
      }

      if (profile.credits <= 0) {
        return NextResponse.json({ error: "INSUFFICIENT_CREDITS" }, { status: 403 });
      }

      // DEDUCT IMMEDIATELY — optimistic lock prevents double-spend
      const { error: deductErr, data: updatedData } = await adminSupabase
        .from('profiles')
        .update({ credits: profile.credits - 1 })
        .eq('id', project.user_id)
        .eq('credits', profile.credits) // only succeeds if credits haven't changed
        .select();

      if (deductErr) {
        console.error('[Billing] Deduction SQL error:', deductErr);
        return NextResponse.json({ error: "Billing error. Please try again." }, { status: 500 });
      }

      if (!updatedData || updatedData.length === 0) {
        // Condition failed — credits changed during transaction (race condition)
        return NextResponse.json({ error: "Conflict updating credits. Please try again." }, { status: 409 });
      }

      // Mark the project as deducted so refunds are authorized
      await adminSupabase.from('projects').update({ credit_deducted: true }).eq('id', projectId);
    }

    if (step === 1) {
      // ==========================================
      // STAGE 1: OPENROUTER GEMINI -> RASTER PNG
      // ==========================================

      let base64Image;
      let mimeType = "image/png";

      const sourceUrl = croppedImageUrl || project.original_image_url;
      const imageResponse = await fetch(sourceUrl);
      if (!imageResponse.ok) throw new Error("Failed to fetch source image");
      const arrayBuffer = await imageResponse.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuffer);
      
      // Compress image to prevent Gemini Timeout for massive files
      // MAX 1024x1024 to ensure processing finishes well under Google's 300s load balancer timeout
      const sharp = (await import('sharp')).default;
      const compressedBuffer = await sharp(rawBuffer)
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
        
      base64Image = compressedBuffer.toString("base64");
      let prompt = "";
      if (project) {
        if (project.ai_prompt === 'FLATTEN') {
          prompt = `A perfectly flat, 2D rectangular vector pattern wallpaper. DO NOT DRAW A SHIRT.
          
CRITICAL RULES:
1. NO CLOTHING SHAPES: You are forbidden from drawing a torso, neck hole, collar, shoulders, or sleeves. 
2. RECTANGULAR CANVAS ONLY: The output must be a pure, solid rectangle filled edge-to-edge with the background pattern and design elements.
3. EXTEND THE DESIGN: Extend all lines, shapes, and stripes infinitely to the absolute edges of the image. 

STRICT 1:1 REPLICATION:
- Output a mathematically exact replica of all logos and designs present.
- EXACT FONT PRESERVATION: Never change the font. 
- Convert all textures into clean, solid, flat vector-like colors. Erase all 3D fabric folds and wrinkles.`;
        } else if (project.ai_prompt === 'ERASE_LOGOS') {
          prompt = `A perfectly flat, 2D rectangular vector pattern wallpaper. DO NOT DRAW A SHIRT.
          
CRITICAL RULES:
1. NO CLOTHING SHAPES: You are forbidden from drawing a torso, neck hole, collar, shoulders, or sleeves.
2. RECTANGULAR CANVAS ONLY: The output must be a pure, solid rectangle filled edge-to-edge with the background pattern.
3. EXTEND THE DESIGN: Extend all lines, shapes, and stripes infinitely to the absolute edges of the image.

SURGICAL TEXT AND LOGO REMOVAL (MANDATORY):
- Identify and SURGICALLY ERASE all typography, text, numbers, sponsors, chest logos, and watermarks. NO TEXT OR LOGOS ARE ALLOWED.
- Flawlessly reconstruct the underlying background pattern (the blue and gold stripes) to fill the gaps where the text used to be.

Convert all textures into clean, solid, flat vector-like colors. Erase all 3D fabric folds and wrinkles.`;
        } else {
          prompt = `A perfectly flat, 2D rectangular vector pattern wallpaper. DO NOT DRAW A SHIRT.
          
CRITICAL RULES:
1. NO CLOTHING SHAPES: You are forbidden from drawing a torso, neck hole, collar, shoulders, or sleeves. 
2. RECTANGULAR CANVAS ONLY: The output must be a pure, solid rectangle filled edge-to-edge with the background pattern and design elements.
3. EXTEND THE DESIGN: Extend all lines, shapes, and stripes infinitely to the absolute edges of the image. 

STRICT 1:1 REPLICATION:
- Output a mathematically exact replica of all logos and designs present.
- EXACT FONT PRESERVATION: Never change the font. 
- Convert all textures into clean, solid, flat vector-like colors. Erase all 3D fabric folds and wrinkles.`;
        }
      }

      let generatedImageBuffer;
      let generatedMimeType = "image/png";
      let geminiThinking = "Generated via OpenRouter Gemini 3.1 Flash Image";

      try {
        console.log("[API Step 1] Generating image with OpenRouter (gemini-3.1-flash-image)...");
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "google/gemini-3.1-flash-image",
            provider: {
              order: ["Google AI Studio"]
            },
            messages: [
              {
                role: "system",
                content: prompt
              },
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                  { type: "text", text: "Please process this image according to your system instructions. Do not write text, output the image directly." }
                ]
              }
            ]
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenRouter API error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        
        console.log("[OpenRouter RAW Response]:", JSON.stringify(data, null, 2));

        const message = data.choices?.[0]?.message;
        
        if (message?.images?.[0]?.image_url?.url) {
           // Direct Base64 data URL from OpenRouter's native image response
           const dataUrl = message.images[0].image_url.url;
           const base64Data = dataUrl.split(',')[1];
           const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
           if (mimeMatch) {
             generatedMimeType = mimeMatch[1];
           }
           generatedImageBuffer = Buffer.from(base64Data, 'base64');
        } else if (message?.content) {
           // Markdown URL in content
           const content = message.content;
           const urlMatch = content.match(/https?:\/\/[^\s)"]+/);
           if (!urlMatch) {
             throw new Error(`OpenRouter did not return a valid image URL. Response: ${content.substring(0, 100)}`);
           }
           const outputUrl = urlMatch[0];
           const imgRes = await fetch(outputUrl);
           if (!imgRes.ok) throw new Error("Failed to download generated image from OpenRouter URL");
           const arrBuf = await imgRes.arrayBuffer();
           generatedImageBuffer = Buffer.from(arrBuf);
        } else {
           console.error("[OpenRouter Empty Content]:", data);
           throw new Error("OpenRouter returned empty content. You might be out of credits, or the image hit a safety filter. Check terminal logs.");
        }

      } catch (err) {
        console.error("[OpenRouter Error]:", err);
        throw new Error(err.message || "Failed to generate image with OpenRouter");
      }

      return NextResponse.json({
        success: true,
        step: 1,
        base64: generatedImageBuffer.toString('base64'),
        mimeType: generatedMimeType,
        thinking: geminiThinking,
      });
    }

    if (step === 2) {
      // ==========================================
      // STAGE 2: CRISP UPSCALE THE RASTER IMAGE (RECRAFT)
      // ==========================================
      if (!project.generated_image_url) throw new Error("No generated raster image found for Step 2");

      // TEMPORARILY BYPASSED TO DOUBLE THE SPEED OF THE TOOL
      // Since Gemini now generates 1536px images and Recraft Vectorize handles smoothing natively,
      // the upscale step is redundant and adds 15-20 seconds of unnecessary waiting time.
      return NextResponse.json({ success: true, step: 2, fileUrl: project.generated_image_url, mimeType: "image/png" });
    }

    return NextResponse.json({ error: "Invalid step parameter" }, { status: 400 });

  } catch (error) {
    console.error(`[Trace API Error]:`, error.message);
    
    // Attempt automatic refund on server-side failure
    try {
      if (projectId) {
        const { data: proj } = await adminSupabase.from('projects').select('user_id, generated_image_url').eq('id', projectId).single();
        if (proj?.user_id && proj.generated_image_url !== 'REFUNDED') {
          const { data: profile } = await adminSupabase.from('profiles').select('credits').eq('id', proj.user_id).single();
          if (profile) {
            // Refund the credit
            await adminSupabase.from('profiles').update({ credits: profile.credits + 1 }).eq('id', proj.user_id);
            // Mark as refunded to prevent duplicate refunds
            await adminSupabase.from('projects').update({ generated_image_url: 'REFUNDED' }).eq('id', projectId);
          }
        }
      }
    } catch (refundErr) {
      console.error(`[Billing] Refund failed:`, refundErr.message);
    }

    return NextResponse.json({ error: error.message || "Failed to process trace step" }, { status: 500 });
  }
}
