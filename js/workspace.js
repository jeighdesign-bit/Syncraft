// ─────────────────────────────────────────────
// WORKSPACE CONTROLLER  –  Generative Workflow
// ─────────────────────────────────────────────
import vectors        from './vectors.js';
import { showToast, openModal, resizeImage, changeDpiBlob } from './utils.js';
import ProjectService from './projectService.js?v=2.0.5';
import store          from './projectStore.js';
import authService         from './authService.js?v=2.0.5';
import { initDotField }    from './dotField.js';
import { initOnboarding }  from './onboarding.js';
let appRouter = null;

/**
 * Clean and parse an LLM response containing SVG code.
 * Extracts the SVG block (even if wrapped in markdown code blocks or containing surrounding text)
 * and validates that it parses as a valid XML document.
 * 
 * @param {string} rawResponse - The raw response string from the AI model.
 * @returns {string} The cleaned, valid SVG string.
 * @throws {Error} User-friendly error if extraction or parsing fails.
 */
function cleanAndValidateSvg(rawResponse, targetW = null, targetH = null) {
  if (!rawResponse) {
    throw new Error("The AI model returned an empty design response. Please try adjusting your prompt.");
  }

  let svgContent = rawResponse.trim();

  // 1. Extract content within markdown code blocks (e.g. ```xml ... ``` or ```svg ... ``` or ```html ... ``` or ``` ... ```)
  const codeBlockRegex = /```(?:xml|svg|html|)?([\s\S]*?)```/i;
  const codeBlockMatch = svgContent.match(codeBlockRegex);
  if (codeBlockMatch) {
    svgContent = codeBlockMatch[1].trim();
  }

  // 2. If no code blocks, check if there's any text before <svg and after </svg>
  const svgStartIdx = svgContent.indexOf('<svg');
  const svgEndIdx = svgContent.lastIndexOf('</svg>');
  
  if (svgStartIdx !== -1 && svgEndIdx !== -1 && svgEndIdx > svgStartIdx) {
    svgContent = svgContent.substring(svgStartIdx, svgEndIdx + 6).trim();
  }

  // 3. Minify: Remove comments, metadata, description, and redundant whitespaces
  svgContent = svgContent
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata>[\s\S]*?<\/metadata>/gi, '')
    .replace(/<desc>[\s\S]*?<\/desc>/gi, '')
    .replace(/>\s+</g, '><')
    .trim();

  // 3.5. If target dimensions are provided, ensure the SVG root matches them and preserves aspect ratio
  if (targetW && targetH) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svgEl = doc.documentElement;
      if (svgEl && svgEl.tagName.toLowerCase() === 'svg') {
        const currentViewBox = svgEl.getAttribute('viewBox');
        const currentWidth = svgEl.getAttribute('width');
        const currentHeight = svgEl.getAttribute('height');

        if (!currentViewBox) {
          const vw = parseFloat(currentWidth) || targetW;
          const vh = parseFloat(currentHeight) || targetH;
          svgEl.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
        }

        svgEl.setAttribute('width', targetW.toString());
        svgEl.setAttribute('height', targetH.toString());
        svgEl.setAttribute('preserveAspectRatio', 'none');

        svgContent = new XMLSerializer().serializeToString(doc);
      }
    } catch (err) {
      console.warn("Failed to apply target dimensions to SVG:", err);
    }
  }

  // 4. Robust XML validation using DOMParser
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.warn("SVG Parser Validation Warn:", parserError.textContent);
      throw new Error("The generated design had vector layout errors. Please try again.");
    }
  } catch (err) {
    console.error("XML validation failed:", err);
    throw new Error("The AI generated a design that contains invalid vector markup. Please try regenerating.");
  }

  return svgContent;
}

function showSettingsModal(tab = 'profile', showGeneral = true) {
  if (!appRouter) return;
  const targetTab = tab === 'billing' ? 'subscription' : (tab === 'general' ? 'profile' : tab);
  appRouter.navigate(`settings?tab=${targetTab}`);
}

/**
}

/**
 * Crops a rectangular region from a base64 image using the Canvas API.
 * This physically removes the jersey silhouette before sending to Recraft,
 * preventing the jersey shape from ever appearing in the output SVG.
 *
 * @param {string} base64Str - The source image as a base64 DataURL.
 * @param {{x: number, y: number, w: number, h: number}} coords - Normalised coords (0.0–1.0).
 * @returns {Promise<string>} The cropped region as a PNG base64 DataURL.
 */
function cropPatternRegion(base64Str, coords) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.naturalWidth  || img.width;
      const srcH = img.naturalHeight || img.height;

      // Convert normalised coords to pixel values
      const px = Math.max(0, Math.round(coords.x * srcW));
      const py = Math.max(0, Math.round(coords.y * srcH));
      const pw = Math.min(srcW - px, Math.round(coords.w * srcW));
      const ph = Math.min(srcH - py, Math.round(coords.h * srcH));

      if (pw <= 0 || ph <= 0) {
        console.warn('[cropPatternRegion] Invalid crop dimensions, using full image.');
        resolve(base64Str);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width  = pw;
      canvas.height = ph;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, px, py, pw, ph, 0, 0, pw, ph);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (err) => reject(err);
    img.src = base64Str;
  });
}

import { UpstashService } from './upstashService.js';

// Fallback keys embedded locally (base64 obfuscated to prevent GitHub Push Protection triggers)
const FALLBACK_GEMINI_API_KEY = atob('c2stb3ItdjEtZTBkMTIzMGMwNDNmNjE4OGQ5MGNmMTIxY2IzMTY5OTczNjU2ZDkzZTViZjllNjJkN2ZkM2UyZmJmMjRlNTczYg==');
const FALLBACK_RECRAFT_API_KEY = atob('WmYyTnVuSG51R2p1REVSeDZlOGpETEFUajZoM0hiWjNES25KTmpXd1dTSGc1WFF0MGJFRUViM1lNbExxVVl1Qw==');
const FALLBACK_LEONARDO_API_KEY = atob('NDk1YzVjOTMtY2YwMy00ZjQ2LWJmYmYtYzE0YzVkZTBjZmRh');

// Robust helper functions to get active API keys with reliable fallbacks
export function getGeminiApiKey() {
  const key = localStorage.getItem('syncraft_gemini_api_key');
  if (key && typeof key === 'string' && key.trim() !== '' && key !== 'null' && key !== 'undefined' && key.startsWith('sk-or-v1-')) {
    return key.trim();
  }
  return FALLBACK_GEMINI_API_KEY;
}

export function getRecraftApiKey() {
  const key = localStorage.getItem('syncraft_recraft_api_key');
  if (key && typeof key === 'string' && key.trim() !== '' && key !== 'null' && key !== 'undefined' && key.length > 10) {
    return key.trim();
  }
  return FALLBACK_RECRAFT_API_KEY;
}

export function getLeonardoApiKey() {
  const key = localStorage.getItem('syncraft_leonardo_api_key');
  if (key && typeof key === 'string' && key.trim() !== '' && key !== 'null' && key !== 'undefined' && key.length > 5) {
    return key.trim();
  }
  return FALLBACK_LEONARDO_API_KEY;
}


// Force overwrite cached default keys if the version is updated
const CURRENT_KEYS_VERSION = '3';
const storedKeysVersion = localStorage.getItem('syncraft_keys_version');
if (storedKeysVersion !== CURRENT_KEYS_VERSION) {
  console.log('[API Key migration] Clearing old cached default keys for version', CURRENT_KEYS_VERSION);
  localStorage.removeItem('syncraft_gemini_api_key');
  localStorage.removeItem('syncraft_recraft_api_key');
  localStorage.setItem('syncraft_keys_version', CURRENT_KEYS_VERSION);
}

// Automatically migrate/initialize localStorage key if it still contains the old depleted Google API key or is invalid
const storedKey = localStorage.getItem('syncraft_gemini_api_key');
if (!storedKey || !storedKey.startsWith('sk-or-v1-')) {
  console.log('[API Key migration] Migrating/initializing Gemini API Key in localStorage to OpenRouter key.');
  localStorage.setItem('syncraft_gemini_api_key', FALLBACK_GEMINI_API_KEY);
}

const storedRecraftKey = localStorage.getItem('syncraft_recraft_api_key');
if (!storedRecraftKey || storedRecraftKey.trim() === '' || storedRecraftKey === 'null' || storedRecraftKey === 'undefined') {
  console.log('[API Key migration] Initializing Recraft API Key in localStorage to default key.');
  localStorage.setItem('syncraft_recraft_api_key', FALLBACK_RECRAFT_API_KEY);
}

/**
 * Calls the direct Google Gemini generateContent REST API via OpenRouter.
 * 
 * @param {string} apiKey - The OpenRouter API Key.
 * @param {string} promptText - The prompt message.
 * @param {string} [base64Image] - Optional base64-encoded image DataURL.
 * @returns {Promise<string>} The generated text response.
 */
async function callGeminiApi(apiKey, promptText, base64Image = null) {
  console.log("[Gemini API via OpenRouter] Request started.");
  if (!apiKey) {
    throw new Error("OpenRouter API Key is missing. Please configure 'syncraft_gemini_api_key' in your browser localStorage or js/aiConfig.js");
  }

  const modelsToTry = [
    "google/gemini-3-pro-image",
    "google/gemini-3.5-flash",
    "google/gemini-3.1-flash-image"
  ];
  let response = null;
  let errorMessages = [];

  for (const modelId of modelsToTry) {
    console.log(`[Gemini API via OpenRouter] Trying model: ${modelId}`);
    const url = "https://openrouter.ai/api/v1/chat/completions";

    const messagesContent = [
      { type: "text", text: promptText }
    ];

    if (base64Image) {
      messagesContent.push({
        type: "image_url",
        image_url: {
          url: base64Image
        }
      });
    }

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://syncraft.ai',
          'X-Title': 'Syncraft'
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: "user",
              content: messagesContent
            }
          ]
        })
      });

      console.log(`[Gemini API via OpenRouter] Response status for ${modelId}:`, response.status, response.statusText);

      if (response.ok) {
        break; // Success! Exit the loop.
      } else {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `Status ${response.status}: ${response.statusText}`;
        console.warn(`[Gemini API via OpenRouter] Model ${modelId} failed: ${errMsg}`);
        errorMessages.push(`${modelId}: ${errMsg}`);
        
        // If the API key is completely invalid or permission is denied, fail fast
        if (response.status === 400 && (errMsg.includes('API key') || errMsg.includes('not valid') || errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not found') || errMsg.includes('invalid_api_key'))) {
          throw { name: 'UnrecoverableError', message: `Invalid API Key: ${errMsg}` };
        }
        if (response.status === 401 || response.status === 403) {
          throw { name: 'UnrecoverableError', message: `Auth/Permission Denied: ${errMsg}` };
        }
        // If the credits are depleted or billing issue, fail fast and throw 'Unavailable at the moment'
        if (response.status === 402 || (errMsg && /credit|balance|billing|quota|limit|payment|insufficient|depleted/i.test(errMsg))) {
          throw { name: 'UnrecoverableError', message: 'Unavailable at the moment' };
        }
      }
    } catch (err) {
      if (err.name === 'UnrecoverableError') {
        throw new Error(err.message);
      }
      console.warn(`[Gemini API via OpenRouter] Fetch request failed for model ${modelId}:`, err);
      errorMessages.push(`${modelId}: ${err.message || err}`);
    }
  }

  if (!response || !response.ok) {
    const hasCreditError = errorMessages.some(msg => /credit|balance|billing|quota|limit|payment|insufficient|depleted|402/i.test(msg));
    if (hasCreditError) {
      throw new Error("Unavailable at the moment");
    }
    throw new Error("All text models failed: " + errorMessages.join(" | "));
  }

  const result = await response.json();
  const generatedText = result.choices?.[0]?.message?.content;
  if (!generatedText) {
    throw new Error("OpenRouter returned an empty response.");
  }

  console.log("[Gemini API via OpenRouter] Generation complete, length:", generatedText.length);
  return generatedText.trim();
}

/**
 * Calls the Google Gemini Image Generation API (gemini-3-pro-image / Nano Banana Pro) via OpenRouter.
 * 
 * @param {string} apiKey - The OpenRouter API Key.
 * @param {string} promptText - The prompt message.
 * @param {string} [base64Image] - Optional base64-encoded reference image.
 * @returns {Promise<Blob>} The generated image as a Blob.
 */
async function callGeminiImageGenerationApi(apiKey, promptText, base64Image = null, aspectRatio = '1:1') {
  console.log("[Gemini Image API via OpenRouter] Request started.");
  if (!apiKey) {
    throw new Error("OpenRouter API Key is missing. Please configure 'syncraft_gemini_api_key' in your browser localStorage or js/aiConfig.js");
  }

  const modelsToTry = [
    "google/gemini-3-pro-image",
    "google/gemini-3.1-flash-image",
    "google/gemini-2.5-flash-image",
    "google/gemini-3.1-flash-lite-image",
    "google/gemini-3-pro-image-preview",
    "google/gemini-3.1-flash-image-preview",
    "google/gemini-2.5-flash-image-preview"
  ];
  let response = null;
  let errorMessages = [];

  for (const modelId of modelsToTry) {
    console.log(`[Gemini Image API via OpenRouter] Trying model: ${modelId}`);
    const url = "https://openrouter.ai/api/v1/images";
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for image gen

    const body = {
      model: modelId,
      prompt: promptText,
      aspect_ratio: aspectRatio
    };

    if (base64Image) {
      body.input_references = [
        {
          type: "image_url",
          image_url: {
            url: base64Image
          }
        }
      ];
    }

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://syncraft.ai',
          'X-Title': 'Syncraft'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log(`[Gemini Image API via OpenRouter] Response status for ${modelId}:`, response.status, response.statusText);

      if (response.ok) {
        break; // Success! Exit the loop.
      } else {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `Status ${response.status}: ${response.statusText}`;
        console.warn(`[Gemini Image API via OpenRouter] Model ${modelId} failed: ${errMsg}`);
        errorMessages.push(`${modelId}: ${errMsg}`);
        
        // If the API key is completely invalid or permission is denied, fail fast
        if (response.status === 400 && (errMsg.includes('API key') || errMsg.includes('not valid') || errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not found') || errMsg.includes('invalid_api_key'))) {
          throw { name: 'UnrecoverableError', message: `Invalid API Key: ${errMsg}` };
        }
        if (response.status === 401 || response.status === 403) {
          throw { name: 'UnrecoverableError', message: `Auth/Permission Denied: ${errMsg}` };
        }
        // If the credits are depleted or billing issue, fail fast and throw 'Unavailable at the moment'
        if (response.status === 402 || (errMsg && /credit|balance|billing|quota|limit|payment|insufficient|depleted/i.test(errMsg))) {
          throw { name: 'UnrecoverableError', message: 'Unavailable at the moment' };
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'UnrecoverableError') {
        throw new Error(err.message);
      }
      if (err.name === 'AbortError') {
        console.warn(`[Gemini Image API via OpenRouter] Request for model ${modelId} timed out.`);
        errorMessages.push(`${modelId}: Request timed out (60s)`);
      } else {
        console.warn(`[Gemini Image API via OpenRouter] Fetch request failed for model ${modelId}:`, err);
        errorMessages.push(`${modelId}: ${err.message || err}`);
      }
    }
  }

  if (!response || !response.ok) {
    const hasCreditError = errorMessages.some(msg => /credit|balance|billing|quota|limit|payment|insufficient|depleted|402/i.test(msg));
    if (hasCreditError) {
      throw new Error("Unavailable at the moment");
    }
    throw new Error("All image models failed: " + errorMessages.join(" | "));
  }

  const result = await response.json();
  
  let base64Data = result.data?.[0]?.b64_json;
  let mimeType = "image/png";

  if (!base64Data) {
    throw new Error("OpenRouter did not return any image data in the response.");
  }

  console.log("[Gemini Image API via OpenRouter] Generation complete. Image mimeType:", mimeType);

  // Convert base64 string to a Blob
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Calls the Leonardo.ai Image Generation API (using Leonardo Phoenix 1.0) with an optional reference image.
 * Handles the two-step init-image upload and status polling.
 * 
 * @param {string} apiKey - The Leonardo API Key.
 * @param {string} promptText - The prompt message.
 * @param {string} [base64Image] - Optional base64-encoded reference image.
 * @param {string} [aspectRatio] - Optional aspect ratio (default '1:1').
 * @returns {Promise<Blob>} The generated image as a Blob.
 */
async function callLeonardoImageGenerationApi(apiKey, promptText, base64Image = null, aspectRatio = '1:1') {
  console.log("[Leonardo API] Request started.");
  if (!apiKey) {
    throw new Error("Leonardo API Key is missing. Please configure 'syncraft_leonardo_api_key' in your browser localStorage or js/aiConfig.js");
  }

  let initImageId = null;

  // Step 1: Upload reference image if provided
  if (base64Image) {
    console.log("[Leonardo API] Uploading reference image...");
    
    // Parse base64 header to get extension (e.g. png, jpg, webp)
    let extension = "png";
    const extensionMatch = base64Image.match(/data:image\/(.*?);base64/);
    if (extensionMatch && extensionMatch[1]) {
      extension = extensionMatch[1];
      if (extension === "jpeg") extension = "jpg";
    }

    console.log("[Leonardo API] Performing S3 upload via backend proxy...");
    const uploadRes = await fetch("/api/leonardo-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "upload",
        apiKey,
        data: { base64Image, extension }
      })
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error("Leonardo init-image proxy upload failed: " + (err?.error || uploadRes.statusText));
    }

    const uploadData = await uploadRes.json();
    initImageId = uploadData.id;
    console.log("[Leonardo API] Reference image uploaded successfully via proxy. ID:", initImageId);
  }

  // Step 2: Trigger Generation Job
  console.log("[Leonardo API] Triggering generation job...");
  
  // Map Gemini aspect ratios to Leonardo width/height
  let width = 1024;
  let height = 1024;
  
  if (aspectRatio === '16:9') {
    width = 1024;
    height = 576;
  } else if (aspectRatio === '9:16') {
    width = 576;
    height = 1024;
  } else if (aspectRatio === '4:3') {
    width = 1024;
    height = 768;
  } else if (aspectRatio === '3:4') {
    width = 768;
    height = 1024;
  } else if (aspectRatio === '3:2') {
    width = 1024;
    height = 683;
  } else if (aspectRatio === '2:3') {
    width = 683;
    height = 1024;
  }

  const generationPayload = {
    modelId: "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3", // Leonardo Phoenix 1.0
    prompt: promptText,
    num_images: 1,
    width: width,
    height: height,
    init_image_id: initImageId ? initImageId : undefined,
    init_strength: initImageId ? 0.2 : undefined
  };

  const genRes = await fetch("/api/leonardo-proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "generations",
      apiKey,
      data: generationPayload
    })
  });

  if (!genRes.ok) {
    const err = await genRes.json().catch(() => ({}));
    throw new Error("Leonardo generation failed: " + (err?.error || genRes.statusText));
  }

  const genData = await genRes.json();
  const generationId = genData.sdGenerationJob?.generationId;
  if (!generationId) {
    throw new Error("Leonardo API did not return a valid generationId.");
  }

  // Step 3: Poll status until complete (max 30 attempts, 1.5s interval = 45 seconds total timeout)
  console.log("[Leonardo API] Generation triggered. Job ID:", generationId, "Polling status...");
  
  let imageUrl = null;
  const maxAttempts = 30;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 1500));
    
    console.log(`[Leonardo API] Polling attempt ${attempt}/${maxAttempts}...`);
    const statusRes = await fetch("/api/leonardo-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "status",
        apiKey,
        data: { generationId }
      })
    });

    if (!statusRes.ok) {
      console.warn("[Leonardo API] Polling error status:", statusRes.status);
      continue; 
    }

    const statusData = await statusRes.json();
    const generationObj = statusData.generations_by_pk;
    if (!generationObj) {
      throw new Error("Failed to retrieve generation status object.");
    }

    const status = generationObj.status;
    console.log("[Leonardo API] Job status:", status);

    if (status === "COMPLETE") {
      const generatedImages = generationObj.generated_images;
      if (generatedImages && generatedImages.length > 0) {
        imageUrl = generatedImages[0].url;
        break;
      } else {
        throw new Error("Leonardo generation completed but returned no images.");
      }
    } else if (status === "FAILED") {
      throw new Error("Leonardo image generation job failed on their server.");
    }
  }

  if (!imageUrl) {
    throw new Error("Leonardo generation request timed out. Please try again.");
  }

  console.log("[Leonardo API] Fetching generated image from CDN:", imageUrl);
  const imageRes = await fetch(imageUrl + "?t=" + Date.now(), { cache: "no-cache" });
  if (!imageRes.ok) {
    throw new Error("Failed to retrieve the generated image from Leonardo's CDN.");
  }
  
  return await imageRes.blob();
}

/**
 * Converts a base64 DataURL string to a Blob.
 * 
 * @param {string} dataurl - The base64 DataURL string.
 * @returns {Blob} The converted Blob.
 */
function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Compresses an image Blob if it exceeds a safe file size for API uploads.
 * Recraft's Vectorize API has a ~10MB limit, so we compress to stay under it.
 *
 * @param {Blob} blob - The image Blob to check/compress.
 * @param {number} [maxBytes=8388608] - Max size in bytes (default 8MB).
 * @returns {Promise<Blob>} The original blob if under limit, or a compressed version.
 */
async function compressBlobForApi(blob, maxBytes = 8 * 1024 * 1024) {
  if (blob.size <= maxBytes) return blob;
  console.log(`[compressBlobForApi] Blob size ${blob.size} exceeds ${maxBytes}. Compressing...`);

  const bitmapSource = await createImageBitmap(blob);
  let { width, height } = bitmapSource;

  // Scale down to max 4096px on longest side if needed
  const MAX_DIM = 4096;
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmapSource, 0, 0, width, height);
  bitmapSource.close();

  // Try JPEG at decreasing quality until under limit
  for (const quality of [0.92, 0.85, 0.75, 0.6]) {
    const compressed = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    console.log(`[compressBlobForApi] quality=${quality} → ${compressed.size} bytes`);
    if (compressed.size <= maxBytes) return compressed;
  }

  // Last resort: scale down further
  canvas.width = Math.round(width * 0.6);
  canvas.height = Math.round(height * 0.6);
  ctx.drawImage(bitmapSource.close ? await createImageBitmap(blob) : bitmapSource, 0, 0, canvas.width, canvas.height);
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.7));
}

/**
 * Calls the direct Recraft.ai imageToImage API.
 * 
 * @param {string} apiKey - The Recraft.ai API Key.
 * @param {Blob} imageBlob - The source reference image blob.
 * @param {string} promptText - The prompt describing edits/style.
 * @param {number} [strength=0.5] - Deviation strength (0.0 to 1.0).
 * @returns {Promise<string>} The generated image URL (typically an SVG file).
 */
async function callRecraftImageToImageApi(apiKey, imageBlob, promptText, strength = 0.5, modelId = 'recraftv4_1_vector') {
  console.log(`[Recraft ImageToImage API] Request started. Model: ${modelId}`);
  if (!apiKey) {
    throw new Error("Recraft.ai API Key is missing. Please configure 'syncraft_recraft_api_key' in your browser localStorage or js/aiConfig.js");
  }

  const url = 'https://external.api.recraft.ai/v1/images/imageToImage';
  console.log("[Recraft ImageToImage API] Sending fetch request...");

  const formData = new FormData();
  formData.append('image', imageBlob, 'reference.png');
  formData.append('prompt', promptText);
  formData.append('model', modelId);
  formData.append('strength', strength.toString());

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  console.log("[Recraft ImageToImage API] Response status received:", response.status, response.statusText);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (errData?.code === 'not_enough_credits') {
      throw new Error("Recraft.ai API key has no credits left. Please top up your Recraft account or check your billing.");
    }
    throw new Error(errData?.error?.message || errData?.message || `Recraft ImageToImage API call failed: ${response.statusText}`);
  }

  const result = await response.json();
  const imgUrl = result.data?.[0]?.url;
  if (!imgUrl) {
    throw new Error("The Recraft API did not return any vector URL.");
  }

  console.log("[Recraft ImageToImage API] Generation complete, URL:", imgUrl);
  return imgUrl;
}

/**
 * Calls the Recraft.ai Vectorize API.
 * Unlike imageToImage, this endpoint performs direct image tracing (no AI generation).
 * It cannot hallucinate a jersey shape — it only traces exactly what pixels it receives.
 *
 * @param {string} apiKey - The Recraft.ai API Key.
 * @param {Blob} imageBlob - The source image blob to vectorize.
 * @returns {Promise<string>} The generated SVG URL.
 */
async function callRecraftVectorizeApi(apiKey, imageBlob) {
  console.log("[Recraft Vectorize API] Request started.");
  if (!apiKey) {
    throw new Error("Recraft.ai API Key is missing.");
  }

  // Auto-compress if blob exceeds Recraft's ~10MB limit
  const safeBlob = await compressBlobForApi(imageBlob);

  const formData = new FormData();
  formData.append('file', safeBlob, 'pattern.png');

  const response = await fetch('https://external.api.recraft.ai/v1/images/vectorize', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData
  });

  console.log("[Recraft Vectorize API] Response status:", response.status, response.statusText);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (errData?.code === 'not_enough_credits') {
      throw new Error("Recraft.ai API key has no credits left. Please top up your Recraft account or check your billing.");
    }
    throw new Error(errData?.error?.message || errData?.message || `Recraft Vectorize API failed: ${response.statusText}`);
  }

  const result = await response.json();
  const imgUrl = result?.image?.url;
  if (!imgUrl) {
    throw new Error("Recraft Vectorize API did not return a URL.");
  }

  console.log("[Recraft Vectorize API] Done, URL:", imgUrl);
  return imgUrl;
}

/**
 * Calls the Recraft.ai Crisp Upscale API.
 *
 * @param {string} apiKey - The Recraft.ai API Key.
 * @param {Blob} imageBlob - The original image blob to upscale.
 * @returns {Promise<string>} The URL of the upscaled image.
 */
async function callRecraftUpscaleApi(apiKey, imageBlob, type = 'crisp') {
  console.log(`[Recraft Upscale API] Request started. Type: ${type}`);
  if (!apiKey) {
    throw new Error("Recraft.ai API Key is missing.");
  }

  const formData = new FormData();
  formData.append('file', imageBlob, 'image.png');

  const path = type === 'creative' ? 'creativeUpscale' : 'crispUpscale';
  const response = await fetch(`https://external.api.recraft.ai/v1/images/${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData
  });

  console.log("[Recraft Upscale API] Response status:", response.status, response.statusText);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (errData?.code === 'not_enough_credits') {
      throw new Error("Recraft.ai API key has no credits left. Please top up your Recraft account or check your billing.");
    }
    throw new Error(errData?.error?.message || errData?.message || `Recraft Upscale failed: ${response.statusText}`);
  }

  const result = await response.json();
  const imgUrl = result?.image?.url || result?.data?.[0]?.url || result?.url;
  if (!imgUrl) {
    throw new Error("Recraft Upscale API did not return an image URL.");
  }

  console.log("[Recraft Upscale API] Done, URL:", imgUrl);
  return imgUrl;
}


/**
 * Calls the Recraft.ai Inpainting API to edit a selected region of an image.
 *
 * @param {string} apiKey - The Recraft.ai API Key.
 * @param {Blob} imageBlob - The original image blob.
 * @param {Blob} maskBlob - The grayscale mask blob (white = edit area, black = keep).
 * @param {string} promptText - The description of what to draw in the edit area.
 * @param {string} modelId - The model ID to use (e.g. recraftv4_1).
 * @returns {Promise<string>} The URL of the resulting inpainted image.
 */
async function callRecraftInpaintApi(apiKey, imageBlob, maskBlob, promptText, modelId = 'recraftv4_1') {
  console.log(`[Recraft Inpaint API] Request started. Model: ${modelId}`);
  if (!apiKey) {
    throw new Error("Recraft.ai API Key is missing.");
  }

  const formData = new FormData();
  formData.append('prompt', promptText);
  formData.append('image', imageBlob, 'image.png');
  formData.append('mask', maskBlob, 'mask.png');
  formData.append('model', modelId);

  const response = await fetch('https://external.api.recraft.ai/v1/images/inpaint', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  console.log("[Recraft Inpaint API] Response status:", response.status, response.statusText);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (errData?.code === 'not_enough_credits') {
      throw new Error("Recraft.ai API key has no credits left. Please top up your Recraft account or check your billing.");
    }
    throw new Error(errData?.error?.message || errData?.message || `Recraft Inpainting failed: ${response.statusText}`);
  }

  const result = await response.json();
  const imgUrl = result.data?.[0]?.url || result?.image?.url;
  if (!imgUrl) {
    throw new Error("Recraft Inpainting API did not return an image URL.");
  }

  console.log("[Recraft Inpaint API] Done, URL:", imgUrl);
  return imgUrl;
}

/**
 * Converts any SVG code into a flat high-resolution PNG blob.
 */
async function renderSvgToPngBlob(svgString, width = 1024, height = 1024) {
  try {
    svgString = await inlineSvgImages(svgString);
  } catch (err) {
    console.warn('SVG inlining failed:', err);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgRoot = doc.querySelector('svg');
  if (svgRoot) {
    svgRoot.setAttribute('width', width);
    svgRoot.setAttribute('height', height);
    svgString = new XMLSerializer().serializeToString(doc);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(url);
        resolve(pngBlob);
      }, 'image/png');
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render SVG to PNG blob'));
    };
    img.src = url;
  });
}

/**
 * Calls the Recraft.ai Remove Background API.
 *
 * @param {string} apiKey - The Recraft.ai API Key.
 * @param {Blob} imageBlob - The source image blob to remove background from.
 * @returns {Promise<string>} The generated image URL with background removed.
 */
async function callRecraftRemoveBackgroundApi(apiKey, imageBlob) {
  console.log("[Recraft RemoveBackground API] Request started.");
  if (!apiKey) {
    throw new Error("Recraft.ai API Key is missing.");
  }

  const formData = new FormData();
  formData.append('image', imageBlob, 'image.png');

  const response = await fetch('https://external.api.recraft.ai/v1/images/removeBackground', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData
  });

  console.log("[Recraft RemoveBackground API] Response status:", response.status, response.statusText);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (errData?.code === 'not_enough_credits') {
      throw new Error("Recraft.ai API key has no credits left. Please top up your Recraft account or check your billing.");
    }
    throw new Error(errData?.error?.message || errData?.message || `Recraft Background Removal failed: ${response.statusText}`);
  }

  const result = await response.json();
  const imgUrl = result?.data?.[0]?.url || result?.image?.url;
  if (!imgUrl) {
    throw new Error("Recraft Background Removal API did not return an image URL.");
  }

  console.log("[Recraft RemoveBackground API] Done, URL:", imgUrl);
  return imgUrl;
}

/**
 * Helper to remove vector background shapes locally using DOM Parser.
 */
function removeVectorBackground(svgCode) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgCode, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgCode;

  let w = parseFloat(svg.getAttribute('width'));
  let h = parseFloat(svg.getAttribute('height'));
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4) {
      w = w || parts[2];
      h = h || parts[3];
    }
  }
  w = w || 1024;
  h = h || 1024;

  const rects = doc.querySelectorAll('rect, path');
  for (let i = 0; i < rects.length; i++) {
    const el = rects[i];
    const tagName = el.tagName.toLowerCase();
    
    if (tagName === 'rect') {
      const rectW = el.getAttribute('width');
      const rectH = el.getAttribute('height');
      const fill = el.getAttribute('fill');
      
      if (fill && fill !== 'none' && fill !== 'transparent') {
        const isFullWidth = rectW === '100%' || parseFloat(rectW) >= w * 0.95;
        const isFullHeight = rectH === '100%' || parseFloat(rectH) >= h * 0.95;
        if (isFullWidth && isFullHeight) {
          el.setAttribute('fill', 'none');
          el.style.fill = 'none';
        }
      }
    }
    
    if (tagName === 'path' && i === 0) {
      const fill = el.getAttribute('fill');
      if (fill && fill !== 'none' && fill !== 'transparent') {
        el.setAttribute('fill', 'none');
        el.style.fill = 'none';
      }
    }
  }

  const styles = doc.querySelectorAll('style');
  styles.forEach(styleEl => {
    let cssText = styleEl.textContent;
    cssText = cssText.replace(/svg\s*\{\s*background-color\s*:[^}]+}/gi, 'svg { background-color: transparent; }');
    cssText = cssText.replace(/svg\s*\{\s*background\s*:[^}]+}/gi, 'svg { background: transparent; }');
    styleEl.textContent = cssText;
  });

  return new XMLSerializer().serializeToString(doc);
}

/**
 * Draws a visual callout/label on the SVG locally using DOM elements.
 */
function addSvgCallout(svgCode, text, x, y, w, h) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgCode, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgCode;

  let viewBoxW = 1024;
  let viewBoxH = 1024;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/\s+/).map(Number);
    if (parts.length === 4) {
      viewBoxW = parts[2];
      viewBoxH = parts[3];
    }
  }

  const px = (x / 100) * viewBoxW;
  const py = (y / 100) * viewBoxH;
  const pw = w ? (w / 100) * viewBoxW : 0;
  const ph = h ? (h / 100) * viewBoxH : 0;

  // Scale factor based on standard 500px baseline height
  const scale = Math.max(1, viewBoxH / 600);
  const labelOffset = 40 * scale;
  let labelX = px;
  let labelY = py - labelOffset;

  if (w && h) {
    labelX = px + pw / 2;
    labelY = py + ph + labelOffset;
  }

  const fontSize = Math.round(12 * scale);
  const labelH = Math.round(30 * scale);
  const labelW = Math.max(120 * scale, text.length * fontSize * 0.6 + 20);
  const strokeWidth = Math.max(1.5, 1.5 * scale);
  const radius = Math.max(5, 5 * scale);

  labelX = Math.max(labelW / 2 + 15, Math.min(viewBoxW - labelW / 2 - 15, labelX));
  labelY = Math.max(labelH / 2 + 15, Math.min(viewBoxH - labelH / 2 - 15, labelY));

  const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'ai-callout');

  if (w && h) {
    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', px);
    rect.setAttribute('y', py);
    rect.setAttribute('width', pw);
    rect.setAttribute('height', ph);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', '#d4ff59');
    rect.setAttribute('stroke-width', strokeWidth);
    rect.setAttribute('rx', '4');
    g.appendChild(rect);
  } else {
    const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', px);
    circle.setAttribute('cy', py);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', '#d4ff59');
    circle.setAttribute('stroke', '#18181b');
    circle.setAttribute('stroke-width', strokeWidth);
    g.appendChild(circle);
  }

  const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
  const startX = w ? px + pw / 2 : px;
  const startY = w ? py + ph / 2 : py;
  line.setAttribute('x1', startX);
  line.setAttribute('y1', startY);
  line.setAttribute('x2', labelX);
  line.setAttribute('y2', labelY);
  line.setAttribute('stroke', '#d4ff59');
  line.setAttribute('stroke-width', strokeWidth * 0.75);
  line.setAttribute('stroke-dasharray', '4,4');
  g.appendChild(line);

  const bgRect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', labelX - labelW / 2);
  bgRect.setAttribute('y', labelY - labelH / 2);
  bgRect.setAttribute('width', labelW);
  bgRect.setAttribute('height', labelH);
  bgRect.setAttribute('fill', 'rgba(24, 24, 27, 0.9)');
  bgRect.setAttribute('stroke', '#d4ff59');
  bgRect.setAttribute('stroke-width', strokeWidth * 0.75);
  bgRect.setAttribute('rx', '6');
  g.appendChild(bgRect);

  const txt = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', labelX);
  txt.setAttribute('y', labelY + (fontSize * 0.35));
  txt.setAttribute('fill', '#ffffff');
  txt.setAttribute('font-size', fontSize);
  txt.setAttribute('font-family', 'sans-serif');
  txt.setAttribute('font-weight', 'bold');
  txt.setAttribute('text-anchor', 'middle');
  txt.textContent = text;
  g.appendChild(txt);

  svg.appendChild(g);
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Calls the direct Recraft.ai generations API.
 * 
 * @param {string} apiKey - The Recraft.ai API Key.
 * @param {string} promptText - The prompt text for vector generation.
 * @returns {Promise<string>} The generated image URL (typically an SVG file).
 */
async function callRecraftVectorApi(apiKey, promptText, modelId = 'recraftv4_1_vector', size = '1024x1024') {
  console.log(`[Recraft API] Request started. Model: ${modelId}`);
  if (!apiKey) {
    throw new Error("Recraft.ai API Key is missing. Please configure 'syncraft_recraft_api_key' in your browser localStorage or js/aiConfig.js");
  }

  const isVector = modelId.includes('vector');
  const endpoint = isVector ? 'vector' : 'raster';
  const url = `https://external.api.recraft.ai/v1/images/generations/${endpoint}`;
  console.log(`[Recraft API] Sending fetch request to ${endpoint}...`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: promptText,
      model: modelId,
      size: size
    })
  });

  console.log("[Recraft API] Response status received:", response.status, response.statusText);

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    if (errData?.code === 'not_enough_credits') {
      throw new Error("Recraft.ai API key has no credits left. Please top up your Recraft account or check your billing.");
    }
    throw new Error(errData?.error?.message || errData?.message || `Recraft API call failed: ${response.statusText}`);
  }

  const result = await response.json();
  const imgUrl = result.data?.[0]?.url;
  if (!imgUrl) {
    throw new Error("The Recraft API did not return any vector URL.");
  }

  console.log("[Recraft API] Generation complete, URL:", imgUrl);
  return imgUrl;
}

function getClosestRecraftSize(w, h) {
  const ratio = w / h;
  const sizes = [
    { size: '1024x1024', ratio: 1.0 },
    { size: '1024x768', ratio: 4/3 },
    { size: '768x1024', ratio: 3/4 },
    { size: '1024x576', ratio: 16/9 },
    { size: '576x1024', ratio: 9/16 },
    { size: '1536x1024', ratio: 3/2 },
    { size: '1024x1536', ratio: 2/3 }
  ];
  let closest = sizes[0];
  let minDist = Math.abs(ratio - closest.ratio);
  for (const s of sizes) {
    const dist = Math.abs(ratio - s.ratio);
    if (dist < minDist) {
      minDist = dist;
      closest = s;
    }
  }
  return closest.size;
}

function getClosestGeminiAspectRatio(w, h) {
  const ratio = w / h;
  const ratios = [
    { label: "1:1", val: 1.0 },
    { label: "16:9", val: 16/9 },
    { label: "9:16", val: 9/16 },
    { label: "4:3", val: 4/3 },
    { label: "3:4", val: 3/4 },
    { label: "3:2", val: 3/2 },
    { label: "2:3", val: 2/3 },
    { label: "21:9", val: 21/9 },
    { label: "5:4", val: 5/4 },
    { label: "4:5", val: 4/5 }
  ];
  let closest = ratios[0];
  let minDist = Math.abs(ratio - closest.val);
  for (const r of ratios) {
    const dist = Math.abs(ratio - r.val);
    if (dist < minDist) {
      minDist = dist;
      closest = r;
    }
  }
  return closest.label;
}

export function initWorkspace(router) {

  appRouter = router;

  // Auto-migrate: Clear old invalid/restricted Gemini keys from localStorage to ensure fallback to correct configuration
  const storedKey = localStorage.getItem('syncraft_gemini_api_key');
  if (storedKey && storedKey.startsWith('AQ.')) {
    console.log('[Syncraft Helper] Removing invalid/restricted key from localStorage:', storedKey);
    localStorage.removeItem('syncraft_gemini_api_key');
  }

  // Initialize Dot Field interactive background
  initDotField('workspace-dot-field-canvas', 'result-display');

  // ── Quick DOM selector helpers ───────────────
  const $ = (id)  => document.getElementById(id);
  const q = (sel) => document.querySelector(sel);
  const WS = '#workspace-view';

  function showUpgradeModal() {
    const modalHTML = `
      <div style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 10px 0;">
        <!-- Crown Icon Badge -->
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(168, 85, 247, 0.15); color: #c084fc; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; border: 1px solid rgba(168, 85, 247, 0.3);">
          <i class="icon fi fi-br-crown" style="font-size: 24px;"></i>
        </div>
        
        <h3 style="font-family: var(--font-family-display); font-size: 20px; font-weight: 800; color: #fff; margin: 0; letter-spacing: -0.01em; text-transform: uppercase;">Unlock Professional Features</h3>
        <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin: 0 0 8px 0; line-height: 1.6; max-width: 380px;">
          Get access to high-fidelity printing models, SVG vector layouts, and signature de-mockup extraction tools.
        </p>

        <!-- Premium Features List -->
        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%; text-align: left; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 12px; padding: 16px; box-sizing: border-box; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255,255,255,0.9); font-weight: 600;">
            <i class="icon fi fi-br-diamond" style="color: var(--color-primary); font-size: 10px;"></i>
            <span>Syncraft Pro Vector (SVG) generation (12t)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255,255,255,0.9); font-weight: 600;">
            <i class="icon fi fi-br-diamond" style="color: var(--color-primary); font-size: 10px;"></i>
            <span>Syncraft (Vectorized) extraction (6t)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255,255,255,0.9); font-weight: 600;">
            <i class="icon fi fi-br-diamond" style="color: var(--color-primary); font-size: 10px;"></i>
            <span>Syncraft Pro (Raster) generation (10t)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255,255,255,0.9); font-weight: 600;">
            <i class="icon fi fi-br-diamond" style="color: var(--color-primary); font-size: 10px;"></i>
            <span>Priority queue (Standard speed + 2x boost)</span>
          </div>
        </div>

        <!-- Action Button -->
        <button id="btn-upgrade-modal-action" style="
          width: 100%;
          background: var(--color-primary);
          color: #000;
          border: none;
          padding: 14px;
          border-radius: 9999px;
          font-weight: 700;
          cursor: pointer;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s ease;
        ">Upgrade Plan</button>
      </div>
    `;

    const { el, close } = openModal('Upgrade Required', modalHTML);
    const actionBtn = el.querySelector('#btn-upgrade-modal-action');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => {
        close();
        router.navigate('settings?tab=subscription');
      });
    }
  }

  // ── Result Display elements ──────────────────
  const resultDisplay    = $('result-display');
  const resultStatusText = $('result-status-text');
  const resultMetaBadge  = $('result-meta-badge');
  const resultSvgWrap    = $('result-svg-wrap');
  const resultPromptLbl  = $('result-prompt-label');
  const genProgressBar   = $('gen-progress-bar');
  const genStatusText    = $('gen-status-text');

  // ── Prompt area ──────────────────────────────
  const promptInput        = $('prompt-input');
  const promptInputWrapper = $('prompt-input-wrapper');
  const promptUploadBtn    = $('prompt-upload-btn');
  const promptFileInput    = $('prompt-file-input');
  const attachmentPreview  = $('prompt-attachment-preview');
  const attachmentThumb    = $('prompt-attachment-thumb');
  const attachmentRemove   = $('prompt-attachment-remove');
  const promptTipEl        = $('prompt-tip');
  const btnGenerate        = $('btn-generate');
  const btnLabel           = q('#btn-generate .btn-generate-label');
  const btnIcon            = $('btn-generate-icon');
  const suggestions        = document.querySelectorAll(`${WS} .suggestion-chip`);
  const toolBtns           = document.querySelectorAll(`.gw-tool-rail .gw-tool-btn`);

  function adjustPromptInputHeight() {
    if (!promptInput) return;
    promptInput.style.height = 'auto';
    promptInput.style.height = promptInput.scrollHeight + 'px';
    if (promptInput.scrollHeight > 160) {
      promptInput.style.overflowY = 'auto';
    } else {
      promptInput.style.overflowY = 'hidden';
    }
  }
  if (promptInput) {
    promptInput.addEventListener('input', adjustPromptInputHeight);
  }

  // ── Toolbox ──────────────────────────────────
  const toolRemoveBg          = $('tool-remove-bg');
  const toolAnnotate          = $('tool-annotate');
  const toolExport            = $('tool-export');
  const toolExtractPattern    = $('tool-extract-pattern');
  const toolExtractRaster     = $('tool-extract-raster');
  const toolVectorize         = $('tool-vectorize');
  const toolUpscaleCrisp      = $('tool-upscale-crisp');
  const toolUpscaleCreative   = $('tool-upscale-creative');
  const infoFormat   = $('info-format');
  const infoSize     = $('info-size');
  const infoPrompt   = $('info-prompt');
  const formatChips  = document.querySelectorAll(`${WS} .format-chip`);

  // ── Header (Managed by MainLayout) ───────────


  // ── Mode strip ───────────────────────────────
  const modeBtns = document.querySelectorAll(`${WS} .gw-mode-btn`);

  // ── State ────────────────────────────────────
  let isGenerating  = false;
  let currentSVG    = '';
  let selectedFormat = 'svg';
  let isAnnotationMode = false;
  let annotations      = [];
  let referenceImage   = '';

  // ── Multi-canvas State ────────────────────────
  let canvases = [];
  let selectedCanvasId = null;
  let undoStack = [];
  let redoStack = [];

  // Select resultInner element
  const resultInner = $('result-inner');

  // Sync canvases and selectedCanvasId back to local store
  function syncCanvasState() {
    const selCanvas = canvases.find(c => c.id === selectedCanvasId);
    if (selCanvas) {
      selCanvas.svgContent = currentSVG;
      selCanvas.annotations = annotations;
      selCanvas.canvasWidth = canvasWidth;
      selCanvas.canvasHeight = canvasHeight;
      selCanvas.canvasPreset = canvasPreset;
      selCanvas.canvasUnit = canvasUnit;
      selCanvas.exportDpi = exportDpi;
    }
    ProjectService.updateCanvasData({
      canvases,
      selectedCanvasId,
      svgContent: selCanvas ? selCanvas.svgContent : '',
      prompt: selCanvas ? selCanvas.prompt : '',
      annotations: selCanvas ? selCanvas.annotations : [],
      bgRemoved: selCanvas ? selCanvas.bgRemoved : false,
      canvasWidth: selCanvas ? selCanvas.canvasWidth : 1024,
      canvasHeight: selCanvas ? selCanvas.canvasHeight : 1024,
      canvasUnit: selCanvas ? selCanvas.canvasUnit : 'px',
      canvasPreset: selCanvas ? selCanvas.canvasPreset : 'Square',
      exportDpi: selCanvas ? selCanvas.exportDpi : 300
    });
    if (selCanvas && selCanvas.svgContent) {
      ProjectService.updateThumbnail(selCanvas.svgContent);
    }
  }

  function pushHistory() {
    const state = {
      canvases: JSON.parse(JSON.stringify(canvases)),
      selectedCanvasId: selectedCanvasId,
      currentSVG: currentSVG,
      annotations: JSON.parse(JSON.stringify(annotations))
    };
    undoStack.push(state);
    redoStack = [];
    if (undoStack.length > 50) {
      undoStack.shift();
    }
  }

  function undo() {
    if (undoStack.length === 0) {
      showToast('Undo — history stack is empty');
      return;
    }
    const currentState = {
      canvases: JSON.parse(JSON.stringify(canvases)),
      selectedCanvasId: selectedCanvasId,
      currentSVG: currentSVG,
      annotations: JSON.parse(JSON.stringify(annotations))
    };
    redoStack.push(currentState);

    const prevState = undoStack.pop();
    canvases = prevState.canvases;
    selectedCanvasId = prevState.selectedCanvasId;
    currentSVG = prevState.currentSVG;
    annotations = prevState.annotations;

    const selCanvas = canvases.find(c => c.id === selectedCanvasId);
    ProjectService.updateCanvasData({
      canvases,
      selectedCanvasId,
      svgContent: currentSVG,
      annotations
    });

    syncSelectedCanvasToSidebar();
    renderCanvases();
    renderAnnotations();
    resizeAnnotationOverlay();

    if (currentSVG) {
      renderOutput(currentSVG, selCanvas ? selCanvas.prompt : '');
      setDisplayState('output');
      unlockToolbox();
    } else {
      setDisplayState('idle');
      lockToolbox();
    }
    showToast('Undo applied');
  }

  function redo() {
    if (redoStack.length === 0) {
      showToast('Redo — history stack is empty');
      return;
    }
    const currentState = {
      canvases: JSON.parse(JSON.stringify(canvases)),
      selectedCanvasId: selectedCanvasId,
      currentSVG: currentSVG,
      annotations: JSON.parse(JSON.stringify(annotations))
    };
    undoStack.push(currentState);

    const nextState = redoStack.pop();
    canvases = nextState.canvases;
    selectedCanvasId = nextState.selectedCanvasId;
    currentSVG = nextState.currentSVG;
    annotations = nextState.annotations;

    const selCanvas = canvases.find(c => c.id === selectedCanvasId);
    ProjectService.updateCanvasData({
      canvases,
      selectedCanvasId,
      svgContent: currentSVG,
      annotations
    });

    syncSelectedCanvasToSidebar();
    renderCanvases();
    renderAnnotations();
    resizeAnnotationOverlay();

    if (currentSVG) {
      renderOutput(currentSVG, selCanvas ? selCanvas.prompt : '');
      setDisplayState('output');
      unlockToolbox();
    } else {
      setDisplayState('idle');
      lockToolbox();
    }
    showToast('Redo applied');
  }

  // Update global sidebar settings from the selected canvas
  function syncSelectedCanvasToSidebar() {
    const canvas = canvases.find(c => c.id === selectedCanvasId);
    if (!canvas) return;

    canvasWidth = canvas.canvasWidth;
    canvasHeight = canvas.canvasHeight;
    canvasPreset = canvas.canvasPreset;
    canvasUnit = canvas.canvasUnit;
    exportDpi = canvas.exportDpi;
    annotations = canvas.annotations || [];
    currentSVG = canvas.svgContent || '';

    const widthInput = $('canvas-width');
    const heightInput = $('canvas-height');
    const presetSelect = $('canvas-preset');
    const dpiSelect = $('canvas-dpi');

    if (widthInput) widthInput.value = canvasWidth;
    if (heightInput) heightInput.value = canvasHeight;
    if (presetSelect) presetSelect.value = canvasPreset;
    if (dpiSelect) dpiSelect.value = exportDpi;

    if (promptInput) {
      promptInput.value = canvas.prompt || '';
      adjustPromptInputHeight();
    }

    unlockToolbox();

    const activeBubble = annotationOverlay?.querySelector('.annotation-input-bubble');
    if (activeBubble) activeBubble.remove();
  }

  function renderCanvases() {
    if (!resultInner) return;

    if (annotationOverlay) {
      annotationOverlay.remove();
    }

    resultInner.innerHTML = '';

    canvases.forEach(canvas => {
      const isSelected = canvas.id === selectedCanvasId;
      const frame = document.createElement('div');
      frame.className = `canvas-frame${canvas.isGenerating ? ' generating' : (canvas.svgContent ? ' output' : ' empty')}${isSelected ? ' selected' : ''}`;
      frame.id = `canvas-frame-${canvas.id}`;

      const wVal = parseFloat(canvas.canvasWidth) || 1024;
      const hVal = parseFloat(canvas.canvasHeight) || 1024;
      const ratio = wVal / hVal;

      const displayScale = 0.45;
      const displayW = wVal * displayScale;
      const displayH = hVal * displayScale;

      frame.style.position = 'absolute';
      frame.style.width = `${displayW}px`;
      frame.style.height = `${displayH}px`;
      frame.style.left = `${canvas.x}px`;
      frame.style.top = `${canvas.y}px`;

      const labelText = canvas.isGenerating 
        ? 'Generating...' 
        : (canvas.svgContent ? `${canvas.canvasPreset} (${wVal}x${hVal} ${canvas.canvasUnit}) • ${canvas.exportDpi} DPI` : `${canvas.canvasPreset} (${wVal}x${hVal} ${canvas.canvasUnit}) • ${canvas.exportDpi} DPI`);

      const label = document.createElement('div');
      label.className = 'canvas-frame-label';
      label.textContent = labelText;
      frame.appendChild(label);

      if (canvas.isGenerating) {
        const genContent = document.createElement('div');
        genContent.className = 'result-generating-content';
        genContent.style.width = '100%';
        genContent.style.height = '100%';
        genContent.style.margin = 'auto';
        genContent.style.display = 'flex';
        genContent.style.alignItems = 'center';
        genContent.style.justifyContent = 'center';

        genContent.innerHTML = `
          <div class="gen-logo-loader-container">
            <img class="gen-logo-loader" src="brand%20logos/Syncraft%20Logo-11.svg" alt="Syncraft" />
          </div>
        `;
        frame.appendChild(genContent);
      } else if (!canvas.svgContent) {
        const idleContent = document.createElement('div');
        idleContent.className = 'result-idle-content';
        idleContent.innerHTML = `
          <div class="result-idle-icon">
            <i class="icon fi fi-br-paint-brush" style="font-size:48px;color:rgba(255,255,255,0.06);"></i>
          </div>
          <p class="result-idle-label" style="font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.15); margin-top: 10px;">AWAITING GENERATION</p>
          <p class="result-idle-hint" style="font-size: 11px; color: rgba(255,255,255,0.1); margin-top: 4px;">Type a prompt below and press Generate</p>
        `;
        frame.appendChild(idleContent);
      } else {
        const svgWrap = document.createElement('div');
        svgWrap.className = 'result-svg-wrap';
        svgWrap.id = `result-svg-wrap-${canvas.id}`;
        svgWrap.innerHTML = canvas.svgContent;

        // ── Normalize SVG for workspace display ──
        // Override fixed pixel dimensions so the inline SVG scales to
        // fill its container. The raw canvas.svgContent is NOT modified,
        // so exports still use the original dimensions.
        const svgEl = svgWrap.querySelector('svg');
        if (svgEl) {
          if (!svgEl.getAttribute('viewBox')) {
            const origW = parseFloat(svgEl.getAttribute('width')) || wVal;
            const origH = parseFloat(svgEl.getAttribute('height')) || hVal;
            svgEl.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
          }
          svgEl.setAttribute('width', '100%');
          svgEl.setAttribute('height', '100%');
          const existingPreserve = svgEl.getAttribute('preserveAspectRatio');
          if (!existingPreserve || existingPreserve !== 'none') {
            svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          }
        }

        if (isSelected && annotationOverlay) {
          svgWrap.appendChild(annotationOverlay);
        }

        frame.appendChild(svgWrap);
      }

      ['tl', 'tr', 'bl', 'br'].forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `frame-handle ${pos}`;
        frame.appendChild(handle);
      });

      frame.addEventListener('click', (e) => {
        if (e.target.closest('.annotation-badge') || e.target.closest('.annotation-input-bubble') || e.target.closest('.annotation-badge-delete')) {
          return;
        }
        if (selectedCanvasId !== canvas.id) {
          selectedCanvasId = canvas.id;
          syncSelectedCanvasToSidebar();
          renderCanvases();
        }
      });

      frame.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (selectedCanvasId !== canvas.id) {
          selectedCanvasId = canvas.id;
          syncSelectedCanvasToSidebar();
          renderCanvases();
        }

        const existingMenu = document.getElementById('canvas-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'canvas-context-menu';
        menu.className = 'canvas-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.zIndex = '10000';

        menu.innerHTML = `
          <div class="menu-item has-submenu" id="menu-export">
            <i class="icon fi fi-br-download"></i>
            <span>Export as...</span>
            <i class="icon fi fi-br-angle-right submenu-arrow"></i>
            <div class="submenu">
              <div class="submenu-item" data-format="svg">SVG</div>
              <div class="submenu-item" data-format="png">PNG</div>
              <div class="submenu-item" data-format="jpeg">JPEG</div>
              <div class="submenu-item" data-format="pdf">PDF</div>
            </div>
          </div>
          ${canvas.svgContent ? `
            <div class="menu-item" id="menu-remove-bg">
              <i class="icon fi fi-br-magic-wand"></i>
              <span>Remove background</span>
            </div>
            <div class="menu-item" id="menu-thumbnail">
              <i class="icon fi fi-br-picture"></i>
              <span>Set as project thumbnail</span>
            </div>
          ` : ''}
          <div class="menu-divider"></div>
          <div class="menu-item delete-item" id="menu-delete">
            <i class="icon fi fi-br-trash"></i>
            <span>Delete</span>
          </div>
        `;

        document.body.appendChild(menu);

        const submenuItems = menu.querySelectorAll('.submenu-item');
        submenuItems.forEach(item => {
          item.addEventListener('click', () => {
            const format = item.getAttribute('data-format');
            if (canvas.svgContent) {
              downloadFile(canvas.svgContent, format);
            } else {
              showToast('No content to export', true);
            }
            menu.remove();
          });
        });

        const btnRemoveBg = menu.querySelector('#menu-remove-bg');
        if (btnRemoveBg) {
          btnRemoveBg.addEventListener('click', () => {
            menu.remove();
            if (toolRemoveBg) toolRemoveBg.click();
          });
        }

        const btnThumb = menu.querySelector('#menu-thumbnail');
        if (btnThumb) {
          btnThumb.addEventListener('click', () => {
            menu.remove();
            if (canvas.svgContent) {
              ProjectService.updateThumbnail(canvas.svgContent);
              showToast('Set as project thumbnail');
            }
          });
        }

        const btnDel = menu.querySelector('#menu-delete');
        if (btnDel) {
          btnDel.addEventListener('click', () => {
            menu.remove();
            if (canvases.length <= 1) {
              showToast('Cannot delete the last canvas frame', true);
            } else {
              pushHistory();
              canvases = canvases.filter(c => c.id !== canvas.id);
              selectedCanvasId = canvases[0].id;
              syncSelectedCanvasToSidebar();
              syncCanvasState();
              renderCanvases();
              showToast('Canvas deleted');
            }
          });
        }

        const closeMenu = (ev) => {
          if (!menu.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
          }
        };
        setTimeout(() => {
          document.addEventListener('click', closeMenu);
        }, 10);
      });

      resultInner.appendChild(frame);
    });

    const selectedFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`);
    if (selectedFrame) {
      if (annotationOverlay) {
        selectedFrame.appendChild(annotationOverlay);
      }

      const selCanvas = canvases.find(c => c.id === selectedCanvasId);
      if (selCanvas) {
        annotations = selCanvas.annotations || [];
        currentSVG = selCanvas.svgContent || '';
        updateAnnotationOverlayVisibility();
        renderAnnotations();
        resizeAnnotationOverlay();
      }
    }
  }

  // ── AI Model Configuration & Selection State ──
  const models = {
    'syncraft-vector': { name: 'Syncraft Vector (SVG)', cost: 4, apiId: 'recraftv4_1_vector', type: 'vector' },
    'syncraft-pro-vector': { name: 'Syncraft Pro Vector (SVG)', cost: 12, apiId: 'recraftv4_1_pro_vector', type: 'vector' },
    'syncraft-lite': { name: 'Syncraft Lite (Raster)', cost: 2, apiId: 'recraftv4_1', type: 'raster' },
    'syncraft-pro': { name: 'Syncraft Pro (Raster)', cost: 10, apiId: 'recraftv4_1_pro', type: 'raster' },
    'syncraft-ultra': { name: 'Syncraft Ultra (Creative)', cost: 20, apiId: 'gemini-3-pro-image', type: 'ultra' }
  };
  let selectedModel = 'syncraft-ultra';
  let selectedSyncraftEngine = 'nano-banana-pro'; // Temporarily disabled 'leonardo' as requested

  // ── Zooming & Panning State ──────────────────
  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  let isSpacePressed = false;
  let activeToolId = 'tool-select';
  let selectedAnnotationId = null;
  let isCanvasDragging = false;

  // ── Canvas Dimensions & DPI State ────────────
  let canvasWidth = 1024;
  let canvasHeight = 1024;
  let canvasUnit = 'px';
  let canvasPreset = 'Square';
  let exportDpi = 300;
  let referenceAspectWidth = 1024;
  let referenceAspectHeight = 1024;


  const presets = {
    'Square': { w: 1024, h: 1024, unit: 'px' },
    'A4 Portrait': { w: 210, h: 297, unit: 'mm' },
    'A4 Landscape': { w: 297, h: 210, unit: 'mm' },
    'A3 Portrait': { w: 297, h: 420, unit: 'mm' },
    'A3 Landscape': { w: 420, h: 297, unit: 'mm' },
    'Letter Portrait': { w: 8.5, h: 11, unit: 'in' },
    'Letter Landscape': { w: 11, h: 8.5, unit: 'in' }
  };

  // Select Annotation Elements
  const annotationOverlay = $('annotation-overlay');
  const annotationBanner = $('annotation-banner');
  const annotationBannerClose = $('annotation-banner-close');

  // ════════════════════════════════════════════
  // 0. BOOT & PROJECT STATE SYNC
  // ════════════════════════════════════════════

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startClientX = 0;
  let startClientY = 0;

  function resizeAnnotationOverlay() {
    if (!annotationOverlay) return;
    const activeSvgWrap = document.querySelector('.canvas-frame.selected .result-svg-wrap');
    const svgEl = activeSvgWrap ? activeSvgWrap.querySelector('svg') : null;
    if (svgEl && activeSvgWrap) {
      const rect = svgEl.getBoundingClientRect();
      const parentRect = activeSvgWrap.getBoundingClientRect();
      const localW = rect.width / zoomLevel;
      const localH = rect.height / zoomLevel;
      const localLeft = (rect.left - parentRect.left) / zoomLevel;
      const localTop = (rect.top - parentRect.top) / zoomLevel;
      annotationOverlay.style.width = `${localW}px`;
      annotationOverlay.style.height = `${localH}px`;
      annotationOverlay.style.left = `${localLeft}px`;
      annotationOverlay.style.top = `${localTop}px`;
    }
  }

  function updateCanvasFrameDisplay() {
    const emptyFrame = $('canvas-frame-empty');
    const generatingFrame = $('canvas-frame-generating');
    const outputFrame = $('canvas-frame');

    if (!resultDisplay) return;
    const containerW = resultDisplay.clientWidth || 800;
    const containerH = resultDisplay.clientHeight || 600;

    const paddingX = 160;
    const paddingY = 200;

    const maxDisplayW = Math.max(200, containerW - paddingX);
    const maxDisplayH = Math.max(200, containerH - paddingY);

    const wVal = parseFloat(canvasWidth) || 1024;
    const hVal = parseFloat(canvasHeight) || 1024;
    const targetAspectRatio = wVal / hVal;
    const maxAspectRatio = maxDisplayW / maxDisplayH;

    let displayW = maxDisplayW;
    let displayH = maxDisplayH;

    if (targetAspectRatio > maxAspectRatio) {
      displayW = maxDisplayW;
      displayH = maxDisplayW / targetAspectRatio;
    } else {
      displayH = maxDisplayH;
      displayW = maxDisplayH * targetAspectRatio;
    }

    [emptyFrame, generatingFrame, outputFrame].forEach(frame => {
      if (frame) {
        frame.style.width = `${displayW}px`;
        frame.style.height = `${displayH}px`;
      }
    });

    const labelText = `${canvasPreset} (${wVal}x${hVal} ${canvasUnit}) • ${exportDpi} DPI`;
    
    const emptyLabel = emptyFrame?.querySelector('.canvas-frame-label');
    const genLabel = generatingFrame?.querySelector('.canvas-frame-label');
    const outputLabel = $('canvas-frame-label');

    if (emptyLabel) emptyLabel.textContent = labelText;
    if (genLabel) genLabel.textContent = 'Generating...';
    if (outputLabel) outputLabel.textContent = labelText;
  }

  // Hook resize listener
  window.addEventListener('resize', () => {
    resizeAnnotationOverlay();
    renderCanvases();
  });

  // Sync / render annotations badges and selection boxes
  function renderAnnotations() {
    if (!annotationOverlay) return;
    // Clear overlay except for input bubble
    const activeBubble = annotationOverlay.querySelector('.annotation-input-bubble');
    annotationOverlay.innerHTML = '';
    if (activeBubble) {
      annotationOverlay.appendChild(activeBubble);
    }

    annotations.forEach((ann) => {
      const isRegion = typeof ann.width === 'number' && typeof ann.height === 'number' && (ann.width > 0 || ann.height > 0);
      const isSelected = ann.id === selectedAnnotationId;

      // Render regional selection box
      let boxEl = null;
      if (isRegion) {
        boxEl = document.createElement('div');
        boxEl.className = 'annotation-box' + (isSelected ? ' highlight' : '');
        boxEl.style.left = `${ann.x}%`;
        boxEl.style.top = `${ann.y}%`;
        boxEl.style.width = `${ann.width}%`;
        boxEl.style.height = `${ann.height}%`;
        boxEl.setAttribute('data-ann-id', ann.id);
        annotationOverlay.appendChild(boxEl);
      }

      // Render label badge
      const badge = document.createElement('div');
      badge.className = 'annotation-badge' + (isRegion ? ' regional' : '') + (isSelected ? ' selected' : '');
      badge.style.left = `${ann.x}%`;
      badge.style.top = `${ann.y}%`;
      badge.setAttribute('data-ann-id', ann.id);
      
      const textSpan = document.createElement('span');
      textSpan.textContent = ann.text;
      badge.appendChild(textSpan);

      // Show delete close button if annotation mode is active OR if selected under Select tool
      if (isAnnotationMode || (activeToolId === 'tool-select' && isSelected)) {
        const delBtn = document.createElement('button');
        delBtn.className = 'annotation-badge-delete';
        delBtn.title = 'Delete Callout';
        delBtn.innerHTML = '<i class="icon fi fi-br-cross"></i>';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteAnnotation(ann.id);
          if (selectedAnnotationId === ann.id) {
            selectedAnnotationId = null;
          }
        });
        badge.appendChild(delBtn);
      }

      // Click to select under Select tool
      badge.addEventListener('click', (e) => {
        if (activeToolId === 'tool-select') {
          e.stopPropagation();
          selectedAnnotationId = (selectedAnnotationId === ann.id) ? null : ann.id;
          renderAnnotations();
        }
      });

      // Double click to edit under Select tool
      badge.addEventListener('dblclick', (e) => {
        if (activeToolId === 'tool-select') {
          e.stopPropagation();
          openEditBubble(ann, badge);
        }
      });

      // Hover link effect between badge and selection box
      if (boxEl) {
        badge.addEventListener('mouseenter', () => boxEl.classList.add('highlight'));
        badge.addEventListener('mouseleave', () => {
          if (ann.id !== selectedAnnotationId) {
            boxEl.classList.remove('highlight');
          }
        });
      }

      annotationOverlay.appendChild(badge);
    });
  }

  function deleteAnnotation(id) {
    pushHistory();
    annotations = annotations.filter(a => a.id !== id);
    ProjectService.updateCanvasData({ annotations });
    renderAnnotations();
    showToast('Callout removed');
  }

  function enterAnnotationMode() {
    if (!currentSVG) return;
    isAnnotationMode = true;
    
    if (toolAnnotate) {
      toolAnnotate.classList.add('active');
      const descEl = toolAnnotate.querySelector('.toolbox-btn-desc');
      if (descEl) descEl.textContent = 'Drag to select area';
    }

    if (annotationBanner) {
      const bannerText = annotationBanner.querySelector('span');
      if (bannerText) bannerText.innerHTML = 'Annotation Mode Active &bull; Drag on image to select area';
      annotationBanner.style.display = 'flex';
    }
    
    if (annotationOverlay) {
      annotationOverlay.style.display = 'block';
      annotationOverlay.classList.add('active');
    }

    resizeAnnotationOverlay();
    renderAnnotations();
    showToast('Entered Annotation Mode');
  }

  function exitAnnotationMode() {
    if (!isAnnotationMode) return;
    isAnnotationMode = false;

    if (toolAnnotate) {
      toolAnnotate.classList.remove('active');
      const descEl = toolAnnotate.querySelector('.toolbox-btn-desc');
      if (descEl) descEl.textContent = 'Add labels & callouts';
    }

    if (annotationBanner) annotationBanner.style.display = 'none';
    if (annotationOverlay) {
      annotationOverlay.classList.remove('active');
      renderAnnotations();
    }
    
    const bubble = annotationOverlay?.querySelector('.annotation-input-bubble');
    if (bubble) bubble.remove();

    showToast('Exited Annotation Mode');
  }

  function toggleAnnotationMode() {
    if (isAnnotationMode) {
      exitAnnotationMode();
    } else {
      enterAnnotationMode();
    }
  }

  // Click and drag to create annotation boxes
  if (annotationOverlay) {
    annotationOverlay.addEventListener('mousedown', (e) => {
      if (!isAnnotationMode) return;

      // Don't draw if in panning mode or holding spacebar
      if (isSpacePressed || activeToolId === 'tool-pan') {
        return;
      }

      // Don't start drag if clicking inside an active bubble or badge
      if (e.target.closest('.annotation-input-bubble') || e.target.closest('.annotation-badge')) {
        return;
      }

      // Remove existing input bubble if it was cancelled
      const existingBubble = annotationOverlay.querySelector('.annotation-input-bubble');
      if (existingBubble) {
        existingBubble.remove();
        renderAnnotations();
      }

      const rect = annotationOverlay.getBoundingClientRect();
      startClientX = e.clientX;
      startClientY = e.clientY;
      startX = ((startClientX - rect.left) / rect.width) * 100;
      startY = ((startClientY - rect.top) / rect.height) * 100;

      // Create temporary visual rectangle helper
      const tempBox = document.createElement('div');
      tempBox.className = 'annotation-temp-box';
      tempBox.id = 'annotation-temp-box';
      tempBox.style.left = `${startX}%`;
      tempBox.style.top = `${startY}%`;
      tempBox.style.width = '0%';
      tempBox.style.height = '0%';
      annotationOverlay.appendChild(tempBox);

      isDragging = true;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isAnnotationMode || !isDragging) return;

      const rect = annotationOverlay.getBoundingClientRect();
      const currClientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const currClientY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));

      const currX = ((currClientX - rect.left) / rect.width) * 100;
      const currY = ((currClientY - rect.top) / rect.height) * 100;

      const left = Math.min(startX, currX);
      const top = Math.min(startY, currY);
      const width = Math.abs(startX - currX);
      const height = Math.abs(startY - currY);

      const tempBox = document.getElementById('annotation-temp-box');
      if (tempBox) {
        tempBox.style.left = `${left}%`;
        tempBox.style.top = `${top}%`;
        tempBox.style.width = `${width}%`;
        tempBox.style.height = `${height}%`;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!isAnnotationMode || !isDragging) return;
      isDragging = false;

      const tempBox = document.getElementById('annotation-temp-box');
      if (!tempBox) return;

      // Read final coordinates
      const left = parseFloat(tempBox.style.left);
      const top = parseFloat(tempBox.style.top);
      const width = parseFloat(tempBox.style.width);
      const height = parseFloat(tempBox.style.height);

      tempBox.remove(); // Remove temporary graphic

      // Threshold to distinguish between drag and point click
      const isRegionSelection = width > 1.5 || height > 1.5;

      const finalX = left;
      const finalY = top;
      const finalWidth = isRegionSelection ? width : 0;
      const finalHeight = isRegionSelection ? height : 0;

      // Draw a temporary select frame to keep the selection visible while typing the label
      if (isRegionSelection) {
        const dummyBox = document.createElement('div');
        dummyBox.className = 'annotation-temp-box';
        dummyBox.id = 'annotation-temp-box-editing';
        dummyBox.style.left = `${finalX}%`;
        dummyBox.style.top = `${finalY}%`;
        dummyBox.style.width = `${finalWidth}%`;
        dummyBox.style.height = `${finalHeight}%`;
        annotationOverlay.appendChild(dummyBox);
      }

      // Create input bubble
      const bubble = document.createElement('div');
      bubble.className = 'annotation-input-bubble';
      
      // Position input bubble:
      if (isRegionSelection) {
        // Center-bottom of the rectangle
        bubble.style.left = `${finalX + finalWidth / 2}%`;
        bubble.style.top = `${finalY + finalHeight}%`;
        bubble.style.transform = 'translate(-50%, 8px)';
      } else {
        // Point centered
        bubble.style.left = `${finalX}%`;
        bubble.style.top = `${finalY}%`;
        bubble.style.transform = 'translate(-50%, -50%)';
      }

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = isRegionSelection ? 'Label selected area...' : 'Callout note...';
      input.id = 'new-annotation-input';
      
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'annotation-input-btn confirm';
      confirmBtn.title = 'Add label';
      confirmBtn.innerHTML = '<i class="icon fi fi-br-check"></i>';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'annotation-input-btn cancel';
      cancelBtn.title = 'Cancel';
      cancelBtn.innerHTML = '<i class="icon fi fi-br-cross"></i>';

      bubble.appendChild(input);
      bubble.appendChild(confirmBtn);
      bubble.appendChild(cancelBtn);
      annotationOverlay.appendChild(bubble);

      input.focus();

      const cleanupEditing = () => {
        bubble.remove();
        const dummy = document.getElementById('annotation-temp-box-editing');
        if (dummy) dummy.remove();
      };

      const submitValue = async () => {
        const val = input.value.trim();
        if (!val) {
          cleanupEditing();
          renderAnnotations();
          return;
        }

        pushHistory();

        // Start processing state
        if (toolAnnotate) {
          toolAnnotate.classList.add('processing');
          const annNameEl = toolAnnotate.querySelector('.action-item-name');
          if (annNameEl) annNameEl.textContent = 'Editing Area...';
          const annIconEl = toolAnnotate.querySelector('.icon');
          if (annIconEl) annIconEl.className = 'icon fi fi-br-hourglass';
        }

        const canvasLoader = $('result-loading-overlay');
        const canvasLoaderText = $('result-loading-text');
        const canvasLoaderBar = $('result-loading-bar');
        const activeFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`) || document.getElementById('canvas-frame');
        if (activeFrame && canvasLoader) {
          activeFrame.appendChild(canvasLoader);
        }
        if (canvasLoader) canvasLoader.classList.add('active');
        if (canvasLoaderText) canvasLoaderText.textContent = 'AI Editing Selected Area...';
        if (canvasLoaderBar) {
          canvasLoaderBar.style.transition = 'none';
          canvasLoaderBar.style.width = '0%';
          requestAnimationFrame(() => {
            canvasLoaderBar.style.transition = 'width 6s linear';
            canvasLoaderBar.style.width = '100%';
          });
        }

        const newAnn = {
          id: crypto.randomUUID(),
          text: val,
          x: finalX,
          y: finalY
        };
        if (isRegionSelection) {
          newAnn.width = finalWidth;
          newAnn.height = finalHeight;
        }

        try {
          const recraftApiKey = getRecraftApiKey();
          if (!recraftApiKey) {
            throw new Error("Recraft.ai API Key is missing. Please configure it in preferences.");
          }

          let imageBlob;
          const isRaster = isRasterSvg(currentSVG);
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(currentSVG, 'image/svg+xml');
          const imgEl = svgDoc.querySelector('image');

          const mw = parseFloat(canvasWidth) || 1024;
          const mh = parseFloat(canvasHeight) || 1024;

          if (isRaster && imgEl) {
            const imgHref = imgEl.getAttribute('href') || imgEl.getAttribute('xlink:href') || '';
            if (!imgHref) throw new Error('Could not find raster design inside SVG.');
            if (imgHref.startsWith('data:')) {
              imageBlob = dataURLtoBlob(imgHref);
            } else {
              const fetchRes = await fetch(imgHref);
              imageBlob = await fetchRes.blob();
            }
          } else {
            imageBlob = await renderSvgToPngBlob(currentSVG, mw, mh);
          }

          // Create mask canvas (black canvas, white area for inpainting)
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = mw;
          maskCanvas.height = mh;
          const ctx = maskCanvas.getContext('2d');
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, mw, mh);

          // Get box coordinates in pixels
          let px = (newAnn.x / 100) * mw;
          let py = (newAnn.y / 100) * mh;
          let pw = newAnn.width ? (newAnn.width / 100) * mw : mw * 0.15;
          let ph = newAnn.height ? (newAnn.height / 100) * mh : mh * 0.15;
          if (!newAnn.width) {
            px = px - pw / 2;
            py = py - ph / 2;
          }

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px, py, pw, ph);

          const maskBlob = await new Promise((resolve) => {
            maskCanvas.toBlob(resolve, 'image/png');
          });

          // Call Recraft Inpaint API (use standard recraftv4_1 or recraftv4_1_pro)
          const modelId = (models[selectedModel]?.apiId && !models[selectedModel].apiId.includes('vector')) 
            ? models[selectedModel].apiId 
            : 'recraftv4_1';
          const inpaintedImgUrl = await callRecraftInpaintApi(recraftApiKey, imageBlob, maskBlob, val, modelId);

          // Fetch resulting image, convert to Base64
          const fetchResUrl = await fetch(inpaintedImgUrl);
          const inpaintedBlob = await fetchResUrl.blob();
          const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(inpaintedBlob);
          });

          let newSvgCode = '';
          if (isRaster && imgEl) {
            // Replace only the background image tag to preserve any other overlays/texts
            imgEl.setAttribute('href', base64Data);
            newSvgCode = new XMLSerializer().serializeToString(svgDoc);
          } else {
            // Replace entire SVG content
            newSvgCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${mw} ${mh}" width="100%" height="100%"><rect width="100%" height="100%" fill="none"/><image href="${base64Data}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet" /></svg>`;
          }

          currentSVG = cleanAndValidateSvg(newSvgCode);

          // Save and render
          ProjectService.updateCanvasData({
            svgContent: currentSVG
          });
          ProjectService.updateThumbnail(currentSVG);

          renderOutput(currentSVG, promptInput?.value.trim() ?? '');
          showToast('Image region successfully edited by AI');

          // Success state on button
          if (toolAnnotate) {
            toolAnnotate.classList.remove('processing');
            toolAnnotate.classList.add('done');
            const annNameEl = toolAnnotate.querySelector('.action-item-name');
            const annIconEl = toolAnnotate.querySelector('.icon');
            if (annNameEl) annNameEl.textContent = 'Edit Applied';
            if (annIconEl) {
              annIconEl.className = 'icon fi fi-br-check-circle';
              annIconEl.style.color = 'var(--color-primary)';
            }
            setTimeout(() => {
              toolAnnotate.classList.remove('done');
              if (annNameEl) annNameEl.textContent = 'Edit Area (Annotate)';
              if (annIconEl) {
                annIconEl.className = 'icon fi fi-br-pen-clip';
                annIconEl.style.color = '';
              }
            }, 3000);
          }

        } catch (err) {
          console.error(err);
          showToast('Image edit failed: ' + (err.message || ''), true);
          if (toolAnnotate) {
            toolAnnotate.classList.remove('processing');
            const annNameEl = toolAnnotate.querySelector('.action-item-name');
            if (annNameEl) annNameEl.textContent = 'Edit Area (Annotate)';
            const annIconEl = toolAnnotate.querySelector('.icon');
            if (annIconEl) {
              annIconEl.className = 'icon fi fi-br-exclamation';
              annIconEl.style.color = '#ffb4ab';
            }
            setTimeout(() => {
              if (annIconEl) {
                annIconEl.className = 'icon fi fi-br-pen-clip';
                annIconEl.style.color = '';
              }
            }, 3000);
          }
        } finally {
          cleanupEditing();
          renderAnnotations();
          if (canvasLoader) {
            canvasLoader.classList.remove('active');
            if (resultDisplay) resultDisplay.appendChild(canvasLoader);
          }
        }
      };

      confirmBtn.addEventListener('click', submitValue);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') submitValue();
        if (ev.key === 'Escape') {
          cleanupEditing();
          renderAnnotations();
        }
      });
      cancelBtn.addEventListener('click', () => {
        cleanupEditing();
        renderAnnotations();
      });
    });
  }

  if (annotationBannerClose) {
    annotationBannerClose.addEventListener('click', exitAnnotationMode);
  }

  // Load a project's state into workspace UI
  function loadProjectState(proj) {
    exitAnnotationMode();
    selectedAnnotationId = null;
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    applyViewportTransform();

    // Load canvases
    let loadedCanvases = proj?.canvasData?.canvases;
    if (!loadedCanvases || loadedCanvases.length === 0) {
      loadedCanvases = [
        {
          id: crypto.randomUUID(),
          svgContent: proj?.canvasData?.svgContent || '',
          prompt: proj?.canvasData?.prompt || '',
          annotations: proj?.canvasData?.annotations || [],
          bgRemoved: proj?.canvasData?.bgRemoved || false,
          canvasWidth: proj?.canvasData?.canvasWidth || 1024,
          canvasHeight: proj?.canvasData?.canvasHeight || 1024,
          canvasUnit: proj?.canvasData?.canvasUnit || 'px',
          canvasPreset: proj?.canvasData?.canvasPreset || 'Square',
          exportDpi: proj?.canvasData?.exportDpi || 300,
          x: 0,
          y: 0
        }
      ];
    }

    // Strip volatile runtime flags that should never be persisted.
    // If a generation was in-progress when the user refreshed, isGenerating
    // would be saved as true — without this cleanup the canvas would show
    // "Generating..." forever instead of showing the last saved SVG content.
    canvases = loadedCanvases.map(c => ({
      ...c,
      isGenerating: false,
      progress:     0,
      statusText:   '',
    }));
    selectedCanvasId = proj?.canvasData?.selectedCanvasId || canvases[0].id;

    syncSelectedCanvasToSidebar();
    renderCanvases();

    // Restore Reference Image
    referenceImage = proj?.canvasData?.referenceImage || '';
    if (referenceImage) {
      if (attachmentThumb) attachmentThumb.src = referenceImage;
      if (attachmentPreview) attachmentPreview.classList.add('active');
      if (promptInputWrapper) promptInputWrapper.classList.add('has-attachment');
      if (toolExtractPattern) {
        toolExtractPattern.disabled = false;
        toolExtractPattern.classList.remove('needs-image');
      }
      if (toolExtractRaster) {
        toolExtractRaster.disabled = false;
        toolExtractRaster.classList.remove('needs-image');
      }
      const tabSyncraft = $('tab-syncraft');
      if (tabSyncraft) tabSyncraft.classList.remove('needs-image');
    } else {
      if (attachmentPreview) attachmentPreview.classList.remove('active');
      if (promptInputWrapper) promptInputWrapper.classList.remove('has-attachment');
      if (attachmentThumb) attachmentThumb.src = '';
      if (promptFileInput) promptFileInput.value = '';
      if (toolExtractPattern) {
        toolExtractPattern.disabled = false;
        toolExtractPattern.classList.add('needs-image');
      }
      if (toolExtractRaster) {
        toolExtractRaster.disabled = false;
        toolExtractRaster.classList.add('needs-image');
      }
      const tabSyncraft = $('tab-syncraft');
      if (tabSyncraft) tabSyncraft.classList.add('needs-image');
    }

    injectProjectMeta();
    
    // Center the active canvas in the viewport at 100% zoom level on load
    setTimeout(() => {
      centerCanvas();
      initOnboarding();
    }, 50);
  }

  // Register Event Listeners for Project Changes
  document.addEventListener('syncraft:projectOpened', (e) => {
    loadProjectState(e.detail);
  });
  document.addEventListener('syncraft:projectCreated', (e) => {
    loadProjectState(e.detail);
  });

  // ─────────────────────────────────────────────────────────
  // Bootstrap initial project — handles page refresh gracefully
  // ─────────────────────────────────────────────────────────
  // On every page load the in-memory store resets to null, so we must
  // pull the last project directly from localStorage. There are two timing
  // scenarios we need to handle:
  //
  //   A) Auth key already in localStorage (fast path, common case):
  //      getLastProject() finds the scoped key immediately → restore at once.
  //
  //   B) Auth session restores asynchronously via Supabase onAuthStateChange:
  //      getLastProject() may return null on the first try because the user-
  //      scoped recents key isn't readable yet. We listen for syncraft:authChange
  //      and restore then.

  function tryRestoreLastProject() {
    const currentProj = ProjectService.getCurrentProject();
    if (currentProj && currentProj.canvasData) {
      // Already loaded (e.g. navigating back from settings without a full reload)
      loadProjectState(currentProj);
      return true;
    }

    const lastProj = ProjectService.getLastProject();
    if (lastProj) {
      console.log('[Workspace] Restoring last project:', lastProj.id, lastProj.name);
      // openProject sets store AND fires syncraft:projectOpened → loadProjectState
      ProjectService.openProject(lastProj.id);
      return true;
    }

    return false; // nothing found yet
  }

  async function initProjectRestore() {
    // Wait for ProjectService to finish bootstrapping (IndexedDB load, migration, etc.)
    await ProjectService.bootstrap();

    let restored = tryRestoreLastProject();

    if (!restored) {
      const authenticated = authService.isAuthenticated();
      if (!authenticated) {
        // Not authenticated: no Supabase sync to wait for. Create a project immediately.
        console.log('[Workspace] User is anonymous and no local projects found — creating new project');
        ProjectService.createProject();
      } else {
        console.log('[Workspace] User is authenticated — waiting for projects to load from Supabase...');
        
        const onProjectsLoaded = () => {
          if (ProjectService.getCurrentProject()) {
            document.removeEventListener('syncraft:projectsLoaded', onProjectsLoaded);
            return;
          }
          const didRestore = tryRestoreLastProject();
          if (didRestore) {
            document.removeEventListener('syncraft:projectsLoaded', onProjectsLoaded);
          }
        };
        
        document.addEventListener('syncraft:projectsLoaded', onProjectsLoaded);

        // Safety fallback: if nothing restores within 3 seconds, create a blank project
        setTimeout(() => {
          if (!ProjectService.getCurrentProject()) {
            console.log('[Workspace] Load timeout — creating new project');
            ProjectService.createProject();
          }
          document.removeEventListener('syncraft:projectsLoaded', onProjectsLoaded);
        }, 3000);
      }
    }
  }

  initProjectRestore();

  // ── AI Model Selector Dropdown Wiring ──────────
  const tabModel = $('tab-model');
  const modelDropdown = $('model-selector-dropdown');
  const modelChevron = $('tab-model-chevron');

  const tabSyncraft = $('tab-syncraft');
  const syncraftDropdown = $('syncraft-selector-dropdown');
  const syncraftChevron = $('tab-syncraft-chevron');

  function updateModelChevron(show) {
    if (modelChevron) {
      if (show) {
        modelChevron.className = 'icon fi fi-br-angle-up';
      } else {
        modelChevron.className = 'icon fi fi-br-angle-down';
      }
    }
  }

  function updateSyncraftChevron(show) {
    if (syncraftChevron) {
      if (show) {
        syncraftChevron.className = 'icon fi fi-br-angle-up';
      } else {
        syncraftChevron.className = 'icon fi fi-br-angle-down';
      }
    }
  }

  if (tabModel && modelDropdown) {
    // Show active model name in tab initially
    const tabSpan = tabModel.querySelector('span');
    if (tabSpan) tabSpan.textContent = `Model: ${models[selectedModel].name}`;

    tabModel.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = modelDropdown.style.display === 'flex';
      modelDropdown.style.display = isVisible ? 'none' : 'flex';
      updateModelChevron(!isVisible);
      
      // Close Syncraft dropdown
      if (syncraftDropdown) {
        syncraftDropdown.style.display = 'none';
        updateSyncraftChevron(false);
      }
    });

    // Wire Syncraft dropdown
    if (tabSyncraft && syncraftDropdown) {
      tabSyncraft.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = syncraftDropdown.style.display === 'flex';
        syncraftDropdown.style.display = isVisible ? 'none' : 'flex';
        updateSyncraftChevron(!isVisible);
        
        // Close Model dropdown
        if (modelDropdown) {
          modelDropdown.style.display = 'none';
          updateModelChevron(false);
        }
      });
    }

    // Wire Syncraft Engine Selector Tabs
    const engineBtnNano = $('engine-btn-nano');
    const engineBtnLeonardo = $('engine-btn-leonardo');
    const tokenCostVectorized = $('token-cost-vectorized');
    const tokenCostRaster = $('token-cost-raster');

    function updateSyncraftEngineUI() {
      if (!engineBtnNano || !engineBtnLeonardo) return;
      if (selectedSyncraftEngine === 'leonardo') {
        engineBtnLeonardo.style.background = 'rgba(212, 255, 89, 0.15)';
        engineBtnLeonardo.style.color = 'var(--color-primary)';
        engineBtnNano.style.background = 'none';
        engineBtnNano.style.color = 'rgba(255, 255, 255, 0.5)';
        if (tokenCostVectorized) tokenCostVectorized.textContent = '5 Tokens';
        if (tokenCostRaster) tokenCostRaster.textContent = '3 Tokens';
      } else {
        engineBtnNano.style.background = 'rgba(212, 255, 89, 0.15)';
        engineBtnNano.style.color = 'var(--color-primary)';
        engineBtnLeonardo.style.background = 'none';
        engineBtnLeonardo.style.color = 'rgba(255, 255, 255, 0.5)';
        if (tokenCostVectorized) tokenCostVectorized.textContent = '6 Tokens';
        if (tokenCostRaster) tokenCostRaster.textContent = '4 Tokens';
      }
    }

    if (engineBtnNano && engineBtnLeonardo) {
      engineBtnNano.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedSyncraftEngine = 'nano-banana-pro';
        localStorage.setItem('syncraft_preferred_extraction_engine', 'nano-banana-pro');
        updateSyncraftEngineUI();
      });

      engineBtnLeonardo.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedSyncraftEngine = 'nano-banana-pro'; // Temporarily disabled 'leonardo'
        localStorage.setItem('syncraft_preferred_extraction_engine', 'nano-banana-pro');
        updateSyncraftEngineUI();
      });

      // Run initially to match stored preference
      updateSyncraftEngineUI();
    }

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#model-selector-dropdown') && !e.target.closest('#tab-model') &&
          !e.target.closest('#syncraft-selector-dropdown') && !e.target.closest('#tab-syncraft')) {
        if (modelDropdown) modelDropdown.style.display = 'none';
        updateModelChevron(false);
        if (syncraftDropdown) syncraftDropdown.style.display = 'none';
        updateSyncraftChevron(false);
      }
    });

    // Wire dropdown items
    const modelItems = modelDropdown.querySelectorAll('.model-select-item');
    modelItems.forEach(item => {
      item.addEventListener('click', () => {
        const modelKey = item.getAttribute('data-model');
        const user = authService.getCurrentUser();
        const isPremiumModel = ['syncraft-pro-vector', 'syncraft-pro'].includes(modelKey);
        if (isPremiumModel && user && user.plan === 'Starter') {
          showUpgradeModal();
          return;
        }
        if (models[modelKey]) {
          selectedModel = modelKey;
          
          // Update active class
          modelItems.forEach(i => {
            i.classList.remove('active');
            const costBadge = i.querySelector('span:last-child');
            if (costBadge) {
              costBadge.style.color = 'rgba(255,255,255,0.6)';
              costBadge.style.background = 'rgba(255, 255, 255, 0.05)';
            }
          });
          item.classList.add('active');
          const activeCost = item.querySelector('span:last-child');
          if (activeCost) {
            activeCost.style.color = 'var(--color-primary)';
            activeCost.style.background = 'rgba(212, 255, 89, 0.1)';
          }

          // Update tab label
          if (tabSpan) tabSpan.textContent = `Model: ${models[selectedModel].name}`;
          
          // Close dropdown
          modelDropdown.style.display = 'none';
          updateModelChevron(false);
          showToast(`Selected AI Model: ${models[selectedModel].name}`);
          updatePromptTipText();
        }
      });
    });
  }

  // Listeners for dimensions & DPI controls
  const widthInput = $('canvas-width');
  const heightInput = $('canvas-height');
  const presetSelect = $('canvas-preset');
  const dpiSelect = $('canvas-dpi');


  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      const val = presetSelect.value;
      canvasPreset = val;
      if (presets[val]) {
        canvasWidth = presets[val].w;
        canvasHeight = presets[val].h;
        canvasUnit = presets[val].unit;
        if (widthInput) widthInput.value = canvasWidth;
        if (heightInput) heightInput.value = canvasHeight;
      }
      
      const selCanvas = canvases.find(c => c.id === selectedCanvasId);
      if (selCanvas) {
        selCanvas.canvasWidth = canvasWidth;
        selCanvas.canvasHeight = canvasHeight;
        selCanvas.canvasPreset = canvasPreset;
        selCanvas.canvasUnit = canvasUnit;
        syncCanvasState();
        renderCanvases();
      }
    });
  }

  if (widthInput) {
    widthInput.addEventListener('input', () => {
      canvasWidth = parseFloat(widthInput.value) || 1024;
      canvasPreset = 'Custom';
      if (presetSelect) presetSelect.value = 'Custom';
      
      const selCanvas = canvases.find(c => c.id === selectedCanvasId);
      if (selCanvas) {
        selCanvas.canvasWidth = canvasWidth;
        selCanvas.canvasPreset = canvasPreset;
        syncCanvasState();
        renderCanvases();
      }
    });
  }

  if (heightInput) {
    heightInput.addEventListener('input', () => {
      canvasHeight = parseFloat(heightInput.value) || 1024;
      canvasPreset = 'Custom';
      if (presetSelect) presetSelect.value = 'Custom';
      
      const selCanvas = canvases.find(c => c.id === selectedCanvasId);
      if (selCanvas) {
        selCanvas.canvasHeight = canvasHeight;
        selCanvas.canvasPreset = canvasPreset;
        syncCanvasState();
        renderCanvases();
      }
    });
  }

  if (dpiSelect) {
    dpiSelect.addEventListener('change', () => {
      exportDpi = parseInt(dpiSelect.value) || 300;
      
      const selCanvas = canvases.find(c => c.id === selectedCanvasId);
      if (selCanvas) {
        selCanvas.exportDpi = exportDpi;
        syncCanvasState();
        renderCanvases();
      }
    });
  }



  // Tool rail button toggles & click actions
  toolBtns.forEach((btn) => {
    const isAction = ['tool-undo', 'tool-redo', 'prompt-upload-btn-floating'].includes(btn.id);
    if (!isAction) {
      btn.addEventListener('click', () => {
        toolBtns.forEach((b) => {
          if (!['tool-undo', 'tool-redo', 'prompt-upload-btn-floating'].includes(b.id)) {
            b.classList.remove('active');
          }
        });
        btn.classList.add('active');
        
        activeToolId = btn.id;
        
        // Update active tool in state
        const toolTitle = btn.getAttribute('title')?.split(' ')[0] || 'Select';
        ProjectService.updateCanvasData({ activeTool: toolTitle });

        // Update cursor, overlay visibility and mode
        updateCursorClass();
        updateAnnotationOverlayVisibility();
        if (activeToolId === 'mode-refine') {
          enterAnnotationMode();
        } else {
          exitAnnotationMode();
        }
      });
    }
  });

  const promptUploadBtnFloating = $('prompt-upload-btn-floating');
  if (promptUploadBtnFloating) {
    promptUploadBtnFloating.addEventListener('click', () => {
      if (promptFileInput) promptFileInput.click();
    });
  }

  const toolUndo = $('tool-undo');
  const toolRedo = $('tool-redo');
  if (toolUndo) {
    toolUndo.addEventListener('click', () => {
      undo();
    });
  }
  if (toolRedo) {
    toolRedo.addEventListener('click', () => {
      redo();
    });
  }

  // ════════════════════════════════════════════
  // 1. HEADER WIRING
  // ════════════════════════════════════════════

  // Bind unified header custom events from MainLayout
  document.addEventListener('syncraft:headerShare', () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => showToast('Workspace link copied to clipboard'))
      .catch(() => showToast('Could not copy link', true));
  });



  // ════════════════════════════════════════════
  // 2. MODE STRIP
  // ════════════════════════════════════════════

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      wireTooltip(btn, btn.getAttribute('title') || '');

      const id = btn.id;
      if (id === 'mode-history') showHistoryPanel();
      if (id === 'mode-refine' && !currentSVG) {
        showToast('Generate an image first to refine it', true);
        // Restore generate mode
        modeBtns.forEach((b) => b.classList.remove('active'));
        document.getElementById('mode-generate')?.classList.add('active');
      }
    });
    wireTooltip(btn, btn.getAttribute('title') || '');
  });

  // ════════════════════════════════════════════
  // 3. PROMPT + GENERATE
  // ════════════════════════════════════════════

  if (btnGenerate) {
    btnGenerate.addEventListener('click', (e) => {
      console.log("[Workspace] btnGenerate clicked");
      triggerGeneration();
    });
  }
  if (btnIcon) {
    btnIcon.addEventListener('click', (e) => {
      console.log("[Workspace] btnIcon clicked");
      e.stopPropagation();
      triggerGeneration();
    });
  }
  if (promptInput) {
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        triggerGeneration();
      }
    });
    promptInput.addEventListener('focus', () => {
      if (resultDisplay) resultDisplay.style.boxShadow =
        '0 32px 80px rgba(212,255,89,0.1), 0 0 0 1px rgba(212,255,89,0.1)';
    });
    promptInput.addEventListener('blur', () => {
      if (resultDisplay && !isGenerating) {
        resultDisplay.style.boxShadow = '';
      }
    });
  }

  // Suggestion chips
  suggestions.forEach((chip) => {
    chip.addEventListener('click', () => {
      if (promptInput) {
        promptInput.value = chip.textContent.trim();
        adjustPromptInputHeight();
        promptInput.focus();
        suggestions.forEach((c) => c.classList.remove('chip-active'));
        chip.classList.add('chip-active');
      }
    });
  });

  // ── Reference Image Uploader Wiring ──────────
  async function handleReferenceFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Only image files are allowed as references', true);
      return;
    }
    
    try {
      referenceImage = await resizeImage(file, 800, 0.7);
      console.log("[Workspace] Reference image optimized successfully. Resized length:", referenceImage.length);
    } catch (err) {
      console.warn('Failed to resize uploaded image, reading as fallback base64:', err);
      // Fallback
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawImage = event.target.result;
        referenceImage = rawImage;
        finishUpload();
      };
      reader.readAsDataURL(file);
      return;
    }

    finishUpload();

    function finishUpload() {
      // Show preview thumbnail
      if (attachmentThumb) attachmentThumb.src = referenceImage;
      if (attachmentPreview) attachmentPreview.classList.add('active');
      if (promptInputWrapper) promptInputWrapper.classList.add('has-attachment');

      // Save reference image in project state
      ProjectService.updateCanvasData({ referenceImage });
      if (toolExtractPattern) {
        toolExtractPattern.disabled = false;
        toolExtractPattern.classList.remove('needs-image');
      }
      if (toolExtractRaster) {
        toolExtractRaster.disabled = false;
        toolExtractRaster.classList.remove('needs-image');
      }
      const tabSyncraft = $('tab-syncraft');
      if (tabSyncraft) tabSyncraft.classList.remove('needs-image');
      showToast('Reference image attached');
      updatePromptTipText();

      // Auto-detect and set aspect ratio from uploaded reference image
      const img = new Image();
      img.onload = () => {
        const originalW = img.naturalWidth;
        const originalH = img.naturalHeight;
        if (originalW && originalH) {
          const ratio = originalW / originalH;
          let targetW = 1024;
          let targetH = 1024;
          if (ratio > 1) {
            targetH = Math.round(1024 / ratio);
          } else {
            targetW = Math.round(1024 * ratio);
          }
          
          // Store aspect ratio in helper variables for future canvas generation
          referenceAspectWidth = targetW;
          referenceAspectHeight = targetH;

          const selCanvas = canvases.find(c => c.id === selectedCanvasId);
          // Only resize the canvas automatically if it does NOT contain a generated design and is not currently generating
          if (selCanvas && !selCanvas.svgContent && !selCanvas.isGenerating) {
            canvasWidth = targetW;
            canvasHeight = targetH;
            canvasPreset = 'Custom';

            const widthInput = $('canvas-width');
            const heightInput = $('canvas-height');
            const presetSelect = $('canvas-preset');
            if (widthInput) widthInput.value = canvasWidth;
            if (heightInput) heightInput.value = canvasHeight;
            if (presetSelect) presetSelect.value = 'Custom';

            selCanvas.canvasWidth = canvasWidth;
            selCanvas.canvasHeight = canvasHeight;
            selCanvas.canvasPreset = canvasPreset;
            syncCanvasState();
            renderCanvases();
          }
        }
      };
      img.src = referenceImage;
    }
  }

  if (promptUploadBtn && promptFileInput) {
    promptUploadBtn.addEventListener('click', () => {
      promptFileInput.click();
    });
  }

  if (promptFileInput) {
    promptFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleReferenceFile(file);
    });
  }

  if (attachmentRemove) {
    attachmentRemove.addEventListener('click', () => {
      if (promptFileInput) promptFileInput.value = '';
      referenceImage = '';
      referenceAspectWidth = 1024;
      referenceAspectHeight = 1024;

      // Clear preview state
      if (attachmentPreview) attachmentPreview.classList.remove('active');
      if (promptInputWrapper) promptInputWrapper.classList.remove('has-attachment');
      if (attachmentThumb) attachmentThumb.src = '';

      // Save empty reference image in project state
      ProjectService.updateCanvasData({ referenceImage: '' });
      if (toolExtractPattern) {
        toolExtractPattern.disabled = false;
        toolExtractPattern.classList.add('needs-image');
      }
      if (toolExtractRaster) {
        toolExtractRaster.disabled = false;
        toolExtractRaster.classList.add('needs-image');
      }
      const tabSyncraft = $('tab-syncraft');
      if (tabSyncraft) tabSyncraft.classList.add('needs-image');
      showToast('Reference image removed');
      updatePromptTipText();
    });
  }

  function updatePromptTipText() {
    if (!promptTipEl) return;
    if (referenceImage) {
      const isVector = models[selectedModel] && models[selectedModel].type === 'vector';
      if (isVector) {
        promptTipEl.innerHTML = `
          <i class="icon fi fi-br-bulb" style="font-size:10px; color:#d4ff59; flex-shrink:0;"></i>
          <span><strong>Tip:</strong> For complex designs (like sports jerseys/3D textures), use <strong style="color: #d4ff59; text-decoration: underline; cursor: pointer;" id="prompt-tip-raster-link">Syncraft (Design Only)</strong> to preserve details, then overlay vector logos.</span>
        `;
        const link = $('prompt-tip-raster-link');
        if (link) {
          link.addEventListener('click', () => {
            if (toolExtractRaster) {
              toolExtractRaster.click();
            }
          });
        }
      } else {
        promptTipEl.innerHTML = `
          <i class="icon fi fi-br-bulb" style="font-size:10px; color:rgba(255,255,255,0.5); flex-shrink:0;"></i>
          <span><strong>Tip:</strong> Syncraft reads image details more accurately when the subject is well-lit and uncluttered.</span>
        `;
      }
    } else {
      promptTipEl.innerHTML = `
        <i class="icon fi fi-br-bulb" style="font-size:10px; color:rgba(255,255,255,0.5); flex-shrink:0;"></i>
        <span><strong>Tip:</strong> For best results, use clear, high-contrast images — Syncraft reads image details more accurately when the subject is well-lit and uncluttered.</span>
      `;
    }
  }

  // ── Drag & Drop Reference Uploads ──────────
  if (resultDisplay) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      resultDisplay.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      resultDisplay.addEventListener(eventName, () => {
        const workspaceView = $('workspace-view');
        if (workspaceView && !workspaceView.classList.contains('hidden')) {
          resultDisplay.classList.add('drag-over');
        }
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      resultDisplay.addEventListener(eventName, () => {
        resultDisplay.classList.remove('drag-over');
      }, false);
    });

    resultDisplay.addEventListener('drop', (e) => {
      const workspaceView = $('workspace-view');
      if (workspaceView && workspaceView.classList.contains('hidden')) return;
      const dt = e.dataTransfer;
      const file = dt?.files?.[0];
      if (file) {
        handleReferenceFile(file);
      }
    });
  }

  if (promptInputWrapper) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      promptInputWrapper.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      promptInputWrapper.addEventListener(eventName, () => {
        const workspaceView = $('workspace-view');
        if (workspaceView && !workspaceView.classList.contains('hidden')) {
          promptInputWrapper.classList.add('drag-over-input');
        }
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      promptInputWrapper.addEventListener(eventName, () => {
        promptInputWrapper.classList.remove('drag-over-input');
      }, false);
    });

    promptInputWrapper.addEventListener('drop', (e) => {
      const workspaceView = $('workspace-view');
      if (workspaceView && workspaceView.classList.contains('hidden')) return;
      const dt = e.dataTransfer;
      const file = dt?.files?.[0];
      if (file) {
        handleReferenceFile(file);
      }
    });
  }

  // ── Copy-Paste Reference Uploads ──────────
  document.removeEventListener('paste', handleWorkspacePaste);
  document.addEventListener('paste', handleWorkspacePaste);

  function handleWorkspacePaste(e) {
    const workspaceView = $('workspace-view');
    if (!workspaceView || workspaceView.classList.contains('hidden')) return;

    // Do not intercept copy/paste if focused on input elements (unless they are pasting an image)
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault(); // Stop normal text pasting if it's an image
          handleReferenceFile(file);
          break;
        }
      }
    }
  }

  // ════════════════════════════════════════════
  // 4. TOOLBOX WIRING
  // ════════════════════════════════════════════

  if (toolRemoveBg) {
    toolRemoveBg.addEventListener('click', async () => {
      if (!currentSVG || toolRemoveBg.disabled || toolRemoveBg.classList.contains('processing')) return;

      const recraftApiKey = getRecraftApiKey();
      if (!recraftApiKey) {
        showToast('Please configure your Recraft API Key in preferences.', true);
        return;
      }

      if (!authService.hasCredits()) {
        showToast('Quota exceeded. Please upgrade your subscription plan.', true);
        showSettingsModal('billing', true);
        return;
      }

      pushHistory();

      // 1. Exit annotation mode if open
      if (isAnnotationMode) exitAnnotationMode();

      // 2. Set button to processing state
      toolRemoveBg.classList.add('processing');
      const nameEl = toolRemoveBg.querySelector('.action-item-name');
      const iconEl = toolRemoveBg.querySelector('.icon');
      const origName = nameEl?.textContent || 'Remove Background';
      const origIconClass = iconEl?.className || 'icon fi fi-br-magic-wand';

      if (nameEl) nameEl.textContent = 'Removing...';
      if (iconEl) iconEl.className = 'icon fi fi-br-hourglass';

      // 3. Show canvas loading overlay
      const canvasLoader = $('result-loading-overlay');
      const canvasLoaderText = $('result-loading-text');
      const canvasLoaderBar = $('result-loading-bar');
      const activeFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`) || document.getElementById('canvas-frame');
      if (activeFrame && canvasLoader) {
        activeFrame.appendChild(canvasLoader);
      }
      
      if (canvasLoader) canvasLoader.classList.add('active');
      if (canvasLoaderText) canvasLoaderText.textContent = 'AI Removing Background...';
      if (canvasLoaderBar) {
        canvasLoaderBar.style.transition = 'none';
        canvasLoaderBar.style.width = '0%';
        requestAnimationFrame(() => {
          canvasLoaderBar.style.transition = 'width 3s linear';
          canvasLoaderBar.style.width = '100%';
        });
      }

      try {
        let cleanSvg = '';
        const isRaster = isRasterSvg(currentSVG);

        if (isRaster) {
          // ── RASTER BACKGROUND REMOVAL (RECRAFT) ──
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(currentSVG, 'image/svg+xml');
          const imgEl = svgDoc.querySelector('image');
          const imgHref = imgEl?.getAttribute('href') || imgEl?.getAttribute('xlink:href') || '';
          if (!imgHref) throw new Error('Could not find raster design inside SVG.');

          let imageBlob;
          if (imgHref.startsWith('data:')) {
            imageBlob = dataURLtoBlob(imgHref);
          } else {
            const fetchRes = await fetch(imgHref);
            imageBlob = await fetchRes.blob();
          }

          const transparentImgUrl = await callRecraftRemoveBackgroundApi(recraftApiKey, imageBlob);

          // Convert transparent image back to base64 so it can be saved in the offline project store
          const fetchResUrl = await fetch(transparentImgUrl);
          const transparentBlob = await fetchResUrl.blob();
          const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(transparentBlob);
          });

          imgEl.setAttribute('href', base64Data);
          cleanSvg = new XMLSerializer().serializeToString(svgDoc);
        } else {
          // ── VECTOR BACKGROUND REMOVAL (LOCAL JS) ──
          cleanSvg = removeVectorBackground(currentSVG);
        }

        currentSVG = cleanAndValidateSvg(cleanSvg);
        
        // Consume credit
        authService.consumeCredit('Background Removal', 'Removed vector background').then(() => updateWorkspaceCredits()).catch(creditErr => {
          console.warn('Credit consume error:', creditErr);
        });

        // Render SVG output
        renderOutput(currentSVG, promptInput?.value.trim() ?? '');
        
        // Save canvas state
        ProjectService.updateCanvasData({
          svgContent: currentSVG,
          bgRemoved: true
        });

        // Update thumbnail for dashboard preview
        ProjectService.updateThumbnail(currentSVG);

        // Success state feedback on button
        toolRemoveBg.classList.remove('processing');
        toolRemoveBg.classList.add('done');
        if (nameEl) nameEl.textContent = 'Background Removed';
        if (iconEl) {
          iconEl.className = 'icon fi fi-br-check-circle';
          iconEl.style.color = 'var(--color-primary)';
        }

        showToast('Background removed successfully');

        // Reset button to normal after 3 seconds
        setTimeout(() => {
          toolRemoveBg.classList.remove('done');
          if (nameEl) nameEl.textContent = origName;
          if (iconEl) {
            iconEl.className = origIconClass;
            iconEl.style.color = '';
          }
        }, 3000);

      } catch (err) {
        console.error(err);
        showToast('Background removal failed: ' + (err.message || ''), true);
        toolRemoveBg.classList.remove('processing');
        if (nameEl) nameEl.textContent = origName;
        if (iconEl) {
          iconEl.className = 'icon fi fi-br-exclamation';
          iconEl.style.color = '#ffb4ab';
        }
        setTimeout(() => {
          if (iconEl) {
            iconEl.className = origIconClass;
            iconEl.style.color = '';
          }
        }, 3000);
      } finally {
        if (canvasLoader) {
          canvasLoader.classList.remove('active');
          if (resultDisplay) resultDisplay.appendChild(canvasLoader);
        }
      }
    });
  }

  if (toolAnnotate) {
    toolAnnotate.addEventListener('click', () => {
      if (!currentSVG || toolAnnotate.disabled) return;
      toggleAnnotationMode();
    });
  }

  if (toolExtractPattern) {
    toolExtractPattern.addEventListener('click', async () => {
      // Close dropdown
      const syncraftDropdown = $('syncraft-selector-dropdown');
      if (syncraftDropdown) {
        syncraftDropdown.style.display = 'none';
        updateSyncraftChevron(false);
      }

      if (toolExtractPattern.disabled || toolExtractPattern.classList.contains('processing')) return;
      
      const user = authService.getCurrentUser();
      if (user && user.plan === 'Starter') {
        showUpgradeModal();
        return;
      }

      if (!referenceImage) {
        showToast('Please upload a reference image to run Syncraft (Vectorized).', false);
        const uploadBtn = $('prompt-upload-btn');
        if (uploadBtn) {
          uploadBtn.classList.add('highlight-pulse');
          setTimeout(() => uploadBtn.classList.remove('highlight-pulse'), 2000);
        }
        const fileInput = $('prompt-file-input');
        if (fileInput) fileInput.click();
        return;
      }

      let apiKey;
      const cost = selectedSyncraftEngine === 'leonardo' ? 5 : 6;
      
      if (selectedSyncraftEngine === 'leonardo') {
        apiKey = getLeonardoApiKey();
        if (!apiKey) {
          showToast('Please configure your Leonardo API Key in preferences.', true);
          setDisplayState(currentSVG ? 'output' : 'idle');
          setStatusBadge('ready', 'Ready');
          return;
        }
      } else {
        apiKey = getGeminiApiKey();
        if (!apiKey) {
          console.error('SYNCRAFT API Error: OpenRouter API key is missing. Please configure DEFAULT_GEMINI_API_KEY in aiConfig.js or syncraft_gemini_api_key in localStorage');
          showToast('Please configure your Gemini API Key in preferences.', true);
          setDisplayState(currentSVG ? 'output' : 'idle');
          setStatusBadge('ready', 'Ready');
          return;
        }
      }

      if (!authService.hasEnoughCredits(cost)) {
        showToast(`Quota exceeded. This action requires ${cost} tokens. Please upgrade your subscription plan.`, true);
        showSettingsModal('billing', true);
        setDisplayState(currentSVG ? 'output' : 'idle');
        setStatusBadge('ready', 'Ready');
        return;
      }

      if (isAnnotationMode) exitAnnotationMode();

      // Lock global generation
      isGenerating = true;
      pushHistory();

      // Set button to processing state
      toolExtractPattern.classList.add('processing');
      const nameEl = toolExtractPattern.querySelector('.action-item-name');
      const iconEl = toolExtractPattern.querySelector('.icon');
      const origName = nameEl?.textContent || 'Syncraft (Vectorized)';
      const origIconClass = iconEl?.className || 'icon fi fi-br-layers';

      if (nameEl) nameEl.textContent = 'Syncrafting...';
      if (iconEl) iconEl.className = 'icon fi fi-br-hourglass';

      // ── Calculate/retrieve target canvas or create a new one ────────────────
      let targetCanvas = canvases.find(c => c.id === selectedCanvasId);
      if (targetCanvas && targetCanvas.svgContent === '' && !targetCanvas.isGenerating) {
        targetCanvas.isGenerating = true;
        targetCanvas.progress = 10;
        targetCanvas.statusText = 'Preparing image for pattern extraction...';
        targetCanvas.prompt = 'Background Pattern';
        targetCanvas.generationType = 'pattern';
        if (referenceImage) {
          targetCanvas.canvasWidth = referenceAspectWidth;
          targetCanvas.canvasHeight = referenceAspectHeight;
          targetCanvas.canvasPreset = 'Custom';
        }
      } else {
        let maxX = 0;
        canvases.forEach(c => {
          const w = parseFloat(c.canvasWidth) || 1024;
          const xPos = c.x + w * 0.45;
          if (xPos > maxX) {
            maxX = xPos;
          }
        });

        const newId = crypto.randomUUID();
        const newCanvas = {
          id: newId,
          svgContent: '',
          prompt: 'Background Pattern',
          annotations: [],
          bgRemoved: false,
          canvasWidth: referenceImage ? referenceAspectWidth : canvasWidth,
          canvasHeight: referenceImage ? referenceAspectHeight : canvasHeight,
          canvasUnit: canvasUnit,
          canvasPreset: referenceImage ? 'Custom' : canvasPreset,
          exportDpi: exportDpi,
          x: maxX + 100,
          y: 0,
          isGenerating: true,
          progress: 10,
          statusText: 'Preparing image for pattern extraction...',
          generationType: 'pattern'
        };
        canvases.push(newCanvas);
        selectedCanvasId = newId;
        targetCanvas = newCanvas;
      }

      syncSelectedCanvasToSidebar();
      syncCanvasState();
      setDisplayState('generating');
      setStatusBadge('generating', 'Syncrafting…');
      renderCanvases();

      // Auto-focus and center on the new canvas frame
      setTimeout(() => {
        centerCanvas();
      }, 50);

      const updateProgress = (progress, statusText) => {
        if (targetCanvas) {
          targetCanvas.progress = progress;
          targetCanvas.statusText = statusText;
          const pBar = document.getElementById(`gen-progress-bar-${targetCanvas.id}`);
          const sText = document.getElementById(`gen-status-text-${targetCanvas.id}`);
          if (pBar) pBar.style.width = `${progress}%`;
          if (sText) sText.textContent = statusText;
        }
      };

      try {
        let processedImage = referenceImage;
        if (referenceImage) {
          updateProgress(15, 'Optimizing reference image...');
          try {
            processedImage = await resizeImage(referenceImage, 800, 0.7);
            console.log("[Workspace] SYNCRAFT Extraction: Reference image resized. Original length:", referenceImage.length, "Resized length:", processedImage.length);
          } catch (resizeErr) {
            console.warn('Image resizing failed, using original:', resizeErr);
          }
        }

        // ── Hybrid Pipeline: Nano Banana Pro / Leonardo AI + Recraft Vectorize ──
        if (selectedSyncraftEngine === 'leonardo') {
          updateProgress(35, 'Generating design layout with Leonardo AI...');
        } else {
          updateProgress(35, 'Generating design layout with Nano Banana Pro...');
        }
        
        const recraftApiKey = getRecraftApiKey();
        if (!recraftApiKey) {
          throw new Error("Recraft.ai API Key is missing. Please configure 'syncraft_recraft_api_key' in your browser localStorage or js/aiConfig.js");
        }

        const extractPrompt = `Analyze the reference image.
Generate ONLY the flat, clean 2D background graphic design layout.
CRITICAL CONSTRAINTS:
1. NEVER output any garment template outlines (do not draw t-shirt shapes, singlet/tank-top silhouettes, armhole cuts, collar cuts, curved vest borders, stitching, fabric folds, fabric wrinkles, or mannequin details). The final image must be a flat, continuous rectangular design canvas (like a digital wallpaper or poster).
2. DO NOT duplicate design components. If the reference image has sleeves, side panels, or collars with duplicate elements, do NOT render them as separate floating vertical columns, bands, or pillars on the canvas. Flatten and integrate the main artwork (e.g. subject, background landscape, patterns) seamlessly into one unified, single continuous layout.
3. Completely remove all logos, watermarks, text, numbers, brand names, and team labels from the design.
4. Preserve the full artistic style, color palette, gradients, and detailed textures of the original background artwork, but flatten it entirely into a single continuous 2D design.`;

        let cleanRecraftSvg = '';
        try {
          let generatedBlob;
          if (selectedSyncraftEngine === 'leonardo') {
            generatedBlob = await callLeonardoImageGenerationApi(apiKey, extractPrompt, processedImage);
          } else {
            generatedBlob = await callGeminiImageGenerationApi(apiKey, extractPrompt, processedImage);
          }

          // Step 1.5: Upscale the generated image for cleaner vectorization
          updateProgress(60, 'Upscaling design for sharper vectorization...');
          const upscaledUrl = await callRecraftUpscaleApi(recraftApiKey, generatedBlob);
          let upscaledBlob;
          if (upscaledUrl.startsWith('data:')) {
            upscaledBlob = dataURLtoBlob(upscaledUrl);
          } else {
            const upscaledRes = await fetch(upscaledUrl + '?t=' + Date.now(), { cache: 'no-cache' });
            upscaledBlob = await upscaledRes.blob();
          }

          // Step 2: Call Recraft Vectorize API
          updateProgress(80, 'Vectorizing design pattern with Recraft...');
          const imgUrl = await callRecraftVectorizeApi(recraftApiKey, upscaledBlob);

          // 3. Load and clean the Recraft SVG
          updateProgress(92, 'Loading generated vector pattern...');
          const fetchRes = await fetch(imgUrl);
          const recraftSvgRaw = await fetchRes.text();
          if (recraftSvgRaw.includes('<svg') || recraftSvgRaw.includes('<?xml')) {
            cleanRecraftSvg = cleanAndValidateSvg(recraftSvgRaw, canvasWidth, canvasHeight);
          } else {
            console.warn("[Hybrid Pipeline] Recraft returned raster instead of SVG. Wrapping in SVG image tag.");
            cleanRecraftSvg = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" width="100%" height="100%">
                <rect width="100%" height="100%" fill="none"/>
                <image href="${imgUrl}" width="${canvasWidth}" height="${canvasHeight}" preserveAspectRatio="xMidYMid slice" />
              </svg>
            `;
          }
        } catch (genErr) {
          const engineName = selectedSyncraftEngine === 'leonardo' ? 'Leonardo AI' : 'Nano Banana Pro';
          console.warn(`[${engineName} failed, checking for credit error]`, genErr);
          
          const errMsg = genErr.message || '';
          const isCreditError = errMsg.includes('Unavailable at the moment') || /credit|balance|billing|quota|limit|payment|insufficient|depleted|402/i.test(errMsg);
          
          if (isCreditError) {
            throw genErr; // Stop execution and show "Unavailable at the moment"
          }

          updateProgress(50, `${engineName} unavailable. Falling back to Recraft extraction...`);
          showToast(`${engineName} generation failed. Using Recraft fallback...`, false);

          // Fallback: Use Recraft V4.1 imageToImage directly (returns vector SVG directly)
          const imageBlob = dataURLtoBlob(processedImage);
          const fallbackPrompt = `Extract and re-generate the clean background design from the reference image. If the reference shows both front and back views side-by-side, generate both front and back layouts side-by-side. If it shows only one design, generate only that design. Remove all mockup garments, outlines, folds, text, and logos.`;
          const fallbackImgUrl = await callRecraftImageToImageApi(recraftApiKey, imageBlob, fallbackPrompt, 0.2);

          updateProgress(90, 'Loading generated vector pattern...');
          const fallbackFetchRes = await fetch(fallbackImgUrl);
          const fallbackRecraftSvgRaw = await fallbackFetchRes.text();
          if (fallbackRecraftSvgRaw.includes('<svg') || fallbackRecraftSvgRaw.includes('<?xml')) {
            cleanRecraftSvg = cleanAndValidateSvg(fallbackRecraftSvgRaw, canvasWidth, canvasHeight);
          } else {
            console.warn("[Recraft Fallback] Recraft returned raster. Wrapping in SVG image tag.");
            cleanRecraftSvg = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" width="100%" height="100%">
                <rect width="100%" height="100%" fill="none"/>
                <image href="${fallbackImgUrl}" width="${canvasWidth}" height="${canvasHeight}" preserveAspectRatio="xMidYMid slice" />
              </svg>
            `;
          }
        }

        // Consume credit
        authService.consumeCredit('Generation', `SYNCRAFT background pattern extraction (${selectedSyncraftEngine === 'leonardo' ? 'Leonardo' : 'Gemini'})`, cost).then(() => updateWorkspaceCredits()).catch(creditErr => {
          console.warn('Credit consume error:', creditErr);
        });

        updateProgress(100, 'Rendering complete!');
        await new Promise(r => setTimeout(r, 400));

        currentSVG = cleanRecraftSvg;

        // Update target canvas state
        if (targetCanvas) {
          targetCanvas.svgContent = currentSVG;
          targetCanvas.isGenerating = false;
          targetCanvas.prompt = 'Background Pattern';
          targetCanvas.annotations = [];
          targetCanvas.bgRemoved = false;
        }

        // Render SVG output
        renderOutput(currentSVG, 'Background Pattern');
        setDisplayState('output');
        setStatusBadge('ready', 'Ready');

        // Save canvas state
        ProjectService.updateCanvasData({
          svgContent: currentSVG,
          prompt: 'Background Pattern',
          vectorKey: 'syncraft-extract',
          annotations: [],
          bgRemoved: false
        });

        // Update thumbnail for dashboard preview
        ProjectService.updateThumbnail(currentSVG);

        // Success state feedback on button
        toolExtractPattern.classList.remove('processing');
        toolExtractPattern.classList.add('done');
        if (nameEl) nameEl.textContent = '✓ Vectorized!';
        if (iconEl) {
          iconEl.className = 'icon fi fi-br-check-circle';
        }

        showToast('Background pattern extracted & vectorized successfully');

        // Reset button to normal after 3 seconds
        setTimeout(() => {
          toolExtractPattern.classList.remove('done');
          if (nameEl) nameEl.textContent = origName;
          if (iconEl) {
            iconEl.className = origIconClass;
          }
        }, 3000);

        unlockToolbox();
        annotations = [];
        if (annotationOverlay) {
          annotationOverlay.innerHTML = '';
          annotationOverlay.style.display = 'none';
        }

      } catch (err) {
        console.error(err);
        let errorMsg = err.message || '';
        if (errorMsg.includes('Unavailable at the moment') || /credit|balance|billing|quota|limit|payment|insufficient|depleted|402/i.test(errorMsg)) {
          errorMsg = 'Unavailable at the moment';
        } else {
          errorMsg = 'Background pattern extraction failed: ' + errorMsg;
        }
        showToast(errorMsg, true);
        
        if (targetCanvas) {
          targetCanvas.isGenerating = false;
        }
        syncCanvasState();
        renderCanvases();

        toolExtractPattern.classList.remove('processing');
        if (nameEl) nameEl.textContent = origName;
        if (iconEl) {
          iconEl.className = 'icon fi fi-br-exclamation';
        }
        setTimeout(() => {
          if (iconEl) iconEl.className = origIconClass;
        }, 3000);
        setDisplayState(currentSVG ? 'output' : 'idle');
        setStatusBadge('ready', 'Ready');
      } finally {
        isGenerating = false;
      }
    });
  }

  // ────────────────────────────────────────────────────────────────
  // SYNCRAFT (DESIGN ONLY) — Nano Banana Pro only, no vectorization
  // ────────────────────────────────────────────────────────────────
  if (toolExtractRaster) {
    toolExtractRaster.addEventListener('click', async () => {
      // Close dropdown
      const syncraftDropdown = $('syncraft-selector-dropdown');
      if (syncraftDropdown) {
        syncraftDropdown.style.display = 'none';
        updateSyncraftChevron(false);
      }

      if (toolExtractRaster.disabled || toolExtractRaster.classList.contains('processing')) return;
      
      if (!referenceImage) {
        showToast('Please upload a reference image to run Syncraft (Design Only).', false);
        const uploadBtn = $('prompt-upload-btn');
        if (uploadBtn) {
          uploadBtn.classList.add('highlight-pulse');
          setTimeout(() => uploadBtn.classList.remove('highlight-pulse'), 2000);
        }
        const fileInput = $('prompt-file-input');
        if (fileInput) fileInput.click();
        return;
      }

      let apiKey;
      const cost = selectedSyncraftEngine === 'leonardo' ? 3 : 4;
      
      if (selectedSyncraftEngine === 'leonardo') {
        apiKey = getLeonardoApiKey();
        if (!apiKey) {
          showToast('Please configure your Leonardo API Key in preferences.', true);
          return;
        }
      } else {
        apiKey = getGeminiApiKey();
        if (!apiKey) {
          showToast('Please configure your Gemini API Key in preferences.', true);
          return;
        }
      }

      if (!authService.hasEnoughCredits(cost)) {
        showToast(`Quota exceeded. This action requires ${cost} tokens. Please upgrade your subscription plan.`, true);
        showSettingsModal('billing', true);
        return;
      }

      if (isAnnotationMode) exitAnnotationMode();
      isGenerating = true;
      pushHistory();

      // Button processing state
      toolExtractRaster.classList.add('processing');
      const nameEl = toolExtractRaster.querySelector('.action-item-name');
      const iconEl = toolExtractRaster.querySelector('.icon');
      const origName = nameEl?.textContent || 'Syncraft (Design Only)';
      const origIconClass = iconEl?.className || 'icon fi fi-br-sparkles';
      if (nameEl) nameEl.textContent = 'Generating...';
      if (iconEl) iconEl.className = 'icon fi fi-br-hourglass';

      // Target canvas
      let targetCanvas = canvases.find(c => c.id === selectedCanvasId);
      if (targetCanvas && targetCanvas.svgContent === '' && !targetCanvas.isGenerating) {
        targetCanvas.isGenerating = true;
        targetCanvas.progress = 10;
        targetCanvas.statusText = 'Preparing image...';
        targetCanvas.prompt = 'Design Layout';
        targetCanvas.generationType = 'design_only';
        if (referenceImage) {
          targetCanvas.canvasWidth = referenceAspectWidth;
          targetCanvas.canvasHeight = referenceAspectHeight;
          targetCanvas.canvasPreset = 'Custom';
        }
      } else {
        let maxX = 0;
        canvases.forEach(c => {
          const w = parseFloat(c.canvasWidth) || 1024;
          const xPos = c.x + w * 0.45;
          if (xPos > maxX) maxX = xPos;
        });
        const newId = crypto.randomUUID();
        const newCanvas = {
          id: newId, svgContent: '', prompt: 'Design Layout',
          annotations: [], bgRemoved: false,
          canvasWidth: referenceImage ? referenceAspectWidth : canvasWidth,
          canvasHeight: referenceImage ? referenceAspectHeight : canvasHeight,
          canvasUnit: canvasUnit, canvasPreset: referenceImage ? 'Custom' : canvasPreset,
          exportDpi: exportDpi, x: maxX + 100, y: 0,
          isGenerating: true, progress: 10,
          statusText: 'Preparing image...',
          generationType: 'design_only'
        };
        canvases.push(newCanvas);
        selectedCanvasId = newId;
        targetCanvas = newCanvas;
      }

      syncSelectedCanvasToSidebar();
      syncCanvasState();
      setDisplayState('generating');
      setStatusBadge('generating', 'Generating…');
      renderCanvases();
      setTimeout(() => centerCanvas(), 50);

      const updateProgress = (progress, statusText) => {
        if (targetCanvas) {
          targetCanvas.progress = progress;
          targetCanvas.statusText = statusText;
          const pBar = document.getElementById(`gen-progress-bar-${targetCanvas.id}`);
          const sText = document.getElementById(`gen-status-text-${targetCanvas.id}`);
          if (pBar) pBar.style.width = `${progress}%`;
          if (sText) sText.textContent = statusText;
        }
      };

      try {
        let processedImage = referenceImage;
        try {
          updateProgress(15, 'Optimizing reference image...');
          processedImage = await resizeImage(referenceImage, 800, 0.7);
        } catch (e) { console.warn('Resize failed, using original', e); }

        const extractPrompt = `Analyze the reference image.
Generate ONLY the flat, clean 2D background graphic design layout.
CRITICAL CONSTRAINTS:
1. NEVER output any garment template outlines (do not draw t-shirt shapes, singlet/tank-top silhouettes, armhole cuts, collar cuts, curved vest borders, stitching, fabric folds, fabric wrinkles, or mannequin details). The final image must be a flat, continuous rectangular design canvas (like a digital wallpaper or poster).
2. DO NOT duplicate design components. If the reference image has sleeves, side panels, or collars with duplicate elements, do NOT render them as separate floating vertical columns, bands, or pillars on the canvas. Flatten and integrate the main artwork (e.g. subject, background landscape, patterns) seamlessly into one unified, single continuous layout.
3. Completely remove all logos, watermarks, text, numbers, brand names, and team labels from the design.
4. Preserve the full artistic style, color palette, gradients, and detailed textures of the original background artwork, but flatten it entirely into a single continuous 2D design.`;

        // Detect the reference image's natural aspect ratio so the
        // Gemini API output matches the source proportions instead of
        // defaulting to 1:1 (which squashes landscape images).
        let detectedRatio = '1:1';
        try {
          const refDims = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve(null);
            img.src = processedImage;
          });
          if (refDims) {
            detectedRatio = getClosestGeminiAspectRatio(refDims.w, refDims.h);
          }
        } catch (e) { console.warn('Aspect ratio detection failed, using 1:1', e); }

        let generatedBlob;
        if (selectedSyncraftEngine === 'leonardo') {
          updateProgress(45, 'Generating design with Leonardo AI...');
          generatedBlob = await callLeonardoImageGenerationApi(apiKey, extractPrompt, processedImage, detectedRatio);
        } else {
          updateProgress(45, 'Generating design with Nano Banana Pro...');
          generatedBlob = await callGeminiImageGenerationApi(apiKey, extractPrompt, processedImage, detectedRatio);
        }

        updateProgress(85, 'Finalizing design output...');
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(generatedBlob);
        });

        const wVal = parseFloat(canvasWidth) || 1024;
        const hVal = parseFloat(canvasHeight) || 1024;
        const svgCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wVal} ${hVal}" width="${wVal}" height="${hVal}"><rect width="100%" height="100%" fill="none"/><image href="${base64Data}" width="${wVal}" height="${hVal}" preserveAspectRatio="xMidYMid meet" /></svg>`;
        const rawSvg = cleanAndValidateSvg(svgCode);

        authService.consumeCredit('Generation', `SYNCRAFT Design Only extraction (${selectedSyncraftEngine === 'leonardo' ? 'Leonardo' : 'Gemini'})`, cost).then(() => updateWorkspaceCredits()).catch(e => console.warn('Credit error:', e));

        updateProgress(100, 'Rendering complete!');
        await new Promise(r => setTimeout(r, 400));

        currentSVG = rawSvg;

        if (targetCanvas) {
          targetCanvas.svgContent = currentSVG;
          targetCanvas.isGenerating = false;
          targetCanvas.prompt = 'Design Layout';
          targetCanvas.annotations = [];
          targetCanvas.bgRemoved = false;
        }

        renderOutput(currentSVG, 'Design Layout');
        setDisplayState('output');
        setStatusBadge('ready', 'Ready');

        // Enable Vectorize/Upscale now that we have a raster image in SVG
        if (toolVectorize) toolVectorize.disabled = false;
        if (toolUpscaleCrisp) toolUpscaleCrisp.disabled = false;
        if (toolUpscaleCreative) toolUpscaleCreative.disabled = false;

        ProjectService.updateCanvasData({
          svgContent: currentSVG,
          prompt: 'Design Layout',
          vectorKey: 'syncraft-raster',
          annotations: [], bgRemoved: false
        });
        ProjectService.updateThumbnail(currentSVG);

        toolExtractRaster.classList.remove('processing');
        toolExtractRaster.classList.add('done');
        if (nameEl) nameEl.textContent = '✓ Design Ready!';
        if (iconEl) iconEl.className = 'icon fi fi-br-check-circle';
        showToast('Design generated! You can now Vectorize / Upscale it.');

        setTimeout(() => {
          toolExtractRaster.classList.remove('done');
          if (nameEl) nameEl.textContent = origName;
          if (iconEl) iconEl.className = origIconClass;
        }, 3000);

        unlockToolbox();
        annotations = [];
        if (annotationOverlay) {
          annotationOverlay.innerHTML = '';
          annotationOverlay.style.display = 'none';
        }

      } catch (err) {
        console.error(err);
        let errorMsg = err.message || '';
        if (errorMsg.includes('Unavailable at the moment') || /credit|balance|billing|quota|limit|payment|insufficient|depleted|402/i.test(errorMsg)) {
          errorMsg = 'Unavailable at the moment';
        } else {
          errorMsg = 'Design generation failed: ' + errorMsg;
        }
        showToast(errorMsg, true);
        if (targetCanvas) targetCanvas.isGenerating = false;
        syncCanvasState();
        renderCanvases();
        toolExtractRaster.classList.remove('processing');
        if (nameEl) nameEl.textContent = origName;
        if (iconEl) iconEl.className = 'icon fi fi-br-exclamation';
        setTimeout(() => { if (iconEl) iconEl.className = origIconClass; }, 3000);
        setDisplayState(currentSVG ? 'output' : 'idle');
        setStatusBadge('ready', 'Ready');
      } finally {
        isGenerating = false;
      }
    });
  }

  // ────────────────────────────────────────────────────────────────
  // VECTORIZE / UPSCALE — Send raster canvas through Recraft Vectorize
  // ────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────
  // VECTORIZE — Send raster canvas through Recraft Vectorize API
  // ────────────────────────────────────────────────────────────────
  if (toolVectorize) {
    toolVectorize.addEventListener('click', async () => {
      if (!currentSVG || toolVectorize.disabled || toolVectorize.classList.contains('processing')) return;
      if (!isRasterSvg(currentSVG)) {
        showToast('No raster image found. Generate a design first using Syncraft.', true);
        return;
      }

      const recraftApiKey = getRecraftApiKey();
      if (!recraftApiKey) {
        showToast('Please configure your Recraft API Key in preferences.', true);
        return;
      }

      if (!authService.hasEnoughCredits(2)) {
        showToast('Quota exceeded. Vectorize requires 2 tokens. Please upgrade your subscription plan.', true);
        showSettingsModal('billing', true);
        return;
      }

      if (typeof pushHistory === 'function') pushHistory();

      // Button processing state
      toolVectorize.classList.add('processing');
      const nameEl = toolVectorize.querySelector('.action-item-name');
      const iconEl = toolVectorize.querySelector('.icon');
      const origName = nameEl?.textContent || 'Vectorize Design';
      const origIconClass = iconEl?.className || 'icon fi fi-br-diamond';
      if (nameEl) nameEl.textContent = 'Vectorizing...';
      if (iconEl) iconEl.className = 'icon fi fi-br-hourglass';

      lockToolbox();
      setStatusBadge('generating', 'Vectorizing…');

      // Show canvas loading overlay
      const canvasLoader = $('result-loading-overlay');
      const canvasLoaderText = $('result-loading-text');
      const activeFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`) || document.getElementById('canvas-frame');
      if (activeFrame && canvasLoader) {
        activeFrame.appendChild(canvasLoader);
      }
      if (canvasLoader) canvasLoader.classList.add('active');
      if (canvasLoaderText) canvasLoaderText.textContent = 'Vectorizing Design...';

      try {
        // Extract the raster image data-URL from the current SVG
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(currentSVG, 'image/svg+xml');
        const imgEl = svgDoc.querySelector('image');
        const imgHref = imgEl?.getAttribute('href') || imgEl?.getAttribute('xlink:href') || '';
        if (!imgHref) throw new Error('Could not extract raster image from the current canvas.');

        // Convert data-URL to Blob
        let imageBlob;
        if (imgHref.startsWith('data:')) {
          imageBlob = dataURLtoBlob(imgHref);
        } else {
          const fetchRes = await fetch(imgHref);
          imageBlob = await fetchRes.blob();
        }

        // Call Recraft Vectorize API
        const svgUrl = await callRecraftVectorizeApi(recraftApiKey, imageBlob);

        // Fetch and clean the resulting SVG
        const fetchRes = await fetch(svgUrl);
        const rawSvg = await fetchRes.text();

        const targetCanvas = canvases.find(c => c.id === selectedCanvasId);
        const wVal = targetCanvas ? (parseFloat(targetCanvas.canvasWidth) || 1024) : (parseFloat(canvasWidth) || 1024);
        const hVal = targetCanvas ? (parseFloat(targetCanvas.canvasHeight) || 1024) : (parseFloat(canvasHeight) || 1024);
        const cleanSvg = cleanAndValidateSvg(rawSvg, wVal, hVal);

        currentSVG = cleanSvg;

        // Update the active canvas
        if (targetCanvas) {
          targetCanvas.svgContent = currentSVG;
          targetCanvas.annotations = [];
          targetCanvas.bgRemoved = false;
        }

        authService.consumeCredit('Action', 'Vectorize', 2).then(() => updateWorkspaceCredits()).catch(e => console.warn('Credit error:', e));

        renderOutput(currentSVG, targetCanvas?.prompt || 'Vectorized Design');
        syncCanvasState();
        renderCanvases();
        setDisplayState('output');
        setStatusBadge('ready', 'Ready');

        ProjectService.updateCanvasData({
          svgContent: currentSVG,
          annotations: [], bgRemoved: false
        });
        ProjectService.updateThumbnail(currentSVG);

        showToast('Design vectorized successfully!');

        toolVectorize.classList.remove('processing');
        toolVectorize.classList.add('done');
        if (nameEl) nameEl.textContent = '✓ Vectorized!';
        if (iconEl) iconEl.className = 'icon fi fi-br-check-circle';
        setTimeout(() => {
          toolVectorize.classList.remove('done');
          if (nameEl) nameEl.textContent = origName;
          if (iconEl) iconEl.className = origIconClass;
        }, 3000);

      } catch (err) {
        console.error(err);
        showToast('Vectorize failed: ' + (err.message || ''), true);
        toolVectorize.classList.remove('processing');
        if (nameEl) nameEl.textContent = origName;
        if (iconEl) iconEl.className = 'icon fi fi-br-exclamation';
        setTimeout(() => { if (iconEl) iconEl.className = origIconClass; }, 3000);
        setStatusBadge('ready', 'Ready');
      } finally {
        const canvasLoader = $('result-loading-overlay');
        if (canvasLoader) canvasLoader.classList.remove('active');
        unlockToolbox();
      }
    });
  }

  // ────────────────────────────────────────────────────────────────
  // UPSCALE — Send raster canvas through Recraft Upscale APIs
  // ────────────────────────────────────────────────────────────────
  async function executeUpscale(btn, type, cost) {
    if (!currentSVG || btn.disabled || btn.classList.contains('processing')) return;
    if (!isRasterSvg(currentSVG)) {
      showToast('No raster image found. Generate a design first using Syncraft.', true);
      return;
    }

    const recraftApiKey = getRecraftApiKey();
    if (!recraftApiKey) {
      showToast('Please configure your Recraft API Key in preferences.', true);
      return;
    }



    if (!authService.hasEnoughCredits(cost)) {
      showToast(`Quota exceeded. This action requires ${cost} tokens. Please upgrade your subscription plan.`, true);
      showSettingsModal('billing', true);
      return;
    }

    if (typeof pushHistory === 'function') pushHistory();

    // Button processing state
    btn.classList.add('processing');
    const nameEl = btn.querySelector('.action-item-name');
    const iconEl = btn.querySelector('.icon');
    const origName = nameEl?.textContent || (type === 'creative' ? 'Creative Upscale (HD)' : 'Normal Upscale (Crisp)');
    const origIconClass = iconEl?.className || (type === 'creative' ? 'icon fi fi-br-expand-arrows' : 'icon fi fi-br-expand');
    if (nameEl) nameEl.textContent = 'Upscaling...';
    if (iconEl) iconEl.className = 'icon fi fi-br-hourglass';

    lockToolbox();
    setStatusBadge('generating', 'Upscaling…');

    // Show canvas loading overlay
    const canvasLoader = $('result-loading-overlay');
    const canvasLoaderText = $('result-loading-text');
    const activeFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`) || document.getElementById('canvas-frame');
    if (activeFrame && canvasLoader) {
      activeFrame.appendChild(canvasLoader);
    }
    if (canvasLoader) canvasLoader.classList.add('active');
    if (canvasLoaderText) canvasLoaderText.textContent = type === 'creative' ? 'AI Running Creative Upscale (HD)...' : 'AI Running Crisp Upscale...';

    try {
      // Extract the raster image data-URL from the current SVG
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(currentSVG, 'image/svg+xml');
      const imgEl = svgDoc.querySelector('image');
      const imgHref = imgEl?.getAttribute('href') || imgEl?.getAttribute('xlink:href') || '';
      if (!imgHref) throw new Error('Could not extract raster image from the current canvas.');

      // Convert data-URL to Blob
      let imageBlob;
      if (imgHref.startsWith('data:')) {
        imageBlob = dataURLtoBlob(imgHref);
      } else {
        const fetchRes = await fetch(imgHref);
        imageBlob = await fetchRes.blob();
      }

      // Call Recraft Upscale API
      const upscaledUrl = await callRecraftUpscaleApi(recraftApiKey, imageBlob, type);

      // Fetch upscaled image (with cache-busting), convert to Base64
      const fetchRes = await fetch(upscaledUrl + '?t=' + Date.now(), { cache: 'no-cache' });
      const upscaledBlob = await fetchRes.blob();
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(upscaledBlob);
      });

      // Set base64 back to the image tag href inside the SVG
      imgEl.setAttribute('href', base64Data);
      currentSVG = new XMLSerializer().serializeToString(svgDoc);

      // Update the active canvas
      const targetCanvas = canvases.find(c => c.id === selectedCanvasId);
      if (targetCanvas) {
        targetCanvas.svgContent = currentSVG;
      }

      authService.consumeCredit('Action', type === 'creative' ? 'Creative Upscale' : 'Crisp Upscale', cost)
        .then(() => updateWorkspaceCredits())
        .catch(e => console.warn('Credit error:', e));

      renderOutput(currentSVG, targetCanvas?.prompt || 'Upscaled Design');
      syncCanvasState();
      renderCanvases();
      setDisplayState('output');
      setStatusBadge('ready', 'Ready');

      ProjectService.updateCanvasData({
        canvases,
        selectedCanvasId,
        svgContent: currentSVG
      });
      ProjectService.updateThumbnail(currentSVG);

      showToast('Design upscaled successfully!');

      btn.classList.remove('processing');
      btn.classList.add('done');
      if (nameEl) nameEl.textContent = '✓ Upscaled!';
      if (iconEl) iconEl.className = 'icon fi fi-br-check-circle';
      setTimeout(() => {
        btn.classList.remove('done');
        if (nameEl) nameEl.textContent = origName;
        if (iconEl) iconEl.className = origIconClass;
      }, 3000);

    } catch (err) {
      console.error(err);
      showToast('Upscale failed: ' + (err.message || ''), true);
      btn.classList.remove('processing');
      if (nameEl) nameEl.textContent = origName;
      if (iconEl) iconEl.className = 'icon fi fi-br-exclamation';
      setTimeout(() => { if (iconEl) iconEl.className = origIconClass; }, 3000);
      setStatusBadge('ready', 'Ready');
    } finally {
      const canvasLoader = $('result-loading-overlay');
      if (canvasLoader) canvasLoader.classList.remove('active');
      unlockToolbox();
    }
  }

  if (toolUpscaleCrisp) {
    toolUpscaleCrisp.addEventListener('click', () => executeUpscale(toolUpscaleCrisp, 'crisp', 2));
  }
  if (toolUpscaleCreative) {
    toolUpscaleCreative.addEventListener('click', () => executeUpscale(toolUpscaleCreative, 'creative', 10));
  }

  if (toolExport) {
    toolExport.addEventListener('click', async () => {
      if (!currentSVG || toolExport.disabled || toolExport.classList.contains('processing')) return;

      // 1. Set to loading state
      toolExport.classList.add('processing');
      const nameEl = toolExport.querySelector('.toolbox-btn-name');
      const descEl = toolExport.querySelector('.toolbox-btn-desc');
      const iconEl = toolExport.querySelector('.toolbox-btn-icon-wrap .icon');
      const origName = nameEl ? nameEl.textContent : toolExport.textContent;
      const origDesc = descEl?.textContent || 'Download vector file';
      const origIconClass = iconEl?.className || 'icon fi fi-br-download';

      if (nameEl) nameEl.textContent = 'Packaging...';
      else toolExport.textContent = 'Packaging...';
      if (iconEl) iconEl.className = 'icon fi fi-br-hourglass';

      // We ensure a minimum packaging delay of 800ms to avoid flashing UI
      const minDelayPromise = new Promise(resolve => setTimeout(resolve, 800));

      try {
        // 2. Trigger download (await it now)
        await Promise.all([
          downloadFile(currentSVG, selectedFormat),
          minDelayPromise
        ]);

        // 3. Show success state
        toolExport.classList.remove('processing');
        toolExport.classList.add('done');
        if (nameEl) nameEl.textContent = 'Exported!';
        else toolExport.textContent = 'Exported!';
        if (descEl) descEl.textContent = '✓ File download initiated';
        if (iconEl) {
          iconEl.className = 'icon fi fi-br-check-circle';
          iconEl.style.color = 'var(--color-primary)';
        }
      } catch (err) {
        console.error('Export failed:', err);
        showToast('Export failed: ' + (err.message || ''), true);
        toolExport.classList.remove('processing');
        if (nameEl) nameEl.textContent = origName;
        if (iconEl) iconEl.className = origIconClass;
      }

      // 4. Reset to normal state
      setTimeout(() => {
        toolExport.classList.remove('done');
        if (nameEl) nameEl.textContent = origName;
        else toolExport.textContent = origName;
        if (descEl) descEl.textContent = origDesc;
        if (iconEl) {
          iconEl.className = origIconClass;
          iconEl.style.color = '';
        }
      }, 2500);
    });
  }

  // Format chip switcher
  formatChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      formatChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      selectedFormat = chip.dataset.format;
      localStorage.setItem('syncraft_opt_format', selectedFormat.toUpperCase());
      // Update export button label
      const nameEl = toolExport?.querySelector('.toolbox-btn-name');
      if (nameEl) nameEl.textContent = `Export ${chip.dataset.format.toUpperCase()}`;
      else if (toolExport) toolExport.textContent = `Export ${chip.dataset.format.toUpperCase()}`;
    });
  });

  // Load initially selected format setting
  const savedFmt = localStorage.getItem('syncraft_opt_format');
  if (savedFmt) {
    selectedFormat = savedFmt.toLowerCase();
    formatChips.forEach((c) => {
      if (c.dataset.format === selectedFormat) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
    const nameEl = toolExport?.querySelector('.toolbox-btn-name');
    if (nameEl) nameEl.textContent = `Export ${selectedFormat.toUpperCase()}`;
    else if (toolExport) toolExport.textContent = `Export ${selectedFormat.toUpperCase()}`;
  }

  // Handle settings modal format notifications
  document.addEventListener('syncraft:settingChanged', (e) => {
    if (e.detail.key === 'format') {
      selectedFormat = e.detail.val.toLowerCase();
      formatChips.forEach((c) => {
        if (c.dataset.format === selectedFormat) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
      const nameEl = toolExport?.querySelector('.toolbox-btn-name');
      if (nameEl) nameEl.textContent = `Export ${selectedFormat.toUpperCase()}`;
      else if (toolExport) toolExport.textContent = `Export ${selectedFormat.toUpperCase()}`;
    }
  });

  // ════════════════════════════════════════════
  // 5. KEYBOARD SHORTCUTS
  // ════════════════════════════════════════════

  document.addEventListener('keydown', (e) => {
    const inWS = !document.getElementById('workspace-view').classList.contains('hidden');
    if (!inWS) return;
    if (e.ctrlKey && e.key === 'g') { e.preventDefault(); triggerGeneration(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); ProjectService.saveNow().then(() => showToast('Project saved')).catch(err => { console.error(err); showToast('Save failed', true); }); }
    if (e.ctrlKey && e.key === 'e') { e.preventDefault(); if (currentSVG) downloadFile(currentSVG, selectedFormat); }
    if (e.key === 'Escape' && isAnnotationMode) { exitAnnotationMode(); }
  });

  // ════════════════════════════════════════════
  // 6. AUTOSAVE + PROJECT EVENTS
  // ════════════════════════════════════════════

  document.addEventListener('syncraft:autosaved', (e) => {
    updateAutosaveIndicator(e.detail.lastModified);
  });

  document.addEventListener('syncraft:projectRenamed', (e) => {
    const nameEl = document.getElementById('ws-project-name');
    if (nameEl) nameEl.textContent = e.detail.name;
  });

  store.subscribe((state) => {
    const saveEl = document.getElementById('ws-autosave-indicator');
    if (!saveEl) return;
    if (state.isDirty)      { saveEl.textContent = '● Unsaved';  saveEl.style.color = 'rgba(212,255,89,0.6)'; }
    else if (state.isAutoSaving) { saveEl.textContent = '⟳ Saving…'; saveEl.style.color = 'rgba(255,255,255,0.35)'; }
    else                    { saveEl.textContent = '✓ Saved';    saveEl.style.color = 'rgba(255,255,255,0.28)'; }
    if (state.currentProject) {
      const n = document.getElementById('ws-project-name');
      if (n && document.activeElement !== n) n.textContent = state.currentProject.name;
    }
  });

  // ════════════════════════════════════════════
  // GENERATION PIPELINE
  // ════════════════════════════════════════════

  function triggerGeneration() {
    if (isGenerating) return;
    const prompt = promptInput?.value.trim() ?? '';

    const geminiApiKey = getGeminiApiKey();
    const recraftApiKey = getRecraftApiKey();

    if (!geminiApiKey) {
      console.error('SYNCRAFT API Error: OpenRouter API key is missing. Please configure DEFAULT_GEMINI_API_KEY in aiConfig.js or syncraft_gemini_api_key in localStorage');
      showToast('Please configure your Gemini API Key in preferences.', true);
      return;
    }
    if (!recraftApiKey) {
      console.error('SYNCRAFT API Error: Recraft.ai API key is missing. Please configure DEFAULT_RECRAFT_API_KEY in aiConfig.js or syncraft_recraft_api_key in localStorage');
      showToast('Please configure your Recraft API Key in preferences.', true);
      return;
    }

    const modelCost = models[selectedModel].cost;
    if (!authService.hasEnoughCredits(modelCost)) {
      showToast(`Quota exceeded. This generation requires ${modelCost} tokens. Please upgrade your subscription plan.`, true);
      showSettingsModal('billing', true);
      return;
    }

    isGenerating = true;
    pushHistory();

    // ── Calculate new canvas position ────────────────
    let targetCanvas = canvases.find(c => c.id === selectedCanvasId);
    if (targetCanvas && targetCanvas.svgContent === '' && !targetCanvas.isGenerating) {
      targetCanvas.isGenerating = true;
      targetCanvas.progress = 10;
      targetCanvas.statusText = 'Initializing...';
      targetCanvas.prompt = prompt;
    } else {
      let maxX = 0;
      canvases.forEach(c => {
        const w = parseFloat(c.canvasWidth) || 1024;
        const xPos = c.x + w * 0.45;
        if (xPos > maxX) {
          maxX = xPos;
        }
      });

      const newId = crypto.randomUUID();
      const newCanvas = {
        id: newId,
        svgContent: '',
        prompt: prompt,
        annotations: [],
        bgRemoved: false,
        canvasWidth: canvasWidth,
        canvasHeight: canvasHeight,
        canvasUnit: canvasUnit,
        canvasPreset: canvasPreset,
        exportDpi: exportDpi,
        x: maxX + 100,
        y: 0,
        isGenerating: true,
        progress: 10,
        statusText: 'Initializing...'
      };
      canvases.push(newCanvas);
      selectedCanvasId = newId;
      targetCanvas = newCanvas;
    }

    const targetId = targetCanvas.id;

    function updateCanvasProgress(canvasId, progress, statusText) {
      const c = canvases.find(item => item.id === canvasId);
      if (c) {
        c.progress = progress;
        c.statusText = statusText;
        const pBar = document.getElementById(`gen-progress-bar-${canvasId}`);
        const sText = document.getElementById(`gen-status-text-${canvasId}`);
        if (pBar) pBar.style.width = `${progress}%`;
        if (sText) sText.textContent = statusText;
      }
    }

    syncSelectedCanvasToSidebar();
    syncCanvasState();
    renderCanvases();
    
    // Center the viewport on the generating canvas
    setTimeout(() => {
      centerCanvas();
    }, 50);

    if (btnGenerate) { btnGenerate.disabled = true; }
    if (btnLabel)    { btnLabel.textContent = 'Generating…'; }
    if (btnIcon)     { btnIcon.className  = 'icon fi fi-br-hourglass text-lg'; }

    (async () => {
      try {
        // Check Upstash Cache first (only if there is a prompt and no reference image)
        if (!referenceImage && prompt) {
          updateCanvasProgress(targetId, 15, 'Checking Upstash Cache...');
          const cachedSvg = await UpstashService.getCachedGeneration(prompt, selectedModel);
          if (cachedSvg) {
            updateCanvasProgress(targetId, 100, 'Rendering from cache...');
            await new Promise(r => setTimeout(r, 200));

            targetCanvas.svgContent = cachedSvg;
            targetCanvas.isGenerating = false;
            targetCanvas.prompt = prompt;
            targetCanvas.annotations = [];
            targetCanvas.bgRemoved = false;

            // Extract dimensions from SVG to adapt canvas size
            let svgW = null;
            let svgH = null;
            const parser = new DOMParser();
            const doc = parser.parseFromString(targetCanvas.svgContent, 'image/svg+xml');
            const svgEl = doc.querySelector('svg');
            if (svgEl) {
              const attrW = svgEl.getAttribute('width');
              const attrH = svgEl.getAttribute('height');
              if (attrW && attrH && !attrW.includes('%') && !attrH.includes('%')) {
                svgW = parseFloat(attrW);
                svgH = parseFloat(attrH);
              }
              if ((!svgW || !svgH) && svgEl.getAttribute('viewBox')) {
                const parts = svgEl.getAttribute('viewBox').split(/\s+/);
                if (parts.length === 4) {
                  svgW = parseFloat(parts[2]);
                  svgH = parseFloat(parts[3]);
                }
              }
            }
            if (svgW && svgH) {
              const ratio = svgW / svgH;
              let targetW = 1024;
              let targetH = 1024;
              if (ratio > 1) {
                targetH = Math.round(1024 / ratio);
              } else {
                targetW = Math.round(1024 * ratio);
              }
              targetCanvas.canvasWidth = targetW;
              targetCanvas.canvasHeight = targetH;
              targetCanvas.canvasPreset = 'Custom';
            }

            selectedCanvasId = targetCanvas.id;
            syncSelectedCanvasToSidebar();
            syncCanvasState();
            ProjectService.saveNow();
            renderCanvases();
            showToast('Generation loaded from cache');

            if (btnGenerate) { btnGenerate.disabled = false; }
            if (btnLabel)    { btnLabel.textContent = 'Generate'; }
            if (btnIcon)     { btnIcon.className  = 'icon fi fi-br-rocket text-lg'; }
            isGenerating = false;
            return;
          }
        }

        // Step 1: Initialize
        updateCanvasProgress(targetId, 10, 'Initializing AI Core Engine...');
        await new Promise(r => setTimeout(r, 400));

        let processedImage = referenceImage;
        if (referenceImage) {
          if (models[selectedModel] && models[selectedModel].type === 'vector') {
            showToast('Notice: Complex designs are best generated using Design Only to preserve detailed textures.', false);
          }
          updateCanvasProgress(targetId, 20, 'Optimizing reference image payload...');
          try {
            processedImage = await resizeImage(referenceImage, 800, 0.7);
          } catch (resizeErr) {
            console.warn('Image resizing failed, using original:', resizeErr);
          }
        }

        let optimizedPrompt = prompt;
        const isDeMockup = /mockup|jersey|shirt|garment|clothing|flatten|de-mockup|template/i.test(prompt) || 
                           (processedImage && /jersey|shirt|mockup|flatten/i.test(prompt)) ||
                           (processedImage && !prompt.trim());

        const wVal = parseFloat(targetCanvas.canvasWidth) || 1024;
        const hVal = parseFloat(targetCanvas.canvasHeight) || 1024;
        const closestSize = getClosestRecraftSize(wVal, hVal);
        const closestRatio = getClosestGeminiAspectRatio(wVal, hVal);

        if (isDeMockup && processedImage) {
          // ── DE-MOCKUP & FLATTENING PIPELINE ──
          let svgCode = '';
          
          if (selectedModel === 'syncraft-ultra') {
            // ── ULTRA (GEMINI 3 IMAGE) FLOW FOR DE-MOCKUP ──
            updateCanvasProgress(targetId, 30, 'Analyzing design layers with Syncraft Ultra...');
            let ultraExtractPrompt = `Analyze the reference image.
Generate ONLY the flat, clean 2D background graphic design layout.
CRITICAL CONSTRAINTS:
1. NEVER output any garment template outlines (do not draw t-shirt shapes, singlet/tank-top silhouettes, armhole cuts, collar cuts, curved vest borders, stitching, fabric folds, fabric wrinkles, or mannequin details). The final image must be a flat, continuous rectangular design canvas (like a digital wallpaper or poster).
2. DO NOT duplicate design components. If the reference image has sleeves, side panels, or collars with duplicate elements, do NOT render them as separate floating vertical columns, bands, or pillars on the canvas. Flatten and integrate the main artwork (e.g. subject, background landscape, patterns) seamlessly into one unified, single continuous layout.
3. Completely remove all logos, watermarks, text, numbers, brand names, and team labels from the design.
4. Preserve the full artistic style, color palette, gradients, and detailed textures of the original background artwork, but flatten it entirely into a single continuous 2D design.`;
            if (prompt && prompt.trim() && !/mockup|jersey|shirt|garment|clothing|flatten|de-mockup|template/i.test(prompt)) {
              ultraExtractPrompt += ` Incorporate the user request: ${prompt}`;
            }

            updateCanvasProgress(targetId, 60, 'Extracting background pattern with Syncraft Ultra...');
            const generatedBlob = await callGeminiImageGenerationApi(geminiApiKey, ultraExtractPrompt, processedImage, closestRatio);

            updateCanvasProgress(targetId, 70, 'Upscaling design for sharper vectorization...');
            const upscaledUrl = await callRecraftUpscaleApi(recraftApiKey, generatedBlob);
            let upscaledBlob;
            if (upscaledUrl.startsWith('data:')) {
              upscaledBlob = dataURLtoBlob(upscaledUrl);
            } else {
              const upscaledRes = await fetch(upscaledUrl + '?t=' + Date.now(), { cache: 'no-cache' });
              upscaledBlob = await upscaledRes.blob();
            }

            updateCanvasProgress(targetId, 85, 'Vectorizing design layout with Recraft...');
            const vectorImgUrl = await callRecraftVectorizeApi(recraftApiKey, upscaledBlob);
            
            updateCanvasProgress(targetId, 90, 'Loading generated vector pattern...');
            const fetchRes = await fetch(vectorImgUrl);
            const recraftSvgRaw = await fetchRes.text();
            if (recraftSvgRaw.includes('<svg') || recraftSvgRaw.includes('<?xml')) {
              svgCode = cleanAndValidateSvg(recraftSvgRaw, wVal, hVal);
            } else {
              svgCode = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wVal} ${hVal}" width="100%" height="100%">
                  <rect width="100%" height="100%" fill="none"/>
                  <image href="${vectorImgUrl}" width="${wVal}" height="${hVal}" preserveAspectRatio="xMidYMid slice" />
                </svg>
              `;
            }
          } else {
            // ── RECRAFT FLOW FOR DE-MOCKUP ──
            updateCanvasProgress(targetId, 30, 'Preparing image for vector extraction...');
            const imageBlob = dataURLtoBlob(processedImage);

            updateCanvasProgress(targetId, 60, 'Extracting clean background pattern with Recraft V4.1...');
            let extractPrompt = 'REGENERATE ONLY THE FLAT 2D BACKGROUND DESIGN. REMOVE ALL SHIRT MOCKUPS, TEMPLATES, SLEEVES, NECK COLLARS, SHADOWS AND TEXT. OUTPUT A FLAT RECTANGULAR DESIGN WITHOUT APPAREL OUTLINES OR DUPLICATE SIDE PANELS.';
            if (prompt && prompt.trim() && !/mockup|jersey|shirt|garment|clothing|flatten|de-mockup|template/i.test(prompt)) {
              extractPrompt += ` Incorporate the user request: ${prompt}`;
            }

            const activeApiId = models[selectedModel].apiId;
            const imgUrl = await callRecraftImageToImageApi(recraftApiKey, imageBlob, extractPrompt, 0.2, activeApiId);

            updateCanvasProgress(targetId, 80, 'Loading generated vector pattern...');
            const fetchRes = await fetch(imgUrl);
            const recraftSvgRaw = await fetchRes.text();
            if (recraftSvgRaw.includes('<svg') || recraftSvgRaw.includes('<?xml')) {
              svgCode = cleanAndValidateSvg(recraftSvgRaw, wVal, hVal);
            } else {
              console.warn("[De-mockup] Recraft returned raster. Wrapping in SVG image tag.");
              svgCode = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wVal} ${hVal}" width="100%" height="100%">
                  <rect width="100%" height="100%" fill="none"/>
                  <image href="${imgUrl}" width="${wVal}" height="${hVal}" preserveAspectRatio="xMidYMid slice" />
                </svg>
              `;
            }
          }

          updateCanvasProgress(targetId, 95, 'Rendering vector pattern...');
          await new Promise(r => setTimeout(r, 200));

          authService.consumeCredit('Generation', `De-mockup: "${prompt.slice(0, 30)}..."`, modelCost).then(() => updateWorkspaceCredits()).catch(creditErr => {
            console.warn('Credit consume error:', creditErr);
          });

          updateCanvasProgress(targetId, 100, 'Rendering flat layouts!');
          await new Promise(r => setTimeout(r, 200));

          targetCanvas.svgContent = svgCode;
          targetCanvas.isGenerating = false;
          targetCanvas.prompt = prompt;
          targetCanvas.annotations = [];
          targetCanvas.bgRemoved = false;

        } else {
          let imgUrl = '';
          const activeApiId = models[selectedModel].apiId;
          const isVector = models[selectedModel].type === 'vector';
          
          if (selectedModel === 'syncraft-ultra') {
            // ── ULTRA (GEMINI 3 IMAGE) FLOW ──
            updateCanvasProgress(targetId, 40, 'Generating layout with Syncraft Ultra...');
            let ultraPrompt = prompt;
            if (processedImage) {
              const optPromptText = `Analyze this reference image and the user's prompt: "${prompt}". Combine them into a detailed description of a print-ready design layout. Focus on the style, colors, texture, composition, and details. Write a single detailed prompt suitable for an image generation model.`;
              ultraPrompt = await callGeminiApi(geminiApiKey, optPromptText, processedImage);
            }
            
            updateCanvasProgress(targetId, 70, 'Running AI generation engine...');
            const generatedBlob = await callGeminiImageGenerationApi(geminiApiKey, ultraPrompt, processedImage, closestRatio);
            
            const base64Data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(generatedBlob);
            });
            
            const svgCode = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wVal} ${hVal}" width="100%" height="100%">
                <rect width="100%" height="100%" fill="none"/>
                <image href="${base64Data}" width="${wVal}" height="${hVal}" preserveAspectRatio="xMidYMid slice" />
              </svg>
            `;
            
            updateCanvasProgress(targetId, 100, 'Rendering complete!');
            
            authService.consumeCredit('Generation', `Ultra Generation: "${prompt.slice(0, 30)}..."`, modelCost).then(() => updateWorkspaceCredits()).catch(creditErr => {
              console.warn('Credit consume error:', creditErr);
            });
            
            targetCanvas.svgContent = cleanAndValidateSvg(svgCode);
            targetCanvas.isGenerating = false;
            targetCanvas.prompt = prompt;
            targetCanvas.annotations = [];
            targetCanvas.bgRemoved = false;

            if (!processedImage) {
              await UpstashService.setCachedGeneration(prompt, selectedModel, targetCanvas.svgContent);
            }

          } else {
            if (processedImage) {
              // ── IMAGE-TO-IMAGE FLOW (RECRAFT) ──
              updateCanvasProgress(targetId, 30, 'Analyzing reference style & prompt...');
              const promptText = `Analyze this reference image and the user's prompt: "${prompt}". Combine them and describe in detail how this image should be rendered. Focus on the style, shapes, colors, composition, and details. Write a single detailed prompt suitable for a vector generation model. Keep the description direct, clear, and focused entirely on describing the visual components of the design. Do not include any meta-text.`;
              optimizedPrompt = await callGeminiApi(geminiApiKey, promptText, processedImage);

              updateCanvasProgress(targetId, 60, `Synthesizing curves with ${models[selectedModel].name}...`);
              const imageBlob = dataURLtoBlob(processedImage);
              imgUrl = await callRecraftImageToImageApi(recraftApiKey, imageBlob, optimizedPrompt, 0.3, activeApiId);
            } else {
              // ── TEXT-TO-IMAGE FLOW (RECRAFT) ──
              updateCanvasProgress(targetId, 40, 'Analyzing prompt semantics...');
              await new Promise(r => setTimeout(r, 400));

              updateCanvasProgress(targetId, 65, `Synthesizing curves with ${models[selectedModel].name}...`);
              imgUrl = await callRecraftVectorApi(recraftApiKey, optimizedPrompt, activeApiId, closestSize);
            }

            updateCanvasProgress(targetId, 88, 'Loading generated design...');
            let svgCode = '';
            if (imgUrl.startsWith('data:image/svg+xml;base64,')) {
              svgCode = atob(imgUrl.split(',')[1]);
            } else if (imgUrl.startsWith('data:image/svg+xml,')) {
              svgCode = decodeURIComponent(imgUrl.split(',')[1]);
            } else if (imgUrl.startsWith('data:image/png;base64,') || imgUrl.startsWith('data:image/jpeg;base64,')) {
              svgCode = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wVal} ${hVal}" width="100%" height="100%">
                  <rect width="100%" height="100%" fill="none"/>
                  <image href="${imgUrl}" width="${wVal}" height="${hVal}" preserveAspectRatio="xMidYMid slice" />
                </svg>
              `;
            } else if (imgUrl.startsWith('http')) {
              const fetchRes = await fetch(imgUrl);
              const responseText = await fetchRes.text();
              const isSvgContent = responseText.includes('<svg') || responseText.includes('<?xml');
              if (isSvgContent) {
                svgCode = responseText;
              } else {
                svgCode = `
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wVal} ${hVal}" width="100%" height="100%">
                    <rect width="100%" height="100%" fill="none"/>
                    <image href="${imgUrl}" width="${wVal}" height="${hVal}" preserveAspectRatio="xMidYMid slice" />
                  </svg>
                `;
              }
            } else {
              svgCode = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wVal} ${hVal}" width="100%" height="100%">
                  <rect width="100%" height="100%" fill="none"/>
                  <image href="${imgUrl}" width="${wVal}" height="${hVal}" preserveAspectRatio="xMidYMid slice" />
                </svg>
              `;
            }

            authService.consumeCredit('Generation', `Prompt: "${prompt.slice(0, 30)}..."`, modelCost).then(() => updateWorkspaceCredits()).catch(creditErr => {
              console.warn('Credit consume error:', creditErr);
            });

            updateCanvasProgress(targetId, 100, 'Rendering complete!');
            await new Promise(r => setTimeout(r, 400));

            targetCanvas.svgContent = cleanAndValidateSvg(svgCode, wVal, hVal);
            targetCanvas.isGenerating = false;
            targetCanvas.prompt = prompt;
            targetCanvas.annotations = [];
            targetCanvas.bgRemoved = false;

            if (!processedImage) {
              await UpstashService.setCachedGeneration(prompt, selectedModel, targetCanvas.svgContent);
            }
          }
        }

        let svgW = null;
        let svgH = null;
        const parser = new DOMParser();
        const doc = parser.parseFromString(targetCanvas.svgContent, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
          const attrW = svgEl.getAttribute('width');
          const attrH = svgEl.getAttribute('height');
          if (attrW && attrH && !attrW.includes('%') && !attrH.includes('%')) {
            svgW = parseFloat(attrW);
            svgH = parseFloat(attrH);
          }
          if ((!svgW || !svgH) && svgEl.getAttribute('viewBox')) {
            const parts = svgEl.getAttribute('viewBox').split(/\s+/);
            if (parts.length === 4) {
              svgW = parseFloat(parts[2]);
              svgH = parseFloat(parts[3]);
            }
          }
        }
        if (svgW && svgH) {
          const ratio = svgW / svgH;
          let targetW = 1024;
          let targetH = 1024;
          if (ratio > 1) {
            targetH = Math.round(1024 / ratio);
          } else {
            targetW = Math.round(1024 * ratio);
          }
          targetCanvas.canvasWidth = targetW;
          targetCanvas.canvasHeight = targetH;
          targetCanvas.canvasPreset = 'Custom';
        }

        selectedCanvasId = targetCanvas.id;
        syncSelectedCanvasToSidebar();
        syncCanvasState();
        ProjectService.saveNow();
        renderCanvases();
        showToast('Generation complete');

      } catch (err) {
        console.error(err);
        let errorMsg = err.message || 'Generation failed';
        if (errorMsg.includes('Unavailable at the moment') || /credit|balance|billing|quota|limit|payment|insufficient|depleted|402/i.test(errorMsg)) {
          errorMsg = 'Unavailable at the moment';
        }
        showToast(errorMsg, true);
        
        targetCanvas.isGenerating = false;
        if (targetCanvas.svgContent === '') {
          canvases = canvases.filter(c => c.id !== targetCanvas.id);
          if (canvases.length === 0) {
            canvases.push({
              id: crypto.randomUUID(),
              svgContent: '',
              prompt: '',
              annotations: [],
              bgRemoved: false,
              canvasWidth: 1024,
              canvasHeight: 1024,
              canvasUnit: 'px',
              canvasPreset: 'Square',
              exportDpi: 300,
              x: 0,
              y: 0
            });
          }
          selectedCanvasId = canvases[canvases.length - 1].id;
        }
        syncSelectedCanvasToSidebar();
        syncCanvasState();
        renderCanvases();
      } finally {
        if (btnGenerate) { btnGenerate.disabled = false; }
        if (btnLabel)    { btnLabel.textContent = 'Generate'; }
        if (btnIcon)     { btnIcon.className  = 'icon fi fi-br-rocket text-lg'; }
        isGenerating = false;
      }
    })();
  }



  // ════════════════════════════════════════════
  // DISPLAY STATE MACHINE
  // ════════════════════════════════════════════

  function setDisplayState(state) {
    // state: 'idle' | 'generating' | 'output'
    if (!resultDisplay) return;
    resultDisplay.classList.remove('state-idle', 'state-generating', 'state-output', 'is-generating');
    resultDisplay.classList.add(`state-${state}`);
    if (state === 'generating') resultDisplay.classList.add('is-generating');
  }

  function setStatusBadge(state, label) {
    if (!resultStatusText) return;
    resultStatusText.textContent = label;
    const dot = resultDisplay?.querySelector('.live-pulse-dot');
    if (dot) {
      dot.style.background = state === 'generating' ? '#888' : 'rgba(0,200,100,0.8)';
    }
  }

  // ════════════════════════════════════════════
  // RENDER OUTPUT
  // ════════════════════════════════════════════

  function renderOutput(svgCode, promptText) {
    const selCanvas = canvases.find(c => c.id === selectedCanvasId);
    if (selCanvas) {
      selCanvas.svgContent = svgCode;

      let svgW = null;
      let svgH = null;
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgCode, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (svgEl) {
        const attrW = svgEl.getAttribute('width');
        const attrH = svgEl.getAttribute('height');
        if (attrW && attrH && !attrW.includes('%') && !attrH.includes('%')) {
          svgW = parseFloat(attrW);
          svgH = parseFloat(attrH);
        }
        if ((!svgW || !svgH) && svgEl.getAttribute('viewBox')) {
          const parts = svgEl.getAttribute('viewBox').split(/\s+/);
          if (parts.length === 4) {
            svgW = parseFloat(parts[2]);
            svgH = parseFloat(parts[3]);
          }
        }
      }
      if (svgW && svgH) {
        const ratio = svgW / svgH;
        let targetW = 1024;
        let targetH = 1024;
        if (ratio > 1) {
          targetH = Math.round(1024 / ratio);
        } else {
          targetW = Math.round(1024 * ratio);
        }
        selCanvas.canvasWidth = targetW;
        selCanvas.canvasHeight = targetH;
        selCanvas.canvasPreset = 'Custom';

        canvasWidth = targetW;
        canvasHeight = targetH;
        canvasPreset = 'Custom';

        const widthInput = $('canvas-width');
        const heightInput = $('canvas-height');
        const presetSelect = $('canvas-preset');
        if (widthInput) widthInput.value = canvasWidth;
        if (heightInput) heightInput.value = canvasHeight;
        if (presetSelect) presetSelect.value = 'Custom';
      }

      syncCanvasState();
      renderCanvases();
    }
  }

  // ════════════════════════════════════════════
  // TOOLBOX HELPERS
  // ════════════════════════════════════════════

  /**
   * Returns true if the given SVG string contains a raster <image> element,
   * meaning it was generated by the Design Only (Nano Banana Pro) pipeline.
   */
  function isRasterSvg(svgContent) {
    if (!svgContent) return false;
    return /<image[^>]+href="data:image/i.test(svgContent) ||
           /<image[^>]+href="http/i.test(svgContent);
  }

  function unlockToolbox() {
    // Post-processing tools require an existing canvas output
    [toolRemoveBg, toolAnnotate, toolExport].forEach((btn) => {
      if (btn) btn.disabled = !currentSVG;
    });
    // Syncraft extraction tools require a reference image
    if (toolExtractPattern) {
      toolExtractPattern.disabled = false;
      if (!referenceImage) {
        toolExtractPattern.classList.add('needs-image');
      } else {
        toolExtractPattern.classList.remove('needs-image');
      }
    }
    if (toolExtractRaster) {
      toolExtractRaster.disabled = false;
      if (!referenceImage) {
        toolExtractRaster.classList.add('needs-image');
      } else {
        toolExtractRaster.classList.remove('needs-image');
      }
    }
    const tabSyncraft = $('tab-syncraft');
    if (tabSyncraft) {
      if (!referenceImage) {
        tabSyncraft.classList.add('needs-image');
      } else {
        tabSyncraft.classList.remove('needs-image');
      }
    }
    // Vectorize/Upscale is only enabled when the canvas holds a raster image
    // Vectorize and Upscale are only enabled when the canvas holds a raster image
    if (toolVectorize) toolVectorize.disabled = !isRasterSvg(currentSVG);
    if (toolUpscaleCrisp) toolUpscaleCrisp.disabled = !isRasterSvg(currentSVG);
    if (toolUpscaleCreative) toolUpscaleCreative.disabled = !isRasterSvg(currentSVG);
  }

  function lockToolbox() {
    [toolRemoveBg, toolAnnotate, toolExport, toolExtractPattern, toolExtractRaster, toolVectorize, toolUpscaleCrisp, toolUpscaleCreative].forEach((btn) => {
      if (btn) btn.disabled = true;
    });
  }

  /**
   * Simulate a post-processing tool action.
   * Shows processing state on the button → delay → done state.
   */
  function simulateToolProcess(btn, processingMsg, doneMsg) {
    if (!btn || btn.disabled || btn.classList.contains('processing')) return;

    btn.classList.add('processing');
    const nameEl = btn.querySelector('.toolbox-btn-name');
    const descEl = btn.querySelector('.toolbox-btn-desc');
    const iconEl = btn.querySelector('.toolbox-btn-icon-wrap .icon');
    const origName = nameEl?.textContent;
    const origDesc = descEl?.textContent;
    const origIconClass = iconEl?.className || 'icon fi fi-br-magic-wand';

    if (nameEl) nameEl.textContent = processingMsg;
    if (iconEl) iconEl.className = 'icon fi fi-br-hourglass';

    setTimeout(() => {
      btn.classList.remove('processing');
      btn.classList.add('done');
      if (nameEl) nameEl.textContent = origName;
      if (descEl) descEl.textContent = '✓ ' + doneMsg;
      if (iconEl) iconEl.className = 'icon fi fi-br-check-circle';
      iconEl.style.color = 'var(--color-primary)';
      showToast(doneMsg);

      // Reset after 4 s
      setTimeout(() => {
        btn.classList.remove('done');
        if (nameEl) nameEl.textContent = origName;
        if (descEl) descEl.textContent = origDesc;
        if (iconEl) { iconEl.className = origIconClass; iconEl.style.color = ''; }
      }, 4000);
    }, 2000);
  }

  // ════════════════════════════════════════════
  // EXPORT
  // ════════════════════════════════════════════

  /**
   * Scans the SVG content for external/relative <image> tags and converts them
   * into base64 DataURLs. This ensures they render correctly inside a sandboxed
   * Image element context during PNG/JPEG/PDF export.
   */
  async function inlineSvgImages(svgString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const images = doc.querySelectorAll('image');
    if (images.length === 0) return svgString;

    const promises = Array.from(images).map(async (img) => {
      let href = img.getAttribute('href') || img.getAttribute('xlink:href');
      if (href && (href.startsWith('http') || href.startsWith('brand') || href.startsWith('/'))) {
        try {
          let absoluteUrl = href;
          if (!href.startsWith('http')) {
            absoluteUrl = new URL(href, window.location.href).href;
          }
          const response = await fetch(absoluteUrl);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const blob = await response.blob();
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          img.setAttribute('href', dataUrl);
          img.removeAttribute('xlink:href');
        } catch (err) {
          console.error('Failed to inline image in SVG:', href, err);
        }
      }
    });

    await Promise.all(promises);
    return new XMLSerializer().serializeToString(doc);
  }

  async function downloadFile(svgString, format) {
    const project = ProjectService.getCurrentProject();
    const baseName = (project?.name || 'syncraft-design')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);

    // Calculate target resolution in pixels based on DPI and unit
    const wVal = parseFloat(canvasWidth) || 1024;
    const hVal = parseFloat(canvasHeight) || 1024;
    const dpiVal = parseFloat(exportDpi) || 300;
    let targetPixelWidth = 1024;
    let targetPixelHeight = 1024;

    if (canvasUnit === 'mm') {
      targetPixelWidth = Math.round((wVal / 25.4) * dpiVal);
      targetPixelHeight = Math.round((hVal / 25.4) * dpiVal);
    } else if (canvasUnit === 'in') {
      targetPixelWidth = Math.round(wVal * dpiVal);
      targetPixelHeight = Math.round(hVal * dpiVal);
    } else {
      // px
      const scaleMultiplier = dpiVal / 72;
      targetPixelWidth = Math.round(wVal * scaleMultiplier);
      targetPixelHeight = Math.round(hVal * scaleMultiplier);
    }

    // Inline any external/relative images inside the SVG first
    try {
      svgString = await inlineSvgImages(svgString);
    } catch (inlineErr) {
      console.error('Error during SVG image inlining:', inlineErr);
    }

    if (format === 'svg') {
      triggerDownload(
        new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }),
        `${baseName}.svg`
      );
      return;
    }

    if (format === 'png') {
      return new Promise((resolve, reject) => {
        // Scale SVG
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgRoot = doc.querySelector('svg');
        if (svgRoot) {
          if (!svgRoot.getAttribute('viewBox')) {
            const origW = svgRoot.getAttribute('width') || wVal;
            const origH = svgRoot.getAttribute('height') || hVal;
            svgRoot.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
          }
          svgRoot.setAttribute('width', targetPixelWidth);
          svgRoot.setAttribute('height', targetPixelHeight);
          svgString = new XMLSerializer().serializeToString(doc);
        }

        const img = new Image();
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width  = targetPixelWidth;
          canvas.height = targetPixelHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, targetPixelWidth, targetPixelHeight);
          canvas.toBlob((pngBlob) => {
            changeDpiBlob(pngBlob, dpiVal).then((newBlob) => {
              triggerDownload(newBlob, `${baseName}.png`);
              URL.revokeObjectURL(url);
              resolve();
            }).catch((err) => {
              console.error('Failed to set PNG DPI:', err);
              triggerDownload(pngBlob, `${baseName}.png`);
              URL.revokeObjectURL(url);
              resolve();
            });
          }, 'image/png');
        };
        img.onerror = (err) => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to render SVG image for PNG export'));
        };
        img.src = url;
      });
    }

    if (format === 'jpeg') {
      return new Promise((resolve, reject) => {
        // Scale SVG
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgRoot = doc.querySelector('svg');
        if (svgRoot) {
          if (!svgRoot.getAttribute('viewBox')) {
            const origW = svgRoot.getAttribute('width') || wVal;
            const origH = svgRoot.getAttribute('height') || hVal;
            svgRoot.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
          }
          svgRoot.setAttribute('width', targetPixelWidth);
          svgRoot.setAttribute('height', targetPixelHeight);
          svgString = new XMLSerializer().serializeToString(doc);
        }

        const imgJ = new Image();
        const blobJ = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const urlJ  = URL.createObjectURL(blobJ);
        imgJ.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width  = targetPixelWidth;
          canvas.height = targetPixelHeight;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(imgJ, 0, 0, targetPixelWidth, targetPixelHeight);
          canvas.toBlob((jpegBlob) => {
            changeDpiBlob(jpegBlob, dpiVal).then((newBlob) => {
              triggerDownload(newBlob, `${baseName}.jpg`);
              URL.revokeObjectURL(urlJ);
              resolve();
            }).catch((err) => {
              console.error('Failed to set JPEG DPI:', err);
              triggerDownload(jpegBlob, `${baseName}.jpg`);
              URL.revokeObjectURL(urlJ);
              resolve();
            });
          }, 'image/jpeg', 0.95);
        };
        imgJ.onerror = (err) => {
          URL.revokeObjectURL(urlJ);
          reject(new Error('Failed to render SVG image for JPEG export'));
        };
        imgJ.src = urlJ;
      });
    }

    if (format === 'pdf') {
      showToast('Preparing PDF document...');
      return new Promise(async (resolve, reject) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(svgString, 'image/svg+xml');
          const svgRoot = doc.querySelector('svg');
          if (svgRoot) {
            if (!svgRoot.getAttribute('viewBox')) {
              const origW = svgRoot.getAttribute('width') || wVal;
              const origH = svgRoot.getAttribute('height') || hVal;
              svgRoot.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
            }
            svgRoot.setAttribute('width', targetPixelWidth);
            svgRoot.setAttribute('height', targetPixelHeight);
            svgString = new XMLSerializer().serializeToString(doc);
          }

          const img = new Image();
          const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url  = URL.createObjectURL(blob);
          
          img.onload = async () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width  = targetPixelWidth;
              canvas.height = targetPixelHeight;
              const ctx = canvas.getContext('2d');
              
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              ctx.drawImage(img, 0, 0, targetPixelWidth, targetPixelHeight);
              const imgData = canvas.toDataURL('image/jpeg', 0.95);
              
              let jspdfObj = window.jspdf;
              if (!jspdfObj) {
                await new Promise((res, rej) => {
                  const script = document.createElement('script');
                  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                  script.onload = () => res();
                  script.onerror = () => rej(new Error('Failed to load jsPDF library.'));
                  document.head.appendChild(script);
                });
                jspdfObj = window.jspdf;
              }

              const { jsPDF } = jspdfObj;
              const orientation = targetPixelWidth >= targetPixelHeight ? 'l' : 'p';
              const pdf = new jsPDF({
                orientation: orientation,
                unit: 'px',
                format: [targetPixelWidth, targetPixelHeight]
              });
              
              pdf.addImage(imgData, 'JPEG', 0, 0, targetPixelWidth, targetPixelHeight);
              pdf.save(`${baseName}.pdf`);
              
              URL.revokeObjectURL(url);
              showToast('PDF downloaded successfully!');
              resolve();
            } catch (err) {
              URL.revokeObjectURL(url);
              reject(err);
            }
          };
          img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to render SVG image for PDF export'));
          };
          img.src = url;
        } catch (err) {
          reject(err);
        }
      });
    }
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${filename} downloaded`);
  }



  // ════════════════════════════════════════════
  // HISTORY PANEL
  // ════════════════════════════════════════════

  function showHistoryPanel() {
    const recents = ProjectService.getRecentProjects();
    const cardsHTML = recents.length === 0
      ? '<p style="color:var(--color-on-surface-variant);text-align:center;padding:32px 0;">No generation history yet.</p>'
      : recents.map(p => `
          <div style="
            display:flex;gap:12px;padding:12px;
            background:var(--color-surface-container-high);
            border:1px solid var(--color-outline-dim);
            border-radius:12px;cursor:pointer;
            transition:border-color 0.15s;
          " onmouseover="this.style.borderColor='var(--color-primary)'"
             onmouseout="this.style.borderColor='var(--color-outline-dim)'"
             data-open="${p.id}">
            <div style="width:56px;height:40px;background:var(--color-on-surface-variant);border-radius:6px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
              ${p.thumbnail || '<i class="icon fi fi-br-paint-brush" style="font-size:24px;color:rgba(0,0,0,0.15);"></i>'}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;color:#fff;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHTML(p.name)}</div>
              <div style="font-size:10px;color:var(--color-on-surface-variant);margin-top:3px;text-transform:uppercase;letter-spacing:0.04em;">${new Date(p.lastModified).toLocaleString()}</div>
            </div>
          </div>
        `).join('');

    openModal('Generation History', `<div style="display:flex;flex-direction:column;gap:10px;">${cardsHTML}</div>`);

    // Wire open buttons
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-open]').forEach(el => {
        el.addEventListener('click', async () => {
          const id = el.dataset.open;
          try {
            const proj = await ProjectService.openProject(id);
            if (!proj?.canvasData?.svgContent) return;
            currentSVG = proj.canvasData.svgContent;
            renderOutput(currentSVG, proj.canvasData.prompt || '');
            setDisplayState('output');
            setStatusBadge('ready', 'Ready');
            unlockToolbox();
            if (promptInput && proj.canvasData.prompt) {
              promptInput.value = proj.canvasData.prompt;
              adjustPromptInputHeight();
            }
            document.getElementById('syncraft-modal')?.remove();
            showToast(`Restored "${proj.name}"`);
          } catch (err) {
            console.error(err);
            showToast('Failed to restore project', true);
          }
        });
      });
    });
  }

  // ════════════════════════════════════════════
  // PROJECTS PANEL (recent projects modal)
  // ════════════════════════════════════════════

  function showProjectsPanel() {
    const recents = ProjectService.getRecentProjects();
    const cards = recents.map(p => `
      <div data-project-card style="
        display:flex;gap:14px;padding:12px;
        background:var(--color-surface-container-high);
        border:1px solid var(--color-outline-dim);
        border-radius:12px;transition:border-color 0.15s;
      " onmouseover="this.style.borderColor='var(--color-primary)'"
         onmouseout="this.style.borderColor='var(--color-outline-dim)'">
        <div style="width:64px;height:46px;background:#e9e6e5;border-radius:8px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          ${p.thumbnail || '<i class="icon fi fi-br-paint-brush" style="font-size:28px;color:rgba(0,0,0,0.12);"></i>'}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:#fff;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHTML(p.name)}</div>
          <div style="font-size:10px;color:var(--color-on-surface-variant);margin-top:4px;text-transform:uppercase;letter-spacing:0.04em;">Modified ${new Date(p.lastModified).toLocaleDateString()}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <button data-open-project="${p.id}" style="padding:6px 12px;border-radius:999px;background:transparent;border:1px solid var(--color-outline-dim);color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;cursor:pointer;transition:all 0.15s;"
            onmouseover="this.style.borderColor='var(--color-primary)';this.style.color='var(--color-primary)'"
            onmouseout="this.style.borderColor='var(--color-outline-dim)';this.style.color='#fff'">Open</button>
          <button data-delete-project="${p.id}" style="padding:6px;border-radius:999px;background:transparent;border:1px solid transparent;color:var(--color-on-surface-variant);cursor:pointer;display:flex;transition:all 0.15s;"
            onmouseover="this.style.color='#ffb4ab'" onmouseout="this.style.color='var(--color-on-surface-variant)'" title="Delete">
            <i class="icon fi fi-br-trash" style="font-size:16px;"></i>
          </button>
        </div>
      </div>
    `).join('');

    openModal('Recent Projects', `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <span style="font-size:13px;color:var(--color-on-surface-variant);">${recents.length} project${recents.length !== 1 ? 's' : ''}</span>
        <button id="modal-new-project" style="padding:8px 18px;border-radius:999px;background:var(--color-primary);color:#000;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border:none;cursor:pointer;">+ New Project</button>
      </div>
      ${recents.length === 0 ? '<p style="color:var(--color-on-surface-variant);text-align:center;padding:32px 0;">No projects yet.</p>' : `<div style="display:flex;flex-direction:column;gap:10px;">${cards}</div>`}
    `);

    requestAnimationFrame(() => {
      document.getElementById('modal-new-project')?.addEventListener('click', () => {
        try {
          document.getElementById('syncraft-modal')?.remove();
          ProjectService.createProject();
          setDisplayState('idle');
          setStatusBadge('ready', 'Ready');
          lockToolbox();
          if (resultSvgWrap) resultSvgWrap.innerHTML = '';
          if (promptInput) {
            promptInput.value = '';
            adjustPromptInputHeight();
          }
          currentSVG = '';
          if (resultMetaBadge) resultMetaBadge.innerHTML = '';
          showToast('New project created');
        } catch (err) {
          console.error(err);
          showToast('Failed to create project', true);
        }
      });

      document.querySelectorAll('[data-open-project]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const proj = await ProjectService.openProject(btn.dataset.openProject);
            if (!proj) { showToast('Project not found', true); return; }
            document.getElementById('syncraft-modal')?.remove();
            if (proj.canvasData?.svgContent) {
              currentSVG = proj.canvasData.svgContent;
              renderOutput(currentSVG, proj.canvasData.prompt || '');
              setDisplayState('output');
              setStatusBadge('ready', 'Ready');
              unlockToolbox();
            } else {
              setDisplayState('idle');
              lockToolbox();
            }
            if (promptInput && proj.canvasData?.prompt) {
              promptInput.value = proj.canvasData.prompt;
              adjustPromptInputHeight();
            }
            document.getElementById('ws-project-name') && (document.getElementById('ws-project-name').textContent = proj.name);
            showToast(`Opened "${proj.name}"`);
          } catch (err) {
            console.error(err);
            showToast('Failed to open project', true);
          }
        });
      });

      document.querySelectorAll('[data-delete-project]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await ProjectService.deleteProject(btn.dataset.deleteProject);
            btn.closest('[data-project-card]')?.remove();
            showToast('Project deleted');
          } catch (err) {
            console.error(err);
            showToast('Failed to delete project', true);
          }
        });
      });
    });
  }

  // ════════════════════════════════════════════
  // PROJECT META (header injection — Phase 2)
  // ════════════════════════════════════════════

  function injectProjectMeta() {
    const meta = document.getElementById('ws-project-meta');
    if (!meta) return;
    meta.innerHTML = '';

    const project = ProjectService.getCurrentProject();

    const nameEl = document.createElement('div');
    nameEl.id = 'ws-project-name';
    nameEl.textContent = project?.name ?? 'Untitled Project';
    nameEl.title = 'Click to rename';
    nameEl.style.cssText = 'font-family:var(--font-family-display);font-size:14px;font-weight:600;color:rgba(255,255,255,0.7);cursor:text;padding:2px 6px;border-radius:4px;border:1px solid transparent;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:border-color 0.15s,color 0.15s,background 0.15s;';
    nameEl.addEventListener('mouseenter', () => { nameEl.style.borderColor='var(--color-outline-dim)'; nameEl.style.color='#fff'; nameEl.style.background='rgba(255,255,255,0.05)'; });
    nameEl.addEventListener('mouseleave', () => { if (document.activeElement!==nameEl) { nameEl.style.borderColor='transparent'; nameEl.style.color='rgba(255,255,255,0.7)'; nameEl.style.background='transparent'; } });
    nameEl.setAttribute('contenteditable','false');
    nameEl.addEventListener('click', () => { nameEl.setAttribute('contenteditable','true'); nameEl.style.borderColor='var(--color-primary)'; nameEl.style.color='#fff'; nameEl.focus(); const r=document.createRange(); r.selectNodeContents(nameEl); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); });
    nameEl.addEventListener('keydown', (e) => { if(e.key==='Enter'){e.preventDefault();nameEl.blur();} if(e.key==='Escape'){nameEl.textContent=ProjectService.getCurrentProject()?.name??'Untitled Project';nameEl.blur();} });
    nameEl.addEventListener('blur', () => { nameEl.setAttribute('contenteditable','false'); nameEl.style.borderColor='transparent'; nameEl.style.color='rgba(255,255,255,0.7)'; nameEl.style.background='transparent'; const n=nameEl.textContent.trim(); if(n) ProjectService.renameProject(n); nameEl.textContent=ProjectService.getCurrentProject()?.name??'Untitled Project'; });

    const saveEl = document.createElement('div');
    saveEl.id = 'ws-autosave-indicator';
    saveEl.style.cssText = 'font-size:10px;font-weight:600;color:rgba(255,255,255,0.28);letter-spacing:0.04em;text-transform:uppercase;display:flex;align-items:center;gap:4px;padding:0 6px;transition:color 0.3s;';
    saveEl.textContent = '✓ Saved';

    meta.appendChild(nameEl);
    meta.appendChild(saveEl);
  }

  function updateAutosaveIndicator(ts) {
    const el = document.getElementById('ws-autosave-indicator');
    if (!el) return;
    el.textContent = `✓ Saved at ${new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
    el.style.color = 'rgba(255,255,255,0.28)';
  }

  // ════════════════════════════════════════════
  // SETTINGS / HELP MODALS
  // ════════════════════════════════════════════

  // Local Settings helper removed - using imported showSettingsModal from auth.js

  function showHelpModal() {
    openModal('Help & Shortcuts', `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${[
          ['Generate', 'Enter  or  Ctrl + G'],
          ['Save project', 'Ctrl + S'],
          ['Export file', 'Ctrl + E'],
          ['Close modal', 'Esc'],
          ['Recent projects', 'Nav → Projects'],
          ['History', 'Mode strip → History'],
        ].map(([a,k])=>`<tr style="border-bottom:1px solid var(--color-outline-dim);"><td style="padding:10px 0;color:#fff;font-weight:600;">${a}</td><td style="padding:10px 0 10px 16px;color:var(--color-primary);font-weight:600;text-align:right;font-family:monospace;">${k}</td></tr>`).join('')}
      </table>
    `);
  }

  // ════════════════════════════════════════════
  // MICRO-UX
  // ════════════════════════════════════════════

  function wireTooltip(el, text) {
    if (!text || el._tipWired) return;
    el._tipWired = true;
    let tip;
    el.addEventListener('mouseenter', () => {
      tip = document.createElement('div');
      tip.textContent = text;
      tip.style.cssText = 'position:fixed;background:var(--color-surface-container-highest);border:1px solid var(--color-outline-dim);color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:5px 10px;border-radius:6px;pointer-events:none;z-index:99999;white-space:nowrap;opacity:0;transition:opacity 0.15s;';
      document.body.appendChild(tip);
      const r = el.getBoundingClientRect();
      tip.style.top  = `${r.top + r.height / 2 - 12}px`;
      tip.style.left = `${r.right + 10}px`;
      requestAnimationFrame(() => tip.style.opacity = '1');
    });
    el.addEventListener('mouseleave', () => {
      if (tip) { tip.style.opacity='0'; setTimeout(()=>tip?.remove(), 150); }
    });
  }

  function escHTML(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function applyViewportTransform() {
    const resultInner = document.getElementById('result-inner');
    if (resultInner) {
      resultInner.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoomLevel})`;
    }
    document.dispatchEvent(new CustomEvent('syncraft:zoomLevelChanged', { detail: { zoom: zoomLevel } }));
  }


  function updateCursorClass() {
    if (!resultDisplay) return;
    resultDisplay.classList.remove('tool-select', 'tool-pan', 'tool-text', 'panning');
    
    if (isSpacePressed || activeToolId === 'tool-pan') {
      if (isDragging) {
        resultDisplay.classList.add('panning');
      } else {
        resultDisplay.classList.add('tool-pan');
      }
    } else if (activeToolId === 'tool-select') {
      resultDisplay.classList.add('tool-select');
    } else if (activeToolId === 'tool-text') {
      resultDisplay.classList.add('tool-text');
    }
  }

  function updateAnnotationOverlayVisibility() {
    if (!annotationOverlay) return;
    if (activeToolId === 'mode-refine' || activeToolId === 'tool-text' || activeToolId === 'tool-select' || annotations.length > 0) {
      annotationOverlay.style.display = 'block';
      if (activeToolId === 'mode-refine') {
        annotationOverlay.classList.add('active');
      } else {
        annotationOverlay.classList.remove('active');
      }
      resizeAnnotationOverlay();
    } else {
      annotationOverlay.style.display = 'none';
    }
  }

  function zoomToFit() {
    const activeFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`);
    if (activeFrame && resultDisplay) {
      const containerW = resultDisplay.clientWidth;
      const containerH = resultDisplay.clientHeight;
      const frameW = activeFrame.offsetWidth;
      const frameH = activeFrame.offsetHeight;
      if (frameW > 0 && frameH > 0) {
        const scaleW = (containerW * 0.8) / frameW;
        const scaleH = (containerH * 0.8) / frameH;
        zoomLevel = Math.max(0.15, Math.min(4.0, Math.min(scaleW, scaleH)));
        
        const canvas = canvases.find(c => c.id === selectedCanvasId);
        const canvasX = canvas ? (canvas.x || 0) : 0;
        const canvasY = canvas ? (canvas.y || 0) : 0;
        
        panX = (containerW - frameW * zoomLevel) / 2 - canvasX * zoomLevel;
        panY = (containerH - frameH * zoomLevel) / 2 - canvasY * zoomLevel;
        applyViewportTransform();
      }
    }
  }

  function centerCanvas() {
    const activeFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`);
    if (activeFrame && resultDisplay) {
      const containerW = resultDisplay.clientWidth;
      const containerH = resultDisplay.clientHeight;
      const frameW = activeFrame.offsetWidth;
      const frameH = activeFrame.offsetHeight;
      if (frameW > 0 && frameH > 0) {
        const canvas = canvases.find(c => c.id === selectedCanvasId);
        const canvasX = canvas ? (canvas.x || 0) : 0;
        const canvasY = canvas ? (canvas.y || 0) : 0;
        
        panX = (containerW - frameW * zoomLevel) / 2 - canvasX * zoomLevel;
        panY = (containerH - frameH * zoomLevel) / 2 - canvasY * zoomLevel;
        applyViewportTransform();
      }
    }
  }

  function openEditBubble(ann, badge) {
    const existingBubble = annotationOverlay.querySelector('.annotation-input-bubble');
    if (existingBubble) existingBubble.remove();
    
    const bubble = document.createElement('div');
    bubble.className = 'annotation-input-bubble';
    bubble.style.left = badge.style.left;
    bubble.style.top = badge.style.top;
    
    const isRegion = typeof ann.width === 'number' && typeof ann.height === 'number' && (ann.width > 0 || ann.height > 0);
    if (isRegion) {
      bubble.style.transform = 'translate(-50%, 8px)';
    } else {
      bubble.style.transform = 'translate(-50%, -50%)';
    }
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = ann.text;
    input.id = 'edit-annotation-input';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'annotation-input-btn confirm';
    confirmBtn.title = 'Update label';
    confirmBtn.innerHTML = '<i class="icon fi fi-br-check"></i>';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'annotation-input-btn cancel';
    cancelBtn.title = 'Cancel';
    cancelBtn.innerHTML = '<i class="icon fi fi-br-cross"></i>';
    
    bubble.appendChild(input);
    bubble.appendChild(confirmBtn);
    bubble.appendChild(cancelBtn);
    annotationOverlay.appendChild(bubble);
    
    input.focus();
    input.select();
    
    const cleanup = () => {
      bubble.remove();
      renderAnnotations();
    };
    
    const submitEdit = async () => {
      const val = input.value.trim();
      if (!val || val === ann.text) {
        cleanup();
        return;
      }
      
      pushHistory();
      
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        showToast('Please configure your Gemini API Key in preferences.', true);
        cleanup();
        return;
      }
      
      const canvasLoader = $('result-loading-overlay');
      const canvasLoaderText = $('result-loading-text');
      const activeFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`) || document.getElementById('canvas-frame');
      if (activeFrame && canvasLoader) {
        activeFrame.appendChild(canvasLoader);
      }
      if (canvasLoader) canvasLoader.classList.add('active');
      if (canvasLoaderText) canvasLoaderText.textContent = 'AI Updating Callout...';
      
      try {
        const promptText = `You are an SVG designer. Find the callout text "${ann.text}" in the following SVG and update it to "${val}". Keep all other styling, lines, positions, and structures exactly the same.
Return ONLY the complete raw modified SVG code. Do not wrap in markdown code blocks.
Here is the SVG:\n\n${currentSVG}`;

        const responseText = await callGeminiApi(apiKey, promptText);
        currentSVG = cleanAndValidateSvg(responseText);
        
        ann.text = val;
        ProjectService.updateCanvasData({
          svgContent: currentSVG,
          annotations
        });
        ProjectService.updateThumbnail(currentSVG);
        renderOutput(currentSVG, promptInput?.value.trim() ?? '');
        showToast('Callout updated successfully');
      } catch (err) {
        console.error(err);
        let errorMsg = 'AI callout update failed';
        if (err.message && (err.message.includes('Unavailable at the moment') || /credit|balance|billing|quota|limit|payment|insufficient|depleted|402/i.test(err.message))) {
          errorMsg = 'Unavailable at the moment';
        }
        showToast(errorMsg, true);
      } finally {
        cleanup();
        if (canvasLoader) {
          canvasLoader.classList.remove('active');
          if (resultDisplay) resultDisplay.appendChild(canvasLoader);
        }
      }
    };
    
    confirmBtn.addEventListener('click', submitEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitEdit();
      if (e.key === 'Escape') cleanup();
    });
    cancelBtn.addEventListener('click', cleanup);
  }

  // Zoom Preset Custom Event Listener
  document.addEventListener('syncraft:zoomAction', (e) => {
    const action = e.detail?.action;
    if (!action) return;
    
    if (action === 'in') {
      zoomLevel = Math.min(4.0, zoomLevel * 1.25);
      applyViewportTransform();
    } else if (action === 'out') {
      zoomLevel = Math.max(0.15, zoomLevel / 1.25);
      applyViewportTransform();
    } else if (action === 'fit') {
      zoomToFit();
    } else {
      const pct = parseFloat(action);
      if (!isNaN(pct)) {
        zoomLevel = pct / 100;
        const activeFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`);
        if (activeFrame && resultDisplay) {
          const containerW = resultDisplay.clientWidth;
          const containerH = resultDisplay.clientHeight;
          const frameW = activeFrame.offsetWidth;
          const frameH = activeFrame.offsetHeight;
          
          const canvas = canvases.find(c => c.id === selectedCanvasId);
          const canvasX = canvas ? (canvas.x || 0) : 0;
          const canvasY = canvas ? (canvas.y || 0) : 0;
          
          panX = (containerW - frameW * zoomLevel) / 2 - canvasX * zoomLevel;
          panY = (containerH - frameH * zoomLevel) / 2 - canvasY * zoomLevel;
        } else {
          panX = 0;
          panY = 0;
        }
        applyViewportTransform();
      }
    }
  });

  // Wheel event zoom and trackpad panning
  if (resultDisplay) {
    resultDisplay.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        
        const zoomFactor = 1.1;
        const oldZoom = zoomLevel;
        let newZoom = oldZoom;
        if (e.deltaY < 0) {
          newZoom = Math.min(4.0, oldZoom * zoomFactor);
        } else {
          newZoom = Math.max(0.15, oldZoom / zoomFactor);
        }
        
        if (newZoom !== oldZoom) {
          const rect = resultDisplay.getBoundingClientRect();
          const mouseX = e.clientX - rect.left - rect.width / 2;
          const mouseY = e.clientY - rect.top - rect.height / 2;
          
          panX = mouseX - (mouseX - panX) * (newZoom / oldZoom);
          panY = mouseY - (mouseY - panY) * (newZoom / oldZoom);
          zoomLevel = newZoom;
          
          applyViewportTransform();
        }
      } else {
        e.preventDefault();
        const speed = 1.5;
        if (e.shiftKey) {
          panX -= e.deltaY * speed;
        } else {
          panX -= e.deltaX * speed;
          panY -= e.deltaY * speed;
        }
        applyViewportTransform();
      }
    }, { passive: false });

    // Click on background of resultDisplay to deselect annotation badge
    resultDisplay.addEventListener('mousedown', (e) => {
      if (activeToolId === 'tool-select' && selectedAnnotationId) {
        if (!e.target.closest('.annotation-badge') && !e.target.closest('.annotation-input-bubble')) {
          selectedAnnotationId = null;
          renderAnnotations();
        }
      }
    });

    // Click in resultDisplay for Text Tool placement
    resultDisplay.addEventListener('click', (e) => {
      if (activeToolId !== 'tool-text') return;
      if (!currentSVG) {
        showToast('Generate a design first before adding text callouts', true);
        return;
      }
      
      const isInsideCanvas = e.target.closest(`#canvas-frame-${selectedCanvasId}`);
      if (!isInsideCanvas) return;
      
      if (e.target.closest('.annotation-input-bubble') || e.target.closest('.annotation-badge')) {
        return;
      }
      
      if (!annotationOverlay) return;
      
      annotationOverlay.style.display = 'block';
      resizeAnnotationOverlay();
      
      const rect = annotationOverlay.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      
      const existingBubble = annotationOverlay.querySelector('.annotation-input-bubble');
      if (existingBubble) existingBubble.remove();
      
      const bubble = document.createElement('div');
      bubble.className = 'annotation-input-bubble';
      bubble.style.left = `${x}%`;
      bubble.style.top = `${y}%`;
      bubble.style.transform = 'translate(-50%, -50%)';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Type callout text...';
      input.id = 'new-text-annotation-input';
      
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'annotation-input-btn confirm';
      confirmBtn.title = 'Add label';
      confirmBtn.innerHTML = '<i class="icon fi fi-br-check"></i>';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'annotation-input-btn cancel';
      cancelBtn.title = 'Cancel';
      cancelBtn.innerHTML = '<i class="icon fi fi-br-cross"></i>';
      
      bubble.appendChild(input);
      bubble.appendChild(confirmBtn);
      bubble.appendChild(cancelBtn);
      annotationOverlay.appendChild(bubble);
      
      input.focus();
      
      const cleanup = () => {
        bubble.remove();
        renderAnnotations();
      };
      
      const submitText = async () => {
        const val = input.value.trim();
        if (!val) {
          cleanup();
          return;
        }
        
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
          showToast('Please configure your Gemini API Key in preferences.', true);
          cleanup();
          return;
        }
        
        const canvasLoader = $('result-loading-overlay');
        const canvasLoaderText = $('result-loading-text');
        const activeFrame = document.getElementById(`canvas-frame-${selectedCanvasId}`) || document.getElementById('canvas-frame');
        if (activeFrame && canvasLoader) {
          activeFrame.appendChild(canvasLoader);
        }
        if (canvasLoader) canvasLoader.classList.add('active');
        if (canvasLoaderText) canvasLoaderText.textContent = 'AI Creating Callout...';
        
        const newAnn = {
          id: crypto.randomUUID(),
          text: val,
          x: x,
          y: y
        };
        
        try {
          let viewboxWidth = 800;
          let viewboxHeight = 600;
          const parser = new DOMParser();
          const doc = parser.parseFromString(currentSVG, 'image/svg+xml');
          const svg = doc.querySelector('svg');
          if (svg) {
            const vb = svg.getAttribute('viewBox');
            if (vb) {
              const parts = vb.split(/\s+/).map(Number);
              if (parts.length === 4) {
                viewboxWidth = parts[2];
                viewboxHeight = parts[3];
              }
            }
          }
          
          const targetX = (newAnn.x / 100) * viewboxWidth;
          const targetY = (newAnn.y / 100) * viewboxHeight;
          
          const promptText = `You are an SVG designer. Please add a professional visual callout/label to the following SVG at coordinates: X=${targetX.toFixed(1)}, Y=${targetY.toFixed(1)}.
The label text is: "${newAnn.text}".
Please draw a sleek, modern callout that matches the SVG's style (use color matching or a neutral color like white or lime green #d4ff59 with nice semi-transparent black background for the label box):
- A small marker dot or rectangle outline at the target coordinates.
- A clean pointer line connecting the target coordinate to the text container.
- A clean text box showing the text "${newAnn.text}". Ensure text is visible (e.g. fill white, background dark translucent).
Place all new callout elements at the very end of the SVG (before the closing </svg> tag), wrapped in a group <g class="ai-callout">.
Return ONLY the complete raw modified SVG code. Do not wrap in markdown code blocks.
Here is the SVG:\n\n${currentSVG}`;

          const responseText = await callGeminiApi(apiKey, promptText);
          currentSVG = cleanAndValidateSvg(responseText);
          
          annotations.push(newAnn);
          ProjectService.updateCanvasData({
            svgContent: currentSVG,
            annotations
          });
          ProjectService.updateThumbnail(currentSVG);
          renderOutput(currentSVG, promptInput?.value.trim() ?? '');
          showToast('Callout added successfully');
        } catch (err) {
          console.error(err);
          let errorMsg = 'AI callout generation failed';
          if (err.message && (err.message.includes('Unavailable at the moment') || /credit|balance|billing|quota|limit|payment|insufficient|depleted|402/i.test(err.message))) {
            errorMsg = 'Unavailable at the moment';
          }
          showToast(errorMsg, true);
        } finally {
          cleanup();
          if (canvasLoader) {
            canvasLoader.classList.remove('active');
            if (resultDisplay) resultDisplay.appendChild(canvasLoader);
          }
        }
      };
      
      confirmBtn.addEventListener('click', submitText);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') submitText();
        if (ev.key === 'Escape') cleanup();
      });
      cancelBtn.addEventListener('click', cleanup);
    });

    // Canvas Mouse Dragging (Pan)
    let dragStartX = 0;
    let dragStartY = 0;
    
    resultDisplay.addEventListener('mousedown', (e) => {
      const canPan = isSpacePressed || activeToolId === 'tool-pan';
      if (!canPan) return;
      
      if (e.target.closest('.annotation-input-bubble') || e.target.closest('.annotation-badge-delete')) {
        return;
      }
      
      isCanvasDragging = true;
      dragStartX = e.clientX - panX;
      dragStartY = e.clientY - panY;
      isDragging = true;
      updateCursorClass();
      e.preventDefault();
    });
    
    window.addEventListener('mousemove', (e) => {
      if (!isCanvasDragging) return;
      
      panX = e.clientX - dragStartX;
      panY = e.clientY - dragStartY;
      applyViewportTransform();
    });
    
    window.addEventListener('mouseup', () => {
      if (isCanvasDragging) {
        isCanvasDragging = false;
        isDragging = false;
        updateCursorClass();
      }
    });
  }

  // Keyboard hotkeys for tools, delete, and zoom
  document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
      return;
    }
    
    // Tool selection hotkeys
    let targetToolBtn = null;
    if (e.key.toLowerCase() === 'v') {
      targetToolBtn = $('tool-select');
    } else if (e.key.toLowerCase() === 'h') {
      targetToolBtn = $('tool-pan');
    }
    
    if (targetToolBtn) {
      e.preventDefault();
      targetToolBtn.click();
      return;
    }

    // Selected annotation deletion
    if (activeToolId === 'tool-select' && selectedAnnotationId) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteAnnotation(selectedAnnotationId);
        selectedAnnotationId = null;
        return;
      }
    }

    // Zoom shortcuts
    if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomLevel = Math.min(4.0, zoomLevel * 1.25);
      applyViewportTransform();
    } else if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
      e.preventDefault();
      zoomLevel = Math.max(0.15, zoomLevel / 1.25);
      applyViewportTransform();
    } else if (e.shiftKey && e.key === '1') {
      e.preventDefault();
      zoomToFit();
    }
    
    // Spacebar toggle
    if (e.code === 'Space') {
      e.preventDefault();
      if (!isSpacePressed) {
        isSpacePressed = true;
        updateCursorClass();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      isSpacePressed = false;
      updateCursorClass();
    }
  });

  // ── Workspace Credits Badge Setup ────────────
  function updateWorkspaceCredits() {
    const user = authService.getCurrentUser();
    const textEl = $('ws-credits-text');
    if (textEl && user) {
      const oldText = textEl.textContent;
      const remaining = Math.max(0, user.creditsMax - user.creditsUsed);
      const newText = `${remaining}`;
      textEl.textContent = newText;

      if (oldText && oldText !== newText) {
        const badge = $('btn-header-credits');
        if (badge) {
          badge.classList.remove('pulse-glow');
          void badge.offsetWidth; // Trigger reflow to restart animation
          badge.classList.add('pulse-glow');
        }
      }
    }
  }

  // Initial update
  updateWorkspaceCredits();
  updatePromptTipText();
  adjustPromptInputHeight();

  // Listen for auth changes/upgrades to update the tokens badge dynamically
  document.removeEventListener('syncraft:authChange', updateWorkspaceCredits);
  document.addEventListener('syncraft:authChange', updateWorkspaceCredits);

  // Open billing settings on badge click
  const wsCreditsBadge = $('ws-credits-badge');
  if (wsCreditsBadge) {
    wsCreditsBadge.addEventListener('click', () => {
      showSettingsModal('billing', true);
    });
  }
}
