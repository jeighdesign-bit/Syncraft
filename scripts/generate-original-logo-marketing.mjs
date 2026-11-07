import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { LOGO_ORIGINAL_CONCEPTS } from '../src/lib/logoOriginalConcepts.mjs';

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

const root = resolve('outputs/original-logo-marketing');
mkdirSync(root, { recursive: true });
// User selected eleven new outputs with the existing 92 credits, no top-up.
// Existing DARKMEN examples already cover Streetwear; Abstract also has existing examples.
const selected = LOGO_ORIGINAL_CONCEPTS.filter(c => !['abstract', 'streetwear-lettering'].includes(c.style));
if (selected.length !== 11) throw new Error('Expected exactly eleven authorized concepts.');
const manifestPath = join(root, 'manifest.json');
const state = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {
  createdAt: new Date().toISOString(), provenance: 'Independently authored briefs with no reference images or third-party gallery input.',
  authorizedOutputs: 11, authorizedAppCreditBudget: 88, creditTopUp: 0,
  samples: selected.map(c => ({ ...c, key: c.id.replace('original-', ''), projectId: randomUUID(), requestId: randomUUID() })),
};
const save = () => writeFileSync(manifestPath, JSON.stringify(state, null, 2));
save();
if (!process.argv.includes('--run-authorized')) {
  console.log('Prepared eleven original concepts. --run-authorized uses normal Studio billing, capped at 88 app credits with no credit grants.');
  process.exit(0);
}

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
state.balanceBefore ??= await balance();
save();
const pending = state.samples.filter(s => s.status !== 'succeeded');
if ((await balance()) < pending.length * 8) throw new Error('Insufficient existing credits; no top-up is authorized.');

async function generate(entry) {
  if (entry.status === 'succeeded') return;
  let { data: project, error } = await db.from('projects').select('*').eq('id', entry.projectId).maybeSingle();
  if (error) throw error;
  if (!project) {
    const result = await db.from('projects').insert({ id: entry.projectId, user_id: userId, name: `Original Marketing — ${entry.title}`, trace_type: 'logo', canvas_data: createLogoState(userId, entry.projectId) }).select('*').single();
    if (result.error) throw result.error;
    project = result.data;
  }
  const input = validateLogoOperation({ requestId: entry.requestId, operation: 'generate', mode: 'text', style: entry.style, brand: entry.brand, tagline: entry.tagline, prompt: entry.prompt, palette: [], designSettings: entry.designSettings });
  const previous = project.canvas_data.jobs.find(j => j.batchId === entry.requestId);
  project = previous ? await refreshLogoJob(userId, project, previous.id) : await startLogoTextBatch(userId, project, input, 1);
  const job = project.canvas_data.jobs.find(j => j.batchId === entry.requestId);
  if (!job) throw new Error(`Missing saved job: ${entry.key}`);
  Object.assign(entry, { status: job.status, jobId: job.id, url: job.url, error: job.error, model: job.model, provider: job.provider,
    creditCost: job.creditCost, compiledPrompt: job.compiledPrompt, studioUrl: `http://localhost:3000/logo-studio/${entry.projectId}` });
  save();
  if (job.status !== 'succeeded') throw new Error(`${entry.key}: ${job.status} ${job.error || ''}`);
  const response = await fetch(job.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed for ${entry.key}: ${response.status}`);
  writeFileSync(join(root, `${entry.key}.png`), Buffer.from(await response.arrayBuffer()));
  console.log(`Saved ${entry.title} (${entry.style})`);
}
for (let i = 0; i < pending.length; i += 2) {
  const results = await Promise.allSettled(pending.slice(i, i + 2).map(generate));
  for (const r of results) if (r.status === 'rejected') console.error(r.reason.message);
}
state.balanceAfter = await balance();
save();
const succeeded = state.samples.filter(s => s.status === 'succeeded').length;
console.log(JSON.stringify({ succeeded, requested: 11, balanceBefore: state.balanceBefore, balanceAfter: state.balanceAfter, creditTopUp: 0 }));
if (succeeded !== 11) process.exitCode = 1;
