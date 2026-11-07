import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import JSZip from 'jszip';
import { LOGO_ORIGINAL_CONCEPTS } from '../src/lib/logoOriginalConcepts.mjs';

const run = promisify(execFile);
const root = resolve('outputs/logo-studio-carousel-white');
const source = resolve('outputs/original-logo-marketing');
const samples = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8')).samples;
const entries = samples.filter(s => s.status === 'succeeded').map(s => {
  const preset = LOGO_ORIGINAL_CONCEPTS.find(e => e.id === s.id);
  if (!preset) throw new Error(`Missing example: ${s.key}`);
  return { ...s, title: preset.title, original: join(source, `${s.key}.png`) };
});
if (entries.length !== 11 || new Set(entries.map(e => e.style)).size !== 11) {
  throw new Error('Expected eleven completed original logos covering eleven styles.');
}
for (const dir of ['cards', 'editable', 'originals', 'metadata']) mkdirSync(join(root, dir), { recursive: true });

// Reuse the exact embedded Outfit font and brand mark from the approved white posters.
const reference = readFileSync('outputs/darkmen-carousel-white/editable/00-cover.html', 'utf8');
const fontFace = reference.match(/@font-face\{[^}]+\}/)?.[0];
if (!fontFace) throw new Error('Missing embedded Outfit font in the reference poster.');
const brand = 'data:image/svg+xml;base64,' + Buffer.from(readFileSync('public/logo.svg', 'utf8').replaceAll('#d4ff59', '#171717')).toString('base64');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const descriptions = {
  mintwheel: ['Tree-frog bicycle mechanic', 'Mascot', ['Portrait', 'Minimal detail', 'Friendly', 'Playful']],
  kovelune: ['KOVELUNE', 'Wordmark', ['Bold', 'Horizontal', 'Minimal detail', 'Elegant']],
  'qz-foundry': ['QZ', 'Monogram', ['Uppercase QZ', 'Geometric', 'Sans serif', 'Professional']],
  lumipod: ['Flower-bud lantern', 'Pictorial', ['Organic', 'Minimal detail', 'Comforting']],
  duskvale: ['DUSKVALE', 'Badge', ['Crest', 'Illustrative', 'Nostalgic', 'Classic']],
  fernthread: ['FERNTHREAD', 'Line art', ['Thin lines', 'Curved', 'Minimal detail', 'Elegant']],
  'sunday-spore': ['SUNDAY SPORE', 'Cartoon', ['Full body', 'Minimal detail', 'Energetic', 'Dynamic']],
  zippear: ['ZIPPEAR', 'Retro mascot', ['Lively', 'Playful']],
  cindermoth: ['CINDERMOTH', 'Engraved', ['Vintage', 'Line engraving', 'Fine lines', 'Elegant']],
  brimbop: ['BRIMBOP', 'Icon', ['Front view', 'Minimal detail', 'Friendly', 'Modern']],
  notchfold: ['NOTCHFOLD', 'Minimalist', ['Solid silhouette', 'Geometric', 'Clean', 'Minimalist']],
};
for (const e of entries) {
  e.image = 'data:image/png;base64,' + readFileSync(e.original).toString('base64');
  [e.subject, e.category, e.settingLabels] = descriptions[e.key];
  copyFileSync(e.original, join(root, 'originals', `${e.key}.png`));
  writeFileSync(join(root, 'metadata', `${e.key}.json`), JSON.stringify({
    title: e.title, style: e.style, brand: e.brand, tagline: e.tagline, prompt: e.prompt,
    designSettings: e.designSettings, studioUrl: e.studioUrl,
    note: 'Only the generated Studio result is used. Printed swatches are selected input colors; generated artwork may differ.',
  }, null, 2));
}
const css = `${fontFace}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1350px;overflow:hidden;background:#fff;color:#171717;font-family:Outfit,sans-serif}
.canvas{position:relative;width:1080px;height:1350px;padding:64px;background:#fff}
.top{height:38px;display:flex;align-items:center;justify-content:space-between}.top img{width:170px;display:block}.top span{font-size:20px;color:#777}
.heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:53px 0 25px}.heading h1{font-size:43px;line-height:1.12;font-weight:500;letter-spacing:-.04em;margin:0}.heading span{font-size:20px;color:#777;white-space:nowrap}
.hero{width:952px;height:650px;overflow:hidden;border-radius:6px;display:flex;align-items:center;justify-content:center}.hero img{display:block;width:100%;height:100%;object-fit:contain}
.palette{display:flex;justify-content:space-between;gap:16px;margin-top:23px;padding-bottom:24px;border-bottom:1px solid #e7e7e7}.color{display:flex;align-items:center;gap:11px}.swatch{width:24px;height:32px;border:1px solid #0002;border-radius:3px}.color small{font-size:14px;color:#777;display:block;line-height:1.15}.color strong{font-size:18px;font-weight:400;display:block;margin-top:4px}
.inputs{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:32px}.inputs p{font-size:29px;font-weight:500;letter-spacing:-.015em;line-height:1.25;margin:0}.inputs p.long{font-size:25px}.label{font-size:14px;letter-spacing:.13em;font-weight:500;color:#777;margin:0 0 12px}
.settings{display:flex;align-items:center;margin-top:31px;flex-wrap:wrap;row-gap:7px}.settings span{font-size:20px;color:#333;line-height:1.5}.settings span+span:before{content:'·';color:#aaa;display:inline-block;margin:0 15px}
.footer{position:absolute;bottom:42px;left:64px;right:64px;display:flex;justify-content:space-between;align-items:center;color:#888;font-size:17px}.footer strong{font-weight:400;color:#444}
.intro{margin-top:65px}.intro .label{margin-bottom:16px;font-size:18px;letter-spacing:0}.intro h1{font-size:100px;font-weight:600;letter-spacing:-.065em;line-height:1.02;margin:0}.intro h1 span{color:#999;font-weight:400}.intro p{font-size:25px;line-height:1.4;color:#777;margin:23px 0 0}
.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:37px}.tile{height:174px;overflow:hidden;border-radius:5px;border:1px solid #eee}.tile img{width:100%;height:100%;display:block;object-fit:contain}
.cover-bottom{margin-top:32px;padding-top:24px;border-top:1px solid #e7e7e7;display:flex;align-items:center;justify-content:space-between}.cover-bottom h2{font-size:29px;font-weight:500;letter-spacing:-.03em;margin:0}.cover-bottom p{font-size:20px;color:#777;margin:7px 0 0}.arrow{font-size:40px;font-weight:300}
.closing-intro{margin-top:68px}.closing-intro h1{font-size:83px;line-height:1.04;letter-spacing:-.06em;font-weight:500;margin:0}.closing-intro h1 span{font-weight:400;color:#999}.closing-intro p{font-size:25px;line-height:1.4;color:#777;margin:24px 0 0}.site-cta{display:inline-flex;align-items:center;gap:30px;margin-top:24px;font-size:27px;font-weight:500;padding-bottom:8px;border-bottom:1px solid #171717}.closing .tiles{margin-top:35px}.closing .tile{height:151px}.save-note{font-size:21px;text-align:center;color:#555;margin-top:28px}
`;
const document = (content, type = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1080,initial-scale=1"><title>Syncraft / Logo Studio / 11 Original Styles</title><style>${css}</style></head><body><main class="canvas ${type}">${content}</main></body></html>`;
const header = `<header class="top"><img src="${brand}" alt="Syncraft"><span>Logo Studio</span></header>`;
const footer = n => `<footer class="footer"><strong>syncraftech.com</strong><span>${String(n).padStart(2, '0')} / 13</span></footer>`;
const tiles = () => `<div class="tiles">${entries.map(e => `<div class="tile" style="background:${e.designSettings.backgroundColor || '#FFFFFF'}"><img src="${e.image}" alt="${esc(e.title)}"></div>`).join('')}</div>`;
const files = [{ name: '00-cover', html: document(`${header}<section class="intro"><p class="label">A little logo inspiration.</p><h1>Logo Studio.<br><span>11 original styles.</span></h1><p>From bold mascots to custom lettering.</p></section>${tiles()}<div class="cover-bottom"><div><h2>Find a direction. Make it yours.</h2><p>Swipe for logos, colors &amp; selected settings.</p></div><span class="arrow">→</span></div>${footer(1)}`, 'cover') }];
entries.forEach((e, i) => {
  const swatches = [['Primary', 'primaryColor'], ['Secondary', 'secondaryColor'], ['Outline', 'outlineColor'], ['Background', 'backgroundColor']]
    .filter(([, key]) => e.designSettings[key])
    .map(([label, key]) => `<div class="color"><span class="swatch" style="background:${e.designSettings[key]}"></span><div><small>${label}</small><strong>${e.designSettings[key]}</strong></div></div>`).join('');
  const leftLabel = e.key === 'qz-foundry' ? 'MAIN LETTERS' : e.brand ? 'MAIN TEXT' : 'SUBJECT';
  const leftValue = e.style === 'monogram' ? e.designSettings.monogramLetters : e.brand || e.subject;
  const rightLabel = e.tagline ? 'TAGLINE' : 'STYLE';
  const rightValue = e.tagline || e.category;
  files.push({ name: `${String(i + 1).padStart(2, '0')}-${e.key}`, html: document(`${header}<div class="heading"><h1>${esc(e.title)}</h1><span>${esc(e.category)}</span></div><div class="hero" style="background:${e.designSettings.backgroundColor || '#FFFFFF'}"><img src="${e.image}" alt="${esc(e.title)}"></div><div class="palette">${swatches}</div><section class="inputs"><div><h2 class="label">${leftLabel}</h2><p class="${leftValue.length > 22 ? 'long' : ''}">${esc(leftValue)}</p></div><div><h2 class="label">${rightLabel}</h2><p>${esc(rightValue)}</p></div></section><div class="settings">${e.settingLabels.map(label => `<span>${esc(label)}</span>`).join('')}</div>${footer(i + 2)}`) });
});
files.push({ name: '12-create-your-own', html: document(`${header}<section class="closing-intro"><h1>Found your style?<br><span>Make it your own.</span></h1><p>Start with an idea. Explore a style.<br>Create your next logo in Syncraft Logo Studio.</p><div class="site-cta">syncraftech.com <span>→</span></div></section>${tiles()}<p class="save-note">Save this collection for your next idea.</p>${footer(13)}`, 'closing') });
for (const f of files) writeFileSync(join(root, 'editable', `${f.name}.html`), f.html);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profiles = join(tmpdir(), `syncraft-logo-poster-render-${Date.now()}`);
async function render(f) {
  const output = join(root, 'cards', `${f.name}.png`);
  await run(chrome, ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1080,1350', '--virtual-time-budget=5000', `--user-data-dir=${join(profiles, f.name)}`, `--screenshot=${output}`, pathToFileURL(join(root, 'editable', `${f.name}.html`)).href], { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  const meta = await sharp(output).metadata();
  if (meta.width !== 1080 || meta.height !== 1350) throw new Error(`Incorrect dimensions: ${f.name}`);
  console.log(`Exported ${f.name}`);
}
for (let i = 0; i < files.length; i += 3) await Promise.all(files.slice(i, i + 3).map(render));

const layers = await Promise.all(files.map(async (f, i) => ({ input: await sharp(join(root, 'cards', `${f.name}.png`)).resize(270, 338).png().toBuffer(), left: 18 + (i % 5) * 288, top: 18 + Math.floor(i / 5) * 356 })));
await sharp({ create: { width: 1458, height: 1086, channels: 3, background: '#ededed' } }).composite(layers).png().toFile(join(root, 'contact-sheet.png'));
copyFileSync(join(root, 'cards', '00-cover.png'), join(root, 'logo-studio-11-original-styles-poster.png'));
const rows = files.map(f => `<figure><a href="cards/${f.name}.png"><img src="cards/${f.name}.png" loading="lazy" alt="${esc(f.name)}"></a><figcaption><a href="cards/${f.name}.png" download>Download PNG</a></figcaption></figure>`).join('');
writeFileSync(join(root, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logo Studio / 11 Original Styles</title><style>body{margin:0;padding:32px;background:#fff;color:#171717;font:16px/1.5 system-ui}header{max-width:1450px;margin:0 auto 30px}h1{font-size:42px;letter-spacing:-.04em}main{max-width:1450px;margin:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}figure{margin:0}img{width:100%;border:1px solid #eee}a{color:inherit}figcaption{padding:10px 0}</style><header><h1>Logo Studio / 11 Original Styles</h1><p>13 posters at 1080 × 1350. Cover + 11 original generated logos + closing card.</p><p><a href="logo-studio-poster-pack.zip" download>Download the complete pack</a></p></header><main>${rows}</main></html>`);
const readme = `SYNCraft / LOGO STUDIO — 11 ORIGINAL STYLES\n\n13 PNG carousel cards at 1080 x 1350.\nOrder: 00-cover, 01 through 11, then 12-create-your-own.\nThe standalone poster is logo-studio-11-original-styles-poster.png.\nWhite layout, embedded Outfit font and black Syncraft logo match the earlier streetwear posters.\nOnly the 11 saved Studio-generated results from independently written prompts are used. Original images are in originals/ and are preserved without cropping.\nEditable self-contained HTML is in editable/. Actual prompts, input text, selected colors and settings are in metadata/.\nPrinted settings are concise selections. Swatches show requested input colors, which generated artwork may interpret differently.\nThe selected outputs were generated through normal Studio billing. This poster export makes no image-generation calls or credit changes. Nothing has been posted to social media.\n`;
writeFileSync(join(root, 'README.txt'), readme);
const prompts = JSON.stringify(entries.map(({ title, style, brand, tagline, prompt, designSettings }) => ({ title, style, brand, tagline, prompt, designSettings })), null, 2);
writeFileSync(join(root, 'original-prompts.json'), prompts);
const zip = new JSZip();
zip.file('original-prompts.json', prompts);
for (const f of files) {
  zip.file(`carousel/${f.name}.png`, readFileSync(join(root, 'cards', `${f.name}.png`)));
  zip.file(`editable/${f.name}.html`, f.html);
}
for (const e of entries) {
  zip.file(`originals/${e.key}.png`, readFileSync(e.original));
  zip.file(`metadata/${e.key}.json`, readFileSync(join(root, 'metadata', `${e.key}.json`)));
}
for (const name of ['README.txt', 'index.html', 'contact-sheet.png', 'logo-studio-11-original-styles-poster.png']) {
  const content = readFileSync(join(root, name));
  zip.file(name, name === 'index.html' ? content.toString('utf8').replaceAll('cards/', 'carousel/') : content);
}
writeFileSync(join(root, 'logo-studio-poster-pack.zip'), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
console.log(`Completed ${files.length} posters: ${root}`);
