CREATE TYPE "public"."system_source" AS ENUM('cabinet', 'portal');--> statement-breakpoint
CREATE TABLE "portal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "source" "system_source" DEFAULT 'cabinet' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "portal_answers" jsonb;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "submitted_by_name" text;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD COLUMN "submitted_by_email" text;--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_links_token_unique" ON "portal_links" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_links_client_unique" ON "portal_links" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "portal_links_org_idx" ON "portal_links" USING btree ("organization_id");