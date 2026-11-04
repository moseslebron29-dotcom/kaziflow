import { afterEach, describe, expect, it, vi } from "vitest";
import { darajaReady, normalizeKenyanPhone, parseStkCallback } from "./daraja";

afterEach(() => vi.unstubAllEnvs());

describe("Daraja input validation", () => {
  it("normalizes Kenyan M-Pesa phone variants", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("+254 712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("712345678")).toBe("254712345678");
  });

  it("rejects invalid Kenyan phone numbers", () => {
    expect(() => normalizeKenyanPhone("0612345678")).toThrow();
    expect(() => normalizeKenyanPhone("2547123")).toThrow();
  });

  it("parses the provider callback fields used for server-side verification", () => {
    const parsed = parseStkCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: "merchant-1",
          CheckoutRequestID: "checkout-1",
          ResultCode: 0,
          ResultDesc: "Success",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 100 },
              { Name: "MpesaReceiptNumber", Value: "QAZ123ABC" },
              { Name: "PhoneNumber", Value: 254712345678 },
            ],
          },
        },
      },
    });
    expect(parsed).toEqual({
      checkoutRequestId: "checkout-1",
      merchantRequestId: "merchant-1",
      resultCode: 0,
      resultDescription: "Success",
      receipt: "QAZ123ABC",
      phone: "254712345678",
      amountMinor: 10_000,
    });
  });

  it("treats malformed callbacks as invalid", () => {
    expect(parseStkCallback(null)).toBeNull();
    expect(parseStkCallback({ Body: { stkCallback: { ResultCode: "0" } } })).toBeNull();
  });

  it("blocks production Daraja requests unless the separate live-payments flag is true", () => {
    vi.stubEnv("DARAJA_CONSUMER_KEY", "test-key");
    vi.stubEnv("DARAJA_CONSUMER_SECRET", "test-secret");
    vi.stubEnv("DARAJA_SHORTCODE", "123456");
    vi.stubEnv("DARAJA_PASSKEY", "test-passkey");
    vi.stubEnv("DARAJA_CALLBACK_URL", "https://example.test/api/daraja/callback");
    vi.stubEnv("DARAJA_ENVIRONMENT", "production");
    vi.stubEnv("KAZIFLOW_LIVE_PAYMENTS_ENABLED", "false");
    expect(darajaReady()).toBe(false);

    vi.stubEnv("KAZIFLOW_LIVE_PAYMENTS_ENABLED", "true");
    expect(darajaReady()).toBe(true);
  });
});
