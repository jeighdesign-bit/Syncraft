import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { fal } from '@fal-ai/client';
import { ARTWORK_GENERATION_MODEL } from '../../src/lib/falArtworkGeneration.mjs';
import {
  GARMENT_PROMPT_VERSION,
  buildGarmentExtractionPrompt,
  buildGarmentExtractionSystemPrompt,
} from './experiments/garmentPromptCandidate.mjs';

// Read-only planning is the default. --generate explicitly submits paid Fal
// requests; it never calls the customer project or credit APIs.
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
if (!args[0] || !args[1] || !args.includes('--cases')) {
  throw new Error('Usage: node scripts/evals/garment-prompt-compare.mjs AUDIT_DIR OUTPUT_DIR --cases 06,07 [--control 06] [--generate]');
}
const auditDir = path.resolve(args[0]);
const outputDir = path.resolve(args[1]);
if (outputDir === auditDir) throw new Error('Keep the frozen audit and new evaluation in separate directories.');
const ids = value('--cases').split(',');
const controls = args.includes('--control') ? value('--control').split(',') : [];
const thinking = args.includes('--thinking') ? value('--thinking') : null;
if (thinking && !['minimal', 'medium', 'high'].includes(thinking)) throw new Error('Invalid thinking level.');
if ([...ids, ...controls].some(id => !/^\d{2}$/.test(id))) throw new Error('Use two-digit audit case IDs.');
const generate = args.includes('--generate');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(outputDir, { recursive: true });
const jobs = [];
for (const id of [...new Set([...ids, ...controls])]) {
  const record = JSON.parse(await fs.readFile(path.join(auditDir, 'cases', id, 'record-private.json')));
  if (record.endpoint !== ARTWORK_GENERATION_MODEL || record.input?.image_urls?.length !== 1) {
    throw new Error(`Case ${id} is not a single-reference request for the expected endpoint.`);
  }
  const source = await fs.readFile(path.join(auditDir, 'cases', id, 'reference.image'));
  if (sha(source) !== record.source.sha256) throw new Error(`Frozen source changed for case ${id}.`);
  const add = (arm, input) => jobs.push({ id, arm, input, sourceSha256: record.source.sha256, baselineRequestId: record.requestId });
  const baselineVersion = record.input.prompt?.match(/reconstruction-(v\d+)/)?.[1];
  if (controls.includes(id)) {
    if (!baselineVersion) throw new Error(`Case ${id} has no identifiable baseline prompt version.`);
    add(`control-${baselineVersion}`, record.input);
  }
  if (ids.includes(id)) add(`${GARMENT_PROMPT_VERSION}${thinking ? `-thinking-${thinking}` : ''}`, {
    ...record.input,
    prompt: buildGarmentExtractionPrompt(record.mode),
    system_prompt: buildGarmentExtractionSystemPrompt(),
    ...(thinking ? { thinking_level: thinking } : {}),
  });
}
const plan = {
  endpoint: ARTWORK_GENERATION_MODEL,
  candidateVersion: GARMENT_PROMPT_VERSION,
  source: `Frozen actual customer requests; no crop or resolution changes.${thinking ? ` Candidate thinking_level=${thinking}; all other settings retained.` : ' All other model settings retained.'}`,
  jobs,
};
await fs.writeFile(path.join(outputDir, 'plan-private.json'), JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ action: generate ? 'generate' : 'plan-only', jobs: jobs.map(j => `${j.id}/${j.arm}`), endpoint: plan.endpoint }));
if (!generate) process.exit(0);

let key = process.env.FAL_KEY;
if (!key) key = dotenv.parse(await fs.readFile(path.join(process.cwd(), '.env'))).FAL_KEY;
if (!key) throw new Error('Configured Fal access is required.');
fal.config({ credentials: key });

async function run(job) {
  const folder = path.join(outputDir, job.id, job.arm);
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, 'receipt-private.json');
  const fingerprint = sha(JSON.stringify({ endpoint: ARTWORK_GENERATION_MODEL, input: job.input }));
  let receipt;
  try { receipt = JSON.parse(await fs.readFile(file)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (receipt && receipt.inputFingerprint !== fingerprint) throw new Error(`Existing ${job.id}/${job.arm} uses different settings; choose a new evaluation directory.`);
  if (receipt?.status === 'completed') {
    console.log(`${job.id}/${job.arm}: reusing completed output`);
    return;
  }
  if (receipt?.status === 'failed') throw new Error(`Recorded failure for ${job.id}/${job.arm}; no automatic resubmission.`);
  receipt ||= { ...job, endpoint: ARTWORK_GENERATION_MODEL, inputFingerprint: fingerprint, status: 'prepared' };
  const save = () => fs.writeFile(file, JSON.stringify(receipt, null, 2));
  try {
    if (!receipt.requestId) {
      // Verify the URL still serves the same reference before spending credits.
      const sourceResponse = await fetch(job.input.image_urls[0], { signal: AbortSignal.timeout(45000) });
      if (!sourceResponse.ok) throw new Error(`Reference unavailable: HTTP ${sourceResponse.status}`);
      if (sha(Buffer.from(await sourceResponse.arrayBuffer())) !== job.sourceSha256) throw new Error('Live reference differs from frozen source.');
      await save();
      const queued = await fal.queue.submit(ARTWORK_GENERATION_MODEL, { input: job.input });
      receipt.requestId = queued.request_id;
      receipt.submittedAt = new Date().toISOString();
      receipt.status = 'queued';
      await save();
      console.log(`${job.id}/${job.arm}: queued ${receipt.requestId}`);
    }
    if (!receipt.data) {
      const deadline = Date.now() + 300000;
      while (true) {
        const status = await fal.queue.status(ARTWORK_GENERATION_MODEL, { requestId: receipt.requestId, logs: false });
        if (status.status === 'COMPLETED') break;
        if (Date.now() > deadline) throw new Error('Queue wait timed out; recorded request can be resumed.');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      const result = await fal.queue.result(ARTWORK_GENERATION_MODEL, { requestId: receipt.requestId });
      receipt.data = result.data;
      receipt.status = 'provider_succeeded';
      receipt.providerFinishedAt = new Date().toISOString();
      await save();
    }
    const outputUrl = receipt.data?.images?.[0]?.url;
    if (!outputUrl) throw new Error('No image was returned.');
    const response = await fetch(outputUrl, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Output download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const info = await sharp(bytes).metadata();
    await fs.writeFile(path.join(folder, 'output.png'), bytes);
    receipt.output = { sha256: sha(bytes), width: info.width, height: info.height, format: info.format };
    receipt.status = 'completed';
    receipt.completedAt = new Date().toISOString();
    await save();
    console.log(`${job.id}/${job.arm}: completed ${info.width}x${info.height}`);
  } catch (error) {
    receipt.error = error.message;
    receipt.detail = error.body?.detail;
    // Retain request IDs and downloaded result metadata for resumption. A
    // transfer interruption must not spend on a second image generation.
    if (!receipt.requestId) receipt.status = 'failed';
    await save();
    throw error;
  }
}

// Two simultaneous runs keep this small pilot bounded and allow the control
// and candidate to be evaluated contemporaneously.
for (let start = 0; start < jobs.length; start += 2) {
  const results = await Promise.allSettled(jobs.slice(start, start + 2).map(run));
  const errors = results.filter(result => result.status === 'rejected');
  if (errors.length) throw new AggregateError(errors.map(result => result.reason), 'Evaluation incomplete; saved requests can be resumed without resubmission.');
}
