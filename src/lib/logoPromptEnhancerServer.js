import { buildLogoEnhancerInput, parseLogoEnhancedPrompt, normalizeLogoEnhancerInput, logoEnhancerContextKey, LOGO_ENHANCER_ENDPOINT, LOGO_ENHANCER_MODEL, LOGO_ENHANCER_VERSION } from './logoPromptEnhancer.mjs';
import { recordProviderUsage } from '@/lib/creditLedger';

const requests = new Map();
const ttl = 5 * 60_000;

export async function enhanceLogoPrompt(userId, body, { fetchImpl = fetch, recordUsage = recordProviderUsage, env = process.env } = {}) {
  const input = normalizeLogoEnhancerInput(body);
  const contextKey = logoEnhancerContextKey(input);
  if (!env.FAL_KEY) throw new Error('Prompt enhancement is not configured on this server.');
  const key = `${userId}:${body.requestId}`;
  const fingerprint = JSON.stringify([contextKey, body.projectId || null, body.previousSuggestion || '']);
  const now = Date.now();
  for (const [key, entry] of requests) if (entry.expires < now) requests.delete(key);
  const cached = requests.get(key);
  if (cached) {
    if (cached.fingerprint !== fingerprint) throw new Error('This enhancement request has changed. Try again.');
    return cached.promise;
  }
  const promise = (async () => {
    let payload, response, status = 'failed';
    const started = Date.now();
    try {
      // One bounded POST, no automatic paid retries and no image-model calls.
      response = await fetchImpl(`https://fal.run/${LOGO_ENHANCER_ENDPOINT}`, {
        method: 'POST', signal: AbortSignal.timeout(30_000), headers: { Authorization: `Key ${env.FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildLogoEnhancerInput(input, body.previousSuggestion)),
      });
      if (!response.ok) throw new Error(`Prompt enhancement is temporarily unavailable (${response.status}). Your idea is unchanged.`);
      payload = await response.json();
      const enhancedPrompt = parseLogoEnhancedPrompt(payload, input.prompt);
      status = 'succeeded';
      return { originalPrompt: input.prompt, enhancedPrompt, contextKey, version: LOGO_ENHANCER_VERSION };
    } finally {
      await recordUsage({ userId, projectId: body.projectId || null, provider: 'fal', endpoint: LOGO_ENHANCER_ENDPOINT,
        providerRequestId: response?.headers?.get('x-fal-request-id') || null, requestStatus: status,
        estimatedCostUsd: Number.isFinite(payload?.usage?.cost) && payload.usage.cost >= 0 ? payload.usage.cost : null,
        metadata: { feature: 'logo_prompt_enhancer', model: LOGO_ENHANCER_MODEL, version: LOGO_ENHANCER_VERSION, requestId: body.requestId,
          style: input.style, elapsedMs: Date.now() - started, imageCalls: 0,
          promptTokens: payload?.usage?.prompt_tokens, completionTokens: payload?.usage?.completion_tokens } }).catch(() => {});
    }
  })();
  requests.set(key, { fingerprint, promise, expires: now + ttl });
  if (requests.size > 200) requests.delete(requests.keys().next().value);
  return promise;
}
