import { buildLogoPrompt } from './logoStudio.mjs';
import { logoTextAutoBackground } from './logoTextDirection.mjs';
import { hasLogoVisualDirection } from './logoVisualDirection.mjs';
import { STREETWEAR_STYLE } from './logoStyleCapabilities.mjs';

function colorControls(input) {
  const settings = input.designSettings || {};
  const toRgb = hex => ({ rgb: [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) });
  const colors = [...new Set([settings.primaryColor, settings.secondaryColor, settings.outlineColor, ...(input.palette || [])]
    .filter(value => /^#[0-9a-f]{6}$/i.test(value || '')).map(value => value.toUpperCase()))].map(toRgb);
  const backgroundHex = settings.backgroundColor || logoTextAutoBackground(input);
  const background = /^#[0-9a-f]{6}$/i.test(backgroundHex || '') ? toRgb(backgroundHex) : null;
  return colors.length || background ? { controls: { ...(colors.length ? { colors } : {}), ...(background ? { background_color: background } : {}) } } : {};
}

export function recraftLogoPlan(input, { image, styleReferences = [] } = {}) {
  if (input.operation === 'edit' && input.style !== STREETWEAR_STYLE) throw new Error('AI Edit uses the Nano Banana 2.1 image editing adapter except for Streetwear Lettering.');
  const needsImage = input.operation !== 'generate' || input.mode !== 'text';
  if (needsImage && !image) throw new Error('Select a source image first.');
  if (input.operation === 'vectorize') {
    return { endpoint: 'images/vectorize', format: 'svg', cost: 0.01, body: { image_url: image } };
  }
  if (input.operation === 'removeBg') {
    return {
      endpoint: 'images/removeBackground',
      format: input.sourceFormat === 'svg' ? 'svg' : 'png',
      cost: 0.01,
      body: { image_url: image, image_format: 'png' },
    };
  }
  if (!['generate', 'variations', 'edit'].includes(input.operation)) throw new Error('Unsupported logo operation.');
  const userStyle = input.operation === 'generate' && input.mode === 'text' && Boolean(input.styleReferenceUrl);
  const visual = (userStyle || hasLogoVisualDirection(input)) && styleReferences.length > 0;
  if (userStyle && !visual) throw new Error('Style inspiration was not prepared. Upload it again.');
  if (visual && (styleReferences.length > 2 || styleReferences.some(value => typeof value !== 'string' || value.length > 4_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)))) throw new Error('Invalid internal logo style guide.');
  const compiled = input.compiledPrompt || buildLogoPrompt(input);
  const prompt = visual ? [
    'Use the attached visual reference for rendering technique and the selected construction only. The user brief and exact requested wording define the identity; do not introduce an example subject, accessory, frame, caption or extra wording from a reference.',
    userStyle ? 'Style inspiration supplies drawing language, contour rhythm, shape treatment and finish only. Do not copy its subject, composition, brand name, initials, tagline or other identifying elements. The user brief and exact brand fields define the new identity. Explicit style, color and construction controls take priority over the inspiration.' : ['wordmark', 'monogram'].includes(input.style)
      ? 'The glyph guide contains the requested main wording in the required font anatomy. Retain that anatomy and spelling while designing an original, optically balanced logo. Do not add a font-specimen label or duplicate wording.'
      : 'The guide is text-free. If the brief supplies no wording, the finished logo is also text-free. Show one finished logo, not a guide sheet or comparison.',
    compiled,
  ].join('\n') : compiled;
  if (prompt.length > 10000) throw new Error('Please shorten your logo instructions.');
  // Recraft serves the remaining nine Text styles. Streetwear refinements
  // also use Recraft; other AI edits retain their existing Nano adapter.
  const strength = input.operation === 'edit' ? 0.3 : input.operation === 'variations' ? 0.45
    : input.mode === 'sketch' && input.sketchMode === 'precise' ? 0.3 : 0.6;
  return {
    endpoint: needsImage ? 'images/imageToImage' : 'images/generations',
    model: 'recraftv4_1',
    format: 'png',
    cost: visual ? 0.04 : 0.035,
    body: {
      model: 'recraftv4_1',
      prompt,
      n: 1,
      image_format: 'png',
      response_format: 'url',
      ...(needsImage ? { image_url: image, strength } : { size: '1024x1024', ...(visual ? { style_reference_urls: styleReferences, style_match: userStyle ? input.generationOptions?.styleMatch || 'flexible' : input.visualGuidance.match } : {}) }),
      ...(input.operation === 'generate' && input.mode === 'text' ? colorControls(input) : {}),
      ...(Number.isInteger(input.seed) && input.seed >= 0 ? { random_seed: input.seed } : {}),
    },
  };
}

export function recraftResult(output, plan) {
  const image = output.data?.[0] || output.image;
  if (!image?.url) throw new Error('Recraft returned no image.');
  return {
    url: image.url,
    format: plan.format,
    endpoint: plan.endpoint,
    model: plan.model,
    providerRequestId: image.image_id || output.id,
    ...(typeof output.style_id === 'string' ? { styleId: output.style_id } : {}),
    cost: Number.isFinite(output.credits) && output.credits >= 0 ? output.credits / 1000 : plan.cost,
  };
}
