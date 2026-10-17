import { NextResponse } from "next/server";
import { authenticateRequest, getProjectAccess, projectExpiresAt } from "@/lib/projectAccess";

export async function GET(request) {
  const { user } = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = new URL(request.url).searchParams.get("id");
  if (!projectId) return NextResponse.json({ error: "Project ID is required" }, { status: 400 });

  const result = await getProjectAccess(user.id, projectId);
  if (!result.project) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  return NextResponse.json({
    project: result.project,
    access: result.access,
    expiresAt: projectExpiresAt(result.project)?.toISOString() || null,
  });
}

