import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Only feature positive written reviews whose authors explicitly opted in.
    const { data: reviews, error } = await adminSupabase
      .from('projects')
      .select('rating, feedback_text, reviewer_name, reviewer_avatar, created_at')
      .not('feedback_text', 'is', null)
      .not('feedback_text', 'eq', '')
      .eq('review_public', true)
      .gte('rating', 4)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      // Older deployments may not have the consent column yet. Fail closed:
      // keep reviews private and return an empty public list instead of a 500.
      if (error.code === '42703') {
        return NextResponse.json({ success: true, reviews: [] });
      }
      throw error;
    }

    return NextResponse.json({ success: true, reviews: reviews || [] });
  } catch (error) {
    console.error("Reviews API Error:", error);
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}
