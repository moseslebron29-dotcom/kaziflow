import { eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users, withdrawals } from "../drizzle/schema";
import { getDb } from "./db";
import { b2cReady, initiateB2cPayout, normalizeKenyanPhone, parseB2cResult } from "./daraja";
import { audit } from "./security";
import { formatKesMinor } from "../shared/money";
import { notify, templates } from "./mailer";

async function notifyMember(userId: number, status: string, amountMinor: number, detail: string) {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (rows[0]?.email) notify({ to: rows[0].email, userId, ...templates.withdrawal(rows[0].name ?? "", status, formatKesMinor(amountMinor), detail) });
}

/**
 * Sends an approved withdrawal to M-Pesa B2C. The withdrawal only becomes Paid
 * when Safaricom's result callback confirms it (see processB2cResult).
 */
export async function startPayout(withdrawalId: number, adminId: number) {
  if (!b2cReady())
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "M-Pesa B2C payouts are not configured. Add the B2C credentials first." });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable." });
  const request = await db.transaction(async tx => {
    const rows = await tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId)).limit(1).for("update");
    const w = rows[0];
    if (!w) throw new TRPCError({ code: "NOT_FOUND", message: "Withdrawal not found." });
    const retryable = w.status === "pending" || w.status === "payout_failed" || (w.status === "processing" && !w.conversationId);
    if (!retryable)
      throw new TRPCError({ code: "CONFLICT", message: "This withdrawal already has a payout in progress or is finalized." });
    await tx
      .update(withdrawals)
      .set({ status: "processing", reviewedById: adminId, conversationId: null, originatorConversationId: null, payoutResultCode: null, payoutResultDesc: "Payout request being sent to M-Pesa." })
      .where(eq(withdrawals.id, w.id));
    return w;
  });
  try {
    const response = await initiateB2cPayout({ withdrawalId: request.id, phone: request.mpesaPhone, amountMinor: request.payoutMinor });
    await db
      .update(withdrawals)
      .set({
        conversationId: response.conversationId,
        originatorConversationId: response.originatorConversationId,
        payoutResultDesc: "Accepted by M-Pesa. Waiting for the payout result.",
      })
      .where(eq(withdrawals.id, request.id));
    await audit(adminId, "withdrawal_payout_sent", "withdrawal", request.id, { payoutMinor: request.payoutMinor });
    await notifyMember(request.userId, "processing", request.amountMinor, "We have sent your payout to M-Pesa. You will get an SMS from Safaricom once it completes.");
    return { status: "processing" as const };
  } catch (error) {
    await db
      .update(withdrawals)
      .set({ status: "payout_failed", payoutResultDesc: "M-Pesa did not accept the payout request. No money was sent." })
      .where(eq(withdrawals.id, request.id));
    await audit(adminId, "withdrawal_payout_request_failed", "withdrawal", request.id, {
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    throw new TRPCError({ code: "BAD_GATEWAY", message: "M-Pesa did not accept the payout request. No money was sent; you can retry." });
  }
}

export async function processB2cResult(body: unknown, timeout = false) {
  const result = parseB2cResult(body);
  if (!result) return { accepted: false, reason: "Malformed B2C result" };
  const db = await getDb();
  if (!db) return { accepted: false, reason: "Database unavailable" };
  const keys = [result.originatorConversationId, result.conversationId].filter((v): v is string => Boolean(v));
  if (!keys.length) return { accepted: false, reason: "Missing conversation reference" };
  const found = await db
    .select()
    .from(withdrawals)
    .where(or(...keys.flatMap(k => [eq(withdrawals.originatorConversationId, k), eq(withdrawals.conversationId, k)])))
    .limit(1);
  const target = found[0];
  if (!target) return { accepted: true, reason: "Unknown payout reference recorded for investigation" };

  let outcome: "paid" | "failed" | "mismatch" | "ignored" | "timeout" = "ignored";
  await db.transaction(async tx => {
    const rows = await tx.select().from(withdrawals).where(eq(withdrawals.id, target.id)).limit(1).for("update");
    const w = rows[0];
    if (!w || w.status !== "processing") return; // Duplicate or late callback: never pay twice.
    if (timeout) {
      outcome = "timeout";
      await tx
        .update(withdrawals)
        .set({ payoutResultDesc: "M-Pesa queue timeout. Confirm in the M-Pesa portal before retrying to avoid a double payout." })
        .where(eq(withdrawals.id, w.id));
      return;
    }
    if (result.resultCode !== 0) {
      outcome = "failed";
      await tx
        .update(withdrawals)
        .set({ status: "payout_failed", payoutResultCode: String(result.resultCode), payoutResultDesc: result.resultDescription })
        .where(eq(withdrawals.id, w.id));
      return;
    }
    let phoneOk = true;
    if (result.receiverPhone) {
      try {
        phoneOk = normalizeKenyanPhone(result.receiverPhone) === w.mpesaPhone;
      } catch {
        phoneOk = false;
      }
    }
    const amountOk = result.amountMinor === w.payoutMinor;
    if (!result.transactionId || !amountOk || !phoneOk) {
      outcome = "mismatch";
      await tx
        .update(withdrawals)
        .set({ payoutResultCode: "0", payoutResultDesc: "Result did not match the withdrawal amount, phone or receipt. Administrator review required." })
        .where(eq(withdrawals.id, w.id));
      return;
    }
    outcome = "paid";
    await tx
      .update(withdrawals)
      .set({ status: "paid", payoutReference: result.transactionId, payoutResultCode: "0", payoutResultDesc: result.resultDescription, paidAt: new Date() })
      .where(eq(withdrawals.id, w.id));
  });
  const final = outcome as string;
  await audit(null, `withdrawal_b2c_${final}`, "withdrawal", target.id, { resultCode: result.resultCode });
  if (final === "paid")
    await notifyMember(target.userId, "paid", target.amountMinor, `M-Pesa receipt ${result.transactionId}. Thank you for using KaziFlow.`);
  if (final === "failed")
    await notifyMember(target.userId, "payout_failed", target.amountMinor, "The M-Pesa payout did not complete. Your funds are safe and our team will retry or contact you.");
  return { accepted: true, reason: `B2C ${final}` };
}
