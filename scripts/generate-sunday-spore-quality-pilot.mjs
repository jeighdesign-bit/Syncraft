import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';

const root = resolve('outputs/original-logo-quality-pilot');
const plan = JSON.parse(readFileSync(join(root, 'plan.json'), 'utf8'));
if (plan.pilotCount !== 1 || plan.appCreditCost !== 8 || plan.additionalTestCreditsNeeded !== 4) {
  throw new Error('Unexpected pilot budget.');
}
if (!process.argv.includes('--run-authorized')) {
  console.log('One Sunday Spore quality sample: 8 app credits, with one explicitly authorized 4-credit test grant.');
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
const { startLogoTextBatch, refreshLogoJob } = await import('../src/lib/logoStudioServer.js');
const { validateLogoOperation } = await import('../src/lib/logoStudio.mjs');
let { data: project, error } = await db.from('projects').select('*').eq('id', plan.originalProjectId).single();
if (error) throw error;
const userId = project.user_id;
const balance = async () => {
  const { data, error } = await db.from('profiles').select('credits').eq('id', userId).single();
  if (error) throw error;
  return Number(data.credits);
};
const receiptFile = join(root, 'credit-grant.json');
const resultFile = join(root, 'result.json');
const action = `User authorized 4 test credits for Sunday Spore quality pilot ${plan.input.requestId}`;
const { data: grants, error: grantSearchError } = await db.from('credit_logs').select('id,amount').eq('user_id', userId).eq('action', action);
if (grantSearchError) throw grantSearchError;
const before = await balance();
if (!grants.length) {
  if (existsSync(receiptFile)) throw new Error('A prior grant attempt exists; reconcile before any repeat.');
  writeFileSync(receiptFile, JSON.stringify({ status: 'starting', action, amount: 4, balanceBefore: before }, null, 2));
  const { error: grantError } = await db.rpc('increment_credits', { user_id: userId, amount: 4 });
  if (grantError) throw grantError;
  writeFileSync(receiptFile, JSON.stringify({ status: 'applied', action, amount: 4, balanceBefore: before }, null, 2));
  const { error: logError } = await db.from('credit_logs').insert({ user_id: userId, action, amount: 4 });
  if (logError) throw logError;
  writeFileSync(receiptFile, JSON.stringify({ status: 'logged', action, amount: 4, balanceBefore: before, balanceAfterGrant: await balance() }, null, 2));
  console.log('Applied the authorized 4 test credits.');
} else if (grants.length !== 1 || Number(grants[0].amount) !== 4) {
  throw new Error('Unexpected grant history.');
}

const beforePath = join(root, 'sunday-spore-before.png');
if (!existsSync(beforePath)) copyFileSync('outputs/original-logo-marketing/sunday-spore.png', beforePath);
const input = validateLogoOperation(plan.input);
const previous = project.canvas_data.jobs.find(j => j.batchId === input.requestId);
if (!previous && (await balance()) < 8) throw new Error('Insufficient credits for the single authorized sample.');
project = previous ? await refreshLogoJob(userId, project, previous.id) : await startLogoTextBatch(userId, project, input, 1);
const job = project.canvas_data.jobs.find(j => j.batchId === input.requestId);
if (!job) throw new Error('The saved pilot job was not found.');
const result = {
  title: 'Sunday Spore quality pilot', projectId: project.id, requestId: input.requestId,
  jobId: job.id, status: job.status, error: job.error, url: job.url, model: job.model, provider: job.provider,
  appCreditCost: job.creditCost, testCreditsAdded: 4, balanceAfter: await balance(),
  proposal: plan.proposal, compiledPrompt: job.compiledPrompt,
  studioUrl: `http://localhost:3000/logo-studio/${project.id}`,
  publication: 'Review sample only. Public gallery and marketing assets have not been replaced.',
};
writeFileSync(resultFile, JSON.stringify(result, null, 2));
if (job.status !== 'succeeded') throw new Error(`Pilot status: ${job.status}. ${job.error || ''}`);
const response = await fetch(job.url, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Pilot download failed: ${response.status}`);
writeFileSync(join(root, 'sunday-spore-after.png'), Buffer.from(await response.arrayBuffer()));
console.log(JSON.stringify({ generated: 1, status: job.status, provider: job.provider, appCreditsUsed: job.creditCost, testCreditsAdded: 4, remainingCredits: result.balanceAfter }));
