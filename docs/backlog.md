# Product backlog from merchant experience

Source: founder-pasted summary of a separate Shopify theme/store session, supplied 2026-10-27. The underlying chat, operational notes and canvas were not independently retrieved. Treat these as interview evidence from one user, not validated universal requirements. Personal paths, store identity and private customer data are intentionally omitted.

## P0 — foundations included in V1

- **Connection diagnostics:** distinguish browser login, installation, environment tool availability and successful API access. Done when a capability probe establishes which store/read/write/background operations work and a blocked task resumes after authorization.
- **Persistent tasks:** retain outcome, latest decisions, evidence, dependencies, blockers and next action. Done when restart restores the correct next step and a newer merchant decision invalidates conflicting pending proposals.
- **Outcome verification:** an accepted tool response is only applied. Done when failed/absent verification is visibly incomplete and every mutation route passes the same policy check.
- **Safe recovery:** reconcile interrupted side effects before retry. Done when repeated execution cannot duplicate an effect and ambiguous outcomes remain visible.
- **Exact approvals:** distinguish installation/scopes from permission for a specific edit. Done when editing a proposal or task revision requires fresh approval and another store's approval cannot be transplanted.

## P1 — one outcome, then the next pack

Complete catalog audit first: observed evidence, bounded coverage, reviewable corrections and verified execution. Measure precision and time saved against current merchant workflows.

Next candidate: read-only launch-readiness audit. Check required assets exist, navigation resolves and configured product availability/prices/shipping match the merchant's stated intent. Every check names its data source and coverage. Unsupported checks become precise manual steps. No theme, shipping or market mutations enter V1 by implication.

## P2 — validate before expanding

Fulfillment guidance; analytics diagnostics with actual purchase-event verification; workflow graph verification that checks all bypass paths; brand/content consistency; lifecycle email exclusions and duplicate-send prevention. Each requires its own scopes, tools, verifier, approval policy and failure reconciliation. Email sends and commerce configuration writes are separate side-effect domains, not generic tool access.

Store memory should eventually retain approved facts with source, freshness, scope and supersession history. Do not reuse personal stories or public product claims merely because they appeared in a conversation. V1 only needs task revisions and explicit catalog evidence, not a general memory/vector system.

## Regression scenarios to preserve

1. A promised downloadable artifact does not exist: refuse to mark delivery complete or present a working download claim.
2. An imported theme lacks styling or routes to missing pages: import success is applied, visual/navigation checks remain failed.
3. Analytics is installed without a verified purchase event: tracking stays unverified.
4. A workflow condition exists but a direct edge bypasses it: safety verification fails and activation remains blocked.
5. Merchant changes from international to domestic-only: conflicting queued work and approvals become stale.

Only scenarios matching the catalog pack are implemented in V1; the others guide reusable verifier/task contracts and later packs. See [V1 milestones](v1-plan.md) for delivery order and gates.
