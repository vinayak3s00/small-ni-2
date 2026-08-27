# AbetConcierge — Data Model

> PostgreSQL 16, RLS by `tenant_id`. Reuses the platform `party`/`record`/`conversation`/`message` core; adds commerce entities.

```
catalog_item(id, tenant_id, sku, name, price_minor, currency, gst_rate, attributes jsonb)
quote(id, tenant_id, record_id, lines jsonb, subtotal_minor, gst_minor, total_minor, currency, status, created_at)
channel_identity(id, tenant_id, party_id, channel[whatsapp|instagram|email|voice], handle)  -- unifies to one party
opt_in(id, tenant_id, party_id, channel, granted bool, granted_at)   -- WhatsApp opt-in compliance
graduation(id, tenant_id, from_tier, to_tier, promoted_at)
```

Identity unification: an inbound message resolves `channel_identity` → `party` → `record`, so WhatsApp + Instagram + call collapse to one customer. Quotes are GST-aware (`gst_rate`, `gst_minor`) and multi-currency (`currency`, minor units).
