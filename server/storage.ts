import fs from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * File storage for campaign media, announcement media and private evidence.
 *
 * - S3-compatible storage (Cloudflare R2, AWS S3, Backblaze B2, ...) when S3_BUCKET
 *   is set. Recommended on Render because the default service disk is wiped on
 *   every deploy.
 * - Local disk at UPLOAD_DIR otherwise (use a Render persistent disk mount path).
 *
 * Files are never served directly from storage; the server streams them after
 * checking who may see them.
 */
let s3: S3Client | null = null;

function s3Config() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  return {
    bucket,
    client:
      s3 ??
      (s3 = new S3Client({
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        credentials:
          process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
            ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
            : undefined,
      })),
  };
}

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
}

function safeKey(key: string) {
  const normalized = key.replace(/^\/+/, "");
  if (!/^[A-Za-z0-9/_.-]+$/.test(normalized) || normalized.includes(".."))
    throw new Error("Invalid storage key.");
  return normalized;
}

export function storageDriver(): "s3" | "local" {
  return s3Config() ? "s3" : "local";
}

export async function storagePut(key: string, data: Buffer, contentType: string): Promise<{ key: string }> {
  const k = safeKey(key);
  const cfg = s3Config();
  if (cfg) {
    await cfg.client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: k, Body: data, ContentType: contentType }));
    return { key: k };
  }
  const file = path.join(uploadRoot(), k);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data, { mode: 0o600 });
  return { key: k };
}

export async function storageRead(key: string): Promise<Buffer> {
  const k = safeKey(key);
  const cfg = s3Config();
  if (cfg) {
    const result = await cfg.client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: k }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error("Stored file is empty.");
    return Buffer.from(bytes);
  }
  return fs.readFile(path.join(uploadRoot(), k));
}

/** Public URL for campaign/announcement media streamed by the server. */
export function publicMediaUrl(key: string | null | undefined) {
  return key ? `/api/media/${key}` : null;
}
