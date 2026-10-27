# V1 authentication and security requirements

Status: design requirements, not a statement of implemented production controls. The current CLI is a trusted local mock and its actor names are not authentication.

## Connect and diagnose

Use Shopify's official React Router app template/library for embedded authentication. Verify the identity token server-side and derive store/staff identity from verified claims. Do not trust a store ID supplied by the browser. Request read_products first, and request write_products only when enabling the narrow editing workflow. [Authentication](https://shopify.dev/docs/apps/build/authentication-authorization).

A connection record shows environment, canonical store, granted scopes, last successful capability check and whether foreground/background access works. An installed integration, logged-in browser or saved token is not evidence of working access. A bounded authenticated read must succeed before the catalog capability is marked ready. Diagnose unauthorized, insufficient scope, revoked/uninstalled, throttled and temporarily unavailable separately.

For recovery, mark tasks blocked_auth, preserve their checkpoint and present a specific reconnect/permission action. After successful recovery, recheck the capability and freshness; resume without replaying completed mutations. Changing scope does not approve any proposal.

## Token and staff boundaries

Interactive operations use online access so Shopify enforces current staff permissions. Background scans use expiring offline tokens with encrypted storage and coordinated refresh. Read expiry from responses and test concurrent acquisition/refresh rather than hard-coding lifetime behavior. [Access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens).

Current documentation also describes client assertions for eligible public-app application-only access. This broadens older own-organization-only client-credentials guidance. Evaluate eligibility/library support if needed; V1's recommended baseline remains official embedded token exchange and expiring offline access. Do not build custom crypto/auth flows solely because a new grant exists.

An ID token proves identity, not staff permission to edit products. Check online-authorized API access and server policy for approval/execution. V1 keeps writes merchant-triggered under current online authorization; offline delayed writes are deferred until their staff-permission semantics are defined and tested. The worker's app-wide offline token must not silently bypass the approver's privileges.

Every approval binds tenant/store, verified staff ID, task revision, proposal digest, tool/version, before/after, evidence, creation and expiry. Any change invalidates approval. Only authenticated server-side code can create it. The LLM cannot create approvals or act as an authorized staff member.

## Data, tools and execution

Use explicit typed tool schemas and runtime validation. No model-produced arbitrary GraphQL or code execution. Query only bounded catalog fields; no customer/order scopes for V1. Test tenant isolation in APIs, repositories, jobs, approvals and exports. Foreign keys and unique constraints include tenant/store context where appropriate.

Record request, decision, attempt, applied outcome and verification separately. Mutation timeouts are uncertain outcomes, not safe retries. Leases and idempotency prevent duplicate work; independent read-back verifies postconditions. Approval/freshness checks must be unavoidable on every tool path, including manual and worker routes.

Keep Shopify/provider secrets encrypted server-side; redact them from logs/errors/traces. Per-tenant provider token/money reservations and execution caps are server-owned. Treat product text as untrusted data and bound model input/output. The local SHA-256 proposal identifier is an integrity comparison, not an authenticated signature.

Verify webhook signatures before processing; deduplicate, tolerate reordering and reconcile missing events. Disable jobs on uninstall/revocation. Implement mandatory public-app privacy webhooks and a documented deletion policy before distribution. [Webhooks](https://shopify.dev/docs/apps/build/webhooks), [privacy requirements](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).

## Required adversarial tests

Cross-store read/write/approval/job/export; forged/expired identity; read-only staff attempting approval; revoked permission between approval and execution; concurrent refresh; missing scope with later recovery; changed task revision; altered proposal; hidden bypass route; prompt injection; duplicate job/webhook; worker crash around a mutation; stale read-back; provider timeout/unknown charge; failed deletion; restore accidentally restarting external effects.

These tests gate V1. A mock-only pass is not evidence that Shopify OAuth, actual permissions or production tenant isolation works.
