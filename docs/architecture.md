# SAH local vertical slice

Technical plan — 2026-10-27. Read the original handoff in `sah-codex-handoff/`.

## Scope and decisions

Implement a bounded deterministic catalog audit in TypeScript, with no runtime dependencies, network calls, credentials, database or model provider. Use npm workspaces for core contracts, the catalog agent, a mock adapter and CLI. TypeScript and Node typings are development dependencies; Node's test runner verifies critical behavior. Apache-2.0 is selected; all packages remain private to prevent accidental npm publication.

The first useful outcome is an evidenced review queue: missing title/vendor/type/description, missing and duplicate SKUs, and safe title/vendor/type whitespace proposals. Never invent missing product facts, change SKU identities or publish products. These are data-quality heuristics, not verified revenue or ranking predictors. This is the deterministic foundation of an AI harness, not an LLM-powered demo.

## Modules and flow

- `packages/core`: product/tool contracts, strict input validation, proposal digests, execution limits, approval policy and event contract.
- `packages/catalog-agent`: bounded scan and deterministic rules. Treat all text as data.
- `packages/mock-shopify`: tenant-scoped local store and compare-before-write tool. No Shopify API implementation.
- `apps/cli`: local JSON checkpoint, approval commands, serialized execution and JSONL trace export.

Flow: initialize mock store → scan → save findings and proposals → review → approve/reject exact proposals → apply approved edits → record before/after and outcome. Approval never executes a change. Applying with no approval fails. Reapplying an applied proposal is a logged no-op. Drift invalidates a write and requires a new scan.

## Entities and boundaries

`Product`: id, title, vendor, productType, description, variants with id/SKU. `Finding`: rule, product, field path, observed evidence and explanation. `Proposal`: store/run/product/field, before/after, evidence and content digest. `Decision`: proposal digest, actor and approve/reject. `Run`: immutable proposal payloads plus decisions, outcomes and bounded product count. `Event`: sequence, timestamp, run, action, outcome/details.

Only title/vendor/productType trimming is allowed at the mutation boundary. Approval is matched to the full proposal digest and store/run. All selected edits are preflighted before any mutation, including caps and stale values. Mock mutation, status and trace commit together in one atomic JSON checkpoint; JSONL is a derived export. A fail-closed exclusive local lock prevents concurrent CLI commands. Local users can edit files and impersonate approval actors: this is a trusted single-user demonstration, not authenticated SaaS authorization or tamper-proof auditing.

## Limits and threats

Maximum 100 products per run, 100 variants per product, 16 KiB per text field, 10 writes per apply, zero model tokens. Reject invalid/oversized input and wrong tenant before processing. No generic GraphQL, eval, shell tool, arbitrary field mutation or network access. Audit every tool attempt, decision, denied application, stale failure and no-op. Local trace contains mock product data and is ignored by git. Budget values are server-owned constants, not model-controlled.

Token budget support is a reservation ledger only; no tokenizer or provider exists. A future provider must reserve input plus maximum output before calling, reconcile measured usage and reserve money separately. Never claim token counts alone enforce currency caps.

## Future hosted boundary

Keep the same policy layer; replace file persistence with tenant-keyed storage, authenticated staff approvals and durable execution. The founder selected Cloudflare: target D1 plus Workflows behind storage/runner ports, with a portable SQLite/Node runner for self-hosting. This supersedes the earlier Postgres/continuous-worker suggestion. Validate Shopify library and D1 session storage in the Workers runtime before committing to the adapter implementation. Use the Shopify React Router template for auth; request read_products first. Introduce a narrow versioned Shopify adapter only after permission. Workers use expiring offline tokens, per-shop throttling and bounded retries. Writes require current approval, write scope and revalidation; Shopify does not provide a general cross-resource transaction, so reconcile uncertain outcomes before retries. SDK extraction should follow an actual second consumer.

## Unknowns before implementation

Merchant willingness to pay, useful category-specific rules, acceptable false-positive rate, actual Sidekick/competitor overlap and Shopify authentication integration are unvalidated. No implementation dependency is needed to resolve those questions. Local atomic files are sufficient for the mock but cannot validate production tenancy, provider cost, OAuth, webhook correctness or Shopify write races.

## Acceptance checks

Read-only scan preserves catalog; findings cite observed values; no unapproved/forged/stale/cross-tenant mutation; caps fail before writes; repeat apply does not duplicate changes; decisions and before/after survive CLI restarts; logs include denials; CLI runs offline after dependency installation. Tests must exercise these policy boundaries and a separate-process CLI flow.

## M1 lifecycle update

Implemented task/revision state, intent/outcome checkpoints and independent read-back verification. Applied is not completed. Resume reconciles attempts before executing unattempted approved work; uncertain effects without a matching postcondition block replay. Cancel/supersede guard the shared apply path. Revise rescans as the next task revision and invalidates old approvals. Missing-data findings remain unresolved even after all trim corrections verify. Local hard-crash lock recovery remains manual. See README and m1-implementation.md.
