import { SignJWT, jwtVerify } from "jose";
import type { CookieOptions, Request, Response } from "express";
import { parse } from "cookie";
import { COOKIE_NAME } from "@shared/const";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_ISSUER = "kaziflow";

/** Server-only signing key for login sessions and OTP hashing. */
export function sessionSecret(): string {
  const secret = process.env.KAZIFLOW_SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("KAZIFLOW_SESSION_SECRET must be set to at least 32 random characters.");
  return secret;
}

function sessionKey(): Uint8Array {
  return new TextEncoder().encode(sessionSecret());
}

export function appSessionReady() {
  try {
    sessionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Same-origin cookie. Render serves the site and API from one HTTPS origin, so
 * SameSite=Lax works on Android, iPhone and desktop browsers.
 */
export function getAppCookieOptions(): CookieOptions {
  const flag = process.env.KAZIFLOW_COOKIE_SECURE;
  const secure = flag ? flag !== "false" : process.env.NODE_ENV === "production";
  return { httpOnly: true, path: "/", sameSite: "lax", secure };
}

export async function createAppSession(userId: number, sessionVersion = 0): Promise<string> {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionKey());
}

export async function sessionIdentityFromRequest(req: Request): Promise<{ id: number; version: number } | null> {
  try {
    const token = parse(req.headers.cookie ?? "")[COOKIE_NAME];
    if (!token) return null;
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"], issuer: SESSION_ISSUER });
    if (!payload.sub || !/^\d+$/.test(payload.sub)) return null;
    const id = Number(payload.sub);
    const version = Number(payload.sv ?? 0);
    return Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(version) ? { id, version } : null;
  } catch {
    return null;
  }
}

export function setAppSession(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, { ...getAppCookieOptions(), maxAge: SESSION_TTL_SECONDS * 1000 });
}
export function clearAppSession(res: Response) {
  res.clearCookie(COOKIE_NAME, { ...getAppCookieOptions() });
}
