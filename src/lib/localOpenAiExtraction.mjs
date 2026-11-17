import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { buildLocalOpenAiGarmentPrompt, LOCAL_OPENAI_GARMENT_PROMPT_VERSION } from './localOpenAiGarmentPrompt.mjs';
import { buildLocalOpenAiLogoPrompt, buildLocalOpenAiUniversalPrompt, LOCAL_OPENAI_EXTRACTION_PROMPT_VERSION } from './localOpenAiExtractionPrompt.mjs';

export const LOCAL_OPENAI_MODELS = Object.freeze(['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare']);
export const LOCAL_OPENAI_SETTINGS = Object.freeze({ quality: 'high', n: 1, output_format: 'png' });
// Match the existing Nano Banana 1K canvas sizes for Syncraft's supported ratios.
// Dimensions are multiples of 16 and satisfy the OpenAI custom-size limits.
const REFERENCE_SIZES = Object.freeze({
  '1:1': '1024x1024', '2:3': '848x1264', '3:2': '1264x848',
  '3:4': '896x1200', '4:3': '1200x896', '4:5': '928x1152',
  '5:4': '1152x928', '9:16': '768x1376', '16:9': '1376x768', '21:9': '1584x672',
});
export function localOpenAiSettings(aspectRatio = '1:1', model = LOCAL_OPENAI_MODELS[0], resolution = '1K') {
  const referenceSize = REFERENCE_SIZES[aspectRatio];
  if (!referenceSize) throw new Error('Unsupported reference aspect ratio for the localhost OpenAI test.');
  if (!['1K', '2K', '4K'].includes(resolution)) throw new Error('Unsupported Vela resolution. Choose 1K, 2K or 4K.');
  let size = referenceSize;
  if (resolution === '2K') size = referenceSize.split('x').map(edge => Number(edge) * 2).join('x');
  if (resolution === '4K') {
    // Vela's 4K tier is up to 8.3 MP, not Nano's approximately 16 MP tier.
    // Preserve the reference ratio; never stretch, pad, or upscale a smaller result.
    const [x, y] = aspectRatio.split(':').map(Number);
    const ratio = x / y;
    const width = Math.sqrt(8_294_400 * ratio);
    const height = Math.sqrt(8_294_400 / ratio);
    const scale = Math.min(1, 3840 / Math.max(width, height));
    size = [width, height].map(edge => Math.floor((edge * scale + 0.000001) / 16) * 16).join('x');
  }
  return { ...LOCAL_OPENAI_SETTINGS, ...(model.startsWith('gpt-image-2.6-') ? { complexity: 'high' } : {}), size };
}

const TEST_DIRECTORY = path.join(process.cwd(), '.codex-work', 'openai-garment-test');
const REPORT_FILE = path.join(TEST_DIRECTORY, 'latest-workspace-usage.json');

export function isLocalOpenAiRequest(request, env = process.env) {
  try {
    const url = new URL(request.url);
    // Production is a separate, explicit opt-in. Preview deployments stay off.
    if (env.NODE_ENV === 'production' && env.VERCEL_ENV === 'production' && env.OPENAI_EXTRACTION_ENABLED === 'true') {
      const site = new URL(env.NEXT_PUBLIC_SITE_URL || 'https://syncraftech.com');
      const hostname = site.hostname.replace(/^www\./, '');
      const productionHosts = new Set([hostname, `www.${hostname}`, env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean));
      const headerHost = request.headers.get('host');
      return url.protocol === 'https:' && productionHosts.has(url.hostname)
        && (!headerHost || productionHosts.has(new URL(`https://${headerHost}`).hostname));
    }
    if (env.NODE_ENV !== 'development' || env.LOCAL_OPENAI_GARMENT_TEST_ENABLED !== 'true') return false;
    const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    const headerHost = request.headers.get('host');
    return hosts.has(url.hostname) && (!headerHost || hosts.has(new URL(`http://${headerHost}`).hostname));
  } catch { return false; }
}

export function shouldUseLocalOpenAi(request, project, env = process.env, requestedProvider = 'nano-banana') {
  return requestedProvider === 'openai' && ['mockup', 'logo', 'universal'].includes(project?.trace_type) && isLocalOpenAiRequest(request, env);
}

// Explicit Vela requests must never silently charge for another provider.
export async function localOpenAiConfig(request, project, requestedProvider, resolution, env = process.env) {
  if (!shouldUseLocalOpenAi(request, project, env, requestedProvider)) {
    throw Object.assign(new Error('Vela is unavailable in this environment. No credits were deducted.'), { code: 'LOCAL_OPENAI_UNAVAILABLE', status: 503 });
  }
  const apiKey = await readLocalOpenAiKey(env);
  if (!apiKey) throw Object.assign(new Error('The server-side OpenAI API key is not configured. No credits were deducted.'), { code: 'LOCAL_OPENAI_KEY_REQUIRED', status: 503 });
  let model;
  try { model = localOpenAiModel(env); }
  catch { throw Object.assign(new Error('The OpenAI model configuration is unavailable. No credits were deducted.'), { code: 'LOCAL_OPENAI_CONFIG_ERROR', status: 503 }); }
  return { apiKey, model, resolution };
}

export function validateLocalOpenAiInput(image, mime) {
  if (!image?.length || image.length > 15 * 1024 * 1024)
    throw Object.assign(new Error('Vela references must be no larger than 15 MB.'), { code: 'VELA_SOURCE_SIZE_INVALID', status: 413 });
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime))
    throw Object.assign(new Error('Vela requires a PNG, JPG or WebP reference.'), { code: 'VELA_SOURCE_TYPE_INVALID', status: 415 });
}

export function localOpenAiUniversalSize({ width, height } = {}, resolution = '1K') {
  const ratio = width / height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || ratio < 1 / 3 || ratio > 3)
    throw Object.assign(new Error('Vela supports crops from 1:3 to 3:1. Choose Lyra for longer strips, or adjust the crop. No credits were deducted.'), { code: 'VELA_CROP_RATIO_UNSUPPORTED', status: 400 });
  const pixels = { '1K': 1_048_576, '2K': 4_194_304, '4K': 8_294_400 }[resolution];
  if (!pixels) throw new Error('Unsupported Vela resolution.');
  const w = Math.sqrt(pixels * ratio), h = Math.sqrt(pixels / ratio);
  const scale = Math.min(1, 3840 / Math.max(w, h));
  let [outputWidth, outputHeight] = [w, h].map(edge => Math.floor((edge * scale + 0.000001) / 16) * 16);
  // Rounding must not push a boundary crop beyond the API's 1:3–3:1 limit.
  outputWidth = Math.min(outputWidth, outputHeight * 3);
  outputHeight = Math.min(outputHeight, outputWidth * 3);
  return `${outputWidth}x${outputHeight}`;
}

// Server environment only. No frontend key entry, secret-saving endpoint or key response.
export async function readLocalOpenAiKey(env = process.env) {
  return env.OPENAI_API_KEY?.trim() || '';
}

export function localOpenAiModel(env = process.env) {
  const model = env.OPENAI_IMAGE_MODEL || env.LOCAL_GARMENT_OPENAI_MODEL || LOCAL_OPENAI_MODELS[0];
  if (!LOCAL_OPENAI_MODELS.includes(model)) throw new Error('The configured OpenAI image model is not supported.');
  return model;
}

export function localOpenAiCost(usage) {
  const text = usage?.input_tokens_details?.text_tokens;
  const image = usage?.input_tokens_details?.image_tokens;
  const output = usage?.output_tokens_details?.image_tokens ?? usage?.output_tokens;
  if (![text, image, output].every(value => Number.isSafeInteger(value) && value >= 0)) return null;
  return (text * 5 + image * 8 + output * 30) / 1_000_000;
}

export async function extractLocalOpenAi({ apiKey, model, image, mime, garmentMode = 'PRESERVE_LOGOS', traceType = 'mockup', recoveryMode, referenceCategory, sourceDimensions, projectId, aspectRatio = '1:1', resolution = '1K', fetchImpl = fetch, saveReport = process.env.NODE_ENV === 'development' }) {
  if (!apiKey) throw new Error('The server-side OPENAI_API_KEY is not configured for this local test.');
  if (!LOCAL_OPENAI_MODELS.includes(model)) throw new Error('Unsupported localhost OpenAI model.');
  validateLocalOpenAiInput(image, mime);
  if (!['mockup', 'logo', 'universal'].includes(traceType)) throw new Error('Unsupported Vela extraction feature.');
  const settings = localOpenAiSettings(traceType === 'universal' ? '1:1' : aspectRatio, model, resolution);
  if (traceType === 'universal') settings.size = localOpenAiUniversalSize(sourceDimensions, resolution);
  const prompt = traceType === 'logo' ? buildLocalOpenAiLogoPrompt({ size: settings.size })
    : traceType === 'universal' ? buildLocalOpenAiUniversalPrompt({ size: settings.size, mode: recoveryMode, referenceCategory })
    : buildLocalOpenAiGarmentPrompt({ garmentMode, size: settings.size });
  const form = new FormData();
  for (const [key, value] of Object.entries(settings)) form.set(key, String(value));
  form.set('model', model);
  form.set('prompt', prompt);
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime];
  form.set('image[]', new Blob([image], { type: mime }), `reference.${extension}`);
  const started = Date.now();
  let response;
  try {
    // One paid edit, using the actual extraction prompt. No retries or Nano Banana fallback.
    response = await fetchImpl('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
      signal: AbortSignal.timeout(240_000), redirect: 'error',
    });
  } catch {
    throw new Error('The localhost OpenAI request was interrupted. Check OpenAI Usage before retrying; no automatic retry was made.');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('OpenAI returned an unreadable response. Check OpenAI Usage before retrying.'); }
  if (!response.ok) {
    const message = {
      400: 'OpenAI rejected this image or model settings.',
      401: 'OpenAI rejected the configured API key. Connect a key from your credited organization.',
      403: 'The OpenAI project does not have image model access. Check its permissions and organization verification.',
      404: 'The selected OpenAI image model is unavailable to this API project.',
      429: 'OpenAI reported a credit or rate limit. Check the organization where you claimed the API credits.',
    }[response.status] || `OpenAI image edit failed (HTTP ${response.status}).`;
    throw Object.assign(new Error(`${message} No fallback generation was made.`), { code: 'LOCAL_OPENAI_FAILED' });
  }
  const encoded = data?.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded || encoded.length > 100 * 1024 * 1024) throw new Error('OpenAI did not return a usable image. Check its Usage page before retrying.');
  const report = { provider: 'openai', model, settings,
    aspectRatio: traceType === 'universal' ? `${sourceDimensions.width}:${sourceDimensions.height}` : aspectRatio, resolution, projectId,
    traceType, garmentMode: traceType === 'mockup' ? garmentMode : undefined,
    ...(traceType === 'universal' ? { recoveryMode, referenceCategory } : {}),
    promptVersion: traceType === 'mockup' ? LOCAL_OPENAI_GARMENT_PROMPT_VERSION : LOCAL_OPENAI_EXTRACTION_PROMPT_VERSION,
    requestId: response.headers.get('x-request-id'), usage: data.usage || null,
    estimatedCostUsd: localOpenAiCost(data.usage), elapsedMs: Date.now() - started,
    createdAt: new Date().toISOString(), note: 'Cost estimated from API-reported tokens at Standard rates; verify final billing in OpenAI Usage.' };
  if (saveReport) {
    try {
      const privateReport = { ...report, diagnostics: {
        prompt, inputImageSha256: createHash('sha256').update(image).digest('hex'),
        inputDimensions: sourceDimensions || null,
        promptSha256: createHash('sha256').update(prompt).digest('hex'),
        complexity: settings.complexity || 'provider-default',
      } };
      const serialized = JSON.stringify(privateReport, null, 2);
      await mkdir(TEST_DIRECTORY, { recursive: true });
      await writeFile(path.join(TEST_DIRECTORY, 'usage-' + randomUUID() + '.json'), serialized);
      await writeFile(REPORT_FILE, serialized);
    }
    catch { console.warn('[Local OpenAI] Could not save the local usage report.'); }
  }
  return { buffer: Buffer.from(encoded, 'base64'), report };
}
