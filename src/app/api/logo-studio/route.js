import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase';
import { authenticateRequest, PROJECT_ACCESS } from '@/lib/projectAccess';
import { enforceRateLimit } from '@/lib/rateLimit';
import { publicLogoProject, validateLogoOperation, UUID } from '@/lib/logoStudio.mjs';
import { accessibleLogoProject, startLogoOperation, startLogoTextBatch, refreshLogoJob } from '@/lib/logoStudioServer';
import { createLogoState } from '@/lib/logoStudioServer';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function GET(request) {
  const { user } = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limit = await enforceRateLimit({ namespace: 'logo-status', identifier: user.id, max: 100, window: '60 s', windowMs: 60_000 });
  if (!limit.success) return limit.response;
  const { searchParams } = new URL(request.url);
  try {
    const id = searchParams.get('id');
    if (!id) {
      const { data, error } = await adminSupabase.from('projects').select('id,name,created_at')
        .eq('user_id', user.id).eq('canvas_data->>tool', 'logo_studio')
        .gte('created_at', new Date(Date.now() - 3 * 86400_000).toISOString()).order('created_at', { ascending: false }).limit(50);
      if (error) throw new Error('Could not load logo projects.');
      return NextResponse.json({ projects: data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid project ID.' }, { status: 400 });
    const authorized = await accessibleLogoProject(user.id, id);
    let project = authorized.project;
    // Reading a saved job may finish its existing output, never start a paid operation.
    if (searchParams.get('job')) project = await refreshLogoJob(project.user_id, project, searchParams.get('job'));
    return NextResponse.json({ project: publicLogoProject(project, authorized.access) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(request) {
  const { user } = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limit = await enforceRateLimit({ namespace: 'logo-create', identifier: user.id, max: 12, window: '60 s', windowMs: 60_000 });
  if (!limit.success) return limit.response;
  try {
    if (Number(request.headers.get('content-length') || 0) > 16_384) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    const body = await request.json();
    if (JSON.stringify(body).length > 16_384) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    if (body.action === 'create') {
      const name = String(body.name || 'Untitled logo').replace(/<[^>]*>/g, '').trim().slice(0, 100) || 'Untitled logo';
      const id = crypto.randomUUID();
      const { data, error } = await adminSupabase.from('projects').insert({ id, user_id: user.id, name,
        trace_type: 'logo', original_image_url: null,
        canvas_data: createLogoState(user.id, id) }).select('*').single();
      if (error) throw new Error('Could not create your logo project.');
      return NextResponse.json({ project: publicLogoProject(data) });
    }
    if (!UUID.test(body.projectId || '')) throw new Error('Invalid project ID.');
    const input = validateLogoOperation(body);
    const { project, access } = await accessibleLogoProject(user.id, body.projectId, PROJECT_ACCESS.EDIT);
    const updated = body.action === 'generate-text-batch'
      ? await startLogoTextBatch(user.id, project, input, body.count)
      : await startLogoOperation(user.id, project, input);
    return NextResponse.json({ project: publicLogoProject(updated, access) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
