// Explicit paid smoke test through normal Studio billing; resumable by manifest.
// Two original outputs + one variation: at most 22 app credits, no credit grants.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { validateLogoOperation, logoOperationCost } from '../../src/lib/logoStudio.mjs';

const folder = resolve('outputs/logo-studio-benchmark-smoke');
mkdirSync(folder, { recursive: true });
const path = resolve(folder, 'manifest.json');
const cases = [
  { name: 'Studio craft review — RIDGELINE', style: 'badge', prompt: 'A soaring swift above a mountain ridge', brand: 'RIDGELINE',
    designSettings: { badgeDirection: 'minimal-emblem', badgeShape: 'shield', badgeDetail: 'minimal', primaryColor: '#143D35', secondaryColor: '#C49B58', backgroundColor: '#FFFFFF' } },
  { name: 'Studio craft review — RIVERDAY', style: 'mascot', prompt: 'A curious otter holding a coffee cup', brand: 'RIVERDAY',
    designSettings: { detail: 'minimal', characterComposition: 'portrait', mood: 'friendly', primaryColor: '#203B47', secondaryColor: '#CE9464', backgroundColor: '#FFFFFF' } },
];
const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {
  createdAt: new Date().toISOString(), budget: 22, samples: cases.map(sample => ({ ...sample, projectId: randomUUID(), requestId: randomUUID() })), variationRequestId: randomUUID(),
};
const save = () => writeFileSync(path, JSON.stringify(state, null, 2));
for (const sample of state.samples) validateLogoOperation({ ...sample, operation: 'generate', mode: 'text', tagline: '', palette: [] });
save();
if (!process.argv.includes('--run-paid')) { console.log(JSON.stringify({ budget: 22, originals: 2, variations: 1, callsStarted: 0 })); process.exit(0); }
if (logoOperationCost('generate', 'text') * 2 + logoOperationCost('variations') !== 22) throw new Error('Review pricing changed; audit budget first.');
const ownerProject = process.argv[process.argv.indexOf('--owner-project') + 1];
if (!process.argv.includes('--owner-project') || !/^[a-f0-9-]{36}$/.test(ownerProject)) throw new Error('Pass an existing owned Logo Studio project.');
config({ path: '.env.local', quiet: true }); config({ path: '.env', quiet: true });
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
const { createLogoState, startLogoTextBatch, startLogoOperation, refreshLogoJob } = await import('../../src/lib/logoStudioServer.js');
const { data: owner, error: ownerError } = await db.from('projects').select('user_id,canvas_data').eq('id', ownerProject).single();
if (ownerError) throw ownerError;
if (owner.canvas_data?.tool !== 'logo_studio') throw new Error('Expected a Logo Studio project.');
const userId = owner.user_id;
async function balance() { const { data, error } = await db.from('profiles').select('credits').eq('id', userId).single(); if (error) throw error; return data.credits; }
state.balanceBefore ??= await balance(); save();
async function complete(project, job) {
  for (let attempt = 0; !['succeeded', 'failed'].includes(job.status) && attempt < 40; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    project = await refreshLogoJob(userId, project, job.id);
    job = project.canvas_data.jobs.find(item => item.id === job.id);
  }
  if (job.status !== 'succeeded') throw new Error(job.error || `Review job is ${job.status}; rerun to resume.`);
  return { project, job };
}
for (const sample of state.samples) {
  let { data: project, error } = await db.from('projects').select('*').eq('id', sample.projectId).maybeSingle();
  if (error) throw error;
  if (!project) {
    if (await balance() < 22) throw new Error('Insufficient review budget. No grant was applied.');
    const created = await db.from('projects').insert({ id: sample.projectId, user_id: userId, name: sample.name, trace_type: 'logo', canvas_data: createLogoState(userId, sample.projectId) }).select('*').single();
    if (created.error) throw created.error;
    project = created.data;
  }
  if (project.user_id !== userId) throw new Error('Review owner mismatch.');
  if (!project.canvas_data.jobs.some(job => job.batchId === sample.requestId)) project = await startLogoTextBatch(userId, project,
    validateLogoOperation({ ...sample, mode: 'text', operation: 'generate', tagline: '', palette: [] }), 1);
  let result = await complete(project, project.canvas_data.jobs.find(job => job.batchId === sample.requestId));
  Object.assign(sample, { jobId: result.job.id, status: result.job.status, url: result.job.url, compiledPrompt: result.job.compiledPrompt,
    creditCost: result.job.creditCost, studioUrl: `http://localhost:3000/logo-studio/${sample.projectId}` }); save();
  const response = await fetch(sample.url); if (!response.ok) throw new Error('Review download failed.');
  writeFileSync(resolve(folder, `${sample.style}.png`), Buffer.from(await response.arrayBuffer()));
  if (sample.style === 'badge') {
    project = result.project;
    if (!project.canvas_data.jobs.some(job => job.id === state.variationRequestId)) project = await startLogoOperation(userId, project,
      validateLogoOperation({ requestId: state.variationRequestId, operation: 'variations', sourceId: sample.jobId, style: sample.style, mode: 'text', variationStyle: 'auto' }));
    result = await complete(project, project.canvas_data.jobs.find(job => job.id === state.variationRequestId));
    state.variation = { id: result.job.id, url: result.job.url, status: result.job.status, creditCost: result.job.creditCost }; save();
    const variation = await fetch(result.job.url); if (!variation.ok) throw new Error('Variation download failed.');
    writeFileSync(resolve(folder, 'badge-variation.png'), Buffer.from(await variation.arrayBuffer()));
  }
}
state.balanceAfter = await balance(); save();
console.log(JSON.stringify({ originals: state.samples.map(({ name, studioUrl, creditCost }) => ({ name, studioUrl, creditCost })), variationCredits: state.variation.creditCost, balanceChange: state.balanceBefore - state.balanceAfter }));
