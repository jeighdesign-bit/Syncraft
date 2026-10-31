import { NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/cloudflare';
import { adminSupabase } from '@/lib/supabase';
import {
  getBearerToken,
  isAllowedImageContentType,
  MAX_DIRECT_UPLOAD_BYTES,
  sanitizeUploadFileName,
} from '@/lib/uploadPolicy.mjs';

export async function POST(request) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - Missing auth header' }, { status: 401 });
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

    if (!isAllowedImageContentType(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Only images are allowed.' }, { status: 400 });
    }

    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File size exceeds 4.5MB limit.' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Keep a second check in case a nonstandard FormData implementation reports
    // an inaccurate File.size value.
    if (buffer.length > MAX_DIRECT_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File size exceeds 4.5MB limit.' }, { status: 413 });
    }

    const safeName = sanitizeUploadFileName(file.name);
    const fullFileName = `users/${user.id}/${Date.now()}_${safeName}`;

    // uploadToR2 has built-in Supabase Storage fallback for when R2 is unreachable
    const finalPublicUrl = await uploadToR2(buffer, fullFileName, file.type);

    return NextResponse.json({ publicUrl: finalPublicUrl, uploadUrl: 'server-uploaded' });

  } catch (error) {
    console.error('[upload-direct] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to upload file directly' }, { status: 500 });
  }
}
