import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import { appSessionReady, createAppSession, getAppCookieOptions, sessionIdentityFromRequest } from "./_core/app-session";

afterEach(() => vi.unstubAllEnvs());

describe("KaziFlow application sessions", () => {
  it("refuses to sign sessions without a 32+ character secret", () => {
    vi.stubEnv("KAZIFLOW_SESSION_SECRET", "too-short");
    expect(appSessionReady()).toBe(false);
  });

  it("round-trips a signed session cookie", async () => {
    vi.stubEnv("KAZIFLOW_SESSION_SECRET", "unit-test-session-secret-0123456789abcdef");
    const token = await createAppSession(42, 3);
    const request = { headers: { cookie: `${COOKIE_NAME}=${token}` } } as Parameters<typeof sessionIdentityFromRequest>[0];
    await expect(sessionIdentityFromRequest(request)).resolves.toEqual({ id: 42, version: 3 });
  });

  it("rejects a session signed with a different secret", async () => {
    vi.stubEnv("KAZIFLOW_SESSION_SECRET", "first-secret-for-session-test-0123456789");
    const token = await createAppSession(7, 0);
    vi.stubEnv("KAZIFLOW_SESSION_SECRET", "other-secret-for-session-test-0123456789");
    const request = { headers: { cookie: `${COOKIE_NAME}=${token}` } } as Parameters<typeof sessionIdentityFromRequest>[0];
    await expect(sessionIdentityFromRequest(request)).resolves.toBeNull();
  });

  it("uses Secure, HttpOnly, SameSite=Lax cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KAZIFLOW_COOKIE_SECURE", "");
    expect(getAppCookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  });

  it("allows plain-HTTP cookies only when explicitly disabled for local development", () => {
    vi.stubEnv("KAZIFLOW_COOKIE_SECURE", "false");
    expect(getAppCookieOptions()).toMatchObject({ secure: false });
  });
});
