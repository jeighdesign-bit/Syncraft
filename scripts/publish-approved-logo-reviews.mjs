import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { LOGO_EXAMPLE_RECENT } from '../src/lib/logoExampleRecent.mjs';
import { LOGO_ORIGINAL_CONCEPTS } from '../src/lib/logoOriginalConcepts.mjs';

const root = 'outputs/logo-one-at-a-time';
const { accepted } = JSON.parse(readFileSync(`${root}/accepted.json`, 'utf8'));
if (!accepted.length || new Set(accepted.map(e => e.id)).size !== accepted.length) throw new Error('Invalid approved selections.');
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const streetwear = LOGO_EXAMPLE_RECENT.filter(e => e.style === 'streetwear-lettering');
if (streetwear.length !== 10) throw new Error('Expected ten preserved streetwear examples.');
const hashes = streetwear.map(e => [e.id, digest(`public${e.image.split('?')[0]}`)]);
const archive = `${root}/previous-public`;
mkdirSync(archive, { recursive: true });
for (const name of ['logoExampleRecent.mjs', 'logoOriginalConcepts.mjs']) {
  if (!existsSync(`${archive}/${name}`)) copyFileSync(`src/lib/${name}`, `${archive}/${name}`);
}
const updates = new Map();
for (const selection of accepted) {
  if (!selection.id.startsWith('original-') || selection.folder.includes('..')) throw new Error('Only original non-streetwear examples may change.');
  const directory = `${root}/${selection.folder}`;
  const plan = JSON.parse(readFileSync(`${directory}/plan.json`, 'utf8'));
  const result = JSON.parse(readFileSync(`${directory}/result.json`, 'utf8'));
  const approval = JSON.parse(readFileSync(`${directory}/approval.json`, 'utf8'));
  if (approval.status !== 'approved' || result.jobId !== selection.jobId || result.status !== 'succeeded' || result.provider !== 'recraft' || result.requestId !== plan.input.requestId) throw new Error(`Unapproved or incomplete sample: ${selection.id}`);
  const current = LOGO_EXAMPLE_RECENT.find(e => e.id === selection.id);
  if (!current || current.style !== plan.input.style || current.style === 'streetwear-lettering') throw new Error(`Style mismatch: ${selection.id}`);
  const { brand, tagline, prompt, designSettings } = plan.input;
  const imagePath = `/images/logo-examples/studio-${selection.id}.webp`;
  await sharp(`${directory}/result.png`).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(`${directory}/preview.webp`);
  const oldVersion = current.image.split('?v=')[1] || 'unversioned';
  if (!existsSync(`${archive}/${selection.id}-${oldVersion}.webp`)) copyFileSync(`public${imagePath}`, `${archive}/${selection.id}-${oldVersion}.webp`);
  updates.set(selection.id, { example: { ...current, title: plan.exampleTitle || current.title, brand, tagline, prompt, designSettings, image: `${imagePath}?v=${encodeURIComponent(result.jobId)}` }, source: `${directory}/preview.webp`, imagePath });
}
for (const update of updates.values()) copyFileSync(update.source, `public${update.imagePath}`);
const examples = LOGO_EXAMPLE_RECENT.map(e => updates.get(e.id)?.example || e);
const concepts = LOGO_ORIGINAL_CONCEPTS.map(e => {
  const item = updates.get(e.id)?.example;
  if (!item) return e;
  const { image, ...concept } = item;
  return concept;
});
for (const [id, hash] of hashes) {
  const e = examples.find(item => item.id === id);
  if (digest(`public${e.image.split('?')[0]}`) !== hash) throw new Error(`Streetwear image changed: ${id}`);
}
writeFileSync('src/lib/logoExampleRecent.mjs', '// Original Studio outputs. User-approved replacements are applied individually.\n// All ten DARKMEN streetwear examples are preserved; local previews do not expire with R2.\nexport const LOGO_EXAMPLE_RECENT = ' + JSON.stringify(examples, null, 2) + ';\n');
writeFileSync('src/lib/logoOriginalConcepts.mjs', '// Independently authored briefs. Competitor artwork and gallery prompts are not generation inputs.\nexport const LOGO_ORIGINAL_CONCEPTS = ' + JSON.stringify(concepts, null, 2) + ';\n');
writeFileSync(`${root}/publication.json`, JSON.stringify({ publishedAt: new Date().toISOString(), scope: 'Local website only', approved: accepted.map(({ id, folder, jobId }) => ({ id, folder, jobId })), preservedStreetwear: hashes.length }, null, 2));
console.log(`Updated ${updates.size} user-approved examples locally; preserved all ten streetwear assets.`);
