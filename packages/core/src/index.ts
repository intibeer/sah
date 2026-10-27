import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ products: 100, variants: 100, text: 16_384, writes: 10 });
export type Field = 'title' | 'vendor' | 'productType';
export interface Product {
  id: string; title: string; vendor: string; productType: string; description: string;
  variants: { id: string; sku: string }[];
}
export interface Finding {
  rule: string; productId: string; path: string; observed: string; explanation: string;
}
export interface Proposal {
  id: string; storeId: string; runId: string; revision: number; productId: string; field: Field;
  before: string; after: string; evidence: Finding;
}
export interface Decision { digest: string; revision: number; actor: string; choice: 'approve' | 'reject' }
export type TaskStatus = 'awaiting_approval' | 'ready' | 'executing' | 'verifying' | 'completed' | 'partially_completed' | 'blocked_auth' | 'failed' | 'cancelled' | 'superseded';
export interface Verification { passed: boolean; observed: string | null; reason: string; }
export interface Attempt { id: string; proposalId: string; revision: number; status: 'intent' | 'applied' | 'outcome_unknown' | 'verified' | 'verification_failed'; verification: Verification | null; }
export type Checkpoint = (stage: 'intent' | 'applied' | 'verified') => void;
export type Verifier = (store: CatalogTool, proposal: Proposal) => Verification;
export class AuthorizationError extends Error {}
export interface Run {
  id: string; taskId: string; revision: number; status: TaskStatus; blocker: string | null; limit: number; attempts: Attempt[]; storeId: string; scanned: number; findings: Finding[]; proposals: Proposal[];
  decisions: Record<string, Decision>; applied: string[];
}
export type Log = (action: string, details: Record<string, unknown>) => void;
export interface CatalogTool {
  readonly storeId: string;
  list(storeId: string, limit: number): Product[];
  read(storeId: string, id: string): Product;
  update(storeId: string, proposal: Proposal, decision: Decision): void;
}
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function boundedInteger(value: number, max: number, name: string): void {
  ensure(Number.isSafeInteger(value) && value > 0 && value <= max, `Invalid ${name}: expected 1..${max}`);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length <= LIMITS.text;
}
export function validateCatalog(value: unknown): asserts value is Product[] {
  ensure(Array.isArray(value) && value.length <= LIMITS.products, 'Invalid catalog size');
  const ids = new Set<string>();
  const variants = new Set<string>();
  for (const item of value) {
    ensure(item !== null && typeof item === 'object', 'Invalid product');
    const p = item as Record<string, unknown>;
    ensure(text(p.id) && p.id.trim() && !ids.has(p.id), 'Invalid/duplicate product ID');
    ids.add(p.id);
    for (const field of ['title', 'vendor', 'productType', 'description']) ensure(text(p[field]), `Invalid ${field}`);
    ensure(Array.isArray(p.variants) && p.variants.length <= LIMITS.variants, 'Invalid variants');
    for (const variant of p.variants) {
      ensure(variant && text(variant.id) && variant.id.trim() && !variants.has(variant.id) && text(variant.sku), 'Invalid/duplicate variant');
      variants.add(variant.id);
    }
  }
}
export function digest(p: Omit<Proposal, 'id'> | Proposal): string {
  return createHash('sha256').update(JSON.stringify([
    p.storeId, p.runId, p.revision, p.productId, p.field, p.before, p.after,
    p.evidence.rule, p.evidence.productId, p.evidence.path, p.evidence.observed, p.evidence.explanation,
  ])).digest('hex');
}
export function validateProposal(p: Proposal): void {
  ensure(p && ['title', 'vendor', 'productType'].includes(p.field), 'Field is not allowlisted');
  ensure(text(p.before) && text(p.after) && p.after.length > 0 && p.before !== p.after && p.after === p.before.trim(), 'Only nonempty trimming is allowed');
  ensure(p.evidence && p.evidence.productId === p.productId && p.evidence.path === p.field && p.evidence.observed === p.before, 'Invalid proposal evidence');
  ensure(Number.isSafeInteger(p.revision) && p.revision > 0, 'Invalid proposal revision');
  ensure(p.id === digest(p), 'Proposal digest mismatch');
}
function active(run: Run): void {
  ensure(run.status !== 'cancelled' && run.status !== 'superseded', `Task is ${run.status}`);
}
function context(run: Run, p: Proposal, storeId: string): void {
  validateProposal(p);
  ensure(p.storeId === storeId && p.runId === run.id, 'Proposal context mismatch');
  ensure(p.revision === run.revision, 'Stale task revision');
}
function selected(run: Run): Proposal[] {
  return run.proposals.filter(p => run.decisions[p.id]?.choice === 'approve');
}
export function refreshStatus(run: Run): void {
  if (['cancelled', 'superseded', 'blocked_auth'].includes(run.status)) return;
  if (run.attempts.some(a => a.status === 'intent' || a.status === 'outcome_unknown')) run.status = 'failed';
  else if (run.attempts.some(a => a.status === 'verification_failed')) run.status = 'partially_completed';
  else if (run.attempts.some(a => a.status === 'applied')) run.status = 'verifying';
  else if (selected(run).some(p => !run.applied.includes(p.id))) run.status = 'ready';
  else if (run.proposals.some(p => !run.decisions[p.id])) run.status = run.attempts.length ? 'partially_completed' : 'awaiting_approval';
  else run.status = run.findings.some(f => f.rule !== 'outer-whitespace') ? 'partially_completed' : 'completed';
}
export function status(run: Run): { state: TaskStatus; revision: number; verified: number; applied: number; unresolvedFindings: number; nextAction: string } {
  refreshStatus(run);
  const unresolvedFindings = run.findings.filter(f => f.rule !== 'outer-whitespace').length;
  const nextAction = run.status === 'cancelled' ? 'No new writes; inspect history or reconcile existing attempts.'
    : run.status === 'superseded' ? 'Use the latest revision of this task.'
    : run.status === 'blocked_auth' ? 'Restore mock access, then resume.'
    : run.attempts.some(a => a.status === 'intent' || a.status === 'outcome_unknown') ? 'Resume to reconcile; unresolved outcomes require a new audit and approval.'
    : run.attempts.some(a => a.status === 'verification_failed' || a.status === 'applied') ? 'Verify applied changes; investigate any mismatch.'
    : selected(run).some(p => !run.applied.includes(p.id)) ? 'Apply approved proposals.'
    : run.proposals.some(p => !run.decisions[p.id]) ? 'Review and approve or reject pending proposals.'
    : unresolvedFindings ? 'Investigate findings requiring merchant input; no values were inferred.' : 'No pending work.';
  return { state: run.status, revision: run.revision, verified: run.attempts.filter(a => a.status === 'verified').length, applied: run.applied.length, unresolvedFindings, nextAction };
}
export function decide(run: Run, id: string, actor: string, choice: Decision['choice'], log: Log): void {
  active(run);
  const p = run.proposals.find(p => p.id === id);
  ensure(p, 'Unknown proposal');
  context(run, p, run.storeId);
  ensure(typeof actor === 'string' && actor.trim().length > 0 && actor.length <= 200, 'Actor is required (max 200 characters)');
  ensure(choice === 'approve' || choice === 'reject', 'Invalid decision');
  ensure(!run.attempts.some(a => a.proposalId === id), 'Cannot change an attempted decision; revise the task');
  run.decisions[id] = { digest: digest(p), revision: run.revision, actor, choice };
  refreshStatus(run);
  log(`proposal.${choice}`, { runId: run.id, revision: run.revision, proposalId: id, actor });
}
export function cancel(run: Run, log: Log): void {
  ensure(run.status !== 'superseded', 'Task is superseded');
  run.status = 'cancelled';
  log('task.cancelled', { runId: run.id, revision: run.revision });
}
export function supersede(run: Run, log: Log): void {
  run.status = 'superseded';
  log('task.superseded', { runId: run.id, revision: run.revision });
}
export function apply(run: Run, store: CatalogTool, storeId: string, log: Log, checkpoint: Checkpoint = () => {}): number {
  log('apply.requested', { runId: run.id, storeId });
  try {
    active(run);
    ensure(run.status !== 'blocked_auth', 'Task blocked by authorization; resume after reconnect');
    ensure(storeId === run.storeId && store.storeId === storeId, 'Tenant mismatch');
    const approved = selected(run);
    ensure(approved.length > 0, 'Explicit approval required');
    ensure(!run.attempts.some(a => a.status === 'intent' || a.status === 'outcome_unknown'), 'Reconcile unknown outcomes before new writes');
    const pending = approved.filter(p => !run.applied.includes(p.id));
    ensure(pending.length <= LIMITS.writes, 'Write budget exceeded');
    const fields = new Set<string>();
    for (const p of approved) {
      context(run, p, storeId);
      ensure(run.decisions[p.id]?.digest === digest(p), 'Approval digest mismatch');
      ensure(run.decisions[p.id]?.revision === run.revision, 'Stale approval revision');
      const key = JSON.stringify([p.productId, p.field]);
      ensure(!fields.has(key), 'Duplicate target in proposal batch');
      fields.add(key);
    }
    for (const p of pending) ensure(store.read(storeId, p.productId)[p.field] === p.before, 'Stale proposal: rescan required');
    for (const p of approved) {
      active(run); // Recheck between effects, including after a checkpoint/cancellation.
      if (run.applied.includes(p.id)) {
        log('change.skipped', { runId: run.id, proposalId: p.id, reason: 'already applied' });
        continue;
      }
      const decision = run.decisions[p.id];
      ensure(decision, 'Explicit approval required');
      const attempt: Attempt = { id: `${run.id}:${p.id}`, proposalId: p.id, revision: run.revision, status: 'intent', verification: null };
      run.attempts.push(attempt);
      run.status = 'executing';
      log('attempt.prepared', { runId: run.id, attemptId: attempt.id, proposalId: p.id });
      checkpoint('intent');
      active(run);
      context(run, p, storeId);
      ensure(run.decisions[p.id] === decision && decision.choice === 'approve' && decision.digest === digest(p) && decision.revision === run.revision, 'Approval changed during execution');
      try { store.update(storeId, p, decision); }
      catch (error) {
        attempt.status = 'outcome_unknown';
        throw error;
      }
      run.applied.push(p.id);
      attempt.status = 'applied';
      run.status = 'verifying';
      log('change.applied', { runId: run.id, attemptId: attempt.id, proposalId: p.id, productId: p.productId, field: p.field, before: p.before, after: p.after });
      checkpoint('applied');
    }
    refreshStatus(run);
    log('apply.completed', { runId: run.id, writes: pending.length, verificationPending: run.attempts.some(a => a.status !== 'verified') });
    return pending.length;
  } catch (error) {
    if (error instanceof AuthorizationError && !['cancelled', 'superseded'].includes(run.status)) run.status = 'blocked_auth';
    run.blocker = error instanceof Error ? error.message : 'Unknown error';
    refreshStatus(run);
    log('apply.denied', { runId: run.id, reason: run.blocker });
    throw error;
  }
}
export const readBack: Verifier = (store, p) => {
  const observed = store.read(p.storeId, p.productId)[p.field];
  return { passed: observed === p.after, observed, reason: observed === p.after ? 'Read-back matches proposed value; this does not establish who wrote it.' : 'Read-back mismatch; no automatic replay.' };
};
export function verify(run: Run, store: CatalogTool, storeId: string, log: Log, verifier: Verifier = readBack, checkpoint: Checkpoint = () => {}): number {
  ensure(storeId === run.storeId && store.storeId === storeId, 'Tenant mismatch');
  let count = 0;
  for (const attempt of run.attempts) {
    const p = run.proposals.find(p => p.id === attempt.proposalId);
    ensure(p, 'Attempt proposal missing');
    context(run, p, storeId);
    try {
      const result = verifier(store, p);
      ensure(typeof result.passed === 'boolean' && (result.observed === null || typeof result.observed === 'string'), 'Invalid verification result');
      ensure(!result.passed || result.observed === p.after, 'Verifier success must include matching observed evidence');
      attempt.verification = result;
      if (result.passed) {
        if (!run.applied.includes(p.id)) run.applied.push(p.id);
        attempt.status = 'verified'; count++;
      } else attempt.status = ['intent', 'outcome_unknown'].includes(attempt.status) ? 'outcome_unknown' : 'verification_failed';
      log(result.passed ? 'change.verified' : 'verification.failed', { runId: run.id, attemptId: attempt.id, proposalId: p.id, ...result });
    } catch (error) {
      attempt.verification = { passed: false, observed: null, reason: error instanceof Error ? error.message : 'Read-back failed' };
      if (!['intent', 'outcome_unknown'].includes(attempt.status)) attempt.status = 'verification_failed';
      if (error instanceof AuthorizationError && !['cancelled', 'superseded'].includes(run.status)) run.status = 'blocked_auth';
      log('verification.failed', { runId: run.id, attemptId: attempt.id, ...attempt.verification });
    }
    checkpoint('verified');
  }
  refreshStatus(run);
  return count;
}
export function resume(run: Run, store: CatalogTool, storeId: string, log: Log, checkpoint: Checkpoint = () => {}): void {
  active(run);
  ensure(run.storeId === storeId && store.storeId === storeId, 'Tenant mismatch');
  log('task.resumed', { runId: run.id, revision: run.revision });
  try { store.list(storeId, 1); }
  catch (error) {
    if (error instanceof AuthorizationError) run.status = 'blocked_auth';
    run.blocker = error instanceof Error ? error.message : 'Connection check failed';
    throw error;
  }
  run.blocker = null;
  run.status = 'ready';
  verify(run, store, storeId, log, readBack, checkpoint);
  ensure(!run.attempts.some(a => a.status === 'intent' || a.status === 'outcome_unknown' || a.status === 'verification_failed'), 'Unresolved attempt: investigate or revise; automatic replay blocked');
  if (selected(run).some(p => !run.applied.includes(p.id))) {
    apply(run, store, storeId, log, checkpoint);
    verify(run, store, storeId, log, readBack, checkpoint);
  }
  refreshStatus(run);
}

/** Future provider boundary: reserve worst-case tokens BEFORE calling a provider. */
export class TokenBudget {
  private reserved = 0;
  constructor(readonly max: number) { ensure(Number.isSafeInteger(max) && max >= 0, 'Invalid token cap'); }
  reserve(tokens: number): void {
    ensure(Number.isSafeInteger(tokens) && tokens >= 0 && this.reserved + tokens <= this.max, 'Token budget exceeded');
    this.reserved += tokens;
  }
  get used(): number { return this.reserved; }
}
