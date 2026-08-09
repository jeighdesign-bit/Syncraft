import { adminSupabase } from "@/lib/supabase";

const DEFAULT_ADMIN_EMAIL = "lloyddumzofficial@gmail.com";

function configuredAdminEmails() {
  return new Set(
    [process.env.ADMIN_EMAIL, process.env.NEXT_PUBLIC_ADMIN_EMAIL, DEFAULT_ADMIN_EMAIL]
      .filter(Boolean)
      .map((email) => email.trim().toLowerCase())
  );
}

export async function authenticateAdminRequest(request) {
  if (!adminSupabase) {
    return { user: null, status: 503, error: "Admin services are not configured." };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { user: null, status: 401, error: "Unauthorized" };

  const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
  if (authError || !user) return { user: null, status: 401, error: "Unauthorized" };

  if (configuredAdminEmails().has((user.email || "").toLowerCase())) {
    return { user, status: 200, error: null };
  }

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_admin) {
    return { user: null, status: 403, error: "Forbidden. Admin access required." };
  }

  return { user, status: 200, error: null };
}
