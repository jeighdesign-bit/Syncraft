import { NextResponse } from 'next/server';
import { authenticateRequest, PROJECT_ACCESS } from '@/lib/projectAccess';
import { enforceRateLimit } from '@/lib/rateLimit';
import { accessibleLogoProject } from '@/lib/logoStudioServer';
import { UUID } from '@/lib/logoStudio.mjs';
import { enhanceLogoPrompt } from '@/lib/logoPromptEnhancerServer';
import { normalizeLogoEnhancerInput } from '@/lib/logoPromptEnhancer.mjs';

export const runtime = 'nodejs';
export const maxDuration = 45;

export async function POST(request) {
  const { user } = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    if (Number(request.headers.get('content-length') || 0) > 8192) throw new Error('Please shorten your logo idea.');
    const body = await request.json();
    if (!body || Array.isArray(body) || JSON.stringify(body).length > 8192 || !UUID.test(body.requestId || '')
      || (body.projectId != null && (typeof body.projectId !== 'string' || !UUID.test(body.projectId)))) throw new Error('Invalid enhancement request.');
    if (body.previousSuggestion !== undefined && (typeof body.previousSuggestion !== 'string' || body.previousSuggestion.length > 1200)) throw new Error('Please shorten the previous suggestion.');
    normalizeLogoEnhancerInput(body);
    if (body.projectId) await accessibleLogoProject(user.id, body.projectId, PROJECT_ACCESS.EDIT);
    for (const limit of [
      { namespace: 'logo-enhance-minute', max: 10, window: '60 s', windowMs: 60_000 },
      { namespace: 'logo-enhance-day', max: 200, window: '1 d', windowMs: 86400_000 },
    ]) {
      const result = await enforceRateLimit({ ...limit, identifier: user.id });
      if (!result.success) return result.response;
    }
    return NextResponse.json(await enhanceLogoPrompt(user.id, body), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'The enhancer timed out. Your idea is unchanged; try again.' : error.message }, { status: 400 });
  }
}
