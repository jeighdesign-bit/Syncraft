// node scripts/evals/universal-recovery-live.mjs manifest.json [--generate]
// Manifest: [{ id, category, source, baseline? }]. Uses real Fal credits.
import fs from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { canUsePlanarRecovery, rectifyPrintPlane } from '../../src/lib/recoveryPlanar.mjs';
import { checkRecoveryCandidate } from '../../src/lib/recoveryCandidate.mjs';
import { fal } from '@fal-ai/client';
import { inspectRecoveryImages, surfaceAnalysisPrompt, visualRecoveryPrompt,
  normalizeVisualValidation, buildRecoveryImageInput, RECOVERY_IMAGE_ENDPOINT } from '../../src/lib/recoveryVision.mjs';
import { recoveryVisionImage } from '../../src/lib/recoveryVisionImage.mjs';

nextEnv.loadEnvConfig(process.cwd());
const manifest = process.argv[2];
if (!manifest) throw new Error('Provide a manifest path. Add --generate to test new image generation.');
const cases = JSON.parse(await fs.readFile(manifest, 'utf8'));
if (!Array.isArray(cases) || cases.length > 8) throw new Error('Use at most eight cases per explicit run.');
const folder = path.resolve('outputs', `universal-live-${Date.now()}-${process.pid}`);
await fs.mkdir(folder, { recursive: true });
const results = [];
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Reference unavailable or not an image');
  return Buffer.from(await response.arrayBuffer());
}
for (const [i, input] of cases.entries()) {
  const result = { id: input.id || String(i), category: input.category || 'unclassified', receipts: [] };
  results.push(result);
  const checkpoint = async () => fs.writeFile(path.join(folder, 'results.json'), JSON.stringify(results, null, 2));
  const options = { onUsage: async receipt => { result.receipts.push(receipt); await checkpoint(); } };
  try {
    const source = await download(input.source);
    const preview = await recoveryVisionImage(source);
    result.analysis = input.analysis || await inspectRecoveryImages([preview], surfaceAnalysisPrompt(), options);
    const meta = await (await import('sharp')).default(source).metadata();
    result.analysis.source_width = meta.width; result.analysis.source_height = meta.height;
    await checkpoint();
    const mode = input.mode || 'UNIVERSAL_KEEP_ARTWORK';
    const validate = async url => normalizeVisualValidation(await inspectRecoveryImages(
      [preview, await recoveryVisionImage(await download(url))], visualRecoveryPrompt(result.analysis, mode), options));
    if (input.baseline) result.baselineValidation = await validate(input.baseline);
    if (input.candidate || (process.argv.includes('--generate') && result.analysis.state !== 'insufficient')) {
      let outputBuffer;
      if (input.candidate) { outputBuffer = await fs.readFile(input.candidate); } else if (canUsePlanarRecovery(result.analysis, mode)) {
        outputBuffer = await rectifyPrintPlane(source, result.analysis.print_quad); result.extractionMethod = 'planar_pixels';
      } else {
      const hostedSource = await fal.storage.upload(new File([source], 'reference.png', { type: 'image/png' }));
      const generated = await fal.subscribe(RECOVERY_IMAGE_ENDPOINT, {
        onEnqueue: async id => { result.requestId = id; await checkpoint(); },
        input: buildRecoveryImageInput({ imageUrls: [hostedSource], analysis: result.analysis, mode }), logs: false,
      });
      result.requestId = generated.requestId;
      const image = generated.data.images?.[0]?.url;
      if (!image) throw new Error('Generation returned no image');
      outputBuffer = await download(image);
      }
      await fs.writeFile(path.join(folder, `${i}-output.png`), outputBuffer);
      await checkpoint();
      const checked = await checkRecoveryCandidate({ sourceBuffer: source, outputBuffer, analysis: result.analysis, mode, onUsage: options.onUsage });
      result.validation = checked.validation; result.cropApplied = checked.cropped;
      if (checked.cropped) await fs.writeFile(path.join(folder, `${i}-cropped.png`), checked.buffer);
    }
  } catch (error) { result.error = error.message || JSON.stringify(error.body?.detail || error.body || { name: error.name }); }
  await fs.writeFile(path.join(folder, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ id: result.id, category: result.category, baseline: result.baselineValidation?.pass,
    output: result.validation?.pass, failures: result.validation?.failures, error: result.error }));
}
console.log(`Evidence: ${folder}`);
