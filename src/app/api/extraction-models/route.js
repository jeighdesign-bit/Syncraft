import { isLocalOpenAiRequest, readLocalOpenAiKey, localOpenAiModel } from '@/lib/localOpenAiExtraction.mjs';

export const runtime = 'nodejs';

// Public capabilities only. Keys and provider model identifiers stay on the server.
export async function GET(request) {
  const enabled = isLocalOpenAiRequest(request);
  let configured = false;
  if (enabled) {
    try { localOpenAiModel(); configured = Boolean(await readLocalOpenAiKey()); }
    catch { configured = false; }
  }
  return Response.json({ enabled, configured, resolutions: ['1K', '2K', '4K'] }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
