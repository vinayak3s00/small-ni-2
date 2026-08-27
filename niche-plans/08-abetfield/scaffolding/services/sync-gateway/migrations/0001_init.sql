-- Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
-- Abetworks Proprietary and Confidential.
--
-- AbetField sync-gateway — durable offline-sync op-log + synced state, isolated
-- per tenant via PostgreSQL Row-Level Security.
--
--  * sync_mutation  : APPEND-ONLY op-log. A UNIQUE(tenant, client_mutation_id)
--    makes replay idempotent even across processes/restarts. A trigger blocks
--    UPDATE/DELETE so the log is tamper-evident.
--  * synced_row     : current materialized state per (entity, entity id), used
--    for conflict resolution (LWW / server-authoritative / append-only).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sync_mutation (
  seq                bigserial PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  client_mutation_id text NOT NULL,
  entity             text NOT NULL CHECK (entity IN ('visit','field_order','stock_position')),
  op                 text NOT NULL CHECK (op IN ('create','update')),
  payload            jsonb NOT NULL,
  resolution         text NOT NULL,
  applied_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_mutation_id)      -- idempotent replay key
);
CREATE INDEX IF NOT EXISTS idx_mutation_tenant ON sync_mutation (tenant_id, seq);

CREATE OR REPLACE FUNCTION sync_mutation_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'sync_mutation is append-only; % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mutation_no_mutate ON sync_mutation;
CREATE TRIGGER trg_mutation_no_mutate
  BEFORE UPDATE OR DELETE ON sync_mutation
  FOR EACH ROW EXECUTE FUNCTION sync_mutation_append_only();

CREATE TABLE IF NOT EXISTS synced_row (
  tenant_id  uuid NOT NULL,
  entity     text NOT NULL,
  row_key    text NOT NULL,       -- entity id (or client_mutation_id for append-only visits)
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, entity, row_key)
);

-- Row-Level Security across both tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sync_mutation','synced_row'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;
