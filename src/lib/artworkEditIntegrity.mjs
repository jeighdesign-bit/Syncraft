import { createHmac, timingSafeEqual } from 'node:crypto';

// JSONB may reorder object keys. Sign canonical data rather than serialization
// order so server-owned billing/job state cannot be forged via project updates.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function signArtworkEditState(projectId, state, secret) {
  if (!secret) throw new Error('Artwork edit signing is not configured.');
  const { signature, ...data } = state;
  return createHmac('sha256', secret).update(canonical({ projectId, data })).digest('hex');
}
export function verifyArtworkEditState(projectId, state, secret) {
  if (state == null) return true;
  if (!/^[a-f0-9]{64}$/.test(state.signature || '')) return false;
  const expected = signArtworkEditState(projectId, state, secret);
  return timingSafeEqual(Buffer.from(state.signature, 'hex'), Buffer.from(expected, 'hex'));
}
