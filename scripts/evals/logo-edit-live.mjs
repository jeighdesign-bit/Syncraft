// One real AI Edit against an explicitly selected saved logo. Reads the project
// without changing its history or charging app credits. Provider billing applies.
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createFalClient } from '@fal-ai/client';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { validateLogoOperation, buildLogoPrompt, logoReplacementText } from '../../src/lib/logoStudio.mjs';
import { logoVariationSource } from '../../src/lib/logoVariations.mjs';
import { nanoLogoPlan } from '../../src/lib/logoFal.mjs';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=');
  if (i < 3 || !arg.startsWith('--')) throw new Error('Use --project=ID --source=ID --prompt=INSTRUCTION --out=DIRECTORY');
  return [arg.slice(2, i), arg.slice(i + 1)];
}));
if (!args.project || !args.source || !args.prompt || !args.out) throw new Error('Explicit project, source, prompt and out arguments are required.');
if (args['run-paid'] !== 'true') throw new Error('This makes one paid fal image edit. Pass --run-paid=true to run it.');
const out = path.resolve(args.out);
if (await access(path.join(out, 'request.json')).then(() => true, () => false)) throw new Error('A request already exists in this directory. Recover its saved request ID instead of resubmitting.');
if (!process.env.FAL_KEY) throw new Error('FAL_KEY is required.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const { data: project, error } = await db.from('projects').select('canvas_data').eq('id', args.project).single();
if (error) throw new Error(error.message);
const source = project.canvas_data.jobs.find(job => job.id === args.source && job.status === 'succeeded');
if (!source || source.format !== 'png') throw new Error('Select a successful saved PNG logo.');
const context = logoVariationSource(source, project.canvas_data.jobs);
const input = validateLogoOperation({ ...context, operation: 'edit', requestId: crypto.randomUUID(), sourceId: source.id, prompt: args.prompt });
const replacement = logoReplacementText(input.prompt);
const job = { ...input, editPromptVersion: 'logo-edit-2',
  editIntent: replacement ? { type: 'replace-main-text', sourceText: input.brand, targetText: replacement } : { type: 'visual' },
  ...(replacement ? { brand: replacement } : {}) };
job.compiledPrompt = buildLogoPrompt(job);
const plan = nanoLogoPlan(job, source.url);
await mkdir(out, { recursive: true });
async function download(url, name) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Could not download ${name}.`);
  await writeFile(path.join(out, name), Buffer.from(await response.arrayBuffer()));
}
await download(source.url, 'original.png');
const fal = createFalClient({ credentials: process.env.FAL_KEY, retry: { maxRetries: 0 } });
const submitted = await fal.queue.submit(plan.endpoint, { input: plan.input });
const requestId = submitted.request_id;
if (!requestId) throw new Error('Provider did not accept the edit.');
const manifest = { projectId: args.project, sourceId: source.id, requestId, endpoint: plan.endpoint,
  mode: job.mode, instruction: job.prompt, brand: job.brand, tagline: job.tagline,
  editIntent: job.editIntent, compiledPrompt: job.compiledPrompt, estimatedCostUsd: plan.cost };
await writeFile(path.join(out, 'request.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ status: 'submitted', endpoint: plan.endpoint, out }));
const deadline = Date.now() + 240000;
while (Date.now() < deadline) {
  const status = await fal.queue.status(plan.endpoint, { requestId, logs: false });
  if (status.status === 'COMPLETED') {
    const result = await fal.queue.result(plan.endpoint, { requestId });
    const url = result.data?.images?.[0]?.url;
    if (!url) throw new Error('Provider returned no image.');
    await download(url, 'edited.png');
    console.log(JSON.stringify({ status: 'completed', original: path.join(out, 'original.png'), edited: path.join(out, 'edited.png') }));
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 3000));
}
throw new Error('Edit still pending. Use the saved request ID to recover it; do not resubmit.');
