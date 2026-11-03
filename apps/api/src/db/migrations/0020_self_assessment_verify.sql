ALTER TABLE "self_assessments" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "self_assessments" ADD COLUMN "verify_token_hash" text;--> statement-breakpoint
CREATE INDEX "self_assessments_email_idx" ON "self_assessments" USING btree ("contact_email");