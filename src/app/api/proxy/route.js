import { NextResponse } from "next/server";

// SSRF Protection: only allow proxying from our own Cloudflare R2 domains.
// Never fetch arbitrary URLs from the server — that opens internal metadata attacks.
const R2_PUBLIC_HOST = process.env.CLOUDFLARE_PUBLIC_URL
  ? new URL(process.env.CLOUDFLARE_PUBLIC_URL).hostname
  : "pub-c1f9daa772cc48a394341ecc043e63a5.r2.dev";

const R2_STORAGE_HOST = process.env.CLOUDFLARE_ACCOUNT_ID
  ? `${process.env.CLOUDFLARE_BUCKET_NAME}.${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : null;

const ALLOWED_HOSTS = [
  R2_PUBLIC_HOST,
  // R2 S3-compatible endpoint — images uploaded via presigned URLs may have this as source
  ...(R2_STORAGE_HOST ? [R2_STORAGE_HOST] : []),
];

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return new NextResponse('Missing URL parameter', { status: 400 });
    }

    // Validate the URL is from an allowed host
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new NextResponse('Invalid URL', { status: 400 });
    }

    if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
      console.warn(`[Proxy] Blocked request to unauthorized host: ${parsedUrl.hostname}`);
      return new NextResponse('Forbidden: URL not from an allowed host', { status: 403 });
    }

    const res = await fetch(url);
    
    if (!res.ok) {
      return new NextResponse(`Failed to fetch image: ${res.statusText}`, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (error) {
    console.error('[Proxy Error]:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

