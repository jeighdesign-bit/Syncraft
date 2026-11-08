// One real Text-to-Logo output per style through the existing signed-job,
// billing, prompt enhancement, generation and storage services. No model or
// price overrides, free credits, paid POST retries or existing draft writes.
import { registerHooks } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { config } from 'dotenv';
import sharp from 'sharp';
import { LOGO_STYLES, validateLogoOperation, logoOperationCost } from '../../src/lib/logoStudio.mjs';
import { LOGO_ENHANCER_VERSION } from '../../src/lib/logoPromptEnhancer.mjs';

const seed = 27641;
const cases = [
  { style: 'minimalist', prompt: 'A heron standing on one leg.', brand: '', designSettings: { symbolConstruction: 'solid', structure: 'organic', primaryColor: '#153B36', backgroundColor: '#FFFFFF' } },
  { style: 'mascot', prompt: 'A watchful lynx', brand: 'PINEWATCH', designSettings: { primaryColor: '#183D35', secondaryColor: '#CA9C50', backgroundColor: '#FFFFFF' } },
  { style: 'retro', prompt: 'A cheerful orange carrying a takeaway cup.', brand: 'ZESTDAY', designSettings: { characterComposition: 'full-body', detail: 'minimal', mood: 'cheerful', personality: 'playful', primaryColor: '#F16B29', secondaryColor: '#173E38', backgroundColor: '#FFF8E9' } },
  { style: 'badge', prompt: 'A leaping ibex above a rocky ridge.', brand: 'RIDGE', designSettings: { badgeDirection: 'modern-club', badgeType: 'emblem', badgeShape: 'shield', badgeSubject: 'full-body', badgeView: 'profile', badgeLayout: 'integrated', badgeDetail: 'minimal', primaryColor: '#122E45', secondaryColor: '#C3973F', backgroundColor: '#FFFFFF' } },
  { style: 'monogram', prompt: 'A fox suggested through a shared contour.', brand: 'FENWICK', designSettings: { monogramLetters: 'F', capitalization: 'uppercase', detail: 'minimal', monogramTreatment: 'stylized', monogramWeight: 'bold', monogramFont: 'sans', primaryColor: '#153B36', backgroundColor: '#FFFFFF' } },
  { style: 'wordmark', prompt: 'One roof-shaped detail integrated into a letter.', brand: 'HAVEN', designSettings: { fontFamily: 'sans', composition: 'horizontal', detail: 'minimal', lettering: 'custom', primaryColor: '#173D36', backgroundColor: '#FFFFFF' } },
  { style: 'streetwear-lettering', prompt: 'Strong angular letter cuts.', brand: 'VOLTAGE', designSettings: { streetwearLetters: 'athletic-block', streetwearLayout: 'straight', streetwearOutline: 'layered', streetwearDepth: 'beveled', primaryColor: '#23252B', secondaryColor: '#D8F14B', backgroundColor: '#FFFFFF' } },
  { style: 'line', prompt: 'A heron standing on one leg, its neck gently curved.', brand: '', designSettings: { lineThickness: 'thin', lineStructure: 'curved', characterComposition: 'full-body', detail: 'minimal', primaryColor: '#164A45', backgroundColor: '#FFFFFF' } },
  { style: 'abstract', prompt: 'Three interlocking loops forming one closed triangular symbol.', brand: '', designSettings: { detail: 'minimal', structure: 'geometric', primaryColor: '#47359A', secondaryColor: '#3FC7B1', backgroundColor: '#FFFFFF' } },
  { style: 'pictorial', prompt: 'A swift diving with its wings swept back.', brand: '', designSettings: { detail: 'minimal', characterComposition: 'full-body', structure: 'organic', primaryColor: '#123C50', backgroundColor: '#FFFFFF' } },
  { style: 'engraved', prompt: 'A barn owl facing left with one raised wing, no frame.', brand: '', designSettings: { engravingTechnique: 'stipple', engravingStyle: 'simplified', lineQuality: 'fine', detail: 'detailed', primaryColor: '#233932', backgroundColor: '#FFFFFF' } },
  { style: 'icon', prompt: 'A compact watering can with a curved handle.', brand: '', designSettings: { detail: 'minimal', viewpoint: 'three-quarter', primaryColor: '#186A83', secondaryColor: '#E5AB43', backgroundColor: '#FFFFFF' } },
  { style: 'cartoon', prompt: 'A playful otter balancing one pebble.', brand: 'PEBBLEPOP', designSettings: { characterComposition: 'full-body', detail: 'minimal', outlineThickness: 'thick', mood: 'friendly', personality: 'playful', primaryColor: '#794931', secondaryColor: '#2B998E', backgroundColor: '#FFFFFF' } },
];
const folder = resolve('outputs/logo-all-styles-review'); mkdirSync(folder, { recursive: true });
const manifestPath = resolve(folder, 'manifest.json');
const protectedPaths = ['src/lib/pricing.js', 'src/lib/logoModelRouting.mjs', 'src/lib/logoRecraft.mjs', 'src/lib/logoFal.mjs', 'src/lib/logoTextDirection.mjs', 'src/lib/logoStyleLanguage.mjs', 'src/lib/logoPromptEnhancer.mjs'];
const hashes = () => Object.fromEntries(protectedPaths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
const state = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {
  createdAt: new Date().toISOString(), seed, maxImageOutputs: 13, budgetCredits: 104, sourceHashes: hashes(),
  samples: cases.map(sample => ({ ...sample, projectId: randomUUID(), requestId: randomUUID(), enhancementRequestId: randomUUID(), status: 'not-started' })),
};
const save = () => writeFileSync(manifestPath, JSON.stringify(state, null, 2));
if (JSON.stringify(cases) !== JSON.stringify(state.samples.map(({ style, prompt, brand, designSettings }) => ({ style, prompt, brand, designSettings })))) throw new Error('Preserve the original test inputs.');
if (JSON.stringify(hashes()) !== JSON.stringify(state.sourceHashes)) throw new Error('Generation sources changed during this evaluation.');
if (state.samples.length !== LOGO_STYLES.length || new Set(state.samples.map(sample => sample.style)).size !== 13 || logoOperationCost('generate', 'text') * state.samples.length !== state.budgetCredits) throw new Error('Evaluation scope or prices changed.');
for (const sample of state.samples) validateLogoOperation({ ...sample, operation: 'generate', mode: 'text', tagline: '', palette: [], generationOptions: { conceptMode: 'faithful', seed } });
save();
if (!process.argv.includes('--run-paid') && !process.argv.includes('--check-owner')) {
  console.log(JSON.stringify({ outputs: 13, budgetCredits: 104, seed, models: 'Existing production routing', callsStarted: 0 })); process.exit(0);
}
const ownerFlag = process.argv.indexOf('--owner-project');
const ownerProjectId = process.argv[ownerFlag + 1];
if (ownerFlag < 0 || !/^[a-f0-9-]{36}$/i.test(ownerProjectId || '')) throw new Error('Pass an existing owned Logo Studio project.');
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
const { createLogoState, ownedLogoProject, startLogoTextBatch, refreshLogoJob } = await import('../../src/lib/logoStudioServer.js');
const { enhanceLogoPrompt } = await import('../../src/lib/logoPromptEnhancerServer.js');
const { data: owner, error: ownerError } = await db.from('projects').select('user_id,canvas_data').eq('id', ownerProjectId).single();
if (ownerError || owner?.canvas_data?.tool !== 'logo_studio') throw new Error('Could not verify the evaluation owner.');
const userId = owner.user_id;
await ownedLogoProject(userId, ownerProjectId);
const balance = async () => { const { data, error } = await db.from('profiles').select('credits').eq('id', userId).single(); if (error) throw error; return data.credits; };
if (process.argv.includes('--check-owner')) { console.log(JSON.stringify({ availableCredits: await balance(), budgetCredits: state.budgetCredits, outputs: 13, callsStarted: 0 })); process.exit(0); }
if (!process.env.FAL_KEY || !(process.env.RECRAFT_API_TOKEN || process.env.RECRAFT_API_KEY)) throw new Error('Existing generation credentials are unavailable.');
state.balanceBefore ??= await balance();
if (!state.startedAt && state.balanceBefore < state.budgetCredits) throw new Error('Insufficient existing credits for thirteen samples. No credits were granted.');
state.startedAt ??= new Date().toISOString(); save();
for (const sample of state.samples) {
  let { data: project, error } = await db.from('projects').select('*').eq('id', sample.projectId).maybeSingle();
  if (error) throw error;
  if (!project) {
    const styleName = LOGO_STYLES.find(style => style.id === sample.style).name;
    const created = await db.from('projects').insert({ id: sample.projectId, user_id: userId, name: `Style test — ${styleName}`, trace_type: 'logo', original_image_url: null, canvas_data: createLogoState(userId, sample.projectId) }).select('*').single();
    if (created.error) throw created.error;
    project = created.data;
  }
  if (project.user_id !== userId) throw new Error('Project owner mismatch.');
  if (!sample.enhancementStatus) {
    sample.enhancementStatus = 'started'; save();
    try {
      const result = await enhanceLogoPrompt(userId, { requestId: sample.enhancementRequestId, projectId: sample.projectId, mode: 'text', style: sample.style, prompt: sample.prompt, hasBrand: !!sample.brand, hasTagline: false, palette: [], designSettings: sample.designSettings });
      sample.enhancedPrompt = result.enhancedPrompt; sample.enhancementStatus = 'succeeded';
    } catch (error) { sample.enhancementStatus = 'failed'; sample.enhancementError = error.message; }
    save();
  }
  const input = validateLogoOperation({ requestId: sample.requestId, operation: 'generate', mode: 'text', style: sample.style, prompt: sample.enhancedPrompt || sample.prompt,
    ...(sample.enhancedPrompt ? { promptEnhancement: { version: LOGO_ENHANCER_VERSION, originalPrompt: sample.prompt, enhancedPrompt: sample.enhancedPrompt } } : {}),
    brand: sample.brand, tagline: '', palette: [], designSettings: sample.designSettings, generationOptions: { conceptMode: 'faithful', seed } });
  if (!project.canvas_data.batches?.some(batch => batch.id === sample.requestId) && sample.status === 'not-started') {
    sample.status = 'submitting'; save();
    try { project = await startLogoTextBatch(userId, project, input, 1); }
    catch (error) { sample.submissionError = error.message; }
  }
  project = await ownedLogoProject(userId, sample.projectId);
  let job = project.canvas_data.jobs.find(job => job.batchId === sample.requestId);
  if (!job) { sample.status = 'failed-or-unknown'; save(); console.log(JSON.stringify({ style: sample.style, status: sample.status, error: sample.submissionError })); continue; }
  for (let attempt = 0; !['succeeded', 'failed'].includes(job.status) && attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    project = await refreshLogoJob(userId, project, job.id); job = project.canvas_data.jobs.find(item => item.id === job.id);
  }
  Object.assign(sample, { jobId: job.id, status: job.status, model: job.model, creditCost: job.creditCost, estimatedCostUsd: job.estimatedCostUsd, compilerVersion: job.compilerVersion,
    appliedSeed: job.seed, appliedSettings: job.designSettings, appliedBrand: job.brand, visualGuideResult: job.visualGuideResult,
    outputUrl: job.url, error: job.error, studioUrl: `http://localhost:3000/logo-studio/${sample.projectId}` });
  save();
  if (job.status === 'succeeded') {
    if (job.model !== 'recraftv4_1' || job.creditCost !== 8) throw new Error('Generation model or price differs from the existing contract.');
    const nativePath = resolve(folder, `${sample.style}.png`);
    if (!existsSync(nativePath)) {
      const response = await fetch(job.url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error('Saved output download failed. Resume without generating again.');
      const buffer = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(buffer).metadata();
      if (metadata.width !== 1024 || metadata.height !== 1024) throw new Error('Unexpected generation dimensions.');
      writeFileSync(nativePath, buffer);
    }
    sample.nativeFile = nativePath; save();
  }
  console.log(JSON.stringify({ style: sample.style, status: sample.status, enhanced: sample.enhancementStatus, model: sample.model, creditCost: sample.creditCost, studioUrl: sample.studioUrl }));
}
state.balanceAfter = await balance(); state.sourceHashesAfter = hashes(); state.finishedAt = new Date().toISOString(); save();
if (JSON.stringify(state.sourceHashes) !== JSON.stringify(state.sourceHashesAfter)) throw new Error('Generation sources changed.');
console.log(JSON.stringify({ completed: state.samples.filter(sample => sample.status === 'succeeded').length, total: 13, balanceBefore: state.balanceBefore, balanceAfter: state.balanceAfter, sourcesUnchanged: true }));
