# AbetRetain — Scaffolding

```
scaffolding/
├── services/
│   ├── commerce-connector/   # NestJS — Shopify/Woo/marketplace webhooks
│   ├── support-agent/        # Python — WISMO/returns/exchanges, cited
│   └── ltv-churn-svc/        # Python — explainable retention scoring
└── deploy/
    ├── helm/values.yaml
    └── terraform/main.tf
```

Journeys run on AbetFlow; frequency caps enforced centrally to protect WhatsApp quality rating.
