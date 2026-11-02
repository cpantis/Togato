CREATE TYPE "public"."obligation_status" AS ENUM('de_facut', 'in_lucru', 'indeplinit', 'nu_se_aplica');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('trial', 'activ', 'suspendat');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('propus', 'aprobat', 'respins');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('neclasificat', 'minim', 'transparenta', 'risc_ridicat', 'interzis');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'membru');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('activ', 'dezactivat');--> statement-breakpoint
CREATE TABLE "ai_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor" text,
	"description" text,
	"purpose" text,
	"department" text,
	"answers" jsonb NOT NULL,
	"risk_level" "risk_level" DEFAULT 'neclasificat' NOT NULL,
	"classification" jsonb,
	"review_status" "review_status" DEFAULT 'propus' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"ai_memo" text,
	"ai_memo_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"cui" text,
	"name" text NOT NULL,
	"reg_com" text,
	"address" text,
	"city" text,
	"county" text,
	"caen" text,
	"caen_description" text,
	"employees" integer,
	"turnover" bigint,
	"vat_payer" boolean,
	"contact_name" text,
	"contact_email" text,
	"notes" text,
	"source_data" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"ai_system_id" uuid,
	"code" text NOT NULL,
	"article" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"applies_from" date NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"status" "obligation_status" DEFAULT 'de_facut' NOT NULL,
	"note" text,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'start' NOT NULL,
	"status" "org_status" DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"brand_color" text,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'membru' NOT NULL,
	"status" "user_status" DEFAULT 'activ' NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_systems" ADD CONSTRAINT "ai_systems_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD CONSTRAINT "ai_systems_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD CONSTRAINT "ai_systems_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_systems" ADD CONSTRAINT "ai_systems_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_ai_system_id_ai_systems_id_fk" FOREIGN KEY ("ai_system_id") REFERENCES "public"."ai_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_systems_org_idx" ON "ai_systems" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_systems_client_idx" ON "ai_systems" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "audit_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "clients_org_idx" ON "clients" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_org_cui_unique" ON "clients" USING btree ("organization_id","cui");--> statement-breakpoint
CREATE INDEX "obligations_org_idx" ON "obligations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "obligations_client_idx" ON "obligations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "obligations_system_idx" ON "obligations" USING btree ("ai_system_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");