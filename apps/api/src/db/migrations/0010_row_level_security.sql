-- Row-Level Security: cererile autentificate rulează cu rolul togato_app (SET LOCAL ROLE)
-- și app.org_id = cabinetul; Postgres filtrează singur rândurile altor cabinete.
-- Proprietarul tabelelor (conexiunea de serviciu: worker, migrații, rute publice) nu e afectat.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'togato_app') THEN
    CREATE ROLE togato_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;--> statement-breakpoint
GRANT togato_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO togato_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO togato_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO togato_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO togato_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO togato_app;--> statement-breakpoint
-- current_setting fără missing_ok: dacă app.org_id lipsește, interogarea eșuează (fail-closed)
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "organizations" TO togato_app
  USING (id = current_setting('app.org_id')::uuid) WITH CHECK (id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "users" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invitations" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "portal_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "portal_links" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "clients" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "ai_systems" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ai_systems" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "obligations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "obligations" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "analysis_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "analysis_snapshots" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_log" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "jobs" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sessions" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
-- tabele fără cabinet, inaccesibile cererilor autentificate (doar conexiunea de serviciu)
REVOKE ALL ON "password_resets" FROM togato_app;
