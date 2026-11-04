import { and, eq, sql } from "drizzle-orm";
import {
  adCampaigns,
  appSettings,
  auditEvents,
  paymentAttempts,
  referrals,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { normalizeKenyanPhone, parseStkCallback, queryStkPush } from "./daraja";
import { applyCredit } from "./ledger";
import { notify, templates } from "./mailer";

async function requireReview(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  paymentId: number,
  description: string,
  callback: ReturnType<typeof parseStkCallback>,
  auditAction: string
) {
  await db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, paymentId))
      .limit(1)
      .for("update");
    const payment = rows[0];
    // A "failed" attempt is still moved to review here: this path only runs for a
    // success callback, so money may have moved and must not be silently dropped.
    if (!payment || payment.status === "succeeded") return;
    await tx
      .update(paymentAttempts)
      .set({
        status: "verification_required",
        resultCode: callback ? String(callback.resultCode) : payment.resultCode,
        receipt: callback?.receipt ?? payment.receipt,
        resultDescription: description.slice(0, 500),
      })
      .where(eq(paymentAttempts.id, payment.id));
    await tx
      .insert(auditEvents)
      .values({
        actorId: null,
        action: auditAction,
        targetType: "payment",
        targetId: payment.id,
        detailsText: JSON.stringify({
          description: description.slice(0, 250),
          receiptPresent: Boolean(callback?.receipt),
        }),
      });
  });
}

/** Records a definitive unsuccessful result from Safaricom. Never credits anything. */
async function markFailed(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  paymentId: number,
  callback: NonNullable<ReturnType<typeof parseStkCallback>>
) {
  await db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, paymentId))
      .limit(1)
      .for("update");
    const payment = rows[0];
    if (!payment || payment.status === "succeeded" || payment.status === "failed") return;
    await tx
      .update(paymentAttempts)
      .set({
        status: "failed",
        resultCode: String(callback.resultCode),
        resultDescription: (callback.resultDescription || "M-Pesa payment was not completed.").slice(0, 500),
      })
      .where(eq(paymentAttempts.id, payment.id));
    await tx.insert(auditEvents).values({
      actorId: null,
      action: "daraja_payment_not_completed",
      targetType: "payment",
      targetId: payment.id,
      detailsText: JSON.stringify({ resultCode: callback.resultCode }),
    });
  });
}

export async function processDarajaCallback(body: unknown) {
  const callback = parseStkCallback(body);
  if (!callback) return { accepted: false, reason: "Malformed callback" };
  const db = await getDb();
  if (!db) return { accepted: false, reason: "Database unavailable" };
  const found = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.checkoutRequestId, callback.checkoutRequestId))
    .limit(1);
  const payment = found[0];
  if (!payment)
    return {
      accepted: true,
      reason: "Unknown checkout reference recorded for investigation",
    };
  if (payment.status === "succeeded")
    return { accepted: true, reason: "Duplicate terminal callback ignored" };

  // Safaricom sends one final result per prompt. A non-zero result (cancelled, wrong PIN,
  // insufficient balance, unreachable phone, push error) means no money moved, so the
  // attempt is closed as failed and the member can retry straight away. A later verified
  // success for the same prompt can still settle it below.
  if (callback.resultCode !== 0) {
    if (payment.status === "failed")
      return { accepted: true, reason: "Duplicate failure callback ignored" };
    await markFailed(db, payment.id, callback);
    return {
      accepted: true,
      reason: "Payment not completed; no account credit was made",
    };
  }

  await db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, payment.id))
      .limit(1)
      .for("update");
    const locked = rows[0];
    if (!locked || locked.status === "succeeded") return;
    await tx
      .update(paymentAttempts)
      .set({
        status: "callback_received",
        resultCode: "0",
        resultDescription: callback.resultDescription.slice(0, 500),
        receipt: callback.receipt ?? locked.receipt,
      })
      .where(eq(paymentAttempts.id, locked.id));
  });

  let phoneMatches = false;
  if (callback.phone) {
    try {
      phoneMatches = normalizeKenyanPhone(callback.phone) === payment.phone;
    } catch {
      phoneMatches = false;
    }
  }
  const callbackMatches =
    Boolean(callback.receipt) &&
    callback.amountMinor === payment.amountMinor &&
    phoneMatches;
  if (!callbackMatches) {
    await requireReview(
      db,
      payment.id,
      "Callback amount, phone or receipt did not match the stored payment attempt.",
      callback,
      "daraja_callback_mismatch"
    );
    return {
      accepted: true,
      reason: "Callback needs administrator investigation; no credit was made",
    };
  }

  let query: Record<string, unknown>;
  try {
    query = await queryStkPush(callback.checkoutRequestId);
  } catch {
    await requireReview(
      db,
      payment.id,
      "Provider query could not confirm the transaction; no payment was credited.",
      callback,
      "daraja_query_error"
    );
    return {
      accepted: true,
      reason: "Provider verification unavailable; no account credit was made",
    };
  }
  if (String(query.ResultCode) !== "0") {
    const description =
      typeof query.ResultDesc === "string"
        ? query.ResultDesc.slice(0, 500)
        : "Provider query did not confirm success.";
    await requireReview(
      db,
      payment.id,
      description,
      callback,
      "daraja_query_requires_review"
    );
    return { accepted: true, reason: "Provider query did not confirm success" };
  }

  let settled = false;
  let activatedUser: { id: number; email: string | null; name: string | null } | null = null;
  await db.transaction(async tx => {
    const lockedRows = await tx
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, payment.id))
      .limit(1)
      .for("update");
    const locked = lockedRows[0];
    if (!locked || locked.status === "succeeded") return;

    if (locked.purpose === "activation") {
      const accountRows = await tx
        .select()
        .from(users)
        .where(eq(users.id, locked.userId))
        .limit(1)
        .for("update");
      const account = accountRows[0];
      if (!account || account.activatedAt) {
        await tx
          .update(paymentAttempts)
          .set({
            status: "verification_required",
            resultCode: "0",
            receipt: callback.receipt,
            resultDescription: account
              ? "Provider confirmed payment but the account was already activated; administrator reconciliation required."
              : "Provider confirmed payment but the account was not found; administrator reconciliation required.",
          })
          .where(eq(paymentAttempts.id, locked.id));
        await tx
          .insert(auditEvents)
          .values({
            actorId: null,
            action: "daraja_activation_reconciliation_required",
            targetType: "payment",
            targetId: locked.id,
            detailsText: JSON.stringify({
              receiptPresent: Boolean(callback.receipt),
            }),
          });
        return;
      }
      await tx
        .update(users)
        .set({ activatedAt: new Date() })
        .where(
          and(eq(users.id, account.id), sql`${users.activatedAt} IS NULL`)
        );
      activatedUser = { id: account.id, email: account.email, name: account.name };
      const referralRows = await tx
        .select()
        .from(referrals)
        .where(eq(referrals.referredUserId, account.id))
        .limit(1)
        .for("update");
      const referral = referralRows[0];
      if (referral && referral.status === "pending") {
        const settings = await tx
          .select()
          .from(appSettings)
          .where(eq(appSettings.settingKey, "referralCommissionMinor"))
          .limit(1);
        const commission = Math.max(
          0,
          Math.min(2_000_000, Number(settings[0]?.valueText ?? 0) || 0)
        );
        if (commission > 0) {
          await applyCredit(tx, {
            userId: referral.referrerId,
            amountMinor: commission,
            kind: "referral_credit",
            key: `referral-activation:${account.id}`,
            referenceType: "referral",
            referenceId: referral.id,
            note: "Eligible referral activated",
          });
          await tx
            .update(referrals)
            .set({
              status: "credited",
              commissionMinor: commission,
              creditedAt: new Date(),
            })
            .where(eq(referrals.id, referral.id));
        }
      }
    } else if (locked.campaignId) {
      const campaignRows = await tx
        .select()
        .from(adCampaigns)
        .where(eq(adCampaigns.id, locked.campaignId))
        .limit(1)
        .for("update");
      const campaign = campaignRows[0];
      if (
        !campaign ||
        campaign.fundedMinor + locked.amountMinor > campaign.budgetMinor
      ) {
        await tx
          .update(paymentAttempts)
          .set({
            status: "verification_required",
            resultCode: "0",
            receipt: callback.receipt,
            resultDescription:
              "Provider confirmed payment but the campaign budget cannot accept the funds; administrator reconciliation or refund is required.",
          })
          .where(eq(paymentAttempts.id, locked.id));
        await tx
          .insert(auditEvents)
          .values({
            actorId: null,
            action: "daraja_funding_reconciliation_required",
            targetType: "payment",
            targetId: locked.id,
            detailsText: JSON.stringify({
              receiptPresent: Boolean(callback.receipt),
              campaignId: locked.campaignId,
            }),
          });
        return;
      }
      const newFunded = campaign.fundedMinor + locked.amountMinor;
      await tx
        .update(adCampaigns)
        .set({
          fundedMinor: newFunded,
          status:
            newFunded >= campaign.budgetMinor
              ? "pending_review"
              : "pending_funding",
        })
        .where(eq(adCampaigns.id, campaign.id));
    }

    await tx
      .update(paymentAttempts)
      .set({
        status: "succeeded",
        resultCode: "0",
        receipt: callback.receipt,
        verifiedAt: new Date(),
        resultDescription:
          "Confirmed by matching Daraja callback metadata and server-side STK Query.",
      })
      .where(eq(paymentAttempts.id, locked.id));
    await tx
      .insert(auditEvents)
      .values({
        actorId: null,
        action: "daraja_payment_confirmed",
        targetType: "payment",
        targetId: locked.id,
        detailsText: JSON.stringify({
          purpose: locked.purpose,
          receiptPresent: Boolean(callback.receipt),
        }),
      });
    settled = true;
  });
  const done = activatedUser as { id: number; email: string | null; name: string | null } | null;
  if (settled && done?.email)
    notify({ to: done.email, userId: done.id, ...templates.activation(done.name ?? "", callback.receipt) });
  return {
    accepted: true,
    reason: settled
      ? "Provider verification completed"
      : "Payment requires administrator reconciliation; no wallet or campaign credit was made",
  };
}
