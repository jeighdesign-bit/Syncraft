import { getR2DownloadUrl } from './cloudflare';
import { fetchWithSSRFProtection, getAllowedStorageHosts, isTransientFetchError } from './ssrf';

// Callers must check project access and object ownership before reading.
export async function fetchStoredAsset(url, options = {}) {
  try {
    // Stored project URLs are already public R2/CDN or Supabase URLs. Read that
    // path first so a slow private R2 endpoint cannot consume the caller's
    // entire deadline before the reliable CDN path is attempted.
    return await fetchWithSSRFProtection(url, {
      ...options,
      maxAttempts: options.maxAttempts ?? 2,
      allowedHosts: getAllowedStorageHosts(),
    });
  } catch (publicError) {
    options.signal?.throwIfAborted();
    // Never retry validation failures through a second endpoint. Only an
    // unavailable/missing public object may fall back to an authenticated read.
    if (!isTransientFetchError(publicError) && ![401, 403, 404].includes(publicError.status)) {
      throw publicError;
    }

    const signedUrl = await getR2DownloadUrl(url);
    if (!signedUrl) throw publicError;
    console.warn('[Storage download] Public read unavailable; trying authenticated storage');
    return fetchWithSSRFProtection(signedUrl, {
      ...options,
      maxAttempts: 1,
      allowedHosts: [new URL(signedUrl).hostname],
    });
  }
}
