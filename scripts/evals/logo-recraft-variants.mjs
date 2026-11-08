// Explicit standalone comparison. Three paid images total; never changes live
// model routing, credit pricing, saved jobs or the account's Syncraft credits.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import sharp from 'sharp';
import { validateLogoOperation } from '../../src/lib/logoStudio.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../../src/lib/logoPromptCompiler.mjs';
import { recraftLogoPlan } from '../../src/lib/logoRecraft.mjs';

const folder = resolve('outputs/logo-recraft-variants'); mkdirSync(folder, { recursive: true });
const manifestPath = resolve(folder, 'manifest.json');
const input = validateLogoOperation({ requestId: '15d1800b-ea20-4d8f-8995-0d46ad1dcd13', mode: 'text', operation: 'generate',
  style: 'mascot', prompt: 'A watchful lynx', brand: 'PINEWATCH', tagline: '', palette: [],
  designSettings: { primaryColor: '#183D35', secondaryColor: '#CA9C50', backgroundColor: '#FFFFFF' },
  generationOptions: { conceptMode: 'faithful', seed: 27641 } });
const brief = normalizeLogoBrief(input);
const compiledPrompt = compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0]);
const commonBody = { ...recraftLogoPlan({ ...input, compiledPrompt, seed: 27641 }).body, size: '1:1' };
delete commonBody.model;
const sha = value => createHash('sha256').update(value).digest('hex');
const protectedPaths = ['src/lib/logoRecraft.mjs', 'src/lib/logoModelRouting.mjs', 'src/lib/logoStudio.mjs', 'src/lib/pricing.js'];
const sourceHashes = () => Object.fromEntries(protectedPaths.map(path => [path, sha(readFileSync(path))]));
const state = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {
  createdAt: new Date().toISOString(), providerBudgetUsd: .325, input, commonBody, promptSha256: sha(compiledPrompt),
  protectedSourceHashes: sourceHashes(),
  samples: [
    { key: 'regular', label: 'Regular V4.1', model: 'recraftv4_1', expectedCostUsd: .035, format: 'png' },
    { key: 'pro', label: 'V4.1 Pro', model: 'recraftv4_1_pro', expectedCostUsd: .21, format: 'png' },
    { key: 'vector', label: 'V4.1 Vector', model: 'recraftv4_1_vector', expectedCostUsd: .08, format: 'svg' },
  ].map(sample => ({ ...sample, requestId: randomUUID(), status: 'not-started' })),
};
const save = () => writeFileSync(manifestPath, JSON.stringify(state, null, 2));
if (JSON.stringify(state.commonBody) !== JSON.stringify(commonBody)) throw new Error('Comparison instructions changed; preserve the original experiment.');
save();
if (!process.argv.includes('--run-paid')) { console.log(JSON.stringify({ outputs: 3, providerBudgetUsd: .325, promptSha256: state.promptSha256, settings: input.designSettings, seed: commonBody.random_seed, models: state.samples.map(sample => sample.model), callsStarted: 0 })); process.exit(0); }

config({ path: '.env.local', quiet: true }); config({ path: '.env', quiet: true });
const token = process.env.RECRAFT_API_TOKEN || process.env.RECRAFT_API_KEY;
if (!token) throw new Error('Recraft credentials are unavailable.');
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes('/node_modules/')) return next(specifier, context);
  let target = specifier.startsWith('@/') ? pathToFileURL(resolve('src', specifier.slice(2))).href : specifier;
  if (target.startsWith('file:') || target.startsWith('.')) {
    const url = new URL(target, context.parentURL);
    if (!/\.[a-z]+$/i.test(url.pathname) && existsSync(new URL(url.href + '.js'))) target = url.href + '.js';
  }
  return next(target, context);
} });
const { adminSupabase: db } = await import('../../src/lib/supabase.js');
const { recordProviderUsage } = await import('../../src/lib/creditLedger.js');
const { validateLogoSvg } = await import('../../src/lib/logoRecraftServer.js');
const ownerProjectId = '4dd67dc9-f154-407a-867f-5d72c83417c3';
const { data: owner, error: ownerError } = await db.from('projects').select('user_id,canvas_data').eq('id', ownerProjectId).single();
if (ownerError || owner?.canvas_data?.tool !== 'logo_studio') throw new Error('Could not verify the comparison owner.');
const balance = async () => { const { data, error } = await db.from('profiles').select('credits').eq('id', owner.user_id).single(); if (error) throw error; return data.credits; };
state.creditsBefore ??= await balance(); save();

for (const sample of state.samples) {
  // An explicit format-validation rejection returned no image. This narrow
  // manual recovery never repeats a successful or ambiguously timed-out POST.
  if (process.argv.includes('--retry-format-rejection') && sample.format === 'svg' && !sample.outputUrl
    && sample.status === 'failed-or-unknown' && sample.error === "Recraft 400: Vector styles don't support image format 'png'") {
    sample.rejectedAttempts = [...(sample.rejectedAttempts || []), { startedAt: sample.startedAt, error: sample.error }];
    sample.status = 'not-started'; delete sample.error; save();
  }
  if (!sample.outputUrl) {
    if (sample.status !== 'not-started') throw new Error(`${sample.label} was already submitted or failed. Paid POSTs are never automatically repeated.`);
    sample.status = 'submitting'; sample.startedAt = new Date().toISOString(); save();
    const started = Date.now(); let response;
    try {
      const body = { ...state.commonBody, model: sample.model };
      if (sample.format === 'svg') delete body.image_format;
      response = await fetch('https://external.api.recraft.ai/v1/images/generations', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(105_000),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(`Recraft ${response.status}: ${String(payload.message || payload.error || 'Generation declined').slice(0, 300)}`);
      const image = payload.data?.[0];
      if (!image?.url?.startsWith('https://')) throw new Error('Provider did not return a downloadable image.');
      Object.assign(sample, { status: 'generated', outputUrl: image.url, imageId: image.image_id,
        providerRequestId: response.headers.get('x-request-id') || payload.id || image.image_id,
        reportedCredits: payload.credits, costUsd: Number.isFinite(payload.credits) ? payload.credits / 1000 : null,
        elapsedMs: Date.now() - started }); save();
    } catch (error) {
      sample.status = 'failed-or-unknown'; sample.error = error.message; save();
      await recordProviderUsage({ userId: owner.user_id, projectId: ownerProjectId, provider: 'recraft', endpoint: 'images/generations', requestStatus: 'failed', estimatedCostUsd: null,
        metadata: { feature: 'logo_recraft_variant_comparison', model: sample.model, comparisonRequestId: sample.requestId, imageCalls: 1 } });
      throw error;
    }
  }
  if (!sample.usageLogged) {
    sample.usageLogged = await recordProviderUsage({ userId: owner.user_id, projectId: ownerProjectId, provider: 'recraft', endpoint: 'images/generations',
      providerRequestId: sample.providerRequestId, requestStatus: 'succeeded', estimatedCostUsd: sample.costUsd,
      metadata: { feature: 'logo_recraft_variant_comparison', model: sample.model, comparisonRequestId: sample.requestId,
        promptSha256: state.promptSha256, seed: 27641, imageCalls: 1, standaloneComparison: true, elapsedMs: sample.elapsedMs } }); save();
  }
  const nativePath = resolve(folder, `${sample.key}.${sample.format}`);
  if (!existsSync(nativePath)) {
    const response = await fetch(sample.outputUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('Output download failed. Rerun to download the saved result without generating again.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (sample.format === 'svg') validateLogoSvg(buffer);
    writeFileSync(nativePath, buffer);
  }
  const metadata = await sharp(nativePath).metadata();
  Object.assign(sample, { nativeFile: nativePath, nativeWidth: metadata.width, nativeHeight: metadata.height });
  // Equal-size previews change only display scale; originals remain untouched.
  const previewPath = resolve(folder, `${sample.key}-preview.png`);
  await sharp(nativePath, { density: 144 }).resize(1024, 1024, { fit: 'contain', background: '#FFFFFF' }).flatten({ background: '#FFFFFF' }).png().toFile(previewPath);
  Object.assign(sample, { previewFile: previewPath, status: 'succeeded' }); save();
  console.log(JSON.stringify({ sample: sample.label, model: sample.model, dimensions: `${sample.nativeWidth}x${sample.nativeHeight}`, format: sample.format, costUsd: sample.costUsd, elapsedMs: sample.elapsedMs }));
}
state.creditsAfter = await balance();
state.protectedSourceHashesAfter = sourceHashes();
state.modelAndPricingUnchanged = JSON.stringify(state.protectedSourceHashes) === JSON.stringify(state.protectedSourceHashesAfter);
state.totalProviderCostUsd = state.samples.reduce((sum, sample) => sum + (sample.costUsd ?? sample.expectedCostUsd), 0);
save();
if (!state.modelAndPricingUnchanged || state.creditsAfter !== state.creditsBefore) throw new Error('Live configuration or account credits changed during the comparison; review before attributing a cause.');
console.log(JSON.stringify({ completed: state.samples.length, totalProviderCostUsd: state.totalProviderCostUsd, syncraftCredits: state.creditsAfter, modelAndPricingUnchanged: state.modelAndPricingUnchanged }));
