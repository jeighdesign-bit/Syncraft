import { buildV2 } from './darkmen-carousel-v2-layout.mjs';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import JSZip from 'jszip';

const run = promisify(execFile);
const root = resolve('outputs/darkmen-carousel-v2');
for (const folder of ['cards', 'editable', 'originals', 'metadata']) mkdirSync(join(root, folder), { recursive: true });
const sources = ['outputs/darkmen-marketing', 'outputs/darkmen-marketing-seven'];
const entries = sources.flatMap(dir => JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).variants
  .filter(v => v.status === 'succeeded').map(v => ({ ...v, sourcePath: join(dir, v.key + '.png') })));
if (entries.length !== 10 || new Set(entries.map(v => v.key)).size !== 10) throw Error('Expected ten unique finished originals.');
const copy = existsSync('outputs/darkmen-carousel/card-copy.json') ? JSON.parse(readFileSync('outputs/darkmen-carousel/card-copy.json', 'utf8')) : [];
const copyEntries = Array.isArray(copy) ? copy : copy.entries || copy.cards || [];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const letters = { gothic:'Gothic', script:'Chicano-inspired script', 'racing-script':'Racing script', 'spiked-display':'Spiked display', 'flared-serif':'Flared serif', 'retro-swash':'Retro swash' };
const title = s => s.charAt(0).toUpperCase() + s.slice(1);
const logo = 'data:image/svg+xml;base64,' + readFileSync('public/logo.svg').toString('base64');
for (const v of entries) {
  v.image = 'data:image/png;base64,' + readFileSync(v.sourcePath).toString('base64');
  v.shortTitle = v.title.replace(' Gothic','').replace(' Chicano Script','').replace(' Racing Script','');
  const c = copyEntries.find(x => x.key === v.key);
  v.promptIdea = c?.editorialPrompt || c?.promptIdea || c?.shortPrompt || c?.prompt || `Custom DARKMEN lettering with ${letters[v.settings.streetwearLetters].toLowerCase()} construction, ${v.settings.streetwearLayout} proportions and ${v.settings.streetwearDepth} depth. Add ENTERPRISE beneath in a clean supporting typeface.`;
  copyFileSync(v.sourcePath, join(root, 'originals', v.key + '.png'));
}
const files = buildV2(entries, letters, logo);
for(const v of entries) writeFileSync(join(root,'metadata',v.key+'.json'), JSON.stringify({...v,image:undefined,editorialNote:'Direction text summarizes the intended selected settings, not the exact compiled prompt.'},null,2));
for(const f of files) writeFileSync(join(root,'editable',f.name+'.html'),f.html);
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const profileRoot=join(tmpdir(),'darkmen-carousel-render-'+Date.now());
async function render(f){const output=join(root,'cards',f.name+'.png');await run(chrome,['--headless=new','--disable-gpu','--disable-extensions','--no-first-run','--hide-scrollbars','--force-device-scale-factor=1','--window-size=1080,1350','--virtual-time-budget=5000','--user-data-dir='+join(profileRoot,f.name),'--screenshot='+output,pathToFileURL(join(root,'editable',f.name+'.html')).href],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});const meta=await sharp(output).metadata();if(meta.width!==1080||meta.height!==1350)throw Error('Wrong export size: '+f.name);console.log('Exported '+f.name);}
for(let i=0;i<files.length;i+=3)await Promise.all(files.slice(i,i+3).map(render));
const layers=[];
for(let i=0;i<files.length;i++)layers.push({input:await sharp(join(root,'cards',files[i].name+'.png')).resize(324,405).png().toBuffer(),left:18+(i%4)*342,top:18+Math.floor(i/4)*423});
await sharp({create:{width:1386,height:1287,channels:3,background:'#292e2a'}}).composite(layers).png().toFile(join(root,'contact-sheet.png'));
const rows=files.map(f=>`<figure><a href="cards/${f.name}.png"><img src="cards/${f.name}.png" loading="lazy" alt="${f.name}"></a><figcaption>${f.name}<br><a href="cards/${f.name}.png" download>Download PNG</a></figcaption></figure>`).join('');
writeFileSync(join(root,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DARKMEN — Lettering Studies</title><style>body{font:16px/1.5 Arial;background:#121416;color:#eff0e9;margin:0;padding:30px}header{max-width:1200px;margin:0 auto 30px}h1{font-size:42px;letter-spacing:-.04em}main{max-width:1400px;margin:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}figure{margin:0}img{width:100%;display:block;border:1px solid #d1d6c8;border-radius:8px}figcaption{padding:12px 0}a{color:#d4ff59}</style><header><h1>DARKMEN / ENTERPRISE</h1><p>11 carousel PNGs · 1080 × 1350 · cover + 10 designs</p><p><a href="darkmen-marketing-pack.zip" download>Download the complete pack</a> · <a href="originals/">Original logos</a></p></header><main>${rows}</main></html>`);
writeFileSync(join(root,'README.txt'),`DARKMEN / ENTERPRISE — Syncraft Logo Studio marketing collection\n\nV2: dark editorial design, embedded Outfit font, unboxed Syncraft logo.
11 carousel PNGs at 1080 x 1350: publish 00-cover first, followed by 01 through 10.\n10 original generated PNG logos are in originals/.\nEditable self-contained HTML layouts are in editable/.\nExact compiled prompts, selected controls, and Studio project links are in metadata/.\nPrompt ideas printed on the cards are editorial summaries, not exact reproductions of the lengthy compiled generation prompt. Settings and color hex values are the actual saved selections; generated artwork may interpret them differently.\nNo new logo generation or account credit changes were needed for this carousel.\nNo social post has been published.\n`);
const zip=new JSZip();
for(const f of files){zip.file('carousel/'+f.name+'.png',readFileSync(join(root,'cards',f.name+'.png')));zip.file('editable/'+f.name+'.html',f.html);}
for(const v of entries){zip.file('originals/'+v.key+'.png',readFileSync(v.sourcePath));zip.file('metadata/'+v.key+'.json',readFileSync(join(root,'metadata',v.key+'.json')));}
zip.file('README.txt',readFileSync(join(root,'README.txt')));zip.file('contact-sheet.png',readFileSync(join(root,'contact-sheet.png')));
writeFileSync(join(root,'darkmen-marketing-pack.zip'),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));
console.log('Pack complete: '+root);
