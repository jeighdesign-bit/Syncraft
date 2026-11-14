import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/supabase';
import { authenticateAdminRequest } from '@/lib/adminAuth';
import { COMMUNITY_FIELDS, boundedCommunityRequest, isCommunityId } from '@/lib/community.mjs';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.user) return json({ error: auth.error }, auth.status);
  const { data, error } = await adminSupabase.from('community_submissions').select(`${COMMUNITY_FIELDS},user_id,consent_at,reviewed_at`).order('updated_at', { ascending: false }).limit(200);
  return error ? json({ error: 'Community review is unavailable. Check that the community database setup has been applied.' }, 503) : json({ submissions: data });
}

export async function PATCH(request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.user) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await (await boundedCommunityRequest(request, 4096)).json(); } catch { return json({ error: 'Invalid review.' }, 400); }
  if (!isCommunityId(body?.id) || !isCommunityId(body?.revision) || !['approved','changes_requested'].includes(body?.status)) return json({ error: 'Invalid review.' }, 400);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 500 || (body.status === 'changes_requested' && !note)) return json({ error: 'Add a reason for requesting changes (up to 500 characters).' }, 400);
  const now = new Date().toISOString();
  const { data, error } = await adminSupabase.from('community_submissions').update({
    status: body.status, review_note: note, reviewed_by: auth.user.id, reviewed_at: now, updated_at: now, revision: randomUUID(),
  }).eq('id', body.id).eq('revision', body.revision).neq('status', 'withdrawn').select(COMMUNITY_FIELDS).maybeSingle();
  if (error) return json({ error: 'Unable to save the review.' }, 503);
  return data ? json({ submission: data }) : json({ error: 'This submission changed or was withdrawn. Refresh before reviewing it.' }, 409);
}
