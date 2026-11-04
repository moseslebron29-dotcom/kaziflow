import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { announcementViews, announcements, uploadedAssets } from "../drizzle/schema";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb, isUniqueViolation } from "./db";
import { audit } from "./security";
import { uploadImage, uploadVideo } from "./uploads";
import { publicMediaUrl } from "./storage";

const dbRequired = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Announcements are temporarily unavailable." });
  return db;
};

const input = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(5).max(2000),
  mediaAssetId: z.number().int().positive().nullable().optional(),
  linkUrl: z.string().trim().url().max(2048).nullable().optional().or(z.literal("").transform(() => null)),
  linkLabel: z.string().trim().max(40).nullable().optional(),
  audience: z.enum(["all", "members", "activated", "not_activated", "advertisers"]),
  publishAt: z.string().datetime({ offset: true }).optional().nullable(),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
  status: z.enum(["draft", "published", "paused"]),
});

async function resolveMedia(db: Awaited<ReturnType<typeof dbRequired>>, userId: number, assetId?: number | null) {
  if (!assetId) return { mediaKey: null, mediaType: null };
  const asset = (await db.select().from(uploadedAssets).where(and(eq(uploadedAssets.id, assetId), eq(uploadedAssets.purpose, "announcement"))).limit(1))[0];
  if (!asset) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload the image or video again." });
  void userId;
  return { mediaKey: asset.storageKey, mediaType: asset.contentType.startsWith("video/") ? ("video" as const) : ("image" as const) };
}

function values(i: z.infer<typeof input>) {
  if (i.linkUrl && !/^https:\/\//i.test(i.linkUrl)) throw new TRPCError({ code: "BAD_REQUEST", message: "Links must start with https://" });
  const publishAt = i.publishAt ? new Date(i.publishAt) : new Date();
  const expiresAt = i.expiresAt ? new Date(i.expiresAt) : null;
  if (expiresAt && expiresAt <= publishAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Expiry must be after the publish date." });
  return { title: i.title, body: i.body, linkUrl: i.linkUrl || null, linkLabel: i.linkLabel?.trim() || null, audience: i.audience, publishAt, expiresAt, status: i.status };
}

export const announcementRouter = router({
  adminList: adminProcedure.query(async () => {
    const db = await dbRequired();
    const rows = await db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(200);
    return rows.map(r => ({ ...r, mediaUrl: publicMediaUrl(r.mediaKey), ctr: r.impressions ? Math.round((r.clicks / r.impressions) * 1000) / 10 : 0 }));
  }),

  uploadMedia: adminProcedure
    .input(z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]), base64: z.string().max(11_200_000) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const asset =
          input.mime === "video/mp4"
            ? await uploadVideo({ userId: ctx.user.id, purpose: "announcement", mime: "video/mp4", base64: input.base64 })
            : await uploadImage({ userId: ctx.user.id, purpose: "announcement", mime: input.mime, base64: input.base64 });
        return { assetId: asset.assetId };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Upload failed." });
      }
    }),

  create: adminProcedure.input(input).mutation(async ({ ctx, input: i }) => {
    const db = await dbRequired();
    const media = await resolveMedia(db, ctx.user.id, i.mediaAssetId);
    const inserted = await db.insert(announcements).values({ ...values(i), ...media, createdById: ctx.user.id }).returning({ id: announcements.id });
    await audit(ctx.user.id, "announcement_created", "announcement", inserted[0]!.id, { status: i.status, audience: i.audience });
    return { id: inserted[0]!.id };
  }),

  update: adminProcedure.input(input.extend({ id: z.number().int().positive(), keepMedia: z.boolean().default(true) })).mutation(async ({ ctx, input: i }) => {
    const db = await dbRequired();
    const media = i.mediaAssetId ? await resolveMedia(db, ctx.user.id, i.mediaAssetId) : i.keepMedia ? {} : { mediaKey: null, mediaType: null };
    const rows = await db.update(announcements).set({ ...values(i), ...media }).where(eq(announcements.id, i.id)).returning({ id: announcements.id });
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Announcement not found." });
    await audit(ctx.user.id, "announcement_updated", "announcement", i.id, { status: i.status });
    return { success: true };
  }),

  setStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["draft", "published", "paused"]) })).mutation(async ({ ctx, input: i }) => {
    const db = await dbRequired();
    await db.update(announcements).set({ status: i.status }).where(eq(announcements.id, i.id));
    await audit(ctx.user.id, `announcement_${i.status}`, "announcement", i.id);
    return { success: true };
  }),

  delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input: i }) => {
    const db = await dbRequired();
    await db.delete(announcementViews).where(eq(announcementViews.announcementId, i.id));
    await db.delete(announcements).where(eq(announcements.id, i.id));
    await audit(ctx.user.id, "announcement_deleted", "announcement", i.id);
    return { success: true };
  }),

  /** The next live announcement this user has not dismissed, matching their audience. */
  next: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbRequired();
    const now = new Date();
    const live = await db
      .select()
      .from(announcements)
      .where(and(eq(announcements.status, "published"), lte(announcements.publishAt, now), or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now))))
      .orderBy(desc(announcements.publishAt))
      .limit(20);
    const u = ctx.user;
    const matches = live.filter(a => {
      if (a.audience === "all") return true;
      if (a.audience === "advertisers") return u.accountType === "advertiser";
      if (u.accountType !== "member") return false;
      if (a.audience === "activated") return Boolean(u.activatedAt);
      if (a.audience === "not_activated") return !u.activatedAt;
      return true;
    });
    if (!matches.length) return null;
    const seen = await db
      .select({ announcementId: announcementViews.announcementId, dismissedAt: announcementViews.dismissedAt })
      .from(announcementViews)
      .where(eq(announcementViews.userId, u.id));
    const dismissed = new Set(seen.filter(s => s.dismissedAt).map(s => s.announcementId));
    const pick = matches.find(a => !dismissed.has(a.id));
    if (!pick) return null;
    return { id: pick.id, title: pick.title, body: pick.body, linkUrl: pick.linkUrl, linkLabel: pick.linkLabel, mediaType: pick.mediaType, mediaUrl: publicMediaUrl(pick.mediaKey) };
  }),

  /** Records one impression per member per announcement. */
  seen: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input: i }) => {
    const db = await dbRequired();
    try {
      await db.insert(announcementViews).values({ announcementId: i.id, userId: ctx.user.id });
      await db.update(announcements).set({ impressions: sql`${announcements.impressions} + 1` }).where(eq(announcements.id, i.id));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return { success: true };
  }),

  clicked: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input: i }) => {
    const db = await dbRequired();
    const rows = await db
      .update(announcementViews)
      .set({ clickedAt: new Date(), dismissedAt: new Date() })
      .where(and(eq(announcementViews.announcementId, i.id), eq(announcementViews.userId, ctx.user.id), isNull(announcementViews.clickedAt)))
      .returning({ id: announcementViews.id });
    if (rows.length) await db.update(announcements).set({ clicks: sql`${announcements.clicks} + 1` }).where(eq(announcements.id, i.id));
    return { success: true };
  }),

  dismiss: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input: i }) => {
    const db = await dbRequired();
    await db
      .insert(announcementViews)
      .values({ announcementId: i.id, userId: ctx.user.id, dismissedAt: new Date() })
      .onConflictDoUpdate({ target: [announcementViews.announcementId, announcementViews.userId], set: { dismissedAt: new Date() } });
    return { success: true };
  }),
});
