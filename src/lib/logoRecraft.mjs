export function recraftLogoPlan(input, { image } = {}) {
  if (!image) throw new Error('Select a source image first.');
  if (input.operation === 'vectorize') return { endpoint: 'images/vectorize', format: 'svg', cost: 0.01, body: { image_url: image } };
  if (input.operation === 'removeBg') return { endpoint: 'images/removeBackground', format: input.sourceFormat === 'svg' ? 'svg' : 'png', cost: 0.01, body: { image_url: image, image_format: 'png' } };
  throw new Error('Logo creation uses Nano Banana Pro. Recraft handles background removal and vectorization only.');
}

export function recraftResult(output, plan) {
  const image = output.image;
  if (!image?.url) throw new Error('Recraft returned no image.');
  return { url: image.url, format: plan.format, endpoint: plan.endpoint,
    providerRequestId: image.image_id || output.id,
    cost: Number.isFinite(output.credits) && output.credits >= 0 ? output.credits / 1000 : plan.cost };
}
