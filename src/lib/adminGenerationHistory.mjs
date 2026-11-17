export const HISTORY_PAGE_SIZE = 18;
export const HISTORY_FIELDS = 'id,name,user_id,trace_type,created_at,original_image_url,generated_image_url,upscaled_image_url';
export const HISTORY_TOOLS = new Set(['mockup', 'logo', 'universal', 'upscale', 'bg_remover']);
export const isHistoryId = value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value || '');

export function parseHistoryParams(params) {
  const id = params.get('id') || '';
  const userId = params.get('user') || '';
  const tool = params.get('tool') || '';
  if ((id && !isHistoryId(id)) || (userId && !isHistoryId(userId)) || (tool && !HISTORY_TOOLS.has(tool))) throw new Error('Invalid history filter.');
  let cursor = null;
  const encoded = params.get('cursor');
  if (encoded) {
    if (encoded.length > 256 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid page cursor.');
    try {
      cursor = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (!isHistoryId(cursor.id) || typeof cursor.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(cursor.createdAt) || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error();
    } catch { throw new Error('Invalid page cursor.'); }
  }
  return { id, userId, tool, cursor };
}

export function historyCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: row.created_at, id: row.id })).toString('base64url');
}

export function historyExpiry(project, retentionMs) {
  const created = Date.parse(project?.created_at);
  return Number.isFinite(created) ? created + retentionMs : 0;
}

export function outputImage(project) {
  return [project?.generated_image_url, project?.upscaled_image_url].find(url => typeof url === 'string' && /^https?:\/\//.test(url)) || null;
}

export function historySummary(project, retentionMs) {
  return {
    id: project.id, name: String(project.name || 'Untitled design').slice(0, 150),
    userId: project.user_id, tool: project.trace_type, createdAt: project.created_at,
    expiresAt: new Date(historyExpiry(project, retentionMs)).toISOString(),
    hasInput: Boolean(project.original_image_url), hasOutput: Boolean(outputImage(project)),
  };
}

// Derived previews live only in bounded memory, never in a new archive or bucket.
export function createHistoryPreviewCache({ maxBytes = 6 * 1024 * 1024, maxEntries = 64 } = {}) {
  const entries = new Map();
  let bytes = 0;
  const remove = key => { const item = entries.get(key); if (item) bytes -= item.value.body.byteLength; entries.delete(key); };
  return {
    get(key, now = Date.now()) {
      const item = entries.get(key);
      if (!item) return null;
      if (item.expiresAt <= now) { remove(key); return null; }
      entries.delete(key); entries.set(key, item);
      return item.value;
    },
    set(key, value, expiresAt, now = Date.now()) {
      for (const [id, item] of entries) if (item.expiresAt <= now) remove(id);
      remove(key);
      if (expiresAt <= now || value.body.byteLength > maxBytes) return;
      while (entries.size && (entries.size >= maxEntries || bytes + value.body.byteLength > maxBytes)) remove(entries.keys().next().value);
      entries.set(key, { value, expiresAt }); bytes += value.body.byteLength;
    },
    get size() { return entries.size; },
    get bytes() { return bytes; },
  };
}

export function createHistoryWorkLimiter(limit = 2) {
  let active = 0;
  const queue = [];
  return async function run(work) {
    if (active >= limit) {
      if (queue.length >= 32) throw Object.assign(new Error('Preview queue full'), { status: 429 });
      await new Promise(resolve => queue.push(resolve));
    } else active++;
    try { return await work(); }
    finally { if (queue.length) queue.shift()(); else active--; }
  };
}
