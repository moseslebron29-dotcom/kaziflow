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
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb, isUniqueViolation } from "./db";
import { audit, limitRequest, settingValue, verifyPassword } from "./security";
import { uploadImage } from "./uploads";
import { darajaReady, initiateStkPush, normalizeKenyanPhone } from "./daraja";
import { publicMediaUrl } from "./storage";
import { decideTaskSubmission } from "./taskReview";
import { TASK_CATEGORY_IDS, TASK_GROUPS, categoryGroup, nairobiDateKey, parseQuiz, scoreQuiz } from "../shared/taskCategories";
import { withdrawalCheck } from "../shared/money";

const dbRequired = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Application data is temporarily unavailable." });
  return db;
};
type U = typeof users.$inferSelect;
const memberRequired = (u: U) => {
  if (u.accountType !== "member") throw new TRPCError({ code: "FORBIDDEN", message: "This action is for member accounts." });
  if (u.suspendedAt) throw new TRPCError({ code: "FORBIDDEN", message: "This account is suspended." });
};
const verifiedRequired = (u: U) => {
  if (!u.emailVerifiedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Verify your email address first." });
};
const activatedRequired = (u: U, action: string) => {
  verifiedRequired(u);
  if (!u.activatedAt) throw new TRPCError({ code: "FORBIDDEN", message: `Activate your account before ${action}.` });
};
const rate = (req: Parameters<typeof limitRequest>[0], key: string, max: number, windowMs: number, message: string) => {
  try {
    limitRequest(req, key, max, windowMs);
  } catch {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
  }
};

/** Whether a task can be taken right now (status, schedule, slots and budget). */
function taskOpen(task: typeof tasks.$inferSelect, now = new Date()) {
  return (
    task.status === "active" &&
    (!task.startsAt || task.startsAt <= now) &&
    (!task.expiresAt || task.expiresAt > now) &&
    task.slotsTaken < task.slotLimit &&
    task.spentMinor + task.rewardMinor <= task.budgetMinor
  );
}
const periodFor = (task: { repeatDaily: boolean }) => (task.repeatDaily ? nairobiDateKey() : "once");

/** Public task view: never exposes quiz answers or the creator id. */
function publicTask(task: typeof tasks.$inferSelect) {
  const { createdById: _c, quizJson, imageKey, ...rest } = task;
  const quiz = parseQuiz(quizJson).map(q => ({ question: q.question, options: q.options }));
  return { ...rest, imageUrl: publicMediaUrl(imageKey), group: categoryGroup(task.category), quiz, slotsLeft: Math.max(0, task.slotLimit - task.slotsTaken) };
}

export const memberRouter = router({
  activationStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const payments = await db
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.userId, ctx.user.id), eq(paymentAttempts.purpose, "activation")))
      .orderBy(desc(paymentAttempts.createdAt))
      .limit(10);
    return {
      activated: Boolean(ctx.user.activatedAt),
      emailVerified: Boolean(ctx.user.emailVerifiedAt),
      feeKes: Math.max(1, Number(await settingValue("activationFeeMinor", "10000")) / 100 || 100),
      darajaReady: darajaReady(),
      payments: payments.map(({ resultDescription: _d, adminNote: _n, ...p }) => p),
    };
  }),

  startActivation: protectedProcedure.input(z.object({ phone: z.string().trim().min(8).max(24) })).mutation(async ({ ctx, input }) => {
    memberRequired(ctx.user);
    verifiedRequired(ctx.user);
    if (!darajaReady())
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "M-Pesa activation payments are not configured yet. Please try again later." });
    const db = await dbRequired();
    let phone: string;
    try {
      phone = normalizeKenyanPhone(input.phone);
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid M-Pesa number." });
    }
    const feeMinor = Math.max(100, Number(await settingValue("activationFeeMinor", "10000")) || 10_000);
    if (feeMinor % 100 !== 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Activation fee must be a whole KES amount." });
    rate(ctx.req, `activation:${ctx.user.id}`, 5, 60 * 60_000, "Too many activation attempts. Please wait before trying again.");
    const paymentId = await db.transaction(async tx => {
      const account = (await tx.select().from(users).where(eq(users.id, ctx.user.id)).limit(1).for("update"))[0];
      if (!account || account.suspendedAt) throw new TRPCError({ code: "FORBIDDEN", message: "This account cannot start an activation payment." });
      if (account.activatedAt) return null;
      const previous = await tx
        .select()
        .from(paymentAttempts)
        .where(and(eq(paymentAttempts.userId, ctx.user.id), eq(paymentAttempts.purpose, "activation")))
        .orderBy(desc(paymentAttempts.createdAt))
        .limit(1)
        .for("update");
      const last = previous[0];
      // A prompt that never got a callback is retired after 3 minutes so the member can retry.
      const stalePending = last && last.status === "pending" && last.createdAt < new Date(Date.now() - 3 * 60_000);
      // Older code parked Safaricom's own "not completed" results (no receipt, non-zero code)
      // for admin review. No money moved on those, so close them and let the member retry.
      const providerDeclined =
        last && last.status === "verification_required" && !last.receipt && last.resultCode !== null && last.resultCode !== "0";
      if (providerDeclined)
        await tx.update(paymentAttempts).set({ status: "failed" }).where(eq(paymentAttempts.id, last.id));
      if (stalePending)
        await tx
          .update(paymentAttempts)
          .set({ status: "failed", resultDescription: "No M-Pesa confirmation received within 3 minutes." })
          .where(eq(paymentAttempts.id, last.id));
      if (last && !stalePending && !providerDeclined && ["pending", "callback_received", "verification_required"].includes(last.status))
        throw new TRPCError({
          code: "CONFLICT",
          message:
            last.status === "pending"
              ? "An M-Pesa prompt was just sent. Complete it on your phone, or wait 3 minutes before trying again."
              : "Your last payment is being checked by our team. Please do not pay again; contact support.",
        });
      await tx.update(users).set({ mpesaPhone: phone }).where(eq(users.id, ctx.user.id));
      const inserted = await tx
        .insert(paymentAttempts)
        .values({ userId: ctx.user.id, purpose: "activation", amountMinor: feeMinor, phone, status: "pending" })
        .returning({ id: paymentAttempts.id });
      return inserted[0]!.id;
    });
    if (!paymentId) return { alreadyActivated: true as const, status: "succeeded" as const };
    try {
      const response = await initiateStkPush({ paymentId, phone, amountMinor: feeMinor, description: "Activation" });
      await db
        .update(paymentAttempts)
        .set({ checkoutRequestId: response.checkoutRequestId, merchantRequestId: response.merchantRequestId })
        .where(eq(paymentAttempts.id, paymentId));
      await audit(ctx.user.id, "activation_payment_started", "payment", paymentId, { amountMinor: feeMinor });
      return { alreadyActivated: false as const, paymentId, status: "pending" as const, message: response.customerMessage };
    } catch {
      await db
        .update(paymentAttempts)
        .set({ status: "failed", resultDescription: "Safaricom did not accept the STK request, so no prompt was sent." })
        .where(eq(paymentAttempts.id, paymentId));
      throw new TRPCError({ code: "BAD_GATEWAY", message: "We could not send the M-Pesa prompt. No money was taken. Please try again." });
    }
  }),

  /** Lightweight polling endpoint for the activation screen. */
  paymentStatus: protectedProcedure.input(z.object({ paymentId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await dbRequired();
    const row = (
      await db
        .select({ id: paymentAttempts.id, status: paymentAttempts.status, resultCode: paymentAttempts.resultCode, receipt: paymentAttempts.receipt, amountMinor: paymentAttempts.amountMinor, createdAt: paymentAttempts.createdAt })
        .from(paymentAttempts)
        .where(and(eq(paymentAttempts.id, input.paymentId), eq(paymentAttempts.userId, ctx.user.id)))
        .limit(1)
    )[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
    return row;
  }),

  categories: publicProcedure.query(() => ({ groups: TASK_GROUPS })),

  tasks: publicProcedure
    .input(z.object({ category: z.enum(TASK_CATEGORY_IDS).optional(), group: z.enum(["social", "online", "entertainment", "other"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await dbRequired();
      const rows = await db.select().from(tasks).where(eq(tasks.status, "active")).orderBy(desc(tasks.featured), desc(tasks.createdAt)).limit(500);
      const open = rows.filter(
        t => taskOpen(t) && (!input?.category || t.category === input.category) && (!input?.group || categoryGroup(t.category) === input.group)
      );
      let mine = new Map<number, { status: string; periodKey: string }>();
      if (ctx.user && open.length) {
        const subs = await db
          .select({ taskId: taskSubmissions.taskId, status: taskSubmissions.status, periodKey: taskSubmissions.periodKey })
          .from(taskSubmissions)
          .where(and(eq(taskSubmissions.userId, ctx.user.id), inArray(taskSubmissions.taskId, open.map(t => t.id))));
        mine = new Map(subs.map(s => [s.taskId, s]));
      }
      const today = nairobiDateKey();
      return open.map(t => {
        const s = mine.get(t.id);
        const relevant = s && (!t.repeatDaily || s.periodKey === today) ? s.status : null;
        return { ...publicTask(t), myStatus: relevant as null | "pending" | "approved" | "rejected" };
      });
    }),

  startTask: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    memberRequired(ctx.user);
    if (!ctx.user.emailVerifiedAt) return { needsVerification: true as const, needsActivation: false as const, task: null };
    if (!ctx.user.activatedAt) return { needsVerification: false as const, needsActivation: true as const, task: null };
    rate(ctx.req, `task-start:${ctx.user.id}`, 40, 10 * 60_000, "Too many task starts. Please wait before trying again.");
    const db = await dbRequired();
    const started = await db.transaction(async tx => {
      const task = (await tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1).for("update"))[0];
      if (!task || !taskOpen(task)) throw new TRPCError({ code: "NOT_FOUND", message: "This task is no longer available." });
      const periodKey = periodFor(task);
      const previous = await tx
        .select({ id: taskSubmissions.id })
        .from(taskSubmissions)
        .where(and(eq(taskSubmissions.taskId, task.id), eq(taskSubmissions.userId, ctx.user.id), eq(taskSubmissions.periodKey, periodKey)))
        .limit(1);
      if (previous.length)
        throw new TRPCError({ code: "CONFLICT", message: task.repeatDaily ? "You have already done this task today. Come back tomorrow." : "You have already submitted this task." });
      const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
      const existing = await tx
        .select()
        .from(taskAttempts)
        .where(
          and(
            eq(taskAttempts.taskId, task.id),
            eq(taskAttempts.userId, ctx.user.id),
            eq(taskAttempts.periodKey, periodKey),
            sql`${taskAttempts.submittedAt} IS NULL`,
            gte(taskAttempts.startedAt, cutoff)
          )
        )
        .orderBy(desc(taskAttempts.startedAt))
        .limit(1);
      if (existing[0]) return { task, attemptId: existing[0].id, startedAt: existing[0].startedAt.toISOString() };
      const active = await tx
        .select({ total: count() })
        .from(taskAttempts)
        .where(and(eq(taskAttempts.taskId, task.id), sql`${taskAttempts.submittedAt} IS NULL`, gte(taskAttempts.startedAt, new Date(Date.now() - 60 * 60_000))));
      if (task.slotsTaken + Number(active[0]?.total ?? 0) >= task.slotLimit)
        throw new TRPCError({ code: "CONFLICT", message: "All remaining slots are reserved right now. Try again later." });
      const inserted = await tx.insert(taskAttempts).values({ taskId: task.id, userId: ctx.user.id, periodKey }).returning();
      return { task, attemptId: inserted[0]!.id, startedAt: inserted[0]!.startedAt.toISOString() };
    });
    return { needsVerification: false as const, needsActivation: false as const, attemptId: started.attemptId, startedAt: started.startedAt, task: publicTask(started.task) };
  }),

  submitTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int().positive(),
        attemptId: z.number().int().positive(),
        proofText: z.string().trim().max(5000).default(""),
        evidenceAssetId: z.number().int().positive().optional(),
        quizAnswers: z.array(z.number().int().min(0).max(20)).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      memberRequired(ctx.user);
      activatedRequired(ctx.user, "submitting tasks");
      rate(ctx.req, `task-submit:${ctx.user.id}`, 40, 10 * 60_000, "Too many submissions. Please slow down.");
      const db = await dbRequired();
      if (input.evidenceAssetId) {
        const owned = await db
          .select({ id: uploadedAssets.id })
          .from(uploadedAssets)
          .where(and(eq(uploadedAssets.id, input.evidenceAssetId), eq(uploadedAssets.userId, ctx.user.id), eq(uploadedAssets.purpose, "evidence")))
          .limit(1);
        if (!owned.length) throw new TRPCError({ code: "BAD_REQUEST", message: "The evidence upload could not be validated." });
        const reused = await db.select({ id: taskSubmissions.id }).from(taskSubmissions).where(eq(taskSubmissions.evidenceAssetId, input.evidenceAssetId)).limit(1);
        if (reused.length) throw new TRPCError({ code: "CONFLICT", message: "This screenshot was already used for another submission." });
      }
      let submissionId = 0;
      let autoApproved = false;
      let quizScore: number | null = null;
      let afterCommit: (() => void) | null = null;
      await db
        .transaction(async tx => {
          const attempt = (
            await tx
              .select()
              .from(taskAttempts)
              .where(and(eq(taskAttempts.id, input.attemptId), eq(taskAttempts.taskId, input.taskId), eq(taskAttempts.userId, ctx.user.id)))
              .limit(1)
              .for("update")
          )[0];
          if (!attempt || attempt.submittedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Start this task again before submitting." });
          if (attempt.startedAt.getTime() < Date.now() - 24 * 60 * 60_000)
            throw new TRPCError({ code: "BAD_REQUEST", message: "This attempt expired. Start the task again." });
          const task = (await tx.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1).for("update"))[0];
          if (!task || task.status !== "active" || task.slotsTaken >= task.slotLimit || (task.expiresAt && task.expiresAt <= new Date()))
            throw new TRPCError({ code: "CONFLICT", message: "This task is no longer accepting submissions." });
          if (task.repeatDaily && attempt.periodKey !== nairobiDateKey())
            throw new TRPCError({ code: "BAD_REQUEST", message: "This daily attempt has ended. Start today's task again." });
          const elapsedSeconds = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);
          const minimumSeconds = task.completionMode === "video_progress" ? task.estimatedMinutes * 60 : Math.ceil(task.estimatedMinutes * 30);
          if (elapsedSeconds < minimumSeconds)
            throw new TRPCError({ code: "BAD_REQUEST", message: `Please spend at least ${Math.ceil(minimumSeconds / 60)} minute(s) on this task before submitting.` });
          if (task.requiresEvidence && !input.evidenceAssetId)
            throw new TRPCError({ code: "BAD_REQUEST", message: "This task needs a screenshot as evidence." });
          const quiz = task.completionMode === "quiz" ? parseQuiz(task.quizJson) : [];
          if (quiz.length) {
            if (!input.quizAnswers || input.quizAnswers.length !== quiz.length)
              throw new TRPCError({ code: "BAD_REQUEST", message: "Answer every question before submitting." });
            quizScore = scoreQuiz(quiz, input.quizAnswers);
          } else if (input.proofText.length < 3) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Describe what you did (at least 3 characters)." });
          }
          const inserted = await tx
            .insert(taskSubmissions)
            .values({
              taskId: task.id,
              userId: ctx.user.id,
              attemptId: attempt.id,
              periodKey: attempt.periodKey,
              proofText: input.proofText || null,
              evidenceAssetId: input.evidenceAssetId ?? null,
              watchedSeconds: task.completionMode === "video_progress" ? elapsedSeconds : null,
              quizScore,
              quizAnswersJson: input.quizAnswers ? JSON.stringify(input.quizAnswers) : null,
              status: "pending",
              rewardMinor: task.rewardMinor,
            })
            .returning({ id: taskSubmissions.id });
          submissionId = inserted[0]!.id;
          await tx.update(taskAttempts).set({ submittedAt: new Date() }).where(eq(taskAttempts.id, attempt.id));
          await tx.update(tasks).set({ slotsTaken: sql`${tasks.slotsTaken} + 1` }).where(eq(tasks.id, task.id));
          await tx.update(wallets).set({ pendingMinor: sql`${wallets.pendingMinor} + ${task.rewardMinor}` }).where(eq(wallets.userId, ctx.user.id));
          if (quiz.length && task.autoApproveQuiz && quizScore !== null && quizScore >= task.passMark && !task.requiresEvidence) {
            const decided = await decideTaskSubmission(tx, {
              submissionId,
              decision: "approved",
              note: `Automatically approved: quiz score ${quizScore}% (pass mark ${task.passMark}%).`,
              reviewerId: null,
            });
            afterCommit = decided.notifyAfterCommit;
            autoApproved = true;
          }
        })
        .catch(error => {
          if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "You have already submitted this task." });
          throw error;
        });
      (afterCommit as (() => void) | null)?.();
      await audit(ctx.user.id, "task_submitted", "task_submission", submissionId, { taskId: input.taskId, quizScore, autoApproved });
      return {
        id: submissionId,
        status: autoApproved ? ("approved" as const) : ("pending" as const),
        quizScore,
        message: autoApproved ? "Great work! Your quiz passed and the reward was added to your balance." : "Submission received. An administrator will review it.",
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
          quizScore: taskSubmissions.quizScore,
          periodKey: taskSubmissions.periodKey,
          submittedAt: taskSubmissions.submittedAt,
          reviewedAt: taskSubmissions.reviewedAt,
          reviewNote: taskSubmissions.reviewNote,
        })
        .from(taskSubmissions)
        .leftJoin(tasks, eq(tasks.id, taskSubmissions.taskId))
        .where(eq(taskSubmissions.userId, ctx.user.id))
        .orderBy(desc(taskSubmissions.submittedAt))
        .limit(200),
      db
        .select({
          id: whatsappSubmissions.id,
          campaignId: whatsappSubmissions.campaignId,
          title: adCampaigns.title,
          reportedViews: whatsappSubmissions.reportedViews,
          eligibleViews: whatsappSubmissions.eligibleViews,
          rewardMinor: whatsappSubmissions.rewardMinor,
          status: whatsappSubmissions.status,
          submittedAt: whatsappSubmissions.submittedAt,
          reviewNote: whatsappSubmissions.reviewNote,
        })
        .from(whatsappSubmissions)
        .leftJoin(adCampaigns, eq(adCampaigns.id, whatsappSubmissions.campaignId))
        .where(eq(whatsappSubmissions.userId, ctx.user.id))
        .orderBy(desc(whatsappSubmissions.submittedAt))
        .limit(100),
    ]);
    return { tasks: taskRows, whatsappAds: adRows };
  }),

  uploadEvidence: protectedProcedure
    .input(z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().max(4_200_000) }))
    .mutation(async ({ ctx, input }) => {
      memberRequired(ctx.user);
      activatedRequired(ctx.user, "uploading evidence");
      rate(ctx.req, `evidence-upload:${ctx.user.id}`, 30, 60 * 60_000, "Too many uploads. Please wait a little.");
      try {
        const asset = await uploadImage({ userId: ctx.user.id, purpose: "evidence", ...input });
        return { assetId: asset.assetId, contentType: asset.contentType, sizeBytes: asset.sizeBytes };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "The evidence could not be uploaded." });
      }
    }),

  whatsappCampaigns: protectedProcedure.query(async ({ ctx }) => {
    memberRequired(ctx.user);
    if (!ctx.user.emailVerifiedAt || !ctx.user.activatedAt) return { requiresActivation: true as const, campaigns: [] };
    const db = await dbRequired();
    const rows = await db.select().from(adCampaigns).where(eq(adCampaigns.status, "active")).orderBy(desc(adCampaigns.createdAt)).limit(100);
    const mine = await db
      .select({ campaignId: whatsappSubmissions.campaignId, status: whatsappSubmissions.status })
      .from(whatsappSubmissions)
      .where(eq(whatsappSubmissions.userId, ctx.user.id));
    const mineMap = new Map(mine.map(m => [m.campaignId, m.status]));
    const output = [];
    for (const campaign of rows) {
      const counts = await db.select({ total: count() }).from(whatsappSubmissions).where(eq(whatsappSubmissions.campaignId, campaign.id));
      const activeAt = campaign.activeAt ?? campaign.createdAt;
      const participants = Number(counts[0]?.total ?? 0);
      const expired = Date.now() > activeAt.getTime() + campaign.durationDays * 86_400_000;
      if (campaign.fundedMinor < campaign.budgetMinor || campaign.spentMinor >= campaign.budgetMinor || expired) continue;
      if (participants >= campaign.participantLimit && !mineMap.has(campaign.id)) continue;
      output.push({
        id: campaign.id,
        reference: campaign.reference,
        title: campaign.title,
        advertiserName: campaign.advertiserName,
        description: campaign.description,
        instructions: campaign.instructions,
        mediaType: campaign.mediaType,
        mediaUrl: publicMediaUrl(campaign.mediaKey),
        rateMinor: campaign.rateMinor,
        minimumViews: campaign.minimumViews,
        maximumPayableViews: campaign.maximumPayableViews,
        participantLimit: campaign.participantLimit,
        durationDays: campaign.durationDays,
        activeAt,
        endsAt: new Date(activeAt.getTime() + campaign.durationDays * 86_400_000),
        strictVerification: campaign.strictVerification,
        participants,
        myStatus: mineMap.get(campaign.id) ?? null,
        evidenceNotice:
          "View counts come from member screenshots and are checked by an administrator. Only approved views are paid; screenshots are not independent proof of every viewer.",
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
      activatedRequired(ctx.user, "joining campaigns");
      if (input.statusScreenshotAssetId === input.insightsScreenshotAssetId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Upload separate status and insights screenshots." });
      const db = await dbRequired();
      const assetRows = await db
        .select()
        .from(uploadedAssets)
        .where(
          and(
            eq(uploadedAssets.userId, ctx.user.id),
            inArray(uploadedAssets.id, [input.statusScreenshotAssetId, input.insightsScreenshotAssetId]),
            eq(uploadedAssets.purpose, "evidence")
          )
        );
      const statusAsset = assetRows.find(a => a.id === input.statusScreenshotAssetId);
      const insightsAsset = assetRows.find(a => a.id === input.insightsScreenshotAssetId);
      if (!statusAsset || !insightsAsset || statusAsset.sha256 === insightsAsset.sha256)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Both screenshots must be different images uploaded by your account." });
      rate(ctx.req, `whatsapp-submit:${ctx.user.id}`, 20, 60 * 60_000, "Too many campaign submissions. Please wait before trying again.");
      let id = 0;
      await db
        .transaction(async tx => {
          const campaign = (await tx.select().from(adCampaigns).where(eq(adCampaigns.id, input.campaignId)).limit(1).for("update"))[0];
          if (!campaign || campaign.status !== "active" || campaign.fundedMinor < campaign.budgetMinor || campaign.spentMinor >= campaign.budgetMinor)
            throw new TRPCError({ code: "NOT_FOUND", message: "This campaign is not available." });
          if (input.campaignReference.toUpperCase() !== campaign.reference)
            throw new TRPCError({ code: "BAD_REQUEST", message: "The campaign reference does not match." });
          const activeAt = campaign.activeAt ?? campaign.createdAt;
          const expiry = activeAt.getTime() + campaign.durationDays * 86_400_000;
          const postedAt = new Date(input.postedAt);
          if (Date.now() > expiry || postedAt > new Date(Date.now() + 5 * 60_000) || postedAt < activeAt || postedAt.getTime() > expiry)
            throw new TRPCError({ code: "BAD_REQUEST", message: "The campaign is outside its posting window or the posting date is invalid." });
          const duplicate = await tx
            .select({ id: whatsappSubmissions.id })
            .from(whatsappSubmissions)
            .where(
              sql`${whatsappSubmissions.statusScreenshotHash} IN (${statusAsset.sha256}, ${insightsAsset.sha256}) OR ${whatsappSubmissions.insightsScreenshotHash} IN (${statusAsset.sha256}, ${insightsAsset.sha256})`
            )
            .limit(1);
          if (duplicate.length) throw new TRPCError({ code: "CONFLICT", message: "These screenshots have already been submitted." });
          const participantCount = await tx.select({ total: count() }).from(whatsappSubmissions).where(eq(whatsappSubmissions.campaignId, campaign.id));
          if (Number(participantCount[0]?.total ?? 0) >= campaign.participantLimit)
            throw new TRPCError({ code: "CONFLICT", message: "This campaign has reached its participant limit." });
          const inserted = await tx
            .insert(whatsappSubmissions)
            .values({
              campaignId: campaign.id,
              userId: ctx.user.id,
              campaignReference: campaign.reference,
              postedAt,
              reportedViews: input.reportedViews,
              statusScreenshotAssetId: statusAsset.id,
              insightsScreenshotAssetId: insightsAsset.id,
              statusScreenshotHash: statusAsset.sha256,
              insightsScreenshotHash: insightsAsset.sha256,
              status: "pending",
              // Nothing is reserved as "pending earnings" until an admin approves views.
              rewardMinor: 0,
            })
            .returning({ id: whatsappSubmissions.id });
          id = inserted[0]!.id;
        })
        .catch(error => {
          if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "You have already submitted evidence for this campaign." });
          throw error;
        });
      await audit(ctx.user.id, "whatsapp_ad_submitted", "whatsapp_submission", id, { campaignId: input.campaignId });
      return { id, status: "pending" as const, message: "Evidence submitted. An administrator will check your screenshots and approve eligible views." };
    }),

  wallet: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const uid = ctx.user.id;
    const [walletRows, approvedTasks, pendingTasks, referralRows, ledger, adPending, adApproved, openTasks] = await Promise.all([
      db.select().from(wallets).where(eq(wallets.userId, uid)).limit(1),
      db.select({ total: count() }).from(taskSubmissions).where(and(eq(taskSubmissions.userId, uid), eq(taskSubmissions.status, "approved"))),
      db.select({ total: count() }).from(taskSubmissions).where(and(eq(taskSubmissions.userId, uid), eq(taskSubmissions.status, "pending"))),
      db.select().from(referrals).where(eq(referrals.referrerId, uid)),
      db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, uid)).orderBy(desc(ledgerEntries.createdAt)).limit(10),
      db.select({ total: count() }).from(whatsappSubmissions).where(and(eq(whatsappSubmissions.userId, uid), eq(whatsappSubmissions.status, "pending"))),
      db.select({ total: count() }).from(whatsappSubmissions).where(and(eq(whatsappSubmissions.userId, uid), eq(whatsappSubmissions.status, "approved"))),
      db.select().from(tasks).where(eq(tasks.status, "active")),
    ]);
    const wallet = walletRows[0] ?? { availableMinor: 0, pendingMinor: 0, lifetimeMinor: 0 };
    const referralEarnings = referralRows.reduce((sum, r) => sum + (r.status === "credited" ? r.commissionMinor : 0), 0);
    const withdrawn = await db
      .select({ total: sql<number>`coalesce(sum(${withdrawals.amountMinor}), 0)` })
      .from(withdrawals)
      .where(and(eq(withdrawals.userId, uid), eq(withdrawals.status, "paid")));
    const inFlight = await db
      .select({ total: sql<number>`coalesce(sum(${withdrawals.amountMinor}), 0)` })
      .from(withdrawals)
      .where(and(eq(withdrawals.userId, uid), inArray(withdrawals.status, ["pending", "processing", "payout_failed"])));
    return {
      availableMinor: wallet.availableMinor,
      pendingMinor: wallet.pendingMinor,
      lifetimeMinor: wallet.lifetimeMinor,
      referralEarningsMinor: referralEarnings,
      withdrawnMinor: Number(withdrawn[0]?.total ?? 0),
      withdrawalsInProgressMinor: Number(inFlight[0]?.total ?? 0),
      completedTasks: Number(approvedTasks[0]?.total ?? 0) + Number(adApproved[0]?.total ?? 0),
      pendingSubmissions: Number(pendingTasks[0]?.total ?? 0) + Number(adPending[0]?.total ?? 0),
      availableTasks: openTasks.filter(t => taskOpen(t)).length,
      activated: Boolean(ctx.user.activatedAt),
      emailVerified: Boolean(ctx.user.emailVerifiedAt),
      recentTransactions: ledger,
    };
  }),

  withdrawalSettings: protectedProcedure.query(async () => ({
    minimumKes: Number(await settingValue("minimumWithdrawalMinor", "10000")) / 100,
    feeKes: Number(await settingValue("withdrawalFeeMinor", "0")) / 100,
    maximumKes: Number(await settingValue("maximumWithdrawalMinor", "5000000")) / 100,
  })),

  withdraw: protectedProcedure
    .input(
      z.object({
        amountKes: z.number().int().min(1).max(1_000_000),
        mpesaPhone: z.string().trim().min(8).max(24).optional(),
        password: z.string().max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      memberRequired(ctx.user);
      activatedRequired(ctx.user, "requesting a withdrawal");
      rate(ctx.req, `withdraw:${ctx.user.id}`, 5, 60 * 60_000, "Too many withdrawal requests. Please wait.");
      const db = await dbRequired();
      let payoutPhone = ctx.user.mpesaPhone;
      if (input.mpesaPhone) {
        let normalized: string;
        try {
          normalized = normalizeKenyanPhone(input.mpesaPhone);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid M-Pesa number." });
        }
        if (normalized !== ctx.user.mpesaPhone) {
          // Changing the payout number is sensitive: confirm with the account password.
          const ok = await verifyPassword(input.password ?? "", ctx.user.passwordHash ?? null);
          if (!ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter your account password to use a new M-Pesa number." });
          await db.update(users).set({ mpesaPhone: normalized }).where(eq(users.id, ctx.user.id));
          await audit(ctx.user.id, "mpesa_number_changed", "user", ctx.user.id);
        }
        payoutPhone = normalized;
      }
      if (!payoutPhone) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Enter your M-Pesa number." });
      const amountMinor = input.amountKes * 100;
      const minMinor = Math.max(0, Number(await settingValue("minimumWithdrawalMinor", "10000")) || 10_000);
      const feeMinor = Math.max(0, Number(await settingValue("withdrawalFeeMinor", "0")) || 0);
      const maxMinor = Math.max(minMinor, Number(await settingValue("maximumWithdrawalMinor", "5000000")) || 5_000_000);
      const dailyLimitMinor = Math.max(maxMinor, Number(await settingValue("dailyWithdrawalLimitMinor", "10000000")) || 10_000_000);
      let withdrawalId = 0;
      await db.transaction(async tx => {
        const wallet = (await tx.select().from(wallets).where(eq(wallets.userId, ctx.user.id)).limit(1).for("update"))[0];
        const check = withdrawalCheck({ amountMinor, availableMinor: wallet?.availableMinor ?? 0, minimumMinor: minMinor, maximumMinor: maxMinor, feeMinor });
        if (!check.ok) throw new TRPCError({ code: "BAD_REQUEST", message: check.reason });
        const open = await tx
          .select({ id: withdrawals.id })
          .from(withdrawals)
          .where(and(eq(withdrawals.userId, ctx.user.id), inArray(withdrawals.status, ["pending", "processing", "payout_failed"])))
          .limit(1);
        if (open.length) throw new TRPCError({ code: "CONFLICT", message: "You already have a withdrawal in progress. Wait for it to finish." });
        const rolling = await tx
          .select({ total: sql<number>`coalesce(sum(${withdrawals.amountMinor}), 0)` })
          .from(withdrawals)
          .where(and(eq(withdrawals.userId, ctx.user.id), gte(withdrawals.createdAt, new Date(Date.now() - 24 * 60 * 60_000)), inArray(withdrawals.status, ["pending", "processing", "paid"])));
        if (Number(rolling[0]?.total ?? 0) + amountMinor > dailyLimitMinor)
          throw new TRPCError({ code: "BAD_REQUEST", message: `This request exceeds the 24-hour withdrawal limit of KES ${(dailyLimitMinor / 100).toFixed(0)}.` });
        const inserted = await tx
          .insert(withdrawals)
          .values({ userId: ctx.user.id, amountMinor, feeMinor, payoutMinor: check.payoutMinor, mpesaPhone: payoutPhone!, status: "pending" })
          .returning({ id: withdrawals.id });
        withdrawalId = inserted[0]!.id;
        await tx.update(wallets).set({ availableMinor: sql`${wallets.availableMinor} - ${amountMinor}` }).where(eq(wallets.userId, ctx.user.id));
        await tx.insert(ledgerEntries).values({
          userId: ctx.user.id,
          kind: "withdrawal_hold",
          amountMinor,
          direction: "debit",
          idempotencyKey: `withdrawal-hold:${withdrawalId}`,
          referenceType: "withdrawal",
          referenceId: withdrawalId,
          note: feeMinor ? `Reserved for M-Pesa withdrawal (fee KES ${(feeMinor / 100).toFixed(0)})` : "Reserved for M-Pesa withdrawal",
        });
      });
      await audit(ctx.user.id, "withdrawal_requested", "withdrawal", withdrawalId, { amountMinor });
      return { id: withdrawalId, status: "pending" as const, message: "Withdrawal request submitted. Your funds are reserved while it is processed." };
    }),

  withdrawals: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const rows = await db.select().from(withdrawals).where(eq(withdrawals.userId, ctx.user.id)).orderBy(desc(withdrawals.createdAt)).limit(100);
    return rows.map(({ conversationId: _a, originatorConversationId: _b, payoutResultCode: _c, ...w }) => w);
  }),

  history: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const [ledger, payments] = await Promise.all([
      db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, ctx.user.id)).orderBy(desc(ledgerEntries.createdAt)).limit(200),
      db
        .select({ id: paymentAttempts.id, purpose: paymentAttempts.purpose, amountMinor: paymentAttempts.amountMinor, status: paymentAttempts.status, receipt: paymentAttempts.receipt, createdAt: paymentAttempts.createdAt })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.userId, ctx.user.id))
        .orderBy(desc(paymentAttempts.createdAt))
        .limit(50),
    ]);
    return { ledger, payments };
  }),

  referrals: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const referred = await db
      .select({ id: users.id, name: users.name, createdAt: users.createdAt, activatedAt: users.activatedAt })
      .from(users)
      .where(eq(users.referredById, ctx.user.id))
      .orderBy(desc(users.createdAt))
      .limit(200);
    const commissions = await db.select().from(referrals).where(eq(referrals.referrerId, ctx.user.id)).orderBy(desc(referrals.createdAt)).limit(200);
    const byUser = new Map(commissions.map(c => [c.referredUserId, c]));
    return {
      code: ctx.user.referralCode,
      commissionKes: Number(await settingValue("referralCommissionMinor", "0")) / 100,
      total: referred.length,
      activated: referred.filter(p => Boolean(p.activatedAt)).length,
      commissionMinor: commissions.reduce((sum, c) => sum + (c.status === "credited" ? c.commissionMinor : 0), 0),
      referrals: referred.map(p => ({
        id: p.id,
        // Only a first name and initial is shown to the referrer.
        name: (p.name ?? "Member").split(" ").map((part, i) => (i === 0 ? part : `${part[0] ?? ""}.`)).slice(0, 2).join(" "),
        joinedAt: p.createdAt,
        activated: Boolean(p.activatedAt),
        commissionMinor: byUser.get(p.id)?.status === "credited" ? byUser.get(p.id)!.commissionMinor : 0,
      })),
    };
  }),

  supportTickets: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    return db.select().from(supportTickets).where(eq(supportTickets.userId, ctx.user.id)).orderBy(desc(supportTickets.createdAt)).limit(50);
  }),

  createSupportTicket: protectedProcedure
    .input(z.object({ subject: z.string().trim().min(4).max(180), message: z.string().trim().min(20).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      rate(ctx.req, `support:${ctx.user.id}`, 3, 60 * 60_000, "Please wait before opening another support request.");
      const db = await dbRequired();
      const inserted = await db
        .insert(supportTickets)
        .values({ userId: ctx.user.id, subject: input.subject, message: input.message, status: "open" })
        .returning({ id: supportTickets.id });
      const id = inserted[0]!.id;
      await audit(ctx.user.id, "support_ticket_created", "support_ticket", id);
      return { id, status: "open" as const, message: "Your request has been saved. Our team will reply here." };
    }),
});
