// Shared by the UI and server so Universal cannot be enabled only on one side.
// Keep disabled until the extraction-quality work is ready for users again.
export const UNIVERSAL_AVAILABLE = false;
export const UNIVERSAL_UNAVAILABLE_CODE = 'UNIVERSAL_UNAVAILABLE';
export const UNIVERSAL_UNAVAILABLE_MESSAGE = 'Temporarily unavailable while we improve extraction.';

export function isUniversalTraceType(value) {
  return typeof value === 'string' && value.toLowerCase().startsWith('universal');
}

// Only Universal-specific routes may omit the type. Generic routes must pass
// the requested type or the authenticated project's actual persisted type.
export function universalUnavailableResponse(...types) {
  // An omitted argument denotes a Universal-only route. Explicit undefined
  // from a generic/default tool request must not disable that other tool.
  const traceType = types.length ? types[0] : 'universal';
  if (UNIVERSAL_AVAILABLE || !isUniversalTraceType(traceType)) return null;
  return Response.json({ success: false, code: UNIVERSAL_UNAVAILABLE_CODE,
    error: UNIVERSAL_UNAVAILABLE_MESSAGE, message: UNIVERSAL_UNAVAILABLE_MESSAGE,
    temporarilyUnavailable: true }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
