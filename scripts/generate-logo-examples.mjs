import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);
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
const { createLogoState, startLogoTextBatch, refreshLogoJob, ownedLogoProject } = await import('../src/lib/logoStudioServer.js');
const { validateLogoOperation } = await import('../src/lib/logoStudio.mjs');
const additions = process.argv.includes('--additions');
const refresh = process.argv.includes('--refresh');
const featured = process.argv.includes('--featured');
const LOGO_EXAMPLES = featured ? (await import('../src/lib/logoExampleFeatured.mjs')).LOGO_EXAMPLE_FEATURED : refresh ? (await import('../src/lib/logoExampleRefresh.mjs')).LOGO_EXAMPLE_REFRESH : additions ? (await import('../src/lib/logoExampleAdditions.mjs')).LOGO_EXAMPLE_ADDITIONS : (await import('../src/lib/logoExamples.mjs')).LOGO_EXAMPLES;
const amount = featured ? 120 : additions ? 100 : 200;
const file = featured ? 'outputs/logo-quality-pilot/studio-example-featured.json' : refresh ? 'outputs/logo-quality-pilot/studio-example-refresh.json' : additions ? 'outputs/logo-quality-pilot/studio-example-additions.json' : 'outputs/logo-quality-pilot/studio-example-generation.json';
let state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { examples: {} };
const save = () => writeFileSync(file, JSON.stringify(state, null, 2));
const { data: owner, error } = await db.from('projects').select('user_id').eq('id', '75f0968f-0a59-42b6-a421-80e55ab702f5').single();
if (error) throw error;
const userId = owner.user_id;
const action = featured ? 'Authorized 120 credits twelve featured-inspired examples 2026-10-24' : refresh ? 'Authorized 200 credits twenty clean replacement examples 2026-10-24' : additions ? 'Authorized 100 credits ten clean Logo Studio additions 2026-10-24' : 'Authorized 200 credits Logo Studio example gallery 2026-10-24';
const { data: grants, error: grantError } = await db.from('credit_logs').select('id').eq('user_id', userId).eq('action', action);
if (grantError) throw grantError;
if (!grants.length) {
  const { error } = await db.rpc('increment_credits', { user_id: userId, amount }); if (error) throw error;
  const { error: logError } = await db.from('credit_logs').insert({ user_id: userId, action, amount }); if (logError) throw logError;
}
console.log(`${amount} authorized test credits ready.`);
async function generateExample(example) {
  let entry = state.examples[example.id];
  if (!entry) { entry = state.examples[example.id] = { projectId: randomUUID(), requestId: randomUUID() }; save();
    const { error } = await db.from('projects').insert({ id: entry.projectId, user_id: userId, name: `Example: ${example.title}`, trace_type: 'logo', original_image_url: null, canvas_data: createLogoState(userId, entry.projectId) });
    if (error) throw error;
  }
  let project = await ownedLogoProject(userId, entry.projectId);
  if (!project.canvas_data.jobs.length) {
    project = await startLogoTextBatch(userId, project, validateLogoOperation({ requestId: entry.requestId, operation: 'generate', mode: 'text', style: example.style, prompt: example.prompt, brand: example.brand, tagline: '', palette: [], designSettings: example.designSettings || {} }), 1);
    console.log(`Submitted ${example.title}`);
  }
  let job = project.canvas_data.jobs[0];
  while (!['succeeded', 'failed'].includes(job.status)) {
    await new Promise(r => setTimeout(r, 6000));
    project = await refreshLogoJob(userId, project, job.id); job = project.canvas_data.jobs[0];
  }
  Object.assign(entry, { jobId: job.id, status: job.status, url: job.url, provider: job.provider, endpoint: job.endpoint, planner: project.canvas_data.batches?.[0]?.planner }); save();
  console.log(`${example.title}: ${job.status}`);
  if (job.status === 'failed') throw new Error(`Generation failed: ${example.title}; no automatic paid retry.`);
  const response = await fetch(job.url);
  if (!response.ok) throw new Error(`Could not fetch saved logo: ${example.title}`);
  await sharp(Buffer.from(await response.arrayBuffer())).resize(640, 640).webp({ quality: 90 }).toFile(`public/images/logo-examples/studio-${example.id}.webp`);
}
for (let index = 0; index < LOGO_EXAMPLES.length; index += 3) await Promise.all(LOGO_EXAMPLES.slice(index, index + 3).map(generateExample));
console.log(`All ${LOGO_EXAMPLES.length} actual Logo Studio generations completed.`);
