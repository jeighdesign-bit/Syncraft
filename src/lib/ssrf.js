import dns from 'dns';
import { promisify } from 'util';
import net from 'net';

const lookup = promisify(dns.lookup);

export const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
// A lossless provider-upscaled PNG can legitimately exceed 60 MiB. Keep a
// bounded ceiling while allowing the exact asset to pass through without JPEG
// recompression.
export const DEFAULT_MAX_UPSCALED_IMAGE_BYTES = 96 * 1024 * 1024;
// Fine-pattern garment SVGs legitimately contain tens of thousands of paths.
export const DEFAULT_MAX_SVG_BYTES = 32 * 1024 * 1024;
export const DEFAULT_MAX_ZIP_BYTES = 120 * 1024 * 1024;
export const DEFAULT_MAX_PSD_BYTES = 256 * 1024 * 1024;

function supabaseStorageHost() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function configuredR2Hosts() {
  const hosts = new Set();

  // Accept both env var spellings, matching lib/cloudflare.js — the deployment
  // defines CF_R2_*, so reading only CLOUDFLARE_* left the real public bucket
  // host out of the allowlist and rejected every R2-hosted image.
  const publicUrl = process.env.CLOUDFLARE_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL;
  if (publicUrl) {
    try {
      hosts.add(new URL(publicUrl).hostname.toLowerCase());
    } catch {}
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  const bucketName = process.env.CLOUDFLARE_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
  if (accountId && bucketName) {
    hosts.add(`${bucketName}.${accountId}.r2.cloudflarestorage.com`.toLowerCase());
  }

  hosts.add('pub-c1f9daa772cc48a394341ecc043e63a5.r2.dev');

  // Allow Supabase Storage as fallback (used when R2 S3 endpoint is unreachable locally)
  const supabaseHost = supabaseStorageHost();
  if (supabaseHost) hosts.add(supabaseHost);

  return [...hosts];
}

export function getAllowedStorageHosts() {
  return configuredR2Hosts();
}

export function getAllowedProviderHosts() {
  return [
    'fal.media',
    '.fal.media',
    'v2.fal.media',
    'v3.fal.media',
    'fal.run',
    '.fal.run',
    'queue.fal.run',
    'storage.googleapis.com',
    '.googleapis.com',
    'img.recraft.ai',
    '.recraft.ai',
  ];
}

function isHostAllowed(hostname, allowedHosts = []) {
  const host = hostname.toLowerCase();
  return allowedHosts.some((allowedHost) => {
    const allowed = String(allowedHost || '').toLowerCase();
    if (!allowed) return false;
    if (allowed.startsWith('.')) {
      const suffix = allowed.slice(1);
      return host === suffix || host.endsWith(allowed);
    }
    return host === allowed;
  });
}

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 127 ||
      parts[0] === 169 ||
      parts[0] === 0 ||
      parts[0] >= 224 ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4) {
      return isPrivateIP(mappedIpv4[1]);
    }
    return (
      normalized.startsWith('fd') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fe80') ||
      normalized === '::1' ||
      normalized === '::'
    );
  }
  return false;
}

export function normalizeUserImageUrl(urlString, requestOrigin) {
  if (typeof urlString !== 'string') return null;
  const trimmed = urlString.trim();
  if (!trimmed || trimmed.length > 4096) return null;

  try {
    const base = requestOrigin || process.env.NEXT_PUBLIC_SITE_URL || 'https://localhost';
    const parsed = new URL(trimmed, base);
    if (parsed.pathname === '/api/proxy' && parsed.searchParams.get('url')) {
      return parsed.searchParams.get('url');
    }
  } catch {}

  return trimmed;
}

// R2 serves an object at the root of its public host (/users/<id>/file.png), while
// Supabase Storage nests the same key under /storage/v1/object/<mode>/<bucket>/.
// Reduce both to the bare object key so ownership stays an exact prefix match.
const SUPABASE_STORAGE_PREFIX = /^\/storage\/v1\/object\/(?:public|authenticated|sign)\/[^/]+/;

export function isAllowedStorageUrl(urlString, { userId, projectId } = {}) {
  try {
    const parsed = new URL(urlString);
    const allowedHosts = getAllowedStorageHosts();
    const host = parsed.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (!allowedHosts.includes(host)) return false;

    // new URL() collapses literal dot segments, but percent-encoded ones survive
    // until the decode below — reject those rather than prefix-matching past them.
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (decodedPath.split('/').includes('..')) return false;

    let objectPath = decodedPath;
    if (host === supabaseStorageHost()) {
      // On the Supabase host only real storage paths are objects — everything else
      // is API surface and must never satisfy an ownership check.
      if (!SUPABASE_STORAGE_PREFIX.test(decodedPath)) return false;
      objectPath = decodedPath.replace(SUPABASE_STORAGE_PREFIX, '');
    }

    if (userId && !objectPath.startsWith(`/users/${userId}/`)) return false;
    if (projectId && !objectPath.startsWith(`/projects/${projectId}/`)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isOwnedStorageUrl(urlString, { userId, projectId } = {}) {
  return (
    (userId && isAllowedStorageUrl(urlString, { userId })) ||
    (projectId && isAllowedStorageUrl(urlString, { projectId }))
  );
}

export async function validateUrlForSSRF(urlString, options = {}) {
  try {
    const parsed = new URL(urlString);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const allowedHosts = options.allowedHosts || getAllowedStorageHosts();
    if (allowedHosts && allowedHosts.length > 0 && !isHostAllowed(parsed.hostname, allowedHosts)) {
      return false;
    }

    // For strict allowlisted storage hosts, the hostname is the security boundary.
    // Avoid production false-negatives from transient DNS resolution issues while
    // still applying DNS/private-IP checks to arbitrary provider URLs.
    if (allowedHosts && allowedHosts.length > 0) {
      return true;
    }

    const addresses = await lookup(parsed.hostname, { all: true, verbatim: false });
    if (!addresses.length || addresses.some(({ address }) => isPrivateIP(address))) {
      return false;
    }
    return true;
  } catch (err) {
    return false; // Invalid URL or DNS resolution failed
  }
}

export async function fetchWithSSRFProtection(urlString, options = {}) {
  const {
    allowedHosts = getAllowedStorageHosts(),
    maxBytes = DEFAULT_MAX_IMAGE_BYTES,
    timeoutMs = 15000,
    maxRedirects = 3,
    allowedContentTypes,
    fetchOptions = {},
    maxAttempts = 1,
    retryDelayMs = 400,
    signal = fetchOptions.signal,
  } = options;

  // Only repeat reads. Retrying a provider POST can charge for the same job twice.
  const attempts = ['GET', 'HEAD'].includes((fetchOptions.method || 'GET').toUpperCase())
    ? Math.max(1, Math.min(3, maxAttempts))
    : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchRemoteAsset();
    } catch (error) {
      signal?.throwIfAborted();
      if (attempt === attempts || !isTransientFetchError(error)) throw error;
      await new Promise((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, retryDelayMs * attempt);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
    }
  }

  async function fetchRemoteAsset() {
    let currentUrl = urlString;
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
      signal?.throwIfAborted();
      if (!(await validateUrlForSSRF(currentUrl, { allowedHosts }))) {
        throw new Error('Invalid or unauthorized URL');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(currentUrl, {
          ...fetchOptions,
          redirect: 'manual',
          signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location) throw new Error('Redirect missing Location header');
          currentUrl = new URL(location, currentUrl).href;
          continue;
        }

        if (!response.ok) {
          const error = new Error(`Remote file request failed (${response.status})`);
          error.status = response.status;
          throw error;
        }

        const contentLength = Number(response.headers.get('content-length') || '0');
        if (contentLength && contentLength > maxBytes) {
          throw new Error('Remote file is too large');
        }

        const contentType = response.headers.get('content-type') || '';
        if (
          allowedContentTypes?.length &&
          !allowedContentTypes.some((type) => contentType.toLowerCase().startsWith(type))
        ) {
          throw new Error('Remote file has an invalid content type');
        }

        const buffer = await responseToLimitedBuffer(response, maxBytes);
        return { response, buffer, finalUrl: currentUrl };
      } catch (error) {
        signal?.throwIfAborted();
        if (controller.signal.aborted) {
          const timeoutError = new Error('Remote file download timed out', { cause: error });
          timeoutError.name = 'TimeoutError';
          throw timeoutError;
        }
        throw error;
      } finally {
        // Keep the timer running through the complete body, not just headers.
        clearTimeout(timeout);
        if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
      }
    }

    throw new Error('Too many redirects');
  }
}

export function isTransientFetchError(error) {
  return (
    [429, 500, 502, 503, 504].includes(error?.status) ||
    ['AbortError', 'TimeoutError'].includes(error?.name) ||
    /fetch failed|terminated|network|socket|econn|etimedout|und_err|aborted|timed?\s*out|timeout/i.test(
      `${error?.message || ''} ${error?.cause?.code || ''}`,
    )
  );
}

export async function responseToLimitedBuffer(response, maxBytes = DEFAULT_MAX_IMAGE_BYTES) {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('Remote file is too large');
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error('Remote file is too large');
      }
      chunks.push(value);
    }

    return Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      total,
    );
  } finally {
    reader.releaseLock();
  }
}
