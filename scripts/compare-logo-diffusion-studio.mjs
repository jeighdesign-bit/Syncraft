import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

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

const dir = 'outputs/logo-diffusion-comparison';
mkdirSync(dir, { recursive: true });
const sources = JSON.parse(readFileSync(dir + '/selected.json', 'utf8'));
const samples = [
  { key: 'bear-mascot', name: 'LD Compare — Bear Beanie · Mascot', style: 'mascot', brand: '', tagline: '',
    designSettings: { detail: 'minimal', characterComposition: 'portrait', mood: 'energetic', personality: 'bold', industry: 'sports', primaryColor: '#0D47A1', secondaryColor: '#2196F3', outlineColor: '#DCDCDC', backgroundColor: '#FFFFFF' },
    differences: ['Source has a separate thick-outline setting and modern styling; Mascot has no matching controls. Outline color is mapped exactly.'] },
  { key: 'agio-wordmark', name: 'LD Compare — AGIO BULLS · Wordmark', style: 'wordmark', brand: 'AGIO BULLS', tagline: 'TRADE FEARLY',
    designSettings: { letterType: 'cursive', detail: 'minimal', rendering: 'modern', fontFamily: 'sans', lettering: 'bold', composition: 'horizontal', mood: 'energetic', personality: 'bold', industry: 'technology', primaryColor: '#327DA1', backgroundColor: '#FAF9F6' },
    differences: ['Source background is named Off White without a hex value; mapped approximately to #FAF9F6.', 'Source combines cursive letter type with sans-serif font and an interlocking-vector prompt. Those conflicting instructions are preserved.'] },
  { key: 'eagle-monogram', name: 'LD Compare — Eagle A · Monogram', style: 'monogram', brand: '', tagline: '',
    designSettings: { monogramLetters: 'A', capitalization: 'uppercase', detail: 'minimal', monogramTreatment: 'geometric', monogramWeight: 'italic', monogramFont: 'sans', mood: 'clean', personality: 'modern', industry: 'manufacturing', primaryColor: '#E91E63', backgroundColor: '#000000' },
    differences: [] },
];

const file = dir + '/studio-manifest.json';
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { createdAt: new Date().toISOString(), samples: [] };
const save = () => writeFileSync(file, JSON.stringify(state, null, 2));
for (const [index, sample] of samples.entries()) {
  if (state.samples.some(entry => entry.key === sample.key)) continue;
  const source = sources[index];
  state.samples.push({ ...sample, projectId: randomUUID(), requestId: randomUUID(), sourceId: source._id,
    sourceStyleUrl: 'https://logodiffusion.com/' + ['mascot', 'logo-type', 'monogram'][index],
    sourceUrl: 'https://app.logodiffusion.com/gen/text-workspace?generation-settings-gallery=' + source._id,
    referenceUrl: 'https://images.logodiffusion.com' + source.generation.imageUrl,
    originalUserPrompt: source.generation.user_prompt, prompt: source.generation.prompt, sourceSettings: source.generation.styleConfig,
  });
}
save();
if (!process.argv.includes('--run-paid')) {
  console.log('Prepared three comparisons. --run-paid creates saved Studio projects using normal billing.');
  process.exit(0);
}

const { adminSupabase: db } = await import('../src/lib/supabase.js');
const { createLogoState, startLogoTextBatch, refreshLogoJob } = await import('../src/lib/logoStudioServer.js');
const { validateLogoOperation } = await import('../src/lib/logoStudio.mjs');
const { data: owner, error: ownerError } = await db.from('projects').select('user_id').eq('id', '08ac52e6-6a13-4bea-846e-1454b03235e0').single();
if (ownerError) throw ownerError;
const userId = owner.user_id;
const { data: before, error: beforeError } = await db.from('profiles').select('credits').eq('id', userId).single();
if (beforeError) throw beforeError;
state.balanceBefore ??= before.credits;
save();
for (const entry of state.samples) {
  if (entry.status === 'succeeded') continue;
  let { data: project, error } = await db.from('projects').select('*').eq('id', entry.projectId).maybeSingle();
  if (error) throw error;
  if (!project) {
    const result = await db.from('projects').insert({ id: entry.projectId, user_id: userId, name: entry.name, trace_type: 'logo', canvas_data: createLogoState(userId, entry.projectId) }).select('*').single();
    if (result.error) throw result.error;
    project = result.data;
  }
  const input = validateLogoOperation({ requestId: entry.requestId, operation: 'generate', mode: 'text', style: entry.style, brand: entry.brand, tagline: entry.tagline, prompt: entry.prompt, palette: [], designSettings: entry.designSettings });
  const previous = project.canvas_data.jobs.find(job => job.batchId === entry.requestId);
  if (previous) project = await refreshLogoJob(userId, project, previous.id);
  else project = await startLogoTextBatch(userId, project, input, 1);
  const job = project.canvas_data.jobs.find(item => item.batchId === entry.requestId);
  if (!job) throw new Error('No saved job for ' + entry.key);
  Object.assign(entry, { status: job.status, jobId: job.id, url: job.url, error: job.error, model: job.model, provider: job.provider, isOwnerTest: job.isOwnerTest, creditCost: job.creditCost, compiledPrompt: job.compiledPrompt, studioUrl: 'http://localhost:3000/logo-studio/' + entry.projectId });
  save();
  if (job.status !== 'succeeded') throw new Error(entry.key + ': ' + job.status + ' ' + (job.error || ''));
  console.log(entry.key + ': saved in Logo Studio (' + job.model + ')');
}
const { data: after, error: afterError } = await db.from('profiles').select('credits').eq('id', userId).single();
if (afterError) throw afterError;
state.balanceAfter = after.credits;
save();
console.log(JSON.stringify({ saved: state.samples.filter(entry => entry.status === 'succeeded').length, balanceBefore: state.balanceBefore, balanceAfter: state.balanceAfter }));

for (const entry of state.samples) {
  for (const [suffix, url] of [['reference', entry.referenceUrl], ['studio', entry.url]]) {
    const path = `${dir}/${entry.key}-${suffix}.png`;
    if (existsSync(path)) continue;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not download ' + entry.key + ' ' + suffix + ': ' + response.status);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
}
