-- Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
-- Abetworks Proprietary and Confidential.
--
-- AbetTrust audit-evidence-svc — durable, tamper-evident WORM audit log.
--
--  * audit_event : APPEND-ONLY, per-tenant hash chain. Each row's hash folds in
--    the previous row's hash (prev_hash), so any modification or deletion of an
--    earlier row breaks verification. A trigger blocks UPDATE/DELETE, and RLS
--    isolates each tenant's chain. This is the database-level WORM guarantee
--    that regulated buyers ask for (mirrors S3 Object Lock in production).
--  * evidence_pack : generated auditor exports (Merkle root + pack hash),
--    also append-only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS audit_event (
  tenant_id  uuid NOT NULL,
  seq        bigint NOT NULL,               -- per-tenant monotonic sequence
  actor      text NOT NULL,
  action     text NOT NULL CHECK (action IN ('read','write','export')),
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  fields     text[],
  at         timestamptz NOT NULL DEFAULT now(),
  prev_hash  char(64) NOT NULL,
  hash       char(64) NOT NULL,
  PRIMARY KEY (tenant_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_at ON audit_event (tenant_id, at);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_event (tenant_id, action);

CREATE TABLE IF NOT EXISTS evidence_pack (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  period       text NOT NULL,
  event_count  integer NOT NULL,
  merkle_root  char(64) NOT NULL,
  hash         char(64) NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pack_tenant ON evidence_pack (tenant_id);

-- Append-only enforcement: block UPDATE/DELETE on both tables.
CREATE OR REPLACE FUNCTION audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_no_mutate ON audit_event;
CREATE TRIGGER trg_audit_no_mutate
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();

DROP TRIGGER IF EXISTS trg_pack_no_mutate ON evidence_pack;
CREATE TRIGGER trg_pack_no_mutate
  BEFORE UPDATE OR DELETE ON evidence_pack
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();

-- Row-Level Security across both tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_event','evidence_pack'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;
