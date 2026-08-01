import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";

export const dynamic = 'force-dynamic'; // Ensures truly real-time updates on every page load

export async function GET() {
  try {
    const { count, error } = await adminSupabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.error("Failed to fetch user stats", error);
      return NextResponse.json(
        { success: false, totalUsers: 0, avatars: [] },
        { status: 200 }
      );
    }

    // Securely fetch real avatars without leaking emails
    const { data: authData, error: authError } = await adminSupabase.auth.admin.listUsers();
    let realAvatars = [];
    
    if (!authError && authData && authData.users) {
      realAvatars = authData.users
        .map(u => u.user_metadata?.avatar_url) // Extract only the avatar string
        .filter(url => url)                    // Remove nulls/undefined
        .slice(0, 5);                          // Get only top 5
    }

    return NextResponse.json({
      success: true,
      totalUsers: count || 0,
      avatars: realAvatars
    });
  } catch (err) {
    console.error("Failed to fetch user stats", err);
    return NextResponse.json(
      { success: false, totalUsers: 0, avatars: [] },
      { status: 200 }
    );
  }
}
