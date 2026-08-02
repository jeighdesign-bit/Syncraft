import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import {
  auditExpiredR2Objects,
  deleteR2Objects,
  getStorageRetentionConfig,
  parseSupabaseProjectAssetUrl,
  toPublicAuditSummary,
} from "@/lib/storageCleanup";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROJECT_PAGE_SIZE = 500;
const DATABASE_DELETE_BATCH_SIZE = 100;
const SUPABASE_DELETE_BATCH_SIZE = 100;
const PROJECT_URL_FIELDS = [
  "original_image_url",
  "generated_image_url",
  "upscaled_image_url",
  "svg_url",
  "zip_url",
];
const DEADLINE_MS = (maxDuration - 8) * 1000;

function isAuthorized(request) {
  const authHeader = request.headers.get("authorization");
  return Boolean(
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`
  );
}

async function auditExpiredProjects(cutoffIso, deadline) {
  const rows = [];
  let from = 0;
  let complete = true;

  while (!deadline()) {
    const { data, error } = await adminSupabase
      .from("projects")
      .select(`id, created_at, ${PROJECT_URL_FIELDS.join(", ")}`)
      .lt("created_at", cutoffIso)
      .order("created_at", { ascending: true })
      .range(from, from + PROJECT_PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));

    if (!data || data.length < PROJECT_PAGE_SIZE) break;
    from += PROJECT_PAGE_SIZE;
  }

  if (deadline()) complete = false;

  const r2Urls = new Set();
  const supabasePaths = new Set();
  let externalUrls = 0;

  for (const project of rows) {
    for (const field of PROJECT_URL_FIELDS) {
      const fileUrl = project[field];
      if (!fileUrl || fileUrl === "REFUNDED") continue;

      const supabasePath = parseSupabaseProjectAssetUrl(fileUrl);
      if (supabasePath) {
        supabasePaths.add(supabasePath);
      } else if (fileUrl.includes(".r2.dev/") || fileUrl.includes(".r2.cloudflarestorage.com/")) {
        r2Urls.add(fileUrl);
      } else {
        externalUrls++;
      }
    }
  }

  return {
    complete,
    rows,
    summary: {
      expiredProjects: rows.length,
      referencedR2Objects: r2Urls.size,
      referencedSupabaseObjects: supabasePaths.size,
      externalUrls,
    },
    supabasePaths: [...supabasePaths],
  };
}

async function auditExpiredZipCache(cutoffIso, deadline) {
  const rows = [];
  let from = 0;
  let complete = true;

  while (!deadline()) {
    const { data, error } = await adminSupabase
      .from("projects")
      .select("id, zip_url, zip_generated_at")
      .not("zip_url", "is", null)
      .lt("zip_generated_at", cutoffIso)
      .order("zip_generated_at", { ascending: true })
      .range(from, from + PROJECT_PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));

    if (!data || data.length < PROJECT_PAGE_SIZE) break;
    from += PROJECT_PAGE_SIZE;
  }

  if (deadline()) complete = false;

  return {
    complete,
    rows,
    supabasePaths: rows
      .map(({ zip_url: zipUrl }) => parseSupabaseProjectAssetUrl(zipUrl))
      .filter(Boolean),
  };
}

async function deleteSupabaseAssets(paths, deadline) {
  const result = { requested: paths.length, deleted: 0, errors: 0, timedOut: false };

  for (let index = 0; index < paths.length; index += SUPABASE_DELETE_BATCH_SIZE) {
    if (deadline()) {
      result.timedOut = true;
      break;
    }

    const batch = paths.slice(index, index + SUPABASE_DELETE_BATCH_SIZE);
    const { data, error } = await adminSupabase.storage
      .from("project-assets")
      .remove(batch);

    if (error) {
      result.errors += batch.length;
      continue;
    }

    result.deleted += data?.length || batch.length;
  }

  return result;
}

async function deleteProjectRows(rows, deadline) {
  const result = { requested: rows.length, deleted: 0, errors: 0, timedOut: false };

  for (let index = 0; index < rows.length; index += DATABASE_DELETE_BATCH_SIZE) {
    if (deadline()) {
      result.timedOut = true;
      break;
    }

    const ids = rows.slice(index, index + DATABASE_DELETE_BATCH_SIZE).map(({ id }) => id);
    const { data, error } = await adminSupabase
      .from("projects")
      .delete()
      .in("id", ids)
      .select("id");

    if (error) {
      result.errors += ids.length;
      continue;
    }

    result.deleted += data?.length || 0;
  }

  return result;
}

async function clearExpiredZipRows(rows, deadline) {
  const result = { requested: rows.length, cleared: 0, errors: 0, timedOut: false };

  for (let index = 0; index < rows.length; index += DATABASE_DELETE_BATCH_SIZE) {
    if (deadline()) {
      result.timedOut = true;
      break;
    }

    const ids = rows.slice(index, index + DATABASE_DELETE_BATCH_SIZE).map(({ id }) => id);
    const { data, error } = await adminSupabase
      .from("projects")
      .update({ zip_url: null, zip_signature: null, zip_generated_at: null })
      .in("id", ids)
      .select("id");

    if (error) {
      result.errors += ids.length;
      continue;
    }

    result.cleared += data?.length || 0;
  }

  return result;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!adminSupabase) {
    return NextResponse.json({ error: "Missing Supabase service configuration" }, { status: 500 });
  }

  const start = Date.now();
  const deadline = () => Date.now() - start >= DEADLINE_MS;
  const requestUrl = new URL(request.url);
  const deleteEnabled = process.env.STORAGE_CLEANUP_DELETE_ENABLED === "true";
  const dryRun = requestUrl.searchParams.get("dryRun") === "1" || !deleteEnabled;
  const retention = getStorageRetentionConfig();
  const cutoffIso = new Date(Date.now() - retention.projectDays * 24 * 60 * 60 * 1000).toISOString();
  const temporaryCutoffIso = new Date(Date.now() - retention.temporaryDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [r2Audit, projectAudit, zipAudit] = await Promise.all([
      auditExpiredR2Objects({ deadline, config: retention }),
      auditExpiredProjects(cutoffIso, deadline),
      auditExpiredZipCache(temporaryCutoffIso, deadline),
    ]);

    const audit = {
      retentionDays: retention.projectDays,
      temporaryRetentionDays: retention.temporaryDays,
      cutoff: cutoffIso,
      r2: toPublicAuditSummary(r2Audit),
      database: {
        complete: projectAudit.complete,
        ...projectAudit.summary,
        expiredZipCaches: zipAudit.rows.length,
        zipCacheScanComplete: zipAudit.complete,
      },
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        mode: "dry-run",
        deletionEnabled: deleteEnabled,
        elapsedSeconds: Number(((Date.now() - start) / 1000).toFixed(1)),
        audit,
      });
    }

    const supabasePaths = [...new Set([
      ...projectAudit.supabasePaths,
      ...zipAudit.supabasePaths,
    ])];
    const r2Deletion = await deleteR2Objects(r2Audit.expiredObjects, { deadline });
    const supabaseDeletion = await deleteSupabaseAssets(supabasePaths, deadline);

    const storageComplete =
      r2Audit.complete &&
      projectAudit.complete &&
      zipAudit.complete &&
      !r2Deletion.timedOut &&
      !supabaseDeletion.timedOut &&
      r2Deletion.errors === 0 &&
      supabaseDeletion.errors === 0;

    // Keep database rows until every storage scan and delete has completed.
    // That preserves retry information when R2 or Supabase has a transient error.
    const zipCacheClearing = storageComplete
      ? await clearExpiredZipRows(zipAudit.rows, deadline)
      : { requested: zipAudit.rows.length, cleared: 0, errors: 0, timedOut: deadline(), skipped: true };
    const databaseDeletion = storageComplete && zipCacheClearing.errors === 0 && !zipCacheClearing.timedOut
      ? await deleteProjectRows(projectAudit.rows, deadline)
      : { requested: projectAudit.rows.length, deleted: 0, errors: 0, timedOut: deadline(), skipped: true };

    return NextResponse.json({
      success:
        storageComplete &&
        zipCacheClearing.errors === 0 &&
        !zipCacheClearing.timedOut &&
        databaseDeletion.errors === 0 &&
        !databaseDeletion.timedOut,
      mode: "apply",
      elapsedSeconds: Number(((Date.now() - start) / 1000).toFixed(1)),
      audit,
      deleted: {
        r2: r2Deletion,
        supabase: supabaseDeletion,
        zipCache: zipCacheClearing,
        database: databaseDeletion,
      },
    });
  } catch (error) {
    console.error("[Storage cleanup] Failed:", error);
    return NextResponse.json({
      error: "Storage cleanup failed",
      mode: dryRun ? "dry-run" : "apply",
      elapsedSeconds: Number(((Date.now() - start) / 1000).toFixed(1)),
    }, { status: 500 });
  }
}
