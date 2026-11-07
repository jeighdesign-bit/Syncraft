import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const dir = 'outputs/logo-diffusion-comparison';
const manifest = JSON.parse(readFileSync(dir + '/studio-manifest.json', 'utf8'));
const reviews = {
  'bear-mascot': {
    follows: 'Bear head, ribbed beanie, forward-facing expression, simple shapes and pale outline are present.',
    improve: 'Studio blue is more saturated; the palette is approximate. The face is more symmetrical and aggressive. The reference has a more distinctive, softer silhouette.',
  },
  'agio-wordmark': {
    follows: 'AGIO BULLS and TRADE FEARLY are spelled correctly. Horns extend from A, and the main text follows one horizontal baseline.',
    improve: 'AGIO and BULLS are tightly joined. Some interlocking cuts reduce readability at small sizes. The background appears whiter than requested. The source itself mixes cursive and sans-serif controls.',
  },
  'eagle-monogram': {
    follows: 'An italic A and eagle head form a single sharp geometric mark, using pink on a dark background.',
    improve: 'The wing is mostly a positive pink shape, rather than a clear negative-space wing detail. The background is near-black and the pink differs from the supplied hex.',
  },
  'orange-house-pictorial': {
    follows: 'Three human silhouettes are integrated into orange-like fruit segments in an economical symbol.',
    improve: 'The house structure is weak: the top reads as a fruit dome rather than a roof. Orange hue and off-white background drift. Prioritize the relationship between all three requested subjects.',
  },
  'fox-abstract': {
    follows: 'A geometric fox integrates recognizable W and L forms, using orange and purple.',
    improve: 'The monogram dominates the animal more than in the reference. Simplify small feet and tail cuts, then check recognition at icon sizes. Colors remain approximate.',
  },
  'pub-badge': {
    follows: 'An older smiling bartender holds a tray and foaming beer within an oval badge.',
    improve: 'The leading word old is malformed. The long name is crowded along the border, while the reference has clearer hierarchy. Use readable text zones and verify every word. Beige background also drifts toward white.',
  },
  'massawa-line': {
    follows: 'A recognizable sailing boat with curved line work and readable massawa restaurant text underneath.',
    improve: 'Some supposedly continuous strokes break at the sail and hull. Line width varies and the overall lockup is very wide. Improve continuity and small-size balance.',
  },
  'goose-cartoon': {
    follows: 'A complete cheerful white goose has a pink beak and pink head bow. Its dark contours are clear.',
    improve: 'The pink background becomes extremely pale. Goose anatomy is recognizable but its silhouette could be more distinctive. Unlike the published reference, this output actually follows the requested pink beak.',
  },
  'brain-retro': {
    follows: 'A smiling brain character wears boxing gloves and makes a double thumbs-up gesture in a rubber-hose cartoon treatment.',
    improve: 'Eyes are absent, making the expression less readable. Gloves are oversized and the pale background drifts toward white. The literal glove-and-thumbs-up instruction is itself an unusual combination.',
  },
  'pudding-engraved': {
    follows: 'Fine carved lines, a compact symmetrical pose and gold-toned ink are present.',
    improve: 'The face and ears read more like a puppy than a kitten, and the pudding-cup shape is missing. Subject fidelity needs priority over engraved decoration. The background and gold hue also drift.',
  },
  'robot-icon': {
    follows: 'A friendly front-facing robot holds cleaning tools with simple readable icon construction.',
    improve: 'The metallic finish is weak; the result is mostly flat color. The public reference has a full body, but the published prompt does not require one. Do not grade that difference as a missed instruction.',
  },
  'lamb-minimalist': {
    follows: 'A gentle standing lamb appears in profile as a clean white silhouette.',
    improve: 'The cyan background is substantially brighter than the selected blue. The source artwork shows a curled horn not required by its prompt. This is an adapted Pictorial-to-Minimalist comparison.',
  },
  'cult-streetwear': {
    follows: 'FORBIDDEN CULT and SECRETS UNVEILED are readable, with sharp stacked Gothic lettering, an eye motif and cross details.',
    improve: 'Dense cross cuts and extreme letter proportions reduce clarity at small sizes. Red and white split across the letter faces instead of separating headline and tagline. This adapted Logo Type-to-Streetwear case uses different controls.',
  },
};
const saved = manifest.samples.filter(entry => entry.status === 'succeeded');
if (saved.length !== manifest.samples.length) throw new Error('The collection still contains unfinished samples.');
const creditsUsed = manifest.balanceBefore + (manifest.creditGrants || []).reduce((total, grant) => total + grant.amount, 0) - manifest.balanceAfter;
writeFileSync(dir + '/visual-review.json', JSON.stringify({ reviewedAt: new Date().toISOString(), samples: saved.map(entry => ({ key: entry.key, style: entry.style, studioUrl: entry.studioUrl, ...reviews[entry.key] })) }, null, 2));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cards = manifest.samples.map(entry => {
  const review = reviews[entry.key];
  return `<article id="${entry.key}"><header><h2>${escape(entry.name.replace('LD Compare — ', ''))}${entry.comparisonType === 'adapted' ? ' <small>· adapted</small>' : ''}</h2><a href="${escape(entry.studioUrl)}">Open saved Studio project ↗</a></header>
    <div class="pair"><figure><img src="${entry.key}-reference.png" alt="Published Logo Diffusion reference"><figcaption>Logo Diffusion · published reference · <a href="${escape(entry.sourceUrl)}">Source ↗</a></figcaption></figure><figure><img src="${entry.key}-studio.png" alt="Recraft result saved in Logo Studio"><figcaption>Our Logo Studio · Recraft V4.1 · 1 output</figcaption></figure></div>
    <p><strong>Follows the brief:</strong> ${escape(review.follows)}</p><p><strong>Improve:</strong> ${escape(review.improve)}</p>
    <details><summary>Prompt, settings and comparison limits</summary><p>${escape(entry.prompt)}</p><pre>${escape(JSON.stringify(entry.designSettings, null, 2))}</pre>${entry.differences.map(note => `<p>${escape(note)}</p>`).join('')}<p><a href="${escape(entry.sourceStyleUrl)}">Logo Diffusion ${escape(entry.style)} gallery ↗</a></p></details></article>`;
});
const navigation = saved.map(entry => `<a href="#${entry.key}">${escape(entry.name.replace('LD Compare — ', ''))}</a>`).join('');
writeFileSync(dir + '/comparison.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Logo Studio — all 13 styles</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fafafa;color:#171717;font:16px/1.6 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:48px 24px}h1{font-size:36px;letter-spacing:-1.2px;line-height:1.15}h2{font-size:23px;letter-spacing:-.6px;margin:0}a{color:#424242;text-underline-offset:4px}article{margin:40px 0 56px;padding-top:28px;border-top:1px solid #ddd;scroll-margin-top:20px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0}img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:white;border:1px solid #e5e5e5;border-radius:8px}figcaption{font-size:13px;color:#555;margin-top:8px}p{max-width:900px}details{padding:16px;background:white;border:1px solid #e5e5e5;border-radius:8px}summary{cursor:pointer;font-weight:600}pre{overflow:auto;font-size:13px}small{color:#555}nav{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0}nav a{border:1px solid #ddd;border-radius:6px;padding:6px 10px;font-size:13px;text-decoration:none;background:white}nav a:hover{border-color:#444}h2 small{font-size:13px;font-weight:400}ul{padding-left:20px}@media(max-width:600px){main{padding:28px 16px}header{display:block}h1{font-size:30px}.pair{gap:8px}figcaption{font-size:11px}}</style><main><small>PRIVATE COMPARISON · SAVED IN LOGO STUDIO</small><h1>All ${saved.length} styles.<br>One collected Studio review.</h1><p>Left: published Logo Diffusion gallery artwork. Right: a fresh result generated and saved through our normal Text to Logo workflow using Recraft V4.1.</p><p>We used the published enhanced prompt and mapped available settings. These are curated references versus one new sample each; seeds, models and some controls differ. Minimalist and Streetwear are explicitly adapted from Pictorial and Logo Type references. This is a visual diagnostic, not a controlled model ranking.</p><p>${saved.length} saved outputs · ${creditsUsed} app credits used overall · ${manifest.balanceAfter} credits remaining. This continuation added 10 outputs for 80 credits, funded by the remaining 2 credits plus 78 authorized test credits.</p><p><a href="studio-overview.png">View all Studio logos</a> · <a href="studio-projects.csv">Saved-project index</a> · <a href="collection-manifest.json">Prompts and settings</a></p><details open><summary>Priorities from the visual review</summary><ul><li>Preserve subject relationships: house + orange + three people; kitten + pudding shape.</li><li>Verify every word and improve badge text hierarchy.</li><li>Keep requested backgrounds and foreground colors more consistent.</li><li>Keep line paths continuous and inspect complex lettering at small sizes.</li></ul></details><nav aria-label="Jump to a style">${navigation}</nav>${cards.join('')}<small>Original reference artwork belongs to its respective creators. Sources are linked per example. No new outputs were generated on Logo Diffusion.</small></main></html>`);

const layers = [];
const svg = (width, height, content) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`);
layers.push({ input: svg(1100, 108, '<rect width="1100" height="108" fill="white"/><text x="32" y="38" font-family="Arial" font-size="25" font-weight="bold" fill="#171717">Published reference vs. our Logo Studio</text><text x="32" y="78" font-family="Arial" font-size="17" fill="#666">LOGO DIFFUSION</text><text x="572" y="78" font-family="Arial" font-size="17" fill="#666">RECRAFT V4.1 · SAVED STUDIO OUTPUT</text>'), left: 0, top: 0 });
for (const [index, entry] of manifest.samples.slice(0, 3).entries()) {
  const top = 108 + index * 535;
  layers.push({ input: svg(1100, 42, `<text x="32" y="29" font-family="Arial" font-size="20" font-weight="bold" fill="#171717">${escape(entry.name.replace('LD Compare — ', ''))}</text>`), left: 0, top });
  for (const [column, suffix] of ['reference', 'studio'].entries()) {
    const input = await sharp(`${dir}/${entry.key}-${suffix}.png`).resize(480, 480, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
    layers.push({ input, left: 32 + column * 540, top: top + 42 });
  }
}
await sharp({ create: { width: 1100, height: 1713, channels: 3, background: '#ffffff' } }).composite(layers).png().toFile(dir + '/comparison.png');
// Keep the original three-pair preview and add a compact overview of all outputs.
const overviewLayers = [{ input: svg(1280, 100, '<text x="30" y="41" font-family="Arial" font-size="30" font-weight="bold" fill="#171717">Logo Studio · all 13 styles</text><text x="30" y="75" font-family="Arial" font-size="18" fill="#666">Recraft V4.1 · actual saved results</text>'), left: 0, top: 0 }];
for (const [index, entry] of saved.entries()) {
  const left = 30 + (index % 4) * 310;
  const top = 110 + Math.floor(index / 4) * 342;
  overviewLayers.push({ input: await sharp(`${dir}/${entry.key}-studio.png`).resize(290, 290, { fit: 'contain', background: '#ffffff' }).png().toBuffer(), left, top });
  overviewLayers.push({ input: svg(290, 42, `<text x="0" y="26" font-family="Arial" font-size="15" fill="#222">${escape(entry.name.replace('LD Compare — ', ''))}</text>`), left, top: top + 290 });
}
await sharp({ create: { width: 1280, height: 1488, channels: 3, background: '#ffffff' } }).composite(overviewLayers).png().toFile(dir + '/studio-overview.png');

const publicSamples = saved.map(({ key, name, style, brand, tagline, prompt, originalUserPrompt, designSettings, sourceSettings, comparisonType, differences, sourceUrl, sourceStyleUrl, referenceUrl, studioUrl, model, creditCost }) => ({ key, name, style, brand, tagline, prompt, originalUserPrompt, designSettings, sourceSettings, comparisonType: comparisonType || 'mapped', differences, sourceUrl, sourceStyleUrl, referenceUrl, studioUrl, model, creditCost, referenceFile: key + '-reference.png', studioFile: key + '-studio.png', review: reviews[key] }));
writeFileSync(dir + '/collection-manifest.json', JSON.stringify({ outputs: saved.length, creditsUsed, creditsRemaining: manifest.balanceAfter, samples: publicSamples }, null, 2));
const csvCell = value => '"' + String(value || '').replaceAll('"', '""') + '"';
writeFileSync(dir + '/studio-projects.csv', '\uFEFF' + [['Style', 'Project', 'Studio URL', 'Source URL', 'Comparison'], ...publicSamples.map(entry => [entry.style, entry.name, entry.studioUrl, entry.sourceUrl, entry.comparisonType])].map(row => row.map(csvCell).join(',')).join('\r\n'));
console.log('Gathered ' + saved.length + ' styles into comparison.html, studio-overview.png, project index and collection manifest.');
