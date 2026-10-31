// Prepare/record only: node scripts/evals/directcrop-pouch-live.mjs actual-case-folder
// One direct image edit, or resume its saved request: add --generate.
// No source analysis, quality model, image upload, project write or credit mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import nextEnv from '@next/env';
import { fal } from '@fal-ai/client';
import { buildRecoveryImageInput, RECOVERY_IMAGE_ENDPOINT } from '../../src/lib/recoveryVision.mjs';
import { normalizeRecoveryAnalysis } from '../../src/lib/recoveryAnalysis.mjs';
import { categoryRecoveryAnalysis } from '../../src/lib/referenceCategories.mjs';
import { snapToAllowedAspectRatio } from '../../src/lib/aspectRatio.js';
import { matchRecoveryStripProportions } from '../../src/lib/recoveryStrip.mjs';

nextEnv.loadEnvConfig(process.cwd(), true);
if (!process.argv[2]) throw new Error('Provide the actual saved pouch case folder; add --generate for one image call.');
const root = path.resolve(process.argv[2]);
const generate = process.argv.includes('--generate');
const expectedSourceHash = '5a0d477fff57b7d86c853afd3faca8723fd9ec8b718528db680b56e380eb9c01';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const project = JSON.parse(await fs.readFile(path.join(root,'project-before.json'),'utf8'));
if (project.id !== '16372f3a-156d-4451-bc16-4e46d87a0d2c') throw new Error('This focused evaluation requires the recorded actual pouch project.');
const sourceUrl = project.original_image_url;
if (!sourceUrl || new URL(sourceUrl).protocol !== 'https:') throw new Error('Missing original selected-crop URL.');
const source = await fs.readFile(path.join(root,'source-original.jpg'));
if (digest(source) !== expectedSourceHash) throw new Error('The stored original crop differs from the recorded actual user reference.');
const response = await fetch(sourceUrl,{signal:AbortSignal.timeout(45000)});
if (!response.ok) throw new Error(`Original source download failed (${response.status}).`);
const downloadedSource = Buffer.from(await response.arrayBuffer());
if (digest(downloadedSource) !== expectedSourceHash) throw new Error('The exact provider-reference URL no longer serves the recorded source bytes.');
const upright = await sharp(source).rotate().png().toBuffer();
const {width,height} = await sharp(upright).metadata();
if (width !== 367 || height !== 494) throw new Error('Actual selected crop dimensions changed.');
const [decodedSource,decodedPreview] = await Promise.all([sharp(upright).ensureAlpha().raw().toBuffer(),sharp(path.join(root,'source.png')).ensureAlpha().raw().toBuffer()]);
if (!decodedSource.equals(decodedPreview)) throw new Error('The displayed source preview differs from the original JPEG crop.');
const cropRatio = width / height;
const aspectRatio = cropRatio >= 9/16 && cropRatio <= 21/9 ? snapToAllowedAspectRatio(width,height) : 'auto';
const mode = project.canvas_data?.universal_recovery?.mode || project.ai_prompt || 'UNIVERSAL_KEEP_ARTWORK';
if (mode !== 'UNIVERSAL_KEEP_ARTWORK') throw new Error('This actual-case evaluation expects Keep All Artwork.');
const analysis = categoryRecoveryAnalysis({...normalizeRecoveryAnalysis({state:'partial',quality:Math.min(width,height)<192?'poor':'fair',confidence:0,
  aspect_ratio:aspectRatio,layout_strategy:'unknown',surface_description:'All visible printed artwork inside the exact user-selected crop.',
  reason:'Direct extraction from the selected crop; no separate image analysis was requested.'},'auto'),source_width:width,source_height:height,
  crop_authoritative:true,preparation:'local_crop_dimensions_only'},project.canvas_data?.reference_category);
const input = buildRecoveryImageInput({imageUrls:[sourceUrl],analysis,mode,directCrop:true});
const inputHash = digest(Buffer.from(JSON.stringify(input)));
const file = path.join(root,'after-direct.json');
let record;
try {record=JSON.parse(await fs.readFile(file,'utf8'));} catch(error){if(error.code!=='ENOENT')throw error;}
if (record?.input_sha256 !== inputHash && (record?.request_id || record?.generation_attempts || ['submitting','submission_uncertain'].includes(record?.status))) throw new Error('Direct provider input changed after submission. Preserve this attempt and use a new attempt file.');
record ||= {project_id:project.id,created_at:new Date().toISOString(),status:'prepared',generation_attempts:0,image_generation_calls:0,analysis_calls:0,validation_calls:0,
  review:{rating:'not_reviewed',notes:'A completed image call is not an accuracy verdict; compare manually with the exact selected crop.'}};
Object.assign(record,{flow:'direct_crop',direct_crop:true,category:analysis.reference_category,mode,model:RECOVERY_IMAGE_ENDPOINT,
  source_url:sourceUrl,source_final_url_verified:response.url,source_file:'source-original.jpg',source_sha256:expectedSourceHash,
  source_decoded_rgba_sha256:digest(decodedSource),source_dimensions:{width,height},source_verified_at:new Date().toISOString(),
  source_reuploaded:false,source_pixels_changed:false,crop:{left:0,top:0,width,height,coordinate_space:'existing user-selected crop pixels',new_selection:false},
  local_preparation:analysis,input,input_sha256:inputHash,narrow_canvas_ratio_lock:cropRatio<0.35||cropRatio>3,
  baseline:{flat:'flat-before.png',flat_raw:'flat-before-original.png',upscale:'upscale-before.png',upscale_raw:'upscale-before-original.png',
    stages:'stages-before.json',provider_usage:'provider-usage-before.json'},
  scope_note:'The earlier case12 used the whole Lil Bucks advertisement under Poster. This actual case is an isolated 367x494 pouch crop under Auto; the earlier five overall passes did not test or establish success for this crop.',
  database_mutations:0,project_credit_mutations:0});
const save = () => fs.writeFile(file,JSON.stringify(record,null,2));
await save();

if (generate && record.status !== 'generated') {
  if (!process.env.FAL_KEY) throw new Error('FAL credentials are not configured in the development environment.');
  fal.config({credentials:process.env.FAL_KEY});
  try {
    if (!record.request_id) {
      if (['submitting','submission_uncertain'].includes(record.status) || record.generation_attempts) throw new Error('Submission outcome is uncertain; inspect the provider history before any new paid request.');
      record.status='submitting';record.submitted_at=new Date().toISOString();record.generation_attempts=1;
      await save();
      const queued=await fal.queue.submit(RECOVERY_IMAGE_ENDPOINT,{input:record.input});
      if(!queued.request_id)throw new Error('Provider returned no request ID.');
      record.request_id=queued.request_id;record.image_generation_calls=1;record.status='queued';await save();
      console.log(`Direct crop queued: ${record.request_id}`);
    } else console.log(`Resuming exact saved request: ${record.request_id}`);
    const deadline=Date.now()+240000;
    while(Date.now()<deadline){const status=await fal.queue.status(RECOVERY_IMAGE_ENDPOINT,{requestId:record.request_id,logs:false});if(status.status==='COMPLETED')break;await new Promise(resolve=>setTimeout(resolve,1500));}
    const result=await fal.queue.result(RECOVERY_IMAGE_ENDPOINT,{requestId:record.request_id});
    record.provider_result=result.data;record.status='downloading';await save();
    const url=result.data.images?.[0]?.url;if(!url)throw new Error('Provider returned no image.');
    const outputResponse=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!outputResponse.ok)throw new Error(`Output download failed (${outputResponse.status}).`);
    const raw=Buffer.from(await outputResponse.arrayBuffer());
    const rawMeta=await sharp(raw).metadata();
    await fs.writeFile(path.join(root,'raw-output-after-direct.png'),raw);
    const output=record.narrow_canvas_ratio_lock?await matchRecoveryStripProportions(raw,width,height):raw;
    const meta=await sharp(output).metadata();
    await fs.writeFile(path.join(root,'output-after-direct.png'),output);
    Object.assign(record,{status:'generated',raw_output_dimensions:{width:rawMeta.width,height:rawMeta.height},raw_output_sha256:digest(raw),
      output_dimensions:{width:meta.width,height:meta.height},output_sha256:digest(output),finished_at:new Date().toISOString()});
    delete record.error;await save();
  } catch(error) {
    record.status=!record.request_id&&record.generation_attempts?'submission_uncertain':'error';
    record.error=error.message||String(error);await save();
    console.log(`Direct crop status: ${record.status}`);
  }
}

const oldUpscale=await fs.readFile(path.join(root,'upscale-before.png'));
await sharp(oldUpscale).resize(1400,900,{fit:'inside',withoutEnlargement:true}).png().toFile(path.join(root,'upscale-before-preview.png'));
const dimensions=value=>value?`${value.width} × ${value.height}`:'No output';
await fs.writeFile(path.join(root,'before-after.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Actual pouch crop · direct extraction test</title><style>*{box-sizing:border-box}body{margin:0;background:#111611;color:#eef1ea;font:15px/1.5 system-ui}main{max-width:1600px;margin:auto;padding:28px}h1{margin:0}p{color:#bdc7b9}a{color:#c9ed8f}.views{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}figure{margin:0;padding:14px;border:1px solid #394239;border-radius:10px;background:#1c241c}figcaption{font-weight:700;min-height:50px}img{width:100%;height:480px;object-fit:contain}.empty{height:480px;padding:28px;color:#ffb4b4}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}details{margin-top:24px}.notice{padding:16px;border-left:4px solid #c9ed8f;background:#1c241c}@media(max-width:1050px){.views{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){main{padding:16px}.views{grid-template-columns:1fr}}</style><main><h1>Actual pouch crop · direct extraction</h1><p>Same existing user-selected crop, Auto category and Keep All Artwork. No new crop, no reference re-upload, no remote analysis and no automatic quality-model calls.</p><p class="notice">${esc(record.scope_note)}</p><div class="views"><figure><figcaption>Exact selected reference · 367 × 494</figcaption><a href="source-original.jpg"><img src="source.png" alt="Actual isolated pouch crop"></a><p>The original JPEG URL is sent directly, with unchanged bytes.</p></figure><figure><figcaption>Before · flat extraction · 2816 × 1536</figcaption><a href="flat-before-original.png"><img src="flat-before.png" alt="Actual earlier flat extraction"></a><p>Earlier image generation duplicated/redesigned the selected single pouch.</p></figure><figure><figcaption>Before · HD upscale · 11264 × 6144</figcaption><a href="upscale-before-original.png"><img src="upscale-before-preview.png" alt="Preview of earlier HD upscale"></a><p>Upscaling followed the incorrect flat extraction. Full original remains linked.</p></figure><figure><figcaption>After · direct crop · ${dimensions(record.output_dimensions)}</figcaption>${record.status==='generated'?'<a href="output-after-direct.png"><img src="output-after-direct.png" alt="New direct-crop extraction"></a>':`<div class="empty">${esc(record.status)}${record.error?'<p>See the saved provider record for the exact error.</p>':''}</div>`}<p>Analysis calls: 0 · Quality-model calls: 0 · Image calls: ${record.image_generation_calls}.</p></figure></div><p><strong>Manual review:</strong> ${esc(record.review.notes)} (${esc(record.review.rating)})</p><p>No new HD upscale or vector generation is included in this focused edit-stage test.</p><a href="after-direct.json">Exact direct input / request / hashes</a> · <a href="stages-before.json">Original stage dimensions and hashes</a> · <a href="provider-usage-before.json">Earlier provider requests</a>${record.status==='generated'?' · <a href="raw-output-after-direct.png">Raw direct output</a>':''}<details><summary>Direct provider settings and scope</summary><p>Model: ${esc(record.model)} · Aspect ratio: ${esc(input.aspect_ratio)} · Request: ${esc(record.request_id||'not submitted')}.</p><p>Source SHA256: ${record.source_sha256}. No Syncraft project writes or credit transactions are made by this script.</p><pre>${esc(JSON.stringify(input,null,2))}</pre></details></main></html>`);
console.log(JSON.stringify({status:record.status,analysis_calls:record.analysis_calls,quality_model_calls:record.validation_calls,image_calls:record.image_generation_calls,
  aspect_ratio:input.aspect_ratio,source_sha256:record.source_sha256,request_id:record.request_id||null,report:path.join(root,'before-after.html')}));
