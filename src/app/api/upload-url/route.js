import { NextResponse } from 'next/server';
import { getUploadUrl } from '@/lib/cloudflare';
import { supabase } from '@/lib/supabase'; // Using normal client to check auth

export async function POST(request) {
  try {
    const { fileName, contentType } = await request.json();

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'Missing fileName or contentType' }, { status: 400 });
    }

    // Since we're calling this from the browser with standard Supabase auth,
    // we should use the server client to verify the session.
    // However, the browser already sends cookies. So we can just use the SSR client.
    // Wait, let's just use the simpler approach: the client sends the access token in headers.
    
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      console.log("[Upload URL] Missing auth header");
      return NextResponse.json({ error: 'Unauthorized - Missing auth header' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    if (token === 'undefined') {
      console.log("[Upload URL] Token is literal 'undefined'");
      return NextResponse.json({ error: 'Unauthorized - Invalid token format' }, { status: 401 });
    }
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error("[Upload URL] Supabase auth error:", error);
      return NextResponse.json({ error: `Unauthorized: ${error?.message || 'User not found'}` }, { status: 401 });
    }

    // Include user ID in the path to keep things organized
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fullFileName = `users/${user.id}/${Date.now()}_${safeName}`;

    const urls = await getUploadUrl(fullFileName, contentType);

    return NextResponse.json(urls);

  } catch (error) {
    console.error('Error generating upload URL:', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
