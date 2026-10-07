import "server-only";

import { Polar } from "@polar-sh/sdk";

let polarClient;

export function getPolarClient() {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) throw new Error("POLAR_ACCESS_TOKEN is not configured");

  if (!polarClient) {
    polarClient = new Polar({
      accessToken,
      server: process.env.POLAR_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
    });
  }

  return polarClient;
}

export function getSiteUrl(request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

export function getCustomerIpAddress(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
}
