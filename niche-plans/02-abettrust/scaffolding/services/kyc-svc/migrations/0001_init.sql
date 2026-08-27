-- Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
-- Abetworks Proprietary and Confidential.
--
-- AbetTrust kyc-svc — KYC/suitability records + append-only disclosure/audit
-- trail, isolated per tenant via PostgreSQL Row-Level Security.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- kyc_record: one KYC/suitability record per party.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_record (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  party_id    text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','submitted','verified','rejected','expired')),
  documents   text[] NOT NULL DEFAULT '{}',
  disclosures text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_tenant ON kyc_record (tenant_id);

-- ---------------------------------------------------------------------------
-- kyc_trail: APPEND-ONLY audit trail. A trigger blocks UPDATE/DELETE so the
-- trail is tamper-evident at the database level (audit-grade requirement).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_trail (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  kyc_id     uuid NOT NULL,
  actor      text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('status_change','disclosure')),
  detail     text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trail_kyc ON kyc_trail (tenant_id, kyc_id, id);

CREATE OR REPLACE FUNCTION kyc_trail_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'kyc_trail is append-only; % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trail_no_mutate ON kyc_trail;
CREATE TRIGGER trg_trail_no_mutate
  BEFORE UPDATE OR DELETE ON kyc_trail
  FOR EACH ROW EXECUTE FUNCTION kyc_trail_append_only();

-- ---------------------------------------------------------------------------
-- Row-Level Security: isolate every row by the connection's tenant.
-- ---------------------------------------------------------------------------
ALTER TABLE kyc_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_record FORCE  ROW LEVEL SECURITY;
ALTER TABLE kyc_trail  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_trail  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON kyc_record;
CREATE POLICY tenant_isolation ON kyc_record
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON kyc_trail;
CREATE POLICY tenant_isolation ON kyc_trail
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
