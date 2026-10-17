import { adminSupabase } from "@/lib/supabase";

export const PROJECT_ACCESS = Object.freeze({
  OWNER: "owner",
  EDIT: "edit",
  VIEW: "view",
});

const ACCESS_RANK = { view: 1, edit: 2, owner: 3 };
const PROJECT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export function projectExpiresAt(project) {
  if (!project?.created_at) return null;
  return new Date(new Date(project.created_at).getTime() + PROJECT_RETENTION_MS);
}

export function isProjectExpired(project) {
  const expiresAt = projectExpiresAt(project);
  return expiresAt ? expiresAt.getTime() <= Date.now() : false;
}

export async function authenticateRequest(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { user: null, error: "Unauthorized" };

  const { data: { user }, error } = await adminSupabase.auth.getUser(token);
  if (error || !user) return { user: null, error: "Unauthorized" };
  return { user, error: null };
}

export async function getProjectAccess(userId, projectId, options = {}) {
  const { select = "*", required = PROJECT_ACCESS.VIEW } = options;
  const { data: project, error } = await adminSupabase
    .from("projects")
    .select(select)
    .eq("id", projectId)
    .maybeSingle();

  if (error || !project || isProjectExpired(project)) {
    return { project: null, access: null, error: "Project not found or expired" };
  }

  let access = null;
  if (project.user_id === userId) {
    access = PROJECT_ACCESS.OWNER;
  } else {
    const { data: collaboration } = await adminSupabase
      .from("project_collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    access = collaboration?.role || null;
  }

  if (!access || ACCESS_RANK[access] < ACCESS_RANK[required]) {
    return { project: null, access, error: "Project access denied" };
  }

  return { project, access, error: null };
}

