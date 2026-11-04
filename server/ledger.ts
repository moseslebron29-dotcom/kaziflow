import { eq, sql } from "drizzle-orm";
import { ledgerEntries, wallets } from "../drizzle/schema";
import type { getDb } from "./db";

export type LedgerKind = "task_credit" | "ad_credit" | "referral_credit" | "daily_credit" | "withdrawal_hold" | "withdrawal_release" | "withdrawal_paid" | "adjustment";
export type LedgerTx = any;

export async function applyCredit(tx: LedgerTx, input: { userId: number; amountMinor: number; kind: LedgerKind; key: string; referenceType: string; referenceId: number; note?: string }) {
  const prior = await tx.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, input.key)).limit(1);
  if (prior.length) return false;
  const wallet = await tx.select({ userId: wallets.userId }).from(wallets).where(eq(wallets.userId, input.userId)).limit(1);
  if (!wallet.length) await tx.insert(wallets).values({ userId: input.userId, availableMinor: 0, pendingMinor: 0, lifetimeMinor: 0 });
  await tx.update(wallets).set({
    availableMinor: sql`${wallets.availableMinor} + ${input.amountMinor}`,
    lifetimeMinor: sql`${wallets.lifetimeMinor} + ${input.amountMinor}`,
  }).where(eq(wallets.userId, input.userId));
  await tx.insert(ledgerEntries).values({
    userId: input.userId, kind: input.kind, amountMinor: input.amountMinor, direction: "credit",
    idempotencyKey: input.key, referenceType: input.referenceType, referenceId: input.referenceId, note: input.note ?? null,
  });
  return true;
}

export function availableMinor(wallet: { availableMinor: number } | undefined) { return Number(wallet?.availableMinor ?? 0); }
