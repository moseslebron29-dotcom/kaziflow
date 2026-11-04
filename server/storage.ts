import fs from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { storedFiles } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * File storage for campaign media, announcement media and private evidence.
 *
 * - S3-compatible storage (Cloudflare R2, AWS S3, Backblaze B2, ...) when S3_BUCKET
 *   is set. Recommended on Render because the default service disk is wiped on
 *   every deploy.
 * - Local disk when UPLOAD_DIR is set (use a Render persistent disk mount path).
 * - Otherwise the Postgres database (stored_files table), so files survive restarts
 *   and redeploys on free hosting with no persistent disk.
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

export function storageDriver(): "s3" | "local" | "database" {
  if (s3Config()) return "s3";
  if (process.env.UPLOAD_DIR || process.env.STORAGE_DRIVER === "disk") return "local";
  return "database";
}

async function dbRequired() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable for file storage.");
  return db;
}

export async function storagePut(key: string, data: Buffer, contentType: string): Promise<{ key: string }> {
  const k = safeKey(key);
  const cfg = s3Config();
  if (cfg) {
    await cfg.client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: k, Body: data, ContentType: contentType }));
    return { key: k };
  }
  if (storageDriver() === "database") {
    const db = await dbRequired();
    await db.insert(storedFiles).values({ storageKey: k, contentType, data }).onConflictDoUpdate({ target: storedFiles.storageKey, set: { contentType, data } });
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
  // Database first (default driver), then local disk for files saved before the switch.
  const db = await getDb();
  if (db) {
    const row = (await db.select({ data: storedFiles.data }).from(storedFiles).where(eq(storedFiles.storageKey, k)).limit(1))[0];
    if (row) return Buffer.from(row.data);
  }
  return fs.readFile(path.join(uploadRoot(), k));
}

/** Public URL for campaign/announcement media streamed by the server. */
export function publicMediaUrl(key: string | null | undefined) {
  return key ? `/api/media/${key}` : null;
}
