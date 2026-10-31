// Prepare: node scripts/evals/universal-folder-benchmark.mjs manifest.json output-folder
// Generate/resume: same command with --generate. Existing request IDs are reused.
// Improved shared pipeline: --generate --analyze --verify-source [--review]. No paid calls without --generate.
// Review a cloned run only: add --recheck-candidates; this mode never submits an image generation.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import nextEnv from '@next/env';
import { fal } from '@fal-ai/client';
import { buildRecoveryImageInput, RECOVERY_IMAGE_ENDPOINT, inspectRecoveryImages, surfaceAnalysisPrompt, RECOVERY_VISION_MODEL, recoveryInspectionSystemPrompt, visualRecoveryPrompt } from '../../src/lib/recoveryVision.mjs';
import { categoryRecoveryAnalysis, isReferenceCategory } from '../../src/lib/referenceCategories.mjs';
import { matchRecoveryStripProportions } from '../../src/lib/recoveryStrip.mjs';
import { normalizeRecoveryAnalysis } from '../../src/lib/recoveryAnalysis.mjs';
import { recoverSourcePixels } from '../../src/lib/recoveryPlanar.mjs';
import { verifySourceRecovery } from '../../src/lib/recoverySourceCandidate.mjs';
import { checkRecoveryCandidate } from '../../src/lib/recoveryCandidate.mjs';

nextEnv.loadEnvConfig(process.cwd());
const [manifestPath, destination] = process.argv.slice(2);
if (!manifestPath || !destination) throw new Error('Provide manifest.json and output-folder; add --generate for paid image calls.');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (!Array.isArray(manifest) || !manifest.length || manifest.length > 32) throw new Error('Use 1–32 explicitly selected references.');
const root = path.resolve(destination);
await fs.mkdir(root, { recursive: true });
const generate = process.argv.includes('--generate');
const analyze = process.argv.includes('--analyze');
const review = process.argv.includes('--review');
const verifySource = process.argv.includes('--verify-source');
const recheckCandidates = process.argv.includes('--recheck-candidates');
const reviewRevision = 'raw_canvas_v1';
if (verifySource && !analyze) throw new Error('--verify-source requires --analyze.');
if (recheckCandidates && (!analyze || !verifySource)) throw new Error('--recheck-candidates requires --analyze --verify-source.');
const records = [];
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

for (const spec of manifest) {
  if (!/^[a-z0-9_-]+$/i.test(spec.id) || !isReferenceCategory(spec.category)) throw new Error('Invalid case ID or category.');
  const directory = path.join(root, spec.id);
  await fs.mkdir(directory, { recursive: true });
  const original = await fs.readFile(spec.source);
  const oriented = await sharp(original).rotate().png().toBuffer();
  const meta = await sharp(oriented).metadata();
  const crop = spec.crop || { left: 0, top: 0, width: meta.width, height: meta.height };
  if (Object.values(crop).some(v => !Number.isInteger(v)) || crop.left < 0 || crop.top < 0 || crop.width < 1 || crop.height < 1
    || crop.left + crop.width > meta.width || crop.top + crop.height > meta.height) throw new Error(`Invalid crop for ${spec.id}`);
  const cropped = await sharp(oriented).extract(crop).png().toBuffer();
  const mode = spec.mode || 'UNIVERSAL_KEEP_ARTWORK';
  if (!['UNIVERSAL_KEEP_ARTWORK', 'UNIVERSAL_BACKGROUND_ONLY'].includes(mode)) throw new Error('Invalid extraction mode.');
  const signature = digest(Buffer.from(JSON.stringify({ source: digest(original), crop, category: spec.category, target: spec.target, mode, endpoint: RECOVERY_IMAGE_ENDPOINT,
    ...(analyze ? { pipeline: verifySource ? 'verified_source_pixels_v2' : 'analyzed_source_pixels_v1' } : {}) })));
  let record;
  try { record = JSON.parse(await fs.readFile(path.join(directory, 'record.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (record && record.signature !== signature) throw new Error(`Case ${spec.id} changed. Use a new output folder rather than reusing a provider request.`);
  if (recheckCandidates && (!record?.derived_from?.run || !record.derived_from.record)) throw new Error(`Case ${spec.id}: --recheck-candidates requires a cloned record with derived_from provenance.`);
  record ||= { id: spec.id, signature, source: path.resolve(spec.source), source_name: path.basename(spec.source), source_sha256: digest(original),
    original_dimensions: { width: meta.width, height: meta.height }, category: spec.category, target: spec.target,
    mode, crop: { ...crop, coordinate_space: 'EXIF-upright original pixels', method: spec.crop ? 'manual selection' : 'full image',
      reason: spec.cropReason || 'Use the full reference.', normalized: { left: crop.left/meta.width, top: crop.top/meta.height, width: crop.width/meta.width, height: crop.height/meta.height } },
    model: RECOVERY_IMAGE_ENDPOINT, resolution: '2K', seed: null, created_at: new Date().toISOString(), status: 'prepared', generation_calls: 0,
    analysis_mode: analyze ? 'vision_auto' : 'manual_target_only', source_verification_enabled: verifySource, analysis_calls: 0, validation_calls: 0,
    review: { rating: 'not_reviewed', notes: 'Generated completion is not an accuracy verdict.' } };
  await fs.writeFile(path.join(directory, 'original' + path.extname(spec.source).toLowerCase()), original);
  await fs.writeFile(path.join(directory, 'crop.png'), cropped);
  const overlay = Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><rect x="${crop.left}" y="${crop.top}" width="${crop.width}" height="${crop.height}" fill="none" stroke="#ff3158" stroke-width="${Math.max(2,meta.width/250)}"/></svg>`);
  await sharp(oriented).composite([{ input: overlay }]).png().toFile(path.join(directory, 'crop-map.png'));
  const sourceAspect = crop.width / crop.height;
  const manualAnalysis = categoryRecoveryAnalysis({ state: 'partial', aspect_ratio: 'auto', source_width: crop.width, source_height: crop.height,
    surface_description: spec.target + ' Preserve any visible ownership/copyright notices. Do not invent missing or hidden artwork.' }, spec.category);
  const localInput = buildRecoveryImageInput({ imageUrls: ['LOCAL_REFERENCE_PENDING_UPLOAD'], analysis: record.analysis || manualAnalysis, mode });
  const promptHash = digest(Buffer.from(localInput.prompt));
  if (record.prompt_sha256 && record.prompt_sha256 !== promptHash) throw new Error(`Prompt changed for ${spec.id}; use a new output folder.`);
  record.attribution_notes = spec.attributionNotes || '';
  record.crop_sha256 = digest(cropped);
  record.prompt_sha256 = promptHash;
  record.input = record.input || localInput;
  record.narrow_canvas_ratio_lock = !['source_pixels', 'planar_rectification'].includes(record.extraction_method) && (sourceAspect < 0.35 || sourceAspect > 3)
    && (verifySource ? mode === 'UNIVERSAL_BACKGROUND_ONLY' : !analyze || mode === 'UNIVERSAL_BACKGROUND_ONLY' || record.analysis?.already_flat === true);
  await fs.writeFile(path.join(directory, 'record.json'), JSON.stringify(record, null, 2));
  records.push({ record, directory, cropped, manualAnalysis });
}

async function save(entry) { await fs.writeFile(path.join(entry.directory, 'record.json'), JSON.stringify(entry.record, null, 2)); }
async function recordUsage(entry, purpose, receipt) {
  entry.record.provider_usage ||= [];
  entry.record.provider_usage.push({ purpose, ...receipt, recorded_at: new Date().toISOString() });
  await save(entry);
}

async function analyzeSurface(entry) {
  const { record, cropped, manualAnalysis } = entry;
  if (!analyze || record.analysis_status === 'completed') return record.analysis || manualAnalysis;
  if (record.analysis_status === 'requested') {
    record.analysis_status = 'unavailable';
    record.analysis_error = 'Previous synchronous analysis outcome is uncertain. No duplicate analysis call was launched.';
    await save(entry);
    return manualAnalysis;
  }
  if (record.analysis_status === 'unavailable') return manualAnalysis;
  record.analysis_prompt = `${surfaceAnalysisPrompt(record.category)}\nExplicit selected target for this test: ${record.target}\nThe supplied image is the exact selected crop, not a contact sheet. All print_quad coordinates must refer to this supplied crop. Preserve visible ownership/copyright notices. Do not invent unseen content.`;
  record.analysis_system_prompt = recoveryInspectionSystemPrompt('source_image');
  record.analysis_model = process.env.RECOVERY_VISION_MODEL || RECOVERY_VISION_MODEL;
  record.analysis_input_image_sha256 = digest(cropped);
  record.analysis_input_kind = 'exact_upright_crop_data_url';
  record.analysis_status = 'requested';
  record.analysis_calls = (record.analysis_calls || 0) + 1;
  record.analysis_requested_at = new Date().toISOString();
  await save(entry);
  try {
    const raw = await inspectRecoveryImages([`data:image/png;base64,${cropped.toString('base64')}`], record.analysis_prompt,
      { imageLayout: 'source_image', onUsage: receipt => recordUsage(entry, 'surface_analysis', receipt) });
    record.raw_analysis = raw;
    if (typeof raw.surface_description !== 'string' || !raw.surface_description.trim()) throw new Error('Surface analysis returned no usable target description.');
    record.analysis = categoryRecoveryAnalysis({ ...normalizeRecoveryAnalysis(raw, 'auto'), source_width: record.crop.width, source_height: record.crop.height }, record.category);
    record.analysis_status = 'completed';
    record.analysis_sha256 = digest(Buffer.from(JSON.stringify(record.analysis)));
    record.analysis_finished_at = new Date().toISOString();
  } catch (error) {
    record.analysis_status = 'unavailable';
    record.analysis_error = error.message || String(error);
    record.analysis = manualAnalysis;
  }
  await save(entry);
  return record.analysis;
}

async function reviewOutput(entry) {
  const { record, directory, cropped } = entry;
  if (!generate || (!review && !recheckCandidates) || record.status !== 'generated' || record.automated_review?.status === 'completed') return;
  if (record.automated_review?.status === 'requested') {
    record.automated_review = { status: 'unavailable', error: 'Previous synchronous review outcome is uncertain; no duplicate call launched.' };
    await save(entry);
    return;
  }
  if (record.automated_review?.status === 'unavailable') return;
  const context = {prompt:visualRecoveryPrompt(record.analysis || entry.manualAnalysis,record.mode),system_prompt:recoveryInspectionSystemPrompt('source_image'),image_layout:'source_image',...(recheckCandidates ? {review_revision:reviewRevision} : {})};
  record.automated_review = { ...context, status: 'requested', requested_at: new Date().toISOString() };
  record.validation_calls = (record.validation_calls || 0) + 1;
  await save(entry);
  try {
    const result = await checkRecoveryCandidate({ sourceBuffer: cropped, outputBuffer: await fs.readFile(path.join(directory,'output.png')),
      analysis: record.analysis || entry.manualAnalysis, mode: record.mode, allowCrop: false,
      onUsage: receipt => recordUsage(entry, 'visual_review', receipt) });
    record.automated_review = { ...context, status: 'completed', validation: result.validation, calls: result.calls, finished_at: new Date().toISOString(), advisory_only: true };
  } catch (error) {
    record.automated_review = { ...context, status: 'unavailable', error: error.message || String(error), advisory_only: true };
  }
  await save(entry);
}

async function saveOutput(entry, output, started) {
  const {record,directory} = entry;
  const outMeta = await sharp(output).metadata();
  record.output_dimensions = { width: outMeta.width, height: outMeta.height };
  record.output_sha256 = digest(output); record.finished_at = new Date().toISOString(); record.elapsed_ms = Date.now() - started;
  await fs.writeFile(path.join(directory,'output.png'),output);
  record.status = 'generated'; delete record.error;
  await save(entry);
  console.log(`${record.id}: ${record.extraction_method} ${outMeta.width}x${outMeta.height}`);
}

async function verifyPreservedSource(entry, analysis) {
  const {record,directory,cropped} = entry;
  const prior = record.source_verification;
  if (prior?.status === 'accepted' && record.source_candidate) {
    const buffer = await fs.readFile(path.join(directory,'source-candidate.png'));
    if (digest(buffer) !== record.source_candidate.sha256) throw new Error('Saved source candidate hash mismatch.');
    return {buffer,method:record.source_candidate.method,provenance:record.source_candidate.provenance,validation:prior.validation};
  }
  if (prior?.status === 'requested') {
    record.source_verification = {...prior,status:'unavailable',error:'Previous synchronous source verification outcome is uncertain. No duplicate review launched.'};
    await save(entry);
    return null;
  }
  if (prior) return null;
  const context = {prompt:visualRecoveryPrompt(analysis,record.mode),system_prompt:recoveryInspectionSystemPrompt('source_image'),image_layout:'source_image'};
  record.source_verification = {...context,status:'requested',requested_at:new Date().toISOString()};
  await save(entry);
  let result;
  try {
    result = await verifySourceRecovery({sourceBuffer:cropped,analysis,mode:record.mode,
      onUsage:receipt => recordUsage(entry,'source_candidate_verification',receipt)});
  } catch (error) {
    record.source_verification = {...context,status:'unavailable',error:error.message || String(error),finished_at:new Date().toISOString()};
    await save(entry);
    return null;
  }
  if (result.candidate) {
    const candidate = result.candidate;
    const meta = await sharp(candidate.buffer).metadata();
    await fs.writeFile(path.join(directory,'source-candidate.png'),candidate.buffer);
    record.source_candidate = {method:candidate.method,provenance:candidate.provenance,sha256:digest(candidate.buffer),
      dimensions:{width:meta.width,height:meta.height},file:'source-candidate.png'};
  }
  record.source_verification = {...context,status:result.status,validation:result.validation,calls:result.calls,prompt_used:result.calls > 0,finished_at:new Date().toISOString()};
  record.validation_calls = (record.validation_calls || 0) + (result.calls || 0);
  if (result.recovery) record.automated_review = {...context,status:'completed',validation:result.validation,calls:result.calls,
    purpose:'source_candidate_verification',reused_verification:true,advisory_only:true,finished_at:new Date().toISOString()};
  await save(entry);
  return result.recovery ? {...result.recovery,validation:result.validation} : null;
}

async function recheckExisting(entry) {
  const {record,directory,cropped} = entry;
  if (record.review_recheck?.revision === reviewRevision && record.review_recheck.status === 'completed') return;
  if (!record.analysis || record.analysis_status !== 'completed') {
    record.review_recheck = {revision:reviewRevision,status:'unavailable',reason:'No saved completed surface analysis; review-only mode does not request new analysis or image generation.',additional_image_generation_calls:0};
    await save(entry);
    return;
  }
  const started = Date.now();
  if (record.review_recheck?.revision !== reviewRevision) {
    let inherited;
    try { inherited = await fs.readFile(path.join(directory,'output.png')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (inherited) {
      if (record.output_sha256 && digest(inherited) !== record.output_sha256) throw new Error(`${record.id}: inherited output hash mismatch.`);
      await fs.writeFile(path.join(directory,'previous-output.png'),inherited);
      record.inherited_output = {file:'previous-output.png',sha256:digest(inherited),dimensions:record.output_dimensions,extraction_method:record.extraction_method,
        request_id:record.request_id || null,source_run:record.derived_from.run};
    }
    if (record.source_candidate) record.source_candidate_history = [...(record.source_candidate_history || []),record.source_candidate];
    if (record.source_verification) record.source_verification_history = [...(record.source_verification_history || []),record.source_verification];
    if (record.automated_review) record.automated_review_history = [...(record.automated_review_history || []),record.automated_review];
    if (record.review) record.review_history = [...(record.review_history || []),record.review];
    record.review = {rating:'not_reviewed',notes:'Derived review-only revision; final output needs a fresh manual comparison.'};
    delete record.source_candidate;
    delete record.source_verification;
    delete record.automated_review;
    record.review_recheck = {revision:reviewRevision,status:'running',candidate_status:'not_started',started_at:new Date().toISOString(),
      initial_validation_calls:record.validation_calls || 0,additional_image_generation_calls:0};
    record.image_generation_calls_this_revision = 0;
    await save(entry);
  }
  const progress = record.review_recheck;
  const context = {prompt:visualRecoveryPrompt(record.analysis,record.mode),system_prompt:recoveryInspectionSystemPrompt('source_image'),image_layout:'source_image',review_revision:reviewRevision};
  let verified;
  if (progress.candidate_status === 'requested') {
    if (record.source_verification?.review_revision === reviewRevision && record.source_verification.status !== 'requested') {
      if (record.source_verification.status === 'accepted' && record.source_candidate) {
        const buffer = await fs.readFile(path.join(directory,record.source_candidate.file));
        if (digest(buffer) !== record.source_candidate.sha256) throw new Error(`${record.id}: rechecked candidate hash mismatch.`);
        verified = {recovery:{buffer,method:record.source_candidate.method,provenance:record.source_candidate.provenance},validation:record.source_verification.validation,calls:record.source_verification.calls};
      }
    } else {
      record.source_verification = {...context,status:'unavailable',error:'Previous synchronous raw-canvas verification outcome is uncertain; no duplicate review launched.',finished_at:new Date().toISOString()};
    }
  } else if (progress.candidate_status === 'not_started') {
    progress.candidate_status = 'requested';
    record.source_verification = {...context,status:'requested',requested_at:new Date().toISOString()};
    await save(entry);
    verified = await verifySourceRecovery({sourceBuffer:cropped,analysis:record.analysis,mode:record.mode,
      onUsage:receipt => recordUsage(entry,'source_candidate_verification_raw_canvas',receipt)});
    if (verified.candidate) {
      const meta = await sharp(verified.candidate.buffer).metadata();
      const file = 'source-candidate-raw-canvas-v1.png';
      await fs.writeFile(path.join(directory,file),verified.candidate.buffer);
      record.source_candidate = {method:verified.candidate.method,provenance:verified.candidate.provenance,sha256:digest(verified.candidate.buffer),dimensions:{width:meta.width,height:meta.height},file,review_revision:reviewRevision};
    }
    record.source_verification = {...context,status:verified.status,validation:verified.validation,calls:verified.calls,prompt_used:verified.calls > 0,finished_at:new Date().toISOString()};
    record.validation_calls = (record.validation_calls || 0) + (verified.calls || 0);
    await save(entry);
  }
  if (verified?.recovery) {
    record.extraction_method = verified.recovery.method;
    record.preservation = verified.recovery.provenance;
    record.preservation_validation = verified.validation;
    record.narrow_canvas_ratio_lock = false;
    record.output_selected_from = 'raw_canvas_verified_source_candidate';
    record.automated_review = {...context,status:'completed',validation:verified.validation,calls:verified.calls,
      purpose:'source_candidate_verification',reused_verification:true,advisory_only:true,finished_at:new Date().toISOString()};
    await saveOutput(entry,verified.recovery.buffer,started);
  } else if (progress.candidate_status !== 'completed') {
    record.output_selected_from = 'inherited_previous_attempt';
  }
  progress.candidate_status = 'completed';
  await save(entry);
  // Only review the inherited generated result if a source candidate was not accepted.
  // reviewOutput itself records requested/completed state so a resume cannot duplicate it.
  await reviewOutput(entry);
  progress.status = 'completed';
  progress.finished_at = new Date().toISOString();
  progress.additional_validation_calls = (record.validation_calls || 0) - progress.initial_validation_calls;
  progress.elapsed_ms = Date.now() - started;
  record.review_revision = reviewRevision;
  await save(entry);
  console.log(`${record.id}: review-only ${record.source_verification?.status || 'unavailable'}; output ${record.extraction_method}; new image calls 0`);
}

async function run(entry) {
  const { record, directory, cropped } = entry;
  if (!generate) return;
  if (recheckCandidates) {
    try { await recheckExisting(entry); }
    catch (error) {
      record.review_recheck = {...record.review_recheck,revision:reviewRevision,status:'unavailable',error:error.message || String(error),additional_image_generation_calls:0};
      await save(entry);
      console.log(`${record.id}: review-only unavailable; no image generation launched`);
    }
    return;
  }
  if (record.status === 'generated') { await reviewOutput(entry); return; }
  const started = Date.now();
  try {
    if (!record.request_id) {
      if (['submitting', 'submission_uncertain'].includes(record.status)) throw new Error('Submission outcome is uncertain. Inspect Fal history before starting another paid call.');
      const analysis = await analyzeSurface(entry);
      record.analysis ||= analysis;
      if (analyze) record.narrow_canvas_ratio_lock = (record.crop.width / record.crop.height < 0.35 || record.crop.width / record.crop.height > 3)
        && (verifySource ? record.mode === 'UNIVERSAL_BACKGROUND_ONLY' : record.mode === 'UNIVERSAL_BACKGROUND_ONLY' || analysis.already_flat === true);
      record.input = buildRecoveryImageInput({imageUrls:['LOCAL_REFERENCE_PENDING_UPLOAD'],analysis,mode:record.mode});
      record.prompt_sha256 = digest(Buffer.from(record.input.prompt));
      if (analyze && record.analysis_status === 'completed' && typeof analysis.surface_description === 'string' && analysis.surface_description.trim()) {
        record.source_preservation_attempted = true;
        let preserved;
        try {
          preserved = verifySource ? await verifyPreservedSource(entry,analysis) : await recoverSourcePixels(cropped, analysis, record.mode);
        } catch (error) {
          record.source_preservation_error = error.message || String(error);
          await save(entry);
        }
        if (preserved) {
          record.extraction_method = preserved.method;
          record.preservation = preserved.provenance;
          record.preservation_validation = preserved.validation;
          record.narrow_canvas_ratio_lock = false;
          record.input_used_for_generation = false;
          await saveOutput(entry,preserved.buffer,started);
          await reviewOutput(entry);
          return;
        }
      }
      record.extraction_method = 'image_edit';
      record.status = 'uploading'; await save(entry);
      const url = await fal.storage.upload(new File([cropped], `${record.id}-crop.png`, { type: 'image/png' }));
      record.input = { ...record.input, image_urls: [url] };
      record.status = 'submitting'; record.submitted_at = new Date().toISOString(); await save(entry);
      const submitted = await fal.queue.submit(RECOVERY_IMAGE_ENDPOINT, { input: record.input });
      if (!submitted.request_id) throw new Error('Provider returned no request ID.');
      record.request_id = submitted.request_id; record.generation_calls = 1; record.status = 'queued'; await save(entry);
      record.input_used_for_generation = true;
      console.log(`${record.id}: queued ${record.request_id}`);
    } else console.log(`${record.id}: resume ${record.request_id}`);
    while (Date.now() - started < 240000) {
      const status = await fal.queue.status(RECOVERY_IMAGE_ENDPOINT, { requestId: record.request_id, logs: false });
      if (status.status === 'COMPLETED') break;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    const generated = await fal.queue.result(RECOVERY_IMAGE_ENDPOINT, { requestId: record.request_id });
    record.provider_result = generated.data; record.status = 'downloading'; await save(entry);
    const url = generated.data.images?.[0]?.url;
    if (!url) throw new Error('Provider returned no image.');
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`Provider output download failed (${response.status}).`);
    const raw = Buffer.from(await response.arrayBuffer());
    const rawMeta = await sharp(raw).metadata();
    record.raw_output_dimensions = { width: rawMeta.width, height: rawMeta.height };
    record.raw_output_sha256 = digest(raw);
    await fs.writeFile(path.join(directory, 'raw-output.png'), raw);
    const output = record.narrow_canvas_ratio_lock ? await matchRecoveryStripProportions(raw, record.crop.width, record.crop.height) : raw;
    record.extraction_method ||= 'image_edit';
    record.canvas_normalization_note = record.narrow_canvas_ratio_lock ? verifySource ? 'Final image resized only for background-only mode. KEEP artwork never uses crop-box resizing in this pipeline.' : 'Final image resized to the selected crop bounding-box ratio for background-only or explicitly already-flat artwork. This does not verify internal geometry or physical print dimensions.' : 'Raw provider dimensions retained. A photographed physical surface is not forced into its crop bounding-box ratio; true physical dimensions remain unknown.';
    await saveOutput(entry,output,started);
    await reviewOutput(entry);
  } catch (error) {
    record.status = ['submitting', 'submission_uncertain'].includes(record.status) && !record.request_id ? 'submission_uncertain' : 'error';
    record.error = error.message || JSON.stringify(error.body?.detail || error.body || {name:error.name});
    console.log(`${record.id}: ${record.error}`);
  }
  await save(entry);
}

let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => { while(next < records.length) await run(records[next++]); }));
await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(records.map(entry => entry.record), null, 2));
await fs.copyFile(manifestPath, path.join(root, 'manifest.json'));
const counts = records.reduce((result, { record }) => {
  result[record.status === 'error' ? 'provider_error' : record.review.rating] = (result[record.status === 'error' ? 'provider_error' : record.review.rating] || 0) + 1;
  return result;
}, {});
const errorSummary = record => {
  try {
    const detail = JSON.parse(record.error);
    return Array.isArray(detail) ? detail.map(item => item.msg || item.type).join('; ') : record.error;
  } catch { return record.error || 'Not generated yet'; }
};
const dimensions = value => value ? `${value.width} × ${value.height}` : 'No image';
const hasSummary = await fs.access(path.join(root,'review-summary.json')).then(() => true, () => false);
await fs.writeFile(path.join(root, 'index.html'), `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Universal extraction test record</title><style>
*{box-sizing:border-box}body{margin:0;background:#111611;color:#eef1ea;font:15px/1.5 system-ui}header,main{max-width:1440px;margin:auto;padding:28px}h1{font-size:30px;margin:0}p{color:#b5bfb2}article{background:#1c241c;border:1px solid #394239;border-radius:14px;padding:22px;margin:0 0 28px}h2{font-size:20px;margin:0 0 8px}.views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}figure{margin:0;background:#0c100c;border-radius:8px;padding:12px}img{width:100%;height:430px;object-fit:contain}figcaption{font-weight:600}a{color:#c9ed8f}code{word-break:break-word}.meta,.counts{display:flex;gap:14px;flex-wrap:wrap;color:#bbcfaf}.counts{margin:20px 0}.counts span{padding:10px 16px;border:1px solid #56664f;border-radius:8px}details{margin-top:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#b5bfb2}.review{border-left:3px solid #c9ed8f;padding:0 16px}.error{color:#ffb4b4}@media(max-width:700px){.views{grid-template-columns:1fr}img{height:360px}header,main{padding:16px}}</style><header><h1>Universal extraction · user reference tests</h1><p>${records.length} supplied references · Keep all artwork · At most one image-edit submission per case; source-preserving cases have no image generation. No automatic retries. Generation completion is separate from visual fidelity.</p><div class="counts">${Object.entries(counts).map(([rating,count])=>`<span><strong>${count}</strong> ${esc(rating.replaceAll('_',' '))}</span>`).join('')}</div><p><strong>Scope:</strong> ${analyze ? 'Automatic surface analysis and the shared source-preserving helper, with image-edit fallback for uncertain or non-planar surfaces.' : 'Shared Universal image-edit prompt builder.'} Uses manually chosen crops, categories and explicit target descriptions. Workspace UI, upscaling and vectorization were not exercised. ${verifySource ? 'Source-preserving candidates require a mandatory comparison; rejected or unavailable candidates fall back to one image edit.' : ''} Final-output review, when requested, is advisory and is recorded separately from the manual rating.</p><p><strong>Review rubric:</strong> Pass = overall visible target/layout preserved and scene removed; tiny text may remain unverified. Partial = recognizable composition with altered or missing details. Fail = wrong/duplicated content, major invented artwork, or a mockup/perspective retained. Provider errors have no image to grade. No result is certified as an exact print master.</p><p>Crop rectangles use EXIF-upright original pixels. A photographed crop's aspect ratio is not proof of the true flat print size. Narrow outputs may be resized to the crop ratio; both raw and final images are preserved.</p><a href="results.json">Complete machine-readable record</a>${hasSummary ? ' · <a href="review-summary.json">Review summary and priorities</a>' : ''}</header><main>${records.map(({record:r})=>`<article id="case-${r.id}"><h2>${esc(r.id)} · ${esc(r.category)} · ${esc(r.source_name)}</h2><div class="meta"><span>${esc(r.status)}</span><span>Review: ${esc(r.review.rating.replaceAll('_',' '))}</span><span>Crop: x=${r.crop.left}, y=${r.crop.top}, w=${r.crop.width}, h=${r.crop.height}</span></div><p>${esc(r.target)}</p><div class="views"><figure><figcaption>Original / red crop rectangle</figcaption><a href="${r.id}/crop-map.png"><img loading="lazy" alt="Original reference with crop rectangle for case ${r.id}" src="${r.id}/crop-map.png"></a><a href="${r.id}/original${esc(path.extname(r.source_name).toLowerCase())}">Untouched original</a></figure><figure><figcaption>Exact selected reference</figcaption><a href="${r.id}/crop.png"><img loading="lazy" alt="Exact selected crop for case ${r.id}" src="${r.id}/crop.png"></a></figure><figure><figcaption>Recorded output</figcaption>${r.status==='generated'?`<a href="${r.id}/output.png"><img loading="lazy" alt="Generated output for case ${r.id}" src="${r.id}/output.png"></a>`:`<p class="error">${esc(errorSummary(r))}</p><p>No output returned. Full provider error is saved in the case record.</p>`}</figure></div>${r.source_candidate ? `<p><a href="${r.id}/${esc(r.source_candidate.file || 'source-candidate.png')}">Source-preserving candidate</a> · mandatory verification: ${esc(r.source_verification?.status || 'not recorded')}. ${esc(r.source_verification?.validation?.correction || '')}</p>` : ''}${r.inherited_output ? `<p><a href="${r.id}/${esc(r.inherited_output.file)}">Preserved previous-attempt output</a> · this revision launched ${r.image_generation_calls_this_revision || 0} additional image generations.</p>` : ''}${r.output_plane ? `<p>Geometry proposal: <a href="${r.id}/${esc(r.output_plane.input_file)}">saved generated input</a> · <a href="${r.id}/${esc(r.output_plane.candidate_file)}">straightened candidate</a> · ${r.output_plane.status === 'accepted_local_geometry' ? 'local geometry corrected; fidelity requires review' : 'verification ' + esc(r.output_plane.status)}. Existing generated lettering is preserved; original-reference fidelity is graded separately.</p>` : ''}<div class="review"><p><strong>Visual review:</strong> ${esc(r.review.notes)}</p></div>${r.attribution_notes?`<p><strong>Source credit:</strong> ${esc(r.attribution_notes)}</p>`:''}<details><summary>Crop reason, dimensions, settings and provider record</summary><p>${esc(r.crop.reason)}</p><p>Original: ${dimensions(r.original_dimensions)} · Crop: ${r.crop.width} × ${r.crop.height} · Raw output: ${dimensions(r.raw_output_dimensions)} · Final output: ${dimensions(r.output_dimensions)} pixels.</p><p>Crop ratio normalization: ${r.narrow_canvas_ratio_lock ? 'enabled; output canvas follows selected crop proportions, without validating internal geometry' : ['source_pixels', 'planar_rectification'].includes(r.extraction_method) ? 'not applied; source geometry output retained' : 'not applied; raw provider dimensions retained'}.</p><p>Method: ${esc(r.extraction_method || 'image_edit')} · Mode: ${esc(r.mode)} · Model: ${esc(r.model)} · Request: ${esc(r.request_id || 'none')}</p><a href="${r.id}/record.json">Exact prompt, settings, hashes and provider record</a>${r.raw_output_dimensions?` · <a href="${r.id}/raw-output.png">Raw provider image</a>`:''}<p>Image-edit prompt ${r.input_used_for_generation === false ? 'was not sent: source pixels were preserved' : 'and settings are saved above'}.</p><pre>${esc(r.input.prompt)}</pre>${r.analysis ? `<pre>${esc(JSON.stringify({analysis:r.analysis,preservation:r.preservation,source_verification:r.source_verification,source_candidate:r.source_candidate,review_recheck:r.review_recheck,derived_from:r.derived_from,inherited_output:r.inherited_output,output_plane:r.output_plane,automated_review:r.automated_review},null,2))}</pre>` : ''}</details></article>`).join('')}</main></html>`);
console.log(`Report: ${path.join(root, 'index.html')}`);
