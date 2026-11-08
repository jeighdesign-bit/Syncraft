// Explicit, resumable paid comparison: two Text outputs, 16 existing app credits.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { validateLogoOperation, logoOperationCost } from '../../src/lib/logoStudio.mjs';

const folder = resolve('outputs/logo-studio-controls-smoke'); mkdirSync(folder, { recursive: true });
const path = resolve(folder, 'manifest.json');
const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {
  createdAt: new Date().toISOString(), budget: 16,
  samples: ['baseline', 'inspiration'].map(kind => ({ kind, projectId: randomUUID(), requestId: randomUUID() })),
};
const save = () => writeFileSync(path, JSON.stringify(state, null, 2)); save();
if (!process.argv.includes('--run-paid')) { console.log(JSON.stringify({ budget: 16, outputs: 2, callsStarted: 0 })); process.exit(0); }
if (logoOperationCost('generate', 'text') * 2 !== 16) throw new Error('Review budget changed.');
const ownerProject = process.argv[process.argv.indexOf('--owner-project') + 1];
if (!process.argv.includes('--owner-project') || !/^[a-f0-9-]{36}$/.test(ownerProject)) throw new Error('Pass an owned Logo Studio project.');
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
const { createLogoState, startLogoTextBatch, refreshLogoJob } = await import('../../src/lib/logoStudioServer.js');
const { uploadToR2 } = await import('../../src/lib/cloudflare.js');
const { data: owner, error: ownerError } = await db.from('projects').select('user_id,canvas_data').eq('id', ownerProject).single();
if (ownerError) throw ownerError;
if (owner.canvas_data?.tool !== 'logo_studio') throw new Error('Expected Logo Studio ownership.');
const userId = owner.user_id;
async function balance() { const { data, error } = await db.from('profiles').select('credits').eq('id', userId).single(); if (error) throw error; return data.credits; }
state.balanceBefore ??= await balance(); save();
for (const sample of state.samples) {
  let { data: project, error } = await db.from('projects').select('*').eq('id', sample.projectId).maybeSingle();
  if (error) throw error;
  if (!project) {
    if (await balance() < 16) throw new Error('Insufficient comparison budget. No grant was applied.');
    const created = await db.from('projects').insert({ id: sample.projectId, user_id: userId, name: `Studio controls review — PINEWATCH ${sample.kind}`, trace_type: 'logo', canvas_data: createLogoState(userId, sample.projectId) }).select('*').single();
    if (created.error) throw created.error; project = created.data;
  }
  if (project.user_id !== userId) throw new Error('Owner mismatch.');
  if (sample.kind === 'inspiration' && !sample.styleReferenceUrl) {
    // An original Syncraft result, not a third-party logo or a Pinterest source.
    sample.styleReferenceUrl = await uploadToR2(readFileSync(resolve('outputs/logo-studio-benchmark-smoke/mascot.png')), `projects/${sample.projectId}/style-inspiration.png`, 'image/png'); save();
  }
  if (!project.canvas_data.jobs.some(job => job.batchId === sample.requestId)) {
    project = await startLogoTextBatch(userId, project, validateLogoOperation({ requestId: sample.requestId, operation: 'generate', mode: 'text', style: 'mascot',
      prompt: 'A watchful lynx', brand: 'PINEWATCH', tagline: '', palette: [], designSettings: { primaryColor: '#183D35', secondaryColor: '#CA9C50', backgroundColor: '#FFFFFF' },
      generationOptions: { conceptMode: 'faithful', seed: 27641, ...(sample.kind === 'inspiration' ? { styleMatch: 'flexible' } : {}) },
      ...(sample.styleReferenceUrl ? { styleReferenceUrl: sample.styleReferenceUrl } : {}),
    }), 1);
  }
  let job = project.canvas_data.jobs.find(job => job.batchId === sample.requestId);
  for (let attempt = 0; !['succeeded', 'failed'].includes(job.status) && attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); project = await refreshLogoJob(userId, project, job.id); job = project.canvas_data.jobs.find(item => item.id === job.id);
  }
  Object.assign(sample, { jobId: job.id, status: job.status, url: job.url, model: job.model, seed: job.seed, generationOptions: job.generationOptions,
    creditCost: job.creditCost, providerCost: job.estimatedCostUsd, visualGuideResult: job.visualGuideResult, studioUrl: `http://localhost:3000/logo-studio/${sample.projectId}` }); save();
  if (job.status !== 'succeeded') throw new Error(job.error || 'Comparison pending; rerun to resume.');
  const response = await fetch(job.url); if (!response.ok) throw new Error('Output download failed.');
  writeFileSync(resolve(folder, `${sample.kind}.png`), Buffer.from(await response.arrayBuffer()));
  console.log(JSON.stringify({ kind: sample.kind, status: job.status, model: job.model, seed: job.seed, credits: job.creditCost, providerCost: job.estimatedCostUsd }));
}
state.balanceAfter = await balance(); save();
console.log(JSON.stringify({ charged: state.balanceBefore - state.balanceAfter, projects: state.samples.map(({ kind, studioUrl }) => ({ kind, studioUrl })) }));
