CREATE TABLE "stored_files" (
	"storageKey" varchar(512) PRIMARY KEY NOT NULL,
	"contentType" varchar(80) NOT NULL,
	"data" "bytea" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "sponsorName" varchar(120);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "imageKey" varchar(512);