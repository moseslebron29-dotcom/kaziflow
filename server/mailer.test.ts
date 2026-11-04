import { afterEach, describe, expect, it, vi } from "vitest";
import { mailerReady, sendAccountEmail } from "./mailer";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Brevo account email adapter", () => {
  it("sends the official static-content payload to Brevo with a server-only API key", async () => {
    vi.stubEnv("KAZIFLOW_BREVO_API_KEY", "unit-test-secret");
    vi.stubEnv("KAZIFLOW_EMAIL_FROM", 'KaziFlow <no-reply@example.test>');
    vi.stubEnv("KAZIFLOW_PUBLIC_ORIGIN", "https://kaziflow.example.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(mailerReady()).toBe(true);
    await sendAccountEmail(
      "member@example.test",
      "Reset your password",
      "<Reset account>",
      "one-time-token",
      "/reset-password"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(new Headers(init.headers).get("api-key")).toBe("unit-test-secret");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      sender: { email: "no-reply@example.test", name: "KaziFlow" },
      to: [{ email: "member@example.test" }],
      subject: "Reset your password",
    });
    expect(body.htmlContent).toContain("&lt;Reset account&gt;");
    expect(body.htmlContent).toContain(
      "https://kaziflow.example.test/reset-password?token=one-time-token"
    );
    expect(body.textContent).toContain("one-time-token");
  });

  it("does not report mail ready without a verified sender, HTTPS origin and key", () => {
    vi.stubEnv("KAZIFLOW_BREVO_API_KEY", "");
    vi.stubEnv("KAZIFLOW_EMAIL_FROM", "not-an-address");
    vi.stubEnv("KAZIFLOW_PUBLIC_ORIGIN", "http://localhost:3000");
    expect(mailerReady()).toBe(false);
  });

  it("does not send when the Brevo configuration is incomplete", async () => {
    vi.stubEnv("KAZIFLOW_BREVO_API_KEY", "");
    vi.stubEnv("KAZIFLOW_EMAIL_FROM", "sender@example.test");
    vi.stubEnv("KAZIFLOW_PUBLIC_ORIGIN", "https://kaziflow.example.test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendAccountEmail(
        "member@example.test",
        "Verify",
        "Verify account",
        "token",
        "/verify-email"
      )
    ).rejects.toThrow("Brevo transactional email is not configured.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
