import nextEnv from "@next/env";
import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const confirmation = process.env.CONFIRM_R2_LIFECYCLE;
const requiredConfirmation = "syncraft-3-day-retention";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;

const retentionDays = Number.parseInt(process.env.R2_PROJECT_RETENTION_DAYS || "3", 10);
const managedRuleIds = new Set([
  "syncraft-project-retention",
  "syncraft-user-upload-retention",
  "syncraft-legacy-background-retention",
]);
const desiredRules = [
  {
    ID: "syncraft-project-retention",
    Status: "Enabled",
    Filter: { Prefix: "projects/" },
    Expiration: { Days: retentionDays },
  },
  {
    ID: "syncraft-user-upload-retention",
    Status: "Enabled",
    Filter: { Prefix: "users/" },
    Expiration: { Days: retentionDays },
  },
  {
    ID: "syncraft-legacy-background-retention",
    Status: "Enabled",
    Filter: { Prefix: "bg-removed-" },
    Expiration: { Days: retentionDays },
  },
];

console.log(JSON.stringify({
  mode: apply ? "apply" : "plan",
  bucketConfigured: Boolean(bucketName),
  retentionDays,
  managedRules: desiredRules,
  protectedPrefix: "permanent/ (not matched by these rules)",
}, null, 2));

if (!apply) {
  console.log("Plan only. No lifecycle rules were changed.");
  process.exit(0);
}

if (confirmation !== requiredConfirmation) {
  throw new Error(
    `Refusing to apply. Set CONFIRM_R2_LIFECYCLE=${requiredConfirmation} after reviewing the plan.`,
  );
}

if (![accountId, accessKeyId, secretAccessKey, bucketName].every(Boolean)) {
  throw new Error("Missing R2 account, credentials, or bucket configuration.");
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

let existingRules = [];
try {
  const existing = await client.send(new GetBucketLifecycleConfigurationCommand({
    Bucket: bucketName,
  }));
  existingRules = existing.Rules || [];
} catch (error) {
  if (error?.name !== "NoSuchLifecycleConfiguration") throw error;
}

const preservedRules = existingRules.filter((rule) => !managedRuleIds.has(rule.ID));
await client.send(new PutBucketLifecycleConfigurationCommand({
  Bucket: bucketName,
  LifecycleConfiguration: { Rules: [...preservedRules, ...desiredRules] },
}));

console.log(JSON.stringify({
  applied: true,
  preservedRuleCount: preservedRules.length,
  managedRuleCount: desiredRules.length,
}, null, 2));
