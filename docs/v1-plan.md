# V1 plan: a commerce harness with one verified catalog workflow

Status: implementation plan with founder decisions recorded; not a deployed service. Updated 2026-10-27.
Target repository: https://github.com/intibeer/sah.

## Release definition

The founder confirmed V1 as a self-hostable developer harness with a small hosted pilot, versioned as **0.1.0**, on 2026-10-27. Hosting is Cloudflare and the source license is Apache-2.0. See [decisions](decisions.md). A public Shopify App Store launch is a later gate, not implied by a public GitHub repository or a hosted development-store pilot.

A merchant can connect an authorized store, see what access actually works, start a bounded catalog audit, leave and return, review evidence, approve an exact change and see a read-back verification. A developer can run the same workflow against fixtures without credentials and extend it through typed tools and verifiers. A task is complete only when its verifier succeeds.

The initial agent combines deterministic checks with optional model-assisted proposals. Models cannot grant permissions, approve changes, generate arbitrary GraphQL or define their own success criteria. Paid inference is disabled by default. V1 remains usable without a model. Installing a provider package is not authorization to call it.

## Current baseline versus work remaining

Implemented: TypeScript workspace modules, offline mock catalog, deterministic findings, trim-only proposals, local approve/reject/apply commands, content-bound approvals, write limits, stale checks, local checkpoints and JSONL trace. Eleven tests cover policy and separate-process CLI behavior.

Not implemented: real Shopify access, authenticated users, D1/SQLite adapters, durable workflow execution, tenant authorization, connection diagnostics, read-back verification, merchant UI, model integration, hosting or release artifacts. Do not present the existing CLI as deployed V1. The current 100-product in-memory adapter cannot simply become the production snapshot store.

## Product scope

V1 includes one task pack: catalog quality. Keep missing-data and duplicate-SKU warnings, and safe title/vendor/type trimming. Model suggestions may improve existing text using cited source fields; missing product facts remain unresolved. Description writes and broader edits stay disabled until an independent tool/schema and evaluation are approved.

Merchant surfaces: connection/capabilities, task list with resume/blocker, audit coverage, finding evidence, before/after review, explicit decisions, execution result and verification history. No general chat interface is required.

Developer surfaces: offline CLI, documented core contracts, fixture adapter, Shopify adapter, provider adapter seam and extension example. Use the CLI and merchant app as the first two consumers before extracting a published SDK. No npm publication in V1's initial GitHub release.

Excluded: theme editing, shipping/markets, fulfillment, analytics setup, email sends, unrestricted browser automation, generic agent marketplace, multiple platforms and automatic publishing. Read-only launch readiness is the next candidate pack, not part of this release.

## Proposed architecture

Keep one TypeScript repository and one shared policy engine. Add `packages/shopify` for bounded typed catalog tools and `packages/storage` for tenant-keyed repository ports, Cloudflare D1 and portable SQLite adapters. Add `apps/merchant` using Shopify's official React Router template adapted and tested on Workers, and a Cloudflare Workflows runner for scans/verification. A Node runner implements the same durable task contract for self-hosting. Add `packages/providers` at the model milestone. These are proposed modules, not existing features.

Use D1 for tasks, decisions, events, bounded snapshots, usage reservations and dispatch records. Use Workflows for durable scans and verification; the database is the authoritative product history, not workflow step retention. Persist approval waiting in task state; no long-lived online staff token is stored in a Workflow. Foreground writes remain under current online staff authorization. Use transactional/conditional storage operations to claim attempts and reserve budgets; D1 is SQLite-based, not Postgres. Dispatch retries use stable instance IDs and recover an outbox gap. Do not put secrets or large catalog bodies in workflow parameters/results.

The portable deployment uses SQLite plus a Node runner, without Cloudflare bindings in core/provider/Shopify interfaces. V1 self-hosting is single-node with persistent local storage, not a distributed/high-availability SQLite service. Prove equivalent state transitions, idempotency and budget behavior in both adapters before claiming self-hostability. Cloudflare-local emulation alone is not that proof. No Redis, Queues, Durable Objects or R2 in the initial pilot unless a measured need justifies them. R2 is a later option for larger exports. Package imports/exports and independent build boundaries must be explicit before claiming SDK compatibility.

Proposed entities: Tenant, StoreInstallation, StaffIdentity, ConnectionCheck, Task, TaskRevision, Run, CatalogSnapshot, Finding, Proposal, Approval, ExecutionAttempt, Verification, Event, BudgetReservation, Job. Use tenant plus store keys in relationships and repository methods. Secrets live in encrypted credential storage, not event payloads.

Task states: queued, running, blocked_auth, awaiting_approval, executing, verifying, completed, partially_completed, failed, cancelled. Proposal states: proposed, approved, rejected, stale, executing, applied, verified, verification_failed, outcome_unknown. `applied` never implies `verified`.

Retries operate on durable attempt IDs and leases. On a timeout after a mutation, record outcome_unknown and read current state before any retry. A read-before-write check is not an atomic Shopify compare-and-swap: where the API cannot enforce a precondition, document the race and fail closed for conflicting edits. Each proposal has a short expiry and is bound to task revision, tenant, store, tool version, target, before/after and evidence. Edited proposals require new approval.

## Delivery sequence and acceptance gates

### M0 — GitHub baseline and plan

Save the existing prototype, source research and this plan to intibeer/sah. Exclude local state, secrets, build output and dependencies. Existing checks pass. Document actual implementation status and pending decisions. Apache-2.0 is now approved and added. Do not tag 0.1.0 until release gates pass.

### M1 — Verified, resumable offline harness

Add task/proposal state transitions, verifier contracts, cancellation and revision-aware approvals. Separate immutable evidence from mutable status. Persist attempts and show the next action after restarting. Add simulated expired authorization and unknown write outcomes.

Acceptance: a process interruption resumes without duplicate effects; a successful write followed by a failed read-back remains unverified; approval of an old task revision is refused; cancellation stops new side effects; all paths to a mutation pass the approval gate. Preserve existing policy tests.

### M2 — Durable storage and execution adapters

First run a local compatibility spike: Shopify React Router library, token/session persistence and provider transport under Workers. Replace CLI-only fs/crypto assumptions at runtime boundaries with compatible interfaces; do not claim Node compatibility flags make the CLI deployable. Then implement D1/SQLite schema migrations, repository ports, attempt claims and atomic event/outbox updates. Add a Workflows runner for the pilot and SQLite/Node runner for portable self-hosting. Keep the fixture adapter for fast tests.

Acceptance: Workers runtime/session tests pass locally; concurrent runners cannot claim the same attempt; expired leases/dispatch gaps recover safely; two tenants cannot read or mutate each other's rows, proposals, jobs or cache entries. Test migrations, conditional budget updates, crash recovery and restore with D1 emulation and real local SQLite, not only mocks. Preserve a fresh-environment compatibility check before cloud deployment.

### M3 — Shopify connection and read-only catalog adapter

Implement official embedded app auth, encrypted per-store credentials, refresh coordination, online staff checks and offline read jobs. Add diagnostics that report store, environment, approved scopes, last successful bounded read and required reconnect action. Permission recovery resumes the blocked task after revalidation. Request read_products only at this milestone.

Acceptance: an installation is not marked ready until a real authorized capability probe succeeds; expired/revoked tokens stop jobs; no request trusts a client-supplied tenant ID; paginated scans report their bounded coverage and nested variant truncation; HMAC, webhook deduplication, uninstall and required deletion paths are tested. Development-store connection requires separate explicit approval.

### M4 — Merchant review and verified edits

Build the minimal connection/task/review/history screens. Request optional write_products only for an authorized editing workflow. Start with the same three trim-only fields. For V1, perform merchant-triggered writes through an online-authorized workflow so Shopify enforces current staff permissions; background workers handle scans and verification. Delayed/offline mutation execution is deferred unless staff authorization at execution is explicitly solved.

Acceptance: authenticated authorized staff can approve only their store's exact proposal; rejected/stale/expired proposals cannot run; repeated submission is idempotent; API errors and userErrors remain failures; independent read-back establishes the postcondition; partial batches report each outcome. Development-store writes require separate approval.

### M5 — Optional model-assisted proposals

Implement a fake provider plus the required Gemini, OpenAI, Anthropic and DeepSeek adapters behind disabled-by-default live flags. Add Mistral, xAI and Groq through the same contract. Use AI SDK provider packages as the initial transport recommendation, subject to Workers conformance tests. Models are explicit versioned profiles, not an unrestricted model string or a hard-coded latest alias. See [provider support plan](providers.md). Reserve worst-case tokens and money atomically, bound steps/output, validate output and retain source references. Do not send customer/order data. Provider credentials stay server-side and can be operator-supplied for self-hosting.

Acceptance: every planned adapter passes offline request/response/error conformance fixtures in Node and Workers; no adapter is labeled live-verified without an authorized smoke test. Fixture tests run without a key; injection-like product text cannot invoke tools or approve itself; unsupported model capabilities fail before the call; insufficient budget prevents it; concurrent reservations cannot overspend; unknown provider usage remains reserved until reconciled. No silent provider/model fallback or automatic retry of ambiguous billable calls. Compare against deterministic precision and merchant effort before enabling. Real inference requires a named provider, explicit spend limit and founder approval. Failure of optional AI does not block deterministic audits.

### M6 — Reproducible release candidate and documentation

Supply a portable Node container/SQLite setup, Cloudflare build and binding configuration, migration commands, health checks and operator guide. Use the cf CLI for this new Cloudflare project; no Wrangler config currently exists. Generate binding types and pin a tested compatibility date. Enable structured Workers logs/traces with secret redaction. Document exact tested commands rather than placeholders. Make CI enforce build/typecheck/tests plus database and offline container smoke tests. Add SDK/tool example, auth setup, data retention, security reporting, troubleshooting and upgrade/restore instructions. Apache-2.0 is selected; audit dependency notices before a release.

Acceptance: a clean checkout can run the offline workflow; a fresh self-hosting environment follows the guide without undocumented credentials; all required CI passes at the candidate SHA; dependency/secret/license review is recorded; no mock-only identity can access production routes. Produce a tagged release only with explicit release authorization.

### M7 — Deploy and validate the pilot

Follow [deployment runbook](deployment.md) for isolated staging, development-store checks and then an allowlisted pilot. Cloudflare is selected: Workers plus Static Assets for the web app, D1 for state and Workflows for background scans/verification. Account, domain, data placement and budget still need confirmation before provisioning. No automatic deploy from arbitrary main commits. Use the same reviewed immutable build for staging and production.

Acceptance: a named authorized merchant completes connect → scan → review → approve → apply → verify; restart and reconnect preserve state; no duplicate writes after retries; restore and emergency write-disable drills pass; metrics and alerts are visible. Public distribution to unrelated merchants must follow Shopify review rules, not a custom-install workaround.

## Definition of done for 0.1.0

All M1–M4 and M6 acceptance gates pass. M5 includes the fake provider and offline-conformant adapters for Gemini, OpenAI, Anthropic and DeepSeek, plus the planned Mistral/xAI/Groq extensions. Each model profile declares capability/test status; real provider usage and live verification remain disabled unless approved. M7 is required to call it a deployed pilot. Include a release evidence record with commit SHA, CI links, tested environments, store permission scope, verifier results, limitations and rollback image. No unverified task is displayed as complete.

Track time to first verified result, false completion, approved useful fixes, auth recovery, duplicate side effects, cost per completed task and merchant handoffs. Set operational alert thresholds from the pilot workload; do not invent validated revenue claims.

## Confirmed decisions and remaining external gates

Confirmed on 2026-10-27: **self-hostable plus pilot; Cloudflare; Apache-2.0; Gemini/OpenAI/Anthropic/DeepSeek provider coverage**. Additional initial providers: Mistral, xAI and Groq. Founder will create a test store.

Remaining before the relevant gate: Cloudflare account/domain, data placement and infrastructure cap; Shopify app owner/distribution and the named test store plus installation permission; specific tested model IDs, provider credentials, payload policy and hard inference budget; pilot cohort, retention/deletion policy and support owner. None blocks offline implementation. Exact model selection is configuration work, not a new architecture decision.

Implementation can proceed through offline milestones without those external approvals. The selected hosting/provider architecture does not authorize provisioning, store access, paid services or release tagging. Saving the requested baseline and plan to intibeer/sah is the GitHub work for this turn.

## Sources and evidence

Official documentation rechecked 2026-10-27: [Shopify deployment](https://shopify.dev/docs/apps/launch/deployment), [distribution](https://shopify.dev/docs/apps/launch/distribution), [authentication](https://shopify.dev/docs/apps/build/authentication-authorization), [access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens). Cloudflare references and operational details are in deployment.md; provider sources are in providers.md. Ecosystem/provider/license comparisons remain in [research](research.md).

The merchant-experience backlog came from context pasted by the founder on 2026-10-27. The original separate chat/canvas was not independently accessed. Those incidents are product hypotheses and acceptance-test inputs, not proof of general market demand.
