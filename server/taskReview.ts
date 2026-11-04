import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { taskSubmissions, tasks, users, wallets } from "../drizzle/schema";
import { applyCredit } from "./ledger";
import { notify, templates } from "./mailer";
import { formatKesMinor } from "../shared/money";

type Tx = any;

/**
 * Approves or rejects a pending task submission inside a transaction. The ledger
 * idempotency key `task-submission:<id>` guarantees a reward is credited once.
 */
export async function decideTaskSubmission(
  tx: Tx,
  input: { submissionId: number; decision: "approved" | "rejected"; note: string | null; reviewerId: number | null }
) {
  const rows = await tx.select().from(taskSubmissions).where(eq(taskSubmissions.id, input.submissionId)).limit(1).for("update");
  const submission = rows[0] as typeof taskSubmissions.$inferSelect | undefined;
  if (!submission || submission.status !== "pending")
    throw new TRPCError({ code: "CONFLICT", message: "This submission is no longer pending review." });
  const taskRows = await tx.select().from(tasks).where(eq(tasks.id, submission.taskId)).limit(1).for("update");
  const task = taskRows[0] as typeof tasks.$inferSelect | undefined;
  const title = task?.title ?? "Task";
  if (input.decision === "approved" && (!task || task.spentMinor + submission.rewardMinor > task.budgetMinor))
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The task reward budget does not have enough remaining funds." });
  await tx
    .update(wallets)
    .set({ pendingMinor: sql`greatest(0, ${wallets.pendingMinor} - ${submission.rewardMinor})` })
    .where(eq(wallets.userId, submission.userId));
  await tx
    .update(taskSubmissions)
    .set({ status: input.decision, reviewerId: input.reviewerId, reviewNote: input.note, reviewedAt: new Date() })
    .where(eq(taskSubmissions.id, submission.id));
  if (input.decision === "approved") {
    await tx.update(tasks).set({ spentMinor: sql`${tasks.spentMinor} + ${submission.rewardMinor}` }).where(eq(tasks.id, task!.id));
    await applyCredit(tx, {
      userId: submission.userId,
      amountMinor: submission.rewardMinor,
      kind: task?.repeatDaily ? "daily_credit" : "task_credit",
      key: `task-submission:${submission.id}`,
      referenceType: "task_submission",
      referenceId: submission.id,
      note: title.slice(0, 200),
    });
  } else if (task) {
    // Rejection frees the slot for another member.
    await tx.update(tasks).set({ slotsTaken: sql`greatest(0, ${tasks.slotsTaken} - 1)` }).where(eq(tasks.id, task.id));
  }
  const member = (await tx.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, submission.userId)).limit(1))[0];
  return {
    notifyAfterCommit: () => {
      if (member?.email)
        notify({
          to: member.email,
          userId: submission.userId,
          ...templates.submissionDecision(member.name ?? "", title, input.decision === "approved", formatKesMinor(submission.rewardMinor), input.note),
        });
    },
  };
}
