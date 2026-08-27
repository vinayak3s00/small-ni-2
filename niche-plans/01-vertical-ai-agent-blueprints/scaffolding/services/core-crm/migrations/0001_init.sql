-- Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
-- Abetworks Proprietary and Confidential.
--
-- AbetVerticals core-crm — initial schema with tenant isolation via
-- PostgreSQL Row-Level Security. Every table carries tenant_id and enforces
-- isolation through current_setting('app.tenant_id'), which withTenantScope()
-- sets per transaction.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- record: the one data-model record (lead/patient/applicant) per vertical.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS record (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  vertical      text NOT NULL CHECK (vertical IN ('realty', 'care', 'admit')),
  stage         text NOT NULL DEFAULT 'new',
  source        text NOT NULL,
  party_name    text NOT NULL,
  party_phones  text[] NOT NULL DEFAULT '{}',
  party_langs   text[] NOT NULL DEFAULT '{}',
  score         integer,
  score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_record_tenant       ON record (tenant_id);
CREATE INDEX IF NOT EXISTS idx_record_tenant_score ON record (tenant_id, score);

-- ---------------------------------------------------------------------------
-- booking: site visits / appointments. The UNIQUE constraint below is the
-- database-level guarantee that a (tenant, resource, slot) can be booked once.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  record_id    uuid NOT NULL,
  resource_id  text NOT NULL,
  slot_start   timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- No-double-book: only one active (booked) row per (tenant, resource, slot).
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_active_slot
  ON booking (tenant_id, resource_id, slot_start)
  WHERE status = 'booked';

CREATE INDEX IF NOT EXISTS idx_booking_tenant ON booking (tenant_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security: isolate every row by the tenant set on the connection.
-- FORCE so even the table owner is subject to the policy.
-- ---------------------------------------------------------------------------
ALTER TABLE record  ENABLE ROW LEVEL SECURITY;
ALTER TABLE record  FORCE  ROW LEVEL SECURITY;
ALTER TABLE booking ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON record;
CREATE POLICY tenant_isolation ON record
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON booking;
CREATE POLICY tenant_isolation ON booking
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
