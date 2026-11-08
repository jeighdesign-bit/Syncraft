// Nano Banana 2.1 creates selected Text styles; Edit handles reference work.
import { buildLogoPrompt } from './logoStudio.mjs';
import { STREETWEAR_STYLE } from './logoStyleCapabilities.mjs';
import { LOGO_NANO_TEXT_STYLES } from './logoModelRouting.mjs';

const FAILURE_MESSAGES = Object.freeze({
  content_policy_violation: 'The image provider declined this request during its content check. Try a different reference image or revise your instructions.',
  file_download_error: 'The image provider could not read the reference image. Please upload it again.',
  image_too_large: 'The reference image is too large for the image provider. Please upload a smaller image.',
  no_media_generated: 'The image provider returned no logo image. Try a different reference image or revise your instructions.',
});

// fal SDK ValidationError.message may be empty; use structured error types.
// Never copy raw provider messages or inputs into project history or logs.
export function logoFalFailure(error, fallback) {
  const detail = Array.isArray(error?.body?.detail) ? error.body.detail : [];
  const code = detail.find(item => typeof item?.type === 'string' && Object.hasOwn(FAILURE_MESSAGES, item.type))?.type;
  return {
    message: code ? FAILURE_MESSAGES[code] : error?.status === 422
      ? 'The image provider could not process this reference image or instruction. Please check your inputs.' : fallback,
    providerErrorCode: code || null,
    providerStatus: Number.isInteger(error?.status) ? error.status : null,
  };
}

export function nanoLogoPlan(input, image) {
  if (!['generate', 'variations', 'edit'].includes(input.operation)) throw new Error('This operation uses a Recraft tool.');
  if (input.style === STREETWEAR_STYLE) throw new Error('Streetwear Lettering uses Recraft.');
  const textCreation = input.operation === 'generate' && input.mode === 'text';
  if (textCreation && !LOGO_NANO_TEXT_STYLES.includes(input.style)) throw new Error('This Text to Logo style uses Recraft.');
  const styleInspiration = textCreation && Boolean(input.styleReferenceUrl);
  if (styleInspiration && !image) throw new Error('Style inspiration was not prepared. Upload it again.');
  if (!textCreation && !image) throw new Error('Select or upload a source image first.');
  const needsImage = !textCreation || styleInspiration;
  const prompt = input.compiledPrompt || buildLogoPrompt(input);
  return {
    endpoint: needsImage ? 'google/nano-banana-2.1/edit' : 'google/nano-banana-2.1',
    model: 'nano-banana-2.1',
    // 2.1 is token-billed; leave cost unknown instead of logging the old flat fee.
    cost: null,
    input: {
      prompt: styleInspiration ? [
        'Create one original logo from the brief below. The attached image supplies drawing style and finish only; it is not the subject to redraw. Do not copy its subject, composition, brand name, initials, tagline or identifying elements. The brief, exact brand fields and explicit color/construction controls take priority.',
        input.generationOptions?.styleMatch === 'precise'
          ? 'Match the reference drawing language closely: contour rhythm, shape simplification, line weight and surface finish. Apply those qualities to the new subject without reusing the reference identity.'
          : 'Use only a loose influence from the reference drawing language and finish. Develop an independent construction for the new subject.',
        prompt,
      ].join('\n') : prompt,
      ...(needsImage ? { image_urls: [image] } : {}),
      aspect_ratio: '1:1',
      resolution: '1K',
      num_images: 1,
      output_format: 'png',
      limit_generations: true,
      enable_web_search: false,
      ...(textCreation ? { thinking_level: 'medium' } : {}),
      ...(Number.isInteger(input.seed) && input.seed >= 0 ? { seed: input.seed } : {}),
    },
  };
}
