import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fal } from '@fal-ai/client';
import { buildLogoPrompt, validateLogoOperation } from '../../src/lib/logoStudio.mjs';

const sourcePath = process.argv[2];
const outputDir = process.argv[3] || 'outputs/sketch-model-compare';
if (!sourcePath || !process.env.FAL_KEY) throw new Error('Provide a sketch path and configure FAL_KEY.');

const sketch = await readFile(sourcePath);
const imageUrl = await fal.storage.upload(new File([sketch], 'bee-sketch.png', { type: 'image/png' }));
const prompt = 'Create one finished, original minimalist bee logo from the supplied rough sketch. Read the drawing as a concept guide: a round head, two large side wings, an oval abdomen with exactly two short stripes, and small lower wing shapes. Keep those parts and their relative placement, but redraw the uneven hand-drawn strokes as smooth, confident, intentional curves. Make the subject immediately recognizable as a bee, not a polygon diagram or a generic flower. Use a restrained dark charcoal and warm golden-yellow flat palette on pure white. Clean clear spaces, balanced proportions, no lettering, no mockup.';
const smartPrompt = buildLogoPrompt(validateLogoOperation({
  requestId: crypto.randomUUID(), mode: 'sketch', sketchMode: 'smart', sourceUrl: imageUrl,
  style: 'minimalist', prompt: 'a minimalist bee', palette: ['#202b32', '#eab238'],
}));
const precisePrompt = buildLogoPrompt(validateLogoOperation({
  requestId: crypto.randomUUID(), mode: 'sketch', sketchMode: 'precise', sourceUrl: imageUrl,
  style: 'minimalist', prompt: 'a minimalist bee', palette: ['#202b32', '#eab238'],
}));
const plans = [
  ['nano-banana-2', 'fal-ai/nano-banana-2/edit', { image_urls: [imageUrl], prompt, aspect_ratio: '1:1', resolution: '1K', num_images: 1, output_format: 'png', limit_generations: true, enable_web_search: false }],
  ['flux-dev-075', 'fal-ai/flux/dev/image-to-image', { image_url: imageUrl, prompt, strength: 0.75, num_images: 1, output_format: 'png', num_inference_steps: 40, guidance_scale: 3.5 }],
  ['nano-smart-new', 'fal-ai/nano-banana-2/edit', { image_urls: [imageUrl], prompt: smartPrompt, aspect_ratio: '1:1', resolution: '1K', num_images: 1, output_format: 'png', limit_generations: true, enable_web_search: false }],
  ['nano-precise-new', 'fal-ai/nano-banana-2/edit', { image_urls: [imageUrl], prompt: precisePrompt, aspect_ratio: '1:1', resolution: '1K', num_images: 1, output_format: 'png', limit_generations: true, enable_web_search: false }],
];

await mkdir(outputDir, { recursive: true });
for (const [name, endpoint, input] of plans) {
  if (process.argv[4] && process.argv[4] !== name) continue;
  try {
    const result = await fal.subscribe(endpoint, { input });
    const url = result.data?.images?.[0]?.url;
    if (!url) throw new Error('No image returned.');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not retrieve output: ${response.status}`);
    await writeFile(`${outputDir}/${name}.png`, Buffer.from(await response.arrayBuffer()));
    console.log(`${name}: saved`);
  } catch (error) {
    console.error(`${name}: ${error.message}`);
  }
}
