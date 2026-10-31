export const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
  "image/tiff",
]);

export const MAX_DIRECT_UPLOAD_BYTES = 4.5 * 1024 * 1024;

export function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token && token !== "undefined" ? token : null;
}

export function isAllowedImageContentType(contentType) {
  return ALLOWED_IMAGE_CONTENT_TYPES.has(contentType);
}

export function sanitizeUploadFileName(fileName) {
  const sanitized = String(fileName || "")
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .slice(-160);
  return sanitized || "upload";
}
