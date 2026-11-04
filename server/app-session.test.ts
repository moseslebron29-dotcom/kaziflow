import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import {
  appSessionReady,
  createAppSession,
  getAppCookieOptions,
  sessionIdentityFromRequest,
} from "./_core/app-session";

afterEach(() => vi.unstubAllEnvs());

describe("KaziFlow application sessions", () => {
  it("uses the managed project-scoped key when no override is supplied", async () => {
    vi.stubEnv("KAZIFLOW_SESSION_SECRET", "");
    vi.stubEnv("MANUS_JWT_SECRET", "platform-secret-for-session-test-0123456789");
    vi.stubEnv("MANUS_PROJECT_ID", "kaziflow-test-project");
    expect(appSessionReady()).toBe(true);

    const token = await createAppSession(42, 3);
    const request = {
      headers: { cookie: `${COOKIE_NAME}=${token}` },
    } as Parameters<typeof sessionIdentityFromRequest>[0];
    await expect(sessionIdentityFromRequest(request)).resolves.toEqual({
      id: 42,
      version: 3,
    });
  });

  it("uses Secure and SameSite=None on HTTPS Preview", () => {
    vi.stubEnv("KAZIFLOW_COOKIE_SECURE", "true");
    expect(getAppCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
  });

  it("keeps plain HTTP local development separate from Preview cookies", () => {
    vi.stubEnv("KAZIFLOW_COOKIE_SECURE", "false");
    expect(getAppCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });
  });
});
