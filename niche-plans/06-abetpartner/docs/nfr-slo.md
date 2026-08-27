# AbetPartner — NFRs & SLOs

Inherits [baseline SLOs](../../00-platform-baseline/README.md#6-non-functional-requirements-baseline-slos).

| Metric | Target |
|--------|--------|
| Cross-workspace data isolation | 100% (RLS + separate sender identities) |
| Workspace provisioning | < 60 s automated |
| Sender reputation isolation | one client's deliverability cannot affect another |
| Custom-domain TLS | automated (ACM), < 24h propagation |
| Partner reporting rollup | near-real-time, permission-gated |

Scale: partners with 100+ client workspaces supported; each workspace is an independent RLS tenant with its own quotas.
