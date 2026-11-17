import { NextResponse } from 'next/server';
import { isLocalOpenAiRequest, readLocalOpenAiKey, localOpenAiModel, localOpenAiSettings } from '@/lib/localOpenAiExtraction.mjs';

export const runtime = 'nodejs';
// Read-only development capability discovery. Credentials are never accepted or returned.
export async function GET(request) {
  if (process.env.NODE_ENV !== 'development' || !isLocalOpenAiRequest(request)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ enabled: true, configured: Boolean(await readLocalOpenAiKey()), model: localOpenAiModel(), resolutions: ['1K', '2K', '4K'], maxOutputPixels: 8_294_400, maxOutputEdge: 3840, settings: { ...localOpenAiSettings('1:1', localOpenAiModel()), size: 'match-reference' } });
}
