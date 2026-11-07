import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { LOGO_EXAMPLE_RECENT } from '../src/lib/logoExampleRecent.mjs';
import { LOGO_ORIGINAL_CONCEPTS } from '../src/lib/logoOriginalConcepts.mjs';

const root = 'outputs/original-logo-marketing-v2';
if (existsSync('outputs/logo-one-at-a-time/publication.json')) throw new Error('Superseded by selected logo reviews. Use scripts/publish-approved-logo-reviews.mjs.');
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'));
if (manifest.authorizedOutputs !== 12 || manifest.appCreditBudget !== 96 || manifest.samples.length !== 12) throw new Error('Unexpected replacement manifest.');
if (manifest.samples.some(s => s.status !== 'succeeded' || s.provider !== 'recraft' || s.style === 'streetwear-lettering')) throw new Error('All twelve native Studio outputs must be complete.');
if (!existsSync(`${root}/quality-review.json`)) throw new Error('Review all twelve images before publishing.');
const review = JSON.parse(readFileSync(`${root}/quality-review.json`, 'utf8'));
if (review.runId !== manifest.runId || review.approvedJobIds?.length !== 12 || manifest.samples.some(s => !review.approvedJobIds.includes(s.jobId))) throw new Error('Quality review does not cover this complete batch.');
const kept = LOGO_EXAMPLE_RECENT.filter(e => e.style === 'streetwear-lettering');
if (kept.length !== 10 || manifest.kept.length !== 10) throw new Error('Expected all ten streetwear examples.');
for (const item of kept) {
  const saved = manifest.kept.find(e => e.id === item.id);
  const hash = createHash('sha256').update(readFileSync(`public${item.image.split('?')[0]}`)).digest('hex');
  if (!saved || saved.assetSha256 !== hash || JSON.stringify(item) !== JSON.stringify(Object.fromEntries(Object.entries(saved).filter(([key]) => key !== 'assetSha256')))) throw new Error(`Streetwear changed: ${item.id}`);
}
const originals = manifest.samples.map(sample => ({ id: sample.id, title: sample.title, style: sample.style,
  brand: sample.brand, tagline: sample.tagline, prompt: sample.prompt, designSettings: sample.designSettings,
  image: `/images/logo-examples/studio-${sample.id}.webp?v=${encodeURIComponent(sample.jobId)}`,
}));
const archive = `${root}/previous-public`;
mkdirSync(archive, { recursive: true });
for (const file of ['src/lib/logoExampleRecent.mjs', 'src/lib/logoOriginalConcepts.mjs']) {
  const target = `${archive}/${file.split('/').pop()}`;
  if (!existsSync(target)) copyFileSync(file, target);
}
// Prepare every converted file before changing any live preview or catalog.
for (const sample of manifest.samples) {
  const old = `public/images/logo-examples/studio-${sample.id}.webp`;
  if (existsSync(old) && !existsSync(`${archive}/studio-${sample.id}.webp`)) copyFileSync(old, `${archive}/studio-${sample.id}.webp`);
  await sharp(`${root}/${sample.key}.png`).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(`${root}/${sample.key}.webp`);
}
for (const sample of manifest.samples) copyFileSync(`${root}/${sample.key}.webp`, `public/images/logo-examples/studio-${sample.id}.webp`);
const concepts = [...originals.map(({ image, ...concept }) => concept), ...LOGO_ORIGINAL_CONCEPTS.filter(e => e.style === 'streetwear-lettering')];
writeFileSync('src/lib/logoOriginalConcepts.mjs', '// Independently authored briefs. Competitor images and prompts are not generation inputs.\nexport const LOGO_ORIGINAL_CONCEPTS = ' + JSON.stringify(concepts, null, 2) + ';\n');
writeFileSync('src/lib/logoExampleRecent.mjs', '// Original Studio outputs; all ten DARKMEN streetwear examples are preserved.\n// Previews are bundled locally and do not expire with R2 project files.\nexport const LOGO_EXAMPLE_RECENT = ' + JSON.stringify([...originals, ...kept], null, 2) + ';\n');
console.log('Replaced all twelve non-streetwear styles; preserved ten streetwear presets and their image hashes.');
