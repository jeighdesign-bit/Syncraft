import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { authenticateAdminRequest } from '@/lib/adminAuth';

export async function authenticateGalleryRequest(request) {
  // No localhost bypass: every history and media request must verify an admin.
  if (request.headers.get('authorization')) return authenticateAdminRequest(request);
  const cookieStore = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: values => { for (const { name, value, options } of values) cookieStore.set(name, value, options); },
    },
  });
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) return { user: null, status: 401, error: 'Please sign in with an admin account.' };
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${session.access_token}`);
  // Cookie session data is not authorization evidence. The existing helper
  // validates the token with Auth and checks the configured admin/role.
  return authenticateAdminRequest({ url: request.url, headers });
}
