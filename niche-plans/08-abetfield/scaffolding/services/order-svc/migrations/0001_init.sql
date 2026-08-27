-- Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
-- Abetworks Proprietary and Confidential.
--
-- AbetField order-svc — catalog + stock positions + field orders, isolated per
-- tenant via PostgreSQL Row-Level Security. Stock allocation is enforced at the
-- database level so concurrent field reps can never oversell.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- catalog_item: SKU pricing (minor units) + GST rate, per tenant.
CREATE TABLE IF NOT EXISTS catalog_item (
  tenant_id   uuid NOT NULL,
  sku         text NOT NULL,
  name        text NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  gst_rate    numeric(5,4) NOT NULL DEFAULT 0 CHECK (gst_rate >= 0 AND gst_rate <= 1),
  PRIMARY KEY (tenant_id, sku)
);

-- stock_position: available quantity per SKU. CHECK keeps it non-negative, so
-- an over-allocating UPDATE fails rather than driving stock below zero.
CREATE TABLE IF NOT EXISTS stock_position (
  tenant_id uuid NOT NULL,
  sku       text NOT NULL,
  qty       integer NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (tenant_id, sku)
);

-- field_order: header. client_order_id makes offline replay idempotent.
CREATE TABLE IF NOT EXISTS field_order (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  client_order_id text NOT NULL,
  outlet_id       text NOT NULL,
  currency        text NOT NULL,
  subtotal_minor  bigint NOT NULL,
  gst_minor       bigint NOT NULL,
  total_minor     bigint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_order_id)
);

CREATE TABLE IF NOT EXISTS field_order_line (
  id                 bigserial PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  order_id           uuid NOT NULL REFERENCES field_order(id) ON DELETE CASCADE,
  sku                text NOT NULL,
  name               text NOT NULL,
  qty                integer NOT NULL CHECK (qty > 0),
  unit_price_minor   bigint NOT NULL,
  line_subtotal_minor bigint NOT NULL,
  gst_rate           numeric(5,4) NOT NULL,
  line_gst_minor     bigint NOT NULL,
  line_total_minor   bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_line_order ON field_order_line (tenant_id, order_id);

-- Row-Level Security across all tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_item','stock_position','field_order','field_order_line'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;
