/**
 * ─────────────────────────────────────────────
 * SYNCRAFT  –  OpenRouter AI Service Configuration
 * ─────────────────────────────────────────────
 *
 * Store your default API keys here for direct deployment.
 * The application will check localStorage keys first:
 * - 'syncraft_gemini_api_key' for OpenRouter API Key (used for Nano Banana Pro / Gemini 3 Pro Image)
 * - 'syncraft_recraft_api_key' for Recraft.ai
 * 
 * To set up OpenRouter:
 * 1. Create an OpenRouter API key (starts with 'sk-or-v1-') at openrouter.ai.
 * 2. Put your key in 'syncraft_gemini_api_key' in localStorage or replace the constant below.
 */

export const DEFAULT_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
export const DEFAULT_RECRAFT_API_KEY = import.meta.env.VITE_RECRAFT_API_KEY || '';
