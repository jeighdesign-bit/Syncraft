/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: '.',
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: [
          // Prevent clickjacking — stops your site from being embedded in iframes
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Prevent MIME type sniffing — stops browsers from guessing file types
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Minimal referrer info sent to third parties
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Force HTTPS for 1 year (only enable once you're 100% on HTTPS)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Disable browser features you don't use
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Basic XSS protection header (older browsers)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
      {
        // Keep API framing protection, including public image responses.
        source: '/api/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        // The public storage proxy sets its own cache policy. Overriding it
        // here forces every tab switch to download and render large files again.
        // All other APIs still prevent caching of user-specific responses.
        source: '/api/((?!proxy(?:/|$)).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
