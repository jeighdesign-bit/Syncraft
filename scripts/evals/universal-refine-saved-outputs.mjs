// Prepare geometric proposals only: node scripts/evals/universal-refine-saved-outputs.mjs run-folder
// Verify proposals and independently review accepted outputs: add --verify.
// Apply only deterministic containment evidence, with no model calls: add --local-geometry.
// This script never submits image generation. All original provider artifacts remain intact.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import nextEnv from '@next/env';
import { proposeOutputPrintPlane, verifyOutputPrintPlane } from '../../src/lib/recoveryOutputPlane.mjs';
import { checkRecoveryCandidate } from '../../src/lib/recoveryCandidate.mjs';
import { visualRecoveryPrompt, recoveryInspectionSystemPrompt, RECOVERY_VISION_MODEL } from '../../src/lib/recoveryVision.mjs';

nextEnv.loadEnvConfig(process.cwd());
if (!process.argv[2]) throw new Error('Provide a saved run folder; add --verify for paid visual comparisons only.');
const root = path.resolve(process.argv[2]);
const verify = process.argv.includes('--verify');
const localGeometry = process.argv.includes('--local-geometry');
if (verify && localGeometry) throw new Error('Choose --verify or --local-geometry; local geometry never calls a provider.');
const revision = localGeometry ? 'generated_output_plane_local_v1' : 'generated_output_plane_v1';
const acceptedStatus = localGeometry ? 'accepted_local_geometry' : 'accepted';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const savedResults = JSON.parse(await fs.readFile(path.join(root,'results.json'),'utf8'));
const records = [], summary = [];
const dimensions = async buffer => { const meta = await sharp(buffer).metadata(); return {width:meta.width,height:meta.height}; };

async function run(record, directory) {
  const save = () => fs.writeFile(path.join(directory,'record.json'),JSON.stringify(record,null,2));
  const usage = async (purpose, receipt) => {
    record.provider_usage ||= [];
    record.provider_usage.push({purpose,...receipt,recorded_at:new Date().toISOString()});
    await save();
  };
  const accept = async candidate => {
    if (digest(candidate) !== record.output_plane.candidate_sha256) throw new Error('Verified proposal differs from the saved candidate.');
    if (!record.output_plane.output_committed) {
      if (record.automated_review) record.automated_review_history = [...(record.automated_review_history || []),{...record.automated_review,archived_for:revision}];
      if (record.review) record.review_history = [...(record.review_history || []),record.review];
      delete record.automated_review;
      record.review = {rating:'not_reviewed',notes:'Generated output received verified geometric rectification; compare the final result with the original before grading.'};
    }
    await fs.writeFile(path.join(directory,'output.png'),candidate);
    record.output_sha256 = digest(candidate);
    record.output_dimensions = await dimensions(candidate);
    record.extraction_method = 'image_edit_rectified';
    record.output_selected_from = revision;
    record.narrow_canvas_ratio_lock = false;
    record.output_plane.output_sha256 = record.output_sha256;
    record.output_plane.accepted_at ||= new Date().toISOString();
    record.output_plane.pixels_regenerated = false;
    record.output_plane.output_committed = true;
    record.output_plane.status = acceptedStatus;
    if (localGeometry) {
      record.output_plane.reference_review = {status:'not_run',reason:'Local geometry mode makes no provider calls; original-reference fidelity requires manual review.'};
      record.automated_review = {status:'not_run',review_revision:revision,validation:record.output_plane.validation,
        local_geometry_validation:true,advisory_only:true,correction:'Local geometry corrected; original lettering and artwork fidelity still require review.'};
    }
    record.finished_at = new Date().toISOString();
    await save();
  };
  const finalReview = async () => {
    if (localGeometry || !verify || record.output_plane.status !== 'accepted' || record.output_plane.reference_review?.status === 'completed') return;
    if (record.output_plane.reference_review?.status === 'requested') {
      record.output_plane.reference_review = {...record.output_plane.reference_review,status:'unavailable',error:'Previous synchronous reference-review outcome is uncertain; no duplicate review launched.'};
      record.automated_review = record.output_plane.reference_review;
      await save();
      return;
    }
    if (record.output_plane.reference_review?.status === 'unavailable') return;
    const context = {review_revision:revision,prompt:visualRecoveryPrompt(record.analysis,record.mode),system_prompt:recoveryInspectionSystemPrompt('source_image'),image_layout:'source_image',advisory_only:true};
    record.output_plane.reference_review = {...context,status:'requested',requested_at:new Date().toISOString()};
    record.validation_calls = (record.validation_calls || 0) + 1;
    record.output_plane.review_calls = (record.output_plane.review_calls || 0) + 1;
    await save();
    try {
      const checked = await checkRecoveryCandidate({sourceBuffer:await fs.readFile(path.join(directory,'crop.png')),
        outputBuffer:await fs.readFile(path.join(directory,'output.png')),analysis:record.analysis,mode:record.mode,method:'image_edit',allowCrop:false,
        onUsage:receipt => usage('output_plane_reference_review',receipt)});
      record.output_plane.reference_review = {...context,status:'completed',validation:checked.validation,calls:checked.calls,finished_at:new Date().toISOString()};
    } catch (error) {
      record.output_plane.reference_review = {...context,status:'unavailable',error:error.message || String(error),finished_at:new Date().toISOString()};
    }
    record.automated_review = record.output_plane.reference_review;
    await save();
  };

  if (record.output_plane?.revision === revision && record.output_plane.status === acceptedStatus) {
    await finalReview();
    return {id:record.id,status:acceptedStatus,changed:false,additional_image_generation_calls:0};
  }
  if (record.output_plane?.revision === revision && record.output_plane.status === 'accepted_pending_output') {
    await accept(await fs.readFile(path.join(directory,record.output_plane.candidate_file)));
    await finalReview();
    return {id:record.id,status:acceptedStatus,changed:true,additional_image_generation_calls:0};
  }
  if (record.status !== 'generated' || record.extraction_method !== 'image_edit' || !record.analysis) return {id:record.id,status:'skipped_method',method:record.extraction_method};
  const buffer = await fs.readFile(path.join(directory,'output.png'));
  if (record.output_sha256 && digest(buffer) !== record.output_sha256) throw new Error('Saved output hash mismatch.');
  const previous = record.output_plane?.revision !== revision ? record.output_plane : null;
  if (previous && !localGeometry) throw new Error('A different output refinement revision already exists. Use a derived run folder.');
  const active = previous ? null : record.output_plane;
  if (active?.input_sha256 && active.input_sha256 !== digest(buffer)) throw new Error('Refinement input changed. Use a derived run folder.');
  if (active?.status === 'requested') {
    record.output_plane.status = 'unavailable';
    record.output_plane.error = 'Previous synchronous output-plane verification outcome is uncertain; no duplicate review launched.';
    await save();
    return {id:record.id,status:'unavailable',additional_image_generation_calls:0};
  }
  if (active && !['prepared'].includes(active.status)) return {id:record.id,status:active.status,additional_image_generation_calls:0};

  const proposal = await proposeOutputPrintPlane(buffer,record.analysis,record.mode);
  if (!proposal) return {id:record.id,status:'not_proposed'};
  const candidateHash = digest(proposal.buffer);
  if (active?.candidate_sha256 && active.candidate_sha256 !== candidateHash) throw new Error('Geometric proposal changed. Use a derived run folder.');
  if (previous) {
    const archived = {...previous};
    for (const kind of ['input','candidate']) {
      const oldFile = previous[`${kind}_file`];
      if (oldFile) {
        const archivedFile = `output-plane-${kind}-${previous.revision}.png`;
        await fs.copyFile(path.join(directory,oldFile),path.join(directory,archivedFile));
        archived[`${kind}_file`] = archivedFile;
      }
    }
    record.output_plane_history = [...(record.output_plane_history || []),archived];
    delete record.output_plane;
  }
  await fs.writeFile(path.join(directory,'output-plane-input.png'),buffer);
  await fs.writeFile(path.join(directory,'output-plane-candidate.png'),proposal.buffer);
  record.output_plane = {...record.output_plane,revision,status:'prepared',input_file:'output-plane-input.png',candidate_file:'output-plane-candidate.png',
    input_sha256:digest(buffer),candidate_sha256:candidateHash,input_dimensions:await dimensions(buffer),candidate_dimensions:await dimensions(proposal.buffer),
    quad:proposal.quad,diagnostics:proposal.diagnostics,original_extraction_method:record.extraction_method,
    prompt:visualRecoveryPrompt(record.analysis,record.mode),system_prompt:recoveryInspectionSystemPrompt('source_image'),image_layout:'source_image',
    model:process.env.RECOVERY_VISION_MODEL || RECOVERY_VISION_MODEL,prompt_used:!localGeometry && verify,additional_image_generation_calls:0,
    fidelity_scope:localGeometry ? 'Local geometry corrected using deterministic full-resolution foreground containment. No model review was called. Original artwork and lettering fidelity require separate manual review.'
      : 'The mandatory check compares the already-generated input to a geometric rectification. It does not certify fidelity to the original reference; the separate reference review checks that.',prepared_at:new Date().toISOString()};
  await save();
  if (!verify && !localGeometry) return {id:record.id,status:'prepared',candidate_dimensions:record.output_plane.candidate_dimensions,additional_image_generation_calls:0};

  record.output_plane.status = 'requested';
  record.output_plane.requested_at = new Date().toISOString();
  await save();
  const checked = await verifyOutputPrintPlane({buffer,analysis:record.analysis,mode:record.mode,
    ...(localGeometry ? {allowLocalEvidence:true,check:async()=>{throw new Error('Local geometry mode forbids provider checks.');}} : {}),
    onUsage:receipt => usage('output_plane_verification',receipt)});
  record.validation_calls = (record.validation_calls || 0) + (checked.calls || 0);
  record.output_plane.review_calls = (record.output_plane.review_calls || 0) + (checked.calls || 0);
  record.output_plane.status = checked.status === acceptedStatus ? 'accepted_pending_output' : checked.status;
  record.output_plane.validation = checked.validation;
  record.output_plane.calls = checked.calls;
  record.output_plane.finished_at = new Date().toISOString();
  await save();
  if (checked.status === acceptedStatus) {
    await accept(checked.buffer);
  }
  await save();
  await finalReview();
  return {id:record.id,status:checked.status,changed:checked.status===acceptedStatus,additional_image_generation_calls:0,review_calls:record.output_plane.review_calls};
}

for (const saved of savedResults) {
  const directory = path.join(root,saved.id);
  const record = JSON.parse(await fs.readFile(path.join(directory,'record.json'),'utf8'));
  const identity = {request_id:record.request_id,generation_calls:record.generation_calls,raw_output_sha256:record.raw_output_sha256};
  try { summary.push(await run(record,directory)); }
  catch (error) {
    summary.push({id:record.id,status:'error',error:error.message || String(error),additional_image_generation_calls:0});
    if (record.output_plane) {
      if (!['accepted','accepted_local_geometry','accepted_pending_output'].includes(record.output_plane.status)) record.output_plane.status = 'unavailable';
      record.output_plane.error = error.message || String(error);
      await fs.writeFile(path.join(directory,'record.json'),JSON.stringify(record,null,2));
    }
  }
  if (record.request_id !== identity.request_id || record.generation_calls !== identity.generation_calls || record.raw_output_sha256 !== identity.raw_output_sha256) throw new Error(`Case ${record.id}: inherited generation identity changed.`);
  if (record.review_recheck && record.output_plane) {
    record.review_recheck.additional_validation_calls = (record.validation_calls || 0) - (record.review_recheck.initial_validation_calls || 0);
    await fs.writeFile(path.join(directory,'record.json'),JSON.stringify(record,null,2));
  }
  records.push(record);
}
await fs.writeFile(path.join(root,'results.json'),JSON.stringify(records,null,2));
await fs.writeFile(path.join(root,'output-plane-results.json'),JSON.stringify({revision,verify,local_geometry:localGeometry,additional_image_generation_calls:0,cases:summary},null,2));
console.log(JSON.stringify({revision,verify,local_geometry:localGeometry,additional_image_generation_calls:0,cases:summary}));
