import { adminSupabase } from '@/lib/supabase';
import { authenticateRequest } from '@/lib/projectAccess';
import { authenticateAdminRequest } from '@/lib/adminAuth';
import { COMMUNITY_BUCKET, isCommunityId } from '@/lib/community.mjs';

export const runtime = 'nodejs';
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const missing = () => new Response(null, { status: 404, headers });
  if (!adminSupabase || !isCommunityId(id)) return missing();
  const { data, error } = await adminSupabase.from('community_submissions').select('user_id,status,logo_path').eq('id', id).maybeSingle();
  if (error || !data) return missing();
  if (data.status !== 'approved') {
    const { user } = await authenticateRequest(request);
    if (!user) return missing();
    if (user.id !== data.user_id && !(await authenticateAdminRequest(request)).user) return missing();
  }
  const { data: file, error: downloadError } = await adminSupabase.storage.from(COMMUNITY_BUCKET).download(data.logo_path);
  if (downloadError || !file) return missing();
  return new Response(await file.arrayBuffer(), { headers: { ...headers, 'Content-Type': 'image/webp' } });
}
