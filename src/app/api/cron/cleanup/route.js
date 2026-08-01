import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deleteFromR2, s3Client, bucketName } from '@/lib/cloudflare';
import { reconcilePendingDodoPayments } from '@/lib/dodoPaymentService';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

// Ensure this route doesn't run at the Edge since it uses AWS SDK heavily
export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── Constants ───────────────────────────────────────────────────────────────
const PROJECT_BATCH_SIZE = 50;
const MOBILE_SCAN_LIMIT  = 1000;
const MOBILE_DELETE_LIMIT = 100;
const ZIP_BATCH_SIZE     = 50;

// Reserve ~8 s for overhead/network so we don't exceed maxDuration
const DEADLINE_MS = (maxDuration - 8) * 1000;

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Delete all R2 files associated with a project row, then remove the DB record. */
async function deleteProject(project) {
  const urls = [
    project.original_image_url,
    project.generated_image_url,
    project.upscaled_image_url,
    project.svg_url,
    project.zip_url,
  ];

  for (const url of urls) {
    if (url && url !== 'REFUNDED') {
      await deleteFromR2(url, {
        allowedPrefixes: ['users/', `projects/${project.id}/`, 'bg-removed-'],
      });
    }
  }

  await adminSupabase.from('projects').delete().eq('id', project.id);
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const deadline = () => Date.now() - start >= DEADLINE_MS;

  const results = {
    dodoPaymentsScanned: 0,
    dodoPaymentsCredited: 0,
    dodoPaymentsFailed: 0,
    dodoPaymentsCancelled: 0,
    dodoPaymentsStillPending: 0,
    dodoPaymentErrors: 0,
    projectsDeleted: 0,
    projectsFailed:  0,
    mobileSyncDeleted: 0,
    zipCacheDeleted:   0,
    timedOut: false,
  };

  try {
    // Reconcile missed webhooks and abandoned/failed checkout sessions first.
    if (!deadline()) {
      try {
        const dodoResults = await reconcilePendingDodoPayments({ deadline });
        results.dodoPaymentsScanned = dodoResults.scanned;
        results.dodoPaymentsCredited = dodoResults.credited;
        results.dodoPaymentsFailed = dodoResults.failed;
        results.dodoPaymentsCancelled = dodoResults.cancelled;
        results.dodoPaymentsStillPending = dodoResults.stillPending;
        results.dodoPaymentErrors = dodoResults.errors;
      } catch (error) {
        results.dodoPaymentErrors++;
        console.warn('[Cron] Dodo payment reconciliation failed (non-fatal):', error.message);
      }
    }

    // ─── 1. Delete projects older than 3 days (loop until done or deadline) ──
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    let hasMoreProjects = true;

    while (hasMoreProjects && !deadline()) {
      const { data: batch, error: fetchErr } = await adminSupabase
        .from('projects')
        .select('id, original_image_url, generated_image_url, upscaled_image_url, svg_url, zip_url')
        .lt('created_at', threeDaysAgo.toISOString())
        .order('created_at', { ascending: true })
        .limit(PROJECT_BATCH_SIZE);

      if (fetchErr) throw fetchErr;
      if (!batch || batch.length === 0) { hasMoreProjects = false; break; }

      console.log(`[Cron] Processing batch of ${batch.length} expired project(s)…`);

      for (const project of batch) {
        if (deadline()) { results.timedOut = true; break; }

        try {
          await deleteProject(project);
          results.projectsDeleted++;
          console.log(`[Cron] ✅ Deleted project ${project.id}`);
        } catch (err) {
          results.projectsFailed++;
          console.error(`[Cron] ❌ Failed to delete project ${project.id}:`, err);
        }
      }

      // If the batch was smaller than the page size, we've reached the end.
      if (batch.length < PROJECT_BATCH_SIZE) hasMoreProjects = false;
    }

    if (deadline() && hasMoreProjects) {
      results.timedOut = true;
      console.warn('[Cron] Deadline reached — remaining projects will be cleaned up on the next run.');
    }

    // ─── 2. Delete orphaned mobile_sync uploads (older than 24 hours) ────────
    if (!deadline()) {
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const listCmd = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: 'users/',
          MaxKeys: MOBILE_SCAN_LIMIT,
        });
        const listResult = await s3Client.send(listCmd);

        for (const obj of listResult.Contents ?? []) {
          if (results.mobileSyncDeleted >= MOBILE_DELETE_LIMIT || deadline()) break;

          if (obj.Key?.includes('/mobile_sync/') && obj.LastModified?.toISOString() < oneDayAgo) {
            await deleteFromR2(`${process.env.CLOUDFLARE_PUBLIC_URL}/${obj.Key}`, {
              allowedPrefixes: ['users/'],
            });
            results.mobileSyncDeleted++;
            console.log(`[Cron] 🗑️  Purged orphaned mobile_sync file: ${obj.Key}`);
          }
        }
      } catch (err) {
        // Non-fatal: log but continue
        console.warn('[Cron] Mobile sync cleanup failed (non-fatal):', err.message);
      }
    }

    // ─── 3. Delete cached ZIP files older than 24 hours ──────────────────────
    if (!deadline()) {
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: zipBatch, error: zipFetchErr } = await adminSupabase
          .from('projects')
          .select('id, zip_url')
          .not('zip_url', 'is', null)
          .lt('zip_generated_at', oneDayAgo)
          .order('zip_generated_at', { ascending: true })
          .limit(ZIP_BATCH_SIZE);

        if (zipFetchErr) throw zipFetchErr;

        for (const project of zipBatch ?? []) {
          if (deadline()) break;

          await deleteFromR2(project.zip_url, { allowedPrefixes: [`projects/${project.id}/`] });
          await adminSupabase
            .from('projects')
            .update({ zip_url: null, zip_signature: null, zip_generated_at: null })
            .eq('id', project.id);

          results.zipCacheDeleted++;
        }
      } catch (err) {
        console.warn('[Cron] ZIP cache cleanup failed (non-fatal):', err.message);
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[Cron] Done in ${elapsed}s — projects deleted: ${results.projectsDeleted}, ` +
      `failed: ${results.projectsFailed}, mobile purged: ${results.mobileSyncDeleted}, ` +
      `ZIP cache purged: ${results.zipCacheDeleted}, Dodo scanned: ${results.dodoPaymentsScanned}, ` +
      `Dodo credited: ${results.dodoPaymentsCredited}, Dodo failed: ${results.dodoPaymentsFailed}, ` +
      `Dodo cancelled: ${results.dodoPaymentsCancelled}` +
      (results.timedOut ? ' (timed out — more work pending)' : '')
    );

    return NextResponse.json({ success: true, elapsedSeconds: parseFloat(elapsed), ...results });

  } catch (error) {
    console.error('[Cron Error]:', error);
    return NextResponse.json({ error: 'Cleanup failed', ...results }, { status: 500 });
  }
}
