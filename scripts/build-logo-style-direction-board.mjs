import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { LOGO_ORIGINAL_CONCEPTS } from '../src/lib/logoOriginalConcepts.mjs';
import { LOGO_EXAMPLE_RECENT } from '../src/lib/logoExampleRecent.mjs';
import { normalizeLogoDesignSettings } from '../src/lib/logoDesignSettings.mjs';

const root = resolve('outputs/logo-style-direction-audit');
await mkdir(join(root, 'thumbs'), { recursive: true });
const definitions = [
  {
    style: 'mascot', name: 'Mascot', id: 'original-mintwheel', priority: 1,
    references: [['mascot', 0, 0, 'Angular head silhouette'], ['mascot', 4, 0, 'Controlled contour and keyline']],
    observed: 'The head contour, gaze and two or three shadow masses carry the identity. Accessories remain subordinate.',
    problem: 'Mintwheel has an almost straight-on neutral face, soft generic arms and little visual hierarchy between the frog and gear.',
    direction: 'Confident three-quarter frog portrait. Make the face dominant and use one broad gear silhouette as the profession cue.',
    summary: 'Stronger gaze; one clear gear; bold outer contour.',
    prompt: 'A confident tree-frog bicycle mechanic in three-quarter portrait, chin lifted and one eye slightly narrowed in a friendly knowing expression. Hold one large eight-tooth sprocket low against the chest. Build the head from broad curved planes, a firm jaw and two simple cheek shadows. One clean apron panel; no tiny tool details. Bold dark outer contour, lighter interior lines and open gaps around the hands. Set MINTWHEEL below in sturdy compact lettering.',
    settings: { mood: 'energetic', personality: 'dynamic' },
  },
  {
    style: 'wordmark', name: 'Wordmark / Logo Type', id: 'original-kovelune', priority: 1,
    references: [['wordmark', 2, 1, 'Compact readable custom letters'], ['wordmark', 1, 0, 'A deliberate word silhouette']],
    observed: 'Distinctive letter anatomy, consistent rhythm and text hierarchy make the word itself the mark. Detail does not have to mean ornament.',
    problem: 'Kovelune reads as a conventional editorial font with a colored accent. The letter construction has little proprietary character.',
    direction: 'Use one coherent custom wedge-serif construction: broad stems, generous counters and a matching diagonal treatment in K, V and N.',
    summary: 'Custom letter anatomy; consistent weight; deliberate spacing.',
    prompt: 'Create the exact word KOVELUNE as one custom bold upright wedge-serif wordmark. Use substantial stems, open counters and short clean wedge terminals. Give K a distinctive inward diagonal cut and repeat the same angle in V and N so the full word has one construction language. Keep every letter legible with careful optical spacing. Add MAKE ROOM FOR IDEAS as a small quiet supporting line. The letters are the complete logo; no separate icon or floating ornament.',
    settings: { letterType: 'block', fontFamily: 'serif', lettering: 'custom', rendering: 'modern', composition: 'horizontal' },
  },
  {
    style: 'monogram', name: 'Monogram', id: 'original-qz-foundry', priority: 1,
    references: [['monogram', 1, 0, 'One recognizable letter contour'], ['monogram', 2, 0, 'Purposeful negative-space cut']],
    observed: 'The initial reads first. An integrated secondary idea uses a counter or shared stroke without destroying the letter.',
    problem: 'QZ has several parallel diagonal bands. The overlaps compete and the Q is less immediate than it should be.',
    direction: 'One complete Q ring and one Z diagonal. Share the Q tail with the bottom Z terminal and remove duplicate rails.',
    summary: 'Readable Q + Z; one shared stroke; fewer parallel bands.',
    prompt: 'An unmistakable QZ monogram built from one heavy rounded-square Q ring and one clean Z diagonal. Make the Q tail become the lower Z terminal, with one deliberate separation gap at the crossing. Keep the Q counter large and the Z reading order clear. Uniform substantial stroke weight, optically corrected corners and a compact balanced silhouette. One warm gold ink on dark blue. Render only QZ, with no additional letters or symbols.',
    settings: { monogramTreatment: 'geometric', monogramWeight: 'bold', monogramFont: 'sans' },
  },
  {
    style: 'pictorial', name: 'Pictorial', id: 'original-lumipod', priority: 1,
    references: [['pictorial', 0, 0, 'Economical recognizable contour'], ['pictorial', 4, 0, 'A strong one-color silhouette']],
    observed: 'A few large masses and one or two distinctive cuts make the subject recognizable immediately, including in one color.',
    problem: 'Lumipod has overlapping leaf-like pieces and detached light shapes; the lantern idea is not immediate.',
    direction: 'Build a single lantern outline whose lower sides are petals. One handle and one central light cutout establish the object.',
    summary: 'One lantern contour; one light cutout; clear petal relationship.',
    prompt: 'A portable garden lantern whose body is shaped as a closed flower bud. Use one strong joined outer silhouette: a broad arched handle above a squat lantern body, with two petal tips forming its lower sides. One large teardrop-shaped negative-space light in the center makes the lantern readable. Keep the petal relationship clear without separate floating leaves. Solid deep green with a restrained amber light accent. Add a small clean LUMIPOD wordmark beneath.',
    settings: { detail: 'minimal', structure: 'organic' },
  },
  {
    style: 'badge', name: 'Badge / Crest', id: 'original-duskvale', priority: 2,
    references: [['badge', 0, 0, 'Shape and lettering hierarchy'], ['badge', 1, 0, 'Balanced symbol-to-frame scale']],
    observed: 'Enclosure, focal symbol and wording share a deliberate hierarchy. A badge can be simple or illustrative, but each part has a clear job.',
    problem: 'Duskvale has a large rim of lettering, a small telescope and ample unused interior space. It resembles a layout rather than a distinctive emblem.',
    direction: 'Use a compact circular observatory seal. Increase the telescope, turn the ridge into one broad base, and shorten the supporting text band.',
    summary: 'Larger focal telescope; simpler rim; tighter hierarchy.',
    prompt: 'A compact circular observatory badge for DUSKVALE. Let one tilted telescope and a single broad mountain ridge occupy most of the inner seal. Put DUSKVALE in substantial readable lettering along the upper rim and NIGHT OBSERVATORY in a quieter straight lower band. Two restrained star dots balance the telescope. One strong outer border and one fine inner separation; no redundant rings. Midnight blue and warm cream with a small rust accent.',
    settings: { badgeType: 'crest', badgeShape: 'circle', badgeDetail: 'illustrative' },
  },
  {
    style: 'line', name: 'Line Art', id: 'original-fernthread', priority: 1,
    references: [['line', 3, 0, 'Broad continuous contour'], ['line', 2, 0, 'Economical line rhythm']],
    observed: 'Many examples use substantial uniform strokes, generous counters and just enough line work to identify the subject. Line Art is not restricted to hairlines.',
    problem: 'Fernthread is a fine botanical drawing with many small leaves. The thin spool and gaps lose impact when reduced.',
    direction: 'A bold monoline spool-to-fern symbol with only four broad leaflet pairs and a purposeful open gap. Make the connection the idea.',
    summary: 'Thicker monoline; fewer leaves; recognizable at small size.',
    prompt: 'A compact bold monoline symbol of a thread spool whose loose strand becomes an unfurling fern. Draw the spool with two broad curved ends and one short body contour. Continue one strand upward into four large paired leaf loops. Use a consistent substantial stroke, rounded joins and generous open spaces; omit veins and fine botanical lines. Keep the spool and fern equally recognizable. One copper ink on ivory. Add FERNTHREAD below in restrained clean lettering.',
    settings: { lineThickness: 'thick', lineStructure: 'curved', detail: 'minimal' },
  },
  {
    style: 'cartoon', name: 'Cartoon', id: 'original-sunday-spore', priority: 2,
    references: [['cartoon', 0, 0, 'Rounded expressive character'], ['cartoon', 1, 1, 'Readable full-body action']],
    observed: 'A clear expression and rounded exaggerated anatomy carry the character. The subject reads independently of a large wordmark.',
    problem: 'The revised Sunday Spore is cleaner, but the large shoes and heavy serif lettering move it toward a retro mascot. Its logo style still needs a deliberate choice.',
    direction: 'Contemporary cartoon mushroom cook: expressive cap and face, compact articulated limbs and a clear serving gesture. Keep retro rubber-hose treatment for Zippear.',
    summary: 'Modern cartoon proportions; lively serving gesture; quieter type.',
    prompt: 'A contemporary cartoon mushroom cook presenting one wooden spoon with an inviting three-quarter gesture. A broad tilted red cap and compact cream stem-body form the main silhouette. Use expressive brows, a friendly grin, short articulated arms and small sturdy feet. One simple apron panel. Clean rounded contour construction, broad flat colors and one restrained shadow shape. Make the face readable before adding the modest rounded SUNDAY SPORE wordmark. Avoid oversized vintage shoes, wrinkles and decorative lettering.',
    settings: { mood: 'cheerful', personality: 'playful' },
  },
  {
    style: 'icon', name: 'Icon / Emoji', id: 'original-brimbop', priority: 2,
    references: [['icon', 4, 0, 'Distinctive compact object shape'], ['icon', 3, 0, 'Controlled broad color planes']],
    observed: 'Compact rounded object forms have consistent geometry and a limited palette. Interior detail is controlled rather than automatically removed.',
    problem: 'Brimbop is compact, but the steam curl, lid, spout and tiny wordmark have weak hierarchy and the apricot blends into the background.',
    direction: 'A rounded cloud-kettle silhouette with a bold periwinkle body, one apricot top plane and a single steam curve. Strengthen the object before type.',
    summary: 'Stronger object silhouette; higher contrast; consistent radii.',
    prompt: 'A friendly compact teapot icon with a rounded cloud-shaped body, a short lifted spout and one large open handle. Use a strong periwinkle body, an apricot lid and one broad darker side plane. A single short steam curve completes the top silhouette. Keep all corners and curve radii coordinated, the handle counter generous and the shape clear at small size. Place a small simple BRIMBOP wordmark below, with no extra decorative dots or surrounding scene.',
    settings: { detail: 'minimal', viewpoint: 'front', primaryColor: '#585E9A', secondaryColor: '#EDA769' },
  },
  {
    style: 'abstract', name: 'Abstract', id: 'original-prismfold', priority: 2,
    references: [['abstract', 1, 0, 'Coherent repeating geometry'], ['abstract', 3, 0, 'A purposeful shape relationship']],
    observed: 'Simple geometry follows a clear transformation rule. Negative space and element relationships are as important as the outer boundary.',
    problem: 'Prismfold has not been generated. Its first draft describes a ribbon without defining the exact fold topology clearly enough.',
    direction: 'Exactly three bent strips form one closed turning loop around a single triangular counter. A clear structural rule guides the mark.',
    summary: 'Three strips; one closed loop; one triangular counter.',
    prompt: 'An abstract mark made from exactly three broad bent paper strips joining into one compact closed loop around a single off-center triangular opening. Each strip turns once and passes its end to the next, creating a continuous folding rhythm. Use a shared strip width, precise junctions and one controlled offset. Deep blue and coral flat planes, no gradients, extra ribbons or literal subject. Add PRISMFOLD beneath in quiet neutral lettering.',
    settings: { detail: 'minimal', structure: 'geometric' },
  },
  {
    style: 'engraved', name: 'Engraved', id: 'original-cindermoth', priority: 2,
    references: [['engraved', 0, 0, 'Strong silhouette before hatching'], ['engraved', 3, 0, 'Selective tonal engraving']],
    observed: 'Contour and large light/dark masses establish the subject before directional cuts describe its form. Dense hatching alone does not create a better engraving.',
    problem: 'Cindermoth has finely rendered wings, but the silhouette is small and the fine lines compete with the rosemary. Its details weaken at thumbnail size.',
    direction: 'A larger moth, broad wing masses and two deliberate hatch groups per wing. Let the rosemary become a small supporting base.',
    summary: 'Larger moth silhouette; selective hatch groups; bold ink masses.',
    prompt: 'A bold engraved moth with four broad scalloped wing masses and a narrow central body. Establish the outer silhouette with solid dark ink first. Use two separated groups of directional engraved cuts per wing, following the wing curvature, with broad untouched light areas between them. A short rosemary sprig supports the lower body without competing with the wings. One deep blue ink on ivory, no gradients or dense microtexture. Set CINDERMOTH below in clear restrained serif capitals.',
    settings: { engravingStyle: 'vintage', engravingTechnique: 'line', lineQuality: 'varied', detail: 'minimal' },
  },
  {
    style: 'retro', name: 'Retro Mascot', id: 'original-zippear', priority: 1,
    references: [['retro', 0, 0, 'Strong retro silhouette and expression'], ['retro', 4, 0, 'Cohesive contour and ink shading']],
    observed: 'Retro character anatomy has a deliberate rhythm: a strong body shape, expressive face, controlled bent limbs and a readable pose. It is more than adding old-fashioned text.',
    problem: 'Zippear has a narrow wrinkled face, dark thin limbs and many small skate details. The pear and motion do not form a strong unified silhouette.',
    direction: 'A plump unmistakable pear, a broad friendly grin and one clear skating stride. Use thick curved limbs and simple chunky skates.',
    summary: 'Plump pear body; clean grin; one clear skating stride.',
    prompt: 'A cheerful retro pear mascot gliding forward in one clear roller-skating stride. Keep a broad plump pear body, one short stem and a small leaf. Use a large friendly grin, simple expressive eyes and smooth unwrinkled cheeks. Thick curved rubber-hose limbs, one arm extended for balance and simple chunky skates with large readable wheels. Three restrained spot inks, bold outer contour and one hard-edged shadow group. Add ZIPPEAR beneath in substantial easy-to-read vintage lettering.',
    settings: { mood: 'energetic', personality: 'vintage' },
  },
  {
    style: 'minimalist', name: 'Minimalist', id: 'original-notchfold', priority: 2,
    references: [['pictorial', 0, 0, 'Closest category: simple solid marks'], ['pictorial', 4, 0, 'Immediate one-color recognition']],
    observed: 'There is no separate Minimalist tab in this gallery. The closest useful construction references are economical one-color Pictorial marks.',
    problem: 'Notchfold reads more like a folded book than a kite. The tiny white crossing and tail do not establish the subject clearly.',
    direction: 'A recognizable four-point kite contour with two broad filled planes, one generous fold gap and a short bold bent tail.',
    summary: 'Recognizable kite first; large fold gap; bold short tail.',
    prompt: 'A minimalist paper-kite mark with a clear four-point diamond contour, built from two broad solid triangular planes. Separate the planes with one generous angled negative-space fold, not a hairline cross. Add a short confident bent ribbon tail that makes the kite immediately recognizable. One deep green ink, optical balance and open space. Set NOTCHFOLD beneath in compact restrained lettering. Remove small interior marks and avoid a book-like square silhouette.',
    settings: { symbolConstruction: 'solid', structure: 'geometric' },
  },
  {
    style: 'streetwear-lettering', name: 'Streetwear Lettering', id: 'darkmen-emerald-champagne', priority: 3,
    references: [['wordmark', 1, 1, 'Closest category: ornamental lettering'], ['wordmark', 2, 0, 'A deliberate whole-word envelope']],
    observed: 'There is no separate Streetwear tab here. Logo Type provides general lettering hierarchy and envelope references; the original DARKMEN artwork already supplies our approved direction.',
    problem: 'The ten DARKMEN examples are explicitly approved to stay. They are not part of the rejected replacement batch.',
    direction: 'Keep the ten current designs. Future variants must preserve genre-specific letters, open counters and a consistent outline/depth system.',
    summary: 'KEEP approved DARKMEN. Review only; no regeneration.',
    keep: true,
  },
];

const positions = { pictorial: 143, wordmark: 143, mascot: 494, badge: 314, monogram: 314, line: 314, cartoon: 314, icon: 314, abstract: 314, engraved: 314, retro: 314 };
const xs = [289, 520, 750, 981, 1212];
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const data = [];
for (const [index, d] of definitions.entries()) {
  const original = LOGO_ORIGINAL_CONCEPTS.find(c => c.id === d.id) || LOGO_EXAMPLE_RECENT.find(c => c.id === d.id);
  assert(original, d.id);
  const settings = { ...original.designSettings, ...d.settings };
  assert.deepEqual(normalizeLogoDesignSettings(settings, d.style), settings, d.id);
  const refs = [];
  for (const [j, [file, column, row, caption]] of d.references.entries()) {
    const input = join(root, 'references', `${file}.png`);
    const output = join(root, 'thumbs', `${d.style}-${j + 1}.webp`);
    await sharp(input).extract({ left: xs[column], top: positions[file] + row * 230, width: 217, height: 217 }).resize(300, 300).webp({ quality: 88 }).toFile(output);
    refs.push({ file: `thumbs/${d.style}-${j + 1}.webp`, caption, source: 'https://logodiffusion.com/', category: file });
  }
  let current = null;
  const published = LOGO_EXAMPLE_RECENT.find(c => c.id === d.id);
  if (published) {
    current = `thumbs/${d.style}-current.webp`;
    await sharp(`public${published.image.split('?')[0]}`).resize(300, 300).webp({ quality: 88 }).toFile(join(root, current));
  }
  data.push({ number: index + 1, ...d, references: refs, current, brand: original.brand, tagline: original.tagline || '',
    proposedSettings: settings, proposedPrompt: d.keep ? original.prompt : d.prompt,
    status: d.keep ? 'Keep approved examples' : d.style === 'abstract' ? 'Original draft; not generated' : 'Revised direction; not generated' });
}
await writeFile(join(root, 'directions.json'), JSON.stringify({ reviewedAt: new Date().toISOString(), scope: 'All eleven gallery categories plus our Minimalist and Streetwear categories', source: 'Manual visual review of category galleries; no gallery prompt copied and no competitor reference image used in generation.', paidGenerations: 0, items: data }, null, 2));
await writeFile(join(root, 'original-revised-prompts.json'), JSON.stringify(data.filter(d => !d.keep).map(d => ({ style: d.style, brand: d.brand, tagline: d.tagline, prompt: d.proposedPrompt, designSettings: d.proposedSettings })), null, 2));

const asset = async file => 'data:image/webp;base64,' + (await readFile(join(root, file))).toString('base64');
const cards = [];
for (const d of data) {
  const refs = await Promise.all(d.references.map(async r => `<figure><img src="${await asset(r.file)}" alt="${esc(r.caption)}"><figcaption>${esc(r.caption)}</figcaption></figure>`));
  const current = d.current ? `<img src="${await asset(d.current)}" alt="Current ${esc(d.brand)} result">` : '<div class="draft">Original brief<br>not generated</div>';
  cards.push(`<article id="${d.style}" data-style="${d.style}" data-priority="${d.priority}"><header class="card-head"><span class="number">${String(d.number).padStart(2, '0')}</span><div><h2>${esc(d.name)}</h2><p>${esc(d.brand)} · ${esc(d.status)}</p></div><span class="pill">${d.keep ? 'KEEP' : d.priority === 1 ? 'PRIORITY' : 'REFINE'}</span></header><div class="visuals"><div class="reference-pair">${refs.join('')}<a href="https://logodiffusion.com/" target="_blank" rel="noreferrer">Reference: Logo Diffusion gallery ↗</a></div><figure class="ours">${current}<figcaption>Current Syncraft result</figcaption></figure></div><div class="notes"><section><h3>What works in the references</h3><p>${esc(d.observed)}</p></section><section><h3>What is weak in ours</h3><p>${esc(d.problem)}</p></section><section class="direction"><h3>Original direction to build</h3><p>${esc(d.direction)}</p></section></div><details><summary>${d.keep ? 'Existing approved brief' : 'Revised original prompt & settings'}</summary><p class="prompt">${esc(d.proposedPrompt || 'Brand and selected controls only.')}</p><pre>${esc(JSON.stringify(d.proposedSettings, null, 2))}</pre></details></article>`);
}
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Syncraft / All-style logo direction review</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f2f1ec;color:#232722;font:16px/1.55 system-ui,sans-serif}main{max-width:1420px;margin:auto;padding:48px 28px 64px}.eyebrow{font-size:12px;letter-spacing:.14em;font-weight:700;color:#52634d}h1{font-size:clamp(38px,5vw,64px);line-height:1.03;letter-spacing:-.055em;margin:15px 0 20px}.intro{max-width:900px;color:#5c6259;font-size:18px}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:26px 0}.stats span{padding:10px 16px;border:1px solid #d4d8cb;background:#fff;border-radius:8px}.summary{padding:24px;background:#e2e9d5;border-radius:12px;margin:28px 0}.summary h2{font-size:21px;margin:0 0 10px}.summary p{margin:8px 0}.toolbar{position:sticky;top:0;background:#f2f1ecf5;backdrop-filter:blur(12px);display:flex;gap:10px;align-items:center;padding:16px 0;z-index:2}.toolbar select{padding:11px 14px;max-width:100%;font:inherit;background:white;border:1px solid #bac2b1;border-radius:8px}.toolbar span{margin-left:auto;color:#62685f;font-size:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{background:#fff;border:1px solid #dce0d5;border-radius:14px;overflow:hidden;scroll-margin-top:90px}.card-head{display:flex;gap:12px;padding:22px;align-items:center;border-bottom:1px solid #e7e9e1}.number{font-size:14px;color:#81906f}h2{font-size:23px;letter-spacing:-.03em;line-height:1.2;margin:0}.card-head p{font-size:12px;color:#65705e;margin:6px 0 0}.pill{margin-left:auto;border:1px solid #bac6ad;border-radius:20px;padding:5px 9px;font-size:10px;font-weight:700;white-space:nowrap}.visuals{display:grid;grid-template-columns:2fr 1fr;gap:15px;padding:20px;background:#f7f7f3}.reference-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start}.reference-pair a{grid-column:1/-1;color:#65705e;font-size:11px}figure{margin:0;min-width:0}figure img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border:1px solid #e2e5db;border-radius:8px}figcaption{font-size:11px;color:#66705f;margin:7px 0}.ours{border-left:1px solid #d9dfce;padding-left:14px}.draft{aspect-ratio:1;background:#eef0e7;border:1px dashed #aeb99c;display:grid;place-content:center;text-align:center;color:#5e6c50;border-radius:8px;font-size:13px}.notes{padding:20px 22px}.notes section+section{margin-top:17px}h3{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#61734f;margin:0 0 6px}.notes p{font-size:14px;line-height:1.6;margin:0}.direction{background:#f0f4e8;padding:14px;border-left:3px solid #7e975a}details{margin:0 22px 22px;border-top:1px solid #e5e8de;padding-top:15px}summary{cursor:pointer;font-size:13px;font-weight:600}.prompt{font-size:13px;line-height:1.65}pre{font-size:11px;background:#f6f6f2;padding:12px;overflow:auto}.footer{font-size:13px;color:#66705f;margin-top:32px}a{color:#425a30}[hidden]{display:none!important}@media(max-width:800px){.grid{grid-template-columns:1fr}main{padding:28px 16px}.toolbar{flex-wrap:wrap}.toolbar span{margin-left:0}h2{font-size:21px}}</style></head><body><main><div class="eyebrow">SYNCRAFT / PRIVATE DESIGN STUDY</div><h1>Better logos.<br>Clearer directions.</h1><p class="intro">A visual review of every Logo Diffusion gallery style, compared with our original examples. Each direction keeps our own subject and wording and describes specific construction decisions to test.</p><div class="stats"><span><strong>11</strong> gallery categories reviewed</span><span><strong>13</strong> Syncraft styles assessed</span><span><strong>0</strong> paid generations</span></div><section class="summary"><h2>The problem is construction, not a lack of prompt adjectives.</h2><p>Several current examples have generic illustration anatomy, conventional lettering and weak symbol-to-type hierarchy. The strongest references have a distinct silhouette, coherent internal geometry and one clear visual idea.</p><p>Next quality gate: assess symbol recognition and exact lettering at full size and at thumbnail size, then inspect counters, anatomy, line rhythm and unwanted background effects. Prompt validation alone cannot establish visual quality or parity between models.</p></section><nav class="toolbar" aria-label="Filter review"><select id="filter" aria-label="Choose a logo style"><option value="all">All 13 styles</option value="priority">Priority improvements</option>${data.map(d => `<option value="${d.style}">${esc(d.name)}</option>`).join('')}</select><span>Reference artwork: Logo Diffusion · Current results: Syncraft</span></nav><div class="grid">${cards.join('')}</div><p class="footer">This is a private reference-and-critique board. Reference thumbnails remain outside the app's public assets. Revised prompts are independently written; none of these directions has been generated or published. The ten approved DARKMEN streetwear examples stay in place. <a href="original-revised-prompts.json">Download revised prompt set</a></p></main><script>document.getElementById('filter').addEventListener('change',function(){document.querySelectorAll('article[data-style]').forEach(function(card){card.hidden=!(this.value==='all'||card.dataset.style===this.value||(this.value==='priority'&&card.dataset.priority==='1'));},this);});</script></body></html>`;
await writeFile(join(root, 'board.html'), page);

// A compact visual index includes every style; the detailed board holds the full critique.
const width = 1540, columns = 4, cardWidth = 355, cardHeight = 375, gap = 20, margin = 30;
const height = 185 + Math.ceil(data.length / columns) * (cardHeight + gap) + 30;
const text = [], layers = [];
const wrap = (value, limit = 35) => {
  const lines = []; let line = '';
  for (const word of value.split(' ')) { if ((line + ' ' + word).trim().length > limit && line) { lines.push(line); line = word; } else line = (line + ' ' + word).trim(); }
  if (line) lines.push(line); return lines;
};
text.push(`<rect width="${width}" height="${height}" fill="#F2F1EC"/><text x="30" y="57" font-size="36" font-weight="700">ALL-STYLE LOGO DIRECTION REVIEW</text><text x="30" y="96" font-size="21" fill="#5C6259">11 gallery categories reviewed · 13 styles assessed · original briefs · no paid generations</text><text x="30" y="137" font-size="18" fill="#5C6259">Per card: two Logo Diffusion reference thumbnails, then our current result. Full critique is in board.html.</text>`);
for (const [i, d] of data.entries()) {
  const x = margin + (i % columns) * (cardWidth + gap), y = 180 + Math.floor(i / columns) * (cardHeight + gap);
  text.push(`<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="12" fill="white" stroke="#DCE0D5"/><text x="${x + 16}" y="${y + 35}" font-size="21" font-weight="700">${String(i + 1).padStart(2, '0')} / ${esc(d.name)}</text><text x="${x + 16}" y="${y + 64}" font-size="14" fill="#61734F">${esc(d.brand)}</text>`);
  const pics = [d.references[0].file, d.references[1].file, d.current];
  for (let j = 0; j < pics.length; j++) {
    const px = x + 16 + j * 109;
    if (pics[j]) layers.push({ input: await sharp(join(root, pics[j])).resize(105, 105).png().toBuffer(), left: px, top: y + 88 });
    else text.push(`<rect x="${px}" y="${y + 88}" width="105" height="105" fill="#EEF0E7"/><text x="${px + 11}" y="${y + 136}" font-size="15">Not yet</text><text x="${px + 11}" y="${y + 156}" font-size="15">generated</text>`);
    text.push(`<text x="${px}" y="${y + 215}" font-size="13" fill="#66705F">${j < 2 ? 'REFERENCE ' + (j + 1) : 'CURRENT'}</text>`);
  }
  wrap(d.summary, 35).forEach((line, k) => text.push(`<text x="${x + 16}" y="${y + 253 + k * 25}" font-size="17">${esc(line)}</text>`));
  text.push(`<text x="${x + 16}" y="${y + cardHeight - 20}" font-size="13" fill="#66705F">${d.keep ? 'KEEP APPROVED DARKMEN' : d.priority === 1 ? 'PRIORITY IMPROVEMENT' : 'REFINE CONSTRUCTION'}</text>`);
}
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g font-family="Arial,sans-serif" fill="#232722">${text.join('')}</g></svg>`);
await sharp(svg).composite(layers).png().toFile(join(root, 'overview.png'));
console.log(JSON.stringify({ reviewedGalleryStyles: 11, assessedStyles: data.length, originalRevisedPrompts: data.filter(d => !d.keep).length, preservedDarkmen: 10, paidGenerations: 0, output: root }));
