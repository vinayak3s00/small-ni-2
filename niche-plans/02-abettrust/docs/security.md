# AbetTrust — Security & Compliance

Inherits [baseline security](../../00-platform-baseline/README.md#7-security--compliance-dpdp-aligned). This product *is* the compliance surface, so it adds:

- **Attestations roadmap:** SOC 2 Type II; DPDP alignment; published control catalogue.
- **WORM audit:** S3 Object Lock (compliance mode) for `audit_event` + `policy_decision`.
- **Per-tenant KMS keys** for enterprise; optional dedicated schema/DB.
- **Separation of duties:** compliance-officer role can read audit + policy but not mutate business data.
- **Regulator-ready evidence packs** with hash-chained integrity.
- **Grounding enforcement:** no ungrounded agent output leaves the system.
