import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { uploadedAssets } from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";

const IMAGE_MAX = 3 * 1024 * 1024;
const VIDEO_MAX = 8 * 1024 * 1024;
const imageTypes: Record<
  string,
  { ext: string; matches: (bytes: Buffer) => boolean }
> = {
  "image/jpeg": {
    ext: "jpg",
    matches: bytes =>
      bytes.length > 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
  },
  "image/png": {
    ext: "png",
    matches: bytes =>
      bytes.length > 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  "image/webp": {
    ext: "webp",
    matches: bytes =>
      bytes.length > 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP",
  },
};

async function persist(input: {
  userId: number;
  purpose: "campaign" | "evidence";
  mime: string;
  base64: string;
  ext: string;
  maxBytes: number;
  matches: (bytes: Buffer) => boolean;
}) {
  const raw = input.base64.replace(/^data:[^,]+,/, "");
  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(raw) ||
    raw.length > Math.ceil((input.maxBytes * 4) / 3) + 16
  )
    throw new Error("The upload is malformed or exceeds the file-size limit.");
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length || bytes.length > input.maxBytes || !input.matches(bytes))
    throw new Error(
      "The uploaded file does not match its declared type or exceeds the size limit."
    );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const duplicate = await db
    .select({ id: uploadedAssets.id })
    .from(uploadedAssets)
    .where(eq(uploadedAssets.sha256, sha256))
    .limit(1);
  if (duplicate.length)
    throw new Error(
      "This exact file has already been uploaded. Choose a new image or video."
    );
  const key = `kaziflow/${input.purpose}/${input.userId}/${randomUUID()}.${input.ext}`;
  const saved = await storagePut(key, bytes, input.mime);
  const result = await db
    .insert(uploadedAssets)
    .values({
      userId: input.userId,
      storageKey: saved.key,
      sha256,
      contentType: input.mime,
      sizeBytes: bytes.length,
      purpose: input.purpose,
    });
  const assetId = Number((result as any)?.[0]?.insertId);
  if (!Number.isSafeInteger(assetId) || assetId <= 0)
    throw new Error("The uploaded asset could not be indexed.");
  return {
    assetId,
    key: saved.key,
    url: saved.url,
    sha256,
    contentType: input.mime,
    sizeBytes: bytes.length,
  };
}

export async function uploadImage(input: {
  userId: number;
  purpose: "campaign" | "evidence";
  mime: string;
  base64: string;
}) {
  const format = imageTypes[input.mime];
  if (!format) throw new Error("Upload a JPEG, PNG or WebP image.");
  return persist({
    ...input,
    ext: format.ext,
    maxBytes: IMAGE_MAX,
    matches: format.matches,
  });
}

export async function uploadVideo(input: {
  userId: number;
  purpose: "campaign";
  mime: "video/mp4";
  base64: string;
}) {
  return persist({
    ...input,
    ext: "mp4",
    maxBytes: VIDEO_MAX,
    matches: bytes =>
      bytes.length > 12 && bytes.toString("ascii", 4, 8) === "ftyp",
  });
}
