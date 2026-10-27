# SAH research

Researched/accessed **2026-10-27**. Facts below describe fetched documentation and vendor claims on that date, not verified behavior in a merchant account. Recommendations and uncertainties are labeled. No store, billing account or model API was used.

## Five findings that change the plan

1. **Fact:** Shopify recommends the React Router app template for most apps. [Scaffold](https://shopify.dev/docs/apps/build/scaffold-app). **Recommendation:** adopt it when implementing the embedded app; do not scaffold its auth/database/UI just to run a mock audit.
2. **Fact:** current Shopify access-token guidance says new public apps must use expiring offline tokens for GraphQL Admin calls, with existing public apps migrating by January 1, 2027. Read expiry values from responses and coordinate refresh/acquisition per shop. [Access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens). **Implication:** permanent-token assumptions in older tutorials are unsuitable.
3. **Fact:** Shopify App Pricing, renamed from Managed Pricing, supports recurring and usage pricing, including combined models, via plans and App Events. It is the default for supported new public apps; Manual Pricing remains for existing integrations and unsupported models, including one-time purchases. [Billing](https://shopify.dev/docs/apps/launch/billing), [App Pricing](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing). **Recommendation:** evaluate this before coding Billing API mutations. Internal hard spend caps are still our responsibility; the current App Pricing page says usage pricing does not use capped amounts.
4. **Fact:** Sidekick already uses store context, plans background tasks, supports reusable skills and Flow creation, and presents changes for review. [Sidekick](https://help.shopify.com/en/manual/ai-powered-tools/sidekick), [limitations](https://help.shopify.com/en/manual/ai-powered-tools/sidekick/set-up). **Inference:** conversational automation and approval alone are weak differentiation.
5. **Fact:** competing products already offer previews, history and approved catalog fixes. [Ablestar](https://www.ablestar.com/bulk-product-editor/), [CatalogBeacon](https://catalogbeacon.com/). **Hypothesis:** extensibility, repeatable domain-specific audits and useful agency workflows may differentiate SAH. This needs merchant validation; there is no proven moat yet.

## Shopify ecosystem and API

**Facts:** GraphQL Admin is the appropriate merchant-management surface. Shopify publishes quarterly versions; 2026-10 is currently latest stable, with at least 12 months support and fall-forward behavior for inaccessible versions. Pin an explicit version and monitor the response version header. [Versioning](https://shopify.dev/docs/api/usage/versioning).

Cursor connections return up to 250 resources per page. Pagination has a 25,000-object cap; use filtered batches or bulk reads for larger catalogs. GraphQL limits are based on calculated query cost per app/shop and plan; consume returned throttle metadata rather than fixed sleeps. Arrays are limited to 250 inputs. [Pagination](https://shopify.dev/docs/api/usage/pagination-graphql), [limits](https://shopify.dev/docs/api/usage/limits). Bulk queries return asynchronous downloadable results; API versions from 2026-01 support five concurrent bulk queries per shop/app. Initiating and polling operations still incur request costs. [Bulk operations](https://shopify.dev/docs/apps/build/apis/graphql-admin/bulk-operations/queries).

**Recommendation:** first adapter fetches only catalog fields with an explicit product/variant cap. Report scan coverage; never label duplicates globally unique from a partial scan. Adopt bulk reads when actual merchant scale requires them, with bounded downloads, checkpoints and cancellation. Revalidate these limits when implementing.

**Fact:** Shopify's UCP/MCP tools primarily cover buyer discovery, carts, checkout and orders. Older Storefront MCP catalog/cart endpoints have been replaced by UCP. [Agentic commerce](https://shopify.dev/docs/agents), [migration](https://shopify.dev/docs/apps/build/storefront-mcp). **Implication:** these are not a substitute for scoped Admin API catalog maintenance. Avoid conflating buyer-agent APIs with merchant operations.

## Authentication, permissions and review

**Facts:** embedded apps use ID-token exchange; non-embedded apps use authorization-code grant. Managed installation declares scopes in app TOML. Online tokens enforce staff permissions; offline tokens support independent background work. Official libraries should handle token verification and exchange. **Recheck on 2026-10-27:** current authentication/access-token pages also describe signed client assertions for eligible public-app application-only access after merchant installation. The earlier own-organization-only description of client credentials was too broad. Verify eligibility/library support before using that route; the recommended V1 baseline remains embedded token exchange and expiring offline tokens. [Authentication](https://shopify.dev/docs/apps/build/authentication-authorization), [access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens).

Catalog reads use `read_products`; product writes require `write_products`. Request only the minimum, and inspect field-level access requirements before adding fields. Customer data has separate protected-data requirements; the MVP does not need it. [Scopes](https://shopify.dev/docs/api/usage/access-scopes), [protected data](https://shopify.dev/docs/apps/launch/protected-customer-data).

Webhook deliveries must be verified, deduplicated and reconciled; ordering is not guaranteed. [Webhooks](https://shopify.dev/docs/apps/build/webhooks). App Store apps must implement and verify customers/data_request, customers/redact and shop/redact even if they collect no personal data; invalid compliance HMAC must return 401. [Privacy compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).

Public distribution supports unrelated merchant stores and requires review. Custom distribution is constrained to one store or stores in the same Plus organization and cannot use Shopify app billing. Distribution choice cannot later be switched. [Distribution](https://shopify.dev/docs/apps/launch/distribution). **Recommendation:** defer the production app's distribution decision until the pilot route is clear; review the full [App Store checklist](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) before submission.

**Recommendation:** server-side encrypted shop/provider credentials, authenticated tenant context on every request/job, tenant-keyed queries and caches, exact-payload approvals with actor identity, per-shop throttling, durable idempotency, budgets, deletion and retention. Treat descriptions as untrusted data; a model must never approve its own proposals or choose arbitrary GraphQL. A local actor string is only a demonstration, not authentication.

## Deployment and operations

**Facts:** the embedded React Router web app needs hosting; CLI configuration/extension deployment is distinct from hosting the backend. The official template covers auth, sessions, webhooks and environment setup. Production needs appropriate environment secrets and database configuration. [Deployment](https://shopify.dev/docs/apps/launch/deployment), [hosting guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service).

**Recommendation:** begin hosted work with one Node service, Postgres and one worker using an outbox/queue. Initial suggestion only: Cloudflare was subsequently selected by the founder; see decisions.md and deployment.md. Nothing has been deployed. Evaluate managed containers against serverless runtime/timeout constraints when job duration is measured. Persist approvals and usage independently of model context. Retry reads with bounded backoff; reconcile ambiguous writes rather than blindly retrying them. Observe approved fixes, false positives, scan coverage, latency, cost and deletion completion.

## Existing agent frameworks: reuse versus custom

- **LangGraph JS:** persistence/checkpointers support saved execution state and resumption. [Official persistence docs](https://docs.langchain.com/oss/javascript/langgraph/persistence), [MIT license](https://github.com/langchain-ai/langgraphjs/blob/main/LICENSE). **Recommendation:** consider when multi-step durable model workflows are justified. Persistence still needs a tenant authorization and side-effect design.
- **Vercel AI SDK:** schema-defined tools and execution approval are available; provider abstractions can reduce coupling. [Tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling), [Apache-2.0 license](https://github.com/vercel/ai/blob/main/LICENSE). **Recommendation:** a candidate for a future narrow model proposal generator, not a reason to build a generic loop today.
- **OpenAI Agents SDK:** runs agent/tool orchestration in the developer's application while the application owns tools, storage and approvals. [Official SDK overview](https://developers.openai.com/api/docs/guides/agents/sdk), [MIT license](https://github.com/openai/openai-agents-js/blob/main/LICENSE). **Recommendation:** another candidate if its workflow fits; no provider selected, SDK installed, key accessed or API called.
- **Shopify AI Toolkit/UCP:** useful commerce documentation and buyer tools, not the complete merchant background runtime. See ecosystem sources above.

**Decision:** implement a small deterministic workflow and policy boundary, not a general-purpose custom LLM loop. This gives an offline evaluation baseline. Reuse a maintained SDK when introducing model reasoning; keep proposal/approval enforcement outside it. Candidate licenses are observations of current upstream files, not a dependency license audit of a release we have installed.

## Competitors and commercial assumptions

**Vendor-reported facts, not hands-on evaluations:**

- Sidekick: native store-aware assistant, background work and reviewed changes (sources above). Test its actual catalog workflow before claiming a gap.
- Ablestar Bulk Product Editor: bulk edits, previews, scheduling, undo and saved before/after values; vendor page advertises starting at $30/month. [Product page](https://www.ablestar.com/bulk-product-editor/).
- Matrixify: spreadsheet import/export and scheduling; current pricing is free Demo, $20 Basic, $50 Big, $200 Enterprise per 30 days, with per-job limits. Pricing also advertises AI MCP jobs. [Vendor pricing](https://matrixify.app/pricing/).
- CatalogBeacon: directly advertises evidence-led catalog QA, editable AI suggestions and merchant-approved fixes. [Vendor page](https://catalogbeacon.com/). Exact availability, pricing and effectiveness were not independently verified.

**Highest-risk assumptions:** merchants will pay for another audit tool; identified errors cause measurable operational loss; generic rules fit specific categories; review effort is lower than existing bulk workflows; open-source distribution produces hosted customers. A free mock proves none of these. Interview merchants and measure approved fixes/minutes saved before setting prices. Do not promise SEO, AI ranking or revenue improvements.

**Cost recommendation:** reserve worst-case model input/output plus a money allowance before calls; reconcile actual provider usage and billable App Events with idempotent identifiers. Track cost and revenue separately, including hosting/support and Shopify fees. Pricing, margins and provider rates remain unvalidated. The prototype uses zero tokens and zero provider spend.

## Licensing and name

**Facts:** [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) permits commercial use/distribution with notice obligations and includes a patent grant. [AGPLv3](https://www.gnu.org/licenses/agpl-3.0.html) adds a network-source obligation for modified covered software offered to remote users. Neither means hosted services are prohibited; derivative-work and component boundaries need assessment.

**Options, not a legal conclusion:** Apache offers low adoption friction but little protection against hosted competitors. AGPL can protect source availability but may deter some adopters and affects covered hosted modifications. Open-core is a product boundary, not a license: define an open runtime and separately licensed managed features without misleading users about what is free. **Decision made by founder on 2026-10-27: Apache-2.0.** The canonical license text is in LICENSE and package metadata is updated. Private flags prevent accidental npm publication. The comparison above records the evaluated alternatives.

Shopify's [naming guidance](https://polaris-react.shopify.com/content/naming) says third-party app names should not contain Shopify or append “for Shopify.” It is older Polaris guidance; verify the current listing and trademark rules before naming a public app. **Unresolved:** SAH trademark, domain and npm availability; do not interpret descriptive “starting with Shopify” as approved branding.

## Research limits

No real store, partner-account configuration, competitor installation, paid inference, external write or deployment was performed. Official pages can change after this access date. Account eligibility, actual API behavior, App Store acceptance, market demand and production security remain validation work. License choice is now resolved. Shopify skill search succeeded after network permission; ordinary web retrieval supplied the other sources. The repo's architecture and roadmap distinguish implemented behavior from future requirements.

## Founder decision addendum — 2026-10-27

Scope is confirmed as self-hostable plus pilot, host as Cloudflare, license as Apache-2.0. The founder will create a test store. These resolve earlier hypotheses; they do not indicate a deployment or merchant connection.

**Verified platform facts:** Cloudflare documents React Router on Workers, SQLite-based D1 and durable multi-step Workflows. Workflow steps can retry; external side effects still require application idempotency. [React Router](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/), [D1](https://developers.cloudflare.com/d1/), [Workflow rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/).

**Revised recommendation:** Workers/Static Assets + D1 + Workflows for the pilot, with repository/runner interfaces and Node/SQLite for portable self-hosting. Validate Shopify session storage and provider transports in Workers first. This supersedes the initial Render/Postgres direction. No residency guarantee, free-tier fit or runtime compatibility is inferred from the product docs. See deployment.md for recovery/cost references and gates.

**Provider scope:** Gemini, OpenAI, Anthropic and DeepSeek are required initial adapters; Mistral, xAI and Groq extend the same interface. The [AI SDK provider catalog](https://ai-sdk.dev/providers/ai-sdk-providers) offers relevant transports. Use per-model capability profiles and conformance tests; package availability is not evidence of live correctness. Provider-specific official sources and acceptance levels are in [providers](providers.md). No model IDs, prices, API credentials or paid-use budget are selected by this addendum.
