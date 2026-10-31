// Never replay a submission: losing its response can still represent paid work.
export async function artworkEditProviderRequest(
  path,
  input,
  { apiKey = process.env.FAL_KEY, fetchImpl = fetch } = {},
) {
  if (!apiKey) throw Object.assign(new Error('AI Edit is not configured.'), { status: 503 });
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(`https://queue.fal.run/${path}`, {
      method: input ? 'POST' : 'GET',
      headers: {
        Authorization: `Key ${apiKey}`,
        ...(input ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
      signal: AbortSignal.timeout(input ? 25000 : 15000),
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const providerCode = body?.detail?.[0]?.type;
      throw Object.assign(
        new Error('AI Edit is temporarily unavailable. Please try again shortly.'),
        {
          status: 503,
          providerStatus: response.status,
          providerCode: [
            'file_download_error',
            'image_too_large',
            'content_policy_violation',
          ].includes(providerCode)
            ? providerCode
            : undefined,
          // These responses definitively refused the request, including body-size
          // and endpoint errors. Timeouts and 5xx responses remain ambiguous.
          definiteRejection:
            !!input && [400, 401, 402, 403, 404, 405, 413, 415, 422, 429].includes(response.status),
          providerTerminal:
            response.headers.get('x-fal-request-timeout-type') === 'user' ||
            (!input && [400, 422].includes(response.status)),
        },
      );
    }
    return await response.json();
  } catch (error) {
    error.elapsedMs = Date.now() - startedAt;
    throw error;
  }
}

// Store only diagnostic codes; never persist auth headers, image data or raw
// provider error bodies that can contain the submitted input.
export function artworkEditFailureDetails(error, stage) {
  return {
    stage,
    errorName: String(error.name || 'Error').slice(0, 80),
    errorCode: String(error.code || '').slice(0, 80) || null,
    causeCode: String(error.cause?.code || '').slice(0, 80) || null,
    providerStatus: error.providerStatus || null,
    elapsedMs: error.elapsedMs ?? null,
  };
}
