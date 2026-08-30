import { absoluteUrl } from "@/lib/site";

export default function sitemap() {
  return [
    // Core tool pages
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1.0 },
    { url: absoluteUrl('/image-upscaler'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/bg-remover'), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl('/image-to-vector'), changeFrequency: 'monthly', priority: 0.9 },
    { url: absoluteUrl('/logo-vectorizer'), changeFrequency: 'monthly', priority: 0.9 },
    { url: absoluteUrl('/sublimation-design-extractor'), changeFrequency: 'monthly', priority: 0.9 },
    { url: absoluteUrl('/store'), changeFrequency: 'weekly', priority: 0.7 },
    { url: absoluteUrl('/docs/api'), changeFrequency: 'monthly', priority: 0.6 },
    // Legal and policy pages
    { url: absoluteUrl('/terms'), changeFrequency: 'monthly', priority: 0.4 },
    { url: absoluteUrl('/privacy'), changeFrequency: 'monthly', priority: 0.4 },
    { url: absoluteUrl('/refunds'), changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/copyright'), changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/acceptable-use'), changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/copyright-takedown'), changeFrequency: 'monthly', priority: 0.3 },
  ];
}
