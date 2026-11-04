import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import type { User } from "../drizzle/schema";
import { auditEvents, appSettings } from "../drizzle/schema";
import { getDb } from "./db";

function derive(password: string, salt: Buffer, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key as Buffer);
    });
  });
}
const attempts = new Map<string, { start: number; count: number }>();

export function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
export function hashOpaqueToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function newOpaqueToken() { return randomBytes(32).toString("base64url"); }

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derive(password, salt, 64);
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || parts[1] !== "16384" || parts[2] !== "8" || parts[3] !== "1") return false;
  try {
    const salt = Buffer.from(parts[4]!, "base64url");
    const expected = Buffer.from(parts[5]!, "base64url");
    const candidate = await derive(password, salt, expected.length);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch { return false; }
}

export function verifySecret(candidate: string, expected: string) {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function limitRequest(req: Request, action: string, maximum: number, windowMs: number) {
  const now = Date.now();
  const key = `${action}:${req.ip || req.socket.remoteAddress || "unknown"}`;
  let entry = attempts.get(key);
  if (!entry || now - entry.start > windowMs) { entry = { start: now, count: 0 }; attempts.set(key, entry); }
  entry.count += 1;
  if (entry.count > maximum) throw new Error("Too many attempts. Please wait and try again.");
  if (attempts.size > 5_000) for (const [k, v] of attempts) if (now - v.start > windowMs) attempts.delete(k);
}

export function publicUser(user: User) {
  const { passwordHash: _passwordHash, emailNormalized: _emailNormalized, openId: _openId, sessionVersion: _sessionVersion, ...safe } = user;
  return safe;
}

export async function settingValue(key: string, fallback: string) {
  const db = await getDb();
  if (!db) return fallback;
  const rows = await db.select().from(appSettings).where(eq(appSettings.settingKey, key)).limit(1);
  return rows[0]?.valueText ?? fallback;
}

export async function audit(actorId: number | null, action: string, targetType: string, targetId: number | null, details?: unknown) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditEvents).values({ actorId, action, targetType, targetId, detailsText: details ? JSON.stringify(details).slice(0, 6000) : null });
}
