import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adCampaigns,
  appSettings,
  auditEvents,
  emailLog,
  ledgerEntries,
  paymentAttempts,
  supportTickets,
  taskSubmissions,
  tasks,
  uploadedAssets,
  users,
  wallets,
  whatsappSubmissions,
  withdrawals,
} from "../drizzle/schema";
import { adminProcedure, router, superAdminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { audit, publicUser, settingValue } from "./security";
import { applyCredit } from "./ledger";
import { decideTaskSubmission } from "./taskReview";
import { COMPLETION_MODES, TASK_CATEGORY_IDS, parseQuiz } from "../shared/taskCategories";
import { formatKesMinor, whatsappReward } from "../shared/money";
import { mailerReady, notify, sendEmail, templates } from "./mailer";
import { b2cReady } from "./daraja";
import { startPayout } from "./payouts";
import { publicMediaUrl, storageDriver } from "./storage";
import { uploadImage } from "./uploads";

const dbRequired = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Application data is temporarily unavailable." });
  return db;
};
const escapeLike = (v: string) => `%${v.replace(/[\\%_]/g, "\\$&")}%`;
const optionalDate = z
  .string()
  .datetime({ offset: true })
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

const taskInput = z.object({
  category: z.enum(TASK_CATEGORY_IDS),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(5).max(5000),
  instructions: z.string().trim().min(3).max(5000),
  completionRequirements: z.string().trim().min(3).max(3000),
  rewardKes: z.number().positive().max(100_000),
  budgetKes: z.number().int().min(1).max(100_000_000),
  estimatedMinutes: z.number().int().min(1).max(10_000),
  slotLimit: z.number().int().min(1).max(1_000_000),
  completionMode: z.enum(COMPLETION_MODES),
  externalUrl: z.string().trim().url().max(2048).optional().or(z.literal("").transform(() => undefined)),
  requiresEvidence: z.boolean().default(false),
  repeatDaily: z.boolean().default(false),
  quizJson: z.string().max(50_000).optional().nullable(),
  passMark: z.number().int().min(1).max(100).default(70),
  autoApproveQuiz: z.boolean().default(false),
  sponsorName: z.string().trim().max(160).optional().nullable(),
  featured: z.boolean().default(false),
  startsAt: optionalDate,
  expiresAt: optionalDate,
  status: z.enum(["draft", "active", "paused", "closed"]).default("draft"),
  /** New picture uploaded with admin.uploadTaskImage. */
  imageAssetId: z.number().int().positive().nullable().optional(),
  /** When editing without a new picture: true keeps the current one, false removes it. */
  keepImage: z.boolean().optional(),
});

/** Resolves the picture for a task: a new upload, the existing one, or none. */
async function taskImage(db: Awaited<ReturnType<typeof dbRequired>>, input: { imageAssetId?: number | null; keepImage?: boolean }, editing: boolean) {
  if (input.imageAssetId) {
    const asset = (
      await db.select().from(uploadedAssets).where(and(eq(uploadedAssets.id, input.imageAssetId), eq(uploadedAssets.purpose, "task"))).limit(1)
    )[0];
    if (!asset) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload the task picture again." });
    return { imageKey: asset.storageKey };
  }
  if (editing && input.keepImage !== false) return {};
  return { imageKey: null };
}

function taskValues(input: z.infer<typeof taskInput>) {
  if (input.completionMode === "quiz") {
    const quiz = parseQuiz(input.quizJson);
    if (!quiz.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one valid quiz question (question, 2+ options, correct answer)." });
  }
  if (input.externalUrl && !/^https:\/\//i.test(input.externalUrl))
    throw new TRPCError({ code: "BAD_REQUEST", message: "Task links must start with https://" });
  if (input.startsAt && input.expiresAt && new Date(input.expiresAt) <= new Date(input.startsAt))
    throw new TRPCError({ code: "BAD_REQUEST", message: "The end date must be after the start date." });
  return {
    category: input.category,
    title: input.title,
    description: input.description,
    instructions: input.instructions,
    completionRequirements: input.completionRequirements,
    rewardMinor: Math.round(input.rewardKes * 100),
    budgetMinor: input.budgetKes * 100,
    estimatedMinutes: input.estimatedMinutes,
    completionMode: input.completionMode,
    externalUrl: input.externalUrl ?? null,
    requiresEvidence: input.requiresEvidence,
    repeatDaily: input.repeatDaily,
    quizJson: input.completionMode === "quiz" ? JSON.stringify(parseQuiz(input.quizJson)) : null,
    passMark: input.passMark,
    autoApproveQuiz: input.completionMode === "quiz" && input.autoApproveQuiz,
    sponsorName: input.sponsorName?.trim() || null,
    featured: input.featured,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    status: input.status,
  };
}

const SETTINGS = [
  ["activationFeeMinor", "10000"],
  ["minimumWithdrawalMinor", "10000"],
  ["withdrawalFeeMinor", "0"],
  ["referralCommissionMinor", "0"],
  ["announcement", ""],
  ["maximumWithdrawalMinor", "5000000"],
  ["dailyWithdrawalLimitMinor", "10000000"],
  ["minimumCampaignBudgetMinor", "10000"],
  ["maximumCampaignRateMinor", "100000"],
  ["maximumCampaignDays", "90"],
  ["maximumCampaignParticipants", "100000"],
  ["supportEmail", ""],
  ["supportPhone", ""],
  ["supportWhatsapp", ""],
  ["supportHours", ""],
] as const;

export const adminRouter = router({
  overview: adminProcedure.query(async () => {
    const db = await dbRequired();
    const one = async (q: Promise<{ total: number }[]>) => Number((await q)[0]?.total ?? 0);
    const [usersN, members, advertisers, verified, activated, tasksN, activeTasks, pendingTasks, pendingAds, activeCampaigns, payments, pendingW, failedW, pendingReviews, openTickets] =
      await Promise.all([
        one(db.select({ total: count() }).from(users)),
        one(db.select({ total: count() }).from(users).where(eq(users.accountType, "member"))),
        one(db.select({ total: count() }).from(users).where(eq(users.accountType, "advertiser"))),
        one(db.select({ total: count() }).from(users).where(isNotNull(users.emailVerifiedAt))),
        one(db.select({ total: count() }).from(users).where(isNotNull(users.activatedAt))),
        one(db.select({ total: count() }).from(tasks)),
        one(db.select({ total: count() }).from(tasks).where(eq(tasks.status, "active"))),
        one(db.select({ total: count() }).from(taskSubmissions).where(eq(taskSubmissions.status, "pending"))),
        one(db.select({ total: count() }).from(whatsappSubmissions).where(eq(whatsappSubmissions.status, "pending"))),
        one(db.select({ total: count() }).from(adCampaigns).where(eq(adCampaigns.status, "active"))),
        one(db.select({ total: count() }).from(paymentAttempts).where(eq(paymentAttempts.status, "verification_required"))),
        one(db.select({ total: count() }).from(withdrawals).where(eq(withdrawals.status, "pending"))),
        one(db.select({ total: count() }).from(withdrawals).where(eq(withdrawals.status, "payout_failed"))),
        one(db.execute(sql`select count(*)::int as total from member_reviews where status = 'pending' and "deletedAt" is null`).then(r => r.rows as { total: number }[])),
        one(db.select({ total: count() }).from(supportTickets).where(eq(supportTickets.status, "open"))),
      ]);
    const sums = await db.execute(sql`
      select
        coalesce((select sum("amountMinor") from payment_attempts where status = 'succeeded' and purpose = 'activation'), 0)::bigint as activation,
        coalesce((select sum("amountMinor") from payment_attempts where status = 'succeeded' and purpose = 'campaign_funding'), 0)::bigint as funding,
        coalesce((select sum("amountMinor") from ledger_entries where direction = 'credit' and kind in ('task_credit','ad_credit','referral_credit','daily_credit')), 0)::bigint as credited,
        coalesce((select sum("amountMinor") from withdrawals where status = 'paid'), 0)::bigint as paid`);
    const s = (sums.rows[0] ?? {}) as Record<string, string | number>;
    return {
      users: usersN,
      members,
      advertisers,
      verifiedUsers: verified,
      activatedUsers: activated,
      tasks: tasksN,
      activeTasks,
      pendingTaskSubmissions: pendingTasks,
      pendingWhatsAppReviews: pendingAds,
      activeCampaigns,
      paymentsToInvestigate: payments,
      pendingWithdrawals: pendingW,
      failedPayouts: failedW,
      pendingReviews,
      openTickets,
      activationRevenueMinor: Number(s.activation ?? 0),
      campaignFundingMinor: Number(s.funding ?? 0),
      creditedMinor: Number(s.credited ?? 0),
      paidOutMinor: Number(s.paid ?? 0),
      integrations: { email: mailerReady(), b2c: b2cReady(), storage: storageDriver() },
    };
  }),

  users: adminProcedure
    .input(
      z
        .object({
          query: z.string().trim().max(200).optional(),
          accountType: z.enum(["member", "advertiser", "all"]).default("all"),
          state: z.enum(["all", "unverified", "not_activated", "activated", "suspended"]).default("all"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await dbRequired();
      const filters = [];
      const q = input?.query?.trim();
      if (q) filters.push(or(ilike(users.email, escapeLike(q)), ilike(users.name, escapeLike(q)), ilike(users.phone, escapeLike(q)), ilike(users.businessName, escapeLike(q)))!);
      if (input?.accountType && input.accountType !== "all") filters.push(eq(users.accountType, input.accountType));
      if (input?.state === "unverified") filters.push(isNull(users.emailVerifiedAt));
      if (input?.state === "not_activated") filters.push(and(isNotNull(users.emailVerifiedAt), isNull(users.activatedAt))!);
      if (input?.state === "activated") filters.push(isNotNull(users.activatedAt));
      if (input?.state === "suspended") filters.push(isNotNull(users.suspendedAt));
      const rows = await db
        .select()
        .from(users)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(users.createdAt))
        .limit(200);
      return rows.map(publicUser);
    }),

  userHistory: adminProcedure.input(z.object({ userId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await dbRequired();
    const account = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
    const [ledger, payments, requests, wallet] = await Promise.all([
      db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, input.userId)).orderBy(desc(ledgerEntries.createdAt)).limit(100),
      db.select().from(paymentAttempts).where(eq(paymentAttempts.userId, input.userId)).orderBy(desc(paymentAttempts.createdAt)).limit(100),
      db.select().from(withdrawals).where(eq(withdrawals.userId, input.userId)).orderBy(desc(withdrawals.createdAt)).limit(100),
      db.select().from(wallets).where(eq(wallets.userId, input.userId)).limit(1),
    ]);
    return { user: publicUser(account), ledger, payments, withdrawals: requests, wallet: wallet[0] ?? null };
  }),

  setSuspended: adminProcedure.input(z.object({ userId: z.number().int().positive(), suspended: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot suspend your own account." });
    const db = await dbRequired();
    const found = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
    if (found.role === "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "The primary administrator cannot be suspended." });
    if (found.role === "admin" && ctx.user.role !== "super_admin")
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the primary administrator can suspend another administrator." });
    await db
      .update(users)
      .set({ suspendedAt: input.suspended ? new Date() : null, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, input.userId));
    await audit(ctx.user.id, input.suspended ? "user_suspended" : "user_unsuspended", "user", input.userId);
    return { success: true };
  }),

  administrators: superAdminProcedure.query(async () => {
    const db = await dbRequired();
    const rows = await db.select().from(users).where(or(eq(users.role, "admin"), eq(users.role, "super_admin"))).orderBy(desc(users.createdAt));
    return rows.map(publicUser);
  }),

  setAdministratorAccess: superAdminProcedure.input(z.object({ userId: z.number().int().positive(), grant: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Primary administrator access cannot be changed here." });
    const db = await dbRequired();
    const target = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
    if (target.role === "super_admin" || target.emailNormalized === (process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? ""))
      throw new TRPCError({ code: "FORBIDDEN", message: "The primary administrator cannot be changed here." });
    if (input.grant && !target.emailVerifiedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Only verified accounts can become administrators." });
    const role = input.grant ? "admin" : "user";
    await db.update(users).set({ role, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, target.id));
    await audit(ctx.user.id, input.grant ? "administrator_granted" : "administrator_revoked", "user", target.id);
    return { success: true, role };
  }),

  tasks: adminProcedure.query(async () => {
    const db = await dbRequired();
    const rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt)).limit(500);
    return rows.map(t => ({ ...t, imageUrl: publicMediaUrl(t.imageKey) }));
  }),

  uploadTaskImage: adminProcedure
    .input(z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().max(4_200_000) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const asset = await uploadImage({ userId: ctx.user.id, purpose: "task", mime: input.mime, base64: input.base64 });
        return { assetId: asset.assetId };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "The picture could not be uploaded." });
      }
    }),

  createTask: adminProcedure.input(taskInput).mutation(async ({ ctx, input }) => {
    if (Math.round(input.rewardKes * 100) * input.slotLimit > input.budgetKes * 100)
      throw new TRPCError({ code: "BAD_REQUEST", message: "The budget must cover the reward for every slot (reward × slots)." });
    const db = await dbRequired();
    const image = await taskImage(db, input, false);
    const inserted = await db
      .insert(tasks)
      .values({ ...taskValues(input), ...image, slotLimit: input.slotLimit, slotsTaken: 0, spentMinor: 0, createdById: ctx.user.id })
      .returning({ id: tasks.id });
    await audit(ctx.user.id, "task_created", "task", inserted[0]!.id, { category: input.category });
    return { id: inserted[0]!.id };
  }),

  updateTask: adminProcedure.input(z.object({ id: z.number().int().positive(), ...taskInput.shape })).mutation(async ({ ctx, input }) => {
    const db = await dbRequired();
    const found = (await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1))[0];
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
    const slotLimit = Math.max(input.slotLimit, found.slotsTaken);
    const pending = await db
      .select({ total: sql<number>`coalesce(sum(${taskSubmissions.rewardMinor}), 0)` })
      .from(taskSubmissions)
      .where(and(eq(taskSubmissions.taskId, found.id), eq(taskSubmissions.status, "pending")));
    const committed = found.spentMinor + Number(pending[0]?.total ?? 0);
    if (input.budgetKes * 100 < committed + Math.round(input.rewardKes * 100) * (slotLimit - found.slotsTaken))
      throw new TRPCError({ code: "BAD_REQUEST", message: "Budget must cover paid and pending rewards plus every remaining slot." });
    const image = await taskImage(db, input, true);
    await db.update(tasks).set({ ...taskValues(input), ...image, slotLimit }).where(eq(tasks.id, input.id));
    await audit(ctx.user.id, "task_updated", "task", input.id, { status: input.status });
    return { success: true };
  }),

  setTaskStatus: adminProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["draft", "active", "paused", "closed"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      await db.update(tasks).set({ status: input.status }).where(eq(tasks.id, input.id));
      await audit(ctx.user.id, `task_${input.status}`, "task", input.id);
      return { success: true };
    }),

  /** Deletes a task with no submissions; otherwise closes it to preserve history. */
  deleteTask: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await dbRequired();
    const used = await db.select({ total: count() }).from(taskSubmissions).where(eq(taskSubmissions.taskId, input.id));
    if (Number(used[0]?.total ?? 0) === 0) {
      await db.delete(tasks).where(eq(tasks.id, input.id));
      await audit(ctx.user.id, "task_deleted", "task", input.id);
      return { success: true, deleted: true };
    }
    await db.update(tasks).set({ status: "closed" }).where(eq(tasks.id, input.id));
    await audit(ctx.user.id, "task_closed", "task", input.id);
    return { success: true, deleted: false };
  }),

  taskSubmissions: adminProcedure
    .input(z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = await dbRequired();
      const rows = await db
        .select({ submission: taskSubmissions, taskTitle: tasks.title, category: tasks.category, completionMode: tasks.completionMode, memberName: users.name, memberEmail: users.email })
        .from(taskSubmissions)
        .leftJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
        .leftJoin(users, eq(users.id, taskSubmissions.userId))
        .where(input?.status ? eq(taskSubmissions.status, input.status) : undefined)
        .orderBy(desc(taskSubmissions.submittedAt))
        .limit(300);
      return rows.map(row => ({ ...row, evidenceUrl: row.submission.evidenceAssetId ? `/api/evidence?id=${row.submission.evidenceAssetId}` : null }));
    }),

  reviewTaskSubmission: adminProcedure
    .input(z.object({ submissionId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(3000).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.decision === "rejected" && !input.note?.trim())
        throw new TRPCError({ code: "BAD_REQUEST", message: "Give a reason when rejecting a submission." });
      const db = await dbRequired();
      const result = await db.transaction(tx =>
        decideTaskSubmission(tx, { submissionId: input.submissionId, decision: input.decision, note: input.note?.trim() || null, reviewerId: ctx.user.id })
      );
      result.notifyAfterCommit();
      await audit(ctx.user.id, `task_submission_${input.decision}`, "task_submission", input.submissionId, { note: input.note ?? null });
      return { success: true };
    }),

  whatsappSubmissions: adminProcedure
    .input(z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = await dbRequired();
      const rows = await db
        .select({ submission: whatsappSubmissions, campaign: adCampaigns, member: users })
        .from(whatsappSubmissions)
        .leftJoin(adCampaigns, eq(adCampaigns.id, whatsappSubmissions.campaignId))
        .leftJoin(users, eq(users.id, whatsappSubmissions.userId))
        .where(input?.status ? eq(whatsappSubmissions.status, input.status) : undefined)
        .orderBy(desc(whatsappSubmissions.submittedAt))
        .limit(300);
      return rows.map(row => ({
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
      if (input.decision === "rejected" && !input.note?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Give a reason when rejecting evidence." });
      const db = await dbRequired();
      let rewardMinor = 0;
      let payableViews = 0;
      let finalDecision: "approved" | "rejected" = input.decision;
      let reviewNote = input.note?.trim() || null;
      let memberId = 0;
      let campaignTitle = "WhatsApp campaign";
      await db.transaction(async tx => {
        const submission = (await tx.select().from(whatsappSubmissions).where(eq(whatsappSubmissions.id, input.submissionId)).limit(1).for("update"))[0];
        if (!submission || submission.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "This evidence is no longer pending review." });
        memberId = submission.userId;
        const campaign = (await tx.select().from(adCampaigns).where(eq(adCampaigns.id, submission.campaignId)).limit(1).for("update"))[0];
        if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
        campaignTitle = campaign.title;
        if (finalDecision === "approved") {
          const approvedViews = input.eligibleViews ?? submission.reportedViews;
          if (approvedViews > submission.reportedViews)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Approved views cannot be more than the views the member reported." });
          const reward = whatsappReward({
            approvedViews,
            minimumViews: campaign.minimumViews,
            maximumPayableViews: campaign.maximumPayableViews,
            rateMinor: campaign.rateMinor,
            budgetRemainingMinor: Math.min(campaign.budgetMinor - campaign.spentMinor, campaign.fundedMinor - campaign.spentMinor),
          });
          if (campaign.status === "closed") {
            finalDecision = "rejected";
            reviewNote = reviewNote ?? "The campaign was closed before review.";
          } else if (reward.rewardMinor <= 0) {
            finalDecision = "rejected";
            reviewNote = reviewNote ?? (approvedViews < campaign.minimumViews ? "Approved views are below the campaign minimum." : "The campaign budget is used up.");
          } else {
            rewardMinor = reward.rewardMinor;
            payableViews = reward.payableViews;
          }
        }
        if (submission.rewardMinor > 0)
          await tx.update(wallets).set({ pendingMinor: sql`greatest(0, ${wallets.pendingMinor} - ${submission.rewardMinor})` }).where(eq(wallets.userId, submission.userId));
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
          // Re-check spend inside the lock so concurrent approvals can never overspend the budget.
          const updated = await tx
            .update(adCampaigns)
            .set({ spentMinor: sql`${adCampaigns.spentMinor} + ${rewardMinor}` })
            .where(and(eq(adCampaigns.id, campaign.id), sql`${adCampaigns.spentMinor} + ${rewardMinor} <= least(${adCampaigns.budgetMinor}, ${adCampaigns.fundedMinor})`))
            .returning({ id: adCampaigns.id });
          if (!updated.length) throw new TRPCError({ code: "CONFLICT", message: "Campaign budget would be exceeded. Refresh and try again." });
          await applyCredit(tx, {
            userId: submission.userId,
            amountMinor: rewardMinor,
            kind: "ad_credit",
            key: `whatsapp-submission:${submission.id}`,
            referenceType: "whatsapp_submission",
            referenceId: submission.id,
            note: `WhatsApp Status: ${payableViews} approved views`,
          });
        }
      });
      await audit(ctx.user.id, `whatsapp_submission_${finalDecision}`, "whatsapp_submission", input.submissionId, { note: reviewNote, rewardMinor, eligibleViews: payableViews });
      const member = (await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, memberId)).limit(1))[0];
      if (member?.email)
        notify({ to: member.email, userId: memberId, ...templates.submissionDecision(member.name ?? "", campaignTitle, finalDecision === "approved", formatKesMinor(rewardMinor), reviewNote) });
      return { success: true, decision: finalDecision, rewardMinor, eligibleViews: payableViews };
    }),

  campaigns: adminProcedure.query(async () => {
    const db = await dbRequired();
    const rows = await db
      .select({ campaign: adCampaigns, advertiserEmail: users.email, businessName: users.businessName })
      .from(adCampaigns)
      .leftJoin(users, eq(users.id, adCampaigns.advertiserId))
      .orderBy(desc(adCampaigns.createdAt))
      .limit(300);
    return rows.map(r => ({ ...r.campaign, advertiserEmail: r.advertiserEmail, businessName: r.businessName, mediaUrl: r.campaign.mediaKey ? `/api/media/${r.campaign.mediaKey}` : null }));
  }),

  reviewCampaign: adminProcedure
    .input(z.object({ campaignId: z.number().int().positive(), decision: z.enum(["active", "paused", "closed"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      const campaign = (await db.select().from(adCampaigns).where(eq(adCampaigns.id, input.campaignId)).limit(1))[0];
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
      if (input.decision === "active" && campaign.fundedMinor < campaign.budgetMinor)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The campaign must be fully funded through M-Pesa before activation." });
      await db
        .update(adCampaigns)
        .set({ status: input.decision, activeAt: input.decision === "active" ? (campaign.activeAt ?? new Date()) : campaign.activeAt })
        .where(eq(adCampaigns.id, campaign.id));
      await audit(ctx.user.id, "campaign_status_changed", "campaign", campaign.id, { status: input.decision });
      return { success: true };
    }),

  payments: adminProcedure
    .input(z.object({ status: z.enum(["pending", "callback_received", "succeeded", "failed", "verification_required"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = await dbRequired();
      return db
        .select({ payment: paymentAttempts, userName: users.name, email: users.email })
        .from(paymentAttempts)
        .leftJoin(users, eq(users.id, paymentAttempts.userId))
        .where(input?.status ? eq(paymentAttempts.status, input.status) : undefined)
        .orderBy(desc(paymentAttempts.createdAt))
        .limit(300);
    }),

  investigatePayment: adminProcedure
    .input(z.object({ paymentId: z.number().int().positive(), note: z.string().trim().min(5).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      const rows = await db.update(paymentAttempts).set({ adminNote: input.note }).where(eq(paymentAttempts.id, input.paymentId)).returning({ id: paymentAttempts.id });
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Payment attempt not found." });
      await audit(ctx.user.id, "payment_investigation_note", "payment", input.paymentId, { note: input.note });
      return { success: true };
    }),

  withdrawals: adminProcedure
    .input(z.object({ status: z.enum(["pending", "processing", "paid", "payout_failed", "rejected"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = await dbRequired();
      const rows = await db
        .select({ withdrawal: withdrawals, userName: users.name, email: users.email })
        .from(withdrawals)
        .leftJoin(users, eq(users.id, withdrawals.userId))
        .where(input?.status ? eq(withdrawals.status, input.status) : undefined)
        .orderBy(desc(withdrawals.createdAt))
        .limit(300);
      return { rows, b2cReady: b2cReady() };
    }),

  /** Send to M-Pesa B2C. Paid is only set by Safaricom's result callback. */
  payWithdrawal: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => startPayout(input.id, ctx.user.id)),

  /** After checking the M-Pesa portal, mark a stuck payout as failed so it can be retried or refunded. */
  markPayoutFailed: adminProcedure.input(z.object({ id: z.number().int().positive(), note: z.string().trim().min(5).max(1000) })).mutation(async ({ ctx, input }) => {
    const db = await dbRequired();
    const rows = await db
      .update(withdrawals)
      .set({ status: "payout_failed", adminNote: input.note, reviewedById: ctx.user.id })
      .where(and(eq(withdrawals.id, input.id), eq(withdrawals.status, "processing")))
      .returning({ id: withdrawals.id });
    if (!rows.length) throw new TRPCError({ code: "CONFLICT", message: "Only processing withdrawals can be marked failed." });
    await audit(ctx.user.id, "withdrawal_marked_failed", "withdrawal", input.id, { note: input.note });
    return { success: true };
  }),

  rejectWithdrawal: adminProcedure.input(z.object({ id: z.number().int().positive(), note: z.string().trim().min(3).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = await dbRequired();
    let request: typeof withdrawals.$inferSelect | undefined;
    await db.transaction(async tx => {
      request = (await tx.select().from(withdrawals).where(eq(withdrawals.id, input.id)).limit(1).for("update"))[0];
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Withdrawal not found." });
      const refundable = request.status === "pending" || request.status === "payout_failed" || (request.status === "processing" && !request.conversationId);
      if (!refundable) throw new TRPCError({ code: "CONFLICT", message: "This withdrawal has a payout in progress or is already finalized." });
      await tx.update(wallets).set({ availableMinor: sql`${wallets.availableMinor} + ${request.amountMinor}` }).where(eq(wallets.userId, request.userId));
      await tx.insert(ledgerEntries).values({
        userId: request.userId,
        kind: "withdrawal_release",
        amountMinor: request.amountMinor,
        direction: "credit",
        idempotencyKey: `withdrawal-release:${request.id}`,
        referenceType: "withdrawal",
        referenceId: request.id,
        note: "Reserved funds returned after rejection",
      });
      await tx.update(withdrawals).set({ status: "rejected", adminNote: input.note, reviewedById: ctx.user.id }).where(eq(withdrawals.id, request.id));
      await tx.insert(auditEvents).values({ actorId: ctx.user.id, action: "withdrawal_rejected", targetType: "withdrawal", targetId: request.id, detailsText: JSON.stringify({ note: input.note }) });
    });
    const r = request!;
    const member = (await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, r.userId)).limit(1))[0];
    if (member?.email)
      notify({ to: member.email, userId: r.userId, ...templates.withdrawal(member.name ?? "", "rejected", formatKesMinor(r.amountMinor), `Reason: ${input.note}. The amount was returned to your available balance.`) });
    return { success: true };
  }),

  settings: adminProcedure.query(async () => {
    const vals = Object.fromEntries(await Promise.all(SETTINGS.map(async ([k, f]) => [k, await settingValue(k, f)] as const)));
    return {
      activationFeeKes: Number(vals.activationFeeMinor) / 100,
      minimumWithdrawalKes: Number(vals.minimumWithdrawalMinor) / 100,
      withdrawalFeeKes: Number(vals.withdrawalFeeMinor) / 100,
      referralCommissionKes: Number(vals.referralCommissionMinor) / 100,
      announcement: vals.announcement ?? "",
      maximumWithdrawalKes: Number(vals.maximumWithdrawalMinor) / 100,
      dailyWithdrawalLimitKes: Number(vals.dailyWithdrawalLimitMinor) / 100,
      minimumCampaignBudgetKes: Number(vals.minimumCampaignBudgetMinor) / 100,
      maximumCampaignRateKes: Number(vals.maximumCampaignRateMinor) / 100,
      maximumCampaignDays: Number(vals.maximumCampaignDays),
      maximumCampaignParticipants: Number(vals.maximumCampaignParticipants),
      supportEmail: vals.supportEmail ?? "",
      supportPhone: vals.supportPhone ?? "",
      supportWhatsapp: vals.supportWhatsapp ?? "",
      supportHours: vals.supportHours ?? "",
    };
  }),

  updateSettings: adminProcedure
    .input(
      z.object({
        activationFeeKes: z.number().int().min(1).max(100_000),
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
        supportEmail: z.string().trim().email().max(320).or(z.literal("")),
        supportPhone: z.string().trim().max(40),
        supportWhatsapp: z.string().trim().max(40),
        supportHours: z.string().trim().max(120),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.referralCommissionKes >= input.activationFeeKes && input.referralCommissionKes > 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Referral commission must be lower than the activation fee." });
      const db = await dbRequired();
      const values: Record<string, string> = {
        activationFeeMinor: String(input.activationFeeKes * 100),
        minimumWithdrawalMinor: String(input.minimumWithdrawalKes * 100),
        withdrawalFeeMinor: String(input.withdrawalFeeKes * 100),
        referralCommissionMinor: String(input.referralCommissionKes * 100),
        announcement: input.announcement,
        maximumWithdrawalMinor: String(input.maximumWithdrawalKes * 100),
        dailyWithdrawalLimitMinor: String(input.dailyWithdrawalLimitKes * 100),
        minimumCampaignBudgetMinor: String(input.minimumCampaignBudgetKes * 100),
        maximumCampaignRateMinor: String(input.maximumCampaignRateKes * 100),
        maximumCampaignDays: String(input.maximumCampaignDays),
        maximumCampaignParticipants: String(input.maximumCampaignParticipants),
        supportEmail: input.supportEmail,
        supportPhone: input.supportPhone,
        supportWhatsapp: input.supportWhatsapp,
        supportHours: input.supportHours,
      };
      for (const [key, valueText] of Object.entries(values))
        await db
          .insert(appSettings)
          .values({ settingKey: key, valueText, updatedById: ctx.user.id })
          .onConflictDoUpdate({ target: appSettings.settingKey, set: { valueText, updatedById: ctx.user.id, updatedAt: new Date() } });
      await audit(ctx.user.id, "settings_updated", "settings", null, values);
      return { success: true };
    }),

  supportTickets: adminProcedure
    .input(z.object({ status: z.enum(["open", "answered", "closed", "all"]).default("open") }).optional())
    .query(async ({ input }) => {
      const db = await dbRequired();
      return db
        .select({ ticket: supportTickets, userName: users.name, email: users.email })
        .from(supportTickets)
        .leftJoin(users, eq(users.id, supportTickets.userId))
        .where(input?.status && input.status !== "all" ? eq(supportTickets.status, input.status) : undefined)
        .orderBy(desc(supportTickets.createdAt))
        .limit(300);
    }),

  respondSupportTicket: adminProcedure
    .input(z.object({ ticketId: z.number().int().positive(), reply: z.string().trim().min(5).max(5000), status: z.enum(["answered", "closed"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await dbRequired();
      const rows = await db
        .update(supportTickets)
        .set({ adminReply: input.reply, status: input.status, assignedToId: ctx.user.id })
        .where(eq(supportTickets.id, input.ticketId))
        .returning({ id: supportTickets.id });
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Support request not found." });
      await audit(ctx.user.id, "support_ticket_responded", "support_ticket", input.ticketId, { status: input.status });
      return { success: true };
    }),

  emailLog: adminProcedure.query(async () => {
    const db = await dbRequired();
    const rows = await db
      .select({ log: emailLog, email: users.email })
      .from(emailLog)
      .leftJoin(users, eq(users.id, emailLog.userId))
      .orderBy(desc(emailLog.createdAt))
      .limit(300);
    return { rows, ready: mailerReady() };
  }),

  /** Important-announcement email to opted-in, verified members (max 1,000 per send). */
  broadcastEmail: adminProcedure
    .input(
      z.object({
        subject: z.string().trim().min(4).max(120),
        body: z.string().trim().min(10).max(5000),
        audience: z.enum(["all_members", "activated", "not_activated", "advertisers"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!mailerReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Brevo email is not configured." });
      const db = await dbRequired();
      const filters = [isNotNull(users.emailVerifiedAt), isNull(users.suspendedAt), eq(users.marketingOptIn, true)];
      if (input.audience === "advertisers") filters.push(eq(users.accountType, "advertiser"));
      else filters.push(eq(users.accountType, "member"));
      if (input.audience === "activated") filters.push(isNotNull(users.activatedAt));
      if (input.audience === "not_activated") filters.push(isNull(users.activatedAt));
      const recipients = await db.select({ id: users.id, email: users.email }).from(users).where(and(...filters)).limit(1000);
      const t = templates.announcement(input.subject, input.body);
      let sent = 0;
      let failed = 0;
      for (const r of recipients) {
        if (!r.email) continue;
        try {
          await sendEmail({ to: r.email, userId: r.id, ...t });
          sent += 1;
        } catch {
          failed += 1;
        }
      }
      await audit(ctx.user.id, "broadcast_email_sent", "email", null, { audience: input.audience, sent, failed });
      return { sent, failed, total: recipients.length };
    }),

  auditEvents: adminProcedure.query(async () => {
    const db = await dbRequired();
    return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(300);
  }),

  advertisers: adminProcedure.query(async () => {
    const db = await dbRequired();
    const rows = await db.select().from(users).where(eq(users.accountType, "advertiser")).orderBy(desc(users.createdAt)).limit(300);
    const ids = rows.map(r => r.id);
    const stats = ids.length
      ? await db
          .select({
            advertiserId: adCampaigns.advertiserId,
            campaigns: count(),
            funded: sql<number>`coalesce(sum(${adCampaigns.fundedMinor}), 0)`,
            spent: sql<number>`coalesce(sum(${adCampaigns.spentMinor}), 0)`,
          })
          .from(adCampaigns)
          .where(inArray(adCampaigns.advertiserId, ids))
          .groupBy(adCampaigns.advertiserId)
      : [];
    const byId = new Map(stats.map(s => [s.advertiserId, s]));
    return rows.map(r => ({
      ...publicUser(r),
      campaigns: Number(byId.get(r.id)?.campaigns ?? 0),
      fundedMinor: Number(byId.get(r.id)?.funded ?? 0),
      spentMinor: Number(byId.get(r.id)?.spent ?? 0),
    }));
  }),
});
