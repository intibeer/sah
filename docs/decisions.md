# Founder decisions

Recorded 2026-10-27. This file supersedes undecided suggestions in earlier research and the original handoff, which remains historical context.

- **Release scope:** self-hostable harness plus a small hosted pilot; initial release target 0.1.0. Public App Store distribution remains a separate gate.
- **Hosted platform:** Cloudflare. Planned pilot uses Workers/Static Assets, D1 and Workflows. This replaces the Render/Postgres/continuous-worker proposal. Storage and execution stay behind ports so the self-hosted Node/SQLite deployment shares the policy engine.
- **Source license:** Apache-2.0. Canonical LICENSE and all first-party package/lock metadata are updated. Packages stay private to prevent accidental npm publication. Dependencies retain their licenses.
- **Test store:** founder will create it. No store has been connected and no installation/read/write permission is inferred from that intention.
- **Provider scope:** Gemini, OpenAI, Anthropic and DeepSeek are required initial adapters. Mistral, xAI and Groq are additional initial targets. Models are configurable, tested profiles; provider support does not imply every model or API feature works.
- **Execution preference:** proceed autonomously on authorized local/repository work. This does not override platform permission enforcement or authorize external side effects.

## Still needed before external actions

Cloudflare account/domain, data placement and approved infrastructure cap; Shopify app owner/distribution, test-store identity and connection permission; approved inference budget/credentials and data-sharing policy; pilot users and operational retention/support choices. These are deployment/run inputs rather than reasons to delay offline development.

No provisioning, API inference, store connection, deployment or release tag is performed by this decision update. [V1 plan](v1-plan.md), [deployment](deployment.md) and [providers](providers.md) define the work remaining.
