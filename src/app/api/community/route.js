import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { adminSupabase } from '@/lib/supabase';
import { authenticateRequest } from '@/lib/projectAccess';
import { enforceRateLimit } from '@/lib/rateLimit';
import { COMMUNITY_BUCKET, COMMUNITY_FIELDS, MAX_LOGO_BYTES, boundedCommunityRequest, isCommunityId, publicCommunityEntry, validateCommunityDetails } from '@/lib/community.mjs';

export const runtime = 'nodejs';
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unavailable = () => json({ error: 'Community submissions are being set up. Please try again later.' }, 503);

export async function GET(request) {
  if (!adminSupabase) return unavailable();
  const own = new URL(request.url).searchParams.get('mine') === '1';
  if (own) {
    const { user } = await authenticateRequest(request);
    if (!user) return json({ error: 'Sign in to view your submission.' }, 401);
    const { data, error } = await adminSupabase.from('community_submissions').select(COMMUNITY_FIELDS).eq('user_id', user.id).maybeSingle();
    return error ? unavailable() : json({ submission: data });
  }
  const { data, error } = await adminSupabase.from('community_submissions').select('id,business_name,website,revision').eq('status', 'approved').order('created_at').limit(200);
  if (error) return unavailable();
  return json({ businesses: data.map(publicCommunityEntry) });
}

export async function POST(request) {
  if (!adminSupabase) return unavailable();
  const { user } = await authenticateRequest(request);
  if (!user) return json({ error: 'Sign in to submit your logo.' }, 401);
  const limit = await enforceRateLimit({ namespace: 'community-submit', identifier: user.id, max: 5, window: '60 s' });
  if (!limit.success) return limit.response;
  let path;
  try {
    const form = await (await boundedCommunityRequest(request)).formData();
    const details = validateCommunityDetails({ businessName: form.get('businessName'), website: form.get('website'), consent: form.get('consent') === 'true' });
    const file = form.get('logo');
    if (!file || typeof file.arrayBuffer !== 'function' || !file.size || file.size > MAX_LOGO_BYTES) return json({ error: 'Upload a transparent PNG logo up to 2 MB.' }, 400);
    const input = Buffer.from(await file.arrayBuffer());
    let output;
    try {
      const image = sharp(input, { limitInputPixels: 16_000_000 });
      const metadata = await image.metadata();
      if (metadata.format !== 'png' || (metadata.pages || 1) > 1) return json({ error: 'Upload a still PNG logo with a transparent background.' }, 400);
      if (!metadata.hasAlpha) return json({ error: 'Remove the background first, then upload a transparent PNG.' }, 400);
      const stats = await image.stats();
      const alpha = stats.channels.at(-1);
      if (alpha.max === 0) return json({ error: 'This PNG is empty. Choose a visible logo with a transparent background.' }, 400);
      if (alpha.min !== 0) return json({ error: 'Remove the background first, then upload a transparent PNG.' }, 400);
      output = await image.rotate().resize({ width: 640, height: 320, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    } catch { return json({ error: 'Use a valid, still transparent PNG logo under 16 megapixels.' }, 400); }
    const { data: previous, error: readError } = await adminSupabase.from('community_submissions').select('logo_path').eq('user_id', user.id).maybeSingle();
    if (readError) return unavailable();
    path = `${user.id}/${randomUUID()}.webp`;
    const bucket = adminSupabase.storage.from(COMMUNITY_BUCKET);
    const { error: uploadError } = await bucket.upload(path, output, { contentType: 'image/webp', upsert: false });
    if (uploadError) return unavailable();
    const now = new Date().toISOString();
    const { data, error } = await adminSupabase.from('community_submissions').upsert({
      ...details, user_id: user.id, logo_path: path, consent_at: now, status: 'pending', review_note: '',
      reviewed_by: null, reviewed_at: null, revision: randomUUID(), updated_at: now,
    }, { onConflict: 'user_id' }).select(COMMUNITY_FIELDS).single();
    if (error) { await bucket.remove([path]); return unavailable(); }
    // The committed logo must survive any later cleanup/response failure.
    path = null;
    if (previous?.logo_path) await bucket.remove([previous.logo_path]).catch(() => {});
    return json({ submission: data }, 201);
  } catch (error) {
    if (path) await adminSupabase.storage.from(COMMUNITY_BUCKET).remove([path]).catch(() => {});
    if (error.message === 'REQUEST_TOO_LARGE') return json({ error: 'Upload a logo up to 2 MB.' }, 413);
    // Validation errors are safe to display; provider details stay server-side.
    if (/^(Use |Enter |Please confirm|Empty request)/.test(error.message)) return json({ error: error.message }, 400);
    console.error('[Community] Submission failed:', error.message);
    return unavailable();
  }
}

export async function DELETE(request) {
  if (!adminSupabase) return unavailable();
  const { user } = await authenticateRequest(request);
  if (!user) return json({ error: 'Sign in to withdraw your submission.' }, 401);
  let body;
  try { body = await (await boundedCommunityRequest(request, 4096)).json(); } catch { return json({ error: 'Invalid submission.' }, 400); }
  if (!isCommunityId(body?.revision)) return json({ error: 'Invalid submission.' }, 400);
  const { data, error } = await adminSupabase.from('community_submissions').update({ status: 'withdrawn', revision: randomUUID(), updated_at: new Date().toISOString(), reviewed_by: null, reviewed_at: null, review_note: '' }).eq('user_id', user.id).eq('revision', body.revision).select(COMMUNITY_FIELDS).maybeSingle();
  if (error) return unavailable();
  return data ? json({ submission: data }) : json({ error: 'Your submission changed. Refresh and try again.' }, 409);
}
