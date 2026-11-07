import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const root = 'outputs/original-logo-marketing-v2';
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'));
if (manifest.samples.length !== 12 || manifest.samples.some(e => e.status !== 'succeeded')) throw new Error('Wait for all twelve outputs.');
const layers = [];
for (const [index, sample] of manifest.samples.entries()) {
  const left = (index % 4) * 480;
  const top = Math.floor(index / 4) * 530;
  layers.push({ input: await sharp(`${root}/${sample.key}.png`).resize(456, 456, { fit: 'contain', background: '#fff' }).png().toBuffer(), left: left + 12, top: top + 12 });
  const label = `${sample.title} · ${sample.style}`.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const svg = `<svg width="456" height="45"><text x="228" y="28" text-anchor="middle" font-family="Arial" font-size="19" fill="#171717">${label}</text></svg>`;
  layers.push({ input: Buffer.from(svg), left: left + 12, top: top + 475 });
}
await sharp({ create: { width: 1920, height: 1590, channels: 3, background: '#efefed' } }).composite(layers).png().toFile(`${root}/contact-sheet.png`);
console.log(`${root}/contact-sheet.png`);
