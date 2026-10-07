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

    // Prefer recently active accounts, remove duplicate URLs, and return only
    // public profile-photo URLs (never email addresses or other auth data).
    const { data: authData, error: authError } = await adminSupabase.auth.admin.listUsers();
    const users = authError || !authData?.users ? [] : [...authData.users];
    const avatars = [...new Set(
      users
        .sort((a, b) => Date.parse(b.last_sign_in_at || b.created_at || 0) - Date.parse(a.last_sign_in_at || a.created_at || 0))
        .map((user) => user.user_metadata?.avatar_url)
        .filter((url) => typeof url === "string" && url.startsWith("https://"))
    )].slice(0, 5);

    return NextResponse.json({
      success: true,
      totalUsers: count || 0,
      avatars
    });
  } catch (err) {
    console.error("Failed to fetch user stats", err);
    return NextResponse.json(
      { success: false, totalUsers: 0, avatars: [] },
      { status: 200 }
    );
  }
}
