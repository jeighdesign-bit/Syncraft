import { buildLogoPrompt } from './logoStudio.mjs';

export function nanoLogoPlan(input, image, compiledPrompt = null, seed = null) {
  if (!['generate', 'variations', 'edit'].includes(input.operation)) throw new Error('This operation uses a Recraft tool.');
  const needsImage = input.operation !== 'generate' || input.mode !== 'text';
  if (needsImage && !image) throw new Error('Select or upload a source image first.');
  const usePro = process.env.LOGO_STUDIO_NANO_MODEL === 'pro';
  const model = usePro ? 'nano-banana-pro' : 'nano-banana-2';
  return {
    endpoint: `fal-ai/${model}${needsImage ? '/edit' : ''}`,
    model, cost: usePro ? 0.15 : 0.08,
    input: {
      prompt: compiledPrompt || buildLogoPrompt(input), ...(needsImage ? { image_urls: [image] } : {}),
      aspect_ratio: '1:1', resolution: '1K', num_images: 1, output_format: 'png', limit_generations: true, enable_web_search: false,
      ...(Number.isInteger(seed) && seed >= 0 ? { seed } : {}),
    },
  };
}
