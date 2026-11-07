import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { LOGO_ORIGINAL_CONCEPTS } from '../src/lib/logoOriginalConcepts.mjs';
import { LOGO_EXAMPLE_RECENT } from '../src/lib/logoExampleRecent.mjs';

const root = 'outputs/original-logo-marketing';
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'));
if (manifest.creditTopUp !== 0 || manifest.authorizedOutputs !== 11 || manifest.samples.length !== 11) {
  throw new Error('Unexpected original-generation manifest.');
}
const kept = LOGO_EXAMPLE_RECENT.filter(e => e.id.startsWith('darkmen-'));
if (kept.length !== 10) throw new Error('Expected to preserve all ten DARKMEN presets.');
const originals = [];
for (const sample of manifest.samples) {
  const concept = LOGO_ORIGINAL_CONCEPTS.find(c => c.id === sample.id);
  if (!concept || sample.status !== 'succeeded' || sample.provider !== 'recraft') throw new Error(`Incomplete original output: ${sample.key}`);
  if (sample.prompt !== concept.prompt || sample.brand !== concept.brand) throw new Error(`Original brief changed: ${sample.key}`);
  const imagePath = `/images/logo-examples/studio-${sample.id}.webp`;
  const image = sample.previewVersion ? `${imagePath}?v=${encodeURIComponent(sample.previewVersion)}` : imagePath;
  const source = `${root}/${sample.key}.png`;
  if (!existsSync(source)) throw new Error(`Missing original PNG: ${source}`);
  await sharp(source).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(`public${imagePath}`);
  originals.push({ id: concept.id, title: concept.title, style: concept.style, brand: concept.brand, tagline: concept.tagline,
    prompt: concept.prompt, designSettings: concept.designSettings, image });
}
const data = [...originals, ...kept];
writeFileSync('src/lib/logoExampleRecent.mjs', '// Independently authored concepts generated through Syncraft Logo Studio.\n// Ten original DARKMEN streetwear examples are preserved.\n// Previews are bundled locally and do not expire with R2 project files.\nexport const LOGO_EXAMPLE_RECENT = ' + JSON.stringify(data, null, 2) + ';\n');
console.log(`Published ${originals.length} original presets and preserved ${kept.length} DARKMEN presets.`);
