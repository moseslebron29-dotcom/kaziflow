CREATE TABLE "ad_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"advertiserId" integer NOT NULL,
	"reference" varchar(32) NOT NULL,
	"title" varchar(180) NOT NULL,
	"advertiserName" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"instructions" text NOT NULL,
	"mediaKey" varchar(512),
	"mediaType" varchar(8) DEFAULT 'image' NOT NULL,
	"rateMinor" integer NOT NULL,
	"minimumViews" integer NOT NULL,
	"maximumPayableViews" integer NOT NULL,
	"budgetMinor" integer NOT NULL,
	"fundedMinor" integer DEFAULT 0 NOT NULL,
	"spentMinor" integer DEFAULT 0 NOT NULL,
	"participantLimit" integer NOT NULL,
	"durationDays" integer NOT NULL,
	"strictVerification" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'pending_funding' NOT NULL,
	"activeAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_campaigns_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "announcement_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"announcementId" integer NOT NULL,
	"userId" integer NOT NULL,
	"seenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"clickedAt" timestamp with time zone,
	"dismissedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(140) NOT NULL,
	"body" text NOT NULL,
	"mediaKey" varchar(512),
	"mediaType" varchar(8),
	"linkUrl" varchar(2048),
	"linkLabel" varchar(40),
	"audience" varchar(20) DEFAULT 'members' NOT NULL,
	"status" varchar(12) DEFAULT 'draft' NOT NULL,
	"publishAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"createdById" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"settingKey" varchar(100) PRIMARY KEY NOT NULL,
	"valueText" text NOT NULL,
	"updatedById" integer,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorId" integer,
	"action" varchar(100) NOT NULL,
	"targetType" varchar(60) NOT NULL,
	"targetId" integer,
	"detailsText" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"template" varchar(40) NOT NULL,
	"subject" varchar(200) NOT NULL,
	"status" varchar(12) NOT NULL,
	"errorText" varchar(240),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"purpose" varchar(24) NOT NULL,
	"codeHash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"consumedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"kind" varchar(24) NOT NULL,
	"amountMinor" integer NOT NULL,
	"direction" varchar(8) NOT NULL,
	"idempotencyKey" varchar(128) NOT NULL,
	"referenceType" varchar(32) NOT NULL,
	"referenceId" integer NOT NULL,
	"note" varchar(240),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "member_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"displayName" varchar(40) NOT NULL,
	"county" varchar(100),
	"showCounty" boolean DEFAULT false NOT NULL,
	"rating" integer NOT NULL,
	"content" text NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"reviewerId" integer,
	"reviewNote" text,
	"approvedAt" timestamp with time zone,
	"deletedAt" timestamp with time zone,
	"submittedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_reviews_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"campaignId" integer,
	"purpose" varchar(20) NOT NULL,
	"amountMinor" integer NOT NULL,
	"phone" varchar(24) NOT NULL,
	"merchantRequestId" varchar(128),
	"checkoutRequestId" varchar(128),
	"receipt" varchar(64),
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"resultCode" varchar(32),
	"resultDescription" varchar(512),
	"adminNote" text,
	"verifiedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrerId" integer NOT NULL,
	"referredUserId" integer NOT NULL,
	"commissionMinor" integer DEFAULT 0 NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"creditedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referredUserId_unique" UNIQUE("referredUserId")
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"subject" varchar(180) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"adminReply" text,
	"assignedToId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskId" integer NOT NULL,
	"userId" integer NOT NULL,
	"periodKey" varchar(10) DEFAULT 'once' NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"submittedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskId" integer NOT NULL,
	"userId" integer NOT NULL,
	"attemptId" integer,
	"periodKey" varchar(10) DEFAULT 'once' NOT NULL,
	"proofText" text,
	"evidenceAssetId" integer,
	"watchedSeconds" integer,
	"quizScore" integer,
	"quizAnswersJson" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"rewardMinor" integer NOT NULL,
	"reviewerId" integer,
	"reviewNote" text,
	"submittedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(40) NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"instructions" text NOT NULL,
	"completionRequirements" text NOT NULL,
	"rewardMinor" integer NOT NULL,
	"budgetMinor" integer DEFAULT 0 NOT NULL,
	"spentMinor" integer DEFAULT 0 NOT NULL,
	"estimatedMinutes" integer NOT NULL,
	"slotLimit" integer NOT NULL,
	"slotsTaken" integer DEFAULT 0 NOT NULL,
	"completionMode" varchar(24) DEFAULT 'manual' NOT NULL,
	"externalUrl" varchar(2048),
	"requiresEvidence" boolean DEFAULT false NOT NULL,
	"repeatDaily" boolean DEFAULT false NOT NULL,
	"quizJson" text,
	"passMark" integer DEFAULT 70 NOT NULL,
	"autoApproveQuiz" boolean DEFAULT false NOT NULL,
	"sponsorName" varchar(160),
	"featured" boolean DEFAULT false NOT NULL,
	"startsAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"createdById" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploaded_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"contentType" varchar(80) NOT NULL,
	"sizeBytes" integer NOT NULL,
	"purpose" varchar(16) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploaded_assets_storageKey_unique" UNIQUE("storageKey")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"emailNormalized" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(16) DEFAULT 'user' NOT NULL,
	"accountType" varchar(24) DEFAULT 'member' NOT NULL,
	"phone" varchar(24),
	"county" varchar(100),
	"businessName" varchar(160),
	"passwordHash" varchar(255),
	"sessionVersion" integer DEFAULT 0 NOT NULL,
	"mpesaPhone" varchar(24),
	"referralCode" varchar(24),
	"referredById" integer,
	"emailVerifiedAt" timestamp with time zone,
	"activatedAt" timestamp with time zone,
	"suspendedAt" timestamp with time zone,
	"marketingOptIn" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"userId" integer PRIMARY KEY NOT NULL,
	"availableMinor" integer DEFAULT 0 NOT NULL,
	"pendingMinor" integer DEFAULT 0 NOT NULL,
	"lifetimeMinor" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaignId" integer NOT NULL,
	"userId" integer NOT NULL,
	"campaignReference" varchar(32) NOT NULL,
	"postedAt" timestamp with time zone NOT NULL,
	"reportedViews" integer NOT NULL,
	"eligibleViews" integer DEFAULT 0 NOT NULL,
	"statusScreenshotAssetId" integer NOT NULL,
	"insightsScreenshotAssetId" integer NOT NULL,
	"statusScreenshotHash" varchar(64) NOT NULL,
	"insightsScreenshotHash" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"rewardMinor" integer DEFAULT 0 NOT NULL,
	"reviewerId" integer,
	"reviewNote" text,
	"submittedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"amountMinor" integer NOT NULL,
	"feeMinor" integer DEFAULT 0 NOT NULL,
	"payoutMinor" integer NOT NULL,
	"mpesaPhone" varchar(24) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"conversationId" varchar(128),
	"originatorConversationId" varchar(128),
	"payoutReference" varchar(96),
	"payoutResultCode" varchar(32),
	"payoutResultDesc" varchar(512),
	"adminNote" text,
	"reviewedById" integer,
	"paidAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ad_campaign_status_idx" ON "ad_campaigns" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_view_uq" ON "announcement_views" USING btree ("announcementId","userId");--> statement-breakpoint
CREATE INDEX "announcement_status_idx" ON "announcements" USING btree ("status","publishAt");--> statement-breakpoint
CREATE INDEX "audit_actor_created_idx" ON "audit_events" USING btree ("actorId","createdAt");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_events" USING btree ("targetType","targetId");--> statement-breakpoint
CREATE INDEX "email_log_created_idx" ON "email_log" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "email_otps_user_purpose_idx" ON "email_otps" USING btree ("userId","purpose","createdAt");--> statement-breakpoint
CREATE INDEX "ledger_user_created_idx" ON "ledger_entries" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "member_review_status_rating_idx" ON "member_reviews" USING btree ("status","rating");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_checkout_request_uq" ON "payment_attempts" USING btree ("checkoutRequestId");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_receipt_uq" ON "payment_attempts" USING btree ("receipt");--> statement-breakpoint
CREATE INDEX "payment_user_created_idx" ON "payment_attempts" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment_attempts" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrerId","createdAt");--> statement-breakpoint
CREATE INDEX "support_user_created_idx" ON "support_tickets" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "support_status_idx" ON "support_tickets" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "task_attempt_user_task_idx" ON "task_attempts" USING btree ("userId","taskId","startedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "task_submission_once_uq" ON "task_submissions" USING btree ("taskId","userId","periodKey");--> statement-breakpoint
CREATE UNIQUE INDEX "task_submission_attempt_uq" ON "task_submissions" USING btree ("attemptId");--> statement-breakpoint
CREATE INDEX "task_submission_status_idx" ON "task_submissions" USING btree ("status","submittedAt");--> statement-breakpoint
CREATE INDEX "tasks_status_category_idx" ON "tasks" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "uploaded_asset_user_purpose_idx" ON "uploaded_assets" USING btree ("userId","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "uploaded_asset_sha_purpose_uq" ON "uploaded_assets" USING btree ("sha256","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_uq" ON "users" USING btree ("emailNormalized");--> statement-breakpoint
CREATE UNIQUE INDEX "users_referral_code_uq" ON "users" USING btree ("referralCode");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_referred_by_idx" ON "users" USING btree ("referredById");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_submission_campaign_user_uq" ON "whatsapp_submissions" USING btree ("campaignId","userId");--> statement-breakpoint
CREATE INDEX "wa_submission_status_idx" ON "whatsapp_submissions" USING btree ("status","submittedAt");--> statement-breakpoint
CREATE INDEX "wa_status_screenshot_hash_idx" ON "whatsapp_submissions" USING btree ("statusScreenshotHash");--> statement-breakpoint
CREATE INDEX "wa_insights_screenshot_hash_idx" ON "whatsapp_submissions" USING btree ("insightsScreenshotHash");--> statement-breakpoint
CREATE INDEX "withdrawal_user_created_idx" ON "withdrawals" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "withdrawal_status_idx" ON "withdrawals" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_conversation_uq" ON "withdrawals" USING btree ("conversationId");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_originator_uq" ON "withdrawals" USING btree ("originatorConversationId");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_payout_ref_uq" ON "withdrawals" USING btree ("payoutReference");