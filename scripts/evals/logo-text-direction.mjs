import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { textDirectionCases } from './fixtures/logo-text-direction.mjs';
import { validateLogoOperation } from '../../src/lib/logoStudio.mjs';
import { normalizeLogoBrief } from '../../src/lib/logoDesignBrief.mjs';
import { buildLogoPrompt } from '../../src/lib/logoStudio.mjs';
import { LOGO_TEXT_DIRECTION_VERSION } from '../../src/lib/logoTextDirection.mjs';

const root = resolve('outputs/text-logo-improvement/live-review');
mkdirSync(root, { recursive: true });
const planPath = resolve(root, 'plan.json');
if (!existsSync(planPath)) {
  const cases = textDirectionCases.map(sample => {
    const { title, ...fields } = sample;
    const input = validateLogoOperation({ requestId: randomUUID(), operation: 'generate', mode: 'text', brand: '', tagline: '', palette: [], ...fields });
    return { title, projectId: randomUUID(), input, brief: normalizeLogoBrief(input), compiledPrompt: buildLogoPrompt(input) };
  });
  writeFileSync(planPath, JSON.stringify({ version: LOGO_TEXT_DIRECTION_VERSION, reviewId: randomUUID(), outputCount: 12, appCreditBudget: 96, requestedTestCredits: 24, cases }, null, 2));
}
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
if (plan.version !== LOGO_TEXT_DIRECTION_VERSION || plan.cases.length !== 12 || plan.appCreditBudget !== 96 || new Set(plan.cases.map(c => c.input.style)).size !== 12) throw new Error('Review plan changed; prepare a new bounded review.');
for (const sample of plan.cases) {
  if (sample.input.mode !== 'text' || sample.input.operation !== 'generate' || sample.input.style === 'streetwear-lettering' || buildLogoPrompt(sample.input) !== sample.compiledPrompt) throw new Error('Review no longer matches the prepared Text-only contract.');
}
const selectedStyles = ['minimalist', 'mascot', 'retro', 'monogram', 'wordmark', 'line', 'abstract', 'engraved', 'icon'];
const selectedCases = plan.cases.filter(sample => selectedStyles.includes(sample.input.style));
if (!process.argv.includes('--existing-72-authorized')) {
  console.log(JSON.stringify({ prepared: plan.cases.length, selected: selectedStyles, appCreditBudget: 72, additionalCredits: 0, generationStarted: false, plan: planPath }));
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
const { adminSupabase: db } = await import('../../src/lib/supabase.js');
const { createLogoState, startLogoTextBatch, refreshLogoJob } = await import('../../src/lib/logoStudioServer.js');
const userId = '08bafd26-e228-4a97-9efa-84a930c90098';
const balance = async () => {
  const { data, error } = await db.from('profiles').select('credits').eq('id', userId).single();
  if (error) throw error;
  return Number(data.credits);
};
// User authorized nine outputs from the existing 72 credits; no grants.
const execution = { styles: selectedStyles, outputCount: 9, appCreditBudget: 72, additionalCredits: 0 };
writeFileSync(resolve(root, 'execution.json'), JSON.stringify(execution, null, 2));
for (let i = 0; i < selectedCases.length; i++) {
  const sample = selectedCases[i];
  const caseIndex = plan.cases.indexOf(sample);
  const dir = resolve(root, `${String(caseIndex + 1).padStart(2, '0')}-${sample.input.style}`);
  mkdirSync(dir, { recursive: true });
  let { data: project, error } = await db.from('projects').select('*').eq('id', sample.projectId).maybeSingle();
  if (error) throw error;
  if (!project) {
    const added = await db.from('projects').insert({ id: sample.projectId, user_id: userId, name: `Text Quality Review — ${sample.title}`, trace_type: 'logo', canvas_data: createLogoState(userId, sample.projectId) }).select('*').single();
    if (added.error) throw added.error;
    project = added.data;
  }
  if (project.user_id !== userId) throw new Error('Review owner mismatch.');
  const existing = project.canvas_data.jobs.find(job => job.batchId === sample.input.requestId);
  if (!existing && await balance() < 8) throw new Error('Insufficient review credits. No additional grant was applied.');
  project = existing ? await refreshLogoJob(userId, project, existing.id) : await startLogoTextBatch(userId, project, sample.input, 1);
  const job = project.canvas_data.jobs.find(item => item.batchId === sample.input.requestId);
  if (!job) throw new Error('Missing saved review job.');
  const result = { title: sample.title, input: sample.input, projectId: project.id, jobId: job.id, status: job.status, error: job.error, provider: job.provider, model: job.model, seed: job.seed, url: job.url, compiledPrompt: job.compiledPrompt || sample.compiledPrompt, compilerVersion: job.compilerVersion, appCreditCost: job.creditCost, remainingCredits: await balance(), studioUrl: `http://localhost:3000/logo-studio/${project.id}` };
  writeFileSync(resolve(dir, 'result.json'), JSON.stringify(result, null, 2));
  if (job.status !== 'succeeded') throw new Error(`Review ${sample.input.style}: ${job.status}. ${job.error || ''}`);
  if (!existsSync(resolve(dir, 'result.png'))) {
    const response = await fetch(job.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Review download failed: ${response.status}`);
    writeFileSync(resolve(dir, 'result.png'), Buffer.from(await response.arrayBuffer()));
  }
  console.log(JSON.stringify({ completed: i + 1, style: sample.input.style, remainingCredits: result.remainingCredits }));
}
