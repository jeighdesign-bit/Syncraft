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
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}
