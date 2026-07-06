import { NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/cloudflare";
import { supabase } from "@/lib/supabase";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { projectId, croppedImageUrl } = await request.json();

    if (!projectId || !croppedImageUrl) {
      return NextResponse.json({ error: "Missing required fields (projectId, croppedImageUrl)" }, { status: 400 });
    }

    const fileUrl = croppedImageUrl;

    // Update project in Supabase (Overwrite original_image_url to make crop permanent and clear old trace results)
    const { error } = await supabase
      .from('projects')
      .update({ 
        original_image_url: fileUrl,
        generated_image_url: null,
        upscaled_image_url: null,
        svg_url: null
      })
      .eq('id', projectId);

    if (error) throw error;

    return NextResponse.json({ success: true, cropped_image_url: fileUrl });

  } catch (error) {
    console.error(`[Crop API Error]:`, error);
    return NextResponse.json({ error: error.message || "Failed to save cropped image" }, { status: 500 });
  }
}
