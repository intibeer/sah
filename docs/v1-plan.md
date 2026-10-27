# V1 plan: a commerce harness with one verified catalog workflow

Status: proposed implementation plan, not a deployed service. Updated 2026-10-27.
Target repository: https://github.com/intibeer/sah.

## Release definition

Recommended V1 is a self-hostable developer harness with a small hosted pilot, versioned as **0.1.0**. This scope is a recommendation pending founder confirmation. A public Shopify App Store launch is a later gate, not implied by a public GitHub repository or a hosted development-store pilot.

A merchant can connect an authorized store, see what access actually works, start a bounded catalog audit, leave and return, review evidence, approve an exact change and see a read-back verification. A developer can run the same workflow against fixtures without credentials and extend it through typed tools and verifiers. A task is complete only when its verifier succeeds.

The initial agent combines deterministic checks with optional model-assisted proposals. Models cannot grant permissions, approve changes, generate arbitrary GraphQL or define their own success criteria. Paid inference is disabled by default. V1 remains usable without a model. Installing a provider package is not authorization to call it.

## Current baseline versus work remaining

Implemented: TypeScript workspace modules, offline mock catalog, deterministic findings, trim-only proposals, local approve/reject/apply commands, content-bound approvals, write limits, stale checks, local checkpoints and JSONL trace. Eleven tests cover policy and separate-process CLI behavior.

Not implemented: real Shopify access, authenticated users, Postgres, durable worker queue, tenant authorization, connection diagnostics, read-back verification, merchant UI, model integration, hosting or release artifacts. Do not present the existing CLI as deployed V1. The current 100-product in-memory adapter cannot simply become the production snapshot store.

## Product scope

V1 includes one task pack: catalog quality. Keep missing-data and duplicate-SKU warnings, and safe title/vendor/type trimming. Model suggestions may improve existing text using cited source fields; missing product facts remain unresolved. Description writes and broader edits stay disabled until an independent tool/schema and evaluation are approved.

Merchant surfaces: connection/capabilities, task list with resume/blocker, audit coverage, finding evidence, before/after review, explicit decisions, execution result and verification history. No general chat interface is required.

Developer surfaces: offline CLI, documented core contracts, fixture adapter, Shopify adapter, provider adapter seam and extension example. Use the CLI and merchant app as the first two consumers before extracting a published SDK. No npm publication in V1's initial GitHub release.

Excluded: theme editing, shipping/markets, fulfillment, analytics setup, email sends, unrestricted browser automation, generic agent marketplace, multiple platforms and automatic publishing. Read-only launch readiness is the next candidate pack, not part of this release.

## Proposed architecture

Keep one TypeScript repository and one shared policy engine. Add `packages/shopify` for bounded typed catalog tools and `packages/storage` for tenant-keyed Postgres repositories. Add `apps/merchant` using Shopify's official React Router template and `apps/worker` for background work. Add `packages/providers` only when the model milestone begins. These are proposed paths, not existing modules.

Use Postgres for tasks, snapshots, decisions, events, usage and a leased job/outbox mechanism. Evaluate a maintained Postgres-backed queue before choosing a dependency; avoid adding Redis just to host one workflow. The UI creates jobs, the worker executes them, and both call the same core policy layer. Package imports/exports and independent build boundaries must be made explicit before claiming SDK compatibility.

Proposed entities: Tenant, StoreInstallation, StaffIdentity, ConnectionCheck, Task, TaskRevision, Run, CatalogSnapshot, Finding, Proposal, Approval, ExecutionAttempt, Verification, Event, BudgetReservation, Job. Use tenant plus store keys in relationships and repository methods. Secrets live in encrypted credential storage, not event payloads.

Task states: queued, running, blocked_auth, awaiting_approval, executing, verifying, completed, partially_completed, failed, cancelled. Proposal states: proposed, approved, rejected, stale, executing, applied, verified, verification_failed, outcome_unknown. `applied` never implies `verified`.

Retries operate on durable attempt IDs and leases. On a timeout after a mutation, record outcome_unknown and read current state before any retry. A read-before-write check is not an atomic Shopify compare-and-swap: where the API cannot enforce a precondition, document the race and fail closed for conflicting edits. Each proposal has a short expiry and is bound to task revision, tenant, store, tool version, target, before/after and evidence. Edited proposals require new approval.

## Delivery sequence and acceptance gates

### M0 — GitHub baseline and plan

Save the existing prototype, source research and this plan to intibeer/sah. Exclude local state, secrets, build output and dependencies. Existing checks pass. Document actual implementation status and pending decisions. Do not tag 0.1.0 or claim an open-source license yet.

### M1 — Verified, resumable offline harness

Add task/proposal state transitions, verifier contracts, cancellation and revision-aware approvals. Separate immutable evidence from mutable status. Persist attempts and show the next action after restarting. Add simulated expired authorization and unknown write outcomes.

Acceptance: a process interruption resumes without duplicate effects; a successful write followed by a failed read-back remains unverified; approval of an old task revision is refused; cancellation stops new side effects; all paths to a mutation pass the approval gate. Preserve existing policy tests.

### M2 — Durable storage and isolated worker

Implement Postgres schema/migrations, repository interfaces, leased jobs and atomic event/outbox updates. Provide Docker Compose for local Postgres and an offline seeded demo. Keep the fixture adapter for fast unit tests.

Acceptance: concurrent workers cannot execute the same attempt; expired leases recover safely; two tenants cannot read or mutate each other's rows, proposals, jobs or cache entries; database migrations and a restore rehearsal work. Test these with Postgres, not only mocks.

### M3 — Shopify connection and read-only catalog adapter

Implement official embedded app auth, encrypted per-store credentials, refresh coordination, online staff checks and offline read jobs. Add diagnostics that report store, environment, approved scopes, last successful bounded read and required reconnect action. Permission recovery resumes the blocked task after revalidation. Request read_products only at this milestone.

Acceptance: an installation is not marked ready until a real authorized capability probe succeeds; expired/revoked tokens stop jobs; no request trusts a client-supplied tenant ID; paginated scans report their bounded coverage and nested variant truncation; HMAC, webhook deduplication, uninstall and required deletion paths are tested. Development-store connection requires separate explicit approval.

### M4 — Merchant review and verified edits

Build the minimal connection/task/review/history screens. Request optional write_products only for an authorized editing workflow. Start with the same three trim-only fields. For V1, perform merchant-triggered writes through an online-authorized workflow so Shopify enforces current staff permissions; background workers handle scans and verification. Delayed/offline mutation execution is deferred unless staff authorization at execution is explicitly solved.

Acceptance: authenticated authorized staff can approve only their store's exact proposal; rejected/stale/expired proposals cannot run; repeated submission is idempotent; API errors and userErrors remain failures; independent read-back establishes the postcondition; partial batches report each outcome. Development-store writes require separate approval.

### M5 — Optional model-assisted proposals

Implement a fake provider first and one real provider adapter behind a disabled-by-default flag. Select the SDK/model from current docs at implementation time. Reserve worst-case tokens and money atomically, bound steps/output, validate output and retain source references. Do not send customer/order data. Provider credentials stay server-side and can be operator-supplied for self-hosting.

Acceptance: fixture tests run without a key; injection-like product text cannot invoke tools or approve itself; insufficient budget prevents the call; concurrent reservations cannot overspend; unknown provider usage remains reserved until reconciled. Compare against deterministic precision and merchant effort before enabling. Real inference requires a named provider, explicit spend limit and founder approval. Failure of optional AI does not block deterministic audits.

### M6 — Reproducible release candidate and documentation

Supply a container build, local Compose setup, migration commands, health checks and operator guide. Document exact tested commands rather than placeholders. Make CI enforce build/typecheck/tests plus database and offline container smoke tests. Add SDK/tool example, auth setup, data retention, security reporting, troubleshooting and upgrade/restore instructions. Decide license before an open-source release.

Acceptance: a clean checkout can run the offline workflow; a fresh self-hosting environment follows the guide without undocumented credentials; all required CI passes at the candidate SHA; dependency/secret/license review is recorded; no mock-only identity can access production routes. Produce a tagged release only with explicit release authorization.

### M7 — Deploy and validate the pilot

Follow [deployment runbook](deployment.md) for isolated staging, development-store checks and then an allowlisted pilot. Proposed default: one managed Node web service, one worker and managed Postgres on Render; hosting choice and budget remain pending. No automatic deploy from arbitrary main commits. Use the same reviewed immutable build for staging and production.

Acceptance: a named authorized merchant completes connect → scan → review → approve → apply → verify; restart and reconnect preserve state; no duplicate writes after retries; restore and emergency write-disable drills pass; metrics and alerts are visible. Public distribution to unrelated merchants must follow Shopify review rules, not a custom-install workaround.

## Definition of done for 0.1.0

All M1–M4 and M6 acceptance gates pass; M5's fake-provider contract is included, with real provider usage optional and explicitly disabled unless approved. M7 is required to call it a deployed pilot. Include a release evidence record with commit SHA, CI links, tested environments, store permission scope, verifier results, limitations and rollback image. No unverified task is displayed as complete.

Track time to first verified result, false completion, approved useful fixes, auth recovery, duplicate side effects, cost per completed task and merchant handoffs. Set operational alert thresholds from the pilot workload; do not invent validated revenue claims.

## Decisions required before the relevant gate

1. V1 target: self-hostable plus pilot (recommended), developer-only or public app.
2. Hosting provider, region, operator account and maximum infrastructure spend before provisioning.
3. Shopify app owner/distribution and named development store before installation. Public launch requires its own review path.
4. License: recommend evaluating Apache-2.0 for adoption; founder must choose. No license selected by this plan.
5. Provider/model, data-sharing terms and hard spend ceiling before real inference.
6. Pilot merchants, retention/deletion policy, support owner and domain before production.

Implementation can proceed through offline milestones without those external approvals. This planning request does not authorize store access, paid services, deployment or release tagging. Saving the requested baseline and plan to intibeer/sah is the GitHub work for this turn.

## Sources and evidence

Official documentation rechecked 2026-10-27: [Shopify deployment](https://shopify.dev/docs/apps/launch/deployment), [distribution](https://shopify.dev/docs/apps/launch/distribution), [authentication](https://shopify.dev/docs/apps/build/authentication-authorization), [access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens). Hosting references and operational details are in deployment.md. Ecosystem/provider/license comparisons remain in [research](research.md).

The merchant-experience backlog came from context pasted by the founder on 2026-10-27. The original separate chat/canvas was not independently accessed. Those incidents are product hypotheses and acceptance-test inputs, not proof of general market demand.
