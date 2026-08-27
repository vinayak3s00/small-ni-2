# AbetConcierge — Architecture (production-grade)

> Built on the [Platform Baseline](../../00-platform-baseline/README.md).

## 1. Flow

```
WhatsApp Cloud API (BSP) ┐
Instagram / Messenger    ├─▶ channel-gw ─▶ inbox-svc ─▶ conversation state (Redis)
Voice / Email            ┘                     │
                                               ▼
                              concierge-agent (Py) ── RAG(catalog, FAQs, cited)
                                     │        │
                                     │        └─▶ quoting-svc (GST-aware, multi-currency)
                                     ▼
                              auto-crm-svc (creates/updates one record) ─▶ scoring-svc (explainable)
                                     │
                                     ▼
                              graduation-svc ─▶ promote tenant into NuCRM/AbetFlow
```

## 2. Key services

| Service | Lang | Role |
|---------|------|------|
| channel-gw | NestJS | WhatsApp/IG/email/voice normalization, opt-in + template quality guard |
| inbox-svc | NestJS | Omnichannel conversation, unify identity into one record |
| concierge-agent | Python | Conversational commerce, cited answers, escalation |
| quoting-svc | NestJS | GST-aware quotes, multi-currency, catalog pricing |
| auto-crm-svc | NestJS | Chat → CRM record, pipeline stage |
| graduation-svc | NestJS | Seamless upgrade to full suite (no migration) |

## 3. Scalability

- WhatsApp webhooks are high-fanout; channel-gw is stateless behind ALB, autoscaled on RPS; inbound events go to Kafka `messages.inbound`.
- Conversation state in Redis with TTL; cold history in Postgres.
- Template send-rate governed per WhatsApp quality tier to avoid throttling.
- Free-tier tenants share pooled capacity; paid tenants get reserved throughput.
