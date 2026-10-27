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
  id: string; storeId: string; runId: string; productId: string; field: Field;
  before: string; after: string; evidence: Finding;
}
export interface Decision { digest: string; actor: string; choice: 'approve' | 'reject' }
export interface Run {
  id: string; storeId: string; scanned: number; findings: Finding[]; proposals: Proposal[];
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
    p.storeId, p.runId, p.productId, p.field, p.before, p.after,
    p.evidence.rule, p.evidence.productId, p.evidence.path, p.evidence.observed, p.evidence.explanation,
  ])).digest('hex');
}
export function validateProposal(p: Proposal): void {
  ensure(p && ['title', 'vendor', 'productType'].includes(p.field), 'Field is not allowlisted');
  ensure(text(p.before) && text(p.after) && p.after.length > 0 && p.before !== p.after && p.after === p.before.trim(), 'Only nonempty trimming is allowed');
  ensure(p.evidence && p.evidence.productId === p.productId && p.evidence.path === p.field && p.evidence.observed === p.before, 'Invalid proposal evidence');
  ensure(p.id === digest(p), 'Proposal digest mismatch');
}
export function decide(run: Run, id: string, actor: string, choice: Decision['choice'], log: Log): void {
  const p = run.proposals.find(p => p.id === id);
  ensure(p, 'Unknown proposal');
  validateProposal(p);
  ensure(p.storeId === run.storeId && p.runId === run.id, 'Proposal context mismatch');
  ensure(typeof actor === 'string' && actor.trim().length > 0 && actor.length <= 200, 'Actor is required (max 200 characters)');
  ensure(choice === 'approve' || choice === 'reject', 'Invalid decision');
  ensure(!run.applied.includes(id), 'Cannot change an applied decision');
  run.decisions[id] = { digest: digest(p), actor, choice };
  log(`proposal.${choice}`, { runId: run.id, proposalId: id, actor });
}
export function apply(run: Run, store: CatalogTool, storeId: string, log: Log): number {
  log('apply.requested', { runId: run.id, storeId });
  try {
    ensure(storeId === run.storeId && store.storeId === storeId, 'Tenant mismatch');
    const selected = run.proposals.filter(p => run.decisions[p.id]?.choice === 'approve');
    ensure(selected.length > 0, 'Explicit approval required');
    const pending = selected.filter(p => !run.applied.includes(p.id));
    ensure(pending.length <= LIMITS.writes, 'Write budget exceeded');
    const fields = new Set<string>();
    for (const p of selected) {
      validateProposal(p);
      ensure(p.storeId === storeId && p.runId === run.id, 'Proposal context mismatch');
      ensure(run.decisions[p.id]?.digest === digest(p), 'Approval digest mismatch');
      const key = JSON.stringify([p.productId, p.field]);
      ensure(!fields.has(key), 'Duplicate target in proposal batch');
      fields.add(key);
    }
    // Preflight all writes before touching the mock store.
    for (const p of pending) ensure(store.read(storeId, p.productId)[p.field] === p.before, 'Stale proposal: rescan required');
    for (const p of selected) {
      if (run.applied.includes(p.id)) {
        log('change.skipped', { runId: run.id, proposalId: p.id, reason: 'already applied' });
        continue;
      }
      const decision = run.decisions[p.id];
      ensure(decision, 'Explicit approval required');
      store.update(storeId, p, decision);
      run.applied.push(p.id);
      log('change.applied', { runId: run.id, proposalId: p.id, productId: p.productId, field: p.field, before: p.before, after: p.after });
    }
    log('apply.completed', { runId: run.id, writes: pending.length });
    return pending.length;
  } catch (error) {
    log('apply.denied', { runId: run.id, reason: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
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
