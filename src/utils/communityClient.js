import { createClient } from '@/utils/supabase/client';
import { fetchWithAuthRetry } from '@/utils/uploadClient';

export async function communityFetch(url, init = {}) {
  const { data: { session } } = await createClient().auth.getSession();
  if (!session) throw new Error('Sign in to continue.');
  const { response } = await fetchWithAuthRetry(url, { ...init, cache: 'no-store' }, session.access_token);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Unable to complete the request. Please try again.');
  }
  return response;
}
