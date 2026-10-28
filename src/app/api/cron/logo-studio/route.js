import { adminSupabase } from '@/lib/supabase';
import { ownedLogoProject, refreshLogoJob } from '@/lib/logoStudioServer';
import { LOGO_ACTIVE } from '@/lib/logoStudio.mjs';

export const runtime = 'nodejs';
export const maxDuration = 180;

// Finish queued outputs and reconcile interrupted charges even when the user
// closes the browser. Runs separately from retention cleanup.
export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  const { data, error } = await adminSupabase.from('projects').select('id,user_id')
    .eq('canvas_data->>tool', 'logo_studio').eq('canvas_data->>activity', 'active')
    .gte('created_at', new Date(Date.now() - 3 * 86400_000).toISOString())
    .order('created_at', { ascending: true }).limit(20);
  if (error) return Response.json({ error: 'Could not load active logo jobs.' }, { status: 500 });
  let checked = 0; let errors = 0;
  for (const row of data) {
    if (Date.now() - started > 120_000) break;
    try {
      let project = await ownedLogoProject(row.user_id, row.id);
      for (const job of project.canvas_data.jobs.filter(item => LOGO_ACTIVE.includes(item.status))) {
        if (Date.now() - started > 120_000) break;
        project = await refreshLogoJob(row.user_id, project, job.id); checked++;
      }
    } catch (err) { console.error('[Logo reconciliation]', err.message); errors++; }
  }
  return Response.json({ checked, errors });
}
