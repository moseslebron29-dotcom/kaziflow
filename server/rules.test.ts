import { describe, expect, it } from "vitest";
import { whatsappReward, withdrawalCheck } from "../shared/money";
import { reviewContentProblem } from "../shared/reviewRules";
import { nairobiDateKey, parseQuiz, scoreQuiz, TASK_CATEGORY_IDS } from "../shared/taskCategories";
import { assertCanIssueOtp, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "./otp";

describe("email OTP rules", () => {
  it("codes expire after ten minutes and allow five attempts", () => {
    expect(OTP_TTL_MS).toBe(10 * 60_000);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(OTP_RESEND_COOLDOWN_MS).toBe(60_000);
  });
  it("blocks a resend within sixty seconds", () => {
    const now = new Date("2026-01-01T10:00:59Z");
    expect(() => assertCanIssueOtp([new Date("2026-01-01T10:00:00Z")], now)).toThrow(/wait 1 seconds/);
  });
  it("allows a resend after sixty seconds", () => {
    const now = new Date("2026-01-01T10:01:00Z");
    expect(() => assertCanIssueOtp([new Date("2026-01-01T10:00:00Z")], now)).not.toThrow();
  });
});

describe("withdrawals", () => {
  const base = { availableMinor: 50_000, minimumMinor: 10_000, maximumMinor: 5_000_000, feeMinor: 0 };
  it("rejects amounts below the minimum", () => {
    expect(withdrawalCheck({ ...base, amountMinor: 9_900 }).ok).toBe(false);
  });
  it("rejects amounts above the available balance", () => {
    expect(withdrawalCheck({ ...base, amountMinor: 60_000 }).ok).toBe(false);
  });
  it("deducts the fee from the payout", () => {
    expect(withdrawalCheck({ ...base, amountMinor: 30_000, feeMinor: 2_000 })).toEqual({ ok: true, payoutMinor: 28_000 });
  });
});

describe("WhatsApp Status rewards", () => {
  const campaign = { minimumViews: 10, maximumPayableViews: 50, rateMinor: 100, budgetRemainingMinor: 10_000 };
  it("pays only approved views, capped at the per-member maximum", () => {
    expect(whatsappReward({ ...campaign, approvedViews: 60 })).toEqual({ payableViews: 50, rewardMinor: 5_000 });
  });
  it("pays nothing below the minimum views", () => {
    expect(whatsappReward({ ...campaign, approvedViews: 9 }).rewardMinor).toBe(0);
  });
  it("never spends more than the remaining budget", () => {
    expect(whatsappReward({ ...campaign, approvedViews: 50, budgetRemainingMinor: 2_000 })).toEqual({ payableViews: 20, rewardMinor: 2_000 });
  });
});

describe("quiz tasks", () => {
  const quiz = parseQuiz(JSON.stringify([
    { question: "Capital of Kenya?", options: ["Nairobi", "Mombasa"], answerIndex: 0 },
    { question: "Mobile money?", options: ["PayPal", "M-Pesa"], answerIndex: 1 },
  ]));
  it("scores answers as a percentage", () => {
    expect(scoreQuiz(quiz, [0, 0])).toBe(50);
    expect(scoreQuiz(quiz, [0, 1])).toBe(100);
  });
  it("drops malformed questions", () => {
    expect(parseQuiz(JSON.stringify([{ question: "x", options: ["a"], answerIndex: 0 }]))).toHaveLength(0);
  });
  it("daily tasks reset on the Nairobi calendar day", () => {
    expect(nairobiDateKey(new Date("2026-03-01T21:30:00Z"))).toBe("2026-03-02");
  });
});

describe("task categories", () => {
  it("include the requested social, online, entertainment and other categories", () => {
    for (const id of ["tiktok", "youtube", "instagram", "facebook", "twitter", "telegram", "survey", "quiz", "whatsapp_status", "referral"])
      expect(TASK_CATEGORY_IDS as readonly string[]).toContain(id);
  });
});

describe("public review text", () => {
  it("blocks Kenyan phone numbers even when joined to words", () => {
    expect(reviewContentProblem("Call me on 0712345678 for tips")).not.toBeNull();
    expect(reviewContentProblem("Niko on0712 345 678 bana")).not.toBeNull();
    expect(reviewContentProblem("Number yangu ni +254 722 334 455")).not.toBeNull();
  });
  it("blocks emails and links", () => {
    expect(reviewContentProblem("Email me at brian@example.com")).not.toBeNull();
    expect(reviewContentProblem("Check kaziflow-tips.com today")).not.toBeNull();
  });
  it("allows normal Sheng and Kiswahili reviews", () => {
    expect(reviewContentProblem("Nimekuwa nikitumia KaziFlow and so far iko poa. Tasks 3 kwa siku ni sawa.")).toBeNull();
  });
});
