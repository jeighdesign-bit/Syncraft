import { ARTWORK_GENERATION_MODEL } from '@/lib/falArtworkGeneration.mjs';
import { ARTWORK_EDIT_MODEL } from '@/lib/artworkEditPolicy.mjs';
import { RECOVERY_IMAGE_ENDPOINT } from '@/lib/recoveryVision.mjs';
import { UNIVERSAL_AVAILABLE } from '@/lib/universalAvailability.mjs';
import { LOGO_STYLES, LOGO_BATCH_LIMIT, logoOperationCost } from '@/lib/logoStudio.mjs';
import { logoUsesNano } from '@/lib/logoModelRouting.mjs';
import { EXTRACTION_RESOLUTIONS } from '@/lib/extractionResolution.mjs';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    release: 'extraction-tiers-credits-community-legal-2026-11-14',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SYNCRAFT_RELEASE_COMMIT || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    models: {
      extraction: ARTWORK_GENERATION_MODEL,
      universal: RECOVERY_IMAGE_ENDPOINT,
      aiEdit: ARTWORK_EDIT_MODEL,
    },
    universalAvailable: UNIVERSAL_AVAILABLE,
    extraction: {
      tiers: EXTRACTION_RESOLUTIONS,
      native4KSkipsUpscale: true,
    },
    logoStudio: {
      textModels: Object.fromEntries(LOGO_STYLES.map(({ id: style }) => [style,
        logoUsesNano({ operation: 'generate', mode: 'text', style }) ? 'nano-banana-2.1' : 'recraftv4_1'])),
      referenceModel: 'google/nano-banana-2.1/edit',
      batchLimit: LOGO_BATCH_LIMIT,
      credits: Object.fromEntries(['generate', 'variations', 'edit', 'removeBg', 'vectorize']
        .map(operation => [operation, logoOperationCost(operation, 'text')])),
    },
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
