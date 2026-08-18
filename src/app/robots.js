import { absoluteUrl, SITE_URL } from "@/lib/site";

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/api-dashboard', '/b2b-demo', '/workspace/', '/bg-remover/', '/mobile'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  }
}
