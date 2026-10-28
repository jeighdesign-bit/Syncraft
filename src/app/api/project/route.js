import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { deleteFromR2 } from "@/lib/cloudflare";
import { authenticateRequest, getProjectAccess, PROJECT_ACCESS } from "@/lib/projectAccess";
import { LOGO_ACTIVE, logoStudioAssetUrls } from "@/lib/logoStudio.mjs";
import { parseSupabaseProjectAssetUrl } from "@/lib/storageCleanup";

export async function PATCH(request) {
  try {
    const { user } = await authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId, newName } = await request.json();
    const name = typeof newName === 'string' ? newName.replace(/<[^>]*>/g, '').trim() : '';
    if (!projectId || !name || name.length > 100) return NextResponse.json({ error: 'Use a project name of 1 to 100 characters.' }, { status: 400 });

    const access = await getProjectAccess(user.id, projectId, { required: PROJECT_ACCESS.EDIT, select: "id,user_id,created_at" });
    if (!access.project) return NextResponse.json({ error: access.error }, { status: 403 });

    const { error } = await adminSupabase
      .from('projects')
      .update({ name })
      .eq('id', projectId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error renaming project:", error);
    return NextResponse.json({ error: "Failed to rename project" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { user } = await authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('id');

    if (!projectId) {
      return NextResponse.json({ error: "No project ID provided" }, { status: 400 });
    }

    // 1. Get the project — only if the user owns it
    const { data: project, error: fetchError } = await adminSupabase
      .from('projects')
      .select('original_image_url, generated_image_url, upscaled_image_url, svg_url, zip_url, user_id, canvas_data')
      .eq('id', projectId)
      .eq('user_id', user.id) // ownership check
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
    }

    if (project.canvas_data?.tool === 'logo_studio' && project.canvas_data.jobs?.some(job => LOGO_ACTIVE.includes(job.status))) {
      return NextResponse.json({ error: 'Wait for active logo operations to finish before deleting this project.' }, { status: 409 });
    }

    // 2. Delete the record from Supabase database
    const { error: deleteError } = await adminSupabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', user.id);

    if (deleteError) throw deleteError;

    // 3. Delete files from Cloudflare R2 to save storage costs
    const allowedPrefixes = [`users/${user.id}/`, `projects/${projectId}/`];
    const logoAssets = logoStudioAssetUrls(project.canvas_data);
    const assetUrls = [...new Set([...logoAssets, project.original_image_url, project.generated_image_url,
      project.upscaled_image_url, project.svg_url, project.zip_url].filter(url => url && url !== 'REFUNDED'))];
    const cleanup = await Promise.allSettled(assetUrls.map(async url => {
      const fallbackPath = parseSupabaseProjectAssetUrl(url);
      if (fallbackPath && allowedPrefixes.some(prefix => fallbackPath.startsWith(prefix))) {
        const { error } = await adminSupabase.storage.from('project-assets').remove([fallbackPath]);
        if (error) throw error;
      } else {
        await deleteFromR2(url, { allowedPrefixes });
      }
    }));
    for (const result of cleanup) if (result.status === 'rejected') console.error('Project asset cleanup failed:', result.reason);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
