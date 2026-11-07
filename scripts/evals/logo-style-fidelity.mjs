import { config } from 'dotenv';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { STYLE_FIDELITY_CASES } from './fixtures/logo-style-fidelity.mjs';
import { validateLogoOperation } from '../../src/lib/logoStudio.mjs';
import { planLogoDirections } from '../../src/lib/logoArtDirectorServer.js';
import { compileLogoDirection, LOGO_COMPILER_VERSION } from '../../src/lib/logoPromptCompiler.mjs';
import { generateRecraftLogo } from '../../src/lib/logoRecraftServer.js';

if (!process.argv.includes('--run-paid')) throw new Error('This evaluation spends Recraft API credits. Pass --run-paid to run it.');
config({ path: '.env', quiet: true });
const directory = resolve('outputs/logo-style-review');
mkdirSync(directory, { recursive: true });
const selected = process.argv.find(value => value.startsWith('--style='))?.slice(8);
const queue = STYLE_FIDELITY_CASES.filter(item => !selected || item.style === selected);
if (!queue.length) throw new Error('Unknown style.');
const failures = [];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const fixture = queue.shift();
    const caseId = fixture.id || fixture.style;
    const manifest = resolve(directory, caseId + '.json');
    if (existsSync(manifest) && !process.argv.includes('--force')) continue;
    try {
      const input = validateLogoOperation({ requestId: randomUUID(), operation: 'generate', mode: 'text', brand: '', tagline: '', palette: [], ...fixture });
      const plan = await planLogoDirections(input, 1);
      const compiledPrompt = compileLogoDirection(plan.brief, plan.directions[0]);
      const seed = 410000 + STYLE_FIDELITY_CASES.indexOf(fixture);
      const output = await generateRecraftLogo({ ...input, compiledPrompt, seed });
      const response = await fetch(output.url);
      if (!response.ok) throw new Error('Could not download the evaluation output.');
      writeFileSync(resolve(directory, caseId + '.png'), Buffer.from(await response.arrayBuffer()));
      writeFileSync(manifest, JSON.stringify({ ...fixture, compiledPrompt, compilerVersion: LOGO_COMPILER_VERSION, seed, model: output.model, endpoint: output.endpoint, cost: output.cost, planner: plan.metadata, reviewed: false }, null, 2));
      console.log(caseId, output.model, output.cost);
    } catch (error) { failures.push({ style: fixture.style, error: error.message }); }
  }
}));
writeFileSync(resolve(directory, 'failures.json'), JSON.stringify(failures, null, 2));
if (failures.length) throw new Error(JSON.stringify(failures));
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const cards = STYLE_FIDELITY_CASES.filter(item => existsSync(resolve(directory, (item.id || item.style) + '.json'))).map(item => {
  const caseId = item.id || item.style;
  const record = JSON.parse(readFileSync(resolve(directory, caseId + '.json')));
  return `<article><h2>${escape(caseId)}</h2><img src="data:image/png;base64,${readFileSync(resolve(directory, caseId + '.png')).toString('base64')}" alt="${escape(item.style)} live Recraft output"><p>${escape(record.prompt)}</p><details><summary>Settings and visual review</summary><pre>${escape(JSON.stringify(record.designSettings, null, 2))}</pre><p>${escape(record.review || 'Visual review pending.')}</p></details></article>`;
});
writeFileSync(resolve(directory, 'gallery.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f3f2ee;color:#232323;font:14px Arial}h1{font-size:25px;margin:0 0 6px}.intro{margin:0 0 24px;color:#666}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}article{border:1px solid #ddd;border-radius:12px;padding:16px;background:white}h2{font-size:17px;margin:0 0 12px}img{display:block;width:100%;aspect-ratio:1;object-fit:contain;border-radius:6px}p{font-size:12px;line-height:1.5}pre{white-space:pre-wrap;font-size:11px}summary{cursor:pointer;font-size:12px;color:#555}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:500px){.grid{grid-template-columns:1fr}}</style><h1>Logo Studio — 13-style Recraft review</h1><p class="intro">Live outputs from the production prompt builder. Each card has its exact prompt, settings and review.</p><div class="grid">${cards.join('')}</div>`);
console.log('Gallery:', directory);
