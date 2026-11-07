import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { normalizeLogoDesignSettings } from '../src/lib/logoDesignSettings.mjs';

const dir = 'outputs/logo-diffusion-comparison';
const file = dir + '/studio-manifest.json';
const state = JSON.parse(readFileSync(file, 'utf8'));
const sources = JSON.parse(readFileSync(dir + '/public-gallery.json', 'utf8'));
const namedColors = 'Source uses named colors without hex values; recorded hex values are approximate mappings.';
const outlineGap = 'Source outline thickness has no separate matching control in this style; only its color is mapped.';
const planned = [
  { key: 'orange-house-pictorial', title: 'Orange House · Pictorial', style: 'pictorial', sourceId: '6ae69cd3721296711e6b8f13', sourcePage: 'pictorial',
    designSettings: { characterComposition: 'full-body', detail: 'minimal', structure: 'organic', mood: 'friendly', personality: 'whimsical', industry: 'community', primaryColor: '#FF9800', backgroundColor: '#FAF9F6' }, differences: [namedColors] },
  { key: 'fox-abstract', title: 'WL Fox · Abstract', style: 'abstract', sourceId: '6ae6a1b4721296711e6b9300', sourcePage: 'abstract',
    designSettings: { detail: 'minimal', structure: 'geometric', mood: 'clean', personality: 'dynamic', industry: 'creative', primaryColor: '#FF5722', secondaryColor: '#512DA8', backgroundColor: '#FFFFFF' }, differences: [] },
  { key: 'pub-badge', title: 'Old Bannie · Badge', style: 'badge', sourceId: '6ae6a0fd721296711e6b9234', sourcePage: 'badge-crest', brand: 'old bannie s pub&pizzaria',
    designSettings: { badgeType: 'crest', badgeShape: 'oval', badgeDetail: 'illustrative', mood: 'nostalgic', personality: 'classic', industry: 'food', primaryColor: '#D4AF37', secondaryColor: '#4B2E22', outlineColor: '#000000', backgroundColor: '#F5F0DC' }, differences: [namedColors, outlineGap, 'Source high detail is mapped to the available Illustrative badge setting.'] },
  { key: 'massawa-line', title: 'Massawa Boat · Line Art', style: 'line', sourceId: '6ae69f089ffe916dadd330ee', sourcePage: 'line-art', brand: 'massawa restaurant',
    designSettings: { lineThickness: 'thin', lineStructure: 'curved', characterComposition: 'full-body', detail: 'minimal', mood: 'clean', personality: 'sophisticated', industry: 'food', primaryColor: '#4B0807', backgroundColor: '#FAF9F6' }, differences: ['Off White is mapped approximately to #FAF9F6. Source also has a modern style flag without a matching Line Art control.'] },
  { key: 'goose-cartoon', title: 'Pink Goose · Cartoon', style: 'cartoon', sourceId: '6ae00df6fe58b9530cebcf29', sourcePage: 'cartoon',
    designSettings: { characterComposition: 'full-body', detail: 'minimal', mood: 'cheerful', personality: 'playful', industry: 'retail', primaryColor: '#FFFFFF', secondaryColor: '#EC78A4', outlineColor: '#424242', backgroundColor: '#FCE4EC' }, differences: [namedColors, outlineGap] },
  { key: 'brain-retro', title: 'Boxing Brain · Retro Mascot', style: 'retro', sourceId: '6ae0081dfe58b9530cebcafe', sourcePage: 'retro-mascot',
    designSettings: { mood: 'cheerful', personality: 'playful', industry: 'health', primaryColor: '#D6A323', secondaryColor: '#0047AB', outlineColor: '#000000', backgroundColor: '#FAF9F6' }, differences: [namedColors, outlineGap] },
  { key: 'pudding-engraved', title: 'Pudding Kitten · Engraved', style: 'engraved', sourceId: '6ad5195b3401d6ccfec09ed9', sourcePage: 'engraved',
    designSettings: { detail: 'minimal', engravingStyle: 'vintage', engravingTechnique: 'line', lineQuality: 'fine', mood: 'sweet', personality: 'playful', industry: 'fashion', primaryColor: '#D4AF37', backgroundColor: '#FAF9F6' }, differences: [namedColors] },
  { key: 'robot-icon', title: 'Robot Maid · Icon', style: 'icon', sourcePage: 'icon', sourceId: 'public-icon-hero-robot',
    prompt: 'A friendly robot maid with cleaning tools. It has a sleek, metallic finish and a helpful, smiling face.',
    originalUserPrompt: 'create me a robot maid logo, this robot has cool tools to get the job done with quality',
    referenceUrl: 'https://cdn.prod.website-files.com/6ad1225d3031697f2d2a82f5/6ae4083877eb448271b4c37a_icon-hero-3.webp',
    sourceSettings: { viewpoint: 'front', detail: 'minimal', mood: 'friendly', personality: 'modern', industry: 'Home and Living' },
    designSettings: { viewpoint: 'front', detail: 'minimal', mood: 'friendly', personality: 'modern', industry: 'home', primaryColor: '#25BDAE', secondaryColor: '#E2E3ED', outlineColor: '#37313D', backgroundColor: '#FFF9E9' },
    differences: ['Public hero provides prompt and listed settings, but no color hex values. Colors are approximated from its visible artwork.'] },
  { key: 'lamb-minimalist', title: 'Lamb · Minimalist', style: 'minimalist', sourcePage: 'pictorial', sourceId: 'public-pictorial-hero-lamb', comparisonType: 'adapted',
    prompt: 'Minimalist lamb silhouette profile, featuring clean and continuous lines with a focus on a gentle, standing posture.', originalUserPrompt: 'i need minimal lamb silhouette logo',
    referenceUrl: 'https://cdn.prod.website-files.com/6ad1225d3031697f2d2a82f5/6ad1225d3031697f2d2a859a_hero-lamb.webp',
    sourceSettings: { structure: 'geometric', characterComposition: 'full-body', mood: 'clean', personality: 'minimalist', industry: 'Nature and Outdoors' },
    designSettings: { symbolConstruction: 'solid', structure: 'geometric', mood: 'clean', personality: 'minimalist', industry: 'outdoors', primaryColor: '#FFFFFF', backgroundColor: '#7CCBE2' },
    differences: ['Adapted comparison: Logo Diffusion categorizes this reference as Pictorial; our result uses Minimalist. Solid silhouette is our added construction setting. Colors are visually approximated.'] },
  { key: 'cult-streetwear', title: 'Forbidden Cult · Streetwear', style: 'streetwear-lettering', sourcePage: 'logo-type', sourceId: 'public-logo-type-hero-forbidden', comparisonType: 'adapted', brand: 'FORBIDDEN CULT', tagline: 'SECRETS UNVEILED',
    prompt: 'Sinister emblem with fractured letters, subtly forming a cryptic eye. Emphasize sharp, angular forms and inverted crosses.', originalUserPrompt: 'Gothic with the main text able to be a pocket print on a tshirt',
    referenceUrl: 'https://cdn.prod.website-files.com/6ad1225d3031697f2d2a82f5/6ae4078a46d1d2f72853c377_logo-type-hero-1.webp',
    sourceSettings: { fontFamily: 'gothic', lettering: 'distressed', mood: 'youthful', personality: 'edgy', industry: 'Fashion and Apparel' },
    designSettings: { streetwearLetters: 'gothic', streetwearLayout: 'stacked', streetwearOutline: 'single', streetwearDepth: 'flat', primaryColor: '#FF4B35', secondaryColor: '#FFFFFF', outlineColor: '#000000', backgroundColor: '#000000' },
    differences: ['Adapted comparison: source category is Logo Type, while our result uses Streetwear Lettering.', 'Stacked layout, single outline and flat depth are our explicit settings based on the visible reference. Source distressed/youthful/edgy controls have no equivalent here. Colors are visually approximated; text is capitalized to match the visible reference.'] },
];

for (const sample of planned) {
  if (state.samples.some(entry => entry.key === sample.key)) continue;
  const source = sources.find(item => item._id === sample.sourceId);
  const settings = normalizeLogoDesignSettings(sample.designSettings, sample.style);
  state.samples.push({ ...sample, name: 'LD Compare — ' + sample.title, brand: sample.brand || '', tagline: sample.tagline || '', designSettings: settings,
    projectId: randomUUID(), requestId: randomUUID(), comparisonType: sample.comparisonType || 'mapped',
    sourceStyleUrl: 'https://logodiffusion.com/' + sample.sourcePage,
    sourceUrl: source ? 'https://app.logodiffusion.com/gen/text-workspace?generation-settings-gallery=' + source._id : 'https://logodiffusion.com/' + sample.sourcePage,
    referenceUrl: sample.referenceUrl || 'https://images.logodiffusion.com' + source.generation.imageUrl,
    prompt: sample.prompt || source.generation.prompt, originalUserPrompt: sample.originalUserPrompt || source.generation.user_prompt, sourceSettings: sample.sourceSettings || source.generation.styleConfig,
  });
}
writeFileSync(file, JSON.stringify(state, null, 2));
console.log('Prepared ' + planned.length + ' additional style comparisons.');
if (!process.argv.includes('--grant-authorized')) process.exit(0);

config({ path: '.env', override: true, quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: owner, error } = await db.from('projects').select('user_id').eq('id', '08ac52e6-6a13-4bea-846e-1454b03235e0').single();
if (error) throw error;
const userId = owner.user_id;
const action = 'User authorized 78 test credits for remaining 10 Logo Diffusion style comparisons 2026-11-05';
const grantFile = dir + '/continuation-credit-grant.json';
const { data: grants, error: searchError } = await db.from('credit_logs').select('id,amount').eq('user_id', userId).eq('action', action);
if (searchError) throw searchError;
if (!grants.length) {
  if (existsSync(grantFile)) throw new Error('A prior grant attempt exists; reconcile it before granting again.');
  writeFileSync(grantFile, JSON.stringify({ status: 'starting', amount: 78, action }));
  const { error: grantError } = await db.rpc('increment_credits', { user_id: userId, amount: 78 });
  if (grantError) throw grantError;
  writeFileSync(grantFile, JSON.stringify({ status: 'applied', amount: 78, action }));
  const { error: logError } = await db.from('credit_logs').insert({ user_id: userId, action, amount: 78 });
  if (logError) throw logError;
  writeFileSync(grantFile, JSON.stringify({ status: 'logged', amount: 78, action }));
}
state.creditGrants = [{ amount: 78, action }];
writeFileSync(file, JSON.stringify(state, null, 2));
console.log('Authorized 78-credit grant recorded once.');
