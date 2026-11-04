import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Application accounts retain the starter's stable openId column for a safe additive migration. */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    emailNormalized: varchar("emailNormalized", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin", "super_admin"])
      .default("user")
      .notNull(),
    accountType: varchar("accountType", { length: 24 })
      .default("member")
      .notNull(),
    phone: varchar("phone", { length: 24 }),
    county: varchar("county", { length: 100 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    sessionVersion: int("sessionVersion").default(0).notNull(),
    mpesaPhone: varchar("mpesaPhone", { length: 24 }),
    referralCode: varchar("referralCode", { length: 24 }),
    referredById: int("referredById"),
    emailVerifiedAt: timestamp("emailVerifiedAt"),
    activatedAt: timestamp("activatedAt"),
    suspendedAt: timestamp("suspendedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("users_email_normalized_uq").on(table.emailNormalized),
    uniqueIndex("users_referral_code_uq").on(table.referralCode),
    index("users_role_idx").on(table.role),
    index("users_referred_by_idx").on(table.referredById),
  ]
);

export const authTokens = mysqlTable(
  "auth_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    kind: mysqlEnum("kind", ["email_verify", "password_reset"]).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("auth_tokens_user_kind_idx").on(table.userId, table.kind)]
);

export const tasks = mysqlTable(
  "tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    category: mysqlEnum("category", [
      "survey",
      "video",
      "social",
      "website",
      "microtask",
      "chat",
      "writing",
      "daily",
      "promotion",
    ]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    instructions: text("instructions").notNull(),
    completionRequirements: text("completionRequirements").notNull(),
    rewardMinor: int("rewardMinor").notNull(),
    budgetMinor: int("budgetMinor").default(0).notNull(),
    spentMinor: int("spentMinor").default(0).notNull(),
    estimatedMinutes: int("estimatedMinutes").notNull(),
    slotLimit: int("slotLimit").notNull(),
    slotsTaken: int("slotsTaken").default(0).notNull(),
    completionMode: mysqlEnum("completionMode", [
      "manual",
      "video_progress",
      "link_visit",
    ])
      .default("manual")
      .notNull(),
    externalUrl: varchar("externalUrl", { length: 2048 }),
    status: mysqlEnum("status", ["draft", "active", "paused", "closed"])
      .default("draft")
      .notNull(),
    createdById: int("createdById").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("tasks_status_category_idx").on(table.status, table.category)]
);

export const taskSubmissions = mysqlTable(
  "task_submissions",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull(),
    userId: int("userId").notNull(),
    attemptId: int("attemptId"),
    proofText: text("proofText"),
    evidenceAssetId: int("evidenceAssetId"),
    watchedSeconds: int("watchedSeconds"),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .default("pending")
      .notNull(),
    rewardMinor: int("rewardMinor").notNull(),
    reviewerId: int("reviewerId"),
    reviewNote: text("reviewNote"),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    reviewedAt: timestamp("reviewedAt"),
  },
  table => [
    uniqueIndex("task_submission_once_uq").on(table.taskId, table.userId),
    uniqueIndex("task_submission_attempt_uq").on(table.attemptId),
    index("task_submission_status_idx").on(table.status, table.submittedAt),
  ]
);

export const taskAttempts = mysqlTable(
  "task_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull(),
    userId: int("userId").notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    submittedAt: timestamp("submittedAt"),
  },
  table => [
    index("task_attempt_user_task_idx").on(
      table.userId,
      table.taskId,
      table.startedAt
    ),
  ]
);

export const adCampaigns = mysqlTable(
  "ad_campaigns",
  {
    id: int("id").autoincrement().primaryKey(),
    advertiserId: int("advertiserId").notNull(),
    reference: varchar("reference", { length: 32 }).notNull().unique(),
    title: varchar("title", { length: 180 }).notNull(),
    advertiserName: varchar("advertiserName", { length: 160 }).notNull(),
    description: text("description").notNull(),
    instructions: text("instructions").notNull(),
    mediaKey: varchar("mediaKey", { length: 512 }),
    mediaType: mysqlEnum("mediaType", ["image", "video"])
      .default("image")
      .notNull(),
    rateMinor: int("rateMinor").notNull(),
    minimumViews: int("minimumViews").notNull(),
    maximumPayableViews: int("maximumPayableViews").notNull(),
    budgetMinor: int("budgetMinor").notNull(),
    fundedMinor: int("fundedMinor").default(0).notNull(),
    spentMinor: int("spentMinor").default(0).notNull(),
    participantLimit: int("participantLimit").notNull(),
    durationDays: int("durationDays").notNull(),
    strictVerification: boolean("strictVerification").default(false).notNull(),
    status: mysqlEnum("status", [
      "draft",
      "pending_funding",
      "pending_review",
      "active",
      "paused",
      "closed",
    ])
      .default("pending_funding")
      .notNull(),
    activeAt: timestamp("activeAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("ad_campaign_status_idx").on(table.status, table.createdAt)]
);

export const whatsappSubmissions = mysqlTable(
  "whatsapp_submissions",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    userId: int("userId").notNull(),
    campaignReference: varchar("campaignReference", { length: 32 }).notNull(),
    postedAt: timestamp("postedAt").notNull(),
    reportedViews: int("reportedViews").notNull(),
    eligibleViews: int("eligibleViews").default(0).notNull(),
    statusScreenshotAssetId: int("statusScreenshotAssetId").notNull(),
    insightsScreenshotAssetId: int("insightsScreenshotAssetId").notNull(),
    statusScreenshotHash: varchar("statusScreenshotHash", {
      length: 64,
    }).notNull(),
    insightsScreenshotHash: varchar("insightsScreenshotHash", {
      length: 64,
    }).notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .default("pending")
      .notNull(),
    rewardMinor: int("rewardMinor").default(0).notNull(),
    reviewerId: int("reviewerId"),
    reviewNote: text("reviewNote"),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    reviewedAt: timestamp("reviewedAt"),
  },
  table => [
    uniqueIndex("wa_submission_campaign_user_uq").on(
      table.campaignId,
      table.userId
    ),
    index("wa_submission_status_idx").on(table.status, table.submittedAt),
    index("wa_status_screenshot_hash_idx").on(table.statusScreenshotHash),
    index("wa_insights_screenshot_hash_idx").on(table.insightsScreenshotHash),
  ]
);

export const uploadedAssets = mysqlTable(
  "uploaded_assets",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
    sha256: varchar("sha256", { length: 64 }).notNull().unique(),
    contentType: varchar("contentType", { length: 80 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    purpose: mysqlEnum("purpose", ["campaign", "evidence"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("uploaded_asset_user_purpose_idx").on(table.userId, table.purpose),
  ]
);

export const paymentAttempts = mysqlTable(
  "payment_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    campaignId: int("campaignId"),
    purpose: mysqlEnum("purpose", ["activation", "campaign_funding"]).notNull(),
    amountMinor: int("amountMinor").notNull(),
    phone: varchar("phone", { length: 24 }).notNull(),
    merchantRequestId: varchar("merchantRequestId", { length: 128 }),
    checkoutRequestId: varchar("checkoutRequestId", { length: 128 }),
    receipt: varchar("receipt", { length: 64 }),
    status: mysqlEnum("status", [
      "pending",
      "callback_received",
      "succeeded",
      "failed",
      "verification_required",
    ])
      .default("pending")
      .notNull(),
    resultCode: varchar("resultCode", { length: 32 }),
    resultDescription: varchar("resultDescription", { length: 512 }),
    adminNote: text("adminNote"),
    verifiedAt: timestamp("verifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("payment_checkout_request_uq").on(table.checkoutRequestId),
    uniqueIndex("payment_receipt_uq").on(table.receipt),
    index("payment_user_created_idx").on(table.userId, table.createdAt),
    index("payment_status_idx").on(table.status, table.createdAt),
  ]
);

export const wallets = mysqlTable("wallets", {
  userId: int("userId").primaryKey(),
  availableMinor: int("availableMinor").default(0).notNull(),
  pendingMinor: int("pendingMinor").default(0).notNull(),
  lifetimeMinor: int("lifetimeMinor").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const ledgerEntries = mysqlTable(
  "ledger_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    kind: mysqlEnum("kind", [
      "task_credit",
      "ad_credit",
      "referral_credit",
      "daily_credit",
      "withdrawal_hold",
      "withdrawal_release",
      "withdrawal_paid",
      "withdrawal_fee",
      "adjustment",
    ]).notNull(),
    amountMinor: int("amountMinor").notNull(),
    direction: mysqlEnum("direction", ["credit", "debit"]).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 })
      .notNull()
      .unique(),
    referenceType: varchar("referenceType", { length: 32 }).notNull(),
    referenceId: int("referenceId").notNull(),
    note: varchar("note", { length: 240 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("ledger_user_created_idx").on(table.userId, table.createdAt)]
);

export const withdrawals = mysqlTable(
  "withdrawals",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    amountMinor: int("amountMinor").notNull(),
    feeMinor: int("feeMinor").default(0).notNull(),
    payoutMinor: int("payoutMinor").notNull(),
    mpesaPhone: varchar("mpesaPhone", { length: 24 }).notNull(),
    status: mysqlEnum("status", ["pending", "processing", "paid", "rejected"])
      .default("pending")
      .notNull(),
    payoutReference: varchar("payoutReference", { length: 96 }),
    adminNote: text("adminNote"),
    reviewedById: int("reviewedById"),
    paidAt: timestamp("paidAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("withdrawal_user_created_idx").on(table.userId, table.createdAt),
    index("withdrawal_status_idx").on(table.status, table.createdAt),
  ]
);

export const referrals = mysqlTable(
  "referrals",
  {
    id: int("id").autoincrement().primaryKey(),
    referrerId: int("referrerId").notNull(),
    referredUserId: int("referredUserId").notNull().unique(),
    commissionMinor: int("commissionMinor").default(0).notNull(),
    status: mysqlEnum("status", ["pending", "credited"])
      .default("pending")
      .notNull(),
    creditedAt: timestamp("creditedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("referrals_referrer_idx").on(table.referrerId, table.createdAt),
  ]
);

export const appSettings = mysqlTable("app_settings", {
  settingKey: varchar("settingKey", { length: 100 }).primaryKey(),
  valueText: text("valueText").notNull(),
  updatedById: int("updatedById"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const memberReviews = mysqlTable(
  "member_reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    rating: int("rating").notNull(),
    content: text("content").notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .default("pending")
      .notNull(),
    reviewerId: int("reviewerId"),
    reviewNote: text("reviewNote"),
    deletedAt: timestamp("deletedAt"),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("member_review_status_rating_idx").on(table.status, table.rating),
  ]
);

export const supportTickets = mysqlTable(
  "support_tickets",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    subject: varchar("subject", { length: 180 }).notNull(),
    message: text("message").notNull(),
    status: mysqlEnum("status", ["open", "answered", "closed"])
      .default("open")
      .notNull(),
    adminReply: text("adminReply"),
    assignedToId: int("assignedToId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("support_user_created_idx").on(table.userId, table.createdAt),
    index("support_status_idx").on(table.status, table.createdAt),
  ]
);

export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: int("actorId"),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("targetType", { length: 60 }).notNull(),
    targetId: int("targetId"),
    detailsText: text("detailsText"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("audit_actor_created_idx").on(table.actorId, table.createdAt),
    index("audit_target_idx").on(table.targetType, table.targetId),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
