import DodoPayments from "dodopayments";

export function getDodoClient() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("DODO_PAYMENTS_API_KEY is not configured");
  }

  const isTest = process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode";
  return new DodoPayments({
    bearerToken: apiKey,
    baseURL: isTest ? "https://test.dodopayments.com" : "https://live.dodopayments.com",
  });
}

export function getSiteUrl(request) {
  // 1. Check explicit env vars first
  const configured = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  // 2. Build from request headers (works reliably on Vercel)
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }

  // 3. Last resort: parse request.url
  try {
    return new URL(request.url).origin;
  } catch {
    return "https://syncraftech.com";
  }
}
