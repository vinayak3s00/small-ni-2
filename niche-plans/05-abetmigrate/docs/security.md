# AbetMigrate — Security & Compliance

Inherits [baseline security](../../00-platform-baseline/README.md#7-security--compliance-dpdp-aligned). Deltas:

- Source credentials stored in Secrets Manager, per-migration scoped, revoked on completion.
- Staging data encrypted, residency Mumbai, purged post-cutover per policy.
- Every migrated record audited with provenance; rollback journal is append-only.
- Least-privilege source access (read-only scopes where possible).
