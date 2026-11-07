// Nano Banana 2 powers all AI edits and Image/Sketch creation/variations.
// Text creation/variations use Recraft; an edit retains its source history mode.
import { buildLogoPrompt } from './logoStudio.mjs';

export function nanoLogoPlan(input, image) {
  if (!['generate', 'variations', 'edit'].includes(input.operation)) throw new Error('This operation uses a Recraft tool.');
  const needsImage = input.operation !== 'generate' || input.mode !== 'text';
  if (needsImage && !image) throw new Error('Select or upload a source image first.');
  const model = 'nano-banana-2';
  return {
    endpoint: `fal-ai/${model}${needsImage ? '/edit' : ''}`,
    model,
    cost: 0.08,
    input: {
      prompt: input.compiledPrompt || buildLogoPrompt(input),
      ...(needsImage ? { image_urls: [image] } : {}),
      aspect_ratio: '1:1',
      resolution: '1K',
      num_images: 1,
      output_format: 'png',
      limit_generations: true,
      enable_web_search: false,
      ...(Number.isInteger(input.seed) && input.seed >= 0 ? { seed: input.seed } : {}),
    },
  };
}
