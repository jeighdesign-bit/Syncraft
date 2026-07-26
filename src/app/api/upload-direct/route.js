import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/cloudflare';
import { adminSupabase } from '@/lib/supabase';

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized - Missing auth header' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    if (token === 'undefined') {
      return NextResponse.json({ error: 'Unauthorized - Invalid token format' }, { status: 401 });
    }
    
    const { data: { user }, error } = await adminSupabase.auth.getUser(token);
    
    if (error || !user) {
      return NextResponse.json({ error: `Unauthorized: ${error?.message || 'User not found'}` }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return NextResponse.json({ error: 'Missing file in request' }, { status: 400 });
    }

    const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/tiff'];
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Only images are allowed.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Limit to 4.5MB to stay within standard serverless limits
    if (buffer.length > 4.5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 4.5MB limit.' }, { status: 413 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fullFileName = `users/${user.id}/${Date.now()}_${safeName}`;

    // uploadToR2 has built-in Supabase Storage fallback for when R2 is unreachable
    const finalPublicUrl = await uploadToR2(buffer, fullFileName, file.type);

    return NextResponse.json({ publicUrl: finalPublicUrl, uploadUrl: 'server-uploaded' });

  } catch (error) {
    console.error('[upload-direct] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to upload file directly' }, { status: 500 });
  }
}
