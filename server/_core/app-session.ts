import { SignJWT, jwtVerify } from "jose";
import { createHmac } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { parse } from "cookie";
import { COOKIE_NAME } from "@shared/const";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_ISSUER = "kaziflow";

function sessionKey(): Uint8Array {
  const secret = process.env.KAZIFLOW_SESSION_SECRET;
  if (secret) {
    if (secret.length < 32) throw new Error("KAZIFLOW_SESSION_SECRET must contain at least 32 characters.");
    return new TextEncoder().encode(secret);
  }
  const platformSecret = process.env.MANUS_JWT_SECRET;
  const projectId = process.env.MANUS_PROJECT_ID;
  if (!platformSecret || platformSecret.length < 32 || !projectId)
    throw new Error("A secure application session key is unavailable.");
  return createHmac("sha256", platformSecret)
    .update(`kaziflow/app-session/v1/${projectId}`)
    .digest();
}

export function appSessionReady() {
  try {
    sessionKey();
    return true;
  } catch {
    return false;
  }
}

export function getAppCookieOptions(): CookieOptions {
  const localHttp = process.env.KAZIFLOW_COOKIE_SECURE === "false";
  return { httpOnly: true, path: "/", sameSite: localHttp ? "lax" : "none", secure: !localHttp };
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
  } catch { return null; }
}

export function setAppSession(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, { ...getAppCookieOptions(), maxAge: SESSION_TTL_SECONDS * 1000 });
}
export function clearAppSession(res: Response) {
  res.clearCookie(COOKIE_NAME, { ...getAppCookieOptions(), maxAge: -1 });
}
