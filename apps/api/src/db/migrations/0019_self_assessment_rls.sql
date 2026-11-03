-- solicitările către cabinete: aceeași separare între cabinete (vezi 0010_row_level_security.sql)
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "referrals" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
-- autoevaluările nu aparțin niciunui cabinet: doar conexiunea de serviciu (rutele publice)
REVOKE ALL ON "self_assessments" FROM togato_app;
