export const COMMUNITY_BUCKET = 'community-logos';
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const COMMUNITY_FIELDS = 'id,business_name,website,status,review_note,revision,created_at,updated_at';
export const isCommunityId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validateCommunityDetails(input) {
  const businessName = typeof input.businessName === 'string' ? input.businessName.trim() : '';
  if (businessName.length < 2 || businessName.length > 100) throw new Error('Use a business name between 2 and 100 characters.');
  if (input.consent !== true) throw new Error('Please confirm that you represent this business and authorize us to display its logo.');
  const raw = typeof input.website === 'string' ? input.website.trim() : '';
  if (!raw || raw.length > 500) throw new Error('Enter a valid website or social media link.');
  let url;
  try { url = new URL(raw.includes('://') ? raw : `https://${raw}`); } catch { throw new Error('Enter a valid website or social media link.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || url.hostname.endsWith('.localhost')) {
    throw new Error('Use a public http or https website or social media link.');
  }
  return { business_name: businessName, website: url.href };
}

export function publicCommunityEntry(row) {
  return { id: row.id, business_name: row.business_name, website: row.website, logo_url: `/api/community/logo?id=${row.id}&v=${row.revision}` };
}

// Bound the actual stream, including requests without a Content-Length header.
export async function boundedCommunityRequest(request, maxBytes = MAX_LOGO_BYTES + 64 * 1024) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new Error('REQUEST_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty request.');
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error('REQUEST_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Request(request.url, { method: request.method, headers: request.headers, body: Buffer.concat(chunks) });
}
