import sharp from 'sharp';

// Archived evaluation only. The experimental cleanup prompt pass has been
// removed from the application extraction route to match production behavior.

export const GARMENT_FLAT_CLEANUP_VERSION = 'flat-cleanup-v1';
const MODES = new Set(['ERASE_LOGOS', 'PRESERVE_LOGOS']);

export function shouldCleanupGarmentFlat(project, env = process.env) {
  return project?.trace_type === 'mockup' && env.GARMENT_FLAT_CLEANUP_ENABLED === 'true';
}

export function buildGarmentFlatCleanupInput({ flatImageUrl, referenceImageUrl, mode, aspectRatio, resolution }) {
  if (![flatImageUrl, referenceImageUrl].every(url => typeof url === 'string' && url.trim())) {
    throw new Error('Flat cleanup requires both the extracted artwork and its reference.');
  }
  if (!MODES.has(mode)) throw new Error('Unsupported garment cleanup mode');
  if (resolution !== undefined && !['1K', '2K', '4K'].includes(resolution)) throw new Error('Unsupported cleanup resolution');
  return {
    image_urls: [flatImageUrl, referenceImageUrl],
    aspect_ratio: aspectRatio || 'auto',
    num_images: 1,
    output_format: 'png',
    limit_generations: true,
    ...(resolution ? { resolution } : {}),
    system_prompt: 'You perform conservative de-lighting of existing printed artwork. Image 1 is an already extracted rectangular print master to edit. Image 2 is its garment photograph, provided only to distinguish physical textile and fold lighting from ink. Edit image 1 with the smallest necessary correction. Preserve its framing, composition, printed shapes, colors, lettering and intentional printed effects. Do not re-extract image 2, compose a new artwork or restore the garment.',
    prompt: `${GARMENT_FLAT_CLEANUP_VERSION}: Clean the physical textile presentation remaining in IMAGE 1, using IMAGE 2 only as material evidence. Return IMAGE 1 with the same rectangular canvas and exactly the same retained ink composition.
Remove only identifiable physical thread/knit/mesh pores, stitch/hem artifacts and photographic fold shading: soft dark/light bands or ridges that follow garment creases across unrelated printed shapes. Remove the fold lighting across the whole affected region, not the printing beneath it.
Keep intentional printed gradients, luminous strokes, glows, highlights inside graphic shapes, grunge, linework, fine patterns and illustration shading. A glow attached to an ink stroke is printed artwork. Do not flatten it into a solid color. If the cause is not visibly identifiable as physical textile or fold lighting, retain the existing ink detail.
LOCK IMAGE 1: same visible element count, shapes, positions, scale, line thickness, orientation, spacing, repeat density and empty areas. No zoom, crop, reframing, added border, changed palette, stronger contrast, smoothing of printed details or invented texture. Do not reinterpret a photographed fold as a newly printed dark stripe. Do not add necklines, collar bands, garment trim, sleeves, hardware or seams.
${mode === 'PRESERVE_LOGOS' ? 'Preserve every existing letter, number and logo in IMAGE 1 exactly as visible.' : 'IMAGE 1 is the pattern-only result. Do not restore any text, numbers, logos or identity marks visible only in IMAGE 2.'}
Do not make the picture more attractive or sharper by replacing it with a different drawing. Output only the corrected rectangular artwork.`,
  };
}

async function printEdges(buffer, width, height) {
  // This is an inspection derivative, never a replacement for output pixels.
  // Smoothing suppresses fine weave so removing it need not count as drift.
  const data = await sharp(buffer).resize(width, height, { fit: 'fill' })
    .removeAlpha().greyscale().blur(1.25).raw().toBuffer();
  const mask = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (Math.abs(data[i + 1] - data[i - 1]) + Math.abs(data[i + width] - data[i - width]) >= 22) mask[i] = 1;
    }
  }
  return mask;
}

function edgeCoverage(from, to, width, height) {
  let total = 0, matched = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!from[y * width + x]) continue;
      total++;
      let found = false;
      for (let dy = -2; dy <= 2 && !found; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && to[ny * width + nx]) {
            found = true;
            break;
          }
        }
      }
      if (found) matched++;
    }
  }
  return { coverage: total ? matched / total : 1, count: total };
}

export async function assessGarmentCleanupLayout(original, candidate) {
  const [a, b] = await Promise.all([sharp(original).metadata(), sharp(candidate).metadata()]);
  if (![a.width, a.height, b.width, b.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Unreadable cleanup image dimensions');
  }
  const ratioError = Math.abs((b.width / b.height) / (a.width / a.height) - 1);
  const unchangedDimensions = a.width === b.width && a.height === b.height;
  if (ratioError > 0.01 || !unchangedDimensions) {
    return { layoutStable: false, reason: 'frame_changed', ratioError, reviewRequired: true };
  }
  const scale = Math.min(384 / a.width, 384 / a.height, 1);
  const width = Math.max(3, Math.round(a.width * scale)), height = Math.max(3, Math.round(a.height * scale));
  const [sourceEdges, candidateEdges] = await Promise.all([printEdges(original, width, height), printEdges(candidate, width, height)]);
  const recall = edgeCoverage(sourceEdges, candidateEdges, width, height);
  const precision = edgeCoverage(candidateEdges, sourceEdges, width, height);
  const f1 = recall.coverage + precision.coverage ? 2 * recall.coverage * precision.coverage / (recall.coverage + precision.coverage) : 0;
  const enoughEvidence = recall.count >= 30 && precision.count >= 30;
  const layoutStable = enoughEvidence && recall.coverage >= 0.94 && precision.coverage >= 0.94 && f1 >= 0.95;
  // This rejects coarse layout changes. It cannot certify colors, text,
  // fine details or successful fold removal and is never a quality pass.
  return { layoutStable, reason: !enoughEvidence ? 'insufficient_edges' : layoutStable ? 'coarse_layout_retained' : 'coarse_layout_changed',
    recall: recall.coverage, precision: precision.coverage, f1, ratioError, reviewRequired: true };
}

export async function refineGarmentFlatArtwork({ rawBuffer, rawMimeType = 'image/png', generate, download, onUsage = async () => {}, ...options }) {
  let result, providerRequestId = null, attempted = false, finalReview;
  const fallback = (status, extra = {}) => {
    finalReview = { version: GARMENT_FLAT_CLEANUP_VERSION, status, reviewRequired: true, ...extra };
    return { buffer: rawBuffer, mimeType: rawMimeType, review: finalReview };
  };
  try {
    const input = buildGarmentFlatCleanupInput(options);
    attempted = true;
    result = await generate(input);
    providerRequestId = result?.requestId || null;
    const image = result?.data?.images?.[0];
    if (!image?.url) throw new Error('Cleanup returned no image');
    const downloaded = await download(image.url);
    const buffer = Buffer.isBuffer(downloaded) ? downloaded : downloaded.buffer;
    const layout = await assessGarmentCleanupLayout(rawBuffer, buffer);
    const review = { providerRequestId: result.requestId || null, layout };
    if (!layout.layoutStable) return fallback('rejected', review);
    finalReview = { version: GARMENT_FLAT_CLEANUP_VERSION, status: 'applied', reviewRequired: true, ...review };
    return { buffer, mimeType: image.content_type || 'image/png', review: finalReview };
  } catch (error) {
    providerRequestId ||= error.requestId || null;
    return fallback('unavailable', { providerRequestId, reason: 'cleanup_unavailable' });
  } finally {
    // A cleanup failure must not discard or refund an otherwise valid paid
    // extraction. Record the extra provider attempt without another charge.
    try { if (attempted) await onUsage({ providerRequestId, requestStatus: result ? 'succeeded' : 'failed',
      metadata: { cleanup_version: GARMENT_FLAT_CLEANUP_VERSION, outcome: finalReview?.status || 'unavailable', layout: finalReview?.layout || null } }); }
    catch { /* Usage recording must not replace the valid extraction. */ }
  }
}
