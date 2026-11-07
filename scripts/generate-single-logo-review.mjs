import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';

const planArgument = process.argv.find(arg => arg.startsWith('--plan='));
if (!planArgument) throw new Error('Specify --plan=outputs/logo-one-at-a-time/<sample>/plan.json');
const planPath = resolve(planArgument.slice('--plan='.length));
const withinOutputs = relative(resolve('outputs/logo-one-at-a-time'), planPath);
if (withinOutputs.startsWith('..') || isAbsolute(withinOutputs)) throw new Error('Plan must be inside the single-logo review folder.');
const root = resolve(planPath, '..');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
if (plan.outputCount !== 1 || plan.appCreditBudget !== 8 || plan.input.style === 'streetwear-lettering') throw new Error('Only one non-streetwear sample is allowed.');
if (!process.argv.includes('--run-authorized')) {
  console.log(JSON.stringify({ title: plan.title, outputs: 1, appCreditBudget: 8, requestedTestCredits: plan.requestedTestCredits, generationStarted: false }));
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
const input = validateLogoOperation(plan.input);
const { data: owner, error: ownerError } = await db.from('projects').select('user_id').eq('id', '08ac52e6-6a13-4bea-846e-1454b03235e0').single();
if (ownerError) throw ownerError;
const userId = owner.user_id;
const balance = async () => {
  const { data, error } = await db.from('profiles').select('credits').eq('id', userId).single();
  if (error) throw error;
  return Number(data.credits);
};
if (process.argv.includes('--grant-authorized')) {
  const amount = plan.requestedTestCredits;
  if (amount !== 200 || plan.creditGrantAuthorization?.amount !== amount) throw new Error('This run only accepts the explicitly authorized 200-credit grant.');
  const action = `User authorized 200 test credits for single-logo review ${input.requestId}`;
  const receiptPath = join(root, 'credit-grant.json');
  const { data: grants, error } = await db.from('credit_logs').select('id,amount').eq('user_id', userId).eq('action', action);
  if (error) throw error;
  if (!grants.length) {
    if (existsSync(receiptPath)) throw new Error('Prior grant attempt exists; reconcile before repeating.');
    const receipt = { status: 'starting', action, amount, balanceBefore: await balance() };
    const saveReceipt = () => writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
    saveReceipt();
    const granted = await db.rpc('increment_credits', { user_id: userId, amount });
    if (granted.error) throw granted.error;
    receipt.status = 'applied'; saveReceipt();
    const logged = await db.from('credit_logs').insert({ user_id: userId, action, amount });
    if (logged.error) throw logged.error;
    Object.assign(receipt, { status: 'logged', balanceAfterGrant: await balance() }); saveReceipt();
    console.log(`Added the authorized ${amount} test credits.`);
  } else if (grants.length !== 1 || Number(grants[0].amount) !== amount) throw new Error('Unexpected grant history.');
}
let { data: project, error } = await db.from('projects').select('*').eq('id', plan.projectId).maybeSingle();
if (error) throw error;
if (!project) {
  const inserted = await db.from('projects').insert({ id: plan.projectId, user_id: userId,
    name: `Logo Review — ${plan.title}`, trace_type: 'logo', canvas_data: createLogoState(userId, plan.projectId),
  }).select('*').single();
  if (inserted.error) throw inserted.error;
  project = inserted.data;
}
const previous = project.canvas_data.jobs.find(job => job.batchId === input.requestId);
if (!previous && (await balance()) < 8) throw new Error('Insufficient credits for the single sample.');
const beforeSource = plan.beforeSource;
if (!existsSync(join(root, 'before.png')) && beforeSource && existsSync(beforeSource)) copyFileSync(beforeSource, join(root, 'before.png'));
project = previous ? await refreshLogoJob(userId, project, previous.id) : await startLogoTextBatch(userId, project, input, 1);
const job = project.canvas_data.jobs.find(item => item.batchId === input.requestId);
if (!job) throw new Error('Missing saved generation.');
const result = { title: plan.title, projectId: project.id, requestId: input.requestId, jobId: job.id,
  status: job.status, error: job.error, url: job.url, provider: job.provider, model: job.model,
  appCreditCost: job.creditCost, remainingCredits: await balance(), compiledPrompt: job.compiledPrompt,
  studioUrl: `http://localhost:3000/logo-studio/${project.id}`, publication: 'Review only. Public gallery and posters have not been changed.',
};
writeFileSync(join(root, 'result.json'), JSON.stringify(result, null, 2));
if (job.status !== 'succeeded') throw new Error(`Sample status: ${job.status}. ${job.error || ''}`);
const response = await fetch(job.url, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Download failed: ${response.status}`);
writeFileSync(join(root, 'result.png'), Buffer.from(await response.arrayBuffer()));
console.log(JSON.stringify({ generated: 1, status: job.status, appCreditsUsed: job.creditCost, remainingCredits: result.remainingCredits }));
