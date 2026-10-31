import { NextResponse } from 'next/server';
import { fetchStoredAsset } from '@/lib/storageDownload';
import { assertSafeSvg } from '@/lib/svgSafety.mjs';
import {
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_MAX_PSD_BYTES,
  DEFAULT_MAX_SVG_BYTES,
  DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
  DEFAULT_MAX_ZIP_BYTES,
  validateUrlForSSRF,
} from '@/lib/ssrf';

export const runtime = 'nodejs';
export const maxDuration = 90;

const R2_PUBLIC_URL = process.env.CLOUDFLARE_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL;
const R2_PUBLIC_HOST = R2_PUBLIC_URL
  ? new URL(R2_PUBLIC_URL).hostname
  : 'pub-494b7f1d63984c228ff2a8b23edda7c5.r2.dev';
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.CLOUDFLARE_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
const ALLOWED_HOSTS = [
  R2_PUBLIC_HOST,
  'pub-c1f9daa772cc48a394341ecc043e63a5.r2.dev',
  ...(R2_ACCOUNT_ID && R2_BUCKET_NAME
    ? [`${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`]
    : []),
  ...(process.env.NEXT_PUBLIC_SUPABASE_URL
    ? [new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname]
    : []),
];

export async function GET(request) {
  try {
    // These objects are already public. Restrict every request to our storage
    // allowlist; <img> requests cannot supply the app's bearer header.
    const params = new URL(request.url).searchParams;
    const url = params.get('url');
    const downloadName = params.get('download');
    const preview = params.get('preview') === '1' && !downloadName;
    const svgBitmap = preview && params.get('svgPreview') === '1';
    if (!url || url.length > 8192)
      return new NextResponse('Missing or invalid URL parameter', { status: 400 });
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return new NextResponse('Invalid URL', { status: 400 });
    }
    if (
      !ALLOWED_HOSTS.includes(parsed.hostname) ||
      !(await validateUrlForSSRF(url, { allowedHosts: ALLOWED_HOSTS }))
    ) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const path = parsed.pathname.toLowerCase();
    const svg = path.endsWith('.svg');
    const zip = path.endsWith('.zip');
    const psd = path.endsWith('.psd');
    if (preview && (zip || psd))
      return new NextResponse('Preview is available for images only', { status: 400 });
    const maxBytes = svg
      ? DEFAULT_MAX_SVG_BYTES
      : zip
        ? DEFAULT_MAX_ZIP_BYTES
        : psd
          ? DEFAULT_MAX_PSD_BYTES
          : /\/upscaled[-_]/.test(path)
            ? DEFAULT_MAX_UPSCALED_IMAGE_BYTES
            : DEFAULT_MAX_IMAGE_BYTES;

    // Consume and validate the entire upstream body before sending 200. The old
    // raw stream could leave the browser painting only the first strip of a PNG
    // indefinitely, even after the AI job was completed and saved.
    const { response, buffer: downloaded } = await fetchStoredAsset(url, {
      maxBytes,
      timeoutMs: 25_000,
      maxAttempts: 2,
      signal: AbortSignal.timeout(80_000),
      allowedContentTypes: [
        'image/',
        'application/octet-stream',
        'application/zip',
        'application/x-zip',
        'application/vnd.adobe.photoshop',
      ],
    });
    if (!response.ok) return new NextResponse('File is unavailable', { status: response.status });
    let buffer = downloaded;
    const upstreamType = response.headers.get('content-type')?.split(';')[0] || '';
    let contentType = svg
      ? 'image/svg+xml'
      : zip
        ? 'application/zip'
        : psd
          ? 'application/vnd.adobe.photoshop'
          : upstreamType.startsWith('image/')
            ? upstreamType
            : 'image/png';
    const extraHeaders = {};

    if (svg) {
      let text = buffer.toString('utf8');
      if (text.includes('inkscape:label='))
        text = text.replace(/\sinkscape:label=["'][^"']*["']/g, '');
      buffer = Buffer.from(text, 'utf8');
    }
    if (preview && (!svg || svgBitmap)) {
      if (svg) {
        try {
          assertSafeSvg(buffer.toString('utf8'));
        } catch {
          return new NextResponse('Unsupported SVG preview content', { status: 415 });
        }
      }
      const sharp = (await import('sharp')).default;
      const image = sharp(buffer, { limitInputPixels: 128_000_000 }).timeout({ seconds: 30 });
      const metadata = await image.metadata();
      if (
        !['png', 'jpeg', 'webp', 'avif', 'gif', 'heif', ...(svgBitmap ? ['svg'] : [])].includes(
          metadata.format,
        )
      ) {
        return new NextResponse('Unsupported preview image', { status: 415 });
      }
      // Display derivative only. Exports and image-editing tools keep requesting
      // the original URL without preview=1, preserving full-resolution bytes.
      buffer = await image
        .rotate()
        .resize({
          width: svg ? 4096 : 1600,
          height: svg ? 4096 : 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp(svg ? { lossless: true, effort: 1 } : { quality: 88, effort: 2 })
        .toBuffer();
      contentType = 'image/webp';
      extraHeaders['X-Preview-Only'] = '1';
      extraHeaders['X-Source-Width'] = String(metadata.width);
      extraHeaders['X-Source-Height'] = String(metadata.height);
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': preview
          ? 'public, max-age=86400, s-maxage=86400, no-transform'
          : 'public, max-age=86400, no-transform',
        ...(downloadName
          ? {
              'Content-Disposition': `attachment; filename="${downloadName.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`,
            }
          : {}),
        ...extraHeaders,
      },
    });
  } catch (error) {
    console.error('[Proxy Error]', {
      name: error.name,
      code: error.cause?.code,
      message: error.message,
    });
    if (error.message === 'Remote file is too large')
      return new NextResponse('File too large', { status: 413 });
    if (error.message === 'Remote file has an invalid content type')
      return new NextResponse('Invalid content type', { status: 415 });
    if (error.message === 'Invalid or unauthorized URL')
      return new NextResponse('Forbidden', { status: 403 });
    if (error.status === 404) return new NextResponse('File not found', { status: 404 });
    // Do not redirect back to the unbounded public storage stream on failure.
    // The canvas can show a preview retry instead of a half-painted image.
    return new NextResponse('Image transfer interrupted. Please retry loading the preview.', {
      status: error.name === 'TimeoutError' || error.name === 'AbortError' ? 504 : 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' },
    });
  }
}
