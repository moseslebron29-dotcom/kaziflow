import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { emailOtps } from "../drizzle/schema";
import type { Db } from "./db";
import { sessionSecret } from "./_core/app-session";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 6;

export type OtpPurpose = "email_verify" | "password_reset";

export class OtpError extends Error {
  constructor(
    message: string,
    public reason: "cooldown" | "hourly_limit" | "expired" | "locked" | "invalid" | "missing",
    public retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export function hashOtp(userId: number, purpose: OtpPurpose, code: string) {
  return createHmac("sha256", sessionSecret()).update(`kaziflow-otp:v1:${userId}:${purpose}:${code}`).digest("hex");
}

export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Pure rule check used by issueOtp: 60-second cooldown and hourly cap. Throws OtpError when blocked. */
export function assertCanIssueOtp(recentCreatedAt: Date[], now: Date) {
  const last = recentCreatedAt.reduce<Date | null>((a, d) => (!a || d > a ? d : a), null);
  if (last) {
    const elapsed = now.getTime() - last.getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new OtpError(`Please wait ${wait} seconds before requesting another code.`, "cooldown", wait);
    }
  }
  const inLastHour = recentCreatedAt.filter(d => now.getTime() - d.getTime() < 60 * 60_000).length;
  if (inLastHour >= OTP_MAX_PER_HOUR) throw new OtpError("Too many codes requested. Please try again in an hour.", "hourly_limit", 3600);
}

/**
 * Issues a fresh six-digit code. Enforces the 60-second resend cooldown and an
 * hourly cap per account, and retires earlier unused codes. A per-account advisory
 * lock makes simultaneous requests queue, so the limits cannot be raced.
 * Returns the plain code so it can be emailed; it is never stored or logged.
 */
export async function issueOtp(db: Db, userId: number, purpose: OtpPurpose, now = new Date()) {
  const code = generateOtpCode();
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${userId}, ${purpose === "email_verify" ? 1 : 2})`);
    const recent = await tx
      .select({ createdAt: emailOtps.createdAt })
      .from(emailOtps)
      .where(and(eq(emailOtps.userId, userId), eq(emailOtps.purpose, purpose), gte(emailOtps.createdAt, new Date(now.getTime() - 60 * 60_000))));
    assertCanIssueOtp(recent.map(r => r.createdAt), now);
    await tx
      .update(emailOtps)
      .set({ consumedAt: now })
      .where(and(eq(emailOtps.userId, userId), eq(emailOtps.purpose, purpose), isNull(emailOtps.consumedAt)));
    await tx.insert(emailOtps).values({
      userId,
      purpose,
      codeHash: hashOtp(userId, purpose, code),
      attempts: 0,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      createdAt: now,
    });
  });
  return code;
}

/** Checks a code. Wrong guesses count toward the five-attempt limit. */
export async function verifyOtp(db: Db, userId: number, purpose: OtpPurpose, code: string, now = new Date()) {
  if (!/^\d{6}$/.test(code)) throw new OtpError("Enter the six-digit code from your email.", "invalid");
  return db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(emailOtps)
      .where(and(eq(emailOtps.userId, userId), eq(emailOtps.purpose, purpose), isNull(emailOtps.consumedAt)))
      .orderBy(desc(emailOtps.createdAt))
      .limit(1)
      .for("update");
    const otp = rows[0];
    if (!otp) throw new OtpError("No active code. Request a new one.", "missing");
    if (otp.expiresAt.getTime() <= now.getTime()) throw new OtpError("This code has expired. Request a new one.", "expired");
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new OtpError("Too many wrong attempts. Request a new code.", "locked");
    const expected = Buffer.from(otp.codeHash, "hex");
    const candidate = Buffer.from(hashOtp(userId, purpose, code), "hex");
    const ok = expected.length === candidate.length && timingSafeEqual(expected, candidate);
    if (!ok) {
      const attempts = otp.attempts + 1;
      await tx.update(emailOtps).set({ attempts }).where(eq(emailOtps.id, otp.id));
      const left = OTP_MAX_ATTEMPTS - attempts;
      return { ok: false as const, attemptsLeft: left };
    }
    await tx.update(emailOtps).set({ consumedAt: now, attempts: otp.attempts + 1 }).where(eq(emailOtps.id, otp.id));
    return { ok: true as const, attemptsLeft: OTP_MAX_ATTEMPTS - otp.attempts - 1 };
  });
}
