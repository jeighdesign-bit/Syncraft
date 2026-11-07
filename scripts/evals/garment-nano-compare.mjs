import fs from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import sharp from 'sharp';
import { fal } from '@fal-ai/client';
import { buildGarmentExtractionPrompt, buildGarmentExtractionSystemPrompt, GARMENT_PROMPT_VERSION } from '../../src/lib/garmentPromptRules.mjs';
import { buildGarmentExtractionInput, garmentExtractionMode } from '../../src/lib/garmentExtractionConfig.mjs';
import { snapToAllowedAspectRatio } from '../../src/lib/aspectRatio.js';

nextEnv.loadEnvConfig(process.cwd());
const sourcePath = process.argv[2];
const outputDir = path.resolve(process.argv[3]);
if (!sourcePath || !process.env.FAL_KEY) throw new Error('Source and configured fal access required.');
await fs.mkdir(outputDir, { recursive: true });
const source = await fs.readFile(sourcePath);
const metadata = await sharp(source).metadata();
const imageUrl = await fal.storage.upload(new File([source], 'garment-reference.png', { type: 'image/png' }));
const input = buildGarmentExtractionInput({
  imageUrl,
  prompt: buildGarmentExtractionPrompt('ERASE_LOGOS'),
  aspectRatio: snapToAllowedAspectRatio(metadata.width, metadata.height),
  mode: garmentExtractionMode(),
});
input.system_prompt = buildGarmentExtractionSystemPrompt();
await fs.writeFile(path.join(outputDir, 'input.json'), JSON.stringify({
  feature: 'Garment Extract / Extract Pattern Only', stage: 'extraction only',
  promptVersion: GARMENT_PROMPT_VERSION, qualityMode: garmentExtractionMode(),
  sourcePath, input,
}, null, 2));
console.log(JSON.stringify({ qualityMode: garmentExtractionMode(), aspectRatio: input.aspect_ratio, resolution: input.resolution || 'provider-default' }));
const results = await Promise.allSettled([
  ['nano-banana-2.1', 'google/nano-banana-2.1/edit'],
  ['nano-banana-2', 'fal-ai/nano-banana-2/edit'],
].map(async ([name, endpoint]) => {
  const started = Date.now();
  const receipt = { name, endpoint, status: 'submitting' };
  const save = () => fs.writeFile(path.join(outputDir, name + '.json'), JSON.stringify(receipt, null, 2));
  await save();
  try {
    const result = await fal.subscribe(endpoint, { input, logs: false,
      onEnqueue: async requestId => { receipt.requestId = requestId; receipt.status = 'queued'; await save(); console.log(name + ': queued'); },
    });
    receipt.requestId = result.requestId;
    receipt.generationSeconds = (Date.now() - started) / 1000;
    receipt.data = result.data;
    await save();
    const url = result.data?.images?.[0]?.url;
    if (!url) throw new Error('No image returned');
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('Output download failed: ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    const info = await sharp(bytes).metadata();
    await fs.writeFile(path.join(outputDir, name + '.png'), bytes);
    receipt.dimensions = { width: info.width, height: info.height };
    receipt.status = 'completed';
    await save();
    console.log(JSON.stringify({ name, status: receipt.status, seconds: receipt.generationSeconds, dimensions: receipt.dimensions }));
  } catch (error) {
    receipt.status = 'failed'; receipt.error = error.message; receipt.detail = error.body?.detail;
    await save(); console.log(JSON.stringify({ name, status: receipt.status, error: receipt.error, detail: receipt.detail }));
  }
}));
for (const result of results) if (result.status === 'rejected') console.error(result.reason?.message);
