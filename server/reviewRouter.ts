import { reviewContentProblem } from "../shared/reviewRules";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { memberReviews, users } from "../drizzle/schema";
import { getDb, isUniqueViolation } from "./db";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { audit, limitRequest } from "./security";
import { KENYA_COUNTIES } from "../shared/counties";

const dbRequired = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Reviews are temporarily unavailable." });
  return db;
};

/** Display names look like "Akinyi M." — letters, spaces, apostrophes, hyphens and dots only. */
export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Enter the name to show, e.g. Brian K.")
  .max(40)
  .regex(/^[\p{L}][\p{L} .'-]*$/u, "Use letters only, for example Wanjiku N.")
  .refine(v => !/@|\d/.test(v), "Do not include emails or phone numbers in your display name.");

const contentSchema = z
  .string()
  .trim()
  .min(20, "Write at least 20 characters.")
  .max(1000)
  .superRefine((v, ctx) => {
    const problem = reviewContentProblem(v);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

export const reviewRouter = router({
  /** Only approved, not-removed reviews. Never returns email or phone. */
  publicApproved: publicProcedure.query(async () => {
    const db = await dbRequired();
    const rows = await db
      .select({
        id: memberReviews.id,
        rating: memberReviews.rating,
        content: memberReviews.content,
        displayName: memberReviews.displayName,
        county: memberReviews.county,
        showCounty: memberReviews.showCounty,
        approvedAt: memberReviews.approvedAt,
        submittedAt: memberReviews.submittedAt,
      })
      .from(memberReviews)
      .where(and(eq(memberReviews.status, "approved"), isNull(memberReviews.deletedAt)))
      .orderBy(desc(memberReviews.approvedAt))
      .limit(30);
    return rows.map(r => ({
      id: r.id,
      rating: r.rating,
      content: r.content,
      displayName: r.displayName,
      county: r.showCounty ? r.county : null,
      date: r.approvedAt ?? r.submittedAt,
    }));
  }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const rows = await db.select().from(memberReviews).where(eq(memberReviews.userId, ctx.user.id)).limit(1);
    const row = rows[0];
    if (!row || row.deletedAt) return row?.deletedAt ? { removed: true as const, reviewNote: row.reviewNote } : null;
    return { removed: false as const, ...row };
  }),

  submit: protectedProcedure
    .input(
      z.object({
        rating: z.number().int().min(1).max(5),
        content: contentSchema,
        displayName: displayNameSchema,
        showCounty: z.boolean().default(false),
        county: z
          .string()
          .trim()
          .optional()
          .refine(v => !v || (KENYA_COUNTIES as readonly string[]).includes(v), "Choose a county from the list."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.accountType !== "member") throw new TRPCError({ code: "FORBIDDEN", message: "Member accounts can submit community reviews." });
      if (!ctx.user.emailVerifiedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Verify your email before posting a review." });
      try {
        limitRequest(ctx.req, `review-submit:${ctx.user.id}`, 5, 60 * 60_000);
      } catch {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait before editing your review again." });
      }
      const db = await dbRequired();
      const county = input.showCounty ? input.county || ctx.user.county || null : null;
      const values = {
        rating: input.rating,
        content: input.content,
        displayName: input.displayName,
        county,
        showCounty: input.showCounty && Boolean(county),
        status: "pending" as const,
        reviewerId: null,
        reviewNote: null,
        approvedAt: null,
        submittedAt: new Date(),
      };
      const existing = (await db.select().from(memberReviews).where(eq(memberReviews.userId, ctx.user.id)).limit(1))[0];
      if (existing) {
        if (existing.deletedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Your review was removed by an administrator. Contact support if you think this is a mistake." });
        await db.update(memberReviews).set(values).where(eq(memberReviews.id, existing.id));
        await audit(ctx.user.id, "member_review_edited", "member_review", existing.id, { rating: input.rating });
        return { id: existing.id, status: "pending" as const, message: "Asante! Your edited review will appear after an administrator approves it." };
      }
      try {
        const inserted = await db.insert(memberReviews).values({ userId: ctx.user.id, ...values }).returning({ id: memberReviews.id });
        await audit(ctx.user.id, "member_review_submitted", "member_review", inserted[0]!.id, { rating: input.rating });
        return { id: inserted[0]!.id, status: "pending" as const, message: "Asante! Your review will appear after an administrator approves it." };
      } catch (error) {
        if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "You already have a review. Refresh the page to edit it." });
        throw error;
      }
    }),

  adminList: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected", "removed", "all"]).default("pending"),
        rating: z.number().int().min(1).max(5).optional(),
        query: z.string().trim().max(160).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await dbRequired();
      const filters = [];
      if (input.status === "removed") filters.push(eq(memberReviews.status, "rejected"));
      else if (input.status !== "all") filters.push(eq(memberReviews.status, input.status));
      if (input.rating) filters.push(eq(memberReviews.rating, input.rating));
      if (input.status !== "removed" && input.status !== "all") filters.push(isNull(memberReviews.deletedAt));
      if (input.query) {
        const q = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
        filters.push(or(ilike(memberReviews.content, q), ilike(memberReviews.displayName, q), ilike(users.email, q))!);
      }
      const rows = await db
        .select({
          id: memberReviews.id,
          userId: memberReviews.userId,
          displayName: memberReviews.displayName,
          accountName: users.name,
          email: users.email,
          county: memberReviews.county,
          showCounty: memberReviews.showCounty,
          rating: memberReviews.rating,
          content: memberReviews.content,
          status: memberReviews.status,
          reviewNote: memberReviews.reviewNote,
          deletedAt: memberReviews.deletedAt,
          submittedAt: memberReviews.submittedAt,
          updatedAt: memberReviews.updatedAt,
        })
        .from(memberReviews)
        .innerJoin(users, eq(users.id, memberReviews.userId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(memberReviews.submittedAt))
        .limit(200);
      return input.status === "removed" ? rows.filter(r => r.deletedAt) : rows;
    }),

  moderate: adminProcedure
    .input(z.object({ reviewId: z.number().int().positive(), status: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.status === "rejected" && !input.note?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Give a reason when rejecting a review." });
      const db = await dbRequired();
      const rows = await db
        .update(memberReviews)
        .set({ status: input.status, reviewerId: ctx.user.id, reviewNote: input.note?.trim() || null, approvedAt: input.status === "approved" ? new Date() : null })
        .where(and(eq(memberReviews.id, input.reviewId), isNull(memberReviews.deletedAt)))
        .returning({ id: memberReviews.id });
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found." });
      await audit(ctx.user.id, `member_review_${input.status}`, "member_review", input.reviewId, { note: input.note?.slice(0, 500) });
      return { success: true, status: input.status };
    }),

  delete: adminProcedure.input(z.object({ reviewId: z.number().int().positive(), note: z.string().trim().min(3).max(1000) })).mutation(async ({ ctx, input }) => {
    const db = await dbRequired();
    const rows = await db
      .update(memberReviews)
      .set({ status: "rejected", deletedAt: new Date(), reviewerId: ctx.user.id, reviewNote: input.note, approvedAt: null })
      .where(and(eq(memberReviews.id, input.reviewId), isNull(memberReviews.deletedAt)))
      .returning({ id: memberReviews.id });
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found." });
    await audit(ctx.user.id, "member_review_removed", "member_review", input.reviewId, { note: input.note });
    return { success: true };
  }),
});
