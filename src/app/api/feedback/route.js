import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase';
import { authenticateRequest } from '@/lib/projectAccess';
import { authenticateAdminRequest } from '@/lib/adminAuth';
import { enforceRateLimit } from '@/lib/rateLimit';

const statuses = ['Under review', 'Planned', 'In progress', 'Completed', 'Closed'];
const fields = 'id,user_id,author_name,title,body,category,status,created_at';
const uuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail = (message, status = 400) => NextResponse.json({ error: message }, { status });
function dbError(error) {
  return fail(['42P01','PGRST205'].includes(error?.code) ? 'The feedback board is being set up. Please try again later.' : 'Unable to update feedback. Please try again.', 503);
}
async function viewer(request) {
  if (!request.headers.get('authorization')) return { user: null, isAdmin: false };
  const { user } = await authenticateRequest(request);
  const admin = user ? await authenticateAdminRequest(request) : null;
  return { user, isAdmin: !!admin?.user };
}

async function authorAvatars(rows) {
  const entries = await Promise.all([...new Set(rows.map(row => row.user_id))].map(async id => {
    try {
      const { data, error } = await adminSupabase.auth.admin.getUserById(id);
      const metadata = error ? null : data?.user?.user_metadata;
      const url = metadata?.avatar_url || metadata?.picture;
      return [id, typeof url === 'string' && url.startsWith('https://') ? url : null];
    } catch { return [id, null]; }
  }));
  return new Map(entries);
}

export async function GET(request) {
  if (!adminSupabase) return fail('Feedback is temporarily unavailable.', 503);
  const { user, isAdmin } = await viewer(request);
  const postId = new URL(request.url).searchParams.get('postId');
  if (postId) {
    if (!uuid(postId)) return fail('Invalid post.');
    const { data, error } = await adminSupabase.from('feedback_comments').select('id,post_id,user_id,author_name,body,created_at').eq('post_id', postId).order('created_at').limit(200);
    if (error) return dbError(error);
    const avatars = await authorAvatars(data);
    return NextResponse.json({ comments: data.map(({ user_id, ...row }) => ({ ...row, avatarUrl: avatars.get(user_id), canManage: isAdmin || user_id === user?.id })) });
  }
  const { data, error } = await adminSupabase.from('feedback_posts').select(`${fields},feedback_votes(count),feedback_comments(count)`).order('created_at', { ascending: false }).limit(100);
  if (error) return dbError(error);
  const votes = user && data.length ? await adminSupabase.from('feedback_votes').select('post_id').eq('user_id', user.id).in('post_id', data.map(p => p.id)) : { data: [] };
  if (votes.error) return dbError(votes.error);
  const voted = new Set((votes.data || []).map(v => v.post_id));
  const avatars = await authorAvatars(data);
  return NextResponse.json({ isAdmin, posts: data.map(({ user_id, feedback_votes, feedback_comments, ...row }) => ({ ...row, avatarUrl: avatars.get(user_id), votes: feedback_votes?.[0]?.count || 0, comments: feedback_comments?.[0]?.count || 0, voted: voted.has(row.id), canManage: isAdmin || user_id === user?.id })) });
}

export async function POST(request) { return mutate(request); }
export async function PATCH(request) { return mutate(request); }
export async function DELETE(request) { return mutate(request); }

async function mutate(request) {
  if (!adminSupabase) return fail('Feedback is temporarily unavailable.', 503);
  const { user, isAdmin } = await viewer(request);
  if (!user) return fail('Sign in to participate.', 401);
  const limit = await enforceRateLimit({ namespace: 'feedback-write', identifier: user.id, max: 20, window: '60 s' });
  if (!limit.success) return limit.response;
  const input = await request.json().catch(() => null);
  if (!input) return fail('Invalid request.');
  const { kind, id, postId } = input;
  const author_name = String(user.user_metadata?.full_name || user.user_metadata?.name || 'Syncraft member').replace(/\S+@\S+/g, 'Syncraft member').slice(0, 80);
  if (kind === 'vote') {
    if (!uuid(postId) || !['POST','DELETE'].includes(request.method)) return fail('Invalid vote.');
    const query = request.method === 'POST'
      ? adminSupabase.from('feedback_votes').upsert({ post_id: postId, user_id: user.id }, { onConflict: 'post_id,user_id' })
      : adminSupabase.from('feedback_votes').delete().eq('post_id', postId).eq('user_id', user.id);
    const { error } = await query;
    return error ? dbError(error) : NextResponse.json({ success: true });
  }
  if (!['post','comment'].includes(kind)) return fail('Invalid feedback type.');
  const table = kind === 'post' ? 'feedback_posts' : 'feedback_comments';
  if (request.method !== 'POST') {
    if (!uuid(id)) return fail('Invalid feedback.');
    const { data, error } = await adminSupabase.from(table).select('user_id').eq('id', id).maybeSingle();
    if (error) return dbError(error);
    if (!data || (!isAdmin && data.user_id !== user.id)) return fail('Access denied.', 403);
    if (request.method === 'DELETE') {
      const { error: deleteError } = await adminSupabase.from(table).delete().eq('id', id);
      return deleteError ? dbError(deleteError) : NextResponse.json({ success: true });
    }
    if (kind === 'post' && input.status !== undefined) {
      if (!isAdmin || !statuses.includes(input.status)) return fail('Admin access required.', 403);
      const { error: updateError } = await adminSupabase.from(table).update({ status: input.status }).eq('id', id);
      return updateError ? dbError(updateError) : NextResponse.json({ success: true });
    }
  }
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (body.length < (kind === 'post' ? 10 : 1) || body.length > (kind === 'post' ? 4000 : 2000)) return fail('Please check the details length.');
  if (kind === 'post' && (title.length < 5 || title.length > 120 || !['feature','bug'].includes(input.category))) return fail('Add a title (5–120 characters) and valid category.');
  if (kind === 'comment' && request.method === 'POST' && !uuid(postId)) return fail('Invalid post.');
  const values = kind === 'post' ? { title, body, category: input.category } : { body };
  const query = request.method === 'POST'
    ? adminSupabase.from(table).insert({ ...values, user_id: user.id, author_name, ...(kind === 'comment' ? { post_id: postId } : {}) })
    : adminSupabase.from(table).update(values).eq('id', id);
  const { error } = await query;
  return error ? dbError(error) : NextResponse.json({ success: true });
}
