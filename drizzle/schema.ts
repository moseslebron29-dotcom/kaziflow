import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { COMPLETION_MODES, TASK_CATEGORY_IDS } from "../shared/taskCategories";

/**
 * KaziFlow PostgreSQL schema. Money is always stored as integer minor units (cents)
 * of KES. Enumerated values are varchar columns typed in TypeScript so adding a
 * value never needs a destructive Postgres enum migration.
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("createdAt").defaultNow().notNull();
const updatedAt = () => ts("updatedAt").defaultNow().notNull().$onUpdate(() => new Date());
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    emailNormalized: varchar("emailNormalized", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: varchar("role", { length: 16, enum: ["user", "admin", "super_admin"] }).default("user").notNull(),
    accountType: varchar("accountType", { length: 24, enum: ["member", "advertiser"] }).default("member").notNull(),
    phone: varchar("phone", { length: 24 }),
    county: varchar("county", { length: 100 }),
    businessName: varchar("businessName", { length: 160 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    sessionVersion: integer("sessionVersion").default(0).notNull(),
    mpesaPhone: varchar("mpesaPhone", { length: 24 }),
    referralCode: varchar("referralCode", { length: 24 }),
    referredById: integer("referredById"),
    emailVerifiedAt: ts("emailVerifiedAt"),
    activatedAt: ts("activatedAt"),
    suspendedAt: ts("suspendedAt"),
    marketingOptIn: boolean("marketingOptIn").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastSignedIn: ts("lastSignedIn").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("users_email_normalized_uq").on(table.emailNormalized),
    uniqueIndex("users_referral_code_uq").on(table.referralCode),
    index("users_role_idx").on(table.role),
    index("users_phone_idx").on(table.phone),
    index("users_referred_by_idx").on(table.referredById),
  ]
);

/** Six-digit email codes. Only an HMAC of the code is stored. */
export const emailOtps = pgTable(
  "email_otps",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    purpose: varchar("purpose", { length: 24, enum: ["email_verify", "password_reset"] }).notNull(),
    codeHash: varchar("codeHash", { length: 64 }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: ts("expiresAt").notNull(),
    consumedAt: ts("consumedAt"),
    createdAt: createdAt(),
  },
  table => [index("email_otps_user_purpose_idx").on(table.userId, table.purpose, table.createdAt)]
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    category: varchar("category", { length: 40, enum: TASK_CATEGORY_IDS }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    instructions: text("instructions").notNull(),
    completionRequirements: text("completionRequirements").notNull(),
    rewardMinor: integer("rewardMinor").notNull(),
    budgetMinor: integer("budgetMinor").default(0).notNull(),
    spentMinor: integer("spentMinor").default(0).notNull(),
    estimatedMinutes: integer("estimatedMinutes").notNull(),
    slotLimit: integer("slotLimit").notNull(),
    slotsTaken: integer("slotsTaken").default(0).notNull(),
    completionMode: varchar("completionMode", { length: 24, enum: COMPLETION_MODES }).default("manual").notNull(),
    externalUrl: varchar("externalUrl", { length: 2048 }),
    requiresEvidence: boolean("requiresEvidence").default(false).notNull(),
    repeatDaily: boolean("repeatDaily").default(false).notNull(),
    quizJson: text("quizJson"),
    /** Optional picture shown on the task card (uploaded by an administrator). */
    imageKey: varchar("imageKey", { length: 512 }),
    passMark: integer("passMark").default(70).notNull(),
    autoApproveQuiz: boolean("autoApproveQuiz").default(false).notNull(),
    sponsorName: varchar("sponsorName", { length: 160 }),
    featured: boolean("featured").default(false).notNull(),
    startsAt: ts("startsAt"),
    expiresAt: ts("expiresAt"),
    status: varchar("status", { length: 16, enum: ["draft", "active", "paused", "closed"] }).default("draft").notNull(),
    createdById: integer("createdById").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [index("tasks_status_category_idx").on(table.status, table.category)]
);

export const taskSubmissions = pgTable(
  "task_submissions",
  {
    id: serial("id").primaryKey(),
    taskId: integer("taskId").notNull(),
    userId: integer("userId").notNull(),
    attemptId: integer("attemptId"),
    /** "once" for one-time tasks, or the Nairobi date for daily repeatable tasks. */
    periodKey: varchar("periodKey", { length: 10 }).default("once").notNull(),
    proofText: text("proofText"),
    evidenceAssetId: integer("evidenceAssetId"),
    watchedSeconds: integer("watchedSeconds"),
    quizScore: integer("quizScore"),
    quizAnswersJson: text("quizAnswersJson"),
    status: varchar("status", { length: 16, enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
    rewardMinor: integer("rewardMinor").notNull(),
    reviewerId: integer("reviewerId"),
    reviewNote: text("reviewNote"),
    submittedAt: ts("submittedAt").defaultNow().notNull(),
    reviewedAt: ts("reviewedAt"),
  },
  table => [
    uniqueIndex("task_submission_once_uq").on(table.taskId, table.userId, table.periodKey),
    uniqueIndex("task_submission_attempt_uq").on(table.attemptId),
    index("task_submission_status_idx").on(table.status, table.submittedAt),
  ]
);

export const taskAttempts = pgTable(
  "task_attempts",
  {
    id: serial("id").primaryKey(),
    taskId: integer("taskId").notNull(),
    userId: integer("userId").notNull(),
    periodKey: varchar("periodKey", { length: 10 }).default("once").notNull(),
    startedAt: ts("startedAt").defaultNow().notNull(),
    submittedAt: ts("submittedAt"),
  },
  table => [index("task_attempt_user_task_idx").on(table.userId, table.taskId, table.startedAt)]
);

export const adCampaigns = pgTable(
  "ad_campaigns",
  {
    id: serial("id").primaryKey(),
    advertiserId: integer("advertiserId").notNull(),
    reference: varchar("reference", { length: 32 }).notNull().unique(),
    title: varchar("title", { length: 180 }).notNull(),
    advertiserName: varchar("advertiserName", { length: 160 }).notNull(),
    description: text("description").notNull(),
    instructions: text("instructions").notNull(),
    mediaKey: varchar("mediaKey", { length: 512 }),
    mediaType: varchar("mediaType", { length: 8, enum: ["image", "video"] }).default("image").notNull(),
    rateMinor: integer("rateMinor").notNull(),
    minimumViews: integer("minimumViews").notNull(),
    maximumPayableViews: integer("maximumPayableViews").notNull(),
    budgetMinor: integer("budgetMinor").notNull(),
    fundedMinor: integer("fundedMinor").default(0).notNull(),
    spentMinor: integer("spentMinor").default(0).notNull(),
    participantLimit: integer("participantLimit").notNull(),
    durationDays: integer("durationDays").notNull(),
    strictVerification: boolean("strictVerification").default(false).notNull(),
    status: varchar("status", {
      length: 20,
      enum: ["draft", "pending_funding", "pending_review", "active", "paused", "closed"],
    }).default("pending_funding").notNull(),
    activeAt: ts("activeAt"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [index("ad_campaign_status_idx").on(table.status, table.createdAt)]
);

export const whatsappSubmissions = pgTable(
  "whatsapp_submissions",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaignId").notNull(),
    userId: integer("userId").notNull(),
    campaignReference: varchar("campaignReference", { length: 32 }).notNull(),
    postedAt: ts("postedAt").notNull(),
    /** Views the member says the screenshot shows. Never paid directly. */
    reportedViews: integer("reportedViews").notNull(),
    /** Views an administrator approved after reviewing the evidence. */
    eligibleViews: integer("eligibleViews").default(0).notNull(),
    statusScreenshotAssetId: integer("statusScreenshotAssetId").notNull(),
    insightsScreenshotAssetId: integer("insightsScreenshotAssetId").notNull(),
    statusScreenshotHash: varchar("statusScreenshotHash", { length: 64 }).notNull(),
    insightsScreenshotHash: varchar("insightsScreenshotHash", { length: 64 }).notNull(),
    status: varchar("status", { length: 16, enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
    rewardMinor: integer("rewardMinor").default(0).notNull(),
    reviewerId: integer("reviewerId"),
    reviewNote: text("reviewNote"),
    submittedAt: ts("submittedAt").defaultNow().notNull(),
    reviewedAt: ts("reviewedAt"),
  },
  table => [
    uniqueIndex("wa_submission_campaign_user_uq").on(table.campaignId, table.userId),
    index("wa_submission_status_idx").on(table.status, table.submittedAt),
    index("wa_status_screenshot_hash_idx").on(table.statusScreenshotHash),
    index("wa_insights_screenshot_hash_idx").on(table.insightsScreenshotHash),
  ]
);

export const uploadedAssets = pgTable(
  "uploaded_assets",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    contentType: varchar("contentType", { length: 80 }).notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    purpose: varchar("purpose", { length: 16, enum: ["campaign", "evidence", "announcement", "task"] }).notNull(),
    createdAt: createdAt(),
  },
  table => [
    index("uploaded_asset_user_purpose_idx").on(table.userId, table.purpose),
    uniqueIndex("uploaded_asset_sha_purpose_uq").on(table.sha256, table.purpose),
  ]
);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    campaignId: integer("campaignId"),
    purpose: varchar("purpose", { length: 20, enum: ["activation", "campaign_funding"] }).notNull(),
    amountMinor: integer("amountMinor").notNull(),
    phone: varchar("phone", { length: 24 }).notNull(),
    merchantRequestId: varchar("merchantRequestId", { length: 128 }),
    checkoutRequestId: varchar("checkoutRequestId", { length: 128 }),
    receipt: varchar("receipt", { length: 64 }),
    status: varchar("status", {
      length: 24,
      enum: ["pending", "callback_received", "succeeded", "failed", "verification_required"],
    }).default("pending").notNull(),
    resultCode: varchar("resultCode", { length: 32 }),
    resultDescription: varchar("resultDescription", { length: 512 }),
    adminNote: text("adminNote"),
    verifiedAt: ts("verifiedAt"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex("payment_checkout_request_uq").on(table.checkoutRequestId),
    uniqueIndex("payment_receipt_uq").on(table.receipt),
    index("payment_user_created_idx").on(table.userId, table.createdAt),
    index("payment_status_idx").on(table.status, table.createdAt),
  ]
);

export const wallets = pgTable("wallets", {
  userId: integer("userId").primaryKey(),
  availableMinor: integer("availableMinor").default(0).notNull(),
  pendingMinor: integer("pendingMinor").default(0).notNull(),
  lifetimeMinor: integer("lifetimeMinor").default(0).notNull(),
  updatedAt: updatedAt(),
});

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    kind: varchar("kind", {
      length: 24,
      enum: [
        "task_credit",
        "ad_credit",
        "referral_credit",
        "daily_credit",
        "withdrawal_hold",
        "withdrawal_release",
        "withdrawal_paid",
        "withdrawal_fee",
        "adjustment",
      ],
    }).notNull(),
    amountMinor: integer("amountMinor").notNull(),
    direction: varchar("direction", { length: 8, enum: ["credit", "debit"] }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
    referenceType: varchar("referenceType", { length: 32 }).notNull(),
    referenceId: integer("referenceId").notNull(),
    note: varchar("note", { length: 240 }),
    createdAt: createdAt(),
  },
  table => [index("ledger_user_created_idx").on(table.userId, table.createdAt)]
);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    amountMinor: integer("amountMinor").notNull(),
    feeMinor: integer("feeMinor").default(0).notNull(),
    payoutMinor: integer("payoutMinor").notNull(),
    mpesaPhone: varchar("mpesaPhone", { length: 24 }).notNull(),
    status: varchar("status", {
      length: 16,
      enum: ["pending", "processing", "paid", "payout_failed", "rejected"],
    }).default("pending").notNull(),
    /** M-Pesa B2C references. Paid is only set from a matching provider result. */
    conversationId: varchar("conversationId", { length: 128 }),
    originatorConversationId: varchar("originatorConversationId", { length: 128 }),
    payoutReference: varchar("payoutReference", { length: 96 }),
    payoutResultCode: varchar("payoutResultCode", { length: 32 }),
    payoutResultDesc: varchar("payoutResultDesc", { length: 512 }),
    adminNote: text("adminNote"),
    reviewedById: integer("reviewedById"),
    paidAt: ts("paidAt"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index("withdrawal_user_created_idx").on(table.userId, table.createdAt),
    index("withdrawal_status_idx").on(table.status, table.createdAt),
    uniqueIndex("withdrawal_conversation_uq").on(table.conversationId),
    uniqueIndex("withdrawal_originator_uq").on(table.originatorConversationId),
    uniqueIndex("withdrawal_payout_ref_uq").on(table.payoutReference),
  ]
);

export const referrals = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    referrerId: integer("referrerId").notNull(),
    referredUserId: integer("referredUserId").notNull().unique(),
    commissionMinor: integer("commissionMinor").default(0).notNull(),
    status: varchar("status", { length: 12, enum: ["pending", "credited"] }).default("pending").notNull(),
    creditedAt: ts("creditedAt"),
    createdAt: createdAt(),
  },
  table => [index("referrals_referrer_idx").on(table.referrerId, table.createdAt)]
);

export const appSettings = pgTable("app_settings", {
  settingKey: varchar("settingKey", { length: 100 }).primaryKey(),
  valueText: text("valueText").notNull(),
  updatedById: integer("updatedById"),
  updatedAt: updatedAt(),
});

export const memberReviews = pgTable(
  "member_reviews",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().unique(),
    /** Public name the member chose, e.g. "Akinyi M." */
    displayName: varchar("displayName", { length: 40 }).notNull(),
    county: varchar("county", { length: 100 }),
    showCounty: boolean("showCounty").default(false).notNull(),
    rating: integer("rating").notNull(),
    content: text("content").notNull(),
    status: varchar("status", { length: 16, enum: ["pending", "approved", "rejected"] }).default("pending").notNull(),
    reviewerId: integer("reviewerId"),
    reviewNote: text("reviewNote"),
    approvedAt: ts("approvedAt"),
    deletedAt: ts("deletedAt"),
    submittedAt: ts("submittedAt").defaultNow().notNull(),
    updatedAt: updatedAt(),
  },
  table => [index("member_review_status_rating_idx").on(table.status, table.rating)]
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    subject: varchar("subject", { length: 180 }).notNull(),
    message: text("message").notNull(),
    status: varchar("status", { length: 16, enum: ["open", "answered", "closed"] }).default("open").notNull(),
    adminReply: text("adminReply"),
    assignedToId: integer("assignedToId"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index("support_user_created_idx").on(table.userId, table.createdAt),
    index("support_status_idx").on(table.status, table.createdAt),
  ]
);

export const announcements = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 140 }).notNull(),
    body: text("body").notNull(),
    mediaKey: varchar("mediaKey", { length: 512 }),
    mediaType: varchar("mediaType", { length: 8, enum: ["image", "video"] }),
    linkUrl: varchar("linkUrl", { length: 2048 }),
    linkLabel: varchar("linkLabel", { length: 40 }),
    /** When set, the popup is labelled "Sponsored · <name>". */
    sponsorName: varchar("sponsorName", { length: 120 }),
    audience: varchar("audience", {
      length: 20,
      enum: ["all", "members", "activated", "not_activated", "advertisers", "visitors"],
    }).default("members").notNull(),
    status: varchar("status", { length: 12, enum: ["draft", "published", "paused"] }).default("draft").notNull(),
    publishAt: ts("publishAt").defaultNow().notNull(),
    expiresAt: ts("expiresAt"),
    impressions: integer("impressions").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    createdById: integer("createdById").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [index("announcement_status_idx").on(table.status, table.publishAt)]
);

export const announcementViews = pgTable(
  "announcement_views",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcementId").notNull(),
    userId: integer("userId").notNull(),
    seenAt: ts("seenAt").defaultNow().notNull(),
    clickedAt: ts("clickedAt"),
    dismissedAt: ts("dismissedAt"),
  },
  table => [uniqueIndex("announcement_view_uq").on(table.announcementId, table.userId)]
);

/** Delivery log for transactional email. Never stores codes or message bodies. */
export const emailLog = pgTable(
  "email_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId"),
    template: varchar("template", { length: 40 }).notNull(),
    subject: varchar("subject", { length: 200 }).notNull(),
    status: varchar("status", { length: 12, enum: ["sent", "failed", "skipped"] }).notNull(),
    errorText: varchar("errorText", { length: 240 }),
    createdAt: createdAt(),
  },
  table => [index("email_log_created_idx").on(table.createdAt)]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actorId"),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("targetType", { length: 60 }).notNull(),
    targetId: integer("targetId"),
    detailsText: text("detailsText"),
    createdAt: createdAt(),
  },
  table => [
    index("audit_actor_created_idx").on(table.actorId, table.createdAt),
    index("audit_target_idx").on(table.targetType, table.targetId),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Task = typeof tasks.$inferSelect;

/**
 * File bytes kept in Postgres when no S3 bucket or persistent disk is configured,
 * so uploads survive restarts and redeploys on hosts with ephemeral disks.
 */
export const storedFiles = pgTable("stored_files", {
  storageKey: varchar("storageKey", { length: 512 }).primaryKey(),
  contentType: varchar("contentType", { length: 80 }).notNull(),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});
