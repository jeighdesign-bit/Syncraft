// Review is advisory. A valid provider image remains available to the user even
// when the reviewer is unavailable, uncertain, or flags a quality concern.
export async function reviewRecoveryOutput(buffer, review) {
  const unchecked = { pass: false, usable_partial: true, advisory_only: true, failures: [],
    correction: 'Best-effort extraction is ready. Compare it with your reference before use.' };
  if (!review) return { buffer, cropped: false, calls: 0, validation: { ...unchecked, review_status: 'not_run' } };
  try {
    const result = await review();
    if (result.validation?.pass === true) return result;
    return { buffer, cropped: false, calls: result.calls,
      validation: { ...result.validation, pass: false, usable_partial: true, advisory_only: true, review_status: 'needs_review',
        correction: result.validation?.correction || unchecked.correction } };
  } catch {
    return { buffer, cropped: false, calls: 1,
      validation: { ...unchecked, review_status: 'unavailable', correction: 'Extraction is ready. The automatic review was unavailable; please compare the result with your reference.' } };
  }
}
