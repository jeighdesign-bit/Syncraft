import { logoVariationSource } from './logoVariations.mjs';

export function logoReviewContext(selected, jobs) {
  const context = logoVariationSource(selected, jobs);
  const byId = new Map(jobs.map(job => [job.id, job]));
  const seen = new Set();
  for (let job = selected; job && !seen.has(job.id); job = byId.get(job.sourceId)) {
    seen.add(job.id);
    if (job.operation === 'generate') return { ...context, generationOptions: job.generationOptions || {}, effectiveSeed: job.effectiveSeed, hasStyleReference: Boolean(job.hasStyleReference),
      ...(job.promptEnhancement && job.prompt === context.prompt ? { promptEnhancement: job.promptEnhancement } : {}) };
  }
  return { ...context, generationOptions: {}, hasStyleReference: false };
}

// Prefer actual batch siblings; never label arbitrary history as one batch.
export function logoReviewOptions(selected, jobs) {
  const sameMode = jobs.filter(job => job.status === 'succeeded' && job.url
    && ['generate', 'variations'].includes(job.operation)
    && (job.mode || 'text') === (selected.mode || 'text'));
  const siblings = selected.batchId ? sameMode.filter(job => job.batchId === selected.batchId) : [];
  return { isBatch: siblings.length > 1,
    jobs: [selected, ...(siblings.length > 1 ? siblings : [...sameMode].reverse()).filter(job => job.id !== selected.id)].slice(0, 4) };
}
