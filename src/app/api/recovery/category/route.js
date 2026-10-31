import { NextResponse } from 'next/server';
import { universalUnavailableResponse } from '@/lib/universalAvailability.mjs';
import { adminSupabase } from '@/lib/supabase';
import { authenticateRequest, getProjectAccess, PROJECT_ACCESS } from '@/lib/projectAccess';
import { isReferenceCategory } from '@/lib/referenceCategories.mjs';

export async function PATCH(request) {
  try {
    const { user } = await authenticateRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const unavailable = universalUnavailableResponse();
    if (unavailable) return unavailable;
    const { projectId, referenceCategory } = await request.json();
    if (!projectId || !isReferenceCategory(referenceCategory)) return NextResponse.json({ error: 'Choose a valid reference category.' }, { status: 400 });
    const { project } = await getProjectAccess(user.id, projectId, { required: PROJECT_ACCESS.EDIT });
    if (!project || project.trace_type !== 'universal') return NextResponse.json({ error: 'Universal project not found or access denied.' }, { status: 403 });
    if (project.canvas_data?.universal_recovery?.status === 'generating') return NextResponse.json({ error: 'Wait for extraction to finish before changing the category.' }, { status: 409 });
    const canvas = project.canvas_data;
    let query = adminSupabase.from('projects').update({ canvas_data: { ...(canvas || {}), reference_category: referenceCategory } }).eq('id', projectId);
    // Avoid replacing crop, recovery or edit metadata changed by another request.
    query = canvas == null ? query.is('canvas_data', null) : query.eq('canvas_data', JSON.stringify(canvas));
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data?.length) return NextResponse.json({ error: 'The project changed while saving. Please select the category again.' }, { status: 409 });
    return NextResponse.json({ success: true, referenceCategory });
  } catch (error) {
    console.error('[Reference category]', error);
    return NextResponse.json({ error: 'Could not save the reference category. Please try again.' }, { status: 500 });
  }
}
