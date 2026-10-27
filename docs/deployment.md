# V1 Cloudflare deployment runbook — draft

Status: hosting selected, **not executable yet**. No infrastructure is provisioned. The repository currently runs only the local mock CLI. Update this runbook with verified commands, bindings and version identifiers at M6. Founder selected Cloudflare and self-hostable plus pilot on 2026-10-27.

## Cloudflare topology

- Workers plus Static Assets: merchant web UI, authenticated API and webhook ingress.
- D1: tenant-keyed tasks, approvals, events, bounded snapshots, credential ciphertext, attempts, usage reservations and dispatch records.
- Workflows: durable bounded scans and independent read-back verification. Human approval remains authoritative database state; online staff tokens are not workflow parameters.
- Worker secrets: application credentials, encryption key material and operator-managed provider keys. Do not place plaintext credentials in D1 or workflow history.

No additional queue, Durable Object, R2 bucket, AI Gateway or Workers AI dependency is required initially. Add a service only for a measured need. Separate execution/storage ports keep the core portable: the self-hosted build uses Node, SQLite and a durable local runner. Neither deployment exists yet, and parity must be tested before release.

Cloudflare documents [React Router on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/), [D1](https://developers.cloudflare.com/d1/) and [Workflows](https://developers.cloudflare.com/workflows/). These establish platform building blocks, not proof that Shopify's full template/session adapter works unchanged. M2 starts with a local Shopify library/runtime/session-storage compatibility spike. Keep filesystem-backed CLI persistence out of Workers handlers; Workers has no durable local application filesystem.

Use the cf CLI for this new project, as directed by the Cloudflare skill; no Wrangler configuration exists. Resolve exact supported build/type-generation/binding commands during implementation from the installed CLI/docs. Do not invent deployment commands or install CLI tools for a planning-only change. Pin a tested compatibility date, declare bindings, generate types and enable structured Workers logs and traces with redaction.

## Durable execution and storage constraints

D1 is SQLite-based; earlier Postgres locking/queue assumptions are superseded. Design atomic conditional claims/reservations and transactional batches using the actual D1 binding API, not Postgres-specific SQL. Keep authoritative approval/budget reads on a consistency path that cannot read stale replica state. Test concurrency and outbox-to-Workflow launch recovery. See [D1 API](https://developers.cloudflare.com/d1/worker-api/d1-database/).

A retried Workflow step is not exactly-once external execution. Use stable task/attempt/instance IDs; read durable state before effects and reconcile uncertain outcomes. Keep billable model requests out of blanket retry policies. For V1, mutation execution stays foreground and uses current online staff authorization; background Workflows scan/verify. Persist metadata/references in step results, not credentials or unbounded catalogs. See [Workflow rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/).

D1 is the product history; Workflow retention is not the audit retention policy. Use bounded catalog pages and event retention to stay within chosen storage/runtime limits. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) provides recovery, but confirm selected-plan recovery windows and rehearse export/restore with external effects disabled. Restoring D1 does not rewind Workflows, Shopify changes or provider charges; pause/reconcile runners before re-enabling them.

## Cost and data placement gate

Cloudflare is approved as the host, not an unlimited spending commitment. Before provisioning, record the account, selected plans, expected requests/CPU, D1 rows/storage, Workflow steps/state retention, log usage, staging overhead and a hard operating budget. Review current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/). Do not assume durable steps/storage are free or that billing alerts enforce hard caps. LLM charges are separate.

Decide data-placement requirements using Cloudflare's actual product controls; a location hint must not be advertised as a residency guarantee. Approve merchant/provider data destinations and retention before sending real data. No numeric price or specific account is selected by this plan.

## Environments and release boundary

Local: synthetic data/fake provider, Workers/D1/Workflows local emulation plus the independent SQLite/Node runner. Staging: separate bindings, secrets and development app/store after explicit permission. Pilot: separate database, workflows, secrets and allowlisted merchants. Preview URLs must not accidentally bind production resources. Never put real credentials in fixtures or public CI logs.

A GitHub push stores source and runs tests. Uploading/deploying Workers, creating D1/Workflows, changing Shopify app config, installation, paid inference and release tagging are separate actions. None is performed in this decision update. Avoid automatic production deploys from main until a manually approved release process exists.

## Preconditions for a concrete deployment approval

- Candidate SHA, passing CI, reproducible Worker bundle and portable container, with their hashes.
- Proven Shopify library/session adapter in Workers; tested provider transports; strict binding types and compatibility settings.
- Account, domain, data placement, exact services/plans and approved infrastructure cap.
- Founder-created test-store identity, Shopify app owner/distribution and explicit installation/read permission; write permission is separate.
- Encryption key version/rotation plan, verified secret bindings and least-privilege deployment token. Values go into the secret store, not approval text or git.
- D1 migrations, tenant isolation and concurrent budget/claim tests; restore/export rehearsal; workflow dispatch recovery.
- Privacy/deletion policy, webhook verification/deduplication, uninstall cancellation and support/security contacts.
- Real model routes disabled unless per-provider profile, payload policy and spend ceiling are authorized.
- Health/readiness, structured logs/traces, alert destination, write-disable switch and job cancellation.

## Staging rollout procedure (future M7)

1. Build the reviewed SHA in CI and record Worker/container hashes and tests. Review proposed account resources and cost before provisioning.
2. After approval, create isolated staging D1 and Workflow bindings, application secrets and HTTPS route. Keep writes, scheduling and real model calls disabled.
3. Capture recovery/export state; apply backward-compatible D1 migrations once under a migration claim. Verify schema and binding versions before starting dispatch. Do not launch old/new incompatible workflow code against the same tasks.
4. Configure the separate Shopify development app with staging origin, allowed redirects, pinned API version and webhook endpoints. Validate config before deploying it; Shopify configuration and Worker deployment are distinct steps.
5. After store-access permission, install read-only on the named test store. Verify token exchange/refresh, store identity, bounded capability read, pagination coverage, reconnect and uninstall. Log no credential values.
6. Seed two isolated synthetic tenants. Attempt cross-tenant reads/approval/jobs/exports; force duplicate dispatch and process failure around persistence boundaries. Confirm safe recovery in both Cloudflare emulation and portable runner; smoke-test cloud behavior once provisioned.
7. After development-write permission, enable only trim operations. Approve a specific change and execute under current online staff permissions. Independently verify it. Exercise stale/revoked approval, API timeout and verification failure.
8. Restore/export/import into an isolated recovery environment with dispatch, provider calls and writes disabled. Reconcile preserved attempts/workflow state before resuming. Record evidence at the candidate SHA.

## Pilot promotion and rollback

Request promotion approval against staging evidence, bundle version/hash, services/cost, data placement and named cohort. Confirm Shopify distribution allows those stores: custom distribution is not a bypass for unrelated merchants. A working development-store deployment is not App Store approval.

Deploy the reviewed artifact with separate production bindings/secrets and read-only features first. Enable reviewed writes only for the agreed cohort. Configure quotas, connection diagnostics and alerts before schedules. Optional model calls remain independently gated per provider/profile. No external calls are needed to run the deterministic self-hosted demo.

On a bad code release, disable writes/dispatch, redeploy the previous compatible version and reconcile in-flight Workflow instances. Code rollback does not restore D1 or undo Shopify edits. Use expand/contract schema changes; forward-fix or restore only after assessing newer data. Compensating Shopify edits require individually reviewed proposals. Unknown provider requests remain reserved and unresolved; do not treat restore as free retry permission.

## Monitoring and release evidence

Watch task age, dispatch gaps, duplicate attempts, refresh failures, cross-tenant denials, verification failures, outcome_unknown, quotas and provider reserved/actual spend. Structured logs carry tenant/run/attempt/profile references without secrets or unnecessary product content. Public incident reports contain no merchant data.

At release, record commit, Worker/container hashes, compatibility date, binding names/environment, D1 migration version/recovery bookmark, CI links, approved cost, app/scopes, connection check, scan/approval/attempt/verification references, recovery drills, limitations and previous compatible version. Use a manual environment gate for production deployment.

Sources accessed 2026-10-27. Limits, pricing, location controls and tooling commands must be rechecked at implementation/provisioning time.
