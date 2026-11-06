-- conturile existente sunt considerate confirmate; cabinetele existente au acceptat varianta inițială
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;--> statement-breakpoint
UPDATE "organizations" SET "legal_version" = 'initial', "legal_accepted_at" = "created_at" WHERE "legal_version" IS NULL;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "legal_acceptances" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "legal_acceptances" TO togato_app;
