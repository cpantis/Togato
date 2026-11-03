CREATE TABLE "platform_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_organization_id" uuid,
	"details" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "support_access_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "support_access_granted_by" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
CREATE INDEX "platform_audit_created_idx" ON "platform_audit_log" USING btree ("created_at");