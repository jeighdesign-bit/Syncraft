// Render saved extraction attempts only; this script never calls a provider.
// Usage: node scripts/evals/universal-compare-report.mjs before-folder after-folder report.html [earlier-attempt-folders...]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [beforePath, afterPath, destination, ...previousAttemptPaths] = process.argv.slice(2);
if (!beforePath || !afterPath || !destination) throw new Error('Provide before-folder, after-folder and destination HTML.');
const output = path.resolve(destination);
const root = path.dirname(output);
const beforeRoot = path.resolve(beforePath), afterRoot = path.resolve(afterPath);
const previousAttemptIndexes = previousAttemptPaths.map(folder => path.join(path.resolve(folder),'index.html'));
for (const file of previousAttemptIndexes) await fs.access(file);
const before = JSON.parse(await fs.readFile(path.join(beforeRoot, 'results.json'), 'utf8'));
const after = JSON.parse(await fs.readFile(path.join(afterRoot, 'results.json'), 'utf8'));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const relative = file => path.relative(root, file).split(path.sep).map(encodeURIComponent).join('/');
const exists = async file => fs.access(file).then(() => true, () => false);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rating = record => record.status === 'error' ? 'provider_error' : record.review?.rating || 'not_reviewed';
const score = { fail: 0, partial: 1, pass: 2 };
const label = value => String(value).replaceAll('_', ' ');
const ratingLabel = value => value === 'pass' ? 'overall visual pass' : label(value);
const planeLabel = value => value === 'accepted_local_geometry' ? 'local geometry corrected; fidelity requires review' : label(value);
const dims = dimensions => dimensions ? `${dimensions.width} × ${dimensions.height}` : 'No output';
const beforeById = new Map(before.map(record => [record.id, record]));
if (before.length !== after.length) throw new Error('Before and after runs have different case counts.');
const comparisons = [];
for (const result of after) {
  const original = beforeById.get(result.id);
  if (!original || original.source_sha256 !== result.source_sha256 || original.category !== result.category || original.mode !== result.mode || original.target !== result.target
    || ['left','top','width','height'].some(key => original.crop[key] !== result.crop[key])) throw new Error(`Case ${result.id} changed source, crop, target, category or mode; cannot claim a same-reference comparison.`);
  const [oldOriginal,newOriginal,oldCrop,newCrop] = await Promise.all([
    fs.readFile(path.join(beforeRoot,result.id,'original'+path.extname(original.source_name))),
    fs.readFile(path.join(afterRoot,result.id,'original'+path.extname(result.source_name))),
    fs.readFile(path.join(beforeRoot,result.id,'crop.png')),
    fs.readFile(path.join(afterRoot,result.id,'crop.png')),
  ]);
  if (digest(oldOriginal) !== original.source_sha256 || digest(newOriginal) !== result.source_sha256 || digest(oldCrop) !== digest(newCrop)) throw new Error(`Case ${result.id} has mismatched saved original or crop bytes.`);
  const oldRating = rating(original), newRating = rating(result);
  const change = score[oldRating] !== undefined && score[newRating] !== undefined
    ? score[newRating] > score[oldRating] ? 'improved' : score[newRating] < score[oldRating] ? 'regressed' : 'same_grade'
    : oldRating === 'provider_error' && result.status === 'generated' ? 'new_output' : 'pending_review';
  comparisons.push({ id: result.id, category: result.category, source_name: result.source_name, source_sha256: result.source_sha256, crop_sha256: digest(newCrop), crop: result.crop,
    before_rating: oldRating, after_rating: newRating, change,
    qualitative_regression: result.review?.qualitative_regression === true,
    before_method: original.extraction_method || 'image_edit', after_method: result.extraction_method || 'image_edit',
    after_source_verification: result.source_verification || null,
    after_source_candidate: result.source_candidate ? relative(path.join(afterRoot,result.id,result.source_candidate.file || 'source-candidate.png')) : null,
    after_inherited_output: result.inherited_output ? relative(path.join(afterRoot,result.id,result.inherited_output.file)) : null,
    after_review_revision: result.review_revision || null,
    after_additional_image_calls: result.image_generation_calls_this_revision ?? null,
    after_output_plane: result.output_plane ? {status:result.output_plane.status,label:planeLabel(result.output_plane.status),revision:result.output_plane.revision,
      input:relative(path.join(afterRoot,result.id,result.output_plane.input_file)),candidate:relative(path.join(afterRoot,result.id,result.output_plane.candidate_file)),
      quad:result.output_plane.quad,diagnostics:result.output_plane.diagnostics,validation:result.output_plane.validation,review_calls:result.output_plane.review_calls || 0} : null,
    before_request_id: original.request_id || null, after_request_id: result.request_id || null,
    before_dimensions: original.output_dimensions || null, after_dimensions: result.output_dimensions || null,
    original, result });
}
const tally = values => values.reduce((counts, value) => (counts[value] = (counts[value] || 0) + 1, counts), {});
const callTotals = records => records.reduce((counts, record) => ({
  surface_analysis: counts.surface_analysis + (record.analysis_calls || 0),
  image_generation: counts.image_generation + (record.generation_calls || 0),
  visual_lettering_review: counts.visual_lettering_review + (record.validation_calls || 0),
}), {surface_analysis:0,image_generation:0,visual_lettering_review:0});
const currentRevisionCalls = after.reduce((counts, record) => ({
  surface_analysis: counts.surface_analysis + (record.derived_from ? 0 : record.analysis_calls || 0),
  image_generation: counts.image_generation + (record.derived_from ? record.image_generation_calls_this_revision || 0 : record.generation_calls || 0),
  visual_lettering_review: counts.visual_lettering_review + (record.derived_from
    ? record.review_recheck?.additional_validation_calls ?? Math.max(0,(record.validation_calls || 0) - (record.review_recheck?.initial_validation_calls || 0))
    : record.validation_calls || 0),
}), {surface_analysis:0,image_generation:0,visual_lettering_review:0});
const summary = { created_at: new Date().toISOString(), before_run: path.basename(beforeRoot), after_run: path.basename(afterRoot),
  case_count: comparisons.length, same_source_and_crop_verified: true,
  earlier_attempt: previousAttemptIndexes.length ? relative(previousAttemptIndexes[0]) : null,
  earlier_attempts: previousAttemptIndexes.map(file => relative(file)),
  baseline_no_output_cases: comparisons.filter(item => item.original.status !== 'generated').map(item => item.id),
  visual_improvement_eligible_cases: comparisons.filter(item => item.original.status === 'generated').length,
  before: tally(comparisons.map(item => item.before_rating)), after: tally(comparisons.map(item => item.after_rating)),
  call_attempts: {before:callTotals(before),after_including_inherited:callTotals(after),after_current_revision:currentRevisionCalls,
    note:'Recorded provider-call attempts, including reviews that timed out or returned no receipt. Counts are not a billing statement. Derived review-only runs inherit earlier analysis/image-generation attempts and add only comparison reviews.'},
  changes: tally(comparisons.map(item => item.change)),
  qualitative_regressions: comparisons.filter(item => item.qualitative_regression).map(item => item.id),
  scope: 'Same saved original references and manual crops, category, mode and target selection. After outputs use automatic surface analysis and shared extraction improvements. Derived review-only revisions reuse saved analysis/image generations and preserve the previous actual outputs. This is not an end-to-end browser/upscale/vectorization test.',
  limitations: ['Pass is an overall visual assessment, not certification of exact fine lettering or physical print dimensions.', 'A source-pixel-preserving result avoids generated lettering but can retain photographed lighting or occlusion.', 'Grade changes are manual visual assessments; a completed provider call is not automatically a pass.', 'Provider errors have no image to compare and are tracked separately from visual extraction failure.'],
  cases: comparisons.map(({ original, result, ...item }) => ({ ...item, before_record: relative(path.join(beforeRoot,item.id,'record.json')), after_record: relative(path.join(afterRoot,item.id,'record.json')), before_notes: original.review?.notes || '', after_notes: result.review?.notes || '' })) };
await fs.mkdir(root, { recursive: true });
const jsonPath = path.join(root, path.basename(output, path.extname(output)) + '.json');
await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2));
const errorText = record => record.provider_error_summary || (record.status === 'error' ? 'Provider error. See exact case record.' : 'Output not available yet.');
const imageFigure = async (directory, record, title) => {
  const file = path.join(directory,record.id,'output.png');
  const raw = path.join(directory,record.id,'raw-output.png');
  const candidate = path.join(directory,record.id,record.source_candidate?.file || 'source-candidate.png');
  const inherited = record.inherited_output ? path.join(directory,record.id,record.inherited_output.file) : null;
  const planeInput = record.output_plane?.input_file ? path.join(directory,record.id,record.output_plane.input_file) : null;
  const planeCandidate = record.output_plane?.candidate_file ? path.join(directory,record.id,record.output_plane.candidate_file) : null;
  return `<figure><figcaption>${esc(title)} <span class="badge">${esc(ratingLabel(rating(record)))}</span></figcaption>${await exists(file) ? `<a href="${relative(file)}"><img loading="lazy" src="${relative(file)}" alt="${esc(title)} output, case ${record.id}"></a>` : `<div class="empty">${esc(errorText(record))}</div>`}<p>${esc(label(record.extraction_method || 'image_edit'))} · ${dims(record.output_dimensions)}</p><a href="${relative(path.join(directory,record.id,'record.json'))}">Exact record</a>${await exists(raw) ? ` · <a href="${relative(raw)}">Raw provider output</a>` : ''}${record.source_candidate && await exists(candidate) ? `<p><a href="${relative(candidate)}">Source candidate</a> · verification ${esc(record.source_verification?.status || 'not recorded')}</p>` : ''}${inherited && await exists(inherited) ? `<p><a href="${relative(inherited)}">Preserved ${esc(record.inherited_output.source_run || 'earlier')} output</a> · no additional image generation</p>` : ''}${planeInput && planeCandidate && await exists(planeInput) && await exists(planeCandidate) ? `<p>Geometry correction: <a href="${relative(planeInput)}">saved generated input</a> · <a href="${relative(planeCandidate)}">straightened proposal</a> · ${esc(planeLabel(record.output_plane.status))}</p>` : ''}</figure>`;
};
const cases = [];
for (const item of comparisons) {
  const {original, result} = item;
  cases.push(`<article id="case-${item.id}" data-change="${item.change}" data-category="${esc(item.category)}" data-qualitative-regression="${item.qualitative_regression}"><h2>${item.id} · ${esc(label(item.category))} <span class="badge">${esc(label(item.change))}</span>${item.qualitative_regression ? ' <span class="badge regression">Content regression</span>' : ''}</h2><p class="filename">${esc(item.source_name)}</p><p>${esc(original.target)}</p><div class="views"><figure><figcaption>Original + crop rectangle</figcaption><a href="${relative(path.join(beforeRoot,item.id,'crop-map.png'))}"><img loading="lazy" src="${relative(path.join(beforeRoot,item.id,'crop-map.png'))}" alt="Original and crop rectangle for case ${item.id}"></a><p>x=${original.crop.left}, y=${original.crop.top}, w=${original.crop.width}, h=${original.crop.height}</p><a href="${relative(path.join(beforeRoot,item.id,'original'+path.extname(original.source_name)))}">Untouched original</a></figure><figure><figcaption>Exact reference crop · unchanged</figcaption><a href="${relative(path.join(beforeRoot,item.id,'crop.png'))}"><img loading="lazy" src="${relative(path.join(beforeRoot,item.id,'crop.png'))}" alt="Same reference crop for case ${item.id}"></a><p>${esc(original.crop.reason)}</p></figure>${await imageFigure(beforeRoot,original,'Before')}${await imageFigure(afterRoot,result,'After')}</div><div class="notes"><div><strong>Before review</strong><p>${esc(original.review?.notes || 'Not reviewed')}</p></div><div><strong>After review</strong><p>${esc(result.review?.notes || 'Not reviewed')}</p>${result.preservation?.reason ? `<p>Preservation decision: ${esc(result.preservation.reason)}</p>` : ''}</div></div><details><summary>Method, dimensions and provider calls</summary><p>Before: ${esc(label(item.before_method))}; image calls ${original.generation_calls || 0}; request ${esc(original.request_id || 'none')}.</p><p>After: ${esc(label(item.after_method))}; analysis calls ${result.analysis_calls || 0}; image calls ${result.generation_calls || 0}; validation calls ${result.validation_calls || 0}; request ${esc(result.request_id || 'none')}.${result.derived_from ? ` This revision adds ${result.image_generation_calls_this_revision || 0} image generations; the provider image/request above is inherited from ${esc(result.derived_from.run)}.` : ''}</p><p>Before raw → final: ${dims(original.raw_output_dimensions)} → ${dims(original.output_dimensions)}. After raw → final: ${dims(result.raw_output_dimensions)} → ${dims(result.output_dimensions)}.</p><p>Crop coordinates are in EXIF-upright original pixels. Rectification estimates the visible plane geometry; it does not measure a physical print size.</p>${result.analysis ? `<pre>${esc(JSON.stringify({analysis:result.analysis,source_verification:result.source_verification,output_plane:result.output_plane,automated_review:result.automated_review},null,2))}</pre>` : ''}</details></article>`);
}
await fs.writeFile(output, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Universal extraction · before and after</title><style>
*{box-sizing:border-box}body{margin:0;background:#111611;color:#eef1ea;font:15px/1.5 system-ui}header,main{max-width:1680px;margin:auto;padding:28px}h1{margin:0;font-size:30px}h2{font-size:21px;margin:0}p{color:#bbc5b7}a{color:#c9ed8f}article{margin:0 0 28px;padding:22px;border:1px solid #394239;border-radius:14px;background:#1c241c}.views{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}figure{margin:0;background:#0c100c;border-radius:8px;padding:12px}figcaption{font-weight:650;min-height:45px}img,.empty{width:100%;height:500px;object-fit:contain}.empty{display:grid;place-content:center;color:#ffb4b4;padding:20px}figure p{font-size:13px}.badge{font-size:12px;background:#2e3e29;border-radius:5px;padding:4px 8px;display:inline-block;margin-left:8px}.regression{background:#6a2e29;color:#ffe3df}.regression-note{border-left:4px solid #df8075;padding:12px 16px;background:#34201d;color:#ffe3df}.filename{font-size:12px;overflow-wrap:anywhere}.notes{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}.notes>div{border-left:3px solid #769660;padding-left:14px}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.stats>div{background:#1c241c;border:1px solid #394239;padding:12px 18px;border-radius:8px}.stats strong{display:block}.filters{display:flex;gap:14px;flex-wrap:wrap;margin:20px 0}select{font:inherit;padding:9px 12px;color:#eef1ea;background:#1c241c;border:1px solid #56664f;border-radius:6px}label{display:grid;gap:5px}details{margin-top:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}article[hidden]{display:none}@media(max-width:1100px){.views{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){header,main{padding:16px}.views,.notes{grid-template-columns:1fr}img,.empty{height:420px}}</style><header><h1>Universal extraction · before and after</h1><p>${comparisons.length} same references · same crop coordinates, category and Keep All Artwork mode. Click any image to inspect its saved full resolution.</p><div class="stats"><div><strong>Before</strong>${Object.entries(summary.before).map(([k,v])=>`${v} ${esc(ratingLabel(k))}`).join(' · ')}</div><div><strong>After</strong>${Object.entries(summary.after).map(([k,v])=>`${v} ${esc(ratingLabel(k))}`).join(' · ')}</div><div><strong>Comparison</strong>${Object.entries(summary.changes).map(([k,v])=>`${v} ${esc(ratingLabel(k))}`).join(' · ')}</div></div>${after.some(record=>record.derived_from) ? `<p><strong>This revision:</strong> ${currentRevisionCalls.image_generation} new image generations · ${currentRevisionCalls.visual_lettering_review} visual/lettering review attempts. Existing analysis and image requests are inherited; prior actual outputs remain linked.</p>` : ''}<details><summary>Recorded call attempts</summary><pre>${esc(JSON.stringify(summary.call_attempts,null,2))}</pre></details>${summary.qualitative_regressions.length ? `<p class="regression-note"><strong>Content regression:</strong> ${summary.qualitative_regressions.map(id=>`<a href="#case-${id}">case ${id}</a>`).join(', ')} has worse content fidelity despite an unchanged coarse grade. The grade-count summary does not capture this; read the after-review notes before using the output.</p>` : ''}<p>${esc(summary.scope)}</p>${summary.baseline_no_output_cases.length ? `<p>Cases ${summary.baseline_no_output_cases.join(', ')} had no baseline output. Any new output for these cases is counted separately; it is not included in visual improvement totals.</p>` : ''}<p>Preserved pixels and generated edits are labelled separately. Tiny lettering, hidden artwork and true physical size are not certified. A source-preserving result can retain lighting or occlusion visible in the photo.</p><a href="${relative(jsonPath)}">Comparison records</a> · <a href="${relative(path.join(beforeRoot,'index.html'))}">Before run</a> · <a href="${relative(path.join(afterRoot,'index.html'))}">After run</a>${previousAttemptIndexes.map(file=>` · <a href="${relative(file)}">${esc(path.basename(path.dirname(file)))} (audit)</a>`).join('')}<div class="filters"><label>Show result<select id="change"><option value="all">All cases</option><option value="qualitative_regression">Content regression</option>${['improved','same_grade','regressed','new_output','pending_review'].map(x=>`<option value="${x}">${esc(label(x))}</option>`).join('')}</select></label><label>Reference category<select id="category"><option value="all">All categories</option>${[...new Set(comparisons.map(x=>x.category))].map(x=>`<option value="${esc(x)}">${esc(label(x))}</option>`).join('')}</select></label></div><p id="shown"></p></header><main>${cases.join('')}</main><script>const filter=()=>{const change=document.getElementById('change').value,category=document.getElementById('category').value;let visible=0;document.querySelectorAll('article').forEach(item=>{item.hidden=!(change==='all'||(change==='qualitative_regression'?item.dataset.qualitativeRegression==='true':item.dataset.change===change))||!(category==='all'||item.dataset.category===category);if(!item.hidden)visible++});document.getElementById('shown').textContent=visible+' of '+document.querySelectorAll('article').length+' cases shown';};document.querySelectorAll('select').forEach(item=>item.addEventListener('change',filter));filter();</script></html>`);
console.log(JSON.stringify({report:output,records:jsonPath,counts:summary.changes}));
