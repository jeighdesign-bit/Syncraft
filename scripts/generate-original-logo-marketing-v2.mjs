import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { config } from 'dotenv';
import { LOGO_ORIGINAL_CONCEPTS } from '../src/lib/logoOriginalConcepts.mjs';
import { LOGO_EXAMPLE_RECENT } from '../src/lib/logoExampleRecent.mjs';

const root = resolve('outputs/original-logo-marketing-v2');
mkdirSync(root, { recursive: true });
const audit = JSON.parse(readFileSync('outputs/logo-style-direction-audit/directions.json', 'utf8'));
const selected = audit.items.filter(item => !item.keep);
if (selected.length !== 12 || selected.some(item => item.style === 'streetwear-lettering')) throw new Error('Expected twelve non-streetwear replacements.');
const manifestPath = join(root, 'manifest.json');
const state = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {
  runId: randomUUID(), createdAt: new Date().toISOString(), authorizedOutputs: 12,
  appCreditBudget: 96, requestedTestCreditGrant: 96,
  provenance: 'New independently written briefs informed by a visual review of multiple logo genres. No competitor images or prompts are sent to the generator.',
  kept: LOGO_EXAMPLE_RECENT.filter(e => e.style === 'streetwear-lettering').map(e => ({
    ...e, assetSha256: createHash('sha256').update(readFileSync(`public${e.image.split('?')[0]}`)).digest('hex'),
  })),
  samples: selected.map(item => ({
    id: item.id, key: item.id.replace('original-', ''), title: LOGO_ORIGINAL_CONCEPTS.find(c => c.id === item.id)?.title || item.brand,
    style: item.style, brand: item.brand, tagline: item.tagline || '', prompt: item.proposedPrompt,
    designSettings: item.proposedSettings, projectId: randomUUID(), requestId: randomUUID(),
  })),
};
if (state.samples.length !== 12 || state.kept.length !== 10 || state.appCreditBudget !== 96) throw new Error('Unexpected replacement plan.');
const save = () => writeFileSync(manifestPath, JSON.stringify(state, null, 2));
save();
if (!process.argv.includes('--run-authorized')) {
  console.log(JSON.stringify({ prepared: state.samples.length, preservedStreetwear: state.kept.length, appCreditsRequired: 96, generationStarted: false }));
  process.exit(0);
}

config({ path: '.env', override: true, quiet: true });
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes('/node_modules/')) return next(specifier, context);
  let target = specifier.startsWith('@/') ? pathToFileURL(resolve('src', specifier.slice(2))).href : specifier;
  if (target.startsWith('file:') || target.startsWith('.')) {
    const url = new URL(target, context.parentURL);
    if (!/\.[a-z]+$/i.test(url.pathname) && existsSync(new URL(url.href + '.js'))) target = url.href + '.js';
  }
  return next(target, context);
} });
const { adminSupabase: db } = await import('../src/lib/supabase.js');
const { createLogoState, startLogoTextBatch, refreshLogoJob } = await import('../src/lib/logoStudioServer.js');
const { validateLogoOperation } = await import('../src/lib/logoStudio.mjs');
const { data: owner, error: ownerError } = await db.from('projects').select('user_id').eq('id', '08ac52e6-6a13-4bea-846e-1454b03235e0').single();
if (ownerError) throw ownerError;
const userId = owner.user_id;
const balance = async () => {
  const { data, error } = await db.from('profiles').select('credits').eq('id', userId).single();
  if (error) throw error;
  return Number(data.credits);
};
const inputs = new Map(state.samples.map(entry => [entry.id, validateLogoOperation({
  requestId: entry.requestId, operation: 'generate', mode: 'text', style: entry.style,
  brand: entry.brand, tagline: entry.tagline, prompt: entry.prompt, palette: [], designSettings: entry.designSettings,
})]));
state.balanceBefore ??= await balance();
save();
if (process.argv.includes('--grant-authorized')) {
  const action = `User authorized 96 test credits for twelve non-streetwear replacements ${state.runId}`;
  const receiptFile = join(root, 'credit-grant.json');
  const { data: grants, error } = await db.from('credit_logs').select('id,amount').eq('user_id', userId).eq('action', action);
  if (error) throw error;
  if (!grants.length) {
    if (existsSync(receiptFile)) throw new Error('Prior grant attempt exists. Reconcile before repeating.');
    const receipt = { status: 'starting', action, amount: 96, balanceBefore: await balance() };
    writeFileSync(receiptFile, JSON.stringify(receipt, null, 2));
    const result = await db.rpc('increment_credits', { user_id: userId, amount: 96 });
    if (result.error) throw result.error;
    receipt.status = 'applied';
    writeFileSync(receiptFile, JSON.stringify(receipt, null, 2));
    const logged = await db.from('credit_logs').insert({ user_id: userId, action, amount: 96 });
    if (logged.error) throw logged.error;
    Object.assign(receipt, { status: 'logged', balanceAfterGrant: await balance() });
    writeFileSync(receiptFile, JSON.stringify(receipt, null, 2));
  } else if (grants.length !== 1 || Number(grants[0].amount) !== 96) throw new Error('Unexpected grant history.');
  state.creditTopUp = 96;
  save();
}
const pending = state.samples.filter(s => s.status !== 'succeeded');
if ((await balance()) < pending.length * 8) throw new Error('Insufficient credits. No grant is made without --grant-authorized and explicit user approval.');
async function download(entry) {
  if (existsSync(join(root, `${entry.key}.png`))) return;
  const response = await fetch(entry.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed: ${entry.key} ${response.status}`);
  writeFileSync(join(root, `${entry.key}.png`), Buffer.from(await response.arrayBuffer()));
}
async function generate(entry) {
  let { data: project, error } = await db.from('projects').select('*').eq('id', entry.projectId).maybeSingle();
  if (error) throw error;
  if (!project) {
    const result = await db.from('projects').insert({ id: entry.projectId, user_id: userId,
      name: `Original Marketing V2 — ${entry.title}`, trace_type: 'logo', canvas_data: createLogoState(userId, entry.projectId),
    }).select('*').single();
    if (result.error) throw result.error;
    project = result.data;
  }
  const previous = project.canvas_data.jobs.find(j => j.batchId === entry.requestId);
  project = previous ? await refreshLogoJob(userId, project, previous.id) : await startLogoTextBatch(userId, project, inputs.get(entry.id), 1);
  const job = project.canvas_data.jobs.find(j => j.batchId === entry.requestId);
  if (!job) throw new Error(`Missing saved job: ${entry.key}`);
  Object.assign(entry, { status: job.status, jobId: job.id, previewVersion: job.id, url: job.url, error: job.error,
    model: job.model, provider: job.provider, creditCost: job.creditCost, compiledPrompt: job.compiledPrompt,
    studioUrl: `http://localhost:3000/logo-studio/${entry.projectId}` });
  save();
  if (job.status !== 'succeeded') throw new Error(`${entry.key}: ${job.status} ${job.error || ''}`);
  await download(entry);
  console.log(`Saved ${entry.title} (${entry.style})`);
}
for (let i = 0; i < pending.length; i += 2) {
  const results = await Promise.allSettled(pending.slice(i, i + 2).map(generate));
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length) {
    for (const result of failures) console.error(result.reason.message);
    break; // Stop for diagnosis instead of spending on more outputs after a failure.
  }
}
for (const entry of state.samples.filter(s => s.status === 'succeeded')) await download(entry);
state.balanceAfter = await balance();
save();
const succeeded = state.samples.filter(s => s.status === 'succeeded').length;
console.log(JSON.stringify({ succeeded, requested: 12, balanceBefore: state.balanceBefore, balanceAfter: state.balanceAfter, creditTopUp: state.creditTopUp || 0 }));
if (succeeded !== 12) process.exitCode = 1;
