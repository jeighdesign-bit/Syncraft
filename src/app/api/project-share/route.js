import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { authenticateRequest, getProjectAccess, PROJECT_ACCESS, projectExpiresAt } from "@/lib/projectAccess";

const VALID_ROLES = new Set([PROJECT_ACCESS.VIEW, PROJECT_ACCESS.EDIT]);

function publicAvatarUrl(user) {
  const candidate = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  return typeof candidate === "string" && candidate.startsWith("https://") ? candidate : null;
}

async function requireOwner(request, projectId) {
  const { user } = await authenticateRequest(request);
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const result = await getProjectAccess(user.id, projectId, { required: PROJECT_ACCESS.OWNER });
  if (!result.project) {
    return { response: NextResponse.json({ error: result.error }, { status: 403 }) };
  }
  return { user, project: result.project };
}

export async function GET(request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
  const auth = await requireOwner(request, projectId);
  if (auth.response) return auth.response;

  const { data: rows, error } = await adminSupabase
    .from("project_collaborators")
    .select("user_id,role,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Unable to load collaborators" }, { status: 500 });

  const ids = rows.map((row) => row.user_id);
  const { data: profiles } = ids.length
    ? await adminSupabase.from("profiles").select("id,email").in("id", ids)
    : { data: [] };
  const emailById = new Map((profiles || []).map((profile) => [profile.id, profile.email]));
  const authUsers = await Promise.all(ids.map(async (id) => {
    const { data, error: authError } = await adminSupabase.auth.admin.getUserById(id);
    return authError ? [id, null] : [id, data?.user || null];
  }));
  const authUserById = new Map(authUsers);

  return NextResponse.json({
    collaborators: rows.map((row) => ({
      ...row,
      email: emailById.get(row.user_id) || "Syncraft user",
      avatarUrl: publicAvatarUrl(authUserById.get(row.user_id)),
    })),
    owner: {
      id: auth.user.id,
      email: auth.user.email,
      avatarUrl: publicAvatarUrl(auth.user),
    },
    expiresAt: projectExpiresAt(auth.project)?.toISOString() || null,
  });
}

export async function POST(request) {
  const body = await request.json();
  const projectId = body.projectId;
  const role = String(body.role || "").toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  if (!projectId || !email || !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: "Enter a valid Syncraft email and permission" }, { status: 400 });
  }
  const auth = await requireOwner(request, projectId);
  if (auth.response) return auth.response;
  if (auth.user.email?.toLowerCase() === email) {
    return NextResponse.json({ error: "You already own this project" }, { status: 400 });
  }

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id,email")
    .ilike("email", email)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Invite unavailable. Ask them to create a Syncraft account first." }, { status: 404 });
  }

  const { error } = await adminSupabase.from("project_collaborators").upsert({
    project_id: projectId,
    user_id: profile.id,
    role,
    invited_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id,user_id" });
  if (error) return NextResponse.json({ error: "Unable to share this project" }, { status: 500 });

  return NextResponse.json({ collaborator: { user_id: profile.id, email: profile.email, role } });
}

export async function PATCH(request) {
  const body = await request.json();
  if (!body.projectId || !body.userId || !VALID_ROLES.has(body.role)) {
    return NextResponse.json({ error: "Invalid collaboration update" }, { status: 400 });
  }
  const auth = await requireOwner(request, body.projectId);
  if (auth.response) return auth.response;
  const { error } = await adminSupabase.from("project_collaborators")
    .update({ role: body.role, updated_at: new Date().toISOString() })
    .eq("project_id", body.projectId).eq("user_id", body.userId);
  if (error) return NextResponse.json({ error: "Unable to update permission" }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const userId = url.searchParams.get("userId");
  if (!projectId || !userId) return NextResponse.json({ error: "Invalid collaborator" }, { status: 400 });
  const auth = await requireOwner(request, projectId);
  if (auth.response) return auth.response;
  const { error } = await adminSupabase.from("project_collaborators")
    .delete().eq("project_id", projectId).eq("user_id", userId);
  if (error) return NextResponse.json({ error: "Unable to remove collaborator" }, { status: 500 });
  return NextResponse.json({ success: true });
}

