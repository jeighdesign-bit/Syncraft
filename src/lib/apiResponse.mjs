// Proxies and hosting failures can return plain text or HTML instead of JSON.
// Never expose those bodies (or JSON parser errors) as user-facing messages.
export async function readApiResponse(response, fallback = "The server could not complete your request. Please try again shortly.") {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch {}
  const error = new Error(response.status === 413
    ? "The image is too large to upload. Please use a smaller image."
    : fallback);
  error.status = response.status;
  error.code = "INVALID_API_RESPONSE";
  throw error;
}
