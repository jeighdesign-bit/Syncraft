import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { create as createFont } from 'fontkit';

const root = 'src/assets/logo-guides';
await fs.mkdir(`${root}/styles`, { recursive: true });
// Our own approved originals only. Crops exclude the original brand wording;
// these files are private generation guides, not new website examples.
const sources = [
  ['minimalist','notchfold',0.65], ['mascot','mintwheel',0.61],
  ['retro','zippear',0.72], ['pictorial','lumipod',0.72],
  ['cartoon','sunday-spore',0.63], ['line','fernthread',0.68],
  ['abstract','prismfold',0.70], ['engraved','cindermoth',0.82], ['icon','brimbop',0.64],
];
const manifest = { version: 'logo-visual-guides-1', sources: [], fonts: [] };
for (const [style, original, fraction] of sources) {
  const source = `public/images/logo-examples/studio-original-${original}.webp`;
  const bytes = await fs.readFile(source);
  const metadata = await sharp(bytes).metadata();
  const png = await sharp(bytes).extract({ left: 0, top: 0, width: metadata.width, height: Math.floor(metadata.height * fraction) })
    .resize(512,512,{fit:'contain',background:'#FFFFFF'}).flatten({background:'#FFFFFF'}).png().toBuffer();
  await fs.writeFile(`${root}/styles/${style}.png`, png);
  manifest.sources.push({ style, source, cropTopFraction: fraction, sourceSha256: createHash('sha256').update(bytes).digest('hex'), guideSha256: createHash('sha256').update(png).digest('hex'), ownership: 'Syncraft original, user-approved artwork' });
}
const badge = await fs.readFile('public/images/logo-styles/badge-signature.svg');
await sharp(badge).resize(512,512).flatten({background:'#FFFFFF'}).png().toFile(`${root}/styles/badge.png`);
manifest.sources.push({ style:'badge',source:'public/images/logo-styles/badge-signature.svg',sourceSha256:createHash('sha256').update(badge).digest('hex'),ownership:'Syncraft original code-native artwork' });
for (const file of await fs.readdir(`${root}/fonts`)) if (file.endsWith('.woff2')) {
  const bytes = await fs.readFile(`${root}/fonts/${file}`);
  const font = createFont(bytes);
  manifest.fonts.push({ file, name:font.fullName, version:font.version, source:`https://fontsource.org/fonts/${file.replace('.woff2','')}`, sha256:createHash('sha256').update(bytes).digest('hex'), licenseFile:file.replace('.woff2','-LICENSE.txt') });
}
await fs.writeFile(`${root}/manifest.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({ originalArtGuides: manifest.sources.length, licensedFonts:manifest.fonts.length }));
