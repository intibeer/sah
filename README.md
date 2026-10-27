# SAH

A local prototype of a commerce catalog auditing harness, starting with Shopify-shaped **mock data**. It finds issues, produces evidenced proposals, requires explicit approval and records actions. No Shopify connection, model API, paid usage, deployment or publishing is implemented.

The first agent is deterministic. It checks missing title/vendor/product type/description, missing SKUs and duplicate SKUs within the scanned subset. It proposes only leading/trailing whitespace removal for nonempty title/vendor/product type values. Missing facts and SKU identity require merchant investigation; the agent never invents replacements or publishes products. The included injection-like description is treated as plain data.

## Run locally

Requires Node **20.18+** and npm (Node 22 recommended). Run from this repository root:

```sh
npm ci
npm run check
npm run demo -- init
npm run demo -- scan
npm run demo -- review
```

The sample produces **8 findings and 3 proposals**, with zero model tokens. Copy one full proposal `id` from review, inspect its `before`, `after` and evidence, then run:

```sh
npm run demo -- approve --proposal REPLACE_WITH_PROPOSAL_ID --actor local-merchant
npm run demo -- apply
npm run demo -- apply
npm run demo -- trace
```

Approval saves a decision without changing products. The first apply writes the approved mock field; the second reports zero writes. Applying before approval exits with an error and records the denial. Unapproved/rejected proposals remain unchanged. `reject --proposal ID --actor NAME` records rejection; a pending decision can be changed until applied.

`npm run demo` rebuilds before each command. After `npm run build`, the faster equivalent is:

```sh
node dist/apps/cli/src/index.js help
node dist/apps/cli/src/index.js scan --limit 2
```

All commands accept `--dir PATH` for a separate local store; use the same directory throughout a flow. `init` refuses to overwrite existing state. Review/approve/reject/apply default to the latest run; use `--run RUN_ID` to address another. There is no approve-all shortcut. At most 100 products are scanned and at most 10 fields can be applied in one command; reject surplus proposals or narrow the scan. The fixture loader expects this repository layout, so keep `fixtures/` alongside `dist/`.

## Inspect and verify

- `.sah/state.json`: authoritative mock catalog, runs, exact-payload decisions, applied IDs and event history.
- `.sah/trace.jsonl`: readable JSONL export, regenerated on each successful state commit, including failed policy attempts.
- `npm test`: builds and runs policy tests plus a CLI end-to-end test using separate processes and a temporary directory.
- `npm run typecheck`: strict type checking.
- `npm run lint`: compiler checks for unused locals/parameters plus strict typing; no separate style linter.
- `npm run check`: all checks used by the included CI workflow. CI itself has not been run remotely.

Tests cover evidence/read-only scans, approval and rejection, exact-payload binding, tenant/run boundaries, freshness, preflight write caps, input bounds, zero token allowance, replay behavior and persisted traces. Runtime has no third-party dependencies. The lockfile pins development tooling; TypeScript 5.9.3 is a deliberate conservative compiler pin, not a claim to be latest.

## Structure and design

- `packages/core`: typed contracts, validation, budgets, decisions and application policy.
- `packages/catalog-agent`: deterministic catalog rules and proposal generation.
- `packages/mock-shopify`: isolated mock store with narrow compare-before-write operations.
- `apps/cli`: local command handling, checkpoints and trace export.
- `fixtures`: synthetic data only.

These private workspaces compile together and use relative source imports. They are module boundaries for this prototype, not independently packaged SDK releases.

Read [research](docs/research.md) for dated official sources, competitor observations and unresolved assumptions, [architecture](docs/architecture.md) for boundaries/threats, and [roadmap](docs/roadmap.md) for acceptance gates. The original [handoff](sah-codex-handoff/PROJECT_BRIEF.md) remains intact.

The proposed [V1 deployment plan](docs/v1-plan.md) takes this baseline through verified/resumable execution, durable storage, Shopify auth, a merchant UI and a self-hostable release with a small hosted pilot. See the draft [deployment runbook](docs/deployment.md), [security requirements](docs/security.md) and [product backlog](docs/backlog.md). These are plans, not implemented or deployed features.

## Prototype limits

This is a trusted, single-user local demo. `--actor` is an audit label, not authenticated identity; someone with file access can rewrite state or forge a decision. Proposal hashes detect changes against stored approvals, not a malicious local administrator. The mock adapter checks matching approvals; hosted code must obtain those decisions from authenticated server-owned storage.

A local exclusive lock serializes commands. Catalog, decisions and trace events commit together using a same-directory rename; JSONL is a derived export. This is process-level atomic checkpointing, not fsync-backed power-loss durability or a production transaction system. If a process crashes holding `command.lock`, verify it has stopped before manually removing that lock. Re-run `trace` to regenerate a missing/stale export from state. Invalid arguments, unreadable/corrupt state and lock failures occur before a writable run context and are reported on stderr; they cannot always be persisted to the run log.

Stale approved fields block the entire pending batch before writes. A rescan creates a new run requiring new approvals. Prior applied IDs are no-ops, not permission to overwrite later merchant edits. Real Shopify write races, partial failures and uncertain network outcomes remain unimplemented. Token-budget tests exercise reservation arithmetic only; actual token counting, money caps and model metering require a provider integration.

No hosted tenant authentication, OAuth, webhooks, billing, rollback, scheduling or production security claim. Demand and differentiation remain unvalidated, especially against Sidekick and catalog QA competitors.

## License status

License decision pending founder review. Packages are private and marked `UNLICENSED`; this prototype is **not yet licensed for open-source distribution**. Apache-2.0, AGPLv3 and open-core tradeoffs are recorded in research. No restrictive license has been chosen.
