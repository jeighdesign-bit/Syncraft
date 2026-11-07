import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { create as createFont } from 'fontkit';
import sharp from 'sharp';
import { hasLogoVisualDirection, LOGO_VISUAL_GUIDE_VERSION } from './logoVisualDirection.mjs';

const assetRoot = path.join(process.cwd(), 'src', 'assets', 'logo-guides');
const fonts = new Map();
const artwork = new Map();
const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFFFFF"/>${content}</svg>`;
const fontFiles = { sans:'inter', serif:'merriweather', script:'lobster', cursive:'lobster', gothic:'unifrakturcook', rounded:'nunito', bubble:'lilita-one', geometric:'outfit', block:'anton' };

async function loadFont(family) {
  const name = fontFiles[family] || fontFiles.sans;
  if (!fonts.has(name)) fonts.set(name, readFile(path.join(assetRoot,'fonts',`${name}.woff2`)).then(createFont));
  return fonts.get(name);
}

function requestedFamily(input) {
  const settings = input.designSettings || {};
  const selected = input.style === 'monogram' ? settings.monogramFont : settings.fontFamily;
  if (selected) return selected;
  if (input.style === 'wordmark' && settings.letterType === 'cursive') return 'cursive';
  const brief = input.prompt || '';
  for (const [pattern,family] of [[/sans[ -]?(?:serif)?/i,'sans'],[/\bserif\b/i,'serif'],[/\b(?:gothic|blackletter)\b/i,'gothic'],[/\bbubble\b/i,'bubble'],[/\brounded\b/i,'rounded'],[/\bcursive\b/i,'cursive'],[/\b(?:script|brush lettering)\b/i,'script'],[/\bgeometric\b/i,'geometric'],[/\bblock\b/i,'block']]) if (pattern.test(brief)) return family;
  if (input.style === 'wordmark' && (['playful','whimsical'].includes(settings.personality) || /\b(?:cheerful|playful|bakery|candy)\b/i.test(brief))) return 'rounded';
  return settings.monogramTreatment === 'organic' ? 'rounded' : 'sans';
}

function requestedLetters(input) {
  const settings = input.designSettings || {};
  let text = input.brand || '';
  if (input.style === 'monogram') {
    const explicit = (input.prompt || '').match(/\b([\p{Lu}\p{N}]{1,3})\s+(?:monogram|lettermark)\b/u)?.[1];
    const words = text.match(/[\p{L}\p{N}]+/gu) || [];
    text = settings.monogramLetters || explicit || words.slice(0,3).map(word => [...word][0]).join('').toUpperCase();
    if (settings.capitalization === 'uppercase') text = text.toUpperCase();
    if (settings.capitalization === 'lowercase') text = text.toLowerCase();
  } else {
    if (settings.lettering === 'uppercase') text = text.toUpperCase();
    if (settings.lettering === 'lowercase') text = text.toLowerCase();
  }
  return text;
}

// Actual licensed glyph outlines, not an SVG <text> element depending on fonts
// installed on a server. Unknown glyphs are omitted as a whole, never boxes.
async function letteringGuide(input) {
  const family = requestedFamily(input);
  const font = await loadFont(family);
  const text = requestedLetters(input);
  if (!text || [...text].some(c => !/\s/u.test(c) && !font.hasGlyphForCodePoint(c.codePointAt(0)))) return { omitted:'unsupported-glyphs' };
  const settings = input.designSettings || {};
  const rows = input.style === 'wordmark' && ['stacked','vertical'].includes(settings.composition) ? text.split(/\s+/u) : [text];
  const runs = rows.map(row => font.layout(row));
  const rowHeight = font.unitsPerEm * 1.05;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const rowParts=[];
  for (let row=0;row<runs.length;row++) {
    const run=runs[row];
    const total=run.positions.reduce((n,p)=>n+p.xAdvance,0);
    let x=-total/2;
    const y=(runs.length-1)/2*rowHeight-row*rowHeight;
    for (let i=0;i<run.glyphs.length;i++) {
      const glyph=run.glyphs[i],position=run.positions[i];
      const gx=x+position.xOffset,gy=y+position.yOffset;
      if (glyph.path.commands.length) {
        const box=glyph.bbox;
        minX=Math.min(minX,gx+box.minX);maxX=Math.max(maxX,gx+box.maxX);
        minY=Math.min(minY,gy+box.minY);maxY=Math.max(maxY,gy+box.maxY);
        rowParts.push(`<path d="${glyph.path.toSVG()}" transform="translate(${gx} ${gy})"/>`);
      }
      x+=position.xAdvance;
    }
  }
  if (!rowParts.length) return { omitted:'empty-glyphs' };
  const width=maxX-minX,height=maxY-minY,scale=Math.min(380/width,300/height);
  if (height*scale < 30) return { omitted:'wording-too-small-for-guide' };
  const centered=`translate(256 256) scale(${scale} ${-scale}) translate(${-(minX+maxX)/2} ${-(minY+maxY)/2})`;
  const italic=settings.monogramWeight==='italic'||settings.lettering==='italic';
  const weight=settings.monogramWeight==='extra-bold'?`stroke="#17232B" stroke-width="${font.unitsPerEm*.018}" stroke-linejoin="round"`:'';
  const medium=settings.monogramWeight==='medium'?`stroke="#FFFFFF" stroke-width="${font.unitsPerEm*.009}"`:'';
  const glyphs=`<g transform="${centered}" fill="#17232B" ${weight} ${medium}><g${italic?' transform="skewX(11)"':''}>${rowParts.join('')}</g></g>`;
  const transform=settings.composition==='diagonal'?'rotate(-12 256 256)':'';
  const depth=settings.monogramTreatment==='dimensional'?`<g transform="translate(12 12)" opacity=".4">${glyphs}</g>`:'';
  return { svg:svg(`<g transform="${transform}">${depth}${glyphs}</g>`), family, text, role:'requested-glyph-anatomy' };
}

function lineGuide(settings={}) {
  const width=settings.lineThickness==='thin'?4:settings.lineThickness==='thick'?15:9;
  const geometric=settings.lineStructure==='geometric';
  // Two unrelated text-free motifs prevent a specific animal from becoming
  // the identity. These are appearance samples, not a composition reference.
  const paths=geometric
    ? ['M72 204 145 95 215 205 144 173Z M145 95 145 173','M290 296 330 252 425 252 453 310 418 368 330 368 290 324Z M330 252 366 310 330 368 M366 310 425 252']
    : ['M75 202C54 150 104 90 204 97C192 166 150 219 75 202Z M75 202C115 178 143 149 174 121','M292 307C323 246 403 247 443 307C405 371 326 368 292 307Z M292 307C338 288 383 289 420 307C380 326 336 327 292 307Z'];
  return { svg:svg(paths.map(d=>`<path d="${d}" fill="none" stroke="#17232B" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`).join('')),role:'text-free-contour-construction' };
}

function engravingGuide(settings={}) {
  const technique=settings.engravingTechnique||'line';
  const step=settings.lineQuality==='ultra'?7:settings.lineQuality==='simple'?22:12;
  let marks='';
  if (technique==='stipple') {
    for (let y=112;y<410;y+=step) for(let x=108;x<410;x+=step) {
      if ((x-256)**2+(y-256)**2>150**2) continue;
      const shade=(x+y-220)/600;
      if (((x*13+y*7)%101)/101<shade) marks+=`<circle cx="${x}" cy="${y}" r="${settings.lineQuality==='thick'?3:1.7}"/>`;
    }
  } else {
    for(let x=55;x<540;x+=step) marks+=`<path d="M${x} 100L${x-130} 420"/>`;
    if(technique==='crosshatch') for(let y=135;y<460;y+=step) marks+=`<path d="M100 ${y}L420 ${y-70}"/>`;
  }
  return { svg:svg(`<defs><clipPath id="form"><circle cx="256" cy="256" r="150"/></clipPath></defs><circle cx="256" cy="256" r="150" fill="none" stroke="#17232B" stroke-width="4"/><g clip-path="url(#form)" fill="#17232B" stroke="${technique==='stipple'?'none':'#17232B'}" stroke-width="${settings.lineQuality==='thick'?4:1.8}">${marks}</g>`),role:`engraving-${technique}-construction` };
}

function badgeGuide(settings={}) {
  const shapes={circle:'M256 70A186 186 0 1 0 256 442A186 186 0 1 0 256 70',oval:'M256 64C481 64 481 448 256 448C31 448 31 64 256 64',shield:'M90 92L256 50L422 92L400 300Q380 395 256 462Q132 395 112 300Z',triangle:'M256 64L448 427H64Z',hexagon:'M160 80H352L448 256L352 432H160L64 256Z',rectangle:'M64 138H448V374H64Z',diamond:'M256 50L444 256L256 462L68 256Z',square:'M82 82H430V430H82Z'};
  const shape=shapes[settings.badgeShape]||shapes.circle;
  return {svg:svg(`<path d="${shape}" fill="#17232B" stroke="#17232B" stroke-width="10"/><path d="${shape}" transform="translate(256 256) scale(.89) translate(-256 -256)" fill="none" stroke="#FFFFFF" stroke-width="4"/><path d="M180 302L231 200L261 255L289 220L338 302Z" fill="#FFFFFF"/>`),role:'selected-badge-enclosure'};
}

function abstractGuide(settings={}) {
  const organic=settings.structure==='organic';
  const shapes=organic
    ? '<path d="M254 90C365 83 440 161 414 270C393 359 286 417 199 380C96 337 80 218 150 141C180 109 213 95 254 90Z"/><path d="M247 160C189 174 166 249 209 294C251 340 327 304 333 247C339 197 294 151 247 160Z" fill="#FFFFFF"/>'
    : '<path d="M256 64L430 160V352L256 448L82 352V160Z"/><path d="M256 151L350 204V308L256 361L162 308V204Z" fill="#FFFFFF"/><path d="M239 110H273V400H239Z" fill="#FFFFFF"/>';
  return {svg:svg(`<g fill="#17232B">${shapes}</g>`),role:`${organic?'organic':'geometric'}-form-construction`};
}

function iconGuide(settings={}) {
  const view=settings.viewpoint||'three-quarter';
  const planes=view==='front'
    ? '<rect x="138" y="112" width="236" height="288" rx="18" fill="#D1A252"/><path d="M180 170H332M180 320H332" stroke="#17232B" stroke-width="12"/>'
    : view==='high-angle'
      ? '<path d="M100 240L256 144L414 240L256 337Z" fill="#E3B76E"/><path d="M100 240V318L256 414V337Z" fill="#9C6E2B"/><path d="M256 337L414 240V318L256 414Z" fill="#17232B"/>'
      : '<path d="M112 150L302 105L410 192L221 238Z" fill="#E3B76E"/><path d="M112 150L221 238V420L112 332Z" fill="#9C6E2B"/><path d="M221 238L410 192V374L221 420Z" fill="#17232B"/>';
  return {svg:svg(planes),role:`actual-${view}-planes`};
}

async function baseArtwork(style, settings) {
  const key=style;
  if (!artwork.has(key)) artwork.set(key,readFile(path.join(assetRoot,'styles',`${style}.png`)));
  let bytes=await artwork.get(key);
  // Explicit palette choices must not compete with a reference's old palette.
  if (settings.primaryColor||settings.secondaryColor||settings.backgroundColor) bytes=await sharp(bytes).greyscale().png().toBuffer();
  return { png:bytes, role:'approved-original-rendering' };
}

export async function prepareLogoVisualGuides(input) {
  if (!hasLogoVisualDirection(input)) return { references:[],metadata:null };
  const settings=input.designSettings||{};
  const conflictingCharacter = ['mascot','cartoon','retro'].includes(input.style)
    && (['none','thin'].includes(settings.outlineThickness)
      || (input.style==='mascot' && settings.characterComposition==='full-body')
      || (['cartoon','retro'].includes(input.style) && settings.characterComposition==='portrait'));
  if (conflictingCharacter) return { references:[],metadata:{version:LOGO_VISUAL_GUIDE_VERSION,omitted:'explicit-character-controls-override-example'} };
  let guide;
  if (['wordmark','monogram'].includes(input.style)) guide=await letteringGuide(input);
  else if(input.style==='line') guide=lineGuide(settings);
  else if(input.style==='engraved' && (settings.engravingTechnique||settings.detail==='minimal')) guide=engravingGuide(settings);
  else if(input.style==='badge' && (settings.badgeShape||settings.badgeType)) guide=badgeGuide(settings);
  else if(input.style==='abstract' && settings.structure) guide=abstractGuide(settings);
  else if(input.style==='pictorial' && settings.structure==='geometric') guide=abstractGuide(settings);
  else if(input.style==='icon' && settings.viewpoint) guide=iconGuide(settings);
  else if(input.style==='minimalist' && settings.symbolConstruction==='outline') guide=lineGuide(settings);
  else guide=await baseArtwork(input.style,settings);
  if(guide.omitted) return { references:[],metadata:{version:LOGO_VISUAL_GUIDE_VERSION,omitted:guide.omitted} };
  let bytes=guide.png||await sharp(Buffer.from(guide.svg)).png().toBuffer();
  if (input.palette?.length && guide.png && !settings.primaryColor && !settings.secondaryColor && !settings.backgroundColor) bytes=await sharp(bytes).greyscale().png().toBuffer();
  return { references:[`data:image/png;base64,${bytes.toString('base64')}`], metadata:{version:LOGO_VISUAL_GUIDE_VERSION,role:guide.role,family:guide.family||null,sha256:createHash('sha256').update(bytes).digest('hex'),referenceCount:1} };
}
