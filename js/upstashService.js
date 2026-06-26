const UPSTASH_REDIS_REST_URL = 'https://sharp-bluebird-135074.upstash.io';
const UPSTASH_REDIS_REST_TOKEN = 'gQAAAAAAAg-iAAIgcDI5MTEzZTQ2NjUzMjc0YWQ5ODUwNTVjYjhhNTc2Y2M5ZA';

/**
 * Generates a SHA-256 hash of a given text prompt.
 * Using native Web Crypto API which is supported in modern browsers.
 */
async function hashPrompt(prompt) {
  const msgBuffer = new TextEncoder().encode(prompt.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const UpstashService = {
  /**
   * Retrieves a cached SVG string for a given prompt and model.
   * Returns null if cache miss or error.
   */
  async getCachedGeneration(prompt, model) {
    if (!prompt) return null;
    try {
      const hash = await hashPrompt(prompt);
      const key = `syncraft:cache:${model}:${hash}`;
      
      console.log(`[Upstash Cache] Checking cache for key: ${key}`);
      
      const response = await fetch(UPSTASH_REDIS_REST_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['GET', key])
      });
      
      if (!response.ok) {
        console.warn(`[Upstash Cache] GET failed with status: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      if (data && data.result) {
        console.log('[Upstash Cache] Cache HIT! Found cached SVG design.');
        return data.result;
      }
      
      console.log('[Upstash Cache] Cache MISS.');
      return null;
    } catch (err) {
      console.warn('[Upstash Cache] Error during cache lookup:', err);
      return null;
    }
  },

  /**
   * Saves a generated SVG code string to Upstash Redis with a 7-day expiration.
   */
  async setCachedGeneration(prompt, model, svgCode) {
    if (!prompt || !svgCode) return;
    try {
      const hash = await hashPrompt(prompt);
      const key = `syncraft:cache:${model}:${hash}`;
      
      console.log(`[Upstash Cache] Saving generated SVG to cache. Key: ${key}`);
      
      const response = await fetch(UPSTASH_REDIS_REST_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['SET', key, svgCode, 'EX', 604800]) // 7 days expiration
      });
      
      if (response.ok) {
        console.log('[Upstash Cache] Successfully cached SVG design.');
      } else {
        const errorText = await response.text();
        console.warn('[Upstash Cache] Failed to save cache:', errorText);
      }
    } catch (err) {
      console.warn('[Upstash Cache] Error during cache write:', err);
    }
  }
};
