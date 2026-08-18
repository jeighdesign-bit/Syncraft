import { absoluteUrl } from "@/lib/site";

export default function sitemap() {
  const now = new Date();

  return [
    // ─── Core Tool Pages ──────────────────────────────────────────────────────
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: absoluteUrl('/image-upscaler'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/bg-remover'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // ─── Legal & Policy Pages ────────────────────────────────────────────────
    {
      url: absoluteUrl('/image-to-vector'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/logo-vectorizer'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/sublimation-design-extractor'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/store'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: absoluteUrl('/docs/api'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: absoluteUrl('/terms'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: absoluteUrl('/privacy'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: absoluteUrl('/refunds'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/copyright'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/acceptable-use'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/copyright-takedown'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
}
