import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { bucketName, s3Client } from "@/lib/cloudflare";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 3;
const DEFAULT_SCAN_LIMIT = 25_000;
const LIST_PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 1000;

export const EXPIRING_R2_PREFIXES = ["projects/", "users/", "bg-removed-"];

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getStorageRetentionConfig() {
  return {
    projectDays: positiveInteger(
      process.env.R2_PROJECT_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS,
    ),
    temporaryDays: positiveInteger(process.env.R2_TEMP_RETENTION_DAYS, 1),
    scanLimit: positiveInteger(process.env.R2_CLEANUP_SCAN_LIMIT, DEFAULT_SCAN_LIMIT),
  };
}

export function retentionDaysForKey(key, config = getStorageRetentionConfig()) {
  if (key.includes("/mobile_sync/") || /\/zip_[^/]+\.zip$/i.test(key)) {
    return config.temporaryDays;
  }
  return config.projectDays;
}

export function isProtectedR2Key(key) {
  if (key.startsWith("permanent/")) return true;

  const additionalPrefixes = (process.env.R2_CLEANUP_PROTECTED_PREFIXES || "")
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);

  return additionalPrefixes.some((prefix) => key.startsWith(prefix));
}

function createSummary() {
  return {
    count: 0,
    bytes: 0,
    oldestLastModified: null,
    newestLastModified: null,
    byPrefix: {},
    byPolicy: { project: { count: 0, bytes: 0 }, temporary: { count: 0, bytes: 0 } },
  };
}

function addToSummary(summary, object, prefix, policy) {
  const bytes = Number(object.Size || 0);
  const lastModified = object.LastModified?.toISOString() || null;
  summary.count++;
  summary.bytes += bytes;

  if (lastModified) {
    if (!summary.oldestLastModified || lastModified < summary.oldestLastModified) {
      summary.oldestLastModified = lastModified;
    }
    if (!summary.newestLastModified || lastModified > summary.newestLastModified) {
      summary.newestLastModified = lastModified;
    }
  }

  summary.byPrefix[prefix] ||= { count: 0, bytes: 0 };
  summary.byPrefix[prefix].count++;
  summary.byPrefix[prefix].bytes += bytes;
  summary.byPolicy[policy].count++;
  summary.byPolicy[policy].bytes += bytes;
}

/**
 * List every expiring R2 prefix before deleting anything. This prevents
 * continuation-token drift from skipping keys while a bucket is being mutated.
 */
export async function auditExpiredR2Objects({
  now = new Date(),
  deadline = () => false,
  prefixes = EXPIRING_R2_PREFIXES,
  config = getStorageRetentionConfig(),
} = {}) {
  const expiredObjects = [];
  const summary = createSummary();
  let scanned = 0;
  let complete = true;

  for (const prefix of prefixes) {
    let continuationToken;

    do {
      if (deadline() || scanned >= config.scanLimit) {
        complete = false;
        break;
      }

      const result = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: Math.min(LIST_PAGE_SIZE, config.scanLimit - scanned),
      }));

      const contents = result.Contents || [];
      scanned += contents.length;

      for (const object of contents) {
        const key = object.Key;
        if (!key || !object.LastModified || isProtectedR2Key(key)) continue;

        const retentionDays = retentionDaysForKey(key, config);
        const cutoffMs = now.getTime() - retentionDays * DAY_MS;
        if (object.LastModified.getTime() >= cutoffMs) continue;

        const policy = retentionDays === config.temporaryDays ? "temporary" : "project";
        expiredObjects.push({ Key: key, Size: Number(object.Size || 0) });
        addToSummary(summary, object, prefix, policy);
      }

      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      if (result.IsTruncated && !continuationToken) {
        complete = false;
        break;
      }
    } while (continuationToken);

    if (!complete) break;
  }

  return {
    complete,
    scanned,
    expiredObjects,
    summary,
  };
}

export async function deleteR2Objects(objects, { deadline = () => false } = {}) {
  const result = { requested: objects.length, deleted: 0, errors: 0, timedOut: false };

  for (let index = 0; index < objects.length; index += DELETE_BATCH_SIZE) {
    if (deadline()) {
      result.timedOut = true;
      break;
    }

    const batch = objects.slice(index, index + DELETE_BATCH_SIZE);
    const response = await s3Client.send(new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: batch.map(({ Key }) => ({ Key })),
        Quiet: true,
      },
    }));

    const errors = response.Errors?.length || 0;
    result.errors += errors;
    result.deleted += batch.length - errors;
  }

  return result;
}

export function parseSupabaseProjectAssetUrl(fileUrl) {
  if (!fileUrl) return null;

  try {
    const parsed = new URL(fileUrl);
    const marker = "/storage/v1/object/public/project-assets/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;

    const path = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    return path && !path.includes("..") ? path : null;
  } catch {
    return null;
  }
}

export function toPublicAuditSummary(audit) {
  const toMiB = (bytes) => Number((bytes / 1024 / 1024).toFixed(2));
  const convertGroup = (group) => Object.fromEntries(
    Object.entries(group).map(([key, value]) => [key, {
      count: value.count,
      sizeMiB: toMiB(value.bytes),
    }]),
  );

  return {
    complete: audit.complete,
    scanned: audit.scanned,
    expired: audit.summary.count,
    expiredSizeMiB: toMiB(audit.summary.bytes),
    oldestLastModified: audit.summary.oldestLastModified,
    newestLastModified: audit.summary.newestLastModified,
    byPrefix: convertGroup(audit.summary.byPrefix),
    byPolicy: convertGroup(audit.summary.byPolicy),
  };
}
