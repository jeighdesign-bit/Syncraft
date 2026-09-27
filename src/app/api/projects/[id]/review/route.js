import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { adminSupabase } from "@/lib/supabase";

export async function POST(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { id: projectId } = resolvedParams;
    const body = await request.json();
    const { rating, feedback_text, publish_review } = body;
    const normalizedRating = Number(rating);
    const normalizedFeedback = typeof feedback_text === "string" ? feedback_text.trim().slice(0, 1500) : "";
    const publishReview = publish_review === true && normalizedFeedback.length > 0;

    if (!projectId || !Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return NextResponse.json({ error: "A rating from 1 to 5 is required" }, { status: 400 });
    }

    // Verify ownership
    const { data: project, error: projError } = await adminSupabase
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .single();

    if (projError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized to review this project" }, { status: 403 });
    }

    // Extract user profile info
    const reviewer_name = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || "Syncraft User";
    const reviewer_avatar = user.user_metadata?.avatar_url || null;

    // Update the rating
    let { error: updateError } = await adminSupabase
      .from("projects")
      .update({ 
        rating: normalizedRating,
        feedback_text: normalizedFeedback || null,
        review_public: publishReview,
        reviewer_name: publishReview ? reviewer_name : null,
        reviewer_avatar: publishReview ? reviewer_avatar : null
      })
      .eq("id", projectId)
      .eq("user_id", user.id);

    // Until the consent migration is applied, preserve the private feedback
    // without storing or exposing profile data.
    if (updateError?.code === "42703") {
      const fallbackResult = await adminSupabase
        .from("projects")
        .update({
          rating: normalizedRating,
          feedback_text: normalizedFeedback || null,
          reviewer_name: null,
          reviewer_avatar: null
        })
        .eq("id", projectId)
        .eq("user_id", user.id);
      updateError = fallbackResult.error;
    }

    if (updateError) {
      console.error("[Review API] Error updating rating:", updateError);
      return NextResponse.json({ error: "Failed to save rating" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Review API] Internal Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
