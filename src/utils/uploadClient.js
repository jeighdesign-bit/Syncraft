// src/utils/uploadClient.js

import { createClient } from "@/utils/supabase/client";

/**
 * Uploads an image to storage from the browser.
 *
 * Primary path is a direct-to-R2 PUT against a pre-signed URL, which keeps large
 * files off the serverless request path (/api/upload-direct is capped at 4.5MB by
 * serverless body limits, so it cannot be the default).
 *
 * When the pre-signed path cannot complete — R2 unreachable, TLS handshake or CORS
 * failure, expired signature, missing R2 config — we retry through
 * /api/upload-direct, which uploads server-side and carries its own Supabase
 * Storage fallback.
 *
 * @param {File|Blob} file - Image data to upload.
 * @param {Object} options
 * @param {string} options.token - Supabase access token.
 * @param {string} [options.fileName] - Name to store under. Required for Blobs.
 * @param {string} [options.contentType] - MIME type. Defaults to the file's own type.
 * @returns {Promise<string>} The public URL of the uploaded image.
 */
export class AuthSessionError extends Error {
  constructor(message = "Your login session expired. Please log in again.") {
    super(message);
    this.name = "AuthSessionError";
    this.code = "AUTH_SESSION_EXPIRED";
  }
}

const AUTH_REQUEST_TIMEOUT_MS = 120_000;

async function refreshAccessToken() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.refreshSession();
  const refreshedToken = data?.session?.access_token;

  if (error || !refreshedToken) {
    // Clear only this browser's stale session. The UI will ask for login again.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    throw new AuthSessionError();
  }

  return refreshedToken;
}

function withBearer(init, token) {
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

async function fetchWithTimeout(input, init) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Request timed out while contacting the server. Please try again.");
      timeoutError.code = "REQUEST_TIMEOUT";
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch an authenticated API route and refresh a stale Supabase token once.
 * The returned token lets a multi-step operation reuse the refreshed session.
 */
export async function fetchWithAuthRetry(input, init = {}, token) {
  let activeToken = token;
  if (!activeToken) throw new AuthSessionError();

  let response = await fetchWithTimeout(input, withBearer(init, activeToken));
  if (response.status !== 401) return { response, token: activeToken };

  activeToken = await refreshAccessToken();
  response = await fetchWithTimeout(input, withBearer(init, activeToken));

  if (response.status === 401) throw new AuthSessionError();
  return { response, token: activeToken };
}

export async function uploadImageToStorage(file, { token, fileName, contentType } = {}) {
  const name = fileName || file.name;
  const type = contentType || file.type;
  let activeToken = token;

  // The developer's local Windows TLS stack cannot negotiate directly with
  // the R2 S3 endpoint. Use the existing authenticated server upload locally
  // so expected fallback behavior does not produce noisy browser errors.
  const isLocalDevelopment = typeof window !== "undefined"
    && ["localhost", "127.0.0.1"].includes(window.location.hostname);

  try {
    if (isLocalDevelopment) throw new Error("LOCAL_SERVER_UPLOAD");
    const authResult = await fetchWithAuthRetry("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: name, contentType: type }),
    }, activeToken);
    const urlRes = authResult.response;
    activeToken = authResult.token;
    const urlData = await urlRes.json();
    if (!urlRes.ok || !urlData.uploadUrl) throw new Error(urlData.error || "Failed to get upload URL");

    const putRes = await fetch(urlData.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": type },
      body: file,
    });
    if (!putRes.ok) throw new Error(`Storage rejected the upload (${putRes.status})`);

    return urlData.publicUrl;
  } catch (presignedErr) {
    if (presignedErr?.code === "AUTH_SESSION_EXPIRED") throw presignedErr;
    if (presignedErr.message !== "LOCAL_SERVER_UPLOAD") {
      console.warn("[upload] Pre-signed upload failed, retrying server-side:", presignedErr.message);
    }
  }

  const formData = new FormData();
  formData.append("file", file, name);

  const fallbackResult = await fetchWithAuthRetry("/api/upload-direct", {
    method: "POST",
    body: formData,
  }, activeToken);
  const fallbackRes = fallbackResult.response;
  const fallbackData = await fallbackRes.json();
  if (!fallbackRes.ok || !fallbackData.publicUrl) {
    throw new Error(fallbackData.error || "Failed to upload image to storage");
  }

  return fallbackData.publicUrl;
}
