import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adCampaigns,
  ledgerEntries,
  paymentAttempts,
  referrals,
  supportTickets,
  taskAttempts,
  taskSubmissions,
  tasks,
  uploadedAssets,
  users,
  wallets,
  whatsappSubmissions,
  withdrawals,
} from "../drizzle/schema";
import {
  advertiserProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { getDb } from "./db";
import { audit, limitRequest, settingValue } from "./security";
import { uploadImage } from "./uploads";
import { darajaReady, initiateStkPush, normalizeKenyanPhone } from "./daraja";

const dbRequired = async () => {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Application data is temporarily unavailable.",
    });
  return db;
};
const memberRequired = (ctxUser: typeof users.$inferSelect) => {
  if (ctxUser.accountType !== "member")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action is for member accounts.",
    });
  if (ctxUser.suspendedAt)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This account is suspended.",
    });
};

export const memberRouter = router({
  activationStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const payments = await db
      .select()
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.userId, ctx.user.id),
          eq(paymentAttempts.purpose, "activation")
        )
      )
      .orderBy(desc(paymentAttempts.createdAt))
      .limit(10);
    return {
      activated: Boolean(ctx.user.activatedAt),
      feeKes: Math.max(
        1,
        Number(await settingValue("activationFeeMinor", "10000")) / 100 || 100
      ),
      darajaReady: darajaReady(),
      payments: payments.map(
        ({ resultDescription: _description, ...payment }) => payment
      ),
    };
  }),

  startActivation: protectedProcedure
    .input(z.object({ phone: z.string().trim().min(8).max(24) }))
    .mutation(async ({ ctx, input }) => {
      memberRequired(ctx.user);
      if (!darajaReady())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Safaricom Daraja credentials and a public HTTPS callback URL must be configured before activation payments can be accepted.",
        });
      const db = await dbRequired();
      let phone: string;
      try {
        phone = normalizeKenyanPhone(input.phone);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid M-Pesa number.",
        });
      }
      const feeMinor = Math.max(
        10_000,
        Number(await settingValue("activationFeeMinor", "10000")) || 10_000
      );
      if (feeMinor % 100 !== 0)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Activation fee must be configured as a whole KES amount.",
        });
      try {
        limitRequest(ctx.req, `activation:${ctx.user.id}`, 5, 60 * 60_000);
      } catch {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Too many activation payment attempts. Please wait before trying again.",
        });
      }
      const paymentId = await db.transaction(async tx => {
        const accountRows = await tx
          .select()
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1)
          .for("update");
        const account = accountRows[0];
        if (!account || account.suspendedAt)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This account cannot start an activation payment.",
          });
        if (account.activatedAt) return null;
        const previous = await tx
          .select()
          .from(paymentAttempts)
          .where(
            and(
              eq(paymentAttempts.userId, ctx.user.id),
              eq(paymentAttempts.purpose, "activation")
            )
          )
          .orderBy(desc(paymentAttempts.createdAt))
          .limit(1)
          .for("update");
        if (
          previous[0] &&
          ["pending", "callback_received", "verification_required"].includes(
            previous[0].status
          )
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An activation payment already needs a result or administrator review. Please do not pay again.",
          });
        if (
          previous[0] &&
          previous[0].createdAt > new Date(Date.now() - 60_000) &&
          previous[0].status === "failed"
        )
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Wait one minute before retrying a failed activation prompt.",
          });
        await tx
          .update(users)
          .set({ mpesaPhone: phone })
          .where(eq(users.id, ctx.user.id));
        const inserted = await tx
          .insert(paymentAttempts)
          .values({
            userId: ctx.user.id,
            purpose: "activation",
            amountMinor: feeMinor,
            phone,
            status: "pending",
          });
        return Number((inserted as any)?.[0]?.insertId);
      });
      if (!paymentId)
        return {
          alreadyActivated: true as const,
          status: "succeeded" as const,
        };
      try {
        const response = await initiateStkPush({
          paymentId,
          phone,
          amountMinor: feeMinor,
          description: "Account activation",
        });
        await db
          .update(paymentAttempts)
          .set({
            checkoutRequestId: response.checkoutRequestId,
            merchantRequestId: response.merchantRequestId,
          })
          .where(eq(paymentAttempts.id, paymentId));
        await audit(
          ctx.user.id,
          "activation_payment_started",
          "payment",
          paymentId,
          { amountMinor: feeMinor }
        );
        return {
          alreadyActivated: false as const,
          paymentId,
          status: "pending" as const,
          message: response.customerMessage,
        };
      } catch (error) {
        await db
          .update(paymentAttempts)
          .set({
            status: "verification_required",
            resultDescription:
              "The STK response could not be confirmed. No account credit was made; administrator reconciliation is required before another prompt.",
          })
          .where(eq(paymentAttempts.id, paymentId));
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            "The M-Pesa prompt could not be confirmed. Your account was not activated; contact support before retrying so a possible charge can be reconciled.",
        });
      }
    }),

  tasks: publicProcedure
    .input(
      z
        .object({
          category: z
            .enum([
              "survey",
              "video",
              "social",
              "website",
              "microtask",
              "chat",
              "writing",
              "daily",
              "promotion",
            ])
            .optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await dbRequired();
      const q = db
        .select()
        .from(tasks)
        .where(eq(tasks.status, "active"))
        .orderBy(desc(tasks.createdAt));
      const rows = await q;
      return rows
        .filter(
          task =>
            task.slotsTaken < task.slotLimit &&
            task.spentMinor + task.rewardMinor <= task.budgetMinor &&
            (!input?.category || task.category === input.category)
        )
        .map(({ createdById: _creator, ...task }) => task);
    }),

  startTask: protectedProcedure
    .input(z.object({ taskId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      memberRequired(ctx.user);
      const db = await dbRequired();
      if (!ctx.user.activatedAt)
        return { needsActivation: true as const, task: null };
      try {
        limitRequest(ctx.req, `task-start:${ctx.user.id}`, 30, 10 * 60_000);
      } catch {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many task starts. Please wait before trying again.",
        });
      }
      const started = await db.transaction(async tx => {
        const rows = await tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, input.taskId), eq(tasks.status, "active")))
          .limit(1)
          .for("update");
        const task = rows[0];
        if (!task || task.spentMinor + task.rewardMinor > task.budgetMinor)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This task is no longer available.",
          });
        const previous = await tx
          .select({ id: taskSubmissions.id })
          .from(taskSubmissions)
          .where(
            and(
              eq(taskSubmissions.taskId, input.taskId),
              eq(taskSubmissions.userId, ctx.user.id)
            )
          )
          .limit(1);
        if (previous.length)
          throw new TRPCError({
            code: "CONFLICT",
            message: "You have already submitted this task.",
          });
        const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
        const existing = await tx
          .select()
          .from(taskAttempts)
          .where(
            and(
              eq(taskAttempts.taskId, task.id),
              eq(taskAttempts.userId, ctx.user.id),
              sql`${taskAttempts.submittedAt} IS NULL`,
              gte(taskAttempts.startedAt, cutoff)
            )
          )
          .orderBy(desc(taskAttempts.startedAt))
          .limit(1);
        if (existing[0])
          return {
            task,
            attemptId: existing[0].id,
            startedAt: existing[0].startedAt.toISOString(),
          };
        const active = await tx
          .select({ total: count() })
          .from(taskAttempts)
          .where(
            and(
              eq(taskAttempts.taskId, task.id),
              sql`${taskAttempts.submittedAt} IS NULL`,
              gte(taskAttempts.startedAt, cutoff)
            )
          );
        if (task.slotsTaken + Number(active[0]?.total ?? 0) >= task.slotLimit)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "All remaining task slots are already reserved by active submissions.",
          });
        const result = await tx
          .insert(taskAttempts)
          .values({ taskId: task.id, userId: ctx.user.id });
        const attemptId = Number((result as any)?.[0]?.insertId);
        const attemptRows = await tx
          .select()
          .from(taskAttempts)
          .where(eq(taskAttempts.id, attemptId))
          .limit(1);
        return {
          task,
          attemptId,
          startedAt:
            attemptRows[0]?.startedAt.toISOString() ?? new Date().toISOString(),
        };
      });
      return { needsActivation: false as const, ...started };
    }),

  submitTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int().positive(),
        attemptId: z.number().int().positive(),
        proofText: z.string().trim().min(3).max(5000),
        evidenceAssetId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      memberRequired(ctx.user);
      if (!ctx.user.activatedAt)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Activate your account before submitting tasks.",
        });
      const db = await dbRequired();
      if (input.evidenceAssetId) {
        const owned = await db
          .select({ id: uploadedAssets.id })
          .from(uploadedAssets)
          .where(
            and(
              eq(uploadedAssets.id, input.evidenceAssetId),
              eq(uploadedAssets.userId, ctx.user.id),
              eq(uploadedAssets.purpose, "evidence")
            )
          )
          .limit(1);
        if (!owned.length)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The evidence upload could not be validated.",
          });
      }
      let submissionId = 0;
      await db
        .transaction(async tx => {
          const attempts = await tx
            .select()
            .from(taskAttempts)
            .where(
              and(
                eq(taskAttempts.id, input.attemptId),
                eq(taskAttempts.taskId, input.taskId),
                eq(taskAttempts.userId, ctx.user.id)
              )
            )
            .limit(1)
            .for("update");
          const attempt = attempts[0];
          if (!attempt || attempt.submittedAt)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Start this task again before submitting.",
            });
          if (attempt.startedAt.getTime() < Date.now() - 24 * 60 * 60_000)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "This task attempt expired. Start a new attempt before submitting.",
            });
          const rows = await tx
            .select()
            .from(tasks)
            .where(eq(tasks.id, input.taskId))
            .limit(1)
            .for("update");
          const task = rows[0];
          if (
            !task ||
            task.status !== "active" ||
            task.slotsTaken >= task.slotLimit
          )
            throw new TRPCError({
              code: "CONFLICT",
              message: "This task is no longer accepting submissions.",
            });
          const elapsedSeconds = Math.floor(
            (Date.now() - attempt.startedAt.getTime()) / 1000
          );
          if (elapsedSeconds < task.estimatedMinutes * 60)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Please spend at least ${task.estimatedMinutes} minute(s) on this task before submitting.`,
            });
          const result = await tx
            .insert(taskSubmissions)
            .values({
              taskId: task.id,
              userId: ctx.user.id,
              attemptId: attempt.id,
              proofText: input.proofText,
              evidenceAssetId: input.evidenceAssetId ?? null,
              watchedSeconds:
                task.completionMode === "video_progress"
                  ? elapsedSeconds
                  : null,
              status: "pending",
              rewardMinor: task.rewardMinor,
            });
          submissionId = Number((result as any)?.[0]?.insertId);
          await tx
            .update(taskAttempts)
            .set({ submittedAt: new Date() })
            .where(eq(taskAttempts.id, attempt.id));
          await tx
            .update(tasks)
            .set({ slotsTaken: sql`${tasks.slotsTaken} + 1` })
            .where(eq(tasks.id, task.id));
          await tx
            .update(wallets)
            .set({
              pendingMinor: sql`${wallets.pendingMinor} + ${task.rewardMinor}`,
            })
            .where(eq(wallets.userId, ctx.user.id));
        })
        .catch(error => {
          if ((error as { code?: string })?.code === "ER_DUP_ENTRY")
            throw new TRPCError({
              code: "CONFLICT",
              message: "You have already submitted this task.",
            });
          throw error;
        });
      await audit(
        ctx.user.id,
        "task_submitted",
        "task_submission",
        submissionId,
        { taskId: input.taskId }
      );
      return {
        id: submissionId,
        status: "pending" as const,
        message: "Submission received for review.",
      };
    }),

  mySubmissions: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const [taskRows, adRows] = await Promise.all([
      db
        .select({
          id: taskSubmissions.id,
          taskId: taskSubmissions.taskId,
          title: tasks.title,
          category: tasks.category,
          rewardMinor: taskSubmissions.rewardMinor,
          status: taskSubmissions.status,
          submittedAt: taskSubmissions.submittedAt,
          reviewNote: taskSubmissions.reviewNote,
        })
        .from(taskSubmissions)
        .leftJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
        .where(eq(taskSubmissions.userId, ctx.user.id))
        .orderBy(desc(taskSubmissions.submittedAt))
        .limit(100),
      db
        .select({
          id: whatsappSubmissions.id,
          campaignId: whatsappSubmissions.campaignId,
          title: adCampaigns.title,
          eligibleViews: whatsappSubmissions.eligibleViews,
          rewardMinor: whatsappSubmissions.rewardMinor,
          status: whatsappSubmissions.status,
          submittedAt: whatsappSubmissions.submittedAt,
          reviewNote: whatsappSubmissions.reviewNote,
        })
        .from(whatsappSubmissions)
        .leftJoin(
          adCampaigns,
          eq(adCampaigns.id, whatsappSubmissions.campaignId)
        )
        .where(eq(whatsappSubmissions.userId, ctx.user.id))
        .orderBy(desc(whatsappSubmissions.submittedAt))
        .limit(100),
    ]);
    return { tasks: taskRows, whatsappAds: adRows };
  }),

  uploadEvidence: protectedProcedure
    .input(
      z.object({
        mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
        base64: z.string().max(4_200_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      memberRequired(ctx.user);
      if (!ctx.user.activatedAt)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Activate your account before uploading task evidence.",
        });
      try {
        const asset = await uploadImage({
          userId: ctx.user.id,
          purpose: "evidence",
          ...input,
        });
        return {
          assetId: asset.assetId,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes,
        };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "The evidence could not be uploaded.",
        });
      }
    }),

  whatsappCampaigns: protectedProcedure.query(async ({ ctx }) => {
    memberRequired(ctx.user);
    if (!ctx.user.activatedAt)
      return { requiresActivation: true as const, campaigns: [] };
    const db = await dbRequired();
    const rows = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns.status, "active"))
      .orderBy(desc(adCampaigns.createdAt))
      .limit(100);
    const output = [];
    for (const campaign of rows) {
      const counts = await db
        .select({ total: count() })
        .from(whatsappSubmissions)
        .where(eq(whatsappSubmissions.campaignId, campaign.id));
      const activeAt = campaign.activeAt ?? campaign.createdAt;
      if (
        campaign.fundedMinor < campaign.budgetMinor ||
        campaign.spentMinor >= campaign.budgetMinor ||
        Date.now() > activeAt.getTime() + campaign.durationDays * 86_400_000 ||
        Number(counts[0]?.total ?? 0) >= campaign.participantLimit
      )
        continue;
      output.push({
        ...campaign,
        mediaUrl: campaign.mediaKey
          ? `/manus-storage/${campaign.mediaKey}`
          : null,
        participants: Number(counts[0]?.total ?? 0),
        evidenceNotice:
          "View counts are submitted by members in screenshots and are reviewed by an administrator; screenshots are not independent verification of each viewer.",
      });
    }
    return { requiresActivation: false as const, campaigns: output };
  }),

  submitWhatsappAd: protectedProcedure
    .input(
      z.object({
        campaignId: z.number().int().positive(),
        campaignReference: z.string().trim().min(2).max(32),
        postedAt: z.string().datetime(),
        reportedViews: z.number().int().min(0).max(10_000_000),
        statusScreenshotAssetId: z.number().int().positive(),
        insightsScreenshotAssetId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      memberRequired(ctx.user);
      if (!ctx.user.activatedAt)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Activate your account before joining campaigns.",
        });
      if (input.statusScreenshotAssetId === input.insightsScreenshotAssetId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload separate status and insights screenshots.",
        });
      const db = await dbRequired();
      const assetRows = await db
        .select()
        .from(uploadedAssets)
        .where(
          and(
            eq(uploadedAssets.userId, ctx.user.id),
            inArray(uploadedAssets.id, [
              input.statusScreenshotAssetId,
              input.insightsScreenshotAssetId,
            ]),
            eq(uploadedAssets.purpose, "evidence")
          )
        );
      if (assetRows.length !== 2)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Both screenshots must be uploaded by your account.",
        });
      const statusAsset = assetRows.find(
        asset => asset.id === input.statusScreenshotAssetId
      );
      const insightsAsset = assetRows.find(
        asset => asset.id === input.insightsScreenshotAssetId
      );
      if (
        !statusAsset ||
        !insightsAsset ||
        statusAsset.sha256 === insightsAsset.sha256
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The status and insights screenshots must be different uploaded images.",
        });
      try {
        limitRequest(
          ctx.req,
          `whatsapp-submit:${ctx.user.id}`,
          20,
          60 * 60_000
        );
      } catch {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Too many campaign submissions. Please wait before trying again.",
        });
      }
      let id = 0;
      await db
        .transaction(async tx => {
          const campaignRows = await tx
            .select()
            .from(adCampaigns)
            .where(eq(adCampaigns.id, input.campaignId))
            .limit(1)
            .for("update");
          const campaign = campaignRows[0];
          if (
            !campaign ||
            campaign.status !== "active" ||
            campaign.fundedMinor < campaign.budgetMinor ||
            campaign.spentMinor >= campaign.budgetMinor
          )
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "This funded campaign is not available.",
            });
          if (input.campaignReference !== campaign.reference)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "The campaign reference does not match.",
            });
          const activeAt = campaign.activeAt ?? campaign.createdAt;
          const expiry =
            activeAt.getTime() + campaign.durationDays * 86_400_000;
          const postedAt = new Date(input.postedAt);
          if (
            Date.now() > expiry ||
            postedAt > new Date(Date.now() + 5 * 60_000) ||
            postedAt < activeAt ||
            postedAt.getTime() > expiry
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "The campaign is outside its posting window or the submitted date is invalid.",
            });
          const duplicate = await tx
            .select({ id: whatsappSubmissions.id })
            .from(whatsappSubmissions)
            .where(
              sql`${whatsappSubmissions.statusScreenshotHash} IN (${statusAsset.sha256}, ${insightsAsset.sha256}) OR ${whatsappSubmissions.insightsScreenshotHash} IN (${statusAsset.sha256}, ${insightsAsset.sha256})`
            )
            .limit(1);
          if (duplicate.length)
            throw new TRPCError({
              code: "CONFLICT",
              message: "These screenshots have already been submitted.",
            });
          const participantCount = await tx
            .select({ total: count() })
            .from(whatsappSubmissions)
            .where(eq(whatsappSubmissions.campaignId, campaign.id));
          if (
            Number(participantCount[0]?.total ?? 0) >= campaign.participantLimit
          )
            throw new TRPCError({
              code: "CONFLICT",
              message: "This campaign has reached its participant limit.",
            });
          const eligibleEstimate =
            input.reportedViews >= campaign.minimumViews
              ? Math.min(input.reportedViews, campaign.maximumPayableViews)
              : 0;
          const budgetRemaining = Math.max(
            0,
            Math.min(
              campaign.budgetMinor - campaign.spentMinor,
              campaign.fundedMinor - campaign.spentMinor
            )
          );
          const estimatedReward = Math.min(
            eligibleEstimate * campaign.rateMinor,
            budgetRemaining
          );
          const result = await tx
            .insert(whatsappSubmissions)
            .values({
              campaignId: campaign.id,
              userId: ctx.user.id,
              campaignReference: input.campaignReference,
              postedAt,
              reportedViews: input.reportedViews,
              statusScreenshotAssetId: statusAsset.id,
              insightsScreenshotAssetId: insightsAsset.id,
              statusScreenshotHash: statusAsset.sha256,
              insightsScreenshotHash: insightsAsset.sha256,
              status: "pending",
              rewardMinor: estimatedReward,
            });
          id = Number((result as any)?.[0]?.insertId);
          if (estimatedReward > 0)
            await tx
              .update(wallets)
              .set({
                pendingMinor: sql`${wallets.pendingMinor} + ${estimatedReward}`,
              })
              .where(eq(wallets.userId, ctx.user.id));
        })
        .catch(error => {
          if ((error as { code?: string })?.code === "ER_DUP_ENTRY")
            throw new TRPCError({
              code: "CONFLICT",
              message: "You have already submitted evidence for this campaign.",
            });
          throw error;
        });
      await audit(
        ctx.user.id,
        "whatsapp_ad_submitted",
        "whatsapp_submission",
        id,
        { campaignId: input.campaignId }
      );
      return {
        id,
        status: "pending" as const,
        message:
          "Evidence submitted for administrator review. Screenshots are not independent verification of every viewer.",
      };
    }),

  wallet: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const [walletRows, taskCounts, pendingTasks, referralRows, ledger] =
      await Promise.all([
        db
          .select()
          .from(wallets)
          .where(eq(wallets.userId, ctx.user.id))
          .limit(1),
        db
          .select({ total: count() })
          .from(taskSubmissions)
          .where(
            and(
              eq(taskSubmissions.userId, ctx.user.id),
              eq(taskSubmissions.status, "approved")
            )
          ),
        db
          .select({ total: count() })
          .from(taskSubmissions)
          .where(
            and(
              eq(taskSubmissions.userId, ctx.user.id),
              eq(taskSubmissions.status, "pending")
            )
          ),
        db
          .select()
          .from(referrals)
          .where(eq(referrals.referrerId, ctx.user.id)),
        db
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.userId, ctx.user.id))
          .orderBy(desc(ledgerEntries.createdAt))
          .limit(10),
      ]);
    const wallet = walletRows[0] ?? {
      availableMinor: 0,
      pendingMinor: 0,
      lifetimeMinor: 0,
    };
    const referralEarnings = referralRows.reduce(
      (sum, row) => sum + (row.status === "credited" ? row.commissionMinor : 0),
      0
    );
    const adPending = await db
      .select({ total: count() })
      .from(whatsappSubmissions)
      .where(
        and(
          eq(whatsappSubmissions.userId, ctx.user.id),
          eq(whatsappSubmissions.status, "pending")
        )
      );
    const adApproved = await db
      .select({ total: count() })
      .from(whatsappSubmissions)
      .where(
        and(
          eq(whatsappSubmissions.userId, ctx.user.id),
          eq(whatsappSubmissions.status, "approved")
        )
      );
    return {
      availableMinor: wallet.availableMinor,
      pendingMinor: wallet.pendingMinor,
      lifetimeMinor: wallet.lifetimeMinor,
      referralEarningsMinor: referralEarnings,
      completedTasks:
        Number(taskCounts[0]?.total ?? 0) + Number(adApproved[0]?.total ?? 0),
      pendingSubmissions:
        Number(pendingTasks[0]?.total ?? 0) + Number(adPending[0]?.total ?? 0),
      recentTransactions: ledger,
    };
  }),

  withdraw: protectedProcedure
    .input(z.object({ amountKes: z.number().int().min(1).max(1_000_000) }))
    .mutation(async ({ ctx, input }) => {
      memberRequired(ctx.user);
      const db = await dbRequired();
      if (!ctx.user.activatedAt)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Activate your account before requesting a withdrawal.",
        });
      if (!ctx.user.mpesaPhone)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Add your M-Pesa number to your profile before withdrawing.",
        });
      const amountMinor = input.amountKes * 100;
      const minMinor = Math.max(
        0,
        Number(await settingValue("minimumWithdrawalMinor", "10000")) || 10000
      );
      const feeMinor = Math.max(
        0,
        Number(await settingValue("withdrawalFeeMinor", "0")) || 0
      );
      const maxMinor = Math.max(
        minMinor,
        Number(await settingValue("maximumWithdrawalMinor", "5000000")) ||
          5_000_000
      );
      const dailyLimitMinor = Math.max(
        maxMinor,
        Number(await settingValue("dailyWithdrawalLimitMinor", "10000000")) ||
          10_000_000
      );
      if (amountMinor < minMinor || amountMinor <= feeMinor)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Minimum withdrawal is KES ${(minMinor / 100).toFixed(0)}.`,
        });
      if (amountMinor > maxMinor)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum single withdrawal is KES ${(maxMinor / 100).toFixed(0)}.`,
        });
      let withdrawalId = 0;
      await db.transaction(async tx => {
        const walletRows = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, ctx.user.id))
          .limit(1)
          .for("update");
        const wallet = walletRows[0];
        if (!wallet || wallet.availableMinor < amountMinor)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Available balance is not enough for this withdrawal.",
          });
        const windowStart = new Date(Date.now() - 24 * 60 * 60_000);
        const rolling = await tx
          .select({
            total: sql<number>`coalesce(sum(${withdrawals.amountMinor}), 0)`,
          })
          .from(withdrawals)
          .where(
            and(
              eq(withdrawals.userId, ctx.user.id),
              gte(withdrawals.createdAt, windowStart),
              inArray(withdrawals.status, ["pending", "processing", "paid"])
            )
          );
        if (Number(rolling[0]?.total ?? 0) + amountMinor > dailyLimitMinor)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `This request exceeds the rolling 24-hour withdrawal limit of KES ${(dailyLimitMinor / 100).toFixed(0)}.`,
          });
        const result = await tx
          .insert(withdrawals)
          .values({
            userId: ctx.user.id,
            amountMinor,
            feeMinor,
            payoutMinor: amountMinor - feeMinor,
            mpesaPhone: normalizeKenyanPhone(ctx.user.mpesaPhone!),
            status: "pending",
          });
        withdrawalId = Number((result as any)?.[0]?.insertId);
        await tx
          .update(wallets)
          .set({
            availableMinor: sql`${wallets.availableMinor} - ${amountMinor}`,
          })
          .where(eq(wallets.userId, ctx.user.id));
        await tx
          .insert(ledgerEntries)
          .values({
            userId: ctx.user.id,
            kind: "withdrawal_hold",
            amountMinor,
            direction: "debit",
            idempotencyKey: `withdrawal-hold:${withdrawalId}`,
            referenceType: "withdrawal",
            referenceId: withdrawalId,
            note: "Funds reserved for M-Pesa withdrawal",
          });
      });
      await audit(
        ctx.user.id,
        "withdrawal_requested",
        "withdrawal",
        withdrawalId,
        { amountMinor }
      );
      return {
        id: withdrawalId,
        status: "pending" as const,
        message:
          "Withdrawal request submitted. Funds are reserved while an administrator reviews it.",
      };
    }),

  withdrawals: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    return db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, ctx.user.id))
      .orderBy(desc(withdrawals.createdAt))
      .limit(100);
  }),

  history: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    return db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, ctx.user.id))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(100);
  }),

  referrals: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const referred = await db
      .select({
        id: users.id,
        name: users.name,
        createdAt: users.createdAt,
        activatedAt: users.activatedAt,
      })
      .from(users)
      .where(eq(users.referredById, ctx.user.id))
      .orderBy(desc(users.createdAt))
      .limit(100);
    const commissions = await db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerId, ctx.user.id))
      .orderBy(desc(referrals.createdAt))
      .limit(100);
    return {
      code: ctx.user.referralCode,
      total: referred.length,
      activated: referred.filter(person => Boolean(person.activatedAt)).length,
      commissionMinor: commissions.reduce(
        (sum, item) =>
          sum + (item.status === "credited" ? item.commissionMinor : 0),
        0
      ),
      referrals: referred.map(person => ({
        id: person.id,
        name: person.name,
        joinedAt: person.createdAt,
        activated: Boolean(person.activatedAt),
      })),
      transactions: commissions,
    };
  }),

  supportTickets: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    return db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, ctx.user.id))
      .orderBy(desc(supportTickets.createdAt))
      .limit(50);
  }),

  createSupportTicket: protectedProcedure
    .input(
      z.object({
        subject: z.string().trim().min(4).max(180),
        message: z.string().trim().min(20).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        limitRequest(ctx.req, `support:${ctx.user.id}`, 3, 60 * 60_000);
      } catch {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Please wait before opening another support request.",
        });
      }
      const db = await dbRequired();
      const result = await db
        .insert(supportTickets)
        .values({
          userId: ctx.user.id,
          subject: input.subject,
          message: input.message,
          status: "open",
        });
      const id = Number((result as any)?.[0]?.insertId);
      await audit(ctx.user.id, "support_ticket_created", "support_ticket", id);
      return {
        id,
        status: "open" as const,
        message: "Your request has been saved for administrator review.",
      };
    }),
});
