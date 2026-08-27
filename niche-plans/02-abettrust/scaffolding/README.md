# AbetTrust — Scaffolding

```
scaffolding/
├── services/
│   ├── policy-engine/        # Go + OPA (PDP)
│   ├── grounding-svc/        # Python (citation enforcement)
│   └── audit-evidence-svc/   # NestJS (append-only audit + evidence packs)
├── policies/
│   └── lending.rego          # example industry policy pack (Rego)
└── deploy/
    ├── helm/values.yaml
    └── terraform/main.tf
```

Policy packs are versioned Rego bundles distributed via an OCI registry and hot-reloaded by the PDP. `policies/lending.rego` shows the field-level + export-control pattern.
