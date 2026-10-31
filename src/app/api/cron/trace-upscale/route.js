import { reconcileTraceUpscales } from '@/lib/traceUpscaleJobs';

export const runtime = 'nodejs';
export const maxDuration = 240;

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return Response.json({ checked: await reconcileTraceUpscales(Date.now() + 210_000) });
  } catch (error) {
    console.error('[Trace Upscale reconciliation]', error.message);
    return Response.json({ error: 'Could not reconcile upscale jobs' }, { status: 500 });
  }
}
