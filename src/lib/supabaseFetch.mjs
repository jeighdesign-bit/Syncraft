import { Agent } from 'undici';

// Keep this scoped to Supabase. A long-lived HTTP/2 connection was failing with
// NGHTTP2_ENHANCE_YOUR_CALM and making valid sessions appear signed out.
const dispatcher = new Agent({ allowH2: false, connections: 8 });

export function supabaseFetch(input, init = {}) {
  return fetch(input, { ...init, dispatcher });
}
