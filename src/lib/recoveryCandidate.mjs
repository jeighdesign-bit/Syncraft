import sharp from 'sharp';
import { inspectRecoveryImages, normalizeVisualValidation, visualRecoveryPrompt } from './recoveryVision.mjs';
import { recoveryCropRegion } from './recoveryCrop.mjs';
import { inspectStripExterior } from './recoveryStripBounds.mjs';

async function rawPreview(buffer) {
  const image = await sharp(buffer).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${image.toString('base64')}`;
}

export async function checkRecoveryCandidate({ sourceBuffer, outputBuffer, analysis, mode, method = 'image_edit', inspect = inspectRecoveryImages, onUsage = async () => {}, allowCrop = true }) {
  // Bounds and source-preservation decisions use one real full-frame preview.
  // A contact sheet can be mistaken for duplicated art or output padding.
  const sourcePreview = await rawPreview(sourceBuffer);
  let calls = 0;
  const check = async buffer => {
    calls++;
    let validation = normalizeVisualValidation(await inspect([sourcePreview, await rawPreview(buffer)], visualRecoveryPrompt(analysis, mode), { onUsage, imageLayout: 'source_image' }));
    const exterior = analysis.presentation_type === 'physical_surface'
      ? await inspectStripExterior(buffer, { category: analysis.reference_category, mode, analysis, method }) : null;
    if (exterior?.suspected_exterior) {
      validation = { ...validation, pass: false, usable_partial: false, advisory_only: true,
        failures: [...new Set([...validation.failures, 'wrong_layout'])],
        checks: { geometry: 'fail', content: validation.checks?.content || 'unverifiable', lettering: validation.checks?.lettering || 'unverifiable' },
        correction: `${validation.pass ? '' : validation.correction + ' '}${exterior.reason}`.trim(),
        // The pixel diagnostic warns about likely exterior; it never authorizes
        // cropping a region the model did not independently identify as safe.
        artwork_box: validation.pass ? null : validation.artwork_box,
        advisory_diagnostics: { strip_exterior: exterior } };
    }
    return validation;
  };
  let validation = await check(outputBuffer);
  const meta = await sharp(outputBuffer).metadata();
  const crop = allowCrop ? recoveryCropRegion(validation, meta.width, meta.height) : null;
  if (!crop) return { buffer: outputBuffer, validation, calls, cropped: false };
  const croppedBuffer = await sharp(outputBuffer).extract(crop).png().toBuffer();
  const originalFailures = validation.failures;
  validation = { ...await check(croppedBuffer), crop_attempted: true, crop_region: crop, original_failures: originalFailures };
  return { buffer: croppedBuffer, validation, calls, cropped: true };
}
