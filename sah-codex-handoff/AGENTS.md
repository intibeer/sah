# SAH repository instructions

You are building SAH, a provisional working name for an open-source commerce agent harness. Shopify is the first integration, not necessarily the only platform.

Read `PROJECT_BRIEF.md` before making architectural decisions. Treat proposals in that brief as hypotheses, not settled product requirements.

## Principles
- Prioritize a narrow merchant problem with measurable ROI before a generic agent platform.
- Separate core runtime, Shopify adapter, example agents, merchant app, and hosted-only services.
- Prefer TypeScript and simple, maintainable architecture for a small founding team.
- Start with explicit typed tools. Never give LLMs unrestricted Shopify GraphQL access or production mutation powers.
- Enforce least privilege, per-tenant data isolation, idempotency, rate limits, execution budgets, logging and approval gates.
- Never embed or commit API credentials, store access tokens or customer data. Use `.env.example` with placeholders.
- Research current official documentation and save findings with sources, dates, uncertainties and implications.
- Don't assume every prior product, pricing, license or API proposal is correct; test the assumptions.
- Before installing dependencies or doing significant implementation, produce a concise technical plan and identify unknowns.
- Write tests for critical runtime/tool behavior and explain how to run them.
- Keep implementation small and shippable. Avoid speculative microservices, multi-agent complexity or premature platform abstraction.

## Initial assignment
1. Research the Shopify app and API requirements, agent runtime approaches, permissions/security, billing and competitor landscape.
2. Record findings in `docs/research.md` with official links and an explicit distinction between facts and recommendations.
3. Define a narrowly scoped first agent (catalog auditing that proposes changes and requires approval; no automatic publishing for MVP).
4. Propose repository modules, entities, workflows and a staged build plan in `docs/architecture.md` and `docs/roadmap.md`.
5. Scaffold the minimal TypeScript monorepo and implement a local mock-store end-to-end demo after presenting the plan.
6. Do not connect a real merchant store or incur paid provider usage without explicit approval.
