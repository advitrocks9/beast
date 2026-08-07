import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireEnv } from "@beast/shared/env";

let _r2: S3Client | null = null;

function r2(): S3Client {
  if (!_r2) {
    _r2 = new S3Client({
      region: "auto",
      endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return _r2;
}

/**
 * Generate a presigned URL for uploading a file to R2.
 * Keys are tenant-prefixed: {companyId}/{fileId}/{filename}
 */
export async function getUploadUrl(opts: {
  companyId: string;
  fileId: string;
  filename: string;
  contentType: string;
}): Promise<{ uploadUrl: string; r2Key: string }> {
  const r2Key = `${opts.companyId}/${opts.fileId}/${opts.filename}`;

  const command = new PutObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: r2Key,
    ContentType: opts.contentType,
  });

  const uploadUrl = await getSignedUrl(r2(), command, { expiresIn: 3600 });

  return { uploadUrl, r2Key };
}

/**
 * Generate a presigned URL for downloading a file from R2.
 */
export async function getDownloadUrl(r2Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: r2Key,
  });

  return getSignedUrl(r2(), command, { expiresIn: 3600 });
}

/**
 * Delete a file from R2.
 */
export async function deleteFile(r2Key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: requireEnv("R2_BUCKET_NAME"),
    Key: r2Key,
  });

  await r2().send(command);
}
