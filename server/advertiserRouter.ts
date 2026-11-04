import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  adCampaigns,
  paymentAttempts,
  uploadedAssets,
  users,
  whatsappSubmissions,
} from "../drizzle/schema";
import { advertiserProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { uploadImage, uploadVideo } from "./uploads";
import { darajaReady, initiateStkPush, normalizeKenyanPhone } from "./daraja";
import { audit, settingValue } from "./security";
import { publicMediaUrl } from "./storage";

const dbRequired = async () => {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Application data is temporarily unavailable.",
    });
  return db;
};
const requireAdvertiser = (user: typeof users.$inferSelect) => {
  if (
    user.accountType !== "advertiser" &&
    user.role !== "admin" &&
    user.role !== "super_admin"
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Advertiser access is required.",
    });
  if (user.suspendedAt)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This account is suspended.",
    });
};
const requireVerified = (user: typeof users.$inferSelect) => {
  if (!user.emailVerifiedAt)
    throw new TRPCError({ code: "FORBIDDEN", message: "Verify your email address first." });
};

export const advertiserRouter = router({
  overview: advertiserProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const campaigns = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns.advertiserId, ctx.user.id))
      .orderBy(desc(adCampaigns.createdAt))
      .limit(100);
    const output = [];
    for (const campaign of campaigns) {
      const total = await db
        .select({ total: count() })
        .from(whatsappSubmissions)
        .where(eq(whatsappSubmissions.campaignId, campaign.id));
      const subs = await db
        .select({ status: whatsappSubmissions.status, reported: whatsappSubmissions.reportedViews, approved: whatsappSubmissions.eligibleViews })
        .from(whatsappSubmissions)
        .where(eq(whatsappSubmissions.campaignId, campaign.id));
      const approvedViews = subs.filter(s => s.status === "approved").map(s => ({ value: s.approved }));
      const reportedViews = subs.reduce((sum, s) => sum + s.reported, 0);
      const pendingReviews = subs.filter(s => s.status === "pending").length;
      output.push({
        ...campaign,
        mediaUrl: publicMediaUrl(campaign.mediaKey),
        participantCount: Number(total[0]?.total ?? 0),
        approvedViews: approvedViews.reduce(
          (sum, item) => sum + item.value,
          0
        ),
        amountSpentMinor: campaign.spentMinor,
        reportedViews,
        pendingReviews,
        endsAt: campaign.activeAt ? new Date(campaign.activeAt.getTime() + campaign.durationDays * 86_400_000) : null,
      });
    }
    return { campaigns: output, darajaReady: darajaReady() };
  }),

  uploadMedia: advertiserProcedure
    .input(
      z.object({
        mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
        base64: z.string().max(4_200_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdvertiser(ctx.user);
      try {
        const asset = await uploadImage({
          userId: ctx.user.id,
          purpose: "campaign",
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
            error instanceof Error ? error.message : "Media upload failed.",
        });
      }
    }),

  uploadVideo: advertiserProcedure
    .input(
      z.object({
        mime: z.literal("video/mp4"),
        base64: z.string().max(11_200_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdvertiser(ctx.user);
      try {
        const asset = await uploadVideo({
          userId: ctx.user.id,
          purpose: "campaign",
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
            error instanceof Error ? error.message : "Media upload failed.",
        });
      }
    }),

  createCampaign: advertiserProcedure
    .input(
      z.object({
        title: z.string().trim().min(3).max(180),
        advertiserName: z.string().trim().min(2).max(160),
        description: z.string().trim().min(10).max(5000),
        instructions: z.string().trim().min(10).max(5000),
        mediaAssetId: z.number().int().positive(),
        mediaType: z.enum(["image", "video"]),
        rateKes: z.number().positive().max(1000),
        minimumViews: z.number().int().positive().max(10_000_000),
        maximumPayableViews: z.number().int().positive().max(10_000_000),
        budgetKes: z.number().int().min(100).max(100_000_000),
        participantLimit: z.number().int().min(1).max(100_000),
        durationDays: z.number().int().min(1).max(90),
        strictVerification: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdvertiser(ctx.user);
      requireVerified(ctx.user);
      if (input.maximumPayableViews < input.minimumViews)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Maximum payable views must be at least the minimum required views.",
        });
      const minBudget = Math.max(
        10_000,
        Number(await settingValue("minimumCampaignBudgetMinor", "10000")) ||
          10_000
      );
      const maxRate = Math.max(
        1,
        Number(await settingValue("maximumCampaignRateMinor", "100000")) ||
          100_000
      );
      const maxDays = Math.max(
        1,
        Number(await settingValue("maximumCampaignDays", "90")) || 90
      );
      const maxParticipants = Math.max(
        1,
        Number(await settingValue("maximumCampaignParticipants", "100000")) ||
          100_000
      );
      if (input.budgetKes * 100 < minBudget)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Campaign budget must be at least KES ${(minBudget / 100).toFixed(0)}.`,
        });
      if (Math.round(input.rateKes * 100) > maxRate)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Rate per view exceeds the administrator limit of KES ${(maxRate / 100).toFixed(2)}.`,
        });
      if (
        input.durationDays > maxDays ||
        input.participantLimit > maxParticipants
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Campaign duration or participant limit exceeds current platform settings.",
        });
      const db = await dbRequired();
      const assets = await db
        .select()
        .from(uploadedAssets)
        .where(
          and(
            eq(uploadedAssets.id, input.mediaAssetId),
            eq(uploadedAssets.userId, ctx.user.id),
            eq(uploadedAssets.purpose, "campaign")
          )
        )
        .limit(1);
      if (!assets[0])
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload campaign media before creating the campaign.",
        });
      const expectedType = input.mediaType === "video" ? "video/mp4" : "image/";
      if (
        input.mediaType === "video" &&
        !assets[0].contentType.startsWith(expectedType)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select an uploaded video for this campaign.",
        });
      if (
        input.mediaType === "image" &&
        !assets[0].contentType.startsWith(expectedType)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select an uploaded image for this campaign.",
        });
      const reference = `KF${nanoid(10).toUpperCase()}`;
      const result = await db.insert(adCampaigns).values({
        advertiserId: ctx.user.id,
        reference,
        title: input.title,
        advertiserName: input.advertiserName,
        description: input.description,
        instructions: input.instructions,
        mediaKey: assets[0].storageKey,
        mediaType: input.mediaType,
        rateMinor: Math.round(input.rateKes * 100),
        minimumViews: input.minimumViews,
        maximumPayableViews: input.maximumPayableViews,
        budgetMinor: input.budgetKes * 100,
        fundedMinor: 0,
        spentMinor: 0,
        participantLimit: input.participantLimit,
        durationDays: input.durationDays,
        strictVerification: input.strictVerification,
        status: "pending_funding",
      }).returning({ id: adCampaigns.id });
      const id = result[0]!.id;
      await audit(ctx.user.id, "advertiser_campaign_created", "campaign", id, {
        reference,
        budgetMinor: input.budgetKes * 100,
      });
      return {
        id,
        reference,
        status: "pending_funding" as const,
        message:
          "Campaign saved. Fund it before administrator review and activation.",
      };
    }),

  fundCampaign: advertiserProcedure
    .input(
      z.object({
        campaignId: z.number().int().positive(),
        phone: z.string().trim().min(8).max(24),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdvertiser(ctx.user);
      requireVerified(ctx.user);
      if (!darajaReady())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Campaign funding through M-Pesa is not configured yet.",
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
      const reservation = await db.transaction(async tx => {
        const rows = await tx
          .select()
          .from(adCampaigns)
          .where(
            and(
              eq(adCampaigns.id, input.campaignId),
              eq(adCampaigns.advertiserId, ctx.user.id)
            )
          )
          .limit(1)
          .for("update");
        const campaign = rows[0];
        if (!campaign || campaign.status === "closed")
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campaign not found or closed.",
          });
        const remaining = campaign.budgetMinor - campaign.fundedMinor;
        if (remaining <= 0)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Campaign is already fully funded.",
          });
        if (remaining % 100 !== 0)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Remaining campaign funding must be a whole KES amount.",
          });
        await tx
          .update(paymentAttempts)
          .set({ status: "failed", resultDescription: "No M-Pesa confirmation received within 3 minutes." })
          .where(
            and(
              eq(paymentAttempts.campaignId, campaign.id),
              eq(paymentAttempts.status, "pending"),
              sql`${paymentAttempts.createdAt} < now() - interval '3 minutes'`
            )
          );
        const pending = await tx
          .select({ id: paymentAttempts.id })
          .from(paymentAttempts)
          .where(
            and(
              eq(paymentAttempts.userId, ctx.user.id),
              eq(paymentAttempts.campaignId, campaign.id),
              inArray(paymentAttempts.status, [
                "pending",
                "callback_received",
                "verification_required",
              ])
            )
          )
          .limit(1);
        if (pending.length)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A funding request is already awaiting a payment result or reconciliation.",
          });
        const inserted = await tx
          .insert(paymentAttempts)
          .values({
            userId: ctx.user.id,
            campaignId: campaign.id,
            purpose: "campaign_funding",
            amountMinor: remaining,
            phone,
            status: "pending",
          })
          .returning({ id: paymentAttempts.id });
        return {
          paymentId: inserted[0]!.id,
          campaignId: campaign.id,
          amountMinor: remaining,
        };
      });
      const { paymentId, campaignId, amountMinor } = reservation;
      try {
        const response = await initiateStkPush({
          paymentId,
          phone,
          amountMinor,
          description: "Campaign funding",
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
          "campaign_funding_started",
          "payment",
          paymentId,
          { campaignId, amountMinor }
        );
        return {
          paymentId,
          status: "pending" as const,
          message: response.customerMessage,
        };
      } catch (error) {
        await db
          .update(paymentAttempts)
          .set({
            status: "failed",
            resultDescription: "Safaricom did not accept the STK request, so no prompt was sent.",
          })
          .where(eq(paymentAttempts.id, paymentId));
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "We could not send the M-Pesa prompt. No money was taken. Please try again.",
        });
      }
    }),

  participants: advertiserProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      requireAdvertiser(ctx.user);
      const db = await dbRequired();
      const owned = await db
        .select({ id: adCampaigns.id })
        .from(adCampaigns)
        .where(
          and(
            eq(adCampaigns.id, input.campaignId),
            eq(adCampaigns.advertiserId, ctx.user.id)
          )
        )
        .limit(1);
      if (!owned.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found.",
        });
      const rows = await db
        .select({
          id: whatsappSubmissions.id,
          memberId: users.id,
          memberName: users.name,
          reportedViews: whatsappSubmissions.reportedViews,
          eligibleViews: whatsappSubmissions.eligibleViews,
          status: whatsappSubmissions.status,
          rewardMinor: whatsappSubmissions.rewardMinor,
          submittedAt: whatsappSubmissions.submittedAt,
        })
        .from(whatsappSubmissions)
        .leftJoin(users, eq(users.id, whatsappSubmissions.userId))
        .where(eq(whatsappSubmissions.campaignId, input.campaignId))
        .orderBy(desc(whatsappSubmissions.submittedAt))
        .limit(200);
      return rows.map(row => ({
        ...row,
        memberName: row.memberName?.split(" ")[0] ?? "Member",
      }));
    }),

  transactions: advertiserProcedure.query(async ({ ctx }) => {
    requireAdvertiser(ctx.user);
    const db = await dbRequired();
    return db
      .select({
        id: paymentAttempts.id,
        campaignId: paymentAttempts.campaignId,
        campaignTitle: adCampaigns.title,
        reference: adCampaigns.reference,
        amountMinor: paymentAttempts.amountMinor,
        status: paymentAttempts.status,
        receipt: paymentAttempts.receipt,
        createdAt: paymentAttempts.createdAt,
      })
      .from(paymentAttempts)
      .leftJoin(adCampaigns, eq(adCampaigns.id, paymentAttempts.campaignId))
      .where(and(eq(paymentAttempts.userId, ctx.user.id), eq(paymentAttempts.purpose, "campaign_funding")))
      .orderBy(desc(paymentAttempts.createdAt))
      .limit(200);
  }),
});
