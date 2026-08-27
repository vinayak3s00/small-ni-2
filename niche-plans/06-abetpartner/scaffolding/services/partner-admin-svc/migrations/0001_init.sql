-- Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
-- Abetworks Proprietary and Confidential.
--
-- AbetPartner partner-admin-svc — hierarchical tenancy. The PARTNER (agency) is
-- the tenant boundary: partner_id = app.tenant_id, and RLS isolates every row
-- so one agency can never see another agency's workspaces, grants, or usage.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- workspace: an isolated client tenant owned by a partner.
CREATE TABLE IF NOT EXISTS workspace (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL,               -- the tenant boundary
  tenant_id       uuid NOT NULL DEFAULT gen_random_uuid(),  -- client's own isolated tenant id
  client_name     text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  sender_identity text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, client_name)             -- no duplicate client per partner
);
CREATE INDEX IF NOT EXISTS idx_workspace_partner ON workspace (partner_id);

-- workspace_grant: scoped access a partner holds on one of its workspaces.
CREATE TABLE IF NOT EXISTS workspace_grant (
  id           bigserial PRIMARY KEY,
  partner_id   uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  scopes       text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_grant_ws ON workspace_grant (partner_id, workspace_id);

-- usage_event: metered units per workspace (drives billing rollup + margin).
CREATE TABLE IF NOT EXISTS usage_event (
  id           bigserial PRIMARY KEY,
  partner_id   uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  units        integer NOT NULL CHECK (units >= 0),
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_ws ON usage_event (partner_id, workspace_id);

-- Row-Level Security keyed on partner_id = app.tenant_id.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspace','workspace_grant','usage_event'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS partner_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY partner_isolation ON %I USING (partner_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (partner_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;
