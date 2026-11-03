CREATE TYPE "public"."breach_risk" AS ENUM('neevaluat', 'fara_risc', 'risc', 'risc_ridicat');--> statement-breakpoint
CREATE TYPE "public"."dsar_status" AS ENUM('primita', 'in_lucru', 'finalizata', 'respinsa');--> statement-breakpoint
CREATE TYPE "public"."dsar_type" AS ENUM('acces', 'rectificare', 'stergere', 'restrictionare', 'portabilitate', 'opozitie', 'decizii_automate');--> statement-breakpoint
CREATE TYPE "public"."processing_role" AS ENUM('operator', 'operator_asociat', 'persoana_imputernicita');--> statement-breakpoint
CREATE TABLE "breaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"breach_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subjects_affected" integer,
	"records_affected" integer,
	"risk" "breach_risk" DEFAULT 'neevaluat' NOT NULL,
	"risk_reasoning" text,
	"consequences" text,
	"measures" text,
	"authority_notified_at" timestamp with time zone,
	"authority_reference" text,
	"delay_reason" text,
	"subjects_notified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dsar_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "dsar_type" NOT NULL,
	"requester_name" text NOT NULL,
	"requester_contact" text,
	"received_on" date NOT NULL,
	"due_on" date NOT NULL,
	"extended" boolean DEFAULT false NOT NULL,
	"extension_reason" text,
	"identity_verified" boolean DEFAULT false NOT NULL,
	"status" "dsar_status" DEFAULT 'primita' NOT NULL,
	"details" text,
	"outcome" text,
	"closed_on" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"role" "processing_role" DEFAULT 'operator' NOT NULL,
	"controller_name" text,
	"legal_bases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"legal_basis_details" text,
	"special_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipients" text,
	"transfer_outside_eea" boolean DEFAULT false NOT NULL,
	"transfer_countries" text,
	"transfer_mechanism" text,
	"retention" text,
	"security_measures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"security_details" text,
	"large_scale" boolean DEFAULT false NOT NULL,
	"systematic_monitoring" boolean DEFAULT false NOT NULL,
	"automated_decisions" boolean DEFAULT false NOT NULL,
	"ai_system_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "breaches" ADD CONSTRAINT "breaches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaches" ADD CONSTRAINT "breaches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaches" ADD CONSTRAINT "breaches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "breaches_org_idx" ON "breaches" USING btree ("organization_id","closed_at");--> statement-breakpoint
CREATE INDEX "breaches_client_idx" ON "breaches" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "dsar_org_idx" ON "dsar_requests" USING btree ("organization_id","status","due_on");--> statement-breakpoint
CREATE INDEX "dsar_client_idx" ON "dsar_requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "processing_org_idx" ON "processing_activities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "processing_client_idx" ON "processing_activities" USING btree ("client_id");