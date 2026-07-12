import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Fetch recent 5-star or 4-star reviews to display as testimonials
    const { data: reviews, error } = await adminSupabase
      .from('projects')
      .select('rating, feedback_text, reviewer_name, reviewer_avatar, created_at')
      .not('feedback_text', 'is', null)
      .not('feedback_text', 'eq', '')
      .gte('rating', 4)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, reviews: reviews || [] });
  } catch (error) {
    console.error("Reviews API Error:", error);
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}
