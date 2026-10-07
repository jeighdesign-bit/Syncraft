import { NextResponse } from "next/server";
import { buildGarmentExtractionPrompt, buildGarmentExtractionSystemPrompt } from "@/lib/garmentPromptRules.mjs";
import { buildGarmentExtractionInput } from "@/lib/garmentExtractionConfig.mjs";
import { validateApiKey } from "@/services/b2b/authService";
import { checkBalance, deductAndLog } from "@/services/b2b/billingService";
import { fetchWithRetry } from "@/lib/fetchWithRetry";
import { fetchWithSSRFProtection, getAllowedProviderHosts, DEFAULT_MAX_UPSCALED_IMAGE_BYTES } from "@/lib/ssrf";

export const runtime = 'nodejs';
export const maxDuration = 120;

// ==========================================
// PROMPTS
// ==========================================
const PROMPTS = {
  extract_pattern: buildGarmentExtractionPrompt("ERASE_LOGOS"),
  keep_artwork: buildGarmentExtractionPrompt("PRESERVE_LOGOS"),

  logo_trace: `You are a FORENSIC LOGO REPRODUCTION ARTIST. Your task is to create a 100% pixel-accurate, flat vector-ready copy of the logo in this reference image. You are NOT allowed to be creative. You are NOT allowed to simplify, stylize, or interpret. Copy it EXACTLY.

== ACCURACY IS THE ONLY RULE (TARGET: 99%+ MATCH) ==
- Reproduce the logo with MATHEMATICAL EXACTNESS. Every shape, curve, angle, and proportion must be a perfect copy of the reference.
- Every color must be the EXACT same solid flat color as the reference.
- ZERO HALLUCINATION: Do not add any element that does not exist in the reference. Do not remove any element that does exist.`
};

export async function POST(request) {
  let authResult;
  let B2B_CREDIT_COST = 40;
  let B2B_RAW_COST_USD = 0.164;
  let mode = 'keep_artwork';

  try {
    // 1. Authenticate API Key
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    authResult = await validateApiKey(token);

    if (!authResult.isValid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { company, wallet, apiKeyId } = authResult;

    // 2. Parse Request
    const body = await request.json();
    const { image_url } = body;
    mode = body.mode || 'keep_artwork'; // Default mode

    if (!image_url) {
      return NextResponse.json({ error: "Missing required field: image_url" }, { status: 400 });
    }

    // Set Dynamic Pricing
    if (mode === 'bg_remover') {
      B2B_CREDIT_COST = 5;
      B2B_RAW_COST_USD = 0.002;
    } else {
      B2B_CREDIT_COST = 40;
      B2B_RAW_COST_USD = 0.164;
    }

    // 3. Check Billing Balance
    const balanceResult = await checkBalance(wallet, B2B_CREDIT_COST);
    if (!balanceResult.hasBalance) {
      await deductAndLog(company.id, apiKeyId, 0, 0, `v1/generate[${mode}]`, false, balanceResult.error);
      return NextResponse.json({ error: balanceResult.error }, { status: 402 }); 
    }

    // 4. Initialize AI Clients
    if (!process.env.FAL_KEY) throw new Error("FAL_KEY is missing.");
    const { fal } = await import("@fal-ai/client");

    let finalImageUrl = "";

    // ==========================================
    // PIPELINE 1: BACKGROUND REMOVER (Fast & Cheap)
    // ==========================================
    if (mode === 'bg_remover') {
      console.log(`[B2B - ${company.name}] Starting BiRefNet (Background Remover)...`);
      const bgResult = await fal.subscribe("fal-ai/birefnet", {
        input: { image_url: image_url }
      });
      finalImageUrl = bgResult?.data?.image?.url;
      if (!finalImageUrl) throw new Error("BiRefNet failed to return an image.");
    } 
    // ==========================================
    // PIPELINE 2: VECTOR TRACING (Nano Banana -> ESRGAN -> Recraft Vectorize)
    // ==========================================
    else {
      const finalPrompt = PROMPTS[mode] || PROMPTS['keep_artwork'];
      const sharp = (await import('sharp')).default;
      const extractionInput = buildGarmentExtractionInput({
        imageUrl: image_url,
        prompt: finalPrompt,
        aspectRatio: "auto",
        mode: "legacy",
      });
      if (mode !== 'logo_trace') extractionInput.system_prompt = buildGarmentExtractionSystemPrompt();

      console.log(`[B2B - ${company.name}] Starting Nano Banana Pro [${mode}]...`);
      const nanoResult = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
        input: extractionInput,
      });
      const extractedUrl = nanoResult?.data?.images?.[0]?.url;
      if (!extractedUrl) throw new Error("Nano Banana Pro failed to return an image.");

      const { fal } = await import("@fal-ai/client");
      const recraftApiToken = process.env.RECRAFT_API_TOKEN || process.env.RECRAFT_API_KEY;
      if (!recraftApiToken) throw new Error("RECRAFT_API_TOKEN is missing.");

      console.log(`[B2B - ${company.name}] Starting ESRGAN Upscale...`);
      const esrganResult = await fal.subscribe("fal-ai/esrgan", {
        input: { image_url: extractedUrl, scale: 4 },
      });
      const upscaledUrl = esrganResult?.data?.image?.url || esrganResult?.data?.image_url;
      if (!upscaledUrl) throw new Error("ESRGAN failed to return an image.");

      console.log(`[B2B - ${company.name}] Downloading ESRGAN output for vectorization...`);
      const { response: imgRes, buffer: imgBuffer } = await fetchWithSSRFProtection(upscaledUrl, {
        allowedHosts: getAllowedProviderHosts(),
        maxBytes: DEFAULT_MAX_UPSCALED_IMAGE_BYTES,
        allowedContentTypes: ['image/'],
      });
      if (!imgRes.ok) throw new Error("Failed to download upscaled image.");

      const compressedBuffer = await sharp(imgBuffer)
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .png({ effort: 1 })
        .toBuffer();

      const blob = new Blob([compressedBuffer], { type: 'image/png' });
      const vectorizeFormData = new FormData();
      vectorizeFormData.append('image', blob, 'image.png');

      console.log(`[B2B - ${company.name}] Starting Recraft Vectorize...`);
      const recraftVectorRes = await fetchWithRetry("https://external.api.recraft.ai/v1/images/vectorize", {
        method: "POST",
        headers: { "Authorization": `Bearer ${recraftApiToken}` },
        body: vectorizeFormData,
        signal: AbortSignal.timeout(110000),
      });

      if (!recraftVectorRes.ok) {
        const errText = await recraftVectorRes.text();
        throw new Error(`Recraft Vectorization failed: ${errText}`);
      }

      const vectorData = await recraftVectorRes.json();
      finalImageUrl = vectorData.image.url;
    }

    // ==========================================
    // SUCCESS: Deduct Credits & Return Payload
    // ==========================================
    console.log(`[B2B - ${company.name}] Generation complete. Deducting ${B2B_CREDIT_COST} credits...`);
    await deductAndLog(company.id, apiKeyId, B2B_CREDIT_COST, B2B_RAW_COST_USD, `v1/generate[${mode}]`, true);

    return NextResponse.json({
      success: true,
      company: company.name,
      mode: mode,
      credits_charged: B2B_CREDIT_COST,
      image_url: finalImageUrl,
      type: mode === 'bg_remover' ? 'image/png' : 'image/svg+xml'
    });

  } catch (error) {
    const errorMsg = error.message || (error.body ? JSON.stringify(error.body) : JSON.stringify(error)) || "Unknown Error";
    console.error("[B2B API Error]:", errorMsg);
    
    if (authResult?.isValid) {
      await deductAndLog(
        authResult.company.id, 
        authResult.apiKeyId, 
        0, 
        B2B_RAW_COST_USD, 
        `v1/generate[${mode}]`, 
        false, 
        errorMsg
      );
    }

    return NextResponse.json({ error: "Pipeline Error: " + errorMsg }, { status: 500 });
  }
}
