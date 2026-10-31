import { recoverSourcePixels } from './recoveryPlanar.mjs';
import { checkRecoveryCandidate } from './recoveryCandidate.mjs';

// Surface analysis proposes geometry; a second image comparison must verify
// that this proposal did not crop out lettering, preserve a mockup, or lose art.
// Rejection never blocks extraction: callers continue to their single edit.
export async function verifySourceRecovery({ sourceBuffer, analysis, mode, check = checkRecoveryCandidate, onUsage = async () => {} }) {
  let candidate;
  try {
    candidate = await recoverSourcePixels(sourceBuffer, analysis, mode);
  } catch {
    return { recovery: null, candidate: null, validation: null, calls: 0, status: 'geometry_error' };
  }
  if (!candidate) return { recovery: null, candidate: null, validation: null, calls: 0, status: 'not_eligible' };

  const expectedBytes = Buffer.from(candidate.buffer);
  let checked;
  try {
    // Give review its own copy so a reviewer cannot mutate the saved proposal.
    checked = await check({ sourceBuffer, outputBuffer: Buffer.from(expectedBytes), analysis, mode, method: candidate.method, allowCrop: false, onUsage });
  } catch {
    return { recovery: null, candidate, validation: null, calls: 1, status: 'unavailable' };
  }
  const calls = Number.isInteger(checked?.calls) && checked.calls > 0 ? checked.calls : 1;
  const validation = checked?.validation && typeof checked.validation === 'object' && !Array.isArray(checked.validation)
    ? checked.validation : null;
  const unchanged = checked?.cropped !== true && validation?.crop_attempted !== true
    && Buffer.isBuffer(checked?.buffer) && checked.buffer.equals(expectedBytes) && candidate.buffer.equals(expectedBytes);
  const positiveReview = validation?.pass === true && validation.visual_validation === true
    && validation.checks?.geometry === 'pass' && validation.checks?.content === 'pass'
    && ['pass', 'unverifiable'].includes(validation.checks?.lettering)
    && Array.isArray(validation.failures) && validation.failures.length === 0;
  if (!unchanged || !positiveReview) {
    return { recovery: null, candidate, validation: validation ? {
      ...validation,
      source_candidate_accepted: false,
      source_candidate_rejection_reason: unchanged ? 'review_did_not_verify_candidate' : 'review_changed_candidate',
    } : null, calls, status: 'rejected' };
  }
  return { recovery: candidate, candidate, validation: { ...validation, source_candidate_accepted: true }, calls, status: 'accepted' };
}
