ALTER TABLE "clients" ADD COLUMN "ai_excluded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "conflict_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "conflict_note" text;