import { ARTWORK_EDIT_COST } from "./artworkEditPolicy.mjs";

/**
 * Consumer (B2C) credit costs per operation.
 *
 * Historically `12` was a bare literal at every call site — server routes, modal
 * copy, and the optimistic client-side decrement — which is how the Remove BG
 * display came to decrement by 1 while the server charged 12. New code should
 * import from here.
 *
 * B2B pricing is separate and lives inline in api/v1/generate/route.js.
 */
export const CREDIT_COST = {
  trace: 12,      // default 1K extraction; shared tiers: 2K=16, 4K=24
  universal: 12,  // same extraction tiers; availability remains independently gated
  removeBg: 2,
  upscale: 12,
  extend: 6,      // one nano-banana-2.1/edit call + a free re-run of stages 2 and 3
  artworkEdit: ARTWORK_EDIT_COST, // preview edit; applying/restoring saved artwork is free
  logoGenerate: 8, // Per Text-to-Logo output; the server selects the style's model
  logoImageGenerate: 8,
  logoSketchGenerate: 8,
  logoVariations: 6, // Per variation output, across all Logo Studio styles and modes
  logoEdit: 8,
  logoRemoveBg: 2,
  logoVectorize: 2,
};
