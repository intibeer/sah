# SAH — Project brief (handoff from ChatGPT discussion)

Date: 27 October 2026
Status: Concept / research and initial build
Name: **SAH** (working name). Positioning: **An open-source agent harness for commerce, starting with Shopify.** Do not assume brand, npm package or trademark availability; verify Shopify's third-party naming policies.

## Vision
Build an open-source framework for merchants and developers to automate recurring Shopify operations using AI agents. Offer free self-hosting (users supply their own model-provider keys and compute) and a paid managed cloud (we securely host runs and pay model-provider bills using our server-side API keys). The merchant-facing paid product should sell concrete business outcomes, not only infrastructure.

## Target users and go-to-market
- Primary early customer: ecommerce merchants or agencies operating stores with large or messy catalogs (e.g., thousands of SKUs) and recurring data-quality work.
- Secondary audience: developers who want typed Shopify tools and a safe, extensible agent runtime.
- Open-source GitHub project for developer distribution; Shopify embedded app for merchant acquisition; hosted service for convenience, reliability, monitoring and support.
- Business model hypotheses: subscription with included usage allowance, enforced spend caps, optional overage pricing, eventually bring-your-own-provider-key. Pricing is NOT validated.

## First use case: catalog auditor
The first agent should scan a store catalog, flag missing attributes, suspect variants, inconsistent content, duplicate data and other quality issues. Produce evidence and proposed edits. Require merchant approval before mutations, with before-and-after snapshots and audit trail. Do not automatically rewrite production catalog data in the first version.

An example flow:
1. Merchant connects via a Shopify app with minimum necessary scopes.
2. Merchant schedules a scan or triggers one manually.
3. Backend fetches an explicitly bounded subset of products.
4. Agent uses typed tools, deterministic rules and AI reasoning where helpful to generate proposed corrections.
5. Merchant reviews and approves proposals.
6. System executes approved changes, records outcomes, and supports compensating actions where feasible.

## Product shape
Three surfaces sharing one engine:
- **Merchant embedded app**: install, onboarding, set tasks, see proposed actions, approve changes, inspect history and billing.
- **Developer CLI + SDK**: locally test agents, use mock data, view traces and deploy to supported infrastructure.
- **Background backend**: authenticate store, process webhooks and scheduled jobs, run models, validate tools, control budgets and persist state.

Modular structure proposed for evaluation, NOT compulsory:
- `packages/core`: runtime, tool contracts, state machine, execution budgets, trace/events
- `packages/shopify`: Admin GraphQL adapter, auth and scopes, tool wrappers
- `packages/providers`: OpenAI/Anthropic model interfaces and metering
- `packages/sdk` + `packages/cli`: developer ergonomics
- `packages/agents`: catalog audit sample agent
- `apps/dashboard`: embedded merchant app
- `apps/worker`: background job execution
- `docs`: research, architecture, security and roadmap

## Technology preferences (hypotheses)
TypeScript/Node.js; React Shopify embedded app; Postgres/Prisma; background queue such as Inngest or BullMQ; unit/integration tests, Docker local mock services. Pick actual dependencies after reviewing current docs, operational complexity and free-tier constraints. Do not overengineer for a tiny team.

## Safety and reliability nonnegotiables
- Server-side model API keys and Shopify credentials; never ship secrets to clients.
- Per-merchant tenant isolation and request authorization.
- Explicit, typed allowlisted actions; no unrestricted LLM GraphQL execution.
- Read-only first-run mode, approval gates, write caps and dry-runs.
- Rate limiting, budgets per merchant/run, loop limits, retries and idempotency.
- Webhook authentication, OAuth correctness, token refresh/rotation and privacy compliance according to up-to-date Shopify docs.
- Logs/traces and before/after snapshots; no promise of reversible Shopify actions without verifying feasibility.
- Treat product descriptions, vendor data and web content as untrusted input against prompt injection.
- Separate demo/mock infrastructure from paid real stores; no live actions until explicitly authorized.

## Commercial / licensing questions to research
- Core license: Apache 2.0 vs AGPLv3 vs open-core. Document tradeoffs; don't choose without founder decision.
- Shopify app partner rules, billing requirements, distribution, app-store review, authentication and protected customer data.
- Merchant willingness to pay for catalog audit and remediation (competitor apps, realistic price points, differentiation).
- Whether the harness is better described as "for Shopify" rather than including Shopify in a third-party brand.
- Cost dynamics of provider usage; reliable per-store budget and margin calculation.

## Research priorities
Verify with current official documents where possible:
1. Shopify CLI / app template, embedded app UX, current GraphQL Admin API versions, pagination/bulk operations, scopes and OAuth, online/offline sessions, webhooks, app billing and app naming policy.
2. Existing Shopify agent apps, Sidekick's merchant operations capabilities and what is genuinely differentiated.
3. Existing open-source agent runtimes and ecommerce agent SDKs. Evaluate reuse vs building a custom loop.
4. SaaS multitenancy, job workers, observability, rate limits, spend metering and eval strategies.
5. Licenses and feasibility of open-source runtime + proprietary managed hosting.

## Sequencing and acceptance criteria
Phase 0 — Research: docs/research.md contains findings with URLs, access dates and explicit unresolved decisions.
Phase 1 — Plan: architecture, schema and threats; acceptance criteria and minimal scope.
Phase 2 — Scaffold: working monorepo, documented commands, env.example, CI lint/typecheck/test.
Phase 3 — Mock MVP: CLI launches mock catalog audit, shows proposal, applies only after simulated approval, records a trace; test coverage for permissions and token budgets.
Phase 4 — Shopify integration: authenticate a development store and run the same flow with read scopes, then gated writes when reviewed.
Phase 5 — Hosted pilot: tenant isolation, metering, secure provider keys, merchant UI and billing.

## Founder instructions
Begin by researching AND building a small useful vertical slice. Don't produce months of speculative diagrams. Present your top 5 factual findings and highest-risk assumptions, and implement a runnable mock prototype, with commands to run it. Ask before real-store connections, paid API calls, deploys, publishing, or choosing a restrictive license.
