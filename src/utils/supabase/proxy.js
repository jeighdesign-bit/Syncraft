import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { supabaseFetch } from '@/lib/supabaseFetch.mjs';

// Server Components cannot persist rotated auth cookies. Refresh before the
// page runs, forwarding the same cookie values to both the server and browser.
export async function updateSession(request) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const sessionPage = path === '/' || ['/workspace', '/logo-studio', '/upscale', '/mobile', '/admin'].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  if (!sessionPage || !request.cookies.getAll().some(cookie => /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name))) return response;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { fetch: supabaseFetch },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
