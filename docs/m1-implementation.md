# M1 implementation plan

2026-10-27. Scope: verified/resumable **offline** catalog tasks, followed by a local Workers compatibility probe. No store connection, deployment or model calls.

Extend each audit run with a task ID/revision, explicit lifecycle state and persisted execution attempts. Bind proposals/decisions to their revision. Keep the existing apply API but enforce cancellation, revision and authorization guards on that path; do not add a parallel unsafe execution route. Separate applying from independent read-back verification. Completed means all proposals were explicitly resolved and every executed correction verified; findings requiring merchant input remain visible and are not silently resolved.

Checkpoint execution intent before mutation and the applied outcome after mutation. Resume reconciles existing attempts before executing unattempted approved work. If an uncertain attempt reads the expected value, verify the postcondition without claiming proof of who wrote it; if it reads another value, block automatic replay and require a fresh audit/approval. Cancellation/supersession stop new writes, including mid-batch. A revision command rescans into a new run while preserving history and invalidating old approvals.

CLI additions: status, verify, resume, cancel, revise and explicit mock-only failure controls for expired access, failed verification and interruption after a write checkpoint. Version the checkpoint schema and migrate old state conservatively: retain events/catalog, preserve applied history, require fresh approval for pending legacy proposals. Log migration.

Tests: status never claims completion before read-back; mismatches and read failures stay incomplete; resume across process boundaries does not duplicate writes; expired access blocks and reconnect resumes; cancellation between writes prevents the next effect; old revisions/decisions cannot execute; uncertain outcomes never blindly retry; legacy migration preserves applied effects. Preserve existing policy tests.

Unknowns/limits: local JSON checkpoints are not production tenancy or database transactions. Local lock recovery remains fail-closed after a hard crash. M1 validates controlled interruptions and reconciliation, not Shopify's external transaction semantics. The Workers probe must use synthetic requests and explicit outbound-network denial; library imports alone are not evidence of OAuth/live provider correctness. Record exact tested versions/results before moving to M2.
