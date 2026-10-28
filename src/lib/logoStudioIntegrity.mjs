import { createHmac, timingSafeEqual } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}

export function signLogoState(state, userId, projectId, secret) {
  if (!secret) throw new Error('Logo Studio storage authentication is not configured.');
  const { signature: _signature, ...content } = state;
  return createHmac('sha256', secret).update(JSON.stringify(canonical({ content, userId, projectId }))).digest('hex');
}

export function verifyLogoState(state, userId, projectId, secret) {
  if (!state || typeof state.signature !== 'string' || !/^[a-f0-9]{64}$/.test(state.signature)) return false;
  const expected = signLogoState(state, userId, projectId, secret);
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(state.signature, 'hex'));
}
