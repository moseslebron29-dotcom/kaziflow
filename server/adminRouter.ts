import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adCampaigns,
  appSettings,
  auditEvents,
  ledgerEntries,
  paymentAttempts,
  referrals,
  supportTickets,
  taskSubmissions,
  tasks,
  users,
  wallets,
  whatsappSubmissions,
  withdrawals,
} from "../drizzle/schema";
import { adminProcedure, router, superAdminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { audit, settingValue } from "./security";
import { applyCredit } from "./ledger";
import { publicUser } from "./security";

const dbRequired = async () => {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Application data is temporarily unavailable.",
    });
  return db;
};
const categories = [
  "survey",
  "video",
  "social",
  "website",
  "microtask",
  "chat",
  "writing",
  "daily",
  "promotion",
] as const;
const taskInput = z.object({
  category: z.enum(categories),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(5).max(5000),
  instructions: z.string().trim().min(3).max(5000),
  completionRequirements: z.string().trim().min(3).max(3000),
  rewardKes: z.number().positive().max(1_000_000),
  budgetKes: z.number().int().min(1).max(100_000_000),
  estimatedMinutes: z.number().int().min(1).max(10_000),
  slotLimit: z.number().int().min(1).max(1_000_000),
  completionMode: z.enum(["manual", "video_progress", "link_visit"]),
  externalUrl: z.string().url().max(2048).optional(),
  status: z.enum(["draft", "active", "paused", "closed"]).default("draft"),
});

export const adminRouter = router({
  overview: adminProcedure.query(async () => {
    const db = await dbRequired();
    const [
      userCount,
      activatedCount,
      taskCount,
      pendingTaskCount,
      pendingAdCount,
      campaigns,
      payments,
      pendingWithdrawals,
      volume,
    ] = await Promise.all([
      db.select({ total: count() }).from(users),
      db
        .select({ total: count() })
        .from(users)
        .where(sql`${users.activatedAt} IS NOT NULL`),
      db.select({ total: count() }).from(tasks),
      db
        .select({ total: count() })
        .from(taskSubmissions)
        .where(eq(taskSubmissions.status, "pending")),
      db
        .select({ total: count() })
        .from(whatsappSubmissions)
        .where(eq(whatsappSubmissions.status, "pending")),
      db
        .select({ total: count() })
        .from(adCampaigns)
        .where(eq(adCampaigns.status, "active")),
      db
        .select({ total: count() })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.status, "verification_required")),
      db
        .select({ total: count() })
        .from(withdrawals)
        .where(eq(withdrawals.status, "pending")),
      db
        .select({
          amount: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}), 0)`,
        })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.direction, "credit"),
            sql`${ledgerEntries.kind} IN ('task_credit','ad_credit','referral_credit','daily_credit')`
          )
        ),
    ]);
    return {
      users: Number(userCount[0]?.total ?? 0),
      activatedUsers: Number(activatedCount[0]?.total ?? 0),
      tasks: Number(taskCount[0]?.total ?? 0),
      pendingTaskSubmissions: Number(pendingTaskCount[0]?.total ?? 0),
      pendingWhatsAppReviews: Number(pendingAdCount[0]?.total ?? 0),
      activeCampaigns: Number(campaigns[0]?.total ?? 0),
      paymentsToInvestigate: Number(payments[0]?.total ?? 0),
      pendingWithdrawals: Number(pendingWithdrawals[0]?.total ?? 0),
      creditedMinor: Number(volume[0]?.amount ?? 0),
    };
  }),

  users: adminProcedure
    .input(
      z.object({ query: z.string().trim().max(200).optional() }).optional()
    )
    .query(async ({ input }) => {
      const db = await dbRequired();
      const query = input?.query?.trim();
      const rows = query
        ? await db
            .select()
            .from(users)
            .where(
              or(
                like(users.email, `%${query}%`),
                like(users.name, `%${query}%`),
                like(users.phone, `%${query}%`)
              )
            )
            .orderBy(desc(users.createdAt))
            .limit(100)
        : await db
            .select()
            .from(users)
            .orderBy(desc(users.createdAt))
            .limit(100);
      return rows.map(publicUser);
    }),

  userHistory: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbRequired();
      const account = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!account[0])
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      const [ledger, payments, requests] = await Promise.all([
        db
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.userId, input.userId))
          .orderBy(desc(ledgerEntries.createdAt))
          .limit(100),
        db
          .select()
          .from(paymentAttempts)
          .where(eq(paymentAttempts.userId, input.userId))
          .orderBy(desc(paymentAttempts.createdAt))
          .limit(100),
        db
          .select()
          .from(withdrawals)
          .where(eq(withdrawals.userId, input.userId))
          .orderBy(desc(withdrawals.createdAt))
          .limit(100),
      ]);
      return {
        user: publicUser(account[0]),
        ledger,
        payments,
        withdrawals: requests,
      };
    }),

  setSuspended: adminProcedure
    .input(
      z.object({ userId: z.number().int().positive(), suspended: z.boolean() })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot suspend your own administrator account.",
        });
      const db = await dbRequired();
      const found = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!found[0])
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      if (found[0].role === "super_admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "The primary super-administrator cannot be suspended from the regular admin dashboard.",
        });
      if (found[0].role === "admin" && ctx.user.role !== "super_admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the primary super-administrator can suspend another administrator.",
        });
      await db
        .update(users)
        .set({
          suspendedAt: input.suspended ? new Date() : null,
          sessionVersion: sql`${users.sessionVersion} + 1`,
        })
        .where(eq(users.id, input.userId));
      await audit(
        ctx.user.id,
        input.suspended ? "user_suspended" : "user_unsuspended",
        "user",
        input.userId
      );
      return { success: true };
    }),

  administrators: superAdminProcedure.query(async () => {
    const db = await dbRequired();
    const rows = await db
      .select()
      .from(users)
      .where(or(eq(users.role, "admin"), eq(users.role, "super_admin")))
      .orderBy(desc(users.createdAt));
    return rows.map(publicUser);
  }),

  setAdministratorAccess: superAdminProcedure
    .input(
      z.object({ userId: z.number().int().positive(), grant: z.boolean() })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Primary administrator access cannot be changed here.",
        });
      const db = await dbRequired();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      const target = rows[0];
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      if (
        target.role === "super_admin" ||
        target.emailNormalized ===
          (process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "")
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "The configured primary super-administrator cannot be changed through delegated-admin controls.",
        });
      const role = input.grant ? "admin" : "user";
      await db
        .update(users)
        .set({ role, sessionVersion: sql`${users.sessionVersion} + 1` })
        .where(eq(users.id, target.id));
      await audit(
        ctx.user.id,
        input.grant ? "administrator_granted" : "administrator_revoked",
        "user",
        target.id
      );
      return { success: true, role };
    }),

  tasks: adminProcedure.query(async () => {
    const db = await dbRequired();
    return db.select().from(tasks).orderBy(desc(tasks.createdAt)).limit(500);
  }),

  createTask: adminProcedure
    .input(taskInput)
    .mutation(async ({ ctx, input }) => {
      if (
        Math.round(input.rewardKes * 100) * input.slotLimit >
        input.budgetKes * 100
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The task budget must cover the reward for every available slot.",
        });
      const db = await dbRequired();
      const result = await db
        .insert(tasks)
        .values({
          category: input.category,
          title: input.title,
          description: input.description,
          instructions: input.instructions,
          completionRequirements: input.completionRequirements,
          rewardMinor: Math.round(input.rewardKes * 100),
          budgetMinor: input.budgetKes * 100,
          spentMinor: 0,
          estimatedMinutes: input.estimatedMinutes,
          slotLimit: input.slotLimit,
          slotsTaken: 0,
          completionMode: input.completionMode,
          externalUrl: input.externalUrl ?? null,
          status: input.status,
          createdById: ctx.user.id,
        });
      const id = Number((result as any)?.[0]?.insertId);
      await audit(ctx.user.id, "task_created", "task", id);
      return { id };
    }),

  updateTask: adminProcedure
    .input(z.object({ id: z.number().int().positive(), ...taskInput.shape }))
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      const found = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, input.id))
        .limit(1);
      if (!found[0])
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      if (
        input.budgetKes * 100 <
        found[0].spentMinor +
          Math.round(input.rewardKes * 100) *
            Math.max(input.slotLimit, found[0].slotsTaken)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Budget must cover approved rewards and remaining available slots.",
        });
      await db
        .update(tasks)
        .set({
          category: input.category,
          title: input.title,
          description: input.description,
          instructions: input.instructions,
          completionRequirements: input.completionRequirements,
          rewardMinor: Math.round(input.rewardKes * 100),
          budgetMinor: input.budgetKes * 100,
          estimatedMinutes: input.estimatedMinutes,
          slotLimit: Math.max(input.slotLimit, found[0].slotsTaken),
          completionMode: input.completionMode,
          externalUrl: input.externalUrl ?? null,
          status: input.status,
        })
        .where(eq(tasks.id, input.id));
      await audit(ctx.user.id, "task_updated", "task", input.id, {
        status: input.status,
      });
      return { success: true };
    }),

  deleteTask: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      // Preserve submission/audit history: deletion is a soft close in the task marketplace.
      await db
        .update(tasks)
        .set({ status: "closed" })
        .where(eq(tasks.id, input.id));
      await audit(ctx.user.id, "task_closed", "task", input.id);
      return { success: true };
    }),

  taskSubmissions: adminProcedure
    .input(
      z
        .object({
          status: z.enum(["pending", "approved", "rejected"]).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await dbRequired();
      const rows = input?.status
        ? await db
            .select({
              submission: taskSubmissions,
              taskTitle: tasks.title,
              memberName: users.name,
              memberEmail: users.email,
            })
            .from(taskSubmissions)
            .leftJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
            .leftJoin(users, eq(users.id, taskSubmissions.userId))
            .where(eq(taskSubmissions.status, input.status))
            .orderBy(desc(taskSubmissions.submittedAt))
            .limit(300)
        : await db
            .select({
              submission: taskSubmissions,
              taskTitle: tasks.title,
              memberName: users.name,
              memberEmail: users.email,
            })
            .from(taskSubmissions)
            .leftJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
            .leftJoin(users, eq(users.id, taskSubmissions.userId))
            .orderBy(desc(taskSubmissions.submittedAt))
            .limit(300);
      return rows.map(row => ({
        ...row,
        evidenceUrl: row.submission.evidenceAssetId
          ? `/api/evidence?id=${row.submission.evidenceAssetId}`
          : null,
      }));
    }),

  reviewTaskSubmission: adminProcedure
    .input(
      z.object({
        submissionId: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(3000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.decision === "rejected" && !input.note?.trim())
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide a reason when rejecting a task submission.",
        });
      const db = await dbRequired();
      await db.transaction(async tx => {
        const rows = await tx
          .select()
          .from(taskSubmissions)
          .where(eq(taskSubmissions.id, input.submissionId))
          .limit(1)
          .for("update");
        const submission = rows[0];
        if (!submission || submission.status !== "pending")
          throw new TRPCError({
            code: "CONFLICT",
            message: "This submission is no longer pending review.",
          });
        const taskRows = await tx
          .select()
          .from(tasks)
          .where(eq(tasks.id, submission.taskId))
          .limit(1)
          .for("update");
        const task = taskRows[0];
        const title = task?.title ?? "Task";
        if (
          input.decision === "approved" &&
          (!task || task.spentMinor + submission.rewardMinor > task.budgetMinor)
        )
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "The approved task reward pool does not have enough remaining allocated funds.",
          });
        const walletRows = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, submission.userId))
          .limit(1)
          .for("update");
        if (walletRows[0])
          await tx
            .update(wallets)
            .set({
              pendingMinor: sql`greatest(0, ${wallets.pendingMinor} - ${submission.rewardMinor})`,
            })
            .where(eq(wallets.userId, submission.userId));
        await tx
          .update(taskSubmissions)
          .set({
            status: input.decision,
            reviewerId: ctx.user.id,
            reviewNote: input.note ?? null,
            reviewedAt: new Date(),
          })
          .where(eq(taskSubmissions.id, submission.id));
        if (input.decision === "approved") {
          if (task)
            await tx
              .update(tasks)
              .set({
                spentMinor: sql`${tasks.spentMinor} + ${submission.rewardMinor}`,
              })
              .where(eq(tasks.id, task.id));
          await applyCredit(tx, {
            userId: submission.userId,
            amountMinor: submission.rewardMinor,
            kind: "task_credit",
            key: `task-submission:${submission.id}`,
            referenceType: "task_submission",
            referenceId: submission.id,
            note: title.slice(0, 200),
          });
        } else if (task) {
          await tx
            .update(tasks)
            .set({ slotsTaken: sql`greatest(0, ${tasks.slotsTaken} - 1)` })
            .where(eq(tasks.id, task.id));
        }
      });
      await audit(
        ctx.user.id,
        `task_submission_${input.decision}`,
        "task_submission",
        input.submissionId,
        { note: input.note ?? null }
      );
      return { success: true };
    }),

  whatsappSubmissions: adminProcedure
    .input(
      z
        .object({
          status: z.enum(["pending", "approved", "rejected"]).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await dbRequired();
      const rows = await db
        .select({
          submission: whatsappSubmissions,
          campaign: adCampaigns,
          member: users,
        })
        .from(whatsappSubmissions)
        .leftJoin(
          adCampaigns,
          eq(adCampaigns.id, whatsappSubmissions.campaignId)
        )
        .leftJoin(users, eq(users.id, whatsappSubmissions.userId))
        .orderBy(desc(whatsappSubmissions.submittedAt))
        .limit(300);
      const filtered = input?.status
        ? rows.filter(row => row.submission.status === input.status)
        : rows;
      return filtered.map(row => ({
        ...row,
        statusScreenshotUrl: `/api/evidence?id=${row.submission.statusScreenshotAssetId}`,
        insightsScreenshotUrl: `/api/evidence?id=${row.submission.insightsScreenshotAssetId}`,
        member: row.member ? publicUser(row.member) : null,
      }));
    }),

  reviewWhatsappSubmission: adminProcedure
    .input(
      z.object({
        submissionId: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
        eligibleViews: z.number().int().min(0).max(10_000_000).optional(),
        note: z.string().trim().max(3000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      let rewardMinor = 0;
      let payableViews = 0;
      let finalDecision: "approved" | "rejected" = input.decision;
      let reviewNote = input.note ?? null;
      if (input.decision === "rejected" && !input.note?.trim())
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide a reason when rejecting ad evidence.",
        });
      await db.transaction(async tx => {
        const submissions = await tx
          .select()
          .from(whatsappSubmissions)
          .where(eq(whatsappSubmissions.id, input.submissionId))
          .limit(1)
          .for("update");
        const submission = submissions[0];
        if (!submission || submission.status !== "pending")
          throw new TRPCError({
            code: "CONFLICT",
            message: "This evidence is no longer pending review.",
          });
        const campaigns = await tx
          .select()
          .from(adCampaigns)
          .where(eq(adCampaigns.id, submission.campaignId))
          .limit(1)
          .for("update");
        const campaign = campaigns[0];
        if (!campaign)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found.",
          });
        if (finalDecision === "approved") {
          const eligibleViews = input.eligibleViews ?? submission.reportedViews;
          if (eligibleViews > submission.reportedViews)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Eligible views cannot exceed the member-reported view count.",
            });
          const expiresAt =
            (campaign.activeAt ?? campaign.createdAt).getTime() +
            campaign.durationDays * 86_400_000;
          if (eligibleViews < campaign.minimumViews) {
            finalDecision = "rejected";
            reviewNote =
              reviewNote ?? "Eligible views are below the campaign minimum.";
          } else if (Date.now() > expiresAt || campaign.status === "closed") {
            finalDecision = "rejected";
            reviewNote = reviewNote ?? "Campaign has ended.";
          } else {
            const remaining = Math.max(
              0,
              Math.min(
                campaign.budgetMinor - campaign.spentMinor,
                campaign.fundedMinor - campaign.spentMinor
              )
            );
            payableViews = Math.min(
              eligibleViews,
              campaign.maximumPayableViews,
              campaign.rateMinor > 0
                ? Math.floor(remaining / campaign.rateMinor)
                : 0
            );
            if (payableViews < campaign.minimumViews) {
              finalDecision = "rejected";
              reviewNote =
                reviewNote ??
                "Insufficient campaign budget remains to pay the minimum eligible views.";
            } else rewardMinor = payableViews * campaign.rateMinor;
          }
        }
        const walletRows = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, submission.userId))
          .limit(1)
          .for("update");
        if (walletRows[0] && submission.rewardMinor > 0)
          await tx
            .update(wallets)
            .set({
              pendingMinor: sql`greatest(0, ${wallets.pendingMinor} - ${submission.rewardMinor})`,
            })
            .where(eq(wallets.userId, submission.userId));
        await tx
          .update(whatsappSubmissions)
          .set({
            status: finalDecision,
            reviewerId: ctx.user.id,
            reviewNote,
            reviewedAt: new Date(),
            eligibleViews: finalDecision === "approved" ? payableViews : 0,
            rewardMinor: finalDecision === "approved" ? rewardMinor : 0,
          })
          .where(eq(whatsappSubmissions.id, submission.id));
        if (finalDecision === "approved") {
          await tx
            .update(adCampaigns)
            .set({
              spentMinor: sql`${adCampaigns.spentMinor} + ${rewardMinor}`,
            })
            .where(eq(adCampaigns.id, campaign.id));
          await applyCredit(tx, {
            userId: submission.userId,
            amountMinor: rewardMinor,
            kind: "ad_credit",
            key: `whatsapp-submission:${submission.id}`,
            referenceType: "whatsapp_submission",
            referenceId: submission.id,
            note: `Administrator-approved eligible views: ${payableViews}`,
          });
        }
      });
      const result = {
        success: true,
        rewardMinor,
        eligibleViews: payableViews,
      };
      await audit(
        ctx.user.id,
        `whatsapp_submission_${finalDecision}`,
        "whatsapp_submission",
        input.submissionId,
        { note: reviewNote, rewardMinor, eligibleViews: payableViews }
      );
      return result;
    }),

  campaigns: adminProcedure.query(async () => {
    const db = await dbRequired();
    return db
      .select()
      .from(adCampaigns)
      .orderBy(desc(adCampaigns.createdAt))
      .limit(300);
  }),

  reviewCampaign: adminProcedure
    .input(
      z.object({
        campaignId: z.number().int().positive(),
        decision: z.enum(["active", "paused", "closed"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      const rows = await db
        .select()
        .from(adCampaigns)
        .where(eq(adCampaigns.id, input.campaignId))
        .limit(1);
      const campaign = rows[0];
      if (!campaign)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found.",
        });
      if (
        input.decision === "active" &&
        campaign.fundedMinor < campaign.budgetMinor
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Campaign must be fully funded before activation.",
        });
      await db
        .update(adCampaigns)
        .set({
          status: input.decision,
          activeAt:
            input.decision === "active"
              ? (campaign.activeAt ?? new Date())
              : campaign.activeAt,
        })
        .where(eq(adCampaigns.id, campaign.id));
      await audit(
        ctx.user.id,
        "campaign_status_changed",
        "campaign",
        campaign.id,
        { status: input.decision }
      );
      return { success: true };
    }),

  payments: adminProcedure
    .input(
      z
        .object({
          status: z
            .enum([
              "pending",
              "callback_received",
              "succeeded",
              "failed",
              "verification_required",
            ])
            .optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await dbRequired();
      const rows = await db
        .select({
          payment: paymentAttempts,
          userName: users.name,
          email: users.email,
        })
        .from(paymentAttempts)
        .leftJoin(users, eq(users.id, paymentAttempts.userId))
        .orderBy(desc(paymentAttempts.createdAt))
        .limit(300);
      return input?.status
        ? rows.filter(row => row.payment.status === input.status)
        : rows;
    }),

  investigatePayment: adminProcedure
    .input(
      z.object({
        paymentId: z.number().int().positive(),
        note: z.string().trim().min(5).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      const rows = await db
        .select({ id: paymentAttempts.id })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, input.paymentId))
        .limit(1);
      if (!rows.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment attempt not found.",
        });
      await db
        .update(paymentAttempts)
        .set({ adminNote: input.note })
        .where(eq(paymentAttempts.id, input.paymentId));
      await audit(
        ctx.user.id,
        "payment_investigation_note",
        "payment",
        input.paymentId,
        { note: input.note }
      );
      return { success: true };
    }),

  withdrawals: adminProcedure
    .input(
      z
        .object({
          status: z
            .enum(["pending", "processing", "paid", "rejected"])
            .optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await dbRequired();
      const rows = await db
        .select({
          withdrawal: withdrawals,
          userName: users.name,
          email: users.email,
        })
        .from(withdrawals)
        .leftJoin(users, eq(users.id, withdrawals.userId))
        .orderBy(desc(withdrawals.createdAt))
        .limit(300);
      return input?.status
        ? rows.filter(row => row.withdrawal.status === input.status)
        : rows;
    }),

  processWithdrawal: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        decision: z.enum(["processing", "rejected"]),
        note: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      if (input.decision === "rejected" && !input.note?.trim())
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide a reason before rejecting a withdrawal.",
        });
      await db.transaction(async tx => {
        const rows = await tx
          .select()
          .from(withdrawals)
          .where(eq(withdrawals.id, input.id))
          .limit(1)
          .for("update");
        const request = rows[0];
        if (!request || ["paid", "rejected"].includes(request.status))
          throw new TRPCError({
            code: "CONFLICT",
            message: "This withdrawal is already finalized or unavailable.",
          });
        if (input.decision === "processing" && request.status !== "pending")
          throw new TRPCError({
            code: "CONFLICT",
            message: "Only pending withdrawals can move to processing.",
          });
        if (input.decision === "rejected") {
          const walletRows = await tx
            .select()
            .from(wallets)
            .where(eq(wallets.userId, request.userId))
            .limit(1)
            .for("update");
          if (!walletRows[0])
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Wallet not found for withdrawal.",
            });
          await tx
            .update(wallets)
            .set({
              availableMinor: sql`${wallets.availableMinor} + ${request.amountMinor}`,
            })
            .where(eq(wallets.userId, request.userId));
          await tx
            .insert(ledgerEntries)
            .values({
              userId: request.userId,
              kind: "withdrawal_release",
              amountMinor: request.amountMinor,
              direction: "credit",
              idempotencyKey: `withdrawal-release:${request.id}`,
              referenceType: "withdrawal",
              referenceId: request.id,
              note: "Reserved funds released after rejection",
            });
        }
        await tx
          .update(withdrawals)
          .set({
            status: input.decision,
            adminNote: input.note ?? request.adminNote,
            reviewedById: ctx.user.id,
            paidAt: null,
          })
          .where(eq(withdrawals.id, request.id));
        await tx
          .insert(auditEvents)
          .values({
            actorId: ctx.user.id,
            action: `withdrawal_${input.decision}`,
            targetType: "withdrawal",
            targetId: request.id,
            detailsText: JSON.stringify({ note: input.note ?? null }),
          });
      });
      return { success: true, status: input.decision };
    }),

  settings: adminProcedure.query(async () => {
    const keys = [
      "activationFeeMinor|10000",
      "minimumWithdrawalMinor|10000",
      "withdrawalFeeMinor|0",
      "referralCommissionMinor|0",
      "announcement|",
      "maximumWithdrawalMinor|5000000",
      "dailyWithdrawalLimitMinor|10000000",
      "minimumCampaignBudgetMinor|10000",
      "maximumCampaignRateMinor|100000",
      "maximumCampaignDays|90",
      "maximumCampaignParticipants|100000",
    ];
    const vals = await Promise.all(
      keys.map(item => {
        const [key, fallback] = item.split("|");
        return settingValue(key!, fallback!);
      })
    );
    return {
      activationFeeKes: Number(vals[0]) / 100,
      minimumWithdrawalKes: Number(vals[1]) / 100,
      withdrawalFeeKes: Number(vals[2]) / 100,
      referralCommissionKes: Number(vals[3]) / 100,
      announcement: vals[4],
      maximumWithdrawalKes: Number(vals[5]) / 100,
      dailyWithdrawalLimitKes: Number(vals[6]) / 100,
      minimumCampaignBudgetKes: Number(vals[7]) / 100,
      maximumCampaignRateKes: Number(vals[8]) / 100,
      maximumCampaignDays: Number(vals[9]),
      maximumCampaignParticipants: Number(vals[10]),
    };
  }),

  updateSettings: adminProcedure
    .input(
      z.object({
        activationFeeKes: z.number().int().min(100).max(100_000),
        minimumWithdrawalKes: z.number().int().min(1).max(1_000_000),
        withdrawalFeeKes: z.number().int().min(0).max(100_000),
        referralCommissionKes: z.number().int().min(0).max(100_000),
        announcement: z.string().trim().max(1000),
        maximumWithdrawalKes: z.number().int().min(1).max(5_000_000),
        dailyWithdrawalLimitKes: z.number().int().min(1).max(10_000_000),
        minimumCampaignBudgetKes: z.number().int().min(100).max(100_000_000),
        maximumCampaignRateKes: z.number().int().min(1).max(100_000),
        maximumCampaignDays: z.number().int().min(1).max(90),
        maximumCampaignParticipants: z.number().int().min(1).max(100_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      const values: Record<string, string> = {
        activationFeeMinor: String(input.activationFeeKes * 100),
        minimumWithdrawalMinor: String(input.minimumWithdrawalKes * 100),
        withdrawalFeeMinor: String(input.withdrawalFeeKes * 100),
        referralCommissionMinor: String(input.referralCommissionKes * 100),
        announcement: input.announcement,
        maximumWithdrawalMinor: String(input.maximumWithdrawalKes * 100),
        dailyWithdrawalLimitMinor: String(input.dailyWithdrawalLimitKes * 100),
        minimumCampaignBudgetMinor: String(
          input.minimumCampaignBudgetKes * 100
        ),
        maximumCampaignRateMinor: String(input.maximumCampaignRateKes * 100),
        maximumCampaignDays: String(input.maximumCampaignDays),
        maximumCampaignParticipants: String(input.maximumCampaignParticipants),
      };
      for (const [key, valueText] of Object.entries(values))
        await db
          .insert(appSettings)
          .values({ settingKey: key, valueText, updatedById: ctx.user.id })
          .onDuplicateKeyUpdate({
            set: { valueText, updatedById: ctx.user.id, updatedAt: new Date() },
          });
      await audit(ctx.user.id, "settings_updated", "settings", null, values);
      return { success: true };
    }),

  supportTickets: adminProcedure
    .input(
      z
        .object({
          status: z.enum(["open", "answered", "closed", "all"]).default("open"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await dbRequired();
      const rows = await db
        .select({
          ticket: supportTickets,
          userName: users.name,
          email: users.email,
        })
        .from(supportTickets)
        .leftJoin(users, eq(users.id, supportTickets.userId))
        .orderBy(desc(supportTickets.createdAt))
        .limit(300);
      return input?.status && input.status !== "all"
        ? rows.filter(row => row.ticket.status === input.status)
        : rows;
    }),

  respondSupportTicket: adminProcedure
    .input(
      z.object({
        ticketId: z.number().int().positive(),
        reply: z.string().trim().min(5).max(5000),
        status: z.enum(["answered", "closed"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      const rows = await db
        .select({ id: supportTickets.id })
        .from(supportTickets)
        .where(eq(supportTickets.id, input.ticketId))
        .limit(1);
      if (!rows.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Support request not found.",
        });
      await db
        .update(supportTickets)
        .set({
          adminReply: input.reply,
          status: input.status,
          assignedToId: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, input.ticketId));
      await audit(
        ctx.user.id,
        "support_ticket_responded",
        "support_ticket",
        input.ticketId,
        { status: input.status }
      );
      return { success: true };
    }),

  auditEvents: adminProcedure.query(async () => {
    const db = await dbRequired();
    return db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(200);
  }),
});
