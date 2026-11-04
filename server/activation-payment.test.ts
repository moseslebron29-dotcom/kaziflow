/**
 * Activation payment flow against a real PostgreSQL database.
 * Runs only when TEST_DATABASE_URL points at a disposable, already-migrated database
 * (it truncates tables). Example:
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5434/kftest npx vitest run server/activation-payment.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

let checkoutCounter = 0;
vi.mock("./daraja", async original => {
  const actual = await original<typeof import("./daraja")>();
  return {
    ...actual,
    darajaReady: () => true,
    initiateStkPush: vi.fn(async () => ({
      checkoutRequestId: `ws_CO_TEST_${++checkoutCounter}`,
      merchantRequestId: "MR_TEST",
      customerMessage: "Success. Request accepted for processing",
    })),
    queryStkPush: vi.fn(async () => ({ ResultCode: "0", ResultDesc: "The service request is processed successfully." })),
  };
});
vi.mock("./mailer", async original => {
  const actual = await original<typeof import("./mailer")>();
  return { ...actual, notify: vi.fn(async () => undefined) };
});

function failureCallback(checkoutRequestId: string, code: number, desc: string) {
  return { Body: { stkCallback: { MerchantRequestID: "MR_TEST", CheckoutRequestID: checkoutRequestId, ResultCode: code, ResultDesc: desc } } };
}
function successCallback(checkoutRequestId: string, phone: string) {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: "MR_TEST",
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 100 },
            { Name: "MpesaReceiptNumber", Value: `TST${checkoutRequestId.slice(-4)}` },
            { Name: "PhoneNumber", Value: Number(phone) },
          ],
        },
      },
    },
  };
}

describe.skipIf(!TEST_DB)("KES 100 activation payment", () => {
  let db: Awaited<ReturnType<typeof import("./db").getDb>>;
  let schema: typeof import("../drizzle/schema");
  let memberRouter: typeof import("./memberRouter").memberRouter;
  let processDarajaCallback: typeof import("./payments").processDarajaCallback;
  let eq: typeof import("drizzle-orm").eq;
  let ip = 0;

  beforeAll(async () => {
    ({ eq } = await import("drizzle-orm"));
    schema = await import("../drizzle/schema");
    ({ memberRouter } = await import("./memberRouter"));
    ({ processDarajaCallback } = await import("./payments"));
    db = await (await import("./db")).getDb();
  });
  afterAll(async () => (await import("./db")).closeDb());
  beforeEach(async () => {
    await db!.execute(`TRUNCATE "payment_attempts", "audit_events", "users" RESTART IDENTITY CASCADE` as any);
  });

  async function member() {
    const [user] = await db!
      .insert(schema.users)
      .values({ openId: `test-${Date.now()}-${Math.random()}`, email: `m${Math.random()}@example.com`, name: "Test Member", emailVerifiedAt: new Date() } as any)
      .returning();
    const req = { ip: `10.0.0.${++ip}`, socket: {}, headers: {} } as any;
    return { user, caller: memberRouter.createCaller({ user, req, res: {} as any }) };
  }
  async function payment(id: number) {
    return (await db!.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, id)))[0]!;
  }

  for (const [code, desc] of [
    [1, "The balance is insufficient for the transaction."],
    [1032, "Request cancelled by user"],
    [1025, "Error Occurred while sending push request."],
    [2001, "The initiator information is invalid."],
  ] as const) {
    it(`Safaricom result ${code} closes the attempt as failed and the member can pay again immediately`, async () => {
      const { caller } = await member();
      const first = await caller.startActivation({ phone: "0712345678" });
      const firstRow = await payment(first.paymentId!);
      await processDarajaCallback(failureCallback(firstRow.checkoutRequestId!, code, desc));
      const failed = await payment(first.paymentId!);
      expect(failed.status).toBe("failed");
      expect(failed.resultCode).toBe(String(code));

      const retry = await caller.startActivation({ phone: "0712345678" });
      expect(retry.alreadyActivated).toBe(false);
      expect(retry.paymentId).not.toBe(first.paymentId);
    });
  }

  it("unblocks an attempt that older code parked for admin review after a Safaricom decline", async () => {
    const { user, caller } = await member();
    const [stuck] = await db!
      .insert(schema.paymentAttempts)
      .values({ userId: user.id, purpose: "activation", amountMinor: 10_000, phone: "254712345678", status: "verification_required", resultCode: "1", checkoutRequestId: "ws_CO_OLD" } as any)
      .returning();
    const retry = await caller.startActivation({ phone: "0712345678" });
    expect(retry.paymentId).not.toBe(stuck.id);
    expect((await payment(stuck.id)).status).toBe("failed");
  });

  it("still blocks a second payment while a confirmed payment with a receipt is being checked", async () => {
    const { user, caller } = await member();
    await db!
      .insert(schema.paymentAttempts)
      .values({ userId: user.id, purpose: "activation", amountMinor: 10_000, phone: "254712345678", status: "verification_required", resultCode: "0", receipt: "TSTRCPT", checkoutRequestId: "ws_CO_PAID" } as any);
    await expect(caller.startActivation({ phone: "0712345678" })).rejects.toThrow(/being checked/);
  });

  it("activates only after a verified success callback, never on the prompt alone", async () => {
    const { user, caller } = await member();
    const started = await caller.startActivation({ phone: "0712345678" });
    let account = (await db!.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]!;
    expect(account.activatedAt).toBeNull();
    const row = await payment(started.paymentId!);
    await processDarajaCallback(successCallback(row.checkoutRequestId!, "254712345678"));
    expect((await payment(started.paymentId!)).status).toBe("succeeded");
    account = (await db!.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]!;
    expect(account.activatedAt).not.toBeNull();
  });

  it("a late verified success still activates an attempt that had timed out as failed", async () => {
    const { user, caller } = await member();
    const started = await caller.startActivation({ phone: "0712345678" });
    const row = await payment(started.paymentId!);
    await db!.update(schema.paymentAttempts).set({ status: "failed" }).where(eq(schema.paymentAttempts.id, row.id));
    await processDarajaCallback(successCallback(row.checkoutRequestId!, "254712345678"));
    expect((await payment(row.id)).status).toBe("succeeded");
    const account = (await db!.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]!;
    expect(account.activatedAt).not.toBeNull();
  });
});
