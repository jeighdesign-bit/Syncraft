export const SITE_NAME = "Syncraft";
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://syncraftech.com"
).replace(/\/$/, "");
// Keep the social preview on its own URL so link-preview caches do not reuse
// the retired DesignClaw screenshot that previously lived at SYNCRAFT-Image.JPG.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/Banner.webp`;

export function absoluteUrl(path = "/") {
  return new URL(path, `${SITE_URL}/`).toString();
}
