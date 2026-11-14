import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { fal } from '@fal-ai/client';
import { ARTWORK_GENERATION_MODEL } from '../../src/lib/falArtworkGeneration.mjs';

// Development evaluation only: no customer project writes or credit calls.
// Retain the exact source bytes and original settings unless explicitly labeled.
const args = process.argv.slice(2);
const option = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const requestFile = option('--request');
const referenceFile = option('--reference');
const outputDir = option('--out');
if (!requestFile || !referenceFile || !outputDir) throw new Error('Use --request HISTORY.json --reference IMAGE --out DIR [--candidate MODULE] [--repeat 2] [--control] [--resolution 2K] [--generate]');
const repeat = Number(option('--repeat', '1'));
if (![1, 2].includes(repeat)) throw new Error('Repeat must be 1 or 2.');
const resolution = option('--resolution');
if (resolution && !['1K', '2K', '4K'].includes(resolution)) throw new Error('Invalid resolution');
const candidate = await import(pathToFileURL(path.resolve(option('--candidate', 'scripts/evals/experiments/garmentArtworkRestoration.mjs'))));
const history = JSON.parse(await fs.readFile(requestFile));
const request = history.items?.[0] || history;
if (request.endpoint_id !== ARTWORK_GENERATION_MODEL || request.json_input?.image_urls?.length !== 1) throw new Error('Expected a single-reference Nano Banana 2.1 edit request.');
const mode = option('--mode', request.json_input.prompt.includes('MODE: EXTRACT PATTERN ONLY') ? 'ERASE_LOGOS' : 'PRESERVE_LOGOS');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const reference = await fs.readFile(referenceFile);
const sourceSha256 = hash(reference);
const common = { ...request.json_input, ...(resolution ? { resolution } : {}) };
const jobs = [];
if (args.includes('--control')) jobs.push({ arm: 'v6-control', input: common });
for (let i = 1; i <= repeat; i++) jobs.push({ arm: `${candidate.GARMENT_PROMPT_VERSION}-${i}`, input: {
  ...common, prompt: candidate.buildGarmentExtractionPrompt(mode), system_prompt: candidate.buildGarmentExtractionSystemPrompt(),
} });
await fs.mkdir(outputDir, { recursive: true });
const plan = { endpoint: ARTWORK_GENERATION_MODEL, sourceRequestId: request.request_id, sourceSha256, mode,
  resolution: common.resolution || 'provider-default-1K', settingsChange: resolution ? `resolution explicitly set to ${resolution}` : 'Only prompt and system instruction change', jobs };
const planPath = path.join(outputDir, 'plan-private.json');
try {
  if (hash(await fs.readFile(planPath)) !== hash(JSON.stringify(plan, null, 2))) throw new Error('Output folder has a different plan; use another folder.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ action: args.includes('--generate') ? 'generate' : 'plan', arms: jobs.map(j => j.arm), mode, resolution: plan.resolution, sourceSha256 }));
if (!args.includes('--generate')) process.exit(0);
const env = dotenv.parse(await fs.readFile('.env'));
fal.config({ credentials: process.env.FAL_KEY || env.FAL_KEY });
const sourceResponse = await fetch(common.image_urls[0], { signal: AbortSignal.timeout(60000) });
if (!sourceResponse.ok || hash(Buffer.from(await sourceResponse.arrayBuffer())) !== sourceSha256) throw new Error('Submitted reference differs from the frozen source.');
await fs.writeFile(path.join(outputDir, 'reference.jpg'), reference);

async function run(job) {
  const folder = path.join(outputDir, job.arm);
  await fs.mkdir(folder, { recursive: true });
  const receiptPath = path.join(folder, 'receipt-private.json');
  let receipt;
  try { receipt = JSON.parse(await fs.readFile(receiptPath)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const fingerprint = hash(JSON.stringify(job.input));
  if (receipt && receipt.fingerprint !== fingerprint) throw new Error('Receipt input mismatch');
  if (receipt?.status === 'completed') { console.log(`${job.arm}: reused`); return; }
  if (receipt?.status === 'submitting' && !receipt.requestId) throw new Error('Submission outcome unknown; reconcile provider history before another submission.');
  receipt ||= { endpoint: ARTWORK_GENERATION_MODEL, input: job.input, sourceSha256, fingerprint, status: 'prepared' };
  const save = () => fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  try {
    if (!receipt.requestId) {
      receipt.status = 'submitting';
      await save();
      const result = await fal.queue.submit(ARTWORK_GENERATION_MODEL, { input: job.input });
      receipt.requestId = result.request_id;
      receipt.status = 'queued';
      await save();
      console.log(`${job.arm}: queued ${receipt.requestId}`);
    }
    if (!receipt.data) {
      const deadline = Date.now() + 600000;
      while (true) {
        const status = await fal.queue.status(ARTWORK_GENERATION_MODEL, { requestId: receipt.requestId, logs: false });
        if (status.status === 'COMPLETED') break;
        if (Date.now() > deadline) throw new Error('Queue wait expired; resume this same receipt.');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      receipt.data = (await fal.queue.result(ARTWORK_GENERATION_MODEL, { requestId: receipt.requestId })).data;
      receipt.status = 'provider_succeeded';
      await save();
    }
    const url = receipt.data?.images?.[0]?.url;
    if (!url) throw new Error('Provider returned no image');
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const info = await sharp(bytes).metadata();
    await fs.writeFile(path.join(folder, 'output.png'), bytes);
    receipt.output = { width: info.width, height: info.height, sha256: hash(bytes) };
    receipt.status = 'completed';
    await save();
    console.log(`${job.arm}: completed ${info.width}x${info.height}`);
  } catch (error) { receipt.error = error.message; await save(); throw error; }
}
for (let start = 0; start < jobs.length; start += 2) {
  const results = await Promise.allSettled(jobs.slice(start, start + 2).map(run));
  const errors = results.filter(result => result.status === 'rejected');
  if (errors.length) throw new AggregateError(errors.map(result => result.reason), 'Evaluation incomplete; resume saved requests.');
}
