import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import crypto from "crypto";
import path from "path";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ─────────────────────────────────────────
// S3 / Cloudflare R2 client
// Both use the same AWS SDK interface.
// For R2 set endpoint: https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com
// ─────────────────────────────────────────
function buildS3Client(): S3Client {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const cfAccountId = process.env.CF_ACCOUNT_ID;

  const config = cfAccountId
    ? {
        region: "auto",
        endpoint: `https://${cfAccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
        },
      }
    : {
        region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
        },
      };

  return new S3Client(config);
}

const s3 = buildS3Client();

// ─────────────────────────────────────────
// Public helpers
// ─────────────────────────────────────────

export function validateUpload(
  mimetype: string,
  size: number,
): { valid: true } | { valid: false; reason: string } {
  if (!ALLOWED_MIME_TYPES.has(mimetype)) {
    return {
      valid: false,
      reason: "Invalid file type. Allowed: PNG, JPEG, WebP, GIF",
    };
  }
  if (size > MAX_FILE_SIZE) {
    return { valid: false, reason: "File exceeds 10 MB limit" };
  }
  return { valid: true };
}

/**
 * Upload a buffer to S3/R2 and return the public URL.
 * The key is a random UUID to prevent enumeration.
 */
export async function uploadLogo(
  buffer: Buffer,
  mimetype: string,
  originalName: string,
): Promise<string> {
  const bucket = process.env.S3_BUCKET_NAME ?? process.env.R2_BUCKET_NAME ?? "";
  const ext = path.extname(originalName) || ".png";
  const key = `logos/${crypto.randomUUID()}${ext}`;

  const params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    // Public read — Printful must be able to fetch this URL
    ACL: "public-read",
  };

  await s3.send(new PutObjectCommand(params));

  const cfAccountId = process.env.CF_ACCOUNT_ID;
  if (cfAccountId) {
    // R2 public URL format (requires a custom domain or public bucket enabled)
    const r2PublicDomain = process.env.R2_PUBLIC_DOMAIN;
    if (!r2PublicDomain) {
      throw new Error(
        "R2_PUBLIC_DOMAIN env var is required when using Cloudflare R2",
      );
    }
    return `${r2PublicDomain}/${key}`;
  }

  // Standard S3 URL
  const region = process.env.AWS_REGION ?? "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
