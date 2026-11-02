ALTER TABLE "ai_systems" ADD COLUMN "ruleset_version" text DEFAULT '2026.1' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "reclass_note" text;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "reclassified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "risk_override" "risk_level";--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "override_reason" text;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "override_by" uuid;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD CONSTRAINT "ai_systems_override_by_users_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_systems_ruleset_idx" ON "ai_systems" USING btree ("ruleset_version");