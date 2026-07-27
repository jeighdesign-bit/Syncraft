// src/utils/uploadClient.js

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
export async function uploadImageToStorage(file, { token, fileName, contentType } = {}) {
  const name = fileName || file.name;
  const type = contentType || file.type;

  try {
    const urlRes = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ fileName: name, contentType: type }),
    });
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
    console.warn("[upload] Pre-signed upload failed, retrying server-side:", presignedErr.message);
  }

  const formData = new FormData();
  formData.append("file", file, name);

  const fallbackRes = await fetch("/api/upload-direct", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: formData,
  });
  const fallbackData = await fallbackRes.json();
  if (!fallbackRes.ok || !fallbackData.publicUrl) {
    throw new Error(fallbackData.error || "Failed to upload image to storage");
  }

  return fallbackData.publicUrl;
}
