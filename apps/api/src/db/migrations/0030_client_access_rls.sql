-- Accesul pe client (al doilea strat, peste izolarea pe cabinet): clienții restricționați și colaboratorii.
-- app.role / app.user_id sunt setate de withTenant; lipsa lor = membru fără acces suplimentar (doar clienții nerestricționați).
ALTER TABLE "client_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "client_access" TO togato_app
  USING (organization_id = current_setting('app.org_id')::uuid) WITH CHECK (organization_id = current_setting('app.org_id')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "client_access" TO togato_app;--> statement-breakpoint
-- rândul clientului e verificat cu propriile coloane (merge și la INSERT, când rândul nu există încă)
CREATE POLICY client_visibility ON "clients" AS RESTRICTIVE TO togato_app
  USING (
    coalesce(current_setting('app.role', true), '') = 'admin'
    OR (coalesce(current_setting('app.role', true), '') <> 'colaborator' AND (NOT restricted OR responsible_user_id = nullif(current_setting('app.user_id', true), '')::uuid))
    OR EXISTS (SELECT 1 FROM client_access a WHERE a.client_id = clients.id AND a.user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') = 'admin'
    OR (coalesce(current_setting('app.role', true), '') <> 'colaborator' AND (NOT restricted OR responsible_user_id = nullif(current_setting('app.user_id', true), '')::uuid))
    OR EXISTS (SELECT 1 FROM client_access a WHERE a.client_id = clients.id AND a.user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  );--> statement-breakpoint
-- pentru tabelele copil: clientul e vizibil dacă trece de politicile tabelului clients (SECURITY INVOKER: RLS se aplică)
CREATE OR REPLACE FUNCTION togato_client_visible(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
  AS $$ SELECT coalesce(current_setting('app.role', true), '') = 'admin' OR EXISTS (SELECT 1 FROM clients c WHERE c.id = cid) $$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION togato_client_visible(uuid) TO togato_app;--> statement-breakpoint
CREATE POLICY client_visibility ON "portal_links" AS RESTRICTIVE TO togato_app USING (togato_client_visible(client_id)) WITH CHECK (togato_client_visible(client_id));--> statement-breakpoint
CREATE POLICY client_visibility ON "ai_systems" AS RESTRICTIVE TO togato_app USING (togato_client_visible(client_id)) WITH CHECK (togato_client_visible(client_id));--> statement-breakpoint
CREATE POLICY client_visibility ON "obligations" AS RESTRICTIVE TO togato_app USING (togato_client_visible(client_id)) WITH CHECK (togato_client_visible(client_id));--> statement-breakpoint
CREATE POLICY client_visibility ON "analysis_snapshots" AS RESTRICTIVE TO togato_app USING (togato_client_visible(client_id)) WITH CHECK (togato_client_visible(client_id));--> statement-breakpoint
CREATE POLICY client_visibility ON "processing_activities" AS RESTRICTIVE TO togato_app USING (togato_client_visible(client_id)) WITH CHECK (togato_client_visible(client_id));--> statement-breakpoint
CREATE POLICY client_visibility ON "dpias" AS RESTRICTIVE TO togato_app USING (togato_client_visible(client_id)) WITH CHECK (togato_client_visible(client_id));--> statement-breakpoint
CREATE POLICY client_visibility ON "dsar_requests" AS RESTRICTIVE TO togato_app USING (togato_client_visible(client_id)) WITH CHECK (togato_client_visible(client_id));--> statement-breakpoint
CREATE POLICY client_visibility ON "breaches" AS RESTRICTIVE TO togato_app USING (togato_client_visible(client_id)) WITH CHECK (togato_client_visible(client_id));--> statement-breakpoint
CREATE POLICY client_visibility ON "evidence" AS RESTRICTIVE TO togato_app USING (togato_client_visible(client_id)) WITH CHECK (togato_client_visible(client_id));--> statement-breakpoint
CREATE POLICY client_visibility ON "referrals" AS RESTRICTIVE TO togato_app USING (client_id IS NULL OR togato_client_visible(client_id)) WITH CHECK (client_id IS NULL OR togato_client_visible(client_id));
