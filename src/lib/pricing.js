/**
 * Consumer (B2C) credit costs per operation.
 *
 * Historically `12` was a bare literal at every call site — server routes, modal
 * copy, and the optimistic client-side decrement — which is how the Remove BG
 * display came to decrement by 1 while the server charged 12. New code should
 * import from here.
 *
 * NOTE: the server-side deduct/refund literals in api/trace, api/remove-bg and
 * api/upscale have not been migrated yet, and `safeRefundCredit` in lib/supabase
 * hardcodes +12. Keep these values at 12 until those are swept together.
 *
 * B2B pricing is separate and lives inline in api/v1/generate/route.js.
 */
export const CREDIT_COST = {
  trace: 12,      // full 3-stage pipeline, charged once at step 1
  removeBg: 12,
  upscale: 12,
  extend: 12,     // one nano-banana-pro/edit call + a free re-run of stages 2 and 3
};
