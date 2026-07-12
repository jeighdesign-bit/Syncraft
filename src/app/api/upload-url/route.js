import { NextResponse } from 'next/server';
import { getUploadUrl } from '@/lib/cloudflare';
import { adminSupabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const { fileName, contentType } = await request.json();

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'Missing fileName or contentType' }, { status: 400 });
    }

    // Fix #9: Allowlist content types — block non-image uploads
    const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/tiff'];
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'Invalid file type. Only images are allowed.' }, { status: 400 });
    }
    
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
    
    // Fix #3: Use adminSupabase (service role) for consistent server-side auth validation
    const { data: { user }, error } = await adminSupabase.auth.getUser(token);
    
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
