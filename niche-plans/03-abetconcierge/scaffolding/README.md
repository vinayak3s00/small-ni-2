# AbetConcierge — Scaffolding

```
scaffolding/
├── services/
│   ├── channel-gw/        # NestJS — WhatsApp/IG/email/voice + opt-in guard
│   ├── concierge-agent/   # Python — conversational commerce, cited answers
│   ├── quoting-svc/       # NestJS — GST-aware, multi-currency quotes
│   └── auto-crm-svc/      # NestJS — chat -> CRM record + scoring hook
└── deploy/
    ├── helm/values.yaml
    └── terraform/main.tf
```

Local dev reuses the platform `docker-compose.dev.yaml` (postgres/redis/kafka).
