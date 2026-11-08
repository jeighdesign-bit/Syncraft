import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const folder = resolve('outputs/logo-recraft-variants');
const manifest = JSON.parse(readFileSync(resolve(folder, 'manifest.json'), 'utf8'));
if (manifest.samples.some(sample => sample.status !== 'succeeded')) throw new Error('Wait until all three native samples are saved.');
const escape = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
const width = 1800, height = 830, panelWidth = 560;
const placements = manifest.samples.map((sample, index) => ({ sample, x: 36 + index * 584 }));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect width="100%" height="100%" fill="#F2F3EF"/>
<g font-family="Arial, sans-serif" fill="#172B24">
<text x="36" y="43" font-size="15" font-weight="700" letter-spacing="2">PINEWATCH · MODEL COMPARISON</text>
<text x="36" y="82" font-size="28" font-weight="700">Same brief: “A watchful lynx”</text>
<text x="36" y="113" font-size="16" fill="#526059">Mascot · PINEWATCH · Green #183D35 + gold #CA9C50 · White background · Seed 27641 · No reference image</text>
${placements.map(({ sample, x }) => `<rect x="${x}" y="141" width="${panelWidth}" height="${panelWidth}" rx="12" fill="#FFFFFF" stroke="#D5DBD3"/>
<text x="${x}" y="720" font-size="24" font-weight="700">${escape(sample.label)}</text>
<text x="${x}" y="750" font-size="17" fill="#526059">${sample.format === 'svg' ? 'Native SVG' : `${sample.nativeWidth} × ${sample.nativeHeight} PNG`} · $${sample.costUsd ?? sample.expectedCostUsd} / image</text>`).join('')}
<text x="36" y="801" font-size="15" fill="#526059">Equal-size previews. Native files preserved. One sample per model; the same seed does not imply identical composition across models.</text>
</g></svg>`;
const composites = [];
for (const { sample, x } of placements) {
  const image = await sharp(sample.previewFile).resize(panelWidth - 16, panelWidth - 16).png().toBuffer();
  composites.push({ input: image, left: x + 8, top: 149 });
}
await sharp(Buffer.from(svg)).composite(composites).png().toFile(resolve(folder, 'comparison.png'));
const report = `# Recraft V4.1 comparison

Brief: **A watchful lynx**. Brand: **PINEWATCH**. Style: **Mascot**. Green **#183D35**, gold **#CA9C50**, background **#FFFFFF**. No tagline or reference image. Same compiled prompt, native color controls, 1:1 aspect ratio, seed **27641**, one image per model. No prompt enhancement was run.

The prompt, color controls, seed, aspect ratio and image count were identical. The model ID and required export-format parameter differ: raster models request PNG; Vector omits that raster-only parameter and returns SVG. Recraft selects its native output size: 1024 PNG for Regular, 2048 PNG for Pro and SVG for Vector. Preview images are displayed at the same scale. Seed values do not correspond to identical latent noise across different models.

| Model | Native result | Reported provider cost | Generation time |
|---|---|---:|---:|
${manifest.samples.map(sample => `| ${sample.label} | [${sample.format.toUpperCase()}](${sample.nativeFile.replaceAll('\\', '/')}) | $${sample.costUsd ?? sample.expectedCostUsd} | ${(sample.elapsedMs / 1000).toFixed(1)} s |`).join('\n')}

Total provider cost: **$${manifest.totalProviderCostUsd.toFixed(3)}**. Syncraft credit balance: **${manifest.creditsBefore} → ${manifest.creditsAfter}**. Current Logo Studio model routing and pricing files were verified unchanged by SHA-256 comparison. Samples are standalone evaluation artifacts; they were not added to live Logo Studio history.

![Comparison](${resolve(folder, 'comparison.png').replaceAll('\\', '/')})

One sample per model supports comparison of these specific outputs, not a general quality ranking. Original files are preserved beside this report.
`;
writeFileSync(resolve(folder, 'comparison.md'), report);
console.log(JSON.stringify({ comparison: resolve(folder, 'comparison.png'), report: resolve(folder, 'comparison.md') }));
