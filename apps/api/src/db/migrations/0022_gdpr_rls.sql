-- GDPR: aceeași separare între cabinete (vezi 0010_row_level_security.sql)
ALTER TABLE "processing_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "processing_activities" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "dsar_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dsar_requests" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "breaches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "breaches" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "processing_activities", "dsar_requests", "breaches" TO togato_app;
