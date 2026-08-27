-- Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
-- Abetworks Proprietary and Confidential.
--
-- AbetVerticals attribution-svc — immutable, append-only attribution ledger,
-- isolated per tenant with PostgreSQL Row-Level Security. Real-estate
-- channel-partner payouts depend on this being an uncontestable source of
-- truth, so the table is append-only: a trigger blocks UPDATE and DELETE.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS attribution_event (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  record_id    text NOT NULL,
  source       text NOT NULL,
  campaign     text,
  partner_code text,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  -- Monotonic sequence for stable ordering of same-timestamp touches.
  seq          bigserial NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attr_record ON attribution_event (tenant_id, record_id, occurred_at, seq);

-- Append-only: block mutation so the ledger is tamper-evident.
CREATE OR REPLACE FUNCTION attribution_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'attribution_event is append-only; % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attr_no_mutate ON attribution_event;
CREATE TRIGGER trg_attr_no_mutate
  BEFORE UPDATE OR DELETE ON attribution_event
  FOR EACH ROW EXECUTE FUNCTION attribution_append_only();

ALTER TABLE attribution_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribution_event FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON attribution_event;
CREATE POLICY tenant_isolation ON attribution_event
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
