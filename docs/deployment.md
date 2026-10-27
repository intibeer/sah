# V1 deployment runbook — draft

Status: planned, **not executable yet**. No infrastructure has been provisioned. The current repository runs only the local mock CLI. This document defines the route to deployment and must be updated with verified commands and image identifiers at M6.

## Proposed hosting

Default recommendation pending founder preference: Render, using one Node web service, one continuous worker and managed Postgres in one chosen region. Use a Postgres-backed job mechanism to avoid a second queue service initially. Ship a standard container and Compose configuration so self-hosting is not tied to Render.

Why: it supports the ordinary Node web/worker model without requiring a runtime rewrite. Render's [worker documentation](https://render.com/docs/background-workers) describes continuous queue consumers; its [Shopify guide](https://render.com/docs/deploy-shopify-app) warns that local files disappear on deploy and recommends Postgres. That guide still describes Remix: follow current [Shopify React Router guidance](https://shopify.dev/docs/apps/launch/deployment) for app code rather than copying the old template recommendation.

Do not assume production fits free tiers. Paid Postgres has [recovery options](https://render.com/docs/postgresql-backups); free compute does not have the same recovery capability. Obtain a dated quote from the selected plans and [current pricing](https://render.com/pricing), covering web, worker, database, storage, egress and staging. No dollar estimate is approved or infrastructure cost incurred by this plan. Reassess another provider if the founder prefers it.

## Environments and release boundary

Local: synthetic fixtures and fake provider; no external credentials required. Staging: separate database, secrets and Shopify development app/store after explicit permission. Pilot production: separate credentials, data and allowlisted merchants. A staging restore must not trigger live jobs or model calls. Never copy production tokens into local fixtures or CI logs.

A GitHub push only stores source and runs checks. Container/image publication, Shopify app configuration deployment, web hosting deployment, merchant installation, App Store submission and model usage are separate actions. No deployment pipeline is currently configured.

## Prerequisites before any deployment approval

- Candidate SHA, passing CI and a reproducible tested image; no unresolved critical approval/tenant/retry defects.
- Founder-selected provider, region, billing account, infrastructure cap and domain.
- Shopify app credentials owned by the operator, confirmed distribution route, approved development store and exact read/write scopes.
- Credential encryption key with rotation/versioning plan, database credentials and operator recovery access. Secrets entered through the platform secret store; never put values in git or approval text.
- Database schema/migrations, tenant isolation tests and verified backup restore. Set intended recovery objectives and confirm the selected plan meets them.
- Data retention/deletion settings, privacy/support/security contact and uninstall behavior.
- Real provider disabled unless provider, payload policy and spend ceiling have separate approval.
- Health/readiness endpoints and alert destination. Write-disable switch and job cancellation must be tested.

## Staging rollout procedure (future M7)

1. Build the reviewed SHA in CI; record the image digest and checks. Review the exact proposed infrastructure and cost before provisioning.
2. After approval, provision isolated Postgres and web/worker services. Set database access, secrets and HTTPS origin. Keep writes/model calls disabled and worker scheduling paused.
3. Take/confirm a backup before applying backward-compatible migrations. Apply migrations once under a lock; verify schema version before workers start. Prefer expand/contract changes.
4. Configure the separate Shopify development app with the staging HTTPS origin, allowed redirects, API version and verified webhook endpoints. Validate app config before deploying it. Host deployment and Shopify configuration deployment are both necessary.
5. After store-access permission, install read-only on the named development store. Verify token exchange/refresh, store identity, capability probe, scan coverage, reconnect and uninstall. Observe logs for accidental token exposure.
6. Seed two isolated test tenants. Attempt cross-tenant requests/jobs and confirm denial. Restart the web service and worker mid-job and verify recovery without duplicate effects.
7. After separate development-write permission, enable only the allowlisted trim tool. Approve one exact fixture-equivalent change, execute under current staff authorization and read it back. Exercise stale approval, permission revocation, timeout and verification failure paths.
8. Run backup restore into an isolated environment with external effects disabled. Confirm approvals/events/task revisions survive. Record the evidence at the candidate SHA.

## Pilot production promotion

Request deployment approval against the concrete staging evidence, image digest, cost, region, scope and named pilot cohort. Confirm the distribution permits those installs: custom distribution cannot be used for arbitrary unrelated merchants. A development-store staging deployment is not an App Store release.

Provision a separate production database/secrets; apply the same reviewed image. Start with read-only catalog scans. Enable reviewed writes for the agreed cohort only after explicit authorization and the first verification succeeds. Configure quotas, connection checks and monitoring before enabling scheduled jobs. Keep optional model inference disabled until its own gate is passed.

A future release workflow should require manual environment approval and promote an immutable artifact. Never use push-to-main as blanket permission for paid provisioning or store mutations. Planned environment variable names and startup/migration commands must be finalized and smoke-tested during implementation; they do not exist yet.

## Monitoring and incident response

Watch request errors, task age, stuck leases, token refresh failures, denied tenant access, stale/failed verification, outcome_unknown, write counts and reserved/actual provider spend. Logs carry tenant/run/attempt references but exclude credentials and unnecessary product/customer content.

On a write incident: disable new writes, pause mutation jobs, preserve attempts and reconcile uncertain outcomes by reading Shopify. Do not erase applied IDs or replay an entire batch. Revoke compromised credentials if required and document reconnect steps. Notify the operator via the configured incident channel; no automatic external messaging is implemented.

On a bad application release: stop scheduling, disable writes, redeploy the previous compatible image and verify health/task history. Database rollback is not an automatic down-migration; restore or forward-fix only after assessing newer data. Shopify edits need individually reviewed compensating proposals; database restore does not undo external effects.

## Release evidence record (complete at deployment)

Record release/commit/image, CI links, migration version, environment/region, approved infrastructure cost, installed app/scopes, connection probe result, scan run, approval actor/reference, application attempt, independent verification, restart/restore drills, known limitations and previous compatible image. Keep merchant data and secrets out of the public evidence file.

Source access date: 2026-10-27. Provider products/quotas/pricing must be rechecked before provisioning.
