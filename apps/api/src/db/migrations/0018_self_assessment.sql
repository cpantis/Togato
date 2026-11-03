CREATE TYPE "public"."referral_status" AS ENUM('nou', 'acceptat', 'respins');--> statement-breakpoint
ALTER TYPE "public"."system_source" ADD VALUE 'autoevaluare';--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"self_assessment_id" uuid,
	"status" "referral_status" DEFAULT 'nou' NOT NULL,
	"payload" jsonb NOT NULL,
	"message" text,
	"response_message" text,
	"client_id" uuid,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "self_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"company_name" text NOT NULL,
	"cui" text,
	"county" text,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "directory_listed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "directory_county" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "directory_city" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "directory_description" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "directory_website" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "directory_email" text;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_self_assessment_id_self_assessments_id_fk" FOREIGN KEY ("self_assessment_id") REFERENCES "public"."self_assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referrals_org_idx" ON "referrals" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_org_assessment_unique" ON "referrals" USING btree ("organization_id","self_assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "self_assessments_token_unique" ON "self_assessments" USING btree ("token_hash");