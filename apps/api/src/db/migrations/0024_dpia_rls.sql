-- evaluările de impact: aceeași separare între cabinete (vezi 0010_row_level_security.sql)
ALTER TABLE "dpias" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dpias" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "dpias" TO togato_app;
