import { Agent, fetch as undiciFetch } from 'undici';

// Keep this scoped to Supabase. A long-lived HTTP/2 connection was failing with
// NGHTTP2_ENHANCE_YOUR_CALM and making valid sessions appear signed out.
const dispatcher = new Agent({ allowH2: false, connections: 8 });

export function supabaseFetch(input, init = {}) {
  // Use the fetch implementation paired with this Agent. Node 24's built-in
  // fetch uses an older dispatcher protocol and rejects an Undici 8 Agent.
  return undiciFetch(input, { ...init, dispatcher });
}
