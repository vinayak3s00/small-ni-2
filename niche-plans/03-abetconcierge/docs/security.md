# AbetConcierge — Security & Compliance

Inherits [baseline security](../../00-platform-baseline/README.md#7-security--compliance-dpdp-aligned). Deltas:

- **WhatsApp opt-in compliance** — enforce explicit opt-in before templated/outbound; DND-aware.
- **Template quality guardrails** — pre-send checks to protect the business's WhatsApp quality rating.
- **DPDP consent** captured per channel; residency in Mumbai.
- Free-tier tenants isolated by RLS + rate limits identical to paid (no weaker isolation).
