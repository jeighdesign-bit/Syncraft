import { adminSupabase } from '@/lib/supabase';
import { authenticateGalleryRequest } from '@/lib/adminGalleryAuth';
import { PROJECT_RETENTION_MS } from '@/lib/projectAccess';
import { HISTORY_FIELDS, HISTORY_PAGE_SIZE, parseHistoryParams, historyCursor, historyExpiry, historySummary, outputImage } from '@/lib/adminGenerationHistory.mjs';

export const runtime = 'nodejs';
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } });

export async function GET(request) {
  try {
    const auth = await authenticateGalleryRequest(request);
    if (!auth.user) return json({ error: auth.error }, auth.status);
    let filters;
    try { filters = parseHistoryParams(new URL(request.url).searchParams); }
    catch (error) { return json({ error: error.message }, 400); }
    const now = Date.now();
    const cutoff = new Date(now - PROJECT_RETENTION_MS).toISOString();
    if (filters.id) {
      const { data: project, error } = await adminSupabase.from('projects').select(HISTORY_FIELDS).eq('id', filters.id).gt('created_at', cutoff).maybeSingle();
      if (error) throw error;
      if (!project || historyExpiry(project, PROJECT_RETENTION_MS) <= now || !outputImage(project)) return json({ error: 'Result not found or expired.' }, 404);
      // Resolve account details only when a result is opened, never one Auth
      // lookup per thumbnail or a scan of the entire user directory.
      const [account, usage] = await Promise.allSettled([
        adminSupabase.auth.admin.getUserById(project.user_id),
        adminSupabase.from('provider_usage_logs').select('provider,endpoint,estimated_cost_usd,request_status,metadata,created_at').eq('project_id', project.id).order('created_at', { ascending: false }).limit(8),
      ]);
      const email = account.status === 'fulfilled' ? account.value.data?.user?.email || null : null;
      const activity = usage.status === 'fulfilled' && !usage.value.error ? (usage.value.data || []).map(row => ({
        provider: row.provider, model: String(row.metadata?.model || row.endpoint || '').slice(0, 160),
        costUsd: row.estimated_cost_usd == null ? null : Number(row.estimated_cost_usd),
        status: row.request_status, createdAt: row.created_at,
      })) : [];
      return json({ project: { ...historySummary(project, PROJECT_RETENTION_MS), email, activity } });
    }
    let query = adminSupabase.from('projects').select(HISTORY_FIELDS)
      .gt('created_at', cutoff).or('generated_image_url.not.is.null,upscaled_image_url.not.is.null')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(HISTORY_PAGE_SIZE + 1);
    if (filters.tool) query = query.eq('trace_type', filters.tool);
    if (filters.userId) query = query.eq('user_id', filters.userId);
    if (filters.cursor) query = query.or(`created_at.lt.${filters.cursor.createdAt},and(created_at.eq.${filters.cursor.createdAt},id.lt.${filters.cursor.id})`);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    const page = rows.slice(0, HISTORY_PAGE_SIZE);
    return json({
      projects: page.filter(row => outputImage(row) && historyExpiry(row, PROJECT_RETENTION_MS) > now).map(row => historySummary(row, PROJECT_RETENTION_MS)),
      nextCursor: rows.length > HISTORY_PAGE_SIZE && page.length ? historyCursor(page[page.length - 1]) : null,
      retentionDays: PROJECT_RETENTION_MS / 86_400_000,
    });
  } catch (error) {
    console.error('[Admin history] Read failed:', error.code || error.name || 'Error');
    return json({ error: 'Unable to load generation history. Please retry.' }, 503);
  }
}
