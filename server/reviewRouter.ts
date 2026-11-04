import { and, desc, eq, isNull, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { memberReviews, users } from "../drizzle/schema";
import { getDb } from "./db";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { audit, limitRequest } from "./security";

const dbRequired = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Reviews are temporarily unavailable." });
  return db;
};

export const reviewRouter = router({
  publicApproved: publicProcedure.query(async () => {
    const db = await dbRequired();
    const rows = await db.select({ id: memberReviews.id, rating: memberReviews.rating, content: memberReviews.content, submittedAt: memberReviews.submittedAt, name: users.name, county: users.county })
      .from(memberReviews).innerJoin(users, eq(users.id, memberReviews.userId))
      .where(and(eq(memberReviews.status, "approved"), isNull(memberReviews.deletedAt)))
      .orderBy(desc(memberReviews.submittedAt)).limit(30);
    return rows.map((row) => ({ ...row, name: row.name ?? "KaziFlow member", county: row.county ?? "Kenya" }));
  }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const rows = await db.select().from(memberReviews).where(eq(memberReviews.userId, ctx.user.id)).limit(1);
    return rows.find((row) => !row.deletedAt) ?? null;
  }),

  submit: protectedProcedure.input(z.object({ rating: z.number().int().min(1).max(5), content: z.string().trim().min(20).max(1000) })).mutation(async ({ ctx, input }) => {
    if (ctx.user.accountType !== "member") throw new TRPCError({ code: "FORBIDDEN", message: "Member accounts can submit community reviews." });
    try { limitRequest(ctx.req, `review-submit:${ctx.user.id}`, 3, 60 * 60_000); }
    catch { throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait before editing your review again." }); }
    const db = await dbRequired();
    const rows = await db.select().from(memberReviews).where(eq(memberReviews.userId, ctx.user.id)).limit(1);
    if (rows[0]) {
      await db.update(memberReviews).set({ rating: input.rating, content: input.content, status: "pending", reviewerId: null, reviewNote: null, deletedAt: null, submittedAt: new Date(), updatedAt: new Date() }).where(eq(memberReviews.id, rows[0].id));
      await audit(ctx.user.id, "member_review_resubmitted", "member_review", rows[0].id, { rating: input.rating });
      return { id: rows[0].id, status: "pending" as const, message: "Your edited review was resubmitted for administrator moderation." };
    }
    try {
      const result = await db.insert(memberReviews).values({ userId: ctx.user.id, rating: input.rating, content: input.content, status: "pending" });
      const id = Number((result as any)?.[0]?.insertId);
      await audit(ctx.user.id, "member_review_submitted", "member_review", id, { rating: input.rating });
      return { id, status: "pending" as const, message: "Your review is awaiting administrator moderation." };
    } catch (error) {
      if ((error as { code?: string })?.code === "ER_DUP_ENTRY") throw new TRPCError({ code: "CONFLICT", message: "A review already exists for this account. Refresh the page to edit it." });
      throw error;
    }
  }),

  adminList: adminProcedure.input(z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"), rating: z.number().int().min(1).max(5).optional(), query: z.string().trim().max(160).optional() })).query(async ({ input }) => {
    const db = await dbRequired();
    const filters = [];
    if (input.status !== "all") filters.push(eq(memberReviews.status, input.status));
    if (input.rating) filters.push(eq(memberReviews.rating, input.rating));
    filters.push(isNull(memberReviews.deletedAt));
    if (input.query) {
      const query = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
      filters.push(or(like(memberReviews.content, query), like(users.name, query), like(users.email, query))!);
    }
    return db.select({ id: memberReviews.id, userId: memberReviews.userId, name: users.name, email: users.email, county: users.county, rating: memberReviews.rating, content: memberReviews.content, status: memberReviews.status, reviewNote: memberReviews.reviewNote, submittedAt: memberReviews.submittedAt, updatedAt: memberReviews.updatedAt })
      .from(memberReviews).innerJoin(users, eq(users.id, memberReviews.userId)).where(and(...filters)).orderBy(desc(memberReviews.submittedAt)).limit(200);
  }),

  moderate: adminProcedure.input(z.object({ reviewId: z.number().int().positive(), status: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
    if (input.status === "rejected" && !input.note?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Provide a reason when rejecting a review." });
    const db = await dbRequired();
    const rows = await db.select().from(memberReviews).where(and(eq(memberReviews.id, input.reviewId), isNull(memberReviews.deletedAt))).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found." });
    await db.update(memberReviews).set({ status: input.status, reviewerId: ctx.user.id, reviewNote: input.note?.trim() || null, updatedAt: new Date() }).where(eq(memberReviews.id, input.reviewId));
    await audit(ctx.user.id, `member_review_${input.status}`, "member_review", input.reviewId, { note: input.note?.slice(0, 500) });
    return { success: true, status: input.status };
  }),

  delete: adminProcedure.input(z.object({ reviewId: z.number().int().positive(), note: z.string().trim().min(3).max(1000) })).mutation(async ({ ctx, input }) => {
    const db = await dbRequired();
    const rows = await db.select({ id: memberReviews.id }).from(memberReviews).where(and(eq(memberReviews.id, input.reviewId), isNull(memberReviews.deletedAt))).limit(1);
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found." });
    await db.update(memberReviews).set({ status: "rejected", deletedAt: new Date(), reviewerId: ctx.user.id, reviewNote: input.note, updatedAt: new Date() }).where(eq(memberReviews.id, input.reviewId));
    await audit(ctx.user.id, "member_review_deleted", "member_review", input.reviewId, { note: input.note });
    return { success: true };
  }),
});
