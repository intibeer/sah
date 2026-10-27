# Roadmap

2026-10-27. Stages are outcome gates, not delivery-date promises.

The actionable proposed route from this mock to release 0.1.0 is in [V1 plan](v1-plan.md), with a [deployment runbook](deployment.md), [security requirements](security.md) and [merchant-experience backlog](backlog.md). Those files describe future work; the milestones below preserve the original sequencing.

1. **Local mock (this change):** typed workspace modules, bounded catalog rules, evidence, review/approve/reject/apply CLI, persisted trace, policy and CLI tests. No model or Shopify connection.
2. **Validate the wedge:** interview five merchants/agencies with messy catalogs. Compare a sample audit against Sidekick, Ablestar, Matrixify and CatalogBeacon. Measure precision, approved useful fixes and minutes saved; target ≥90% precision on the selected rules before widening scope. Do not claim increased sales without measurement. Apache-2.0 is selected; verify naming before a branded release.
3. **Development-store reads (requires explicit permission):** scaffold official React Router app; validate token exchange/refresh, read_products, version-pinned pagination and bounded snapshots. Test HMAC, duplicates, uninstall and privacy deletion. No write scope initially.
4. **Reviewed development-store edits (separate permission):** narrow typed updates, authenticated per-proposal approval, write caps, freshness check, failure reconciliation, audit retention and compensating edits only where safe. Prove retry behavior against actual API failures.
5. **Model-assisted proposals (paid usage requires permission):** compare a provider SDK against deterministic baseline on held-out fixtures, including injection attempts and hallucinated attributes. Reserve token and money budgets, prohibit tools from approving themselves, log model/version and usage. Only add a model where it improves useful approved fixes.
6. **Hosted pilot (deployment requires permission):** Cloudflare Workers, D1, Workflows, secret encryption and durable dispatch, access controls, backups, deletion and monitoring. Enforce internal hard spend caps, entitlements and usage reconciliation before App Pricing billing. Cloudflare is selected; validate runtime compatibility and approve actual spend before provisioning. No speculative microservices.

Deferred: generic agent marketplace, multiple commerce platforms, autonomous publishing, unrestricted GraphQL, multi-agent orchestration, vector storage and enterprise infrastructure. Revisit SDK extraction only with a real second integration.

Founder decisions on scope, Cloudflare, Apache-2.0 and provider coverage supersede earlier undecided suggestions; see [decision record](decisions.md) and [provider plan](providers.md).

Current progress: M1 offline lifecycle is implemented with 27 tests: verification, resume, cancellation, revisions and legacy migration. An initial [local Workers compatibility probe](workers-compatibility.md) passes with network-denied synthetic Shopify/provider requests. Production storage/runners and live connections remain unimplemented.
