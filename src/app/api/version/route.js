import { ARTWORK_GENERATION_MODEL } from '@/lib/falArtworkGeneration.mjs';
import { ARTWORK_EDIT_MODEL } from '@/lib/artworkEditPolicy.mjs';
import { RECOVERY_IMAGE_ENDPOINT } from '@/lib/recoveryVision.mjs';
import { UNIVERSAL_AVAILABLE } from '@/lib/universalAvailability.mjs';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    release: 'nano-banana-2.1',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SYNCRAFT_RELEASE_COMMIT || null,
    models: {
      extraction: ARTWORK_GENERATION_MODEL,
      universal: RECOVERY_IMAGE_ENDPOINT,
      aiEdit: ARTWORK_EDIT_MODEL,
    },
    universalAvailable: UNIVERSAL_AVAILABLE,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
