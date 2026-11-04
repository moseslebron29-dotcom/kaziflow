import { afterEach, describe, expect, it, vi } from "vitest";
import { mailerReady, sendEmail, templates } from "./mailer";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const configure = () => {
  vi.stubEnv("KAZIFLOW_BREVO_API_KEY", "unit-test-secret");
  vi.stubEnv("KAZIFLOW_EMAIL_FROM", "KaziFlow <no-reply@example.test>");
  vi.stubEnv("KAZIFLOW_PUBLIC_ORIGIN", "https://kaziflow.example.test");
  vi.stubEnv("DATABASE_URL", "");
};

describe("Brevo email", () => {
  it("sends a six-digit code to Brevo with the server-side key, without the code in the subject", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(mailerReady()).toBe(true);
    await sendEmail({ to: "member@example.test", ...templates.otp("<Akinyi>", "482913", "email_verify") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(new Headers(init.headers).get("api-key")).toBe("unit-test-secret");
    const body = JSON.parse(String(init.body));
    expect(body.sender).toEqual({ email: "no-reply@example.test", name: "KaziFlow" });
    expect(body.subject).not.toContain("482913");
    expect(body.htmlContent).toContain("482913");
    expect(body.htmlContent).toContain("&lt;Akinyi&gt;");
  });

  it("is not ready without a key, a valid sender and an HTTPS origin", () => {
    vi.stubEnv("KAZIFLOW_BREVO_API_KEY", "");
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("KAZIFLOW_EMAIL_FROM", "not-an-address");
    vi.stubEnv("KAZIFLOW_PUBLIC_ORIGIN", "http://example.test");
    expect(mailerReady()).toBe(false);
  });

  it("refuses to send when Brevo is not configured", async () => {
    vi.stubEnv("KAZIFLOW_BREVO_API_KEY", "");
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail({ to: "member@example.test", ...templates.welcome("Kevin") })).rejects.toThrow("not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
