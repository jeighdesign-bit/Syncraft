import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;
export const bucketName = process.env.CLOUDFLARE_BUCKET_NAME || process.env.CF_R2_BUCKET_NAME;
export const publicUrl = process.env.CLOUDFLARE_PUBLIC_URL || process.env.CF_R2_PUBLIC_URL;

export const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  // Keep the bucket in the URL path. R2's TLS certificate covers the account
  // endpoint, not <bucket>.<account>.r2.cloudflarestorage.com.
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export async function getUploadUrl(fileName, contentType) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    ContentType: contentType,
  });

  // URL valid for 5 minutes
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
  
  return {
    uploadUrl: signedUrl,
    publicUrl: `${publicUrl}/${fileName}`,
  };
}

export async function uploadToR2(buffer, fileName, contentType) {
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    
    return `${publicUrl}/${fileName}`;
  } catch (s3Error) {
    // Fallback to Supabase Storage when R2 S3 endpoint is unreachable (e.g. local TLS issues)
    console.warn('[uploadToR2] S3 failed, falling back to Supabase Storage:', s3Error.code || s3Error.message);
    
    const { adminStorageSupabase, adminSupabase, supabase } = await import('@/lib/supabase');
    const storageBucket = 'project-assets';

    let { data: storageData, error: storageError } = await adminStorageSupabase
      .storage
      .from(storageBucket)
      .upload(fileName, buffer, {
        contentType,
        upsert: false,
      });

    // The direct Storage hostname can hit the same Windows/OpenSSL TLS failure
    // as R2. Files reaching this server route are capped at 4.5 MB, so retrying
    // through Supabase's standard API hostname is safe and avoids that direct
    // hostname entirely. `upsert` makes a lost-response retry idempotent.
    if (storageError) {
      console.warn('[uploadToR2] Direct Supabase Storage failed, retrying standard API host:', storageError.message);
      let standardError = storageError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = await adminSupabase
          .storage
          .from(storageBucket)
          .upload(fileName, buffer, {
            contentType,
            upsert: true,
          });
        storageData = result.data;
        standardError = result.error;
        if (!standardError && storageData) break;
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 350));
      }
      storageError = standardError;
    }

    if (storageError) {
      throw new Error(`Supabase Storage upload also failed: ${storageError.message} (original R2 error: ${s3Error.message})`);
    }

    // Keep emitting the established public URL shape. The admin client uses
    // Supabase's direct Storage hostname for large uploads, while the public
    // client preserves URLs already accepted by our SSRF allowlists.
    const { data: urlData } = supabase
      .storage
      .from(storageBucket)
      .getPublicUrl(storageData.path);

    return urlData.publicUrl;
  }
}

export function getR2KeyFromUrl(fileUrl) {
  if (!fileUrl) return;
  try {
    const parsedUrl = new URL(fileUrl);
    const parsedPublicUrl = new URL(publicUrl);
    if (parsedUrl.origin !== parsedPublicUrl.origin) {
      return null;
    }
    const publicPath = parsedPublicUrl.pathname.replace(/\/$/, '');
    if (publicPath && !parsedUrl.pathname.startsWith(`${publicPath}/`)) {
      return null;
    }
    const key = decodeURIComponent(parsedUrl.pathname.slice(publicPath.length).replace(/^\//, ''));
    return key && !key.includes('..') ? key : null;
  } catch {
    return null;
  }
}

export async function deleteFromR2(fileUrl, options = {}) {
  const fileKey = getR2KeyFromUrl(fileUrl);
  if (!fileKey) {
    console.error(`[R2 Delete] Refusing to delete URL outside configured R2 public URL: ${fileUrl}`);
    return;
  }

  if (options.allowedPrefixes?.length && !options.allowedPrefixes.some((prefix) => fileKey.startsWith(prefix))) {
    console.error(`[R2 Delete] Refusing to delete key outside allowed prefixes: ${fileKey}`);
    return;
  }

  console.log(`[R2 Delete] Deleting key: ${fileKey}`);
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
  });
  await s3Client.send(command); // Let errors propagate so callers can handle them
  console.log(`[R2 Delete] ✅ Deleted: ${fileKey}`);
}
