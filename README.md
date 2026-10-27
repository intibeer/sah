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
npm run demo -- status
npm run demo -- verify
npm run demo -- apply
npm run demo -- trace
```

Approval saves a decision without changing products. The first apply writes the approved mock field and leaves verification pending; verify independently reads it back. The second apply reports zero writes. Applying before approval exits with an error and records the denial. Unapproved/rejected proposals remain unchanged. `reject --proposal ID --actor NAME` records rejection; a pending decision can be changed until execution is attempted. The sample stays partially completed while proposals need decisions or missing-data/SKU findings need investigation; verified whitespace corrections do not resolve those warnings.

`status` shows lifecycle state and the next useful action. `resume` checks access, reconciles attempts, continues unattempted approved work and verifies it. Unknown outcomes without a matching postcondition block automatic replay: investigate or use `revise` to rescan and obtain new approvals. `cancel` stops new writes; read-only verification remains available. `revise` creates the next task revision and makes the old run/approvals unusable for writes while preserving history.

Mock-only recovery examples (approve a proposal before trying an interruption):

```sh
npm run demo -- simulate --failure interrupt
npm run demo -- apply
# Expected interruption after the first persisted write; recover:
npm run demo -- resume
npm run demo -- simulate --failure auth-expired
npm run demo -- resume
# Expected blocked_auth; restore synthetic access:
npm run demo -- simulate --failure none
npm run demo -- resume
```

`simulate --failure verification` makes explicit verification fail until cleared. `interrupt` is a one-shot controlled interruption, not a claim of automatic hard-crash recovery. No simulation contacts a service.

`npm run demo` rebuilds before each command. After `npm run build`, the faster equivalent is:

```sh
node dist/apps/cli/src/index.js help
node dist/apps/cli/src/index.js scan --limit 2
```

All commands accept `--dir PATH` for a separate local store; use the same directory throughout a flow. `init` refuses to overwrite existing state. Task commands default to the latest run; use `--run RUN_ID` to address another. There is no approve-all shortcut. At most 100 products are scanned and at most 10 fields can be applied in one command; reject surplus proposals or narrow the scan. The fixture loader expects this repository layout, so keep `fixtures/` alongside `dist/`.

Existing version-1 state migrates to version 2 on the next stateful command. Catalog/events and applied history are preserved; pending approvals are invalidated and proposal IDs change to bind the revision. Run review again and use its current IDs. Migration is logged as state.migrated.

## Inspect and verify

In a terminal, SAH uses a warm colour palette, a compact header, status badges and before/after diffs. Review is the “review desk”; status is “mission control”; history is the “paper trail.” There are no simulated thinking delays or cosmetic progress bars.

```sh
npm run demo -- review --pretty
npm run demo -- status --pretty
npm run demo -- history --pretty --limit 8
```

Run and proposal IDs accept unique prefixes of **at least 8 characters**; review shows a safe short proposal ID. Full IDs still work and an ambiguous prefix is rejected. Approvals remain bound to the exact full proposal and revision.

Human output is automatic on a TTY. Use `--pretty` to request it when output is captured, `--plain` for human text without ANSI, `--ascii` for simple decorations, or `--color auto|always|never`. `NO_COLOR` and `TERM=dumb` disable colour. Untrusted text is escaped to prevent terminal control-sequence injection; long lines wrap to the terminal width.

Piped commands retain the original machine output. `--json` explicitly requests structured output, overriding colour; do not combine it with human-view flags. Trace always remains JSONL. For a clean JSON stream, call the built entrypoint directly (npm itself prints script banners):

```sh
node dist/apps/cli/src/index.js review --json
node dist/apps/cli/src/index.js history --json --limit 8
```

- `.sah/state.json`: authoritative mock catalog, runs, exact-payload decisions, applied IDs and event history.
- `.sah/trace.jsonl`: readable JSONL export, regenerated on each successful state commit, including failed policy attempts.
- `npm test`: builds and runs policy tests plus a CLI end-to-end test using separate processes and a temporary directory.
- `npm run typecheck`: strict type checking.
- `npm run lint`: compiler checks for unused locals/parameters plus strict typing; no separate style linter.
- `npm run check`: all checks used by the included CI workflow. GitHub CI runs the local suite and the isolated Workers probe.

Tests cover evidence/read-only scans, approval/rejection, exact-payload/revision binding, tenant boundaries, freshness, caps, zero tokens, verification, interruption/reconnect recovery, cancellation between writes, no blind replay, migration and persisted traces. Main CLI runtime has no third-party dependencies. The lockfile pins development tooling; TypeScript 5.9.3 is a deliberate conservative compiler pin, not a claim to be latest.

An isolated [Workers probe](tools/workers-probe/README.md) has its own lockfile/development dependencies and requires Node 22+ (CI uses 24). It exercises the core, Shopify libraries/local D1 sessions and seven SDKs with synthetic responses and outbound API traffic denied. Read the [evidence and limits](docs/workers-compatibility.md); this is not a deployed integration or full provider conformance suite.

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

A local exclusive lock serializes commands. Intent is checkpointed before each effect and its outcome afterward; catalog, decisions and events share each atomic same-directory rename. JSONL is a derived export. This is process-level atomic checkpointing, not fsync-backed power-loss durability or a production transaction system. If a process crashes holding `command.lock`, verify it has stopped before manually removing that lock. Then use resume to reconcile; unconfirmed outcomes block replay. Re-run trace to regenerate a stale export. Invalid arguments, unreadable/corrupt state and lock failures occur before a writable run context and are reported on stderr; they cannot always be persisted to the run log.

Stale approved fields block the entire pending batch before writes. A rescan creates a new run requiring new approvals. Prior applied IDs are no-ops, not permission to overwrite later merchant edits. Real Shopify write races, partial failures and uncertain network outcomes remain unimplemented. Token-budget tests exercise reservation arithmetic only; actual token counting, money caps and model metering require a provider integration.

No hosted tenant authentication, OAuth, webhooks, billing, rollback, scheduling or production security claim. Demand and differentiation remain unvalidated, especially against Sidekick and catalog QA competitors.

## License

SAH is licensed under [Apache-2.0](LICENSE), selected by the founder on 2026-10-27. Private package flags prevent accidental npm publication; they do not restrict this source license. Third-party dependencies retain their own licenses.

V1 decisions are recorded in [decisions](docs/decisions.md): self-hostable harness plus pilot, Cloudflare hosting, and multi-provider model support. These selections do not mean cloud services or provider adapters are implemented.
