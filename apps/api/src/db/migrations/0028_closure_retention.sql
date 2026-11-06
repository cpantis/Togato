ALTER TABLE "clients" ADD COLUMN "retention_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "closure_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "closure_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "closure_scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "archived_retention_years" integer;