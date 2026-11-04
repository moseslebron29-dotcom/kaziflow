CREATE TABLE `ad_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`advertiserId` int NOT NULL,
	`reference` varchar(32) NOT NULL,
	`title` varchar(180) NOT NULL,
	`advertiserName` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`instructions` text NOT NULL,
	`mediaKey` varchar(512),
	`mediaType` enum('image','video') NOT NULL DEFAULT 'image',
	`rateMinor` int NOT NULL,
	`minimumViews` int NOT NULL,
	`maximumPayableViews` int NOT NULL,
	`budgetMinor` int NOT NULL,
	`fundedMinor` int NOT NULL DEFAULT 0,
	`spentMinor` int NOT NULL DEFAULT 0,
	`participantLimit` int NOT NULL,
	`durationDays` int NOT NULL,
	`strictVerification` boolean NOT NULL DEFAULT false,
	`status` enum('draft','pending_funding','pending_review','active','paused','closed') NOT NULL DEFAULT 'pending_funding',
	`activeAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ad_campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `ad_campaigns_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`settingKey` varchar(100) NOT NULL,
	`valueText` text NOT NULL,
	`updatedById` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_settingKey` PRIMARY KEY(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int,
	`action` varchar(100) NOT NULL,
	`targetType` varchar(60) NOT NULL,
	`targetId` int,
	`detailsText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`kind` enum('email_verify','password_reset') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_tokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('task_credit','ad_credit','referral_credit','daily_credit','withdrawal_hold','withdrawal_release','withdrawal_paid','withdrawal_fee','adjustment') NOT NULL,
	`amountMinor` int NOT NULL,
	`direction` enum('credit','debit') NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`referenceType` varchar(32) NOT NULL,
	`referenceId` int NOT NULL,
	`note` varchar(240),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledger_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_entries_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `member_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`rating` int NOT NULL,
	`content` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewerId` int,
	`reviewNote` text,
	`deletedAt` timestamp,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_reviews_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `payment_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`campaignId` int,
	`purpose` enum('activation','campaign_funding') NOT NULL,
	`amountMinor` int NOT NULL,
	`phone` varchar(24) NOT NULL,
	`merchantRequestId` varchar(128),
	`checkoutRequestId` varchar(128),
	`receipt` varchar(64),
	`status` enum('pending','callback_received','succeeded','failed','verification_required') NOT NULL DEFAULT 'pending',
	`resultCode` varchar(32),
	`resultDescription` varchar(512),
	`adminNote` text,
	`verifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_checkout_request_uq` UNIQUE(`checkoutRequestId`),
	CONSTRAINT `payment_receipt_uq` UNIQUE(`receipt`)
);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrerId` int NOT NULL,
	`referredUserId` int NOT NULL,
	`commissionMinor` int NOT NULL DEFAULT 0,
	`status` enum('pending','credited') NOT NULL DEFAULT 'pending',
	`creditedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referrals_id` PRIMARY KEY(`id`),
	CONSTRAINT `referrals_referredUserId_unique` UNIQUE(`referredUserId`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`subject` varchar(180) NOT NULL,
	`message` text NOT NULL,
	`status` enum('open','answered','closed') NOT NULL DEFAULT 'open',
	`adminReply` text,
	`assignedToId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`submittedAt` timestamp,
	CONSTRAINT `task_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`attemptId` int,
	`proofText` text,
	`evidenceAssetId` int,
	`watchedSeconds` int,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`rewardMinor` int NOT NULL,
	`reviewerId` int,
	`reviewNote` text,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `task_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_submission_once_uq` UNIQUE(`taskId`,`userId`),
	CONSTRAINT `task_submission_attempt_uq` UNIQUE(`attemptId`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` enum('survey','video','social','website','microtask','chat','writing','daily','promotion') NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text NOT NULL,
	`instructions` text NOT NULL,
	`completionRequirements` text NOT NULL,
	`rewardMinor` int NOT NULL,
	`budgetMinor` int NOT NULL DEFAULT 0,
	`spentMinor` int NOT NULL DEFAULT 0,
	`estimatedMinutes` int NOT NULL,
	`slotLimit` int NOT NULL,
	`slotsTaken` int NOT NULL DEFAULT 0,
	`completionMode` enum('manual','video_progress','link_visit') NOT NULL DEFAULT 'manual',
	`externalUrl` varchar(2048),
	`status` enum('draft','active','paused','closed') NOT NULL DEFAULT 'draft',
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `uploaded_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`contentType` varchar(80) NOT NULL,
	`sizeBytes` int NOT NULL,
	`purpose` enum('campaign','evidence') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uploaded_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uploaded_assets_storageKey_unique` UNIQUE(`storageKey`),
	CONSTRAINT `uploaded_assets_sha256_unique` UNIQUE(`sha256`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`userId` int NOT NULL,
	`availableMinor` int NOT NULL DEFAULT 0,
	`pendingMinor` int NOT NULL DEFAULT 0,
	`lifetimeMinor` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallets_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int NOT NULL,
	`campaignReference` varchar(32) NOT NULL,
	`postedAt` timestamp NOT NULL,
	`reportedViews` int NOT NULL,
	`eligibleViews` int NOT NULL DEFAULT 0,
	`statusScreenshotAssetId` int NOT NULL,
	`insightsScreenshotAssetId` int NOT NULL,
	`statusScreenshotHash` varchar(64) NOT NULL,
	`insightsScreenshotHash` varchar(64) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`rewardMinor` int NOT NULL DEFAULT 0,
	`reviewerId` int,
	`reviewNote` text,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `whatsapp_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `wa_submission_campaign_user_uq` UNIQUE(`campaignId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `withdrawals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amountMinor` int NOT NULL,
	`feeMinor` int NOT NULL DEFAULT 0,
	`payoutMinor` int NOT NULL,
	`mpesaPhone` varchar(24) NOT NULL,
	`status` enum('pending','processing','paid','rejected') NOT NULL DEFAULT 'pending',
	`payoutReference` varchar(96),
	`adminNote` text,
	`reviewedById` int,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `withdrawals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `emailNormalized` varchar(320);--> statement-breakpoint
ALTER TABLE `users` ADD `accountType` varchar(24) DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(24);--> statement-breakpoint
ALTER TABLE `users` ADD `county` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `sessionVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mpesaPhone` varchar(24);--> statement-breakpoint
ALTER TABLE `users` ADD `referralCode` varchar(24);--> statement-breakpoint
ALTER TABLE `users` ADD `referredById` int;--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `activatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `suspendedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_normalized_uq` UNIQUE(`emailNormalized`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_referral_code_uq` UNIQUE(`referralCode`);--> statement-breakpoint
CREATE INDEX `ad_campaign_status_idx` ON `ad_campaigns` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_actor_created_idx` ON `audit_events` (`actorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_target_idx` ON `audit_events` (`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `auth_tokens_user_kind_idx` ON `auth_tokens` (`userId`,`kind`);--> statement-breakpoint
CREATE INDEX `ledger_user_created_idx` ON `ledger_entries` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `member_review_status_rating_idx` ON `member_reviews` (`status`,`rating`);--> statement-breakpoint
CREATE INDEX `payment_user_created_idx` ON `payment_attempts` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payment_status_idx` ON `payment_attempts` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `referrals_referrer_idx` ON `referrals` (`referrerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `support_user_created_idx` ON `support_tickets` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `support_status_idx` ON `support_tickets` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `task_attempt_user_task_idx` ON `task_attempts` (`userId`,`taskId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `task_submission_status_idx` ON `task_submissions` (`status`,`submittedAt`);--> statement-breakpoint
CREATE INDEX `tasks_status_category_idx` ON `tasks` (`status`,`category`);--> statement-breakpoint
CREATE INDEX `uploaded_asset_user_purpose_idx` ON `uploaded_assets` (`userId`,`purpose`);--> statement-breakpoint
CREATE INDEX `wa_submission_status_idx` ON `whatsapp_submissions` (`status`,`submittedAt`);--> statement-breakpoint
CREATE INDEX `wa_status_screenshot_hash_idx` ON `whatsapp_submissions` (`statusScreenshotHash`);--> statement-breakpoint
CREATE INDEX `wa_insights_screenshot_hash_idx` ON `whatsapp_submissions` (`insightsScreenshotHash`);--> statement-breakpoint
CREATE INDEX `withdrawal_user_created_idx` ON `withdrawals` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `withdrawal_status_idx` ON `withdrawals` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_referred_by_idx` ON `users` (`referredById`);